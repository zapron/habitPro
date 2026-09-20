-- Self-serve "request to join" for group mission invite links: a non-member who opens
-- a shared mission link (or taps a habit name from Community) can ask to join. Approval
-- mirrors the existing streak-repair squad-vote mechanism exactly (any 2 current members
-- approve, any 1 decline vetoes, threshold scales down for a lone-member mission) rather
-- than inventing a new governance rule. Approval reuses the existing challenge_invites
-- accept flow (with its own premium gate) instead of duplicating membership/habit-creation
-- logic — reaching the approval threshold just inserts a normal pending invite row.
--
-- Deliberately NOT built yet, left room for later: a creator-unilateral override (approve
-- or decline alone, bypassing the vote threshold) and a "remove member" action. Both are
-- additive — a check at the top of the vote RPC and a new RPC respectively — and don't
-- require reshaping anything below.

-- challenge_members rows are not reliably present for the creator (older challenges in
-- particular can lack one) — challenge_groups_select_member's RLS already special-cases
-- creator_id for this reason. Anything here that needs "is this uid part of the cohort"
-- must use this, not bare user_is_challenge_member, or the creator can get locked out of
-- their own mission's join requests.
create or replace function public.user_is_challenge_participant(p_challenge_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.challenge_groups g
    where g.id = p_challenge_id and g.creator_id = p_user_id
  ) or public.user_is_challenge_member(p_challenge_id, p_user_id);
$$;

revoke all on function public.user_is_challenge_participant(uuid, uuid) from public;
grant execute on function public.user_is_challenge_participant(uuid, uuid) to authenticated;

create table if not exists public.challenge_join_requests (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenge_groups (id) on delete cascade,
  requester_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  approvals_required integer not null default 2,
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  unique (challenge_id, requester_id)
);

create index if not exists challenge_join_requests_challenge_idx
  on public.challenge_join_requests (challenge_id, status);

create table if not exists public.challenge_join_request_votes (
  request_id uuid not null references public.challenge_join_requests (id) on delete cascade,
  voter_id uuid not null references auth.users (id) on delete cascade,
  vote text not null check (vote in ('approve', 'decline')),
  created_at timestamptz not null default now(),
  primary key (request_id, voter_id)
);

alter table public.challenge_join_requests enable row level security;
alter table public.challenge_join_request_votes enable row level security;

create policy "challenge_join_requests_select_party"
  on public.challenge_join_requests for select
  using (
    auth.uid() = requester_id
    or public.user_is_challenge_participant(challenge_id, auth.uid())
  );

create policy "challenge_join_request_votes_select_member"
  on public.challenge_join_request_votes for select
  using (
    exists (
      select 1
      from public.challenge_join_requests r
      where r.id = challenge_join_request_votes.request_id
        and public.user_is_challenge_participant(r.challenge_id, auth.uid())
    )
  );

-- All writes go through the SECURITY DEFINER RPCs below (multi-step validation +
-- side-effect inserts), so no insert/update policy is needed on either table here.

