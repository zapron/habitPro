-- Video Moments (experiment): a 5-second silent video "power-up" on a main mission.
--
-- Earned per 7-day block of the mission's own days (days 1-7, 8-14, ...): all
-- seven done, none streak-repaired, and at least 4 Community posts from that
-- block. One video per mission per earned block, usable from the block's own
-- day 7 (once days 1-6 are done) through the last day of the next block.
-- Premium only.
--
-- Launch rule: only missions created on or after the feature's start date can
-- earn a video. The server records when it first saw each mission
-- (habits.first_seen_at, set by trigger, never by the app); missions that
-- existed before this migration keep it null and are never eligible.
--
-- Backward compatible: older app versions never touch the new tables, bucket,
-- RPCs or columns. community_wins only gains two nullable columns, and the
-- habits trigger only fills a column those versions don't send.
--
-- Built to come out cleanly: flag off, empty the bucket, drop the tables,
-- the trigger and the columns.

-- ============================================================
-- 1) Feature flag, tester allowlist and start date
-- ============================================================
create table if not exists public.app_feature_flags (
  key text primary key,
  enabled boolean not null default false,
  -- First calendar date (mission time zone) a new mission can count from.
  -- Set it together with enabled: the day after launch. Null = nothing counts.
  starts_on date,
  updated_at timestamptz not null default now()
);

alter table public.app_feature_flags enable row level security;

create table if not exists public.app_feature_testers (
  key text not null references public.app_feature_flags (key) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  starts_on date not null default ((now() at time zone 'utc')::date + 1),
  created_at timestamptz not null default now(),
  primary key (key, user_id)
);

alter table public.app_feature_testers enable row level security;

insert into public.app_feature_flags (key, enabled, starts_on)
values ('video_moments', false, null)
on conflict (key) do nothing;

create or replace function public.feature_enabled_for(p_key text, p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.app_feature_testers t where t.key = p_key and t.user_id = p_uid)
    or coalesce((select f.enabled from public.app_feature_flags f where f.key = p_key), false);
$$;

-- A tester's own start date wins over the public one.
create or replace function public.feature_starts_on(p_key text, p_uid uuid)
returns date
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select t.starts_on from public.app_feature_testers t where t.key = p_key and t.user_id = p_uid),
    (select f.starts_on from public.app_feature_flags f where f.key = p_key and f.enabled)
  );
$$;

create or replace function public.rpc_my_feature_flags_v1()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_object_agg(
      f.key,
      jsonb_build_object(
        'enabled', public.feature_enabled_for(f.key, auth.uid()),
        'startsOn', public.feature_starts_on(f.key, auth.uid())
      )
    ),
    '{}'::jsonb
  )
  from public.app_feature_flags f;
$$;

revoke all on function public.rpc_my_feature_flags_v1() from public, anon;
grant execute on function public.rpc_my_feature_flags_v1() to authenticated;

-- ============================================================
-- 2) When the server first saw each mission
-- ============================================================
alter table public.habits add column if not exists first_seen_at timestamptz;

create or replace function public.tg_habits_first_seen_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.first_seen_at := now();
  else
    new.first_seen_at := old.first_seen_at;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_habits_first_seen_at on public.habits;
create trigger trg_habits_first_seen_at
  before insert or update on public.habits
  for each row execute function public.tg_habits_first_seen_at();

create or replace function public.safe_time_zone(p_tz text)
returns text
language sql
stable
set search_path = public
as $$
  select case
    when p_tz is not null and exists (select 1 from pg_catalog.pg_timezone_names n where n.name = p_tz) then p_tz
    else 'UTC'
  end;
$$;

