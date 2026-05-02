-- Adds offset support for Momentum League pagination.
-- Kept as a separate migration because the initial leaderboard RPC may already be deployed.

create or replace function public.get_global_leaderboard(p_limit int default 25, p_offset int default 0)
returns table (
  rank_position int,
  user_id uuid,
  username citext,
  display_name text,
  xp int,
  level int
)
language sql
stable
security definer
set search_path = public
as $$
  with ranked as (
    select
      p.id,
      p.username,
      p.display_name,
      greatest(coalesce(p.xp, 0), 0)::int as safe_xp,
      (row_number() over (
        order by
          greatest(coalesce(p.xp, 0), 0) desc,
          lower(p.username::text) asc,
          p.id asc
      ))::int as rn
    from public.profiles p
    where p.username is not null
      and length(trim(p.username::text)) > 0
  )
  select
    rn as rank_position,
    id as user_id,
    username,
    display_name,
    safe_xp as xp,
    (safe_xp / 100)::int as level
  from ranked
  order by rn asc
  limit least(greatest(coalesce(p_limit, 25), 1), 50)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

grant execute on function public.get_global_leaderboard(int, int) to authenticated;
