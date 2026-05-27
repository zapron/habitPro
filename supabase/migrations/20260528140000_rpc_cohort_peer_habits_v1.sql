-- Single round-trip cohort peer habits for squad timeline UI.

create or replace function public.rpc_cohort_peer_habits_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_habits jsonb := '[]'::jsonb;
  v_groups jsonb := '[]'::jsonb;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  with my_groups as (
    select cm.challenge_id
    from public.challenge_members cm
    where cm.user_id = uid
  ),
  peer_links as (
    select distinct on (cm.habit_id, cm.user_id)
      cm.habit_id,
      cm.challenge_id,
      cm.user_id
    from public.challenge_members cm
    inner join my_groups mg on mg.challenge_id = cm.challenge_id
    where cm.user_id <> uid
      and cm.habit_id is not null
      and length(trim(cm.habit_id)) > 0
  )
  select coalesce(
    jsonb_agg(
      to_jsonb(h) || jsonb_build_object('challenge_group_id', pl.challenge_id)
      order by pl.challenge_id, pl.user_id, h.id
    ),
    '[]'::jsonb
  )
    into v_habits
  from peer_links pl
  inner join public.habits h
    on h.id = pl.habit_id
   and h.user_id = pl.user_id;

  with my_groups as (
    select cm.challenge_id
    from public.challenge_members cm
    where cm.user_id = uid
  ),
  group_ids as (
    select distinct pl.challenge_id as id
    from public.challenge_members pl
    inner join my_groups mg on mg.challenge_id = pl.challenge_id
    where pl.user_id <> uid
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', g.id,
        'start_date', g.start_date,
        'habit_template', coalesce(g.habit_template, '{}'::jsonb)
      )
      order by g.id
    ),
    '[]'::jsonb
  )
    into v_groups
  from public.challenge_groups g
  where g.id in (select id from group_ids);

  return jsonb_build_object(
    'habits', v_habits,
    'groupMeta', v_groups,
    'serverNow', now()
  );
end;
$$;

grant execute on function public.rpc_cohort_peer_habits_v1() to authenticated;
