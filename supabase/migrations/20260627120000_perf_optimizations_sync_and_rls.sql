-- Supabase Migration: Performance Optimizations (Syncing, RLS Policies, Indexes, and RPCs)
-- Description: Optimizes syncing roundtrips, eliminates full table scans, resolves RLS function overhead.
-- Timestamp: 20260627120000

-- 1. Create Lookup Indexes to Eliminate Full Table Scans
CREATE INDEX IF NOT EXISTS habits_id_user_id_idx ON public.habits (id, user_id);
CREATE INDEX IF NOT EXISTS community_win_cheers_user_id_idx ON public.community_win_cheers (user_id);

-- 2. Optimize RLS Policies on 'habits' to Eliminate PL/pgSQL Function Loop Overhead
DROP POLICY IF EXISTS habits_insert_own ON public.habits;
CREATE POLICY habits_insert_own ON public.habits
  FOR INSERT TO public
  WITH CHECK (
    (auth.uid() = user_id) AND (
      (coalesce(visibility, 'solo'::text) IS DISTINCT FROM 'public'::text) OR
      EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.is_premium = true
      )
    )
  );

DROP POLICY IF EXISTS habits_update_own ON public.habits;
CREATE POLICY habits_update_own ON public.habits
  FOR UPDATE TO public
  USING (auth.uid() = user_id)
  WITH CHECK (
    (auth.uid() = user_id) AND (
      (coalesce(visibility, 'solo'::text) IS DISTINCT FROM 'public'::text) OR
      EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.is_premium = true
      )
    )
  );

DROP POLICY IF EXISTS habits_select_own_or_cohort ON public.habits;
CREATE POLICY habits_select_own_or_cohort ON public.habits
  FOR SELECT TO public
  USING (
    (auth.uid() = user_id) OR
    (
      (challenge_group_id IS NOT NULL) AND
      EXISTS (
        SELECT 1 FROM public.challenge_members cm
        WHERE cm.challenge_id = habits.challenge_group_id AND cm.user_id = auth.uid()
      )
    ) OR
    EXISTS (
      SELECT 1 FROM public.challenge_members cm
      WHERE cm.habit_id = habits.id AND cm.user_id = habits.user_id AND
      EXISTS (
        SELECT 1 FROM public.challenge_members cm_self
        WHERE cm_self.challenge_id = cm.challenge_id AND cm_self.user_id = auth.uid()
      )
    )
  );

