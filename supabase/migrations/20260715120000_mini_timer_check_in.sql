-- Add a backward-compatible finish rule for mini missions.
-- Existing rows and older clients default to manual finish behavior.

alter table public.mini_missions
  add column if not exists completion_mode text;

update public.mini_missions
set completion_mode = 'manual'
where completion_mode is null;

alter table public.mini_missions
  alter column completion_mode set default 'manual';

alter table public.mini_missions
  alter column completion_mode set not null;

alter table public.mini_missions
  drop constraint if exists mini_missions_completion_mode_check;

alter table public.mini_missions
  add constraint mini_missions_completion_mode_check
  check (completion_mode in ('manual', 'timer_check_in'));

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
      reminder_enabled boolean, reminder_time_local text, reminder_locked boolean
    ) loop
      insert into public.habits (
        id, user_id, title, description, mode, start_date, end_date, completed_dates,
        streak, total_days, is_completed, status, streak_memories, challenge_group_id,
        challenge_creator_timezone, mission_timezone, mission_report, mission_report_at,
        reminder_enabled, reminder_time_local, reminder_locked
      ) values (
        v_habit.id, v_uid, v_habit.title, v_habit.description, v_habit.mode,
        v_habit.start_date, v_habit.end_date, coalesce(v_habit.completed_dates, '[]'::jsonb),
        v_habit.streak, v_habit.total_days, v_habit.is_completed, v_habit.status,
        coalesce(v_habit.streak_memories, '{}'::jsonb), v_habit.challenge_group_id,
        v_habit.challenge_creator_timezone, v_habit.mission_timezone,
        v_habit.mission_report, v_habit.mission_report_at,
        v_habit.reminder_enabled, v_habit.reminder_time_local, v_habit.reminder_locked
      ) on conflict (user_id, id) do update set
        title = excluded.title,
        description = excluded.description,
        mode = excluded.mode,
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
        updated_at = now();
    end loop;
  end if;

  if jsonb_array_length(p_dirty_minis) > 0 then
    for v_mini in select * from jsonb_to_recordset(p_dirty_minis) as x(
      id text, title text, objective text, estimated_minutes integer, extended_minutes integer,
      completion_mode text, status text, created_at timestamptz, scheduled_start_at timestamptz,
      started_at timestamptz, completed_at timestamptz, visibility text, completion_memory jsonb,
      community_feed_revoked boolean, live_squad_id uuid, live_squad_role text
    ) loop
      insert into public.mini_missions (
        id, user_id, title, objective, estimated_minutes, extended_minutes, completion_mode,
        status, created_at, scheduled_start_at, started_at, completed_at, visibility,
        completion_memory, community_feed_revoked, live_squad_id, live_squad_role
      ) values (
        v_mini.id, v_uid, v_mini.title, v_mini.objective,
        v_mini.estimated_minutes, v_mini.extended_minutes,
        case when v_mini.completion_mode = 'timer_check_in' then 'timer_check_in' else 'manual' end,
        v_mini.status, v_mini.created_at, v_mini.scheduled_start_at, v_mini.started_at,
        v_mini.completed_at, v_mini.visibility, v_mini.completion_memory,
        v_mini.community_feed_revoked, v_mini.live_squad_id, v_mini.live_squad_role
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
        live_squad_role = excluded.live_squad_role;
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

grant execute on function public.rpc_sync_dirty_state(jsonb, jsonb, integer, text) to authenticated;
