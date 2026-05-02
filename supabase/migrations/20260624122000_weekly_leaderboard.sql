-- Weekly leaderboard for the Compete tab.
-- Rankings are based on current-week activity, not lifetime XP.

drop function if exists public.get_global_leaderboard(int);
drop function if exists public.get_global_leaderboard(int, int);

create or replace function public.get_weekly_leaderboard(p_limit int default 20, p_offset int default 0)
returns table (
  rank_position int,
  user_id uuid,
  username citext,
  display_name text,
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
      count(distinct d.day_key)::int as habit_days
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
      wb.safe_xp,
      coalesce(hs.habit_days, 0)::int as habit_days,
      coalesce(ms.mini_completions, 0)::int as mini_completions,
      (
        coalesce(hs.habit_days, 0) * 18
        + coalesce(ms.mini_completions, 0) * 22
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
    safe_xp as xp,
    (safe_xp / 100)::int as level,
    points,
    habit_days,
    mini_completions
  from ranked
  order by rn asc
  limit least(greatest(coalesce(p_limit, 20), 1), 50)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

grant execute on function public.get_weekly_leaderboard(int, int) to authenticated;
