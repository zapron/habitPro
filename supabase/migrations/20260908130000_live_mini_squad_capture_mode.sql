-- Freeform Mini Mission Phase 2: Live Squad capture-mode inheritance. Same gap
-- as 20260724130000_live_mini_squad_task_checklist.sql fixed for task_checklist,
-- now for capture_mode: a joiner accepting a freeform mission's Live Squad
-- invite got a fresh classic (non-freeform) local mini mission, because
-- live_mini_squads never snapshotted the creator's capture_mode and the
-- create-squad RPCs had no param for it.
--
-- Accept-side needs no RPC change: task_checklist inheritance already works by
-- the client reading squad.task_checklist straight off the snapshot JSON
-- (app/live-mini/[id].tsx handleAccept), and _hp_live_mini_snapshot_json
-- returns to_jsonb(v_squad) — the whole row — so capture_mode rides along
-- automatically once the column exists. Only the create path needs wiring.

alter table public.live_mini_squads
  add column if not exists capture_mode text
  check (capture_mode in ('checklist', 'freeform'));

comment on column public.live_mini_squads.capture_mode is
  'Snapshot of the creator mini mission''s capture_mode at squad-creation time. Null/"checklist" = unchanged existing behavior. "freeform" = joiners should also get a freeform (multi-moment) local mini mission on accept. Read by joiners on accept, same as task_checklist.';

-- Drop-then-create for both RPCs, same overload-ambiguity reasoning as the
-- task_checklist migration: a named-parameter call could otherwise resolve
-- ambiguously between two same-named functions differing only by a trailing
-- optional param.
drop function if exists public.rpc_create_live_mini_squad(
  text, text, text, integer, timestamptz, jsonb
);

create or replace function public.rpc_create_live_mini_squad(
  p_mini_mission_id text,
  p_title text,
  p_objective text,
  p_planned_minutes integer,
  p_started_at timestamptz default null,
  p_task_checklist jsonb default null,
  p_capture_mode text default null
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
$$;

grant execute on function public.rpc_create_live_mini_squad(text, text, text, integer, timestamptz, jsonb, text) to authenticated;

drop function if exists public.rpc_create_live_mini_squad_v2(
  text, text, text, integer, timestamptz, boolean, jsonb
);

create or replace function public.rpc_create_live_mini_squad_v2(
  p_mini_mission_id text,
  p_title text,
  p_objective text,
  p_planned_minutes integer,
  p_started_at timestamptz default null,
  p_return_snapshot boolean default true,
  p_task_checklist jsonb default null,
  p_capture_mode text default null
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
    p_task_checklist,
    p_capture_mode
  );

  return jsonb_build_object(
    'ok', true,
    'squadId', v_squad_id,
    'snapshot', case when coalesce(p_return_snapshot, true) then public._hp_live_mini_snapshot_json(v_squad_id) else null end
  );
end;
$$;

grant execute on function public.rpc_create_live_mini_squad_v2(text, text, text, integer, timestamptz, boolean, jsonb, text) to authenticated;
