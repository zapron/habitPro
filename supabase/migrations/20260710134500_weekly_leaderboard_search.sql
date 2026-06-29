create or replace function public.search_weekly_leaderboard_v1(p_query text, p_limit int default 15)
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
    r.xp,
    (r.xp / 250)::int as level,
    r.points,
    r.habit_days,
    r.mini_completions
  from ranked r
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
