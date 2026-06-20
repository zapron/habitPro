create or replace function public.rpc_community_player_mission_descriptions_v1(
  p_user_id uuid,
  p_habit_ids text[]
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_descriptions jsonb := '{}'::jsonb;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  if p_user_id is null then
    raise exception 'player id required';
  end if;

  with requested as (
    select distinct trim(habit_id) as habit_id
    from unnest(coalesce(p_habit_ids, array[]::text[])) as habit_id
    where trim(habit_id) <> ''
    limit 100
  ),
  readable as (
    select
      h.id::text as habit_id,
      nullif(trim(coalesce(h.description, '')), '') as description
    from public.habits h
    join requested r on r.habit_id = h.id::text
    where h.user_id = p_user_id
      and nullif(trim(coalesce(h.description, '')), '') is not null
      and exists (
        select 1
        from public.community_wins w
        where w.user_id = p_user_id
          and coalesce(w.feed_source, 'mini') = 'habit_streak'
          and w.mini_mission_id like ('habitwin:' || h.id::text || ':%')
      )
  )
  select coalesce(jsonb_object_agg(habit_id, description), '{}'::jsonb)
    into v_descriptions
  from readable;

  return v_descriptions;
end;
$$;

grant execute on function public.rpc_community_player_mission_descriptions_v1(uuid, text[]) to authenticated;
