-- Follow-up to docs/MINI_MISSION_CATALOG_ARCHITECTURE.md, raised after Phases 0-4
-- shipped and were confirmed working: when a Live Squad invite is accepted, the
-- joiner's own local mini mission was created fresh with no checklist at all
-- (app/live-mini/[id].tsx's handleAccept calls addMiniMission with no
-- taskChecklist) — a joiner never followed the creator's task list. This mirrors
-- the main-mission group-invite checklist-propagation fix
-- (src/lib/groupChallengesApi.ts createGroupChallengeFromHabit /
-- app/(tabs)/compete.tsx handleAcceptGroupInvite), just for Live Squad instead of
-- group missions.
--
-- The checklist has to live somewhere the joiner's client can read it before their
-- own local mission exists — live_mini_squads is that shared row. Additive only:
-- new nullable column, and both create-squad RPCs get a new optional param.

alter table public.live_mini_squads
  add column if not exists task_checklist jsonb;

comment on column public.live_mini_squads.task_checklist is
  'Snapshot of the creator mini mission''s task checklist at squad-creation time: [{id, label, order}]. Null/empty means a classic single-photo Live Squad, unchanged. Read by joiners on accept so their own local mini mission gets the same checklist.';

-- rpc_create_live_mini_squad gains an optional p_task_checklist param. The prior
-- 5-arg signature is dropped first (not just create-or-replace) so Postgres
-- doesn't end up with two overloads that could ambiguously resolve a
-- named-parameter call — same reasoning as the rpc_sync_live_mini_progress fix in
-- 20260724100000_mini_mission_task_checklist_and_gallery.sql.
drop function if exists public.rpc_create_live_mini_squad(
  text, text, text, integer, timestamptz
);

create or replace function public.rpc_create_live_mini_squad(
  p_mini_mission_id text,
  p_title text,
  p_objective text,
  p_planned_minutes integer,
  p_started_at timestamptz default null,
  p_task_checklist jsonb default null
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
    objective,
    task_checklist
  )
  values (
    uid,
    trim(p_mini_mission_id),
    v_title,
    nullif(trim(coalesce(p_objective, '')), ''),
    p_task_checklist
  )
  on conflict (creator_id, creator_mini_mission_id)
  do update set
    title = excluded.title,
    objective = excluded.objective,
    task_checklist = excluded.task_checklist,
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

grant execute on function public.rpc_create_live_mini_squad(text, text, text, integer, timestamptz, jsonb) to authenticated;

-- rpc_create_live_mini_squad_v2 wraps the above; same drop-then-create treatment
-- for the same overload-ambiguity reason.
drop function if exists public.rpc_create_live_mini_squad_v2(
  text, text, text, integer, timestamptz, boolean
);

create or replace function public.rpc_create_live_mini_squad_v2(
  p_mini_mission_id text,
  p_title text,
  p_objective text,
  p_planned_minutes integer,
  p_started_at timestamptz default null,
  p_return_snapshot boolean default true,
  p_task_checklist jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_squad_id uuid;
begin
  v_squad_id := public.rpc_create_live_mini_squad(
    p_mini_mission_id,
    p_title,
    p_objective,
    p_planned_minutes,
    p_started_at,
    p_task_checklist
  );

  return jsonb_build_object(
    'ok', true,
    'squadId', v_squad_id,
    'snapshot', case when coalesce(p_return_snapshot, true) then public._hp_live_mini_snapshot_json(v_squad_id) else null end
  );
end;
$$;

grant execute on function public.rpc_create_live_mini_squad_v2(text, text, text, integer, timestamptz, boolean, jsonb) to authenticated;
