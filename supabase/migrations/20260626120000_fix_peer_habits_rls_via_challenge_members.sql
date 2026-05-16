-- Fix: peer habits created on older app versions may have challenge_group_id = null
-- on the habits row even though challenge_members correctly links them.
-- The old policy blocked reads for those rows entirely.
-- New policy adds a third branch: readable if the habit_id appears in challenge_members
-- for a challenge the viewer belongs to.

create index if not exists challenge_members_habit_user_idx
  on public.challenge_members (habit_id, user_id, challenge_id);

drop policy if exists "habits_select_own_or_cohort" on public.habits;

create policy "habits_select_own_or_cohort"
  on public.habits for select
  using (
    -- own habit
    auth.uid() = user_id
    -- peer habit with challenge_group_id populated (current app versions)
    or (
      challenge_group_id is not null
      and public.user_is_challenge_member(habits.challenge_group_id, auth.uid())
    )
    -- peer habit where challenge_group_id is missing but the habit is linked
    -- via challenge_members (older app versions that didn't write the column)
    or exists (
      select 1
      from public.challenge_members cm
      where cm.habit_id = habits.id::text
        and cm.user_id = habits.user_id
        and public.user_is_challenge_member(cm.challenge_id, auth.uid())
    )
  );
