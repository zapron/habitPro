-- When a streak repair is applied, also mark the habit day as completed in `habits.completed_dates`.
-- This makes the UI immediately reflect the repaired day without extra client-side merging.

create or replace function public._rpc_append_habit_completed_date(
  p_user_id uuid,
  p_habit_id text,
  p_date_str text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prev jsonb;
begin
  select h.completed_dates into v_prev
  from public.habits h
  where h.user_id = p_user_id and h.id = p_habit_id;

  if v_prev is null then
    v_prev := '[]'::jsonb;
  end if;

  update public.habits
  set completed_dates = (
    select jsonb_agg(x order by x)
    from (
      select distinct x
      from (
        select jsonb_array_elements_text(v_prev) as x
        union all
        select p_date_str as x
      ) s
    ) d
  ),
  updated_at = now()
  where user_id = p_user_id and id = p_habit_id;
end;
$$;

revoke all on function public._rpc_append_habit_completed_date(uuid, text, text) from public;

-- Update request RPC: solo applies immediately and should also update habits.
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
      'date_str', p_date_str
    )
  from public.challenge_members m
  where m.challenge_id = p_challenge_id
    and m.user_id <> uid;

  return v_id;
end;
$$;

grant execute on function public.rpc_request_streak_repair(text, text, text, integer, uuid, integer) to authenticated;

-- Update vote RPC: when applied, also update habits.completed_dates.
create or replace function public.rpc_vote_streak_repair(
  p_repair_id uuid,
  p_vote text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_r public.streak_repairs%rowtype;
  v_approves integer;
  v_declines integer;
  v_xp integer;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if p_vote not in ('approve', 'decline') then
    raise exception 'invalid_vote';
  end if;

  select * into v_r from public.streak_repairs where id = p_repair_id;
  if v_r.id is null then
    raise exception 'not_found';
  end if;
  if v_r.challenge_id is null then
    raise exception 'not_group_repair';
  end if;
  if not public.user_is_challenge_member(v_r.challenge_id, uid) then
    raise exception 'not a member';
  end if;
  if uid = v_r.user_id then
    raise exception 'cannot vote';
  end if;
  if v_r.status <> 'pending' then
    return;
  end if;

  insert into public.streak_repair_votes (repair_id, voter_id, vote)
  values (v_r.id, uid, p_vote)
  on conflict (repair_id, voter_id) do update set vote = excluded.vote;

  select count(*) into v_approves from public.streak_repair_votes where repair_id = v_r.id and vote = 'approve';
  select count(*) into v_declines from public.streak_repair_votes where repair_id = v_r.id and vote = 'decline';

  if v_declines >= 1 then
    update public.streak_repairs set status = 'declined' where id = v_r.id;
    insert into public.notifications (user_id, type, payload)
    values (
      v_r.user_id,
      'streak_repair_result',
      jsonb_build_object(
        'type','streak_repair_result',
        'repair_id', v_r.id,
        'status','declined',
        'challenge_id', v_r.challenge_id,
        'habit_id', v_r.habit_id,
        'date_str', v_r.date_str
      )
    );
    return;
  end if;

  if v_approves >= v_r.approvals_required then
    v_xp := coalesce((select p.xp from public.profiles p where p.id = v_r.user_id), 0);
    if v_xp < v_r.xp_cost then
      update public.streak_repairs set status = 'declined' where id = v_r.id;
      insert into public.notifications (user_id, type, payload)
      values (
        v_r.user_id,
        'streak_repair_result',
        jsonb_build_object(
          'type','streak_repair_result',
          'repair_id', v_r.id,
          'status','declined',
          'reason','insufficient_xp'
        )
      );
      return;
    end if;

    update public.profiles set xp = xp - v_r.xp_cost, updated_at = now() where id = v_r.user_id;
    update public.streak_repairs set status = 'applied', applied_at = now() where id = v_r.id;
    perform public._rpc_append_habit_completed_date(v_r.user_id, v_r.habit_id, v_r.date_str);

    insert into public.notifications (user_id, type, payload)
    values (
      v_r.user_id,
      'streak_repair_result',
      jsonb_build_object(
        'type','streak_repair_result',
        'repair_id', v_r.id,
        'status','applied',
        'challenge_id', v_r.challenge_id,
        'habit_id', v_r.habit_id,
        'date_str', v_r.date_str
      )
    );
  end if;
end;
$$;

grant execute on function public.rpc_vote_streak_repair(uuid, text) to authenticated;

