-- Streak repairs: XP-costed repair requests with optional squad approval for group missions.

create table if not exists public.streak_repairs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  habit_id text not null,
  challenge_id uuid references public.challenge_groups (id) on delete cascade,
  date_str text not null,
  reason text not null,
  xp_cost integer not null default 0,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined', 'applied')),
  approvals_required integer not null default 2,
  created_at timestamptz not null default now(),
  applied_at timestamptz,
  unique (user_id, habit_id, date_str)
);

create index if not exists streak_repairs_user_idx on public.streak_repairs (user_id, created_at desc);
create index if not exists streak_repairs_challenge_idx on public.streak_repairs (challenge_id, created_at desc);

create table if not exists public.streak_repair_votes (
  repair_id uuid not null references public.streak_repairs (id) on delete cascade,
  voter_id uuid not null references auth.users (id) on delete cascade,
  vote text not null check (vote in ('approve', 'decline')),
  created_at timestamptz not null default now(),
  primary key (repair_id, voter_id)
);

alter table public.streak_repairs enable row level security;
alter table public.streak_repair_votes enable row level security;

-- Requester can see their own repairs; challenge members can see challenge-linked repairs.
create policy "streak_repairs_select_own_or_challenge_member"
  on public.streak_repairs for select
  using (
    auth.uid() = user_id
    or (
      challenge_id is not null
      and public.user_is_challenge_member(challenge_id, auth.uid())
    )
  );

create policy "streak_repairs_insert_own"
  on public.streak_repairs for insert
  with check (auth.uid() = user_id);

create policy "streak_repairs_update_requester_only"
  on public.streak_repairs for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "streak_repair_votes_select_challenge_member"
  on public.streak_repair_votes for select
  using (
    exists (
      select 1
      from public.streak_repairs r
      where r.id = streak_repair_votes.repair_id
        and r.challenge_id is not null
        and public.user_is_challenge_member(r.challenge_id, auth.uid())
    )
  );

create policy "streak_repair_votes_insert_challenge_member"
  on public.streak_repair_votes for insert
  with check (
    exists (
      select 1
      from public.streak_repairs r
      where r.id = streak_repair_votes.repair_id
        and r.challenge_id is not null
        and public.user_is_challenge_member(r.challenge_id, auth.uid())
    )
  );

-- Helper: xp balance (security definer to read profiles bypassing RLS if needed)
create or replace function public.get_my_xp()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select p.xp from public.profiles p where p.id = auth.uid()), 0);
$$;

revoke all on function public.get_my_xp() from public;
grant execute on function public.get_my_xp() to authenticated;

-- Create a repair request.
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
    -- Solo: charge immediately.
    if v_xp < p_xp_cost then
      raise exception 'insufficient_xp';
    end if;
    update public.profiles set xp = xp - p_xp_cost, updated_at = now() where id = uid;
    insert into public.streak_repairs (user_id, habit_id, challenge_id, date_str, reason, xp_cost, status, approvals_required, applied_at)
    values (uid, p_habit_id, null, p_date_str, trim(p_reason), p_xp_cost, 'applied', 0, now())
    returning id into v_id;
    return v_id;
  end if;

  -- Group: create pending request, do not charge until approvals reached.
  insert into public.streak_repairs (user_id, habit_id, challenge_id, date_str, reason, xp_cost, status, approvals_required)
  values (uid, p_habit_id, p_challenge_id, p_date_str, trim(p_reason), p_xp_cost, 'pending', greatest(1, coalesce(p_approvals_required, 2)))
  returning id into v_id;

  -- Notify other members (best-effort).
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

-- Vote on a pending repair request. Applies when approvals threshold reached.
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

