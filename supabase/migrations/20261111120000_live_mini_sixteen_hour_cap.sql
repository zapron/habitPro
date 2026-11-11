-- Mini Missions got 12h/16h fuel presets (app/mini/create.tsx, MAX_FUEL_MINUTES = 960),
-- but every live-squad path still capped planned minutes at 480 (8h): creating a live
-- squad / inviting from a 16h mission failed with "planned minutes must be 1-480".
-- Raise the cap to 960 in the participant check constraint and the three RPCs that
-- validate it. Function bodies are otherwise copied verbatim from their latest
-- definitions; only the 480 -> 960 bound changes.

alter table public.live_mini_participants
  drop constraint if exists live_mini_participants_planned_minutes_check;
alter table public.live_mini_participants
  add constraint live_mini_participants_planned_minutes_check
  check (planned_minutes is null or (planned_minutes between 1 and 960));

CREATE OR REPLACE FUNCTION public.rpc_create_live_mini_squad(p_mini_mission_id text, p_title text, p_objective text, p_planned_minutes integer, p_started_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_task_checklist jsonb DEFAULT NULL::jsonb, p_capture_mode text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  if p_planned_minutes is null or p_planned_minutes < 1 or p_planned_minutes > 960 then
    raise exception 'planned minutes must be 1-960';
  end if;

  insert into public.live_mini_squads (
    creator_id,
    creator_mini_mission_id,
    title,
    objective,
    task_checklist,
    capture_mode
  )
  values (
    uid,
    trim(p_mini_mission_id),
    v_title,
    nullif(trim(coalesce(p_objective, '')), ''),
    p_task_checklist,
    case when p_capture_mode = 'freeform' then 'freeform' else null end
  )
  on conflict (creator_id, creator_mini_mission_id)
  do update set
    title = excluded.title,
    objective = excluded.objective,
    task_checklist = excluded.task_checklist,
    capture_mode = excluded.capture_mode,
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
$function$

;

CREATE OR REPLACE FUNCTION public.rpc_accept_live_mini_invite(p_squad_id uuid, p_local_mini_mission_id text, p_planned_minutes integer, p_started_at timestamp with time zone DEFAULT now())
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  if p_planned_minutes is null or p_planned_minutes < 1 or p_planned_minutes > 960 then
    raise exception 'planned minutes must be 1-960';
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
$function$

;

CREATE OR REPLACE FUNCTION public.rpc_request_join_live_mini_squad_v1(p_squad_id uuid, p_local_mini_mission_id text, p_planned_minutes integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  if p_planned_minutes is null or p_planned_minutes < 1 or p_planned_minutes > 960 then
    raise exception 'planned minutes must be 1-960';
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
$function$

;

