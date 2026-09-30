-- Live Squad: link-based join requests (creator-approved) + creator kick-out.
--
-- Direct username invites (rpc_invite_live_mini_participant) are unchanged —
-- the creator already chose that person, so accept/decline stays a
-- two-party decision. A link can go to anyone, so a new 'link_requested'
-- status gives the creator an explicit approve/decline gate before it
-- counts as joining, mirroring the accountability reasoning already
-- applied to group-challenge kick-out (docs/GROUP_CHALLENGE_GOVERNANCE.md).
--
-- No re-join blocklist table (unlike challenge_removed_members) — live
-- squads are session-scoped, not persistent; the creator simply choosing
-- not to approve/re-invite is enough.

-- Both live_mini_squads and live_mini_participants' SELECT RLS policies only
-- allow the creator or an existing participant to see anything at all — a
-- brand-new visitor who opens a shared link has neither row yet, so they'd
-- see nothing to decide whether to request joining. Group challenges hit the
-- exact same gap and solved it with a public-preview RPC
-- (rpc_challenge_public_preview_v1, 20260920120000_challenge_join_requests.sql)
-- that bypasses RLS via security definer and returns only what's safe to show
-- a stranger. Mirrored here.
create or replace function public.rpc_live_mini_public_preview_v1(p_squad_id uuid)
returns table (
  squad_id uuid,
  title text,
  objective text,
  status text,
  creator_username citext,
  creator_display_name text,
  participant_count integer,
  my_status text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

    return query
  select
    s.id,
    s.title,
    s.objective,
    s.status,
    p.username,
    p.display_name,
    (
      select count(*)::integer
      from public.live_mini_participants lp
      where lp.squad_id = s.id
        and lp.status not in ('declined', 'expired', 'cancelled')
    ),
    case
      when s.creator_id = uid then 'creator'
      else coalesce(
        (select lp.status from public.live_mini_participants lp
         where lp.squad_id = s.id and lp.user_id = uid),
        'none'
      )
    end
  from public.live_mini_squads s
  left join public.profiles p on p.id = s.creator_id
  where s.id = p_squad_id;
end;
$$;

revoke all on function public.rpc_live_mini_public_preview_v1(uuid) from public;
grant execute on function public.rpc_live_mini_public_preview_v1(uuid) to authenticated;

alter table public.live_mini_participants
  drop constraint if exists live_mini_participants_status_check;

alter table public.live_mini_participants
  add constraint live_mini_participants_status_check
  check (status in (
    'invited', 'link_requested', 'expired', 'declined',
    'joined', 'in_progress', 'completed', 'missed', 'cancelled'
  ));

-- A stranger asks to join via a shared link. Lands as 'link_requested' —
-- distinct from 'invited' (creator-initiated) so the UI and the approval
-- RPCs below can tell the two apart.
create or replace function public.rpc_request_join_live_mini_squad_v1(
  p_squad_id uuid,
  p_local_mini_mission_id text,
  p_planned_minutes integer
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_squad public.live_mini_squads%rowtype;
  v_participant_id uuid;
  v_requester_username text;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if nullif(trim(coalesce(p_local_mini_mission_id, '')), '') is null then
    raise exception 'local mini mission id required';
  end if;
  if p_planned_minutes is null or p_planned_minutes < 1 or p_planned_minutes > 480 then
    raise exception 'planned minutes must be 1-480';
  end if;

  select * into v_squad
  from public.live_mini_squads
  where id = p_squad_id
    and status = 'active';
  if not found then
    raise exception 'live mini squad not found';
  end if;
  if v_squad.creator_id = uid then
    raise exception 'cannot_request_own_squad';
  end if;

  -- Unlike rpc_invite_live_mini_participant, we can't pre-refresh stale
  -- invited/in_progress rows here — those refresh RPCs require the caller
  -- to already be a participant, which a brand-new requester never is yet.
  -- A not-yet-flipped stale row just makes this emptiness check slightly
  -- conservative (blocks a request a beat later than ideal), never wrong.
  if not exists (
    select 1
    from public.live_mini_participants
    where squad_id = p_squad_id
      and status not in ('completed', 'missed', 'cancelled', 'declined', 'expired')
  ) then
    raise exception 'Live Squad is already finished.';
  end if;

  insert into public.live_mini_participants (
    squad_id, user_id, role, status, local_mini_mission_id, planned_minutes
  )
  values (
    p_squad_id, uid, 'member', 'link_requested', trim(p_local_mini_mission_id), p_planned_minutes
  )
  on conflict (squad_id, user_id) do update
    set status = 'link_requested',
        local_mini_mission_id = excluded.local_mini_mission_id,
        planned_minutes = excluded.planned_minutes,
        started_at = null,
        deadline_at = null,
        completed_at = null,
        final_elapsed_seconds = null
    where public.live_mini_participants.status in ('declined', 'cancelled', 'missed', 'expired')
  returning id into v_participant_id;

  if v_participant_id is null then
    raise exception 'request_already_pending_or_active';
  end if;

  v_requester_username := public._live_mini_profile_username(uid);

  perform public.rpc_insert_notification(
    v_squad.creator_id,
    'live_mini_join_request',
    jsonb_build_object(
      'schema', 'habitpro.notification.v1',
      'kind', 'live_mini_join_request',
      'live_mini_squad_id', p_squad_id,
      'squad_id', p_squad_id,
      'requester_id', uid,
      'requester_username', v_requester_username,
      'mini_mission_title', v_squad.title
    )
  );

  return v_participant_id;
end;
$$;

grant execute on function public.rpc_request_join_live_mini_squad_v1(uuid, text, integer) to authenticated;

create or replace function public.rpc_approve_live_mini_join_request_v1(
  p_squad_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_squad public.live_mini_squads%rowtype;
  v_requester_username text;
  v_started timestamptz := now();
  v_row public.live_mini_participants%rowtype;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  select * into v_squad
  from public.live_mini_squads
  where id = p_squad_id
    and creator_id = uid
    and status = 'active';
  if not found then
    raise exception 'live mini squad not found';
  end if;

  update public.live_mini_participants
  set
    status = 'in_progress',
    started_at = v_started,
    deadline_at = public._live_mini_deadline(v_started, planned_minutes, 0),
    completed_at = null,
    final_elapsed_seconds = null
  where squad_id = p_squad_id
    and user_id = p_user_id
    and status = 'link_requested'
  returning * into v_row;
  if not found then
    raise exception 'join request not found or already resolved';
  end if;

  v_requester_username := public._live_mini_profile_username(p_user_id);

  perform public.rpc_insert_notification(
    p_user_id,
    'live_mini_join_approved',
    jsonb_build_object(
      'schema', 'habitpro.notification.v1',
      'kind', 'live_mini_join_approved',
      'live_mini_squad_id', p_squad_id,
      'squad_id', p_squad_id,
      'mini_mission_title', v_squad.title
    )
  );
end;
$$;

grant execute on function public.rpc_approve_live_mini_join_request_v1(uuid, uuid) to authenticated;

create or replace function public.rpc_decline_live_mini_join_request_v1(
  p_squad_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_squad public.live_mini_squads%rowtype;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  select * into v_squad
  from public.live_mini_squads
  where id = p_squad_id
    and creator_id = uid;
  if not found then
    raise exception 'live mini squad not found';
  end if;

  update public.live_mini_participants
  set status = 'declined'
  where squad_id = p_squad_id
    and user_id = p_user_id
    and status = 'link_requested';
  if not found then
    raise exception 'join request not found or already resolved';
  end if;

  perform public.rpc_insert_notification(
    p_user_id,
    'live_mini_join_declined',
    jsonb_build_object(
      'schema', 'habitpro.notification.v1',
      'kind', 'live_mini_join_declined',
      'live_mini_squad_id', p_squad_id,
      'squad_id', p_squad_id,
      'mini_mission_title', v_squad.title
    )
  );
end;
$$;

grant execute on function public.rpc_decline_live_mini_join_request_v1(uuid, uuid) to authenticated;

-- Creator-only removal. Reuses the existing 'cancelled' terminal status
-- rather than a hard delete or a new status value — rpc_sync_live_mini_progress
-- already treats 'cancelled' as terminal and no-ops any further sync from
-- that participant, so this is enough to fully cut them out going forward.
create or replace function public.rpc_remove_live_mini_participant_v1(
  p_squad_id uuid,
  p_target_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_squad public.live_mini_squads%rowtype;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if p_squad_id is null or p_target_user_id is null then
    raise exception 'invalid_request';
  end if;

  select * into v_squad
  from public.live_mini_squads
  where id = p_squad_id
    and creator_id = uid;
  if not found then
    raise exception 'live mini squad not found';
  end if;
  if p_target_user_id = uid then
    raise exception 'cannot_remove_creator';
  end if;

  update public.live_mini_participants
  set status = 'cancelled',
      completed_at = null,
      final_elapsed_seconds = null
  where squad_id = p_squad_id
    and user_id = p_target_user_id
    and status not in ('completed', 'missed', 'cancelled', 'declined', 'expired');
  if not found then
    raise exception 'participant not found or already resolved';
  end if;

  perform public.rpc_insert_notification(
    p_target_user_id,
    'live_mini_removed',
    jsonb_build_object(
      'schema', 'habitpro.notification.v1',
      'kind', 'live_mini_removed',
      'live_mini_squad_id', p_squad_id,
      'squad_id', p_squad_id,
      'mini_mission_title', v_squad.title
    )
  );
end;
$$;

grant execute on function public.rpc_remove_live_mini_participant_v1(uuid, uuid) to authenticated;
