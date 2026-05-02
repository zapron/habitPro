-- Public ranked league for authenticated users.
-- Uses a security definer RPC so clients do not need broad profiles table RLS.

create or replace function public.get_global_leaderboard(p_limit int default 25)
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
  limit least(greatest(coalesce(p_limit, 25), 1), 50);
$$;

grant execute on function public.get_global_leaderboard(int) to authenticated;
