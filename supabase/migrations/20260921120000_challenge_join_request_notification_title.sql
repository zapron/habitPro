-- The join-request notifications carried no mission title, only a challenge_id —
-- both the push-notification text and the in-app list only had "someone wants to
-- join," nothing about what. Adds challenge_title to both payloads so the client
-- (and a later notify-push update) can say "@user wants to join <mission>."

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

revoke all on function public.rpc_request_join_challenge_v1(uuid) from public;
grant execute on function public.rpc_request_join_challenge_v1(uuid) to authenticated;

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
  v_challenge_title text;
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

  select coalesce(nullif(trim(habit_template->>'title'), ''), 'a mission')
    into v_challenge_title
  from public.challenge_groups
  where id = v_r.challenge_id;

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
        'challenge_title', v_challenge_title,
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

    insert into public.challenge_invites (challenge_id, inviter_id, invitee_id, status)
    select v_r.challenge_id, g.creator_id, v_r.requester_id, 'pending'
    from public.challenge_groups g
    where g.id = v_r.challenge_id
    on conflict (challenge_id, invitee_id) where (status = 'pending') do update
      set inviter_id = excluded.inviter_id;

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
