-- Phase 1 of docs/GROUP_CHALLENGE_GOVERNANCE.md: kick-out + sole-admin authority.
-- Creator-only moderation authority is new and additive — it does NOT replace
-- the existing peer-vote join-request system (challenge_join_requests), which
-- stays exactly as-is for admission decisions. This migration only covers
-- removal/moderation, a deliberately different kind of decision (Phase 0,
-- confirmed with the user: coexistence, not replacement).

-- Permanent re-join blocklist. A removed member can never request to join or
-- be re-invited to this same challenge again, short of a manual DB fix.
create table public.challenge_removed_members (
  challenge_id uuid not null references public.challenge_groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  removed_at timestamptz not null default now(),
  removed_by uuid not null references public.profiles(id),
  primary key (challenge_id, user_id)
);

alter table public.challenge_removed_members enable row level security;

-- Only the challenge's creator can see who they've removed — a removed user
-- doesn't get to browse this list (they get their own removal via a private
-- notification instead, not by querying this table).
create policy challenge_removed_members_select_creator
  on public.challenge_removed_members
  for select
  to authenticated
  using (
    exists (
      select 1 from public.challenge_groups g
      where g.id = challenge_removed_members.challenge_id
        and g.creator_id = (select auth.uid())
    )
  );

-- No insert/update/delete policy — every write happens through
-- rpc_remove_challenge_member_v1 (security definer), never directly.

create or replace function public.rpc_remove_challenge_member_v1(
  p_challenge_id uuid,
  p_target_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_creator_id uuid;
  v_challenge_title text;
  v_creator_username text;
  v_target_habit_id text;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if p_challenge_id is null or p_target_user_id is null then
    raise exception 'invalid_request';
  end if;

  select creator_id, coalesce(nullif(trim(habit_template->>'title'), ''), 'a mission')
    into v_creator_id, v_challenge_title
  from public.challenge_groups
  where id = p_challenge_id;

  if v_creator_id is null then
    raise exception 'challenge_not_found';
  end if;
  if v_creator_id <> uid then
    raise exception 'creator_only';
  end if;
  -- Creator removal is a separate, harder problem (ownership transfer) —
  -- explicitly out of scope here, see docs/GROUP_CHALLENGE_GOVERNANCE.md.
  if p_target_user_id = v_creator_id then
    raise exception 'cannot_remove_creator';
  end if;

  delete from public.challenge_members
  where challenge_id = p_challenge_id
    and user_id = p_target_user_id;

  -- Sever the sync link and the room rules that came with it —
  -- completed_dates/streak_memories/streak/visibility all survive
  -- untouched. Room rules are a group-mission-only concept (Phase 2/3);
  -- once this is the member's own personal mission, it must behave like
  -- any other solo habit — "Just mark done" back, no forced note/photo.
  -- habit_id captured so the removal notification can deep-link straight to
  -- it — the removed user is no longer a challenge participant, so sending
  -- them to /challenge/[id] would just land on a "not a member" screen for
  -- a challenge they're deliberately no longer part of.
  update public.habits
  set challenge_group_id = null,
      require_note = null,
      require_photo = null
  where user_id = p_target_user_id
    and challenge_group_id = p_challenge_id
  returning id into v_target_habit_id;

  insert into public.challenge_removed_members (challenge_id, user_id, removed_by)
  values (p_challenge_id, p_target_user_id, uid)
  on conflict (challenge_id, user_id) do update
    set removed_at = now(),
        removed_by = excluded.removed_by;

  select nullif(trim(lower(username::text)), '')
    into v_creator_username
  from public.profiles
  where id = uid;

  -- Private to the removed member only — never broadcast to the rest of the
  -- group (the user's explicit "silently, privately" requirement).
  perform public.rpc_insert_notification(
    p_target_user_id,
    'challenge_removed',
    jsonb_build_object(
      'challenge_id', p_challenge_id,
      'challenge_title', v_challenge_title,
      'removed_by', uid,
      'removed_by_username', v_creator_username,
      'habit_id', v_target_habit_id
    )
  );
end;
$$;

grant execute on function public.rpc_remove_challenge_member_v1(uuid, uuid) to authenticated;

-- Guard 1: block a previously-removed user from requesting to join again.
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
  v_challenge_title text;
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
  if exists (
    select 1 from public.challenge_removed_members
    where challenge_id = p_challenge_id and user_id = uid
  ) then
    raise exception 'previously_removed';
  end if;

  select creator_id, coalesce(nullif(trim(habit_template->>'title'), ''), 'a mission')
    into v_creator_id, v_challenge_title
  from public.challenge_groups
  where id = p_challenge_id;
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
      'challenge_title', v_challenge_title,
      'request_id', v_request_id,
      'requester_id', uid,
      'requester_username', v_requester_username
    )
  );

  return v_request_id;
end;
$$;

-- Guard 2: block sending a new invite to a previously-removed user — fail
-- fast at invite time rather than letting it through and failing at accept.
create or replace function public.rpc_send_challenge_invite_v1(p_challenge_id uuid, p_invitee_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_invite_id uuid;
  v_latest_status text;
  v_inviter_username text;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if p_challenge_id is null or p_invitee_user_id is null then
    raise exception 'invalid_invite';
  end if;
  if uid = p_invitee_user_id then
    raise exception 'cannot_invite_self';
  end if;
  if not public.profile_is_premium(uid) then
    raise exception 'premium_required';
  end if;
  if not public.user_is_challenge_member(p_challenge_id, uid) then
    raise exception 'not a member';
  end if;
  if public.user_is_challenge_member(p_challenge_id, p_invitee_user_id) then
    raise exception 'already_joined';
  end if;
  if exists (
    select 1 from public.challenge_removed_members
    where challenge_id = p_challenge_id and user_id = p_invitee_user_id
  ) then
    raise exception 'previously_removed';
  end if;

  select ci.status
    into v_latest_status
  from public.challenge_invites ci
  where ci.challenge_id = p_challenge_id
    and ci.invitee_id = p_invitee_user_id
  order by ci.created_at desc
  limit 1;

  if v_latest_status = 'pending' then
    raise exception 'invite_already_pending';
  end if;

  insert into public.challenge_invites (
    challenge_id,
    inviter_id,
    invitee_id,
    status
  )
  values (
    p_challenge_id,
    uid,
    p_invitee_user_id,
    'pending'
  )
  returning id into v_invite_id;

  select nullif(trim(lower(username::text)), '')
    into v_inviter_username
  from public.profiles
  where id = uid;

  perform public.rpc_insert_notification(
    p_invitee_user_id,
    'challenge_invite',
    jsonb_build_object(
      'challenge_id', p_challenge_id,
      'invite_id', v_invite_id,
      'inviter_id', uid,
      'inviter_username', v_inviter_username
    )
  );

  return v_invite_id;
end;
$$;
