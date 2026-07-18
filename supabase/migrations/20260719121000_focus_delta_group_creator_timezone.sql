-- Keep launch delta group alignment metadata timezone-aware for older group habits.

create or replace function public.rpc_focus_delta_v1(p_since timestamptz default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_since timestamptz := coalesce(p_since, '-infinity'::timestamptz);
  v_now timestamptz := now();
  v_profile jsonb;
  v_habits jsonb := '[]'::jsonb;
  v_minis jsonb := '[]'::jsonb;
  v_group_meta jsonb := '[]'::jsonb;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  select jsonb_build_object(
    'id', p.id,
    'username', nullif(lower(coalesce(p.username::text, '')), ''),
    'displayName', nullif(trim(coalesce(p.display_name, '')), ''),
    'xp', coalesce(p.xp, 0),
    'isPremium', coalesce(p.is_premium, false),
    'timezone', p.timezone,
    'updatedAt', p.updated_at
  )
    into v_profile
  from public.profiles p
  where p.id = uid;

  select coalesce(jsonb_agg(to_jsonb(h) order by h.updated_at desc, h.id asc), '[]'::jsonb)
    into v_habits
  from public.habits h
  where h.user_id = uid
    and h.updated_at > v_since;

  select coalesce(jsonb_agg(to_jsonb(m) order by m.updated_at desc, m.id asc), '[]'::jsonb)
    into v_minis
  from public.mini_missions m
  where m.user_id = uid
    and m.updated_at > v_since;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', g.id,
        'start_date', g.start_date,
        'creator_timezone', g.creator_timezone,
        'habit_template', coalesce(g.habit_template, '{}'::jsonb)
      )
      order by g.id asc
    ),
    '[]'::jsonb
  )
    into v_group_meta
  from public.challenge_groups g
  where g.id in (
    select distinct h.challenge_group_id
    from public.habits h
    where h.user_id = uid
      and h.updated_at > v_since
      and h.challenge_group_id is not null
  );

  return jsonb_build_object(
    'changedHabits', v_habits,
    'changedMinis', v_minis,
    'groupMeta', v_group_meta,
    'profilePatch', v_profile,
    'deletedIds', jsonb_build_object('habits', '[]'::jsonb, 'miniMissions', '[]'::jsonb),
    'serverNow', v_now,
    'version', v_now
  );
end;
$$;

grant execute on function public.rpc_focus_delta_v1(timestamptz) to authenticated;
