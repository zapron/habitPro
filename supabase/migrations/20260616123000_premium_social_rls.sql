-- Habit Plus: server-side gates for social surfaces (aligns with browse-only UI + `profiles.is_premium`).

create or replace function public.profile_is_premium(uid uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce((select p.is_premium from public.profiles p where p.id = uid), false);
$$;

revoke all on function public.profile_is_premium(uuid) from public;
grant execute on function public.profile_is_premium(uuid) to authenticated;

-- Community wins + cheers
drop policy if exists "community_wins_insert_own" on public.community_wins;
drop policy if exists "community_wins_update_own" on public.community_wins;

create policy "community_wins_insert_own"
  on public.community_wins for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and public.profile_is_premium(auth.uid())
  );

create policy "community_wins_update_own"
  on public.community_wins for update
  to authenticated
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and public.profile_is_premium(auth.uid())
  );

drop policy if exists "community_win_cheers_insert_own" on public.community_win_cheers;

create policy "community_win_cheers_insert_own"
  on public.community_win_cheers for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and public.profile_is_premium(auth.uid())
  );

-- Preset nudges (direct inserts) require Plus; custom_note remains RPC-only.
drop policy if exists "challenge_nudges_insert_sender_member" on public.challenge_nudges;

create policy "challenge_nudges_insert_sender_member"
  on public.challenge_nudges for insert
  with check (
    auth.uid() = from_user_id
    and public.user_is_challenge_member(challenge_id, auth.uid())
    and public.user_is_challenge_member(challenge_id, to_user_id)
    and kind is distinct from 'custom_note'
    and public.profile_is_premium(auth.uid())
  );

drop policy if exists "challenge_groups_insert_creator" on public.challenge_groups;

create policy "challenge_groups_insert_creator"
  on public.challenge_groups for insert
  with check (
    auth.uid() = creator_id
    and public.profile_is_premium(auth.uid())
  );

drop policy if exists "challenge_invites_insert_inviter" on public.challenge_invites;

create policy "challenge_invites_insert_inviter"
  on public.challenge_invites for insert
  with check (
    auth.uid() = inviter_id
    and public.user_is_challenge_member(challenge_invites.challenge_id, auth.uid())
    and public.profile_is_premium(auth.uid())
  );

drop policy if exists "challenge_members_insert_self_or_creator" on public.challenge_members;

create policy "challenge_members_insert_self_or_creator"
  on public.challenge_members for insert
  with check (
    public.profile_is_premium(auth.uid())
    and (
      auth.uid() = user_id
      or exists (
        select 1
        from public.challenge_groups g
        where g.id = challenge_id
          and g.creator_id = auth.uid()
      )
    )
  );

-- Habits: cannot create/update own row to `public` without Plus.
drop policy if exists "habits_insert_own" on public.habits;
drop policy if exists "habits_update_own" on public.habits;

create policy "habits_insert_own"
  on public.habits for insert
  with check (
    auth.uid() = user_id
    and (
      coalesce(visibility, 'solo') is distinct from 'public'
      or public.profile_is_premium(auth.uid())
    )
  );

create policy "habits_update_own"
  on public.habits for update
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and (
      coalesce(visibility, 'solo') is distinct from 'public'
      or public.profile_is_premium(auth.uid())
    )
  );

-- Mini missions: same visibility rule as habits.
drop policy if exists "mini_missions_all_own" on public.mini_missions;

create policy "mini_missions_select_own"
  on public.mini_missions for select
  using (auth.uid() = user_id);

create policy "mini_missions_insert_own"
  on public.mini_missions for insert
  with check (
    auth.uid() = user_id
    and (
      coalesce(visibility, 'solo') is distinct from 'public'
      or public.profile_is_premium(auth.uid())
    )
  );

create policy "mini_missions_update_own"
  on public.mini_missions for update
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and (
      coalesce(visibility, 'solo') is distinct from 'public'
      or public.profile_is_premium(auth.uid())
    )
  );

create policy "mini_missions_delete_own"
  on public.mini_missions for delete
  using (auth.uid() = user_id);
