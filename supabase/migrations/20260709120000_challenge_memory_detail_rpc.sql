-- Direct squad memory detail for challenge_squad_checkin notifications.
-- The RPC is the privacy boundary: private/solo memories never return note or image data.

create or replace function public.rpc_challenge_memory_detail_v1(
  p_challenge_id uuid,
  p_actor_user_id uuid,
  p_date_str text,
  p_habit_id text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_member_habit_id text;
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

  v_target_habit_id := coalesce(nullif(trim(coalesce(p_habit_id, '')), ''), v_member_habit_id);

  if v_target_habit_id is not null then
    select h.*
      into v_habit
    from public.habits h
    where h.user_id = p_actor_user_id
      and h.id = v_target_habit_id
      and h.challenge_group_id = p_challenge_id
    limit 1;
    v_habit_found := found;
  end if;

  -- Old notifications do not carry habit_id. If a future payload has a stale id,
  -- fall back to the current member link rather than exposing anything unexpected.
  if not v_habit_found and v_member_habit_id is not null and v_member_habit_id is distinct from v_target_habit_id then
    select h.*
      into v_habit
    from public.habits h
    where h.user_id = p_actor_user_id
      and h.id = v_member_habit_id
      and h.challenge_group_id = p_challenge_id
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
    'createdAt', case when v_status in ('text', 'photo', 'check_in_only') then nullif(v_memory ->> 'createdAt', '') else null end,
    'updatedAt', case when v_habit_found then v_habit.updated_at else null end,
    'communityWin', v_community_win,
    'canSendSquadNudge', v_subject_is_member and p_actor_user_id is not null and uid is distinct from p_actor_user_id,
    'customNoteSentToday', coalesce(v_custom_note_sent_today, false)
  );
end;
$$;

grant execute on function public.rpc_challenge_memory_detail_v1(uuid, uuid, text, text) to authenticated;

create or replace function public.tg_habits_notify_challenge_squad_checkin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_challenge uuid;
  v_old jsonb;
  nd text;
  r record;
  actor_uname text;
begin
  v_challenge := NEW.challenge_group_id;
  if v_challenge is null then
    return NEW;
  end if;

  if not exists (
    select 1 from public.challenge_members m
    where m.challenge_id = v_challenge and m.user_id = NEW.user_id
  ) then
    return NEW;
  end if;

  if TG_OP = 'INSERT' then
    v_old := '[]'::jsonb;
  elsif TG_OP = 'UPDATE' then
    v_old := coalesce(OLD.completed_dates, '[]'::jsonb);
    if OLD.completed_dates is not distinct from NEW.completed_dates then
      return NEW;
    end if;
  else
    return NEW;
  end if;

  select lower(trim(p.username::text))
  into actor_uname
  from public.profiles p
  where p.id = NEW.user_id;

  if actor_uname is not null and length(actor_uname) = 0 then
    actor_uname := null;
  end if;

  for nd in
    select new_only.val
    from (
      select jsonb_array_elements_text(coalesce(NEW.completed_dates, '[]'::jsonb)) as val
      except
      select jsonb_array_elements_text(coalesce(v_old, '[]'::jsonb))
    ) as new_only(val)
  loop
    for r in
      select m.user_id
      from public.challenge_members m
      where m.challenge_id = v_challenge
        and m.user_id is distinct from NEW.user_id
    loop
      insert into public.notifications (user_id, type, payload)
      values (
        r.user_id,
        'challenge_squad_checkin',
        jsonb_build_object(
          'schema', 'habitpro.notification.v1',
          'challenge_id', v_challenge,
          'actor_user_id', NEW.user_id,
          'actor_username', actor_uname,
          'habit_id', NEW.id,
          'habit_title', NEW.title,
          'date_str', nd
        )
      );
    end loop;
  end loop;

  return NEW;
end;
$$;
