-- Leave a group mission: remove challenge_members row and delete the user's habit (same transaction).
-- Also tighten challenge_groups SELECT so ex-creators cannot read a group by creator_id alone after leaving.

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

  delete from public.challenge_members
  where challenge_id = p_challenge_id and user_id = v_uid;

  delete from public.habits
  where user_id = v_uid and id = v_habit_id;
end;
$$;

revoke all on function public.rpc_leave_challenge(uuid) from public;
grant execute on function public.rpc_leave_challenge(uuid) to authenticated;

drop policy if exists "challenge_groups_select_member" on public.challenge_groups;
create policy "challenge_groups_select_member"
  on public.challenge_groups for select
  using (public.user_is_challenge_member(id, auth.uid()));
