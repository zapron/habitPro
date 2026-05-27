-- Lone group repair fallback:
-- If everyone else has left a group mission, the remaining member can repair
-- with the normal XP charge instead of waiting for impossible squad approval.

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

    if v_xp < p_xp_cost then
      raise exception 'insufficient_xp';
    end if;

    update public.profiles
    set xp = xp - p_xp_cost,
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
      p_xp_cost,
      'applied',
      0,
      now()
    )
    returning id into v_id;

    perform public._rpc_append_habit_completed_date(uid, p_habit_id, p_date_str);
    perform public._rpc_merge_repair_streak_memory(uid, p_habit_id, p_date_str, 'solo');
    return v_id;
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
    p_xp_cost,
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

do $$
declare
  v_repair public.streak_repairs%rowtype;
  v_xp integer;
begin
  for v_repair in
    select r.*
    from public.streak_repairs r
    where r.status = 'pending'
      and r.challenge_id is not null
      and exists (
        select 1
        from public.challenge_members requester
        where requester.challenge_id = r.challenge_id
          and requester.user_id = r.user_id
      )
      and not exists (
        select 1
        from public.challenge_members approver
        where approver.challenge_id = r.challenge_id
          and approver.user_id <> r.user_id
      )
  loop
    select coalesce(p.xp, 0)
      into v_xp
    from public.profiles p
    where p.id = v_repair.user_id
    for update;

    if coalesce(v_xp, 0) >= v_repair.xp_cost then
      update public.profiles
      set xp = xp - v_repair.xp_cost,
          updated_at = now()
      where id = v_repair.user_id;

      update public.streak_repairs
      set status = 'applied',
          approvals_required = 0,
          applied_at = now()
      where id = v_repair.id
        and status = 'pending';

      perform public._rpc_append_habit_completed_date(
        v_repair.user_id,
        v_repair.habit_id,
        v_repair.date_str
      );
      perform public._rpc_merge_repair_streak_memory(
        v_repair.user_id,
        v_repair.habit_id,
        v_repair.date_str,
        'solo'
      );
    end if;
  end loop;
end $$;
