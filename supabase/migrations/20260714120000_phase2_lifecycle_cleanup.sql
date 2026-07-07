-- Phase 2 lifecycle cleanup:
-- - Keep habit delete/reset cleanup in one reusable helper.
-- - Make leaving a group mission remove the user's linked squad traces.
-- - Make direct deletion of a group-linked habit also remove the membership row.

create or replace function public._cleanup_habit_lifecycle_v1(
  p_user_id uuid,
  p_habit_id text,
  p_challenge_id uuid default null,
  p_remove_challenge_social boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_habit_id text := nullif(trim(coalesce(p_habit_id, '')), '');
begin
  if p_user_id is null then
    raise exception 'user required';
  end if;
  if v_habit_id is null then
    return;
  end if;

  delete from public.community_wins
  where user_id = p_user_id
    and feed_source = 'habit_streak'
    and mini_mission_id like ('habitwin:' || v_habit_id || ':%');

  delete from public.streak_repairs
  where user_id = p_user_id
    and habit_id = v_habit_id;

  if p_remove_challenge_social and p_challenge_id is not null then
    delete from public.challenge_memory_comments
    where challenge_id = p_challenge_id
      and (subject_user_id = p_user_id or author_id = p_user_id);

    delete from public.challenge_memory_likes
    where challenge_id = p_challenge_id
      and (subject_user_id = p_user_id or liker_id = p_user_id);

    delete from public.streak_repair_votes v
    using public.streak_repairs r
    where v.repair_id = r.id
      and r.challenge_id = p_challenge_id
      and v.voter_id = p_user_id;

    delete from public.challenge_nudges
    where challenge_id = p_challenge_id
      and (from_user_id = p_user_id or to_user_id = p_user_id);

    delete from public.challenge_activity
    where challenge_id = p_challenge_id
      and actor_user_id = p_user_id;
  end if;
end;
$$;

revoke all on function public._cleanup_habit_lifecycle_v1(uuid, text, uuid, boolean) from public;

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
  v_habit_id text := nullif(trim(coalesce(p_habit_id, '')), '');
  v_challenge_id uuid;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if v_habit_id is null then
    return;
  end if;

  select h.challenge_group_id
    into v_challenge_id
  from public.habits h
  where h.user_id = uid
    and h.id = v_habit_id;

  if v_challenge_id is not null then
    delete from public.challenge_members
    where challenge_id = v_challenge_id
      and user_id = uid
      and habit_id = v_habit_id;
  end if;

  perform public._cleanup_habit_lifecycle_v1(uid, v_habit_id, v_challenge_id, v_challenge_id is not null);

  delete from public.habits
  where user_id = uid
    and id = v_habit_id;
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
  v_habit_id text := nullif(trim(coalesce(p_habit_id, '')), '');
  v_is_group boolean := false;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if v_habit_id is null then
    return;
  end if;

  select h.challenge_group_id is not null
    into v_is_group
  from public.habits h
  where h.user_id = uid
    and h.id = v_habit_id;

  if coalesce(v_is_group, false) then
    raise exception 'group_habit_reset_not_allowed';
  end if;

  perform public._cleanup_habit_lifecycle_v1(uid, v_habit_id, null, false);
end;
$$;

grant execute on function public.rpc_reset_habit_artifacts_v1(text) to authenticated;

create or replace function public.rpc_leave_challenge(p_challenge_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_habit_id text;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select m.habit_id into v_habit_id
  from public.challenge_members m
  where m.challenge_id = p_challenge_id
    and m.user_id = v_uid;

  if v_habit_id is null then
    raise exception 'not a member of this mission';
  end if;

  perform public._cleanup_habit_lifecycle_v1(v_uid, v_habit_id, p_challenge_id, true);

  delete from public.challenge_members
  where challenge_id = p_challenge_id
    and user_id = v_uid;

  delete from public.habits
  where user_id = v_uid
    and id = v_habit_id;

  update public.challenge_groups
  set status = 'cancelled'
  where id = p_challenge_id
    and not exists (
      select 1
      from public.challenge_members m
      where m.challenge_id = p_challenge_id
    );
end;
$$;

revoke all on function public.rpc_leave_challenge(uuid) from public;
grant execute on function public.rpc_leave_challenge(uuid) to authenticated;
