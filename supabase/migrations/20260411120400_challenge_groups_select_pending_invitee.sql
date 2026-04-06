-- Invitees must read challenge_groups before they join (habit template, dates). Pending members are not in challenge_members yet.
create policy "challenge_groups_select_pending_invitee"
  on public.challenge_groups for select
  using (
    exists (
      select 1 from public.challenge_invites i
      where i.challenge_id = challenge_groups.id
        and i.invitee_id = auth.uid()
        and i.status = 'pending'
    )
  );