-- Created (as seen by the server) and started on or after the start date.
create or replace function public.video_moment_habit_eligible(p_uid uuid, p_habit_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select h.first_seen_at is not null
      and s.starts_on is not null
      and (h.first_seen_at at time zone public.safe_time_zone(h.mission_timezone))::date >= s.starts_on
      and (h.start_date at time zone public.safe_time_zone(h.mission_timezone))::date >= s.starts_on
    from public.habits h
    cross join (select public.feature_starts_on('video_moments', p_uid) as starts_on) s
    where h.user_id = p_uid and h.id = p_habit_id
  ), false);
$$;

-- ============================================================
-- 3) One row per earned-and-used block
-- ============================================================
create table if not exists public.moment_videos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  habit_id text not null,
  block_number integer not null check (block_number >= 1),
  mission_day integer not null check (mission_day >= 1),
  date_key text not null,
  video_path text not null,
  poster_path text not null,
  duration_ms integer not null check (duration_ms between 1 and 5500),
  size_bytes bigint not null check (size_bytes between 1 and 2097152),
  created_at timestamptz not null default now(),
  unique (user_id, habit_id, block_number)
);

create index if not exists moment_videos_user_habit_idx
  on public.moment_videos (user_id, habit_id);

alter table public.moment_videos enable row level security;

-- Own rows only; everyone else sees videos through community_wins / public URLs.
-- Writes go through rpc_claim_video_moment_v1.
drop policy if exists "moment_videos_select_own" on public.moment_videos;
create policy "moment_videos_select_own"
  on public.moment_videos for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- ============================================================
-- 4) Storage: its own public bucket, 2 MB, strict paths
--    <uid>/<habit_id>/<block>.mp4 and <uid>/<habit_id>/<block>.jpg (poster)
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('moment-videos', 'moment-videos', true, 2097152, array['video/mp4', 'image/jpeg'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- A file may be written only for an eligible mission of the uploader's, for a
-- block that exists in that mission, and only until that block is claimed —
-- so nobody can host arbitrary files here or swap a clip after it's posted.
create or replace function public.video_moment_object_writable(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  p_uid uuid := auth.uid();
  v_habit text;
  v_block integer;
  v_total integer;
begin
  if p_uid is null or p_name !~ '^[0-9a-f-]{36}/[^/]{1,200}/[1-9][0-9]{0,2}\.(mp4|jpg)$' then
    return false;
  end if;
  if split_part(p_name, '/', 1) <> p_uid::text then
    return false;
  end if;
  if not public.feature_enabled_for('video_moments', p_uid) or not public.profile_is_premium(p_uid) then
    return false;
  end if;
  v_habit := split_part(p_name, '/', 2);
  v_block := split_part(split_part(p_name, '/', 3), '.', 1)::integer;
  if not public.video_moment_habit_eligible(p_uid, v_habit) then
    return false;
  end if;
  select h.total_days into v_total from public.habits h where h.user_id = p_uid and h.id = v_habit;
  if v_block < 1 or v_block > ceil(coalesce(v_total, 0) / 7.0) then
    return false;
  end if;
  return not exists (
    select 1 from public.moment_videos v
    where v.user_id = p_uid and v.habit_id = v_habit and v.block_number = v_block
  );
end;
$$;

drop policy if exists "moment_videos_insert_own_prefix" on storage.objects;
create policy "moment_videos_insert_own_prefix"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'moment-videos'
    and public.video_moment_object_writable(name)
  );

drop policy if exists "moment_videos_update_own_prefix" on storage.objects;
create policy "moment_videos_update_own_prefix"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'moment-videos' and split_part(name, '/', 1) = (select auth.uid())::text)
  with check (
    bucket_id = 'moment-videos'
    and public.video_moment_object_writable(name)
  );

drop policy if exists "moment_videos_delete_own_prefix" on storage.objects;
create policy "moment_videos_delete_own_prefix"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'moment-videos' and split_part(name, '/', 1) = (select auth.uid())::text);

drop policy if exists "moment_videos_select_public" on storage.objects;
create policy "moment_videos_select_public"
  on storage.objects for select
  to public
  using (bucket_id = 'moment-videos');

