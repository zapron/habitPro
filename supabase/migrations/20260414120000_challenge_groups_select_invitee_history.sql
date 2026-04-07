-- Invitees need challenge_groups.title after an invite is declined (or accepted before join).
-- Pending-only policy hid the row once status != pending; broaden to any invite row for this user.

drop policy if exists "challenge_groups_select_pending_invitee" on public.challenge_groups;

create policy "challenge_groups_select_invitee"
  on public.challenge_groups for select
  using (
    exists (
      select 1 from public.challenge_invites i
      where i.challenge_id = challenge_groups.id
        and i.invitee_id = auth.uid()
    )
  );
