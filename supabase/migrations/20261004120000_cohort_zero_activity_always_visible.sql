-- Cohort screen: a member who has just joined (zero streak, zero check-ins, or
-- hasn't even linked a habit row yet) could be buried indefinitely by
-- rpc_challenge_streak_members_page_v1's activity-ranked pagination — the sort
-- is streak desc/completed_count desc, so a brand-new joiner always sorts to
-- the very back, and the client's initial page is only 3 rows
-- (STREAK_MEMBERS_INITIAL_PAGE_SIZE). The participant-count header (driven by
-- rpc_challenge_snapshot_v1's unpaginated memberIdsOrdered) already shows them
-- immediately, so the symptom was: notification fires, count looks right, but
-- the scrollable member-card list never shows the person unless someone taps
-- "Load more" enough times to reach them.
--
-- Explicit product decision: a joined member should never be hidden behind
-- pagination just for having zero activity so far — "they joined anyway."
-- Fix: split the ranked pool into an active pool (still paginated exactly as
-- before, offset/limit, streak-ranked — this is the part that matters for a
-- potentially large/competitive group) and a zero-activity pool (no habit row
-- yet, or a habit row with streak=0 and zero check-ins) that is always
-- included in full on the FIRST page only (p_offset = 0) — never re-sent on
-- subsequent "load more" pages, since the client already has them by then.
-- has_more continues to reflect only the active pool, since the zero-activity
-- set was never paginated in the first place.

create or replace function public.rpc_challenge_streak_members_page_v1(p_challenge_id uuid, p_offset integer DEFAULT 0, p_limit integer DEFAULT 5)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
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
  -- "Joined but nothing to rank yet" — always shown, never paginated.
  zero_activity as (
    select *
    from ranked_raw
    where habit_id is null or (streak = 0 and completed_count = 0)
  ),
  active_pool as (
    select *
    from ranked_raw
    where not (habit_id is null or (streak = 0 and completed_count = 0))
  ),
  active_page_raw as (
    select *
    from active_pool
    order by streak desc, completed_count desc, joined_at asc, user_id asc
    offset v_offset
    limit (v_limit + 1)
  ),
  active_page as (
    select *
    from active_page_raw
    order by streak desc, completed_count desc, joined_at asc, user_id asc
    limit v_limit
  ),
  combined as (
    select *, 0 as sort_bucket from active_page
    union all
    select *, 1 as sort_bucket from zero_activity where v_offset = 0
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
          p.sort_bucket asc,
          case when p.habit_id is null then -1 else p.streak end desc,
          p.completed_count desc,
          p.joined_at asc,
          p.user_id asc
      ),
      '[]'::jsonb
    ),
    (select count(*) > v_limit from active_page_raw)
    into v_items, v_has_more
  from combined p
  left join public.habits hm
    on hm.user_id = p.user_id
   and hm.id = p.habit_id
  left join lateral (
    select jsonb_object_agg(
      mem.key,
      jsonb_build_object(
        'hasPhoto',
          nullif(trim(coalesce(mem.value ->> 'imageUrl', '')), '') is not null
          or nullif(trim(coalesce(mem.value ->> 'imageUri', '')), '') is not null
          or exists (
            select 1
            from jsonb_array_elements(coalesce(mem.value -> 'tasks', '[]'::jsonb)) as t
            where coalesce(t -> 'proofUrls' ->> 0, '') like 'http%'
          ),
        'hasNote',
          nullif(trim(coalesce(mem.value ->> 'note', '')), '') is not null
          or exists (
            select 1
            from jsonb_array_elements(coalesce(mem.value -> 'tasks', '[]'::jsonb)) as t
            where nullif(trim(coalesce(t ->> 'note', '')), '') is not null
          ),
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
        or (jsonb_typeof(mem.value -> 'tasks') = 'array' and jsonb_array_length(coalesce(mem.value -> 'tasks', '[]'::jsonb)) > 0)
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
$function$;
