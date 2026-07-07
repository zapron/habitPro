-- Phase 1 hardening:
-- - Move destructive mission cleanup into server-side RPCs.
-- - Make group invite accept/decline atomic.
-- - Lock streak repair voting so XP cannot be double-charged.
-- - Remove direct client access to the generic notification insert helper.

create or replace function public.rpc_delete_habit_v1(
  p_habit_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if p_habit_id is null or length(trim(p_habit_id)) = 0 then
    return;
  end if;

  delete from public.community_wins
  where user_id = uid
    and feed_source = 'habit_streak'
    and mini_mission_id like ('habitwin:' || p_habit_id || ':%');

  delete from public.streak_repairs
  where user_id = uid
    and habit_id = p_habit_id;

  delete from public.habits
  where user_id = uid
    and id = p_habit_id;
end;
$$;

grant execute on function public.rpc_delete_habit_v1(text) to authenticated;

create or replace function public.rpc_reset_habit_artifacts_v1(
  p_habit_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_is_group boolean := false;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if p_habit_id is null or length(trim(p_habit_id)) = 0 then
    return;
  end if;

  select h.challenge_group_id is not null
    into v_is_group
  from public.habits h
  where h.user_id = uid
    and h.id = p_habit_id;

  if coalesce(v_is_group, false) then
    raise exception 'group_habit_reset_not_allowed';
  end if;

  delete from public.community_wins
  where user_id = uid
    and feed_source = 'habit_streak'
    and mini_mission_id like ('habitwin:' || p_habit_id || ':%');

  delete from public.streak_repairs
  where user_id = uid
    and habit_id = p_habit_id;
end;
$$;

grant execute on function public.rpc_reset_habit_artifacts_v1(text) to authenticated;

create or replace function public.rpc_delete_mini_mission_v1(
  p_mini_mission_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_live_squad_id uuid;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if p_mini_mission_id is null or length(trim(p_mini_mission_id)) = 0 then
    return;
  end if;

  select m.live_squad_id
    into v_live_squad_id
  from public.mini_missions m
  where m.user_id = uid
    and m.id = p_mini_mission_id;

  if v_live_squad_id is not null then
    raise exception 'live_mini_delete_not_allowed';
  end if;

  delete from public.community_wins
  where user_id = uid
    and mini_mission_id = p_mini_mission_id;

  delete from public.mini_missions
  where user_id = uid
    and id = p_mini_mission_id;
end;
$$;

grant execute on function public.rpc_delete_mini_mission_v1(text) to authenticated;

create or replace function public.rpc_send_challenge_invite_v1(
  p_challenge_id uuid,
  p_invitee_user_id uuid
)
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

grant execute on function public.rpc_send_challenge_invite_v1(uuid, uuid) to authenticated;

create or replace function public.rpc_accept_challenge_invite_v1(
  p_invite_id uuid,
  p_habit_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_invite public.challenge_invites%rowtype;
  v_invitee_username text;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if p_invite_id is null or p_habit_id is null or length(trim(p_habit_id)) = 0 then
    raise exception 'invalid_invite_accept';
  end if;
  if not public.profile_is_premium(uid) then
    raise exception 'premium_required';
  end if;

  select *
    into v_invite
  from public.challenge_invites
  where id = p_invite_id
  for update;

  if v_invite.id is null then
    raise exception 'invite_not_found';
  end if;
  if v_invite.invitee_id <> uid then
    raise exception 'not_invitee';
  end if;
  if v_invite.status <> 'pending' then
    raise exception 'invite_not_pending';
  end if;

  if not exists (
    select 1
    from public.habits h
    where h.user_id = uid
      and h.id = p_habit_id
      and h.challenge_group_id = v_invite.challenge_id
  ) then
    raise exception 'habit_not_ready';
  end if;

  insert into public.challenge_members (challenge_id, user_id, habit_id, role)
  values (v_invite.challenge_id, uid, p_habit_id, 'member')
  on conflict (challenge_id, user_id) do update
    set habit_id = excluded.habit_id,
        role = excluded.role;

  update public.challenge_invites
  set status = 'accepted'
  where id = v_invite.id;

  select nullif(trim(lower(username::text)), '')
    into v_invitee_username
  from public.profiles
  where id = uid;

  perform public.rpc_insert_notification(
    v_invite.inviter_id,
    'challenge_invite_accepted',
    jsonb_build_object(
      'challenge_id', v_invite.challenge_id,
      'invite_id', v_invite.id,
      'invitee_id', uid,
      'invitee_username', v_invitee_username,
      'habit_id', p_habit_id
    )
  );
end;
$$;

grant execute on function public.rpc_accept_challenge_invite_v1(uuid, text) to authenticated;

create or replace function public.rpc_decline_challenge_invite_v1(
  p_invite_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_invite public.challenge_invites%rowtype;
  v_invitee_username text;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if p_invite_id is null then
    raise exception 'invalid_invite';
  end if;

  select *
    into v_invite
  from public.challenge_invites
  where id = p_invite_id
  for update;

  if v_invite.id is null then
    raise exception 'invite_not_found';
  end if;
  if v_invite.invitee_id <> uid then
    raise exception 'not_invitee';
  end if;
  if v_invite.status <> 'pending' then
    return;
  end if;

  update public.challenge_invites
  set status = 'declined'
  where id = v_invite.id;

  select nullif(trim(lower(username::text)), '')
    into v_invitee_username
  from public.profiles
  where id = uid;

  perform public.rpc_insert_notification(
    v_invite.inviter_id,
    'challenge_invite_declined',
    jsonb_build_object(
      'challenge_id', v_invite.challenge_id,
      'invite_id', v_invite.id,
      'invitee_id', uid,
      'invitee_username', v_invitee_username
    )
  );
end;
$$;

grant execute on function public.rpc_decline_challenge_invite_v1(uuid) to authenticated;

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

  select *
    into v_r
  from public.streak_repairs
  where id = p_repair_id
  for update;

  if v_r.id is null then
    raise exception 'not_found';
  end if;
  if v_r.challenge_id is null then
    raise exception 'not_group_repair';
  end if;
  if not public.profile_is_premium(uid) then
    raise exception 'premium_required';
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

  select count(*) into v_approves
  from public.streak_repair_votes
  where repair_id = v_r.id and vote = 'approve';

  select count(*) into v_declines
  from public.streak_repair_votes
  where repair_id = v_r.id and vote = 'decline';

  if v_declines >= 1 then
    update public.streak_repairs
    set status = 'declined'
    where id = v_r.id
      and status = 'pending';

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
      update public.streak_repairs
      set status = 'declined'
      where id = v_r.id
        and status = 'pending';

      insert into public.notifications (user_id, type, payload)
      values (
        v_r.user_id,
        'streak_repair_result',
        jsonb_build_object(
          'type','streak_repair_result',
          'repair_id', v_r.id,
          'status','declined',
          'reason','insufficient_xp',
          'challenge_id', v_r.challenge_id,
          'habit_id', v_r.habit_id,
          'date_str', v_r.date_str
        )
      );
      return;
    end if;

    update public.profiles
    set xp = xp - v_r.xp_cost,
        updated_at = now()
    where id = v_r.user_id;

    update public.streak_repairs
    set status = 'applied',
        applied_at = now()
    where id = v_r.id
      and status = 'pending';

    perform public._rpc_append_habit_completed_date(v_r.user_id, v_r.habit_id, v_r.date_str);
    perform public._rpc_merge_repair_streak_memory(v_r.user_id, v_r.habit_id, v_r.date_str, 'squad');

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

-- Backward compatibility:
-- Keep direct execute on rpc_insert_notification for old installed app builds.
-- Revoke this in a later cleanup migration after the new RPC-backed client has
-- been released to production and enough users have updated.