-- 3. Stored Procedure for Single-Roundtrip Incremental Syncing (Atomic Sync)
CREATE OR REPLACE FUNCTION rpc_sync_dirty_state(
  p_dirty_habits JSONB,
  p_dirty_minis JSONB,
  p_local_xp INTEGER,
  p_username TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_existing_xp INTEGER := 0;
  v_habit RECORD;
  v_mini RECORD;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- 1. Incremental Sync for Habits
  IF jsonb_array_length(p_dirty_habits) > 0 THEN
    FOR v_habit IN SELECT * FROM jsonb_to_recordset(p_dirty_habits) AS x(
      id TEXT, title TEXT, description TEXT, mode TEXT, visibility TEXT,
      start_date TIMESTAMPTZ, end_date TIMESTAMPTZ, completed_dates JSONB,
      streak INTEGER, total_days INTEGER, is_completed BOOLEAN, status TEXT,
      streak_memories JSONB, challenge_group_id UUID, challenge_creator_timezone TEXT,
      mission_timezone TEXT, mission_report TEXT, mission_report_at TIMESTAMPTZ,
      reminder_enabled BOOLEAN, reminder_time_local TEXT, reminder_locked BOOLEAN
    ) LOOP
      INSERT INTO public.habits (
        id, user_id, title, description, mode, start_date, end_date, completed_dates,
        streak, total_days, is_completed, status, streak_memories, challenge_group_id,
        challenge_creator_timezone, mission_timezone, mission_report, mission_report_at,
        reminder_enabled, reminder_time_local, reminder_locked
      ) VALUES (
        v_habit.id, v_uid, v_habit.title, v_habit.description, v_habit.mode, v_habit.start_date, v_habit.end_date, coalesce(v_habit.completed_dates, '[]'::jsonb),
        v_habit.streak, v_habit.total_days, v_habit.is_completed, v_habit.status, coalesce(v_habit.streak_memories, '{}'::jsonb), v_habit.challenge_group_id,
        v_habit.challenge_creator_timezone, v_habit.mission_timezone, v_habit.mission_report, v_habit.mission_report_at,
        v_habit.reminder_enabled, v_habit.reminder_time_local, v_habit.reminder_locked
      ) ON CONFLICT (user_id, id) DO UPDATE SET
        title = excluded.title, description = excluded.description, mode = excluded.mode,
        start_date = excluded.start_date, end_date = excluded.end_date, completed_dates = excluded.completed_dates,
        streak = excluded.streak, total_days = excluded.total_days, is_completed = excluded.is_completed,
        status = excluded.status, streak_memories = excluded.streak_memories, challenge_group_id = excluded.challenge_group_id,
        challenge_creator_timezone = excluded.challenge_creator_timezone, mission_timezone = excluded.mission_timezone,
        mission_report = excluded.mission_report, mission_report_at = excluded.mission_report_at,
        reminder_enabled = excluded.reminder_enabled, reminder_time_local = excluded.reminder_time_local,
        reminder_locked = excluded.reminder_locked, updated_at = now();
    END LOOP;
  END IF;

  -- 2. Incremental Sync for Mini Missions
  IF jsonb_array_length(p_dirty_minis) > 0 THEN
    FOR v_mini IN SELECT * FROM jsonb_to_recordset(p_dirty_minis) AS x(
      id TEXT, title TEXT, objective TEXT, estimated_minutes INTEGER, extended_minutes INTEGER,
      status TEXT, created_at TIMESTAMPTZ, scheduled_start_at TIMESTAMPTZ, started_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ, visibility TEXT, completion_memory JSONB, community_feed_revoked BOOLEAN,
      live_squad_id UUID, live_squad_role TEXT
    ) LOOP
      INSERT INTO public.mini_missions (
        id, user_id, title, objective, estimated_minutes, extended_minutes, status,
        created_at, scheduled_start_at, started_at, completed_at, visibility,
        completion_memory, community_feed_revoked, live_squad_id, live_squad_role
      ) VALUES (
        v_mini.id, v_uid, v_mini.title, v_mini.objective, v_mini.estimated_minutes, v_mini.extended_minutes, v_mini.status,
        v_mini.created_at, v_mini.scheduled_start_at, v_mini.started_at, v_mini.completed_at, v_mini.visibility,
        v_mini.completion_memory, v_mini.community_feed_revoked, v_mini.live_squad_id, v_mini.live_squad_role
      ) ON CONFLICT (user_id, id) DO UPDATE SET
        title = excluded.title, objective = excluded.objective, estimated_minutes = excluded.estimated_minutes,
        extended_minutes = excluded.extended_minutes, status = excluded.status,
        scheduled_start_at = excluded.scheduled_start_at, started_at = excluded.started_at,
        completed_at = excluded.completed_at, visibility = excluded.visibility,
        completion_memory = excluded.completion_memory, community_feed_revoked = excluded.community_feed_revoked,
        live_squad_id = excluded.live_squad_id, live_squad_role = excluded.live_squad_role;
    END LOOP;
  END IF;

  -- 3. Atomic Profile XP & Username update
  SELECT xp INTO v_existing_xp FROM public.profiles WHERE id = v_uid FOR UPDATE;
  UPDATE public.profiles
  SET xp = greatest(coalesce(v_existing_xp, 0), coalesce(p_local_xp, 0)),
      username = coalesce(nullif(lower(trim(p_username)), ''), username),
      updated_at = now()
  WHERE id = v_uid;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- 4. High-Performance Player Profile Enrichment RPC
CREATE OR REPLACE FUNCTION get_community_player_profile(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_profile RECORD;
  v_wins JSONB;
  v_public_wins INT;
  v_mini_wins INT;
  v_streak_wins INT;
  v_cheers_received INT;
  v_recent_wins_raw JSON;
BEGIN
  -- 1. Fetch Profile
  SELECT id, username, display_name, xp INTO v_profile FROM public.profiles WHERE id = p_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Player not found.');
  END IF;

  -- 2. Fetch Recent Wins (last 5)
  SELECT coalesce(json_agg(w), '[]'::json) INTO v_recent_wins_raw
  FROM (
    SELECT id, title, created_at, completed_at, feed_source, streak_mission_day, streak_count_at_post
    FROM public.community_wins
    WHERE user_id = p_user_id
    ORDER BY created_at DESC
    LIMIT 5
  ) w;

  -- 3. Fetch Win counts
  SELECT count(*) INTO v_public_wins FROM public.community_wins WHERE user_id = p_user_id;
  SELECT count(*) INTO v_mini_wins FROM public.community_wins WHERE user_id = p_user_id AND feed_source = 'mini';
  SELECT count(*) INTO v_streak_wins FROM public.community_wins WHERE user_id = p_user_id AND feed_source = 'habit_streak';

  -- 4. Fetch Cheers count
  SELECT count(*) INTO v_cheers_received
  FROM public.community_win_cheers c
  JOIN public.community_wins w ON c.win_id = w.id
  WHERE w.user_id = p_user_id;

  RETURN jsonb_build_object(
    'ok', true,
    'profile', jsonb_build_object(
      'userId', p_user_id,
      'username', v_profile.username,
      'displayName', v_profile.display_name,
      'xp', coalesce(v_profile.xp, 0),
      'publicWins', v_public_wins,
      'miniWins', v_mini_wins,
      'habitStreakWins', v_streak_wins,
      'cheersReceived', v_cheers_received,
      'recentWins', v_recent_wins_raw
    )
  );
END;
$$;
