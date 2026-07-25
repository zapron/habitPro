-- Fix: rpc_challenge_memory_detail_v1 (the squad "view a member's day" screen,
-- app/challenge-memory.tsx) never learned about checklist missions.
--
-- Root cause: checklist-mission days never write the legacy top-level
-- streak_memories[date].note / .imageUrl fields (see handleTaskMemoryCommit in
-- app/habit/[id].tsx — it only ever writes streak_memories[date].tasks). This RPC
-- only ever read those two legacy fields, so a squad member opening a checklist
-- day's memory saw "Day marked complete" with no photo, even when the day had
-- several logged task photos. Same class of "new field, old reader never updated"
-- gap as the rpc_sync_dirty_state fix in
-- 20260723090000_sync_dirty_state_task_checklist.sql, just on the read side this
-- time instead of the write side.
--
-- Fix is additive: extracts streak_memories[date].tasks (when present) into a new
-- `tasks` array in the RPC's response — one entry per task that has a synced
-- (already-uploaded, https) photo, in the same order they were logged, each
-- {taskId, label, note, imageUrl, loggedAt}. Local-only (not yet uploaded) task
-- photos are left out, matching how local-only photos already behave for the
-- classic single-photo path (photoSyncState stays "none" for those, nothing to
-- sync yet). When the legacy top-level note/imageUrl are empty (true for every
-- checklist mission) but a task photo/note is available, the first available task
-- becomes the "cover" note/imageUrl so every existing reader of those two fields
-- (this screen's classic single-photo layout, notifications, etc.) still gets a
-- sane fallback. `tasks` is gated by the same visibility check as note/imageUrl —
-- it is null whenever the day would already be "private". Classic single-memory
-- missions are completely unaffected: they have no `tasks` in streak_memories, so
-- every new branch below is a no-op for them.

create or replace function public.rpc_challenge_memory_detail_v1(
  p_challenge_id uuid,
  p_actor_user_id uuid,
  p_date_str text,
  p_habit_id text default null::text
)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid();
  v_member_habit_id text;
  v_requested_habit_id text;
  v_target_habit_id text;
  v_subject_is_member boolean := false;
  v_habit record;
  v_habit_found boolean := false;
  v_label jsonb := '{}'::jsonb;
  v_memory jsonb := '{}'::jsonb;
  v_completed boolean := false;
  v_status text := 'not_found';
  v_note text := null;
  v_image_url text := null;
  v_image_uri text := null;
  v_photo_sync_state text := 'none';
  v_mission_day integer := null;
  v_tz text := 'UTC';
  v_community_win jsonb := null;
  v_custom_note_sent_today boolean := false;
  v_tasks jsonb := '[]'::jsonb;
  v_task_gallery jsonb := null;
  v_cover_task jsonb := null;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  if p_challenge_id is null or not public.user_is_challenge_member(p_challenge_id, uid) then
    raise exception 'not a member';
  end if;

  v_label := coalesce(public._hp_profile_label_json(p_actor_user_id), '{}'::jsonb);

  select cm.habit_id
    into v_member_habit_id
  from public.challenge_members cm
  where cm.challenge_id = p_challenge_id
    and cm.user_id = p_actor_user_id
  limit 1;
  v_subject_is_member := found;

  v_requested_habit_id := nullif(trim(coalesce(p_habit_id, '')), '');
  v_target_habit_id := coalesce(v_requested_habit_id, v_member_habit_id);

  -- Privacy boundary: only the habit currently linked to this actor in this
  -- challenge may be read. If a caller passes a stale id, fall back to the
  -- membership link instead of trusting habits.challenge_group_id metadata.
  if v_subject_is_member then
    if v_member_habit_id is not null and (v_target_habit_id is null or v_target_habit_id is distinct from v_member_habit_id) then
      v_target_habit_id := v_member_habit_id;
    end if;
  else
    v_target_habit_id := null;
  end if;

  if v_target_habit_id is not null then
    select h.*
      into v_habit
    from public.habits h
    where h.user_id = p_actor_user_id
      and h.id = v_target_habit_id
    limit 1;
    v_habit_found := found;
  end if;

  if v_habit_found then
    select exists (
      select 1
      from jsonb_array_elements_text(coalesce(v_habit.completed_dates, '[]'::jsonb)) as d(date_str)
      where d.date_str = p_date_str
    )
      into v_completed;

    if v_completed then
      v_memory := coalesce(v_habit.streak_memories -> p_date_str, '{}'::jsonb);
      v_note := nullif(trim(coalesce(v_memory ->> 'note', '')), '');
      v_image_url := nullif(trim(coalesce(v_memory ->> 'imageUrl', '')), '');
      v_image_uri := nullif(trim(coalesce(v_memory ->> 'imageUri', '')), '');

      v_tasks := coalesce(v_memory -> 'tasks', '[]'::jsonb);
      if jsonb_typeof(v_tasks) = 'array' and jsonb_array_length(v_tasks) > 0 then
        select jsonb_agg(
                 jsonb_build_object(
                   'taskId', t ->> 'taskId',
                   'label', t ->> 'label',
                   'note', nullif(trim(coalesce(t ->> 'note', '')), ''),
                   'imageUrl', t -> 'proofUrls' ->> 0,
                   'loggedAt', t ->> 'loggedAt'
                 )
                 order by ord
               )
          into v_task_gallery
        from jsonb_array_elements(v_tasks) with ordinality as arr(t, ord)
        where coalesce(t -> 'proofUrls' ->> 0, '') like 'http%';

        if v_task_gallery is not null and jsonb_array_length(v_task_gallery) > 0 then
          v_cover_task := v_task_gallery -> 0;
          v_image_url := coalesce(v_image_url, v_cover_task ->> 'imageUrl');
          v_note := coalesce(v_note, v_cover_task ->> 'note');
        elsif v_note is null then
          -- No synced task photos yet; fall back to the first task note (if any)
          -- so a checklist day with only text logged still shows something.
          select nullif(trim(coalesce(t ->> 'note', '')), '')
            into v_note
          from jsonb_array_elements(v_tasks) as t
          where nullif(trim(coalesce(t ->> 'note', '')), '') is not null
          limit 1;
        end if;
      end if;

      if p_date_str ~ '^\d{4}-\d{2}-\d{2}$' then
        begin
          v_tz := coalesce(
            nullif(trim(coalesce(v_habit.challenge_creator_timezone, '')), ''),
            nullif(trim(coalesce(v_habit.mission_timezone, '')), ''),
            'UTC'
          );
          v_mission_day := greatest(1, (p_date_str::date - ((v_habit.start_date at time zone v_tz)::date)) + 1);
        exception
          when others then
            v_mission_day := null;
        end;
      end if;

      if coalesce(v_habit.visibility, 'solo') is distinct from 'public' then
        v_status := 'private';
      elsif v_image_url is not null then
        v_status := 'photo';
        v_photo_sync_state := 'synced';
      elsif v_image_uri is not null then
        v_status := 'photo';
        v_photo_sync_state := 'local_only';
      elsif v_note is not null then
        v_status := 'text';
      else
        v_status := 'check_in_only';
      end if;

      if v_status = 'photo' then
        select jsonb_build_object(
          'id', cw.id,
          'cheerCount', coalesce(cw.cheer_count, 0),
          'viewerHasCheered', exists (
            select 1
            from public.community_win_cheers c
            where c.win_id = cw.id
              and c.user_id = uid
          )
        )
          into v_community_win
        from public.community_wins cw
        where cw.user_id = p_actor_user_id
          and cw.feed_source = 'habit_streak'
          and cw.mini_mission_id = ('habitwin:' || v_habit.id || ':' || p_date_str)
        order by cw.created_at desc
        limit 1;
      end if;
    end if;
  end if;

  if v_subject_is_member and p_actor_user_id is not null and uid is distinct from p_actor_user_id then
    select exists (
      select 1
      from public.challenge_nudges n
      where n.challenge_id = p_challenge_id
        and n.from_user_id = uid
        and n.to_user_id = p_actor_user_id
        and n.kind = 'custom_note'
        and ((n.created_at at time zone 'utc')::date) = ((now() at time zone 'utc')::date)
    )
      into v_custom_note_sent_today;
  end if;

  return jsonb_build_object(
    'viewerCanAccess', true,
    'challengeId', p_challenge_id,
    'subjectUserId', p_actor_user_id,
    'subjectUsername', nullif(v_label ->> 'username', ''),
    'subjectDisplayName', nullif(v_label ->> 'displayName', ''),
    'habitId', case when v_habit_found then v_habit.id else v_target_habit_id end,
    'habitTitle', case when v_habit_found then coalesce(v_habit.title, 'Group mission') else 'Group mission' end,
    'dateStr', p_date_str,
    'missionDay', v_mission_day,
    'status', v_status,
    'note', case when v_status in ('text', 'photo') then v_note else null end,
    'imageUrl', case when v_status = 'photo' and v_photo_sync_state = 'synced' then v_image_url else null end,
    'photoSyncState', v_photo_sync_state,
    'tasks', case when v_status <> 'private' then v_task_gallery else null end,
    'createdAt', case when v_status in ('text', 'photo', 'check_in_only') then nullif(v_memory ->> 'createdAt', '') else null end,
    'updatedAt', case when v_habit_found then v_habit.updated_at else null end,
    'communityWin', v_community_win,
    'canSendSquadNudge', v_subject_is_member and p_actor_user_id is not null and uid is distinct from p_actor_user_id,
    'customNoteSentToday', coalesce(v_custom_note_sent_today, false)
  );
end;
$function$;
