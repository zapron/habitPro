-- Chapters run on a rolling week. Any 7 days in a row earn one: all done, no
-- streak repair, at least 3 of them posted to Community, and none already
-- used by an earlier Chapter. A repair or missed day restarts the count the
-- next day instead of writing off the rest of a fixed week (days 1-7, 8-14, ...).
-- Fixed weeks sent by 1.1.39/1.1.40 apps are 7 days in a row too, so they
-- still claim.

alter table public.moment_videos add column if not exists start_date date;

-- Existing rows were fixed weeks: today's date minus the days since the week's day 7, minus 6.
update public.moment_videos
set start_date = date_key::date - 6 - (mission_day - block_number * 7)
where start_date is null;

alter table public.moment_videos alter column start_date set not null;

-- The rolling week is named by its dates; p_block_number is now just the
-- Chapter's number (1, 2, ...) and still names the storage path.
create or replace function public.rpc_claim_video_moment_v1(
  p_habit_id text,
  p_block_number integer,
  p_block_date_keys text[],
  p_mission_day integer,
  p_date_key text,
  p_video_path text,
  p_poster_path text,
  p_duration_ms integer,
  p_size_bytes bigint
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_completed jsonb;
  v_total integer;
  v_tz text;
  v_mission_start date;
  v_starts_on date;
  v_today date;
  v_date date;
  v_first date;
  v_lo integer;
  v_hi integer;
  v_offset integer;
  v_posts integer;
  v_size bigint;
  v_id uuid;
  i integer;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if not public.feature_enabled_for('video_moments', uid) then
    raise exception 'feature_disabled';
  end if;
  if not public.profile_is_premium(uid) then
    raise exception 'premium_required';
  end if;

  select h.completed_dates, h.total_days, public.safe_time_zone(h.mission_timezone),
         (h.start_date at time zone public.safe_time_zone(h.mission_timezone))::date
    into v_completed, v_total, v_tz, v_mission_start
  from public.habits h
  where h.id = p_habit_id and h.user_id = uid;
  if not found then
    raise exception 'habit_not_found';
  end if;
  if not public.video_moment_habit_eligible(uid, p_habit_id) then
    raise exception 'mission_not_eligible';
  end if;

  -- At most one Chapter per 7 mission days.
  if p_block_number is null or p_block_number < 1
     or p_block_number > greatest(1, coalesce(v_total, 0) / 7)
     or coalesce(array_length(p_block_date_keys, 1), 0) <> 7
     or p_mission_day is null or p_mission_day < 7 or p_mission_day > coalesce(v_total, 0) then
    raise exception 'invalid_block';
  end if;

  -- Dates must parse; anything malformed is an invalid block, not a crash.
  begin
    v_first := p_block_date_keys[1]::date;
    v_date := p_date_key::date;
    for i in 1..7 loop
      perform p_block_date_keys[i]::date;
    end loop;
  exception when others then
    raise exception 'invalid_block';
  end;

  -- The block can't predate the mission or the feature's start date, and the
  -- video goes on today's moment (±1 day of slack for time zones), so an
  -- expired credit can't be claimed by naming an old day.
  v_starts_on := public.feature_starts_on('video_moments', uid);
  if v_first < v_mission_start or v_starts_on is null or v_first < v_starts_on then
    raise exception 'mission_not_eligible';
  end if;
  v_today := (now() at time zone v_tz)::date;
  if v_date < v_today - 1 or v_date > v_today + 1 then
    raise exception 'outside_window';
  end if;

  -- Usable from the week's own day 7 through 7 days after it.
  if v_date < v_first + 6 or v_date > v_first + 13 then
    raise exception 'outside_window';
  end if;
  -- The week's mission days, from today's. Day 1 is the mission's start date
  -- or the day after it (a mission created late in the day starts tomorrow).
  v_hi := p_mission_day - (v_date - (v_first + 6));
  v_lo := v_hi - 6;
  v_offset := (v_first - v_mission_start) - (v_lo - 1);
  if v_lo < 1 or v_offset not in (0, 1) then
    raise exception 'invalid_block';
  end if;

  -- Seven consecutive calendar days, done (day 7 excepted while it's today).
  for i in 1..7 loop
    if p_block_date_keys[i] is null or p_block_date_keys[i]::date <> v_first + (i - 1) then
      raise exception 'invalid_block';
    end if;
    if i = 7 and p_mission_day = v_hi then
      continue;
    end if;
    if not coalesce(v_completed, '[]'::jsonb) ? p_block_date_keys[i] then
      raise exception 'block_not_complete';
    end if;
  end loop;
  -- One Chapter per day: the week can't share a day with an earlier one.
  perform pg_advisory_xact_lock(hashtext('moment_videos:' || uid::text || ':' || p_habit_id));
  if exists (
    select 1 from public.moment_videos m
    where m.user_id = uid
      and m.habit_id = p_habit_id
      and m.start_date <= v_first + 6
      and m.start_date + 6 >= v_first
  ) then
    raise exception 'already_claimed';
  end if;

  if exists (
    select 1 from public.streak_repairs r
    where r.user_id = uid
      and r.habit_id = p_habit_id
      and r.status in ('applied', 'pending')
      and r.date_str = any (p_block_date_keys)
  ) then
    raise exception 'block_has_repair';
  end if;

  select count(*) into v_posts
  from public.community_wins w
  where w.user_id = uid
    and w.feed_source = 'habit_streak'
    and w.mini_mission_id in (
      select 'habitwin:' || p_habit_id || ':' || k from unnest(p_block_date_keys) as k
    )
    and w.streak_mission_day between v_lo and v_hi;
  if v_posts < 3 then
    raise exception 'not_enough_posts';
  end if;

  if p_video_path <> uid::text || '/' || p_habit_id || '/' || p_block_number || '.mp4'
     or p_poster_path <> uid::text || '/' || p_habit_id || '/' || p_block_number || '.jpg' then
    raise exception 'invalid_path';
  end if;
  -- Size from storage itself, not from the app.
  select (o.metadata ->> 'size')::bigint into v_size
  from storage.objects o
  where o.bucket_id = 'moment-videos' and o.name = p_video_path;
  if v_size is null then
    raise exception 'video_not_uploaded';
  end if;
  if v_size > 2097152 then
    raise exception 'video_too_large';
  end if;
  if not exists (
    select 1 from storage.objects o where o.bucket_id = 'moment-videos' and o.name = p_poster_path
  ) then
    raise exception 'video_not_uploaded';
  end if;

  begin
    insert into public.moment_videos (
      user_id, habit_id, block_number, start_date, mission_day, date_key,
      video_path, poster_path, duration_ms, size_bytes
    )
    values (
      uid, p_habit_id, p_block_number, v_first, p_mission_day, p_date_key,
      p_video_path, p_poster_path, least(greatest(coalesce(p_duration_ms, 7000), 1), 7500), greatest(v_size, 1)
    )
    returning id into v_id;
  exception when unique_violation then
    raise exception 'already_claimed';
  end;

  return v_id;
end;
$$;


revoke all on function public.rpc_claim_video_moment_v1(text, integer, text[], integer, text, text, text, integer, bigint) from public, anon;
grant execute on function public.rpc_claim_video_moment_v1(text, integer, text[], integer, text, text, text, integer, bigint) to authenticated;
