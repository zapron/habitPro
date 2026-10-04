-- Live Squad link-join: drop the creator-approval gate.
--
-- Real two-user production test (2026-10-04) surfaced that the approval
-- step added in 20260930190000_live_mini_link_join_and_kickout.sql is
-- more friction than value for mini missions specifically: missions run
-- in a short window, the creator is usually busy doing their own timer
-- at the same moment someone else taps the link, and — unlike group
-- challenges, which this was modeled on — there's no meaningful trust
-- decision being protected here. Explicit product call: a link is an
-- open invitation. Tapping it joins and starts a timer immediately,
-- same as the existing username-invite accept flow already does. The
-- creator's only moderation lever stays removal, after the fact
-- (rpc_remove_live_mini_participant_v1, unchanged).
--
-- 'link_requested' stays a valid status (no constraint change) so any
-- already-existing row from before this migration doesn't become
-- invalid — it just never gets created again going forward.
-- rpc_approve_live_mini_join_request_v1 / rpc_decline_live_mini_join_request_v1
-- are left in place, unused, rather than dropped, to keep this change
-- minimal and reversible.

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
  v_started timestamptz := now();
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

  if not exists (
    select 1
    from public.live_mini_participants
    where squad_id = p_squad_id
      and status not in ('completed', 'missed', 'cancelled', 'declined', 'expired')
  ) then
    raise exception 'Live Squad is already finished.';
  end if;

  -- Joins and starts in one step, same shape as rpc_accept_live_mini_invite —
  -- no more 'link_requested' pending state for new joins.
  insert into public.live_mini_participants (
    squad_id, user_id, role, status, local_mini_mission_id, planned_minutes,
    started_at, deadline_at
  )
  values (
    p_squad_id, uid, 'member', 'in_progress', trim(p_local_mini_mission_id), p_planned_minutes,
    v_started, public._live_mini_deadline(v_started, p_planned_minutes, 0)
  )
  on conflict (squad_id, user_id) do update
    set status = 'in_progress',
        local_mini_mission_id = excluded.local_mini_mission_id,
        planned_minutes = excluded.planned_minutes,
        started_at = excluded.started_at,
        deadline_at = excluded.deadline_at,
        completed_at = null,
        final_elapsed_seconds = null
    where public.live_mini_participants.status in ('declined', 'cancelled', 'missed', 'expired')
  returning id into v_participant_id;

  if v_participant_id is null then
    raise exception 'request_already_pending_or_active';
  end if;

  v_requester_username := public._live_mini_profile_username(uid);

  -- Informational only now — nothing for the creator to approve.
  perform public.rpc_insert_notification(
    v_squad.creator_id,
    'live_mini_link_joined',
    jsonb_build_object(
      'schema', 'habitpro.notification.v1',
      'kind', 'live_mini_link_joined',
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

-- RLS/snapshot-access gap: this check ignored status entirely, so a
-- removed ('cancelled') participant's row still satisfied "exists",
-- keeping both live_mini_squads/live_mini_participants' SELECT policies
-- and rpc_live_mini_snapshot_v1's access check open for them — a removed
-- person could keep watching the board and everyone's live progress.
-- 'completed'/'missed' stay valid (they finished legitimately and should
-- still see the final board); only the terminal-by-removal/decline
-- statuses are excluded, same set rpc_live_mini_public_preview_v1 already
-- uses for its participant count.
create or replace function public.user_is_live_mini_participant(
  p_squad_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.live_mini_participants p
    where p.squad_id = p_squad_id
      and p.user_id = p_user_id
      and p.status not in ('cancelled', 'declined', 'expired')
  );
$$;
