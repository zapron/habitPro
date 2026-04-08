-- Cohort members must see all pending invites for a challenge (any inviter) so the client
-- can block duplicate invites and show accurate "Pending" in the invite UI.

create policy "challenge_invites_select_challenge_member"
  on public.challenge_invites for select
  using (public.user_is_challenge_member(challenge_invites.challenge_id, auth.uid()));
