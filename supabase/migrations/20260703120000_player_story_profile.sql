-- Player story profile: direct rank lookup + fast Community-only story reads.

create index if not exists community_wins_user_created_at_idx
  on public.community_wins (user_id, created_at desc);

create index if not exists community_wins_user_source_created_at_idx
  on public.community_wins (user_id, feed_source, created_at desc);

create or replace function public.rpc_community_player_ranks_v1(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_weekly jsonb := null;
  v_global jsonb := null;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if p_user_id is null then
    raise exception 'player id required';
  end if;

  perform public.refresh_weekly_user_stats_for_user(p_user_id);

  with ranked as (
    select
      p.id as user_id,
      greatest(coalesce(p.xp, 0), 0)::int as xp,
      row_number() over (
        order by greatest(coalesce(p.xp, 0), 0) desc, lower(p.username::text) asc, p.id asc
      )::int as rank_position
    from public.profiles p
    where p.username is not null
      and length(trim(p.username::text)) > 0
  )
  select jsonb_build_object(
    'rankPosition', r.rank_position,
    'xp', r.xp
  )
    into v_global
  from ranked r
  where r.user_id = p_user_id;

  with ranked as (
    select
      s.user_id,
      s.points,
      s.habit_days,
      s.mini_completions,
      row_number() over (
        order by s.points desc, s.xp desc, lower(s.username::text) asc, s.user_id asc
      )::int as rank_position
    from public.weekly_user_stats s
    where s.username is not null
      and s.generated_at > now() - interval '8 days'
  )
  select jsonb_build_object(
    'rankPosition', r.rank_position,
    'points', r.points,
    'habitCheckIns', r.habit_days,
    'miniCompletions', r.mini_completions
  )
    into v_weekly
  from ranked r
  where r.user_id = p_user_id;

  return jsonb_build_object(
    'weekly', v_weekly,
    'global', v_global
  );
end;
$$;

grant execute on function public.rpc_community_player_ranks_v1(uuid) to authenticated;
