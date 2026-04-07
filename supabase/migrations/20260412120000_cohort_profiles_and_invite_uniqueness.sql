-- Cohort: allow reading usernames of users who share a challenge with you.
-- Invites: only one *pending* invite per (challenge, invitee); allow new invite after decline.

alter table public.challenge_invites
  drop constraint if exists challenge_invites_challenge_id_invitee_id_key;

create unique index if not exists challenge_invites_one_pending_per_challenge_invitee
  on public.challenge_invites (challenge_id, invitee_id)
  where (status = 'pending');

create policy "profiles_select_cohort_peer"
  on public.profiles for select
  using (
    exists (
      select 1
      from public.challenge_members m_self
      join public.challenge_members m_peer
        on m_self.challenge_id = m_peer.challenge_id
      where m_self.user_id = auth.uid()
        and m_peer.user_id = profiles.id
    )
  );
