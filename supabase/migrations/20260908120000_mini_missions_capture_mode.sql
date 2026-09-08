-- Adds mini_missions.capture_mode (freeform-capture support) and fixes
-- rpc_sync_dirty_state to actually carry it through push. Missed this the
-- first time despite the codebase's own documented warning right above this
-- exact function (see 20260812120000_habit_joined_challenge_at.sql's header
-- comment): rpc_sync_dirty_state's p_dirty_minis branch parses the client
-- payload via jsonb_to_recordset(...) with an explicit column list — any
-- field not named there is silently dropped on push, and the next pull
-- (rpc_focus_delta_v1 uses to_jsonb(m), so it needs no change — this is
-- purely a push-path fix) overwrites the local value with nothing.
--
-- Habits handling below is copied verbatim from 20260812120000's version,
-- unchanged. Only the mini_missions branch gets capture_mode added, in all
-- three required spots: the recordset column list, the insert column/value
-- lists, and the on-conflict update set clause.

alter table public.mini_missions
  add column if not exists capture_mode text
  check (capture_mode in ('checklist', 'freeform'));

comment on column public.mini_missions.capture_mode is
  'Orthogonal to completion_mode. null = classic single note+photo flow. "checklist" is inferred client-side from a non-empty task_checklist, not stored here. "freeform" = no predefined tasks, self-declared moments captured during the run (see MiniMission.draftMemories, local-only, not synced).';

create or replace function public.rpc_sync_dirty_state(
  p_dirty_habits jsonb,
  p_dirty_minis jsonb,
  p_local_xp integer,
  p_username text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_existing_xp integer := 0;
  v_habit record;
  v_mini record;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if jsonb_array_length(p_dirty_habits) > 0 then
    for v_habit in select * from jsonb_to_recordset(p_dirty_habits) as x(
      id text, title text, description text, mode text, visibility text,
      start_date timestamptz, end_date timestamptz, completed_dates jsonb,
      streak integer, total_days integer, is_completed boolean, status text,
      streak_memories jsonb, challenge_group_id uuid, challenge_creator_timezone text,
      mission_timezone text, mission_report text, mission_report_at timestamptz,
      reminder_enabled boolean, reminder_time_local text, reminder_locked boolean,
      task_checklist jsonb, joined_challenge_at timestamptz
    ) loop
      insert into public.habits (
        id, user_id, title, description, mode, visibility, start_date, end_date, completed_dates,
        streak, total_days, is_completed, status, streak_memories, challenge_group_id,
        challenge_creator_timezone, mission_timezone, mission_report, mission_report_at,
        reminder_enabled, reminder_time_local, reminder_locked, task_checklist, joined_challenge_at
      ) values (
        v_habit.id, v_uid, v_habit.title, v_habit.description, v_habit.mode,
        case when v_habit.visibility = 'public' then 'public' else 'solo' end,
        v_habit.start_date, v_habit.end_date, coalesce(v_habit.completed_dates, '[]'::jsonb),
        v_habit.streak, v_habit.total_days, v_habit.is_completed, v_habit.status,
        coalesce(v_habit.streak_memories, '{}'::jsonb), v_habit.challenge_group_id,
        v_habit.challenge_creator_timezone, v_habit.mission_timezone,
        v_habit.mission_report, v_habit.mission_report_at,
        v_habit.reminder_enabled, v_habit.reminder_time_local, v_habit.reminder_locked,
        v_habit.task_checklist, v_habit.joined_challenge_at
      ) on conflict (user_id, id) do update set
        title = excluded.title,
        description = excluded.description,
        mode = excluded.mode,
        visibility = excluded.visibility,
        start_date = excluded.start_date,
        end_date = excluded.end_date,
        completed_dates = excluded.completed_dates,
        streak = excluded.streak,
        total_days = excluded.total_days,
        is_completed = excluded.is_completed,
        status = excluded.status,
        streak_memories = excluded.streak_memories,
        challenge_group_id = excluded.challenge_group_id,
        challenge_creator_timezone = excluded.challenge_creator_timezone,
        mission_timezone = excluded.mission_timezone,
        mission_report = excluded.mission_report,
        mission_report_at = excluded.mission_report_at,
        reminder_enabled = excluded.reminder_enabled,
        reminder_time_local = excluded.reminder_time_local,
        reminder_locked = excluded.reminder_locked,
        task_checklist = excluded.task_checklist,
        joined_challenge_at = coalesce(excluded.joined_challenge_at, public.habits.joined_challenge_at),
        updated_at = now();
    end loop;
  end if;

  if jsonb_array_length(p_dirty_minis) > 0 then
    for v_mini in select * from jsonb_to_recordset(p_dirty_minis) as x(
      id text, title text, objective text, estimated_minutes integer, extended_minutes integer,
      completion_mode text, status text, created_at timestamptz, scheduled_start_at timestamptz,
      started_at timestamptz, completed_at timestamptz, visibility text, completion_memory jsonb,
      community_feed_revoked boolean, live_squad_id uuid, live_squad_role text, task_checklist jsonb,
      capture_mode text
    ) loop
      insert into public.mini_missions (
        id, user_id, title, objective, estimated_minutes, extended_minutes, completion_mode,
        status, created_at, scheduled_start_at, started_at, completed_at, visibility,
        completion_memory, community_feed_revoked, live_squad_id, live_squad_role, task_checklist,
        capture_mode
      ) values (
        v_mini.id, v_uid, v_mini.title, v_mini.objective,
        v_mini.estimated_minutes, v_mini.extended_minutes,
        case when v_mini.completion_mode = 'timer_check_in' then 'timer_check_in' else 'manual' end,
        v_mini.status, v_mini.created_at, v_mini.scheduled_start_at, v_mini.started_at,
        v_mini.completed_at, v_mini.visibility, v_mini.completion_memory,
        v_mini.community_feed_revoked, v_mini.live_squad_id, v_mini.live_squad_role,
        v_mini.task_checklist, v_mini.capture_mode
      ) on conflict (user_id, id) do update set
        title = excluded.title,
        objective = excluded.objective,
        estimated_minutes = excluded.estimated_minutes,
        extended_minutes = excluded.extended_minutes,
        completion_mode = excluded.completion_mode,
        status = excluded.status,
        scheduled_start_at = excluded.scheduled_start_at,
        started_at = excluded.started_at,
        completed_at = excluded.completed_at,
        visibility = excluded.visibility,
        completion_memory = excluded.completion_memory,
        community_feed_revoked = excluded.community_feed_revoked,
        live_squad_id = excluded.live_squad_id,
        live_squad_role = excluded.live_squad_role,
        task_checklist = excluded.task_checklist,
        capture_mode = excluded.capture_mode;
    end loop;
  end if;

  select xp into v_existing_xp from public.profiles where id = v_uid for update;
  update public.profiles
  set xp = greatest(coalesce(v_existing_xp, 0), coalesce(p_local_xp, 0)),
      username = coalesce(nullif(lower(trim(p_username)), ''), username),
      updated_at = now()
  where id = v_uid;

  return jsonb_build_object('success', true);
end;
$$;