-- Minimal, RLS-bypassing preview for someone who is NOT yet a member — challenge_groups'
-- own RLS only allows members to see the row at all, so a link-opener with no membership
-- would otherwise see nothing to decide on.
create or replace function public.rpc_challenge_public_preview_v1(p_challenge_id uuid)
returns table (
  challenge_id uuid,
  title text,
  creator_username citext,
  creator_display_name text,
  member_count integer,
  my_membership_status text,
  my_request_status text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  return query
  select
    g.id,
    coalesce(nullif(trim(g.habit_template->>'title'), ''), 'Group mission'),
    p.username,
    p.display_name,
    (
      select count(*)::integer from (
        select user_id from public.challenge_members m where m.challenge_id = g.id
        union
        select g.creator_id
      ) participants
    ),
    case
      when g.creator_id = uid then 'creator'
      when public.user_is_challenge_member(g.id, uid) then 'member'
      else 'none'
    end,
    (
      select r.status
      from public.challenge_join_requests r
      where r.challenge_id = g.id and r.requester_id = uid
      order by r.created_at desc
      limit 1
    )
  from public.challenge_groups g
  left join public.profiles p on p.id = g.creator_id
  where g.id = p_challenge_id;
end;
$$;

revoke all on function public.rpc_challenge_public_preview_v1(uuid) from public;
grant execute on function public.rpc_challenge_public_preview_v1(uuid) to authenticated;

create or replace function public.rpc_request_join_challenge_v1(p_challenge_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_request_id uuid;
  v_creator_id uuid;
  v_member_count integer;
  v_requester_username text;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if p_challenge_id is null then
    raise exception 'invalid_request';
  end if;
  if not exists (select 1 from public.profiles where id = uid and username is not null) then
    raise exception 'username_required';
  end if;
  if public.user_is_challenge_member(p_challenge_id, uid) then
    raise exception 'already_joined';
  end if;

  select creator_id into v_creator_id from public.challenge_groups where id = p_challenge_id;
  if v_creator_id is null then
    raise exception 'challenge_not_found';
  end if;
  if v_creator_id = uid then
    raise exception 'cannot_request_own_challenge';
  end if;

  select count(*)::integer into v_member_count
  from (
    select user_id from public.challenge_members where challenge_id = p_challenge_id
    union
    select v_creator_id
  ) participants;

  insert into public.challenge_join_requests (
    challenge_id, requester_id, status, approvals_required, responded_at
  )
  values (
    p_challenge_id, uid, 'pending', greatest(1, least(2, coalesce(v_member_count, 1))), null
  )
  on conflict (challenge_id, requester_id) do update
    set status = 'pending',
        approvals_required = excluded.approvals_required,
        responded_at = null,
        created_at = now()
    where public.challenge_join_requests.status <> 'pending'
  returning id into v_request_id;

  if v_request_id is null then
    raise exception 'request_already_pending';
  end if;

  delete from public.challenge_join_request_votes where request_id = v_request_id;

  select nullif(trim(lower(username::text)), '')
    into v_requester_username
  from public.profiles
  where id = uid;

  perform public.rpc_insert_notification(
    v_creator_id,
    'challenge_join_request',
    jsonb_build_object(
      'challenge_id', p_challenge_id,
      'request_id', v_request_id,
      'requester_id', uid,
      'requester_username', v_requester_username
    )
  );

  return v_request_id;
end;
$$;

revoke all on function public.rpc_request_join_challenge_v1(uuid) from public;
grant execute on function public.rpc_request_join_challenge_v1(uuid) to authenticated;

create or replace function public.rpc_list_pending_join_requests_v1(p_challenge_id uuid)
returns table (
  id uuid,
  requester_id uuid,
  requester_username citext,
  requester_display_name text,
  approvals_required integer,
  approve_count integer,
  decline_count integer,
  my_vote text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if not public.user_is_challenge_participant(p_challenge_id, uid) then
    raise exception 'not a member';
  end if;

  return query
  select
    r.id,
    r.requester_id,
    p.username,
    p.display_name,
    r.approvals_required,
    (select count(*)::integer from public.challenge_join_request_votes v where v.request_id = r.id and v.vote = 'approve'),
    (select count(*)::integer from public.challenge_join_request_votes v where v.request_id = r.id and v.vote = 'decline'),
    (select v.vote from public.challenge_join_request_votes v where v.request_id = r.id and v.voter_id = uid),
    r.created_at
  from public.challenge_join_requests r
  left join public.profiles p on p.id = r.requester_id
  where r.challenge_id = p_challenge_id and r.status = 'pending'
  order by r.created_at asc;
end;
$$;

revoke all on function public.rpc_list_pending_join_requests_v1(uuid) from public;
grant execute on function public.rpc_list_pending_join_requests_v1(uuid) to authenticated;

-- Mirrors rpc_vote_streak_repair exactly: any current member other than the requester can
-- vote, one decline vetoes immediately, reaching approvals_required approvals passes it.
create or replace function public.rpc_vote_challenge_join_request_v1(
  p_request_id uuid,
  p_vote text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_r public.challenge_join_requests%rowtype;
  v_approves integer;
  v_declines integer;
  v_requester_username text;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if p_vote not in ('approve', 'decline') then
    raise exception 'invalid_vote';
  end if;

  select * into v_r from public.challenge_join_requests where id = p_request_id for update;
  if v_r.id is null then
    raise exception 'request_not_found';
  end if;
  if not public.profile_is_premium(uid) then
    raise exception 'premium_required';
  end if;
  if not public.user_is_challenge_participant(v_r.challenge_id, uid) then
    raise exception 'not a member';
  end if;
  if uid = v_r.requester_id then
    raise exception 'cannot vote';
  end if;
  if v_r.status <> 'pending' then
    return;
  end if;

  insert into public.challenge_join_request_votes (request_id, voter_id, vote)
  values (v_r.id, uid, p_vote)
  on conflict (request_id, voter_id) do update set vote = excluded.vote;

  select count(*) into v_approves
  from public.challenge_join_request_votes
  where request_id = v_r.id and vote = 'approve';

  select count(*) into v_declines
  from public.challenge_join_request_votes
  where request_id = v_r.id and vote = 'decline';

  if v_declines >= 1 then
    update public.challenge_join_requests
    set status = 'declined', responded_at = now()
    where id = v_r.id and status = 'pending';

    perform public.rpc_insert_notification(
      v_r.requester_id,
      'challenge_join_request_result',
      jsonb_build_object(
        'challenge_id', v_r.challenge_id,
        'request_id', v_r.id,
        'status', 'declined'
      )
    );
    return;
  end if;

  if v_approves >= v_r.approvals_required then
    update public.challenge_join_requests
    set status = 'approved', responded_at = now()
    where id = v_r.id and status = 'pending';

    -- challenge_invites' real uniqueness is a PARTIAL index (one *pending* row per
    -- challenge+invitee — see 20260412120000_cohort_profiles_and_invite_uniqueness.sql),
    -- not a plain table constraint, so the ON CONFLICT target has to match that predicate.
    insert into public.challenge_invites (challenge_id, inviter_id, invitee_id, status)
    select v_r.challenge_id, g.creator_id, v_r.requester_id, 'pending'
    from public.challenge_groups g
    where g.id = v_r.challenge_id
    on conflict (challenge_id, invitee_id) where (status = 'pending') do update
      set inviter_id = excluded.inviter_id;

    -- Notify the requester using the CREATOR's username (they're the nominal
    -- inviter on the resulting challenge_invites row), not the requester's own.
    select nullif(trim(lower(p.username::text)), '')
      into v_requester_username
    from public.challenge_groups g
    join public.profiles p on p.id = g.creator_id
    where g.id = v_r.challenge_id;

    perform public.rpc_insert_notification(
      v_r.requester_id,
      'challenge_invite',
      jsonb_build_object(
        'challenge_id', v_r.challenge_id,
        'inviter_id', uid,
        'inviter_username', v_requester_username
      )
    );
  end if;
end;
$$;

revoke all on function public.rpc_vote_challenge_join_request_v1(uuid, text) from public;
grant execute on function public.rpc_vote_challenge_join_request_v1(uuid, text) to authenticated;
