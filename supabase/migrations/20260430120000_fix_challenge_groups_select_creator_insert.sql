-- challenge_groups SELECT was limited to user_is_challenge_member only (leave-mission migration).
-- createGroupChallengeFromHabit inserts the group row *before* challenge_members, so
-- INSERT ... RETURNING failed RLS: the creator could not read the new row until they were a member.
--
-- Allow SELECT when:
--   • user is a member, or
--   • user is creator AND (no membership rows yet — mid-create — OR they still have a membership row).
-- Ex-creators who left while others remain still cannot read (neither clause applies).

drop policy if exists "challenge_groups_select_member" on public.challenge_groups;

create policy "challenge_groups_select_member"
  on public.challenge_groups for select
  using (
    public.user_is_challenge_member(id, auth.uid())
    or (
      auth.uid() = creator_id
      and (
        not exists (
          select 1 from public.challenge_members m
          where m.challenge_id = challenge_groups.id
        )
        or exists (
          select 1 from public.challenge_members m
          where m.challenge_id = challenge_groups.id
            and m.user_id = auth.uid()
        )
      )
    )
  );
