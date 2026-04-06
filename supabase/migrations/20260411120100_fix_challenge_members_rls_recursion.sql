-- Fix 42P17: infinite recursion in policy for relation "challenge_members".
-- RLS policies must not SELECT challenge_members in a way that re-invokes the same policy.
-- See user_is_challenge_member() in 20260411120000_group_habit_challenges.sql.

create or replace function public.user_is_challenge_member(p_challenge_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.challenge_members m
    where m.challenge_id = p_challenge_id
      and m.user_id = p_user_id
  );
$$;

revoke all on function public.user_is_challenge_member(uuid, uuid) from public;
grant execute on function public.user_is_challenge_member(uuid, uuid) to authenticated;

drop policy if exists "challenge_groups_select_member" on public.challenge_groups;
create policy "challenge_groups_select_member"
  on public.challenge_groups for select
  using (
    auth.uid() = creator_id
    or public.user_is_challenge_member(id, auth.uid())
  );

drop policy if exists "challenge_members_select_participant" on public.challenge_members;
create policy "challenge_members_select_participant"
  on public.challenge_members for select
  using (public.user_is_challenge_member(challenge_id, auth.uid()));

drop policy if exists "challenge_invites_insert_inviter" on public.challenge_invites;
create policy "challenge_invites_insert_inviter"
  on public.challenge_invites for insert
  with check (
    auth.uid() = inviter_id
    and public.user_is_challenge_member(challenge_invites.challenge_id, auth.uid())
  );

drop policy if exists "habits_select_own_or_cohort" on public.habits;
create policy "habits_select_own_or_cohort"
  on public.habits for select
  using (
    auth.uid() = user_id
    or (
      challenge_group_id is not null
      and public.user_is_challenge_member(habits.challenge_group_id, auth.uid())
    )
  );

drop policy if exists "challenge_memory_comments_participant" on public.challenge_memory_comments;
create policy "challenge_memory_comments_participant"
  on public.challenge_memory_comments for all
  using (
    public.user_is_challenge_member(challenge_memory_comments.challenge_id, auth.uid())
  )
  with check (
    auth.uid() = author_id
    and public.user_is_challenge_member(challenge_memory_comments.challenge_id, auth.uid())
  );

drop policy if exists "challenge_memory_likes_participant" on public.challenge_memory_likes;
create policy "challenge_memory_likes_participant"
  on public.challenge_memory_likes for all
  using (
    public.user_is_challenge_member(challenge_memory_likes.challenge_id, auth.uid())
  )
  with check (
    auth.uid() = liker_id
    and public.user_is_challenge_member(challenge_memory_likes.challenge_id, auth.uid())
  );
