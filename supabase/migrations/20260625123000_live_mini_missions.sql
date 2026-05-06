-- Live mini missions: async squad layer on top of private/local mini missions.

create table if not exists public.live_mini_squads (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references auth.users (id) on delete cascade,
  creator_mini_mission_id text not null,
  title text not null,
  objective text,
  status text not null default 'active' check (status in ('active', 'ended', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (creator_id, creator_mini_mission_id)
);

create index if not exists live_mini_squads_creator_idx
  on public.live_mini_squads (creator_id, created_at desc);

create table if not exists public.live_mini_participants (
  id uuid primary key default gen_random_uuid(),
  squad_id uuid not null references public.live_mini_squads (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('creator', 'member')),
  status text not null default 'invited'
    check (status in ('invited', 'declined', 'joined', 'in_progress', 'completed', 'missed', 'cancelled')),
  local_mini_mission_id text,
  planned_minutes integer check (planned_minutes is null or (planned_minutes between 1 and 480)),
  reserve_minutes integer not null default 0 check (reserve_minutes between 0 and 10),
  started_at timestamptz,
  deadline_at timestamptz,
  completed_at timestamptz,
  final_elapsed_seconds integer check (final_elapsed_seconds is null or final_elapsed_seconds >= 0),
  memory_note text,
  memory_image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (squad_id, user_id)
);

create index if not exists live_mini_participants_user_idx
  on public.live_mini_participants (user_id, status, created_at desc);

create index if not exists live_mini_participants_squad_status_idx
  on public.live_mini_participants (squad_id, status, updated_at desc);

alter table public.mini_missions
  add column if not exists live_squad_id uuid references public.live_mini_squads (id) on delete set null;

alter table public.mini_missions
  add column if not exists live_squad_role text
    check (live_squad_role is null or live_squad_role in ('creator', 'member'));

create index if not exists mini_missions_live_squad_idx
  on public.mini_missions (live_squad_id)
  where live_squad_id is not null;

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
    select 1
    from public.live_mini_participants p
    where p.squad_id = p_squad_id
      and p.user_id = p_user_id
  );
$$;

revoke all on function public.user_is_live_mini_participant(uuid, uuid) from public;
grant execute on function public.user_is_live_mini_participant(uuid, uuid) to authenticated;

create or replace function public._live_mini_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_live_mini_squads_updated_at on public.live_mini_squads;
create trigger trg_live_mini_squads_updated_at
  before update on public.live_mini_squads
  for each row
  execute function public._live_mini_touch_updated_at();

drop trigger if exists trg_live_mini_participants_updated_at on public.live_mini_participants;
create trigger trg_live_mini_participants_updated_at
  before update on public.live_mini_participants
  for each row
  execute function public._live_mini_touch_updated_at();

alter table public.live_mini_squads enable row level security;
alter table public.live_mini_participants enable row level security;

create policy "live_mini_squads_select_participant"
  on public.live_mini_squads for select
  using (
    creator_id = auth.uid()
    or public.user_is_live_mini_participant(id, auth.uid())
  );

create policy "live_mini_participants_select_squad"
  on public.live_mini_participants for select
  using (
    user_id = auth.uid()
    or public.user_is_live_mini_participant(squad_id, auth.uid())
  );

create or replace function public._live_mini_profile_username(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select nullif(lower(coalesce(p.username::text, '')), '')
  from public.profiles p
  where p.id = p_user_id;
$$;

revoke all on function public._live_mini_profile_username(uuid) from public;

create or replace function public._live_mini_deadline(
  p_started_at timestamptz,
  p_planned_minutes integer,
  p_reserve_minutes integer
)
returns timestamptz
language sql
immutable
set search_path = public
as $$
  select case
    when p_started_at is null or p_planned_minutes is null then null
    else p_started_at + make_interval(mins => p_planned_minutes + coalesce(p_reserve_minutes, 0))
  end;
$$;

revoke all on function public._live_mini_deadline(timestamptz, integer, integer) from public;

create or replace function public._live_mini_elapsed_seconds(
  p_started_at timestamptz,
  p_completed_at timestamptz
)
returns integer
language sql
immutable
set search_path = public
as $$
  select case
    when p_started_at is null or p_completed_at is null then null
    else greatest(0, floor(extract(epoch from (p_completed_at - p_started_at)))::integer)
  end;
$$;

revoke all on function public._live_mini_elapsed_seconds(timestamptz, timestamptz) from public;

create or replace function public.rpc_create_live_mini_squad(
  p_mini_mission_id text,
  p_title text,
  p_objective text,
  p_planned_minutes integer,
  p_started_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_squad_id uuid;
  v_title text := nullif(trim(coalesce(p_title, '')), '');
  v_status text := case when p_started_at is null then 'joined' else 'in_progress' end;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if not public.profile_is_premium(uid) then
    raise exception 'premium_required';
  end if;
  if nullif(trim(coalesce(p_mini_mission_id, '')), '') is null then
    raise exception 'mini mission id required';
  end if;
  if v_title is null then
    raise exception 'title required';
  end if;
  if p_planned_minutes is null or p_planned_minutes < 1 or p_planned_minutes > 480 then
    raise exception 'planned minutes must be 1-480';
  end if;

  insert into public.live_mini_squads (
    creator_id,
    creator_mini_mission_id,
    title,
    objective
  )
  values (
    uid,
    trim(p_mini_mission_id),
    v_title,
    nullif(trim(coalesce(p_objective, '')), '')
  )
  on conflict (creator_id, creator_mini_mission_id)
  do update set
    title = excluded.title,
    objective = excluded.objective,
    status = 'active'
  returning id into v_squad_id;

  insert into public.live_mini_participants (
    squad_id,
    user_id,
    role,
    status,
    local_mini_mission_id,
    planned_minutes,
    reserve_minutes,
    started_at,
    deadline_at
  )
  values (
    v_squad_id,
    uid,
    'creator',
    v_status,
    trim(p_mini_mission_id),
    p_planned_minutes,
    0,
    p_started_at,
    public._live_mini_deadline(p_started_at, p_planned_minutes, 0)
  )
  on conflict (squad_id, user_id)
  do update set
    role = 'creator',
    local_mini_mission_id = excluded.local_mini_mission_id,
    planned_minutes = excluded.planned_minutes,
    status = case
      when public.live_mini_participants.status in ('completed', 'cancelled', 'missed') then public.live_mini_participants.status
      else excluded.status
    end,
    started_at = coalesce(public.live_mini_participants.started_at, excluded.started_at),
    deadline_at = coalesce(public.live_mini_participants.deadline_at, excluded.deadline_at);

  return v_squad_id;
end;
$$;

grant execute on function public.rpc_create_live_mini_squad(text, text, text, integer, timestamptz) to authenticated;

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

  select * into v_existing
  from public.live_mini_participants
  where squad_id = p_squad_id
    and user_id = p_invitee_id;
  if found then
    raise exception 'This person already has a live mini invite.';
  end if;

  insert into public.live_mini_participants (squad_id, user_id, role, status)
  values (p_squad_id, p_invitee_id, 'member', 'invited')
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
      'mini_mission_objective', v_squad.objective
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

create or replace function public.rpc_sync_live_mini_progress(
  p_squad_id uuid,
  p_local_mini_mission_id text,
  p_status text,
  p_reserve_minutes integer default 0,
  p_started_at timestamptz default null,
  p_completed_at timestamptz default null,
  p_memory_note text default null,
  p_memory_image_url text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_participant public.live_mini_participants%rowtype;
  v_squad public.live_mini_squads%rowtype;
  v_status text := lower(trim(coalesce(p_status, '')));
  v_reserve integer := greatest(0, least(10, coalesce(p_reserve_minutes, 0)));
  v_started timestamptz;
  v_deadline timestamptz;
  v_completed timestamptz;
  v_final_status text;
  v_elapsed integer;
  v_username text;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if v_status not in ('joined', 'in_progress', 'completed', 'missed', 'cancelled') then
    raise exception 'invalid live mini status';
  end if;

  select * into v_participant
  from public.live_mini_participants
  where squad_id = p_squad_id
    and user_id = uid
  for update;
  if not found then
    raise exception 'live mini participant not found';
  end if;
  if v_participant.status in ('declined', 'completed', 'missed', 'cancelled') then
    return;
  end if;

  select * into v_squad
  from public.live_mini_squads
  where id = p_squad_id;
  if not found then
    raise exception 'live mini squad not found';
  end if;

  v_started := coalesce(p_started_at, v_participant.started_at);
  v_deadline := public._live_mini_deadline(v_started, v_participant.planned_minutes, v_reserve);
  v_completed := p_completed_at;
  v_final_status := v_status;
  v_elapsed := null;

  if v_status = 'completed' then
    if v_started is null or v_completed is null then
      raise exception 'started_at and completed_at are required for completion';
    end if;
    if v_deadline is not null and v_completed > v_deadline then
      v_final_status := 'missed';
      v_completed := null;
    else
      v_elapsed := public._live_mini_elapsed_seconds(v_started, v_completed);
    end if;
  elsif v_status = 'in_progress' and v_deadline is not null and now() > v_deadline then
    v_final_status := 'missed';
  elsif v_status = 'missed' then
    v_completed := null;
  elsif v_status = 'cancelled' then
    v_completed := null;
  end if;

  update public.live_mini_participants
  set
    status = v_final_status,
    local_mini_mission_id = coalesce(nullif(trim(coalesce(p_local_mini_mission_id, '')), ''), local_mini_mission_id),
    reserve_minutes = v_reserve,
    started_at = v_started,
    deadline_at = v_deadline,
    completed_at = v_completed,
    final_elapsed_seconds = v_elapsed,
    memory_note = case
      when v_final_status = 'completed' then nullif(trim(coalesce(p_memory_note, '')), '')
      else memory_note
    end,
    memory_image_url = case
      when v_final_status = 'completed' then nullif(trim(coalesce(p_memory_image_url, '')), '')
      else memory_image_url
    end
  where id = v_participant.id;

  if v_final_status = 'completed' and uid <> v_squad.creator_id then
    v_username := public._live_mini_profile_username(uid);
    perform public.rpc_insert_notification(
      v_squad.creator_id,
      'live_mini_completed',
      jsonb_build_object(
        'schema', 'habitpro.notification.v1',
        'kind', 'live_mini_completed',
        'live_mini_squad_id', p_squad_id,
        'squad_id', p_squad_id,
        'participant_id', uid,
        'participant_username', v_username,
        'mini_mission_title', v_squad.title,
        'elapsed_seconds', v_elapsed
      )
    );
  end if;
end;
$$;

grant execute on function public.rpc_sync_live_mini_progress(uuid, text, text, integer, timestamptz, timestamptz, text, text) to authenticated;

create or replace function public.rpc_refresh_live_mini_missed(p_squad_id uuid)
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
  if not public.user_is_live_mini_participant(p_squad_id, uid) then
    raise exception 'not a participant';
  end if;

  update public.live_mini_participants
  set status = 'missed',
      completed_at = null,
      final_elapsed_seconds = null
  where squad_id = p_squad_id
    and status = 'in_progress'
    and deadline_at is not null
    and deadline_at < now();

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.rpc_refresh_live_mini_missed(uuid) to authenticated;
