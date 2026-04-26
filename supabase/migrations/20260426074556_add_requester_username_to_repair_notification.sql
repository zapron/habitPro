-- Update rpc_request_streak_repair to include requester_username in notification payload
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
    if not public.user_is_challenge_member(p_challenge_id, uid) then
      raise exception 'not a member';
    end if;
  end if;

  v_xp := public.get_my_xp();
  if p_challenge_id is null then
    if v_xp < p_xp_cost then
      raise exception 'insufficient_xp';
    end if;
    update public.profiles set xp = xp - p_xp_cost, updated_at = now() where id = uid;
    insert into public.streak_repairs (user_id, habit_id, challenge_id, date_str, reason, xp_cost, status, approvals_required, applied_at)
    values (uid, p_habit_id, null, p_date_str, trim(p_reason), p_xp_cost, 'applied', 0, now())
    returning id into v_id;

    perform public._rpc_append_habit_completed_date(uid, p_habit_id, p_date_str);
    return v_id;
  end if;

  insert into public.streak_repairs (user_id, habit_id, challenge_id, date_str, reason, xp_cost, status, approvals_required)
  values (uid, p_habit_id, p_challenge_id, p_date_str, trim(p_reason), p_xp_cost, 'pending', greatest(1, coalesce(p_approvals_required, 2)))
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
