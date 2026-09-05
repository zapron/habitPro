-- Adds avatar_url to the weekly leaderboard RPCs. weekly_user_stats is a
-- periodically-refreshed snapshot table with no avatar_url column of its
-- own (and no reason to add one there) — instead these join live against
-- profiles for just this one field, so the avatar shown is always current
-- regardless of how stale the rest of the week's snapshot is.
--
-- RETURNS TABLE signature is changing (new output column), which
-- `create or replace function` cannot do in place — drop then recreate.

drop function if exists public.get_weekly_leaderboard_v2(int, int);
drop function if exists public.get_weekly_leaderboard(int, int);
drop function if exists public.search_weekly_leaderboard_v1(text, int);

create function public.get_weekly_leaderboard_v2(p_limit int default 20, p_offset int default 0)
returns table (
  rank_position int,
  user_id uuid,
  username citext,
  display_name text,
  avatar_url text,
  xp int,
  level int,
  points int,
  habit_days int,
  mini_completions int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  perform public.refresh_weekly_user_stats_for_user(uid);

  return query
  with ranked as (
    select
      s.*,
      row_number() over (
        order by s.points desc, s.xp desc, lower(s.username::text) asc, s.user_id asc
      )::int as rn
    from public.weekly_user_stats s
    where s.username is not null
      and s.generated_at > now() - interval '8 days'
  )
  select
    r.rn,
    r.user_id,
    r.username,
    r.display_name,
    p.avatar_url,
    r.xp,
    (r.xp / 250)::int as level,
    r.points,
    r.habit_days,
    r.mini_completions
  from ranked r
  left join public.profiles p on p.id = r.user_id
  order by r.rn asc
  limit least(greatest(coalesce(p_limit, 20), 1), 50)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

grant execute on function public.get_weekly_leaderboard_v2(int, int) to authenticated;

create function public.get_weekly_leaderboard(p_limit int default 20, p_offset int default 0)
returns table (
  rank_position int,
  user_id uuid,
  username citext,
  display_name text,
  avatar_url text,
  xp int,
  level int,
  points int,
  habit_days int,
  mini_completions int
)
language sql
stable
security definer
set search_path = public
as $$
  with profile_base as (
    select
      p.id,
      p.username,
      p.display_name,
      p.avatar_url,
      coalesce(nullif(p.timezone, ''), 'UTC') as tz,
      greatest(coalesce(p.xp, 0), 0)::int as safe_xp
    from public.profiles p
    where p.username is not null
      and length(trim(p.username::text)) > 0
  ),
  week_bounds as (
    select
      pb.*,
      (
        ((now() at time zone pb.tz)::date)
        - (((extract(dow from (now() at time zone pb.tz)::date)::int + 6) % 7)::int)
      )::date as week_start
    from profile_base pb
  ),
  habit_scores as (
    select
      wb.id as user_id,
      (
        count(distinct (h.id, d.day_key))
        filter (where d.day_key is not null)
      )::int as habit_days
    from week_bounds wb
    left join public.habits h
      on h.user_id = wb.id
    left join lateral (
      select raw_date::date as day_key
      from jsonb_array_elements_text(coalesce(h.completed_dates, '[]'::jsonb)) as dates(raw_date)
      where raw_date ~ '^\d{4}-\d{2}-\d{2}$'
    ) d
      on d.day_key >= wb.week_start
      and d.day_key < wb.week_start + 7
    group by wb.id
  ),
  mini_scores as (
    select
      wb.id as user_id,
      count(m.id)::int as mini_completions
    from week_bounds wb
    left join public.mini_missions m
      on m.user_id = wb.id
      and m.status = 'completed'
      and m.completed_at is not null
      and (m.completed_at at time zone wb.tz)::date >= wb.week_start
      and (m.completed_at at time zone wb.tz)::date < wb.week_start + 7
    group by wb.id
  ),
  scored as (
    select
      wb.id,
      wb.username,
      wb.display_name,
      wb.avatar_url,
      wb.safe_xp,
      coalesce(hs.habit_days, 0)::int as habit_days,
      coalesce(ms.mini_completions, 0)::int as mini_completions,
      (
        coalesce(hs.habit_days, 0) * 25
        + coalesce(ms.mini_completions, 0) * 12
      )::int as points
    from week_bounds wb
    left join habit_scores hs on hs.user_id = wb.id
    left join mini_scores ms on ms.user_id = wb.id
  ),
  ranked as (
    select
      s.*,
      (row_number() over (
        order by
          s.points desc,
          s.safe_xp desc,
          lower(s.username::text) asc,
          s.id asc
      ))::int as rn
    from scored s
  )
  select
    rn as rank_position,
    id as user_id,
    username,
    display_name,
    avatar_url,
    safe_xp as xp,
    (safe_xp / 250)::int as level,
    points,
    habit_days,
    mini_completions
  from ranked
  order by rn asc
  limit least(greatest(coalesce(p_limit, 20), 1), 50)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

grant execute on function public.get_weekly_leaderboard(int, int) to authenticated;

create function public.search_weekly_leaderboard_v1(p_query text, p_limit int default 15)
returns table (
  rank_position int,
  user_id uuid,
  username citext,
  display_name text,
  avatar_url text,
  xp int,
  level int,
  points int,
  habit_days int,
  mini_completions int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  q text := lower(trim(regexp_replace(coalesce(p_query, ''), '^@+', '')));
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  if q = '' then
    return;
  end if;

  perform public.refresh_weekly_user_stats_for_user(uid);

  return query
  with ranked as (
    select
      s.*,
      row_number() over (
        order by s.points desc, s.xp desc, lower(s.username::text) asc, s.user_id asc
      )::int as rn
    from public.weekly_user_stats s
    where s.username is not null
      and s.generated_at > now() - interval '8 days'
  )
  select
    r.rn,
    r.user_id,
    r.username,
    r.display_name,
    p.avatar_url,
    r.xp,
    (r.xp / 250)::int as level,
    r.points,
    r.habit_days,
    r.mini_completions
  from ranked r
  left join public.profiles p on p.id = r.user_id
  where lower(r.username::text) = q
     or lower(r.username::text) like q || '%'
     or lower(r.username::text) like '%' || q || '%'
  order by
    case
      when lower(r.username::text) = q then 0
      when lower(r.username::text) like q || '%' then 1
      else 2
    end,
    r.rn asc
  limit least(greatest(coalesce(p_limit, 15), 1), 20);
end;
$$;

grant execute on function public.search_weekly_leaderboard_v1(text, int) to authenticated;