-- Supabase grants EXECUTE on new functions to anon and authenticated
-- directly, so revoking from public isn't enough. The helpers are only for
-- the definer functions and policies above; the storage policy runs as the
-- uploader, so it keeps authenticated.
revoke all on function public.feature_enabled_for(text, uuid) from public, anon, authenticated;
revoke all on function public.feature_starts_on(text, uuid) from public, anon, authenticated;
revoke all on function public.safe_time_zone(text) from public, anon, authenticated;
revoke all on function public.video_moment_habit_eligible(uuid, text) from public, anon, authenticated;
revoke all on function public.video_moment_object_writable(text) from public, anon;
grant execute on function public.video_moment_object_writable(text) to authenticated;
revoke all on function public.tg_habits_first_seen_at() from public, anon, authenticated;

-- ============================================================
-- 5) Community posts can carry a claimed video
-- ============================================================
alter table public.community_wins
  add column if not exists video_url text,
  add column if not exists video_poster_url text;

-- community_wins is written directly by the client, so a video URL is only
-- accepted when it points at one of the author's own claimed videos.
create or replace function public.tg_community_wins_guard_video()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.video_url is null then
    new.video_poster_url := null;
    return new;
  end if;
  if tg_op = 'UPDATE' and new.video_url is not distinct from old.video_url then
    return new;
  end if;
  if not exists (
    select 1
    from public.moment_videos v
    where v.user_id = new.user_id
      and right(new.video_url, length(v.video_path) + 1) = '/' || v.video_path
      and (
        new.video_poster_url is null
        or right(new.video_poster_url, length(v.poster_path) + 1) = '/' || v.poster_path
      )
  ) then
    raise exception 'video_not_claimed';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_community_wins_guard_video on public.community_wins;
create trigger trg_community_wins_guard_video
  before insert or update of video_url on public.community_wins
  for each row execute function public.tg_community_wins_guard_video();

-- ============================================================
-- 6) Claim: re-checks every rule on the server, then records the video.
--    The app works out which seven dates make up the block (mission-day
--    mapping lives client-side); the server checks they are seven consecutive
--    days, done, none repaired, and that 4+ of the block's Community posts
--    carry mission days inside that block, which ties the dates to the block.
--    On the block's own day 7 the day is still being checked in, so only
--    days 1-6 must already be done.
-- ============================================================
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

  if p_block_number is null or p_block_number < 1
     or coalesce(array_length(p_block_date_keys, 1), 0) <> 7 then
    raise exception 'invalid_block';
  end if;

  v_lo := (p_block_number - 1) * 7 + 1;
  v_hi := p_block_number * 7;
  -- Usable from the block's own day 7 through the end of the next block,
  -- and never past the mission's last day.
  if p_mission_day is null or p_mission_day < v_hi or p_mission_day > v_hi + 7
     or p_mission_day > coalesce(v_total, 0) then
    raise exception 'outside_window';
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
  if v_date <> v_first + 6 + (p_mission_day - v_hi) then
    raise exception 'invalid_day';
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
  if v_posts < 4 then
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
      user_id, habit_id, block_number, mission_day, date_key,
      video_path, poster_path, duration_ms, size_bytes
    )
    values (
      uid, p_habit_id, p_block_number, p_mission_day, p_date_key,
      p_video_path, p_poster_path, least(greatest(coalesce(p_duration_ms, 5000), 1), 5500), greatest(v_size, 1)
    )
    returning id into v_id;
  exception when unique_violation then
    raise exception 'already_claimed';
  end;

  return v_id;
end;
$$;

revoke all on function public.rpc_claim_video_moment_v1(text, integer, text[], integer, text, text, text, integer, bigint) from public, anon;
revoke all on function public.tg_community_wins_guard_video() from public, anon, authenticated;
grant execute on function public.rpc_claim_video_moment_v1(text, integer, text[], integer, text, text, text, integer, bigint) to authenticated;
