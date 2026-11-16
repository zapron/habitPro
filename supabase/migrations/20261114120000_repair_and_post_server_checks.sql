-- Server-side checks the app used to be trusted with.
--
-- 1. rpc_request_streak_repair: the XP cost has a floor of 40 (the app sent
--    its own cost and the server only checked it was not negative), and the
--    repaired day must be the day just missed: not in the future, at most
--    3 days back in the mission's time zone, not before the mission started
--    or the user joined, and not already done. Before this any date worked.
-- 2. Habit-day Community posts (habitwin:<habit>:<date>): a new post can't be
--    for a future day, and a post for an older day (2+ days back) needs that
--    day to be done. Posting an old, done day still works, and so does any
--    post that already exists (edits and re-posts).

create or replace function public.rpc_request_streak_repair(
  p_habit_id text,
  p_date_str text,
  p_reason text,
  p_xp_cost integer,
  p_challenge_id uuid default null,
  p_approvals_required integer default 2
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_id uuid;
  v_xp integer;
  v_approver_count integer;
  v_existing public.streak_repairs%rowtype;
  v_cost integer;
  v_completed jsonb;
  v_tz text;
  v_start date;
  v_joined date;
  v_date date;
  v_today date;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if p_habit_id is null or length(trim(p_habit_id)) < 1 then
    raise exception 'invalid_habit';
  end if;
  if p_date_str is null or length(trim(p_date_str)) < 8 then
    raise exception 'invalid_date';
  end if;

  if length(trim(coalesce(p_reason, ''))) < 1 or length(trim(p_reason)) > 140 then
    raise exception 'invalid_reason';
  end if;
  if coalesce(p_xp_cost, 0) < 0 then
    raise exception 'invalid_cost';
  end if;

  -- The app shows the cheapest tier for a just-missed day (its streak counts
  -- only to today/yesterday), so 40 is both the floor and what users see.
  v_cost := greatest(coalesce(p_xp_cost, 0), 40);

  -- Eligibility on the server too: the day just missed, nothing older.
  if p_date_str !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'invalid_date';
  end if;
  begin
    v_date := p_date_str::date;
  exception when others then
    raise exception 'invalid_date';
  end;

  select coalesce(h.completed_dates, '[]'::jsonb),
         public.safe_time_zone(h.mission_timezone),
         (h.start_date at time zone public.safe_time_zone(h.mission_timezone))::date,
         (h.joined_challenge_at at time zone public.safe_time_zone(h.mission_timezone))::date
    into v_completed, v_tz, v_start, v_joined
  from public.habits h
  where h.id = p_habit_id and h.user_id = uid;
  if not found then
    raise exception 'habit_not_found';
  end if;

  v_today := (now() at time zone v_tz)::date;
  -- Up to 3 days back covers 24h-slot missions and time zone slack.
  if v_date > v_today or v_date < v_today - 3 or v_date < v_start then
    raise exception 'outside_repair_window';
  end if;
  if v_joined is not null and v_date < v_joined then
    raise exception 'outside_repair_window';
  end if;

  if p_challenge_id is not null then
    if not public.profile_is_premium(uid) then
      raise exception 'premium_required';
    end if;
    if not public.user_is_challenge_member(p_challenge_id, uid) then
      raise exception 'not a member';
    end if;

    select count(*)::integer
      into v_approver_count
    from public.challenge_members m
    where m.challenge_id = p_challenge_id
      and m.user_id <> uid;
  end if;

  v_xp := public.get_my_xp();

  if p_challenge_id is null or coalesce(v_approver_count, 0) = 0 then
    select *
      into v_existing
    from public.streak_repairs r
    where r.user_id = uid
      and r.habit_id = p_habit_id
      and r.date_str = p_date_str
    for update;

    if v_existing.id is not null then
      if v_existing.status = 'applied' then
        return v_existing.id;
      end if;
      if v_existing.status <> 'pending' then
        raise exception 'repair_already_resolved';
      end if;

      if v_xp < v_existing.xp_cost then
        raise exception 'insufficient_xp';
      end if;

      update public.profiles
      set xp = xp - v_existing.xp_cost,
          updated_at = now()
      where id = uid;

      update public.streak_repairs
      set status = 'applied',
          approvals_required = 0,
          applied_at = now()
      where id = v_existing.id;

      perform public._rpc_append_habit_completed_date(uid, p_habit_id, p_date_str);
      perform public._rpc_merge_repair_streak_memory(uid, p_habit_id, p_date_str, 'solo');
      return v_existing.id;
    end if;

    if exists (
      select 1 from jsonb_array_elements_text(v_completed) d(raw) where left(d.raw, 10) = p_date_str
    ) then
      raise exception 'already_complete';
    end if;

    if v_xp < v_cost then
      raise exception 'insufficient_xp';
    end if;

    update public.profiles
    set xp = xp - v_cost,
        updated_at = now()
    where id = uid;

    insert into public.streak_repairs (
      user_id,
      habit_id,
      challenge_id,
      date_str,
      reason,
      xp_cost,
      status,
      approvals_required,
      applied_at
    )
    values (
      uid,
      p_habit_id,
      p_challenge_id,
      p_date_str,
      trim(p_reason),
      v_cost,
      'applied',
      0,
      now()
    )
    returning id into v_id;

    perform public._rpc_append_habit_completed_date(uid, p_habit_id, p_date_str);
    perform public._rpc_merge_repair_streak_memory(uid, p_habit_id, p_date_str, 'solo');
    return v_id;
  end if;

  if exists (
    select 1 from jsonb_array_elements_text(v_completed) d(raw) where left(d.raw, 10) = p_date_str
  ) then
    raise exception 'already_complete';
  end if;

  insert into public.streak_repairs (
    user_id,
    habit_id,
    challenge_id,
    date_str,
    reason,
    xp_cost,
    status,
    approvals_required
  )
  values (
    uid,
    p_habit_id,
    p_challenge_id,
    p_date_str,
    trim(p_reason),
    v_cost,
    'pending',
    least(greatest(1, coalesce(p_approvals_required, 2)), v_approver_count)
  )
  returning id into v_id;

  insert into public.notifications (user_id, type, payload)
  select
    m.user_id,
    'streak_repair_request',
    jsonb_build_object(
      'type', 'streak_repair_request',
      'challenge_id', p_challenge_id,
      'repair_id', v_id,
      'habit_id', p_habit_id,
      'date_str', p_date_str,
      'requester_username', (select username from public.profiles where id = uid)
    )
  from public.challenge_members m
  where m.challenge_id = p_challenge_id
    and m.user_id <> uid;

  return v_id;
end;
$$;

grant execute on function public.rpc_request_streak_repair(text, text, text, integer, uuid, integer) to authenticated;

create or replace function public._community_check_habit_streak_win_date()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_habit_id text;
  v_date_str text;
  v_date date;
  v_completed jsonb;
  v_tz text;
  v_today date;
begin
  if coalesce(new.feed_source, 'mini') <> 'habit_streak'
    or split_part(coalesce(new.mini_mission_id, ''), ':', 1) <> 'habitwin'
  then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.mini_mission_id is not distinct from old.mini_mission_id then
    return new;
  end if;
  -- Re-posting or editing an existing post is always fine (upserts arrive as inserts).
  if tg_op = 'INSERT' and exists (
    select 1 from public.community_wins w
    where w.user_id = new.user_id and w.mini_mission_id = new.mini_mission_id
  ) then
    return new;
  end if;

  v_habit_id := split_part(new.mini_mission_id, ':', 2);
  v_date_str := split_part(new.mini_mission_id, ':', 3);
  if v_date_str !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'invalid_post_date';
  end if;
  begin
    v_date := v_date_str::date;
  exception when others then
    raise exception 'invalid_post_date';
  end;

  select coalesce(h.completed_dates, '[]'::jsonb), public.safe_time_zone(h.mission_timezone)
    into v_completed, v_tz
  from public.habits h
  where h.user_id = new.user_id and h.id = v_habit_id;

  v_today := (now() at time zone coalesce(v_tz, 'UTC'))::date;
  if v_date > v_today + 1 then
    raise exception 'invalid_post_date';
  end if;
  -- Today and yesterday may not have synced yet, and a habit that hasn't
  -- synced at all is let through.
  if v_tz is not null and v_date < v_today - 1 and not exists (
    select 1 from jsonb_array_elements_text(v_completed) d(raw) where left(d.raw, 10) = v_date_str
  ) then
    raise exception 'post_day_not_done';
  end if;

  return new;
end;
$$;

revoke all on function public._community_check_habit_streak_win_date() from public;

drop trigger if exists trg_community_check_habit_streak_win_date on public.community_wins;
create trigger trg_community_check_habit_streak_win_date
  before insert or update of mini_mission_id on public.community_wins
  for each row
  execute function public._community_check_habit_streak_win_date();
