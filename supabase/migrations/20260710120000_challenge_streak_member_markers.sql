-- Keep group streak participant cards lightweight.
-- The first-page timeline only needs badge markers; actual note/photo data is fetched on tap.

create or replace function public.rpc_challenge_streak_members_page_v1(
  p_challenge_id uuid,
  p_offset integer default 0,
  p_limit integer default 5
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_offset integer := greatest(0, coalesce(p_offset, 0));
  v_limit integer := least(30, greatest(1, coalesce(p_limit, 5)));
  v_group jsonb;
  v_items jsonb := '[]'::jsonb;
  v_has_more boolean := false;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  if p_challenge_id is null or not public.user_is_challenge_member(p_challenge_id, uid) then
    raise exception 'not a member';
  end if;

  select jsonb_build_object(
    'id', g.id,
    'startDate', g.start_date,
    'creatorTimezone', g.creator_timezone,
    'habitTemplate', coalesce(g.habit_template, '{}'::jsonb)
  )
    into v_group
  from public.challenge_groups g
  where g.id = p_challenge_id;

  with ranked_raw as (
    select
      m.user_id,
      m.joined_at,
      public._hp_profile_label_json(m.user_id) as label,
      h.id as habit_id,
      h.title,
      h.description,
      h.mode,
      h.visibility,
      h.start_date,
      h.end_date,
      coalesce(h.completed_dates, '[]'::jsonb) as completed_dates,
      coalesce(h.streak, 0) as streak,
      coalesce(h.total_days, 21) as total_days,
      coalesce(h.is_completed, false) as is_completed,
      coalesce(h.status, 'active') as status,
      h.challenge_group_id,
      h.challenge_creator_timezone,
      h.mission_timezone,
      h.mission_report,
      h.mission_report_at,
      jsonb_array_length(coalesce(h.completed_dates, '[]'::jsonb)) as completed_count
    from public.challenge_members m
    left join public.habits h
      on h.user_id = m.user_id
     and h.id = m.habit_id
    where m.challenge_id = p_challenge_id
  ),
  page_raw as (
    select *
    from ranked_raw
    order by
      case when habit_id is null then -1 else streak end desc,
      completed_count desc,
      joined_at asc,
      user_id asc
    offset v_offset
    limit (v_limit + 1)
  ),
  page as (
    select *
    from page_raw
    order by
      case when habit_id is null then -1 else streak end desc,
      completed_count desc,
      joined_at asc,
      user_id asc
    limit v_limit
  )
  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'memberId', p.user_id,
          'label', p.label,
          'habit', case
            when p.habit_id is null then null
            else jsonb_build_object(
              'user_id', p.user_id,
              'id', p.habit_id,
              'title', p.title,
              'description', p.description,
              'mode', p.mode,
              'visibility', p.visibility,
              'start_date', p.start_date,
              'end_date', p.end_date,
              'completed_dates', p.completed_dates,
              'streak', p.streak,
              'total_days', p.total_days,
              'is_completed', p.is_completed,
              'status', p.status,
              'challenge_group_id', coalesce(p.challenge_group_id, p_challenge_id),
              'challenge_creator_timezone', p.challenge_creator_timezone,
              'mission_timezone', p.mission_timezone,
              'streak_memory_markers',
                case
                  when coalesce(p.visibility, 'solo') = 'public' then coalesce(markers.streak_memory_markers, '{}'::jsonb)
                  else '{}'::jsonb
                end,
              'mission_report', p.mission_report,
              'mission_report_at', p.mission_report_at
            )
          end
        )
        order by
          case when p.habit_id is null then -1 else p.streak end desc,
          p.completed_count desc,
          p.joined_at asc,
          p.user_id asc
      ),
      '[]'::jsonb
    ),
    (select count(*) > v_limit from page_raw)
    into v_items, v_has_more
  from page p
  left join public.habits hm
    on hm.user_id = p.user_id
   and hm.id = p.habit_id
  left join lateral (
    select jsonb_object_agg(
      mem.key,
      jsonb_build_object(
        'hasPhoto',
          nullif(trim(coalesce(mem.value ->> 'imageUrl', '')), '') is not null
          or nullif(trim(coalesce(mem.value ->> 'imageUri', '')), '') is not null,
        'hasNote', nullif(trim(coalesce(mem.value ->> 'note', '')), '') is not null,
        'checkInOnly', lower(coalesce(mem.value ->> 'checkInOnly', 'false')) = 'true',
        'createdAt', nullif(trim(coalesce(mem.value ->> 'createdAt', '')), '')
      )
    ) as streak_memory_markers
    from jsonb_each(coalesce(hm.streak_memories, '{}'::jsonb)) mem
    where jsonb_typeof(mem.value) = 'object'
      and (
        nullif(trim(coalesce(mem.value ->> 'imageUrl', '')), '') is not null
        or nullif(trim(coalesce(mem.value ->> 'imageUri', '')), '') is not null
        or nullif(trim(coalesce(mem.value ->> 'note', '')), '') is not null
        or lower(coalesce(mem.value ->> 'checkInOnly', 'false')) = 'true'
      )
  ) markers on true;

  return jsonb_build_object(
    'items', coalesce(v_items, '[]'::jsonb),
    'hasMore', coalesce(v_has_more, false),
    'nextOffset', case when coalesce(v_has_more, false) then v_offset + v_limit else null end,
    'group', v_group,
    'serverNow', now()
  );
end;
$$;

grant execute on function public.rpc_challenge_streak_members_page_v1(uuid, integer, integer) to authenticated;

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
      (to_jsonb(h) - 'streak_memories')
        || jsonb_build_object(
          'challenge_group_id', pl.challenge_id,
          'streak_memory_markers',
            case
              when coalesce(h.visibility, 'solo') = 'public' then coalesce(markers.streak_memory_markers, '{}'::jsonb)
              else '{}'::jsonb
            end
        )
      order by pl.challenge_id, pl.user_id, h.id
    ),
    '[]'::jsonb
  )
    into v_habits
  from peer_links pl
  inner join public.habits h
    on h.id = pl.habit_id
   and h.user_id = pl.user_id
  left join lateral (
    select jsonb_object_agg(
      mem.key,
      jsonb_build_object(
        'hasPhoto',
          nullif(trim(coalesce(mem.value ->> 'imageUrl', '')), '') is not null
          or nullif(trim(coalesce(mem.value ->> 'imageUri', '')), '') is not null,
        'hasNote', nullif(trim(coalesce(mem.value ->> 'note', '')), '') is not null,
        'checkInOnly', lower(coalesce(mem.value ->> 'checkInOnly', 'false')) = 'true',
        'createdAt', nullif(trim(coalesce(mem.value ->> 'createdAt', '')), '')
      )
    ) as streak_memory_markers
    from jsonb_each(coalesce(h.streak_memories, '{}'::jsonb)) mem
    where jsonb_typeof(mem.value) = 'object'
      and (
        nullif(trim(coalesce(mem.value ->> 'imageUrl', '')), '') is not null
        or nullif(trim(coalesce(mem.value ->> 'imageUri', '')), '') is not null
        or nullif(trim(coalesce(mem.value ->> 'note', '')), '') is not null
        or lower(coalesce(mem.value ->> 'checkInOnly', 'false')) = 'true'
      )
  ) markers on true;

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
