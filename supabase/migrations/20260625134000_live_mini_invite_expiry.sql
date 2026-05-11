-- Live Mini invites expire if the receiver never acts on them.
-- "missed" is reserved for people who accepted/started but did not finish in time.

alter table public.live_mini_participants
  add column if not exists invite_expires_at timestamptz;

alter table public.live_mini_participants
  drop constraint if exists live_mini_participants_status_check;

alter table public.live_mini_participants
  add constraint live_mini_participants_status_check
  check (status in ('invited', 'expired', 'declined', 'joined', 'in_progress', 'completed', 'missed', 'cancelled'));

update public.live_mini_participants
set invite_expires_at = created_at + interval '24 hours'
where status = 'invited'
  and invite_expires_at is null;

update public.live_mini_participants
set status = 'expired'
where status = 'invited'
  and invite_expires_at is not null
  and invite_expires_at <= now();

create index if not exists idx_live_mini_participants_pending_expiry
  on public.live_mini_participants (user_id, status, invite_expires_at desc, created_at desc)
  where role = 'member';

create index if not exists idx_live_mini_participants_squad_expiry
  on public.live_mini_participants (squad_id, status, invite_expires_at)
  where status = 'invited';

create or replace function public.rpc_refresh_live_mini_expired_invites(p_squad_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_count integer := 0;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  if p_squad_id is not null and not public.user_is_live_mini_participant(p_squad_id, uid) then
    raise exception 'not a participant';
  end if;

  update public.live_mini_participants
  set status = 'expired'
  where status = 'invited'
    and invite_expires_at is not null
    and invite_expires_at <= now()
    and (
      (p_squad_id is null and user_id = uid)
      or
      (p_squad_id is not null and squad_id = p_squad_id)
    );

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.rpc_refresh_live_mini_expired_invites(uuid) to authenticated;

create or replace function public.rpc_invite_live_mini_participant(
  p_squad_id uuid,
  p_invitee_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_squad public.live_mini_squads%rowtype;
  v_existing public.live_mini_participants%rowtype;
  v_participant_id uuid;
  v_inviter_username text;
  v_invite_expires_at timestamptz := now() + interval '24 hours';
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if not public.profile_is_premium(uid) then
    raise exception 'premium_required';
  end if;
  if p_invitee_id is null or p_invitee_id = uid then
    raise exception 'choose another user';
  end if;

  select * into v_squad
  from public.live_mini_squads
  where id = p_squad_id
    and creator_id = uid
    and status = 'active';
  if not found then
    raise exception 'live mini squad not found';
  end if;

  perform public.rpc_refresh_live_mini_missed(p_squad_id);
  perform public.rpc_refresh_live_mini_expired_invites(p_squad_id);

  if not exists (
    select 1
    from public.live_mini_participants
    where squad_id = p_squad_id
      and status not in ('completed', 'missed', 'cancelled', 'declined', 'expired')
  ) then
    raise exception 'Live Squad is already finished.';
  end if;

  select * into v_existing
  from public.live_mini_participants
  where squad_id = p_squad_id
    and user_id = p_invitee_id;
  if found then
    raise exception 'This person already has a live mini invite.';
  end if;

  insert into public.live_mini_participants (
    squad_id,
    user_id,
    role,
    status,
    invite_expires_at
  )
  values (p_squad_id, p_invitee_id, 'member', 'invited', v_invite_expires_at)
  returning id into v_participant_id;

  v_inviter_username := public._live_mini_profile_username(uid);

  perform public.rpc_insert_notification(
    p_invitee_id,
    'live_mini_invite',
    jsonb_build_object(
      'schema', 'habitpro.notification.v1',
      'kind', 'live_mini_invite',
      'live_mini_squad_id', p_squad_id,
      'squad_id', p_squad_id,
      'inviter_id', uid,
      'inviter_username', v_inviter_username,
      'mini_mission_title', v_squad.title,
      'mini_mission_objective', v_squad.objective,
      'invite_expires_at', v_invite_expires_at
    )
  );

  return v_participant_id;
end;
$$;

grant execute on function public.rpc_invite_live_mini_participant(uuid, uuid) to authenticated;

create or replace function public.rpc_accept_live_mini_invite(
  p_squad_id uuid,
  p_local_mini_mission_id text,
  p_planned_minutes integer,
  p_started_at timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_squad public.live_mini_squads%rowtype;
  v_invitee_username text;
  v_started timestamptz := coalesce(p_started_at, now());
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

  update public.live_mini_participants
  set status = 'expired'
  where squad_id = p_squad_id
    and user_id = uid
    and status = 'invited'
    and invite_expires_at is not null
    and invite_expires_at <= now();
  if found then
    raise exception 'Invite expired';
  end if;

  update public.live_mini_participants
  set
    status = 'in_progress',
    local_mini_mission_id = trim(p_local_mini_mission_id),
    planned_minutes = p_planned_minutes,
    reserve_minutes = 0,
    started_at = v_started,
    deadline_at = public._live_mini_deadline(v_started, p_planned_minutes, 0),
    completed_at = null,
    final_elapsed_seconds = null
  where squad_id = p_squad_id
    and user_id = uid
    and status = 'invited';
  if not found then
    raise exception 'invite not found or already resolved';
  end if;

  v_invitee_username := public._live_mini_profile_username(uid);

  perform public.rpc_insert_notification(
    v_squad.creator_id,
    'live_mini_accepted',
    jsonb_build_object(
      'schema', 'habitpro.notification.v1',
      'kind', 'live_mini_accepted',
      'live_mini_squad_id', p_squad_id,
      'squad_id', p_squad_id,
      'invitee_id', uid,
      'invitee_username', v_invitee_username,
      'mini_mission_title', v_squad.title
    )
  );
end;
$$;

grant execute on function public.rpc_accept_live_mini_invite(uuid, text, integer, timestamptz) to authenticated;

create or replace function public.rpc_decline_live_mini_invite(p_squad_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_squad public.live_mini_squads%rowtype;
  v_invitee_username text;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  select * into v_squad
  from public.live_mini_squads
  where id = p_squad_id;
  if not found then
    raise exception 'live mini squad not found';
  end if;

  perform public.rpc_refresh_live_mini_expired_invites(p_squad_id);

  update public.live_mini_participants
  set status = 'declined'
  where squad_id = p_squad_id
    and user_id = uid
    and status = 'invited';
  if not found then
    raise exception 'invite not found or already resolved';
  end if;

  v_invitee_username := public._live_mini_profile_username(uid);

  perform public.rpc_insert_notification(
    v_squad.creator_id,
    'live_mini_declined',
    jsonb_build_object(
      'schema', 'habitpro.notification.v1',
      'kind', 'live_mini_declined',
      'live_mini_squad_id', p_squad_id,
      'squad_id', p_squad_id,
      'invitee_id', uid,
      'invitee_username', v_invitee_username,
      'mini_mission_title', v_squad.title
    )
  );
end;
$$;

grant execute on function public.rpc_decline_live_mini_invite(uuid) to authenticated;
