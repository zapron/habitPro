-- Performance: fix 44 auth_rls_initplan advisor warnings + 9 unindexed foreign keys.
-- auth.uid() wrapped in (select auth.uid()) so Postgres evaluates it ONCE per query
-- (InitPlan) instead of once per row. Policy semantics are 100% identical.
-- Run: npm run db:push (or manually). Safe to re-run.

-- ============================================================
-- 1) Unindexed foreign keys (advisor: unindexed_foreign_keys)
-- ============================================================
create index if not exists challenge_invites_inviter_id_idx
  on public.challenge_invites (inviter_id);
create index if not exists challenge_memory_comments_author_id_idx
  on public.challenge_memory_comments (author_id);
create index if not exists challenge_memory_comments_subject_user_id_idx
  on public.challenge_memory_comments (subject_user_id);
create index if not exists challenge_memory_likes_liker_id_idx
  on public.challenge_memory_likes (liker_id);
create index if not exists challenge_memory_likes_subject_user_id_idx
  on public.challenge_memory_likes (subject_user_id);
create index if not exists challenge_nudges_activity_id_idx
  on public.challenge_nudges (activity_id);
create index if not exists challenge_nudges_from_user_id_idx
  on public.challenge_nudges (from_user_id);
create index if not exists challenge_nudges_to_user_id_idx
  on public.challenge_nudges (to_user_id);
create index if not exists streak_repair_votes_voter_id_idx
  on public.streak_repair_votes (voter_id);

-- ============================================================
-- 2) RLS initplan fixes (advisor: auth_rls_initplan)
-- ============================================================

-- profiles
alter policy profiles_select_own on public.profiles
  using ((select auth.uid()) = id);
alter policy profiles_insert_own on public.profiles
  with check ((select auth.uid()) = id);
alter policy profiles_update_own on public.profiles
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);
alter policy profiles_select_cohort_peer on public.profiles
  using (exists (
    select 1
    from public.challenge_members m_self
    join public.challenge_members m_peer on m_self.challenge_id = m_peer.challenge_id
    where m_self.user_id = (select auth.uid()) and m_peer.user_id = profiles.id
  ));

-- push_tokens
alter policy push_tokens_select_own on public.push_tokens
  using ((select auth.uid()) = user_id);
alter policy push_tokens_insert_own on public.push_tokens
  with check ((select auth.uid()) = user_id);
alter policy push_tokens_update_own on public.push_tokens
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
alter policy push_tokens_delete_own on public.push_tokens
  using ((select auth.uid()) = user_id);

-- notifications (ALL)
alter policy notifications_own on public.notifications
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- habits
alter policy habits_delete_own on public.habits
  using ((select auth.uid()) = user_id);
alter policy habits_insert_own on public.habits
  with check (
    ((select auth.uid()) = user_id)
    and (
      (coalesce(visibility, 'solo') is distinct from 'public')
      or exists (
        select 1 from public.profiles p
        where p.id = (select auth.uid()) and p.is_premium = true
      )
    )
  );
alter policy habits_update_own on public.habits
  using ((select auth.uid()) = user_id)
  with check (
    ((select auth.uid()) = user_id)
    and (
      (coalesce(visibility, 'solo') is distinct from 'public')
      or exists (
        select 1 from public.profiles p
        where p.id = (select auth.uid()) and p.is_premium = true
      )
    )
  );
alter policy habits_select_own_or_cohort on public.habits
  using (
    ((select auth.uid()) = user_id)
    or (
      challenge_group_id is not null
      and exists (
        select 1 from public.challenge_members cm
        where cm.challenge_id = habits.challenge_group_id
          and cm.user_id = (select auth.uid())
      )
    )
    or exists (
      select 1 from public.challenge_members cm
      where cm.habit_id = habits.id
        and cm.user_id = habits.user_id
        and exists (
          select 1 from public.challenge_members cm_self
          where cm_self.challenge_id = cm.challenge_id
            and cm_self.user_id = (select auth.uid())
        )
    )
  );

-- challenge_groups
alter policy challenge_groups_insert_creator on public.challenge_groups
  with check (
    ((select auth.uid()) = creator_id)
    and public.profile_is_premium((select auth.uid()))
  );
alter policy challenge_groups_update_creator on public.challenge_groups
  using ((select auth.uid()) = creator_id)
  with check ((select auth.uid()) = creator_id);
alter policy challenge_groups_select_invitee on public.challenge_groups
  using (exists (
    select 1 from public.challenge_invites i
    where i.challenge_id = challenge_groups.id
      and i.invitee_id = (select auth.uid())
  ));
alter policy challenge_groups_select_member on public.challenge_groups
  using (
    public.user_is_challenge_member(id, (select auth.uid()))
    or (
      ((select auth.uid()) = creator_id)
      and (
        not exists (
          select 1 from public.challenge_members m
          where m.challenge_id = challenge_groups.id
        )
        or exists (
          select 1 from public.challenge_members m
          where m.challenge_id = challenge_groups.id
            and m.user_id = (select auth.uid())
        )
      )
    )
  );

-- challenge_invites
alter policy challenge_invites_insert_inviter on public.challenge_invites
  with check (
    ((select auth.uid()) = inviter_id)
    and public.user_is_challenge_member(challenge_id, (select auth.uid()))
    and public.profile_is_premium((select auth.uid()))
  );
alter policy challenge_invites_select_challenge_member on public.challenge_invites
  using (public.user_is_challenge_member(challenge_id, (select auth.uid())));
alter policy challenge_invites_select_party on public.challenge_invites
  using (((select auth.uid()) = inviter_id) or ((select auth.uid()) = invitee_id));
alter policy challenge_invites_update_invitee on public.challenge_invites
  using ((select auth.uid()) = invitee_id)
  with check ((select auth.uid()) = invitee_id);

-- challenge_members
alter policy challenge_members_insert_self_or_creator on public.challenge_members
  with check (
    public.profile_is_premium((select auth.uid()))
    and (
      ((select auth.uid()) = user_id)
      or exists (
        select 1 from public.challenge_groups g
        where g.id = challenge_members.challenge_id
          and g.creator_id = (select auth.uid())
      )
    )
  );
alter policy challenge_members_select_participant on public.challenge_members
  using (public.user_is_challenge_member(challenge_id, (select auth.uid())));

-- challenge_activity
alter policy challenge_activity_select_member on public.challenge_activity
  using (public.user_is_challenge_member(challenge_id, (select auth.uid())));
alter policy challenge_activity_insert_actor on public.challenge_activity
  with check (
    ((select auth.uid()) = actor_user_id)
    and public.user_is_challenge_member(challenge_id, (select auth.uid()))
  );

-- challenge_memory_comments (ALL)
alter policy challenge_memory_comments_participant on public.challenge_memory_comments
  using (public.user_is_challenge_member(challenge_id, (select auth.uid())))
  with check (
    ((select auth.uid()) = author_id)
    and public.user_is_challenge_member(challenge_id, (select auth.uid()))
  );

-- challenge_memory_likes (ALL)
alter policy challenge_memory_likes_participant on public.challenge_memory_likes
  using (public.user_is_challenge_member(challenge_id, (select auth.uid())))
  with check (
    ((select auth.uid()) = liker_id)
    and public.user_is_challenge_member(challenge_id, (select auth.uid()))
  );

-- challenge_nudges
alter policy challenge_nudges_select_member on public.challenge_nudges
  using (public.user_is_challenge_member(challenge_id, (select auth.uid())));
alter policy challenge_nudges_insert_sender_member on public.challenge_nudges
  with check (
    ((select auth.uid()) = from_user_id)
    and public.user_is_challenge_member(challenge_id, (select auth.uid()))
    and public.user_is_challenge_member(challenge_id, to_user_id)
    and (kind is distinct from 'custom_note')
    and public.profile_is_premium((select auth.uid()))
  );

-- community_wins
alter policy community_wins_insert_own on public.community_wins
  with check (
    ((select auth.uid()) = user_id)
    and public.profile_is_premium((select auth.uid()))
  );
alter policy community_wins_update_own on public.community_wins
  using ((select auth.uid()) = user_id)
  with check (
    ((select auth.uid()) = user_id)
    and public.profile_is_premium((select auth.uid()))
  );
alter policy community_wins_delete_own on public.community_wins
  using ((select auth.uid()) = user_id);

-- community_win_cheers
alter policy community_win_cheers_insert_own on public.community_win_cheers
  with check (
    ((select auth.uid()) = user_id)
    and public.profile_is_premium((select auth.uid()))
  );
alter policy community_win_cheers_delete_own on public.community_win_cheers
  using ((select auth.uid()) = user_id);

-- mini_missions
alter policy mini_missions_select_own on public.mini_missions
  using ((select auth.uid()) = user_id);
alter policy mini_missions_insert_own on public.mini_missions
  with check (
    ((select auth.uid()) = user_id)
    and (
      (coalesce(visibility, 'solo') is distinct from 'public')
      or public.profile_is_premium((select auth.uid()))
    )
  );
alter policy mini_missions_update_own on public.mini_missions
  using ((select auth.uid()) = user_id)
  with check (
    ((select auth.uid()) = user_id)
    and (
      (coalesce(visibility, 'solo') is distinct from 'public')
      or public.profile_is_premium((select auth.uid()))
    )
  );
alter policy mini_missions_delete_own on public.mini_missions
  using ((select auth.uid()) = user_id);

-- streak_repairs
alter policy streak_repairs_select_own_or_challenge_member on public.streak_repairs
  using (
    ((select auth.uid()) = user_id)
    or (
      challenge_id is not null
      and public.user_is_challenge_member(challenge_id, (select auth.uid()))
    )
  );
alter policy streak_repairs_insert_own on public.streak_repairs
  with check ((select auth.uid()) = user_id);

-- streak_repair_votes
alter policy streak_repair_votes_select_challenge_member on public.streak_repair_votes
  using (exists (
    select 1 from public.streak_repairs r
    where r.id = streak_repair_votes.repair_id
      and r.challenge_id is not null
      and public.user_is_challenge_member(r.challenge_id, (select auth.uid()))
  ));
alter policy streak_repair_votes_insert_challenge_member on public.streak_repair_votes
  with check (exists (
    select 1 from public.streak_repairs r
    where r.id = streak_repair_votes.repair_id
      and r.challenge_id is not null
      and public.user_is_challenge_member(r.challenge_id, (select auth.uid()))
  ));

-- live_mini
alter policy live_mini_squads_select_participant on public.live_mini_squads
  using (
    (creator_id = (select auth.uid()))
    or public.user_is_live_mini_participant(id, (select auth.uid()))
  );
alter policy live_mini_participants_select_squad on public.live_mini_participants
  using (
    (user_id = (select auth.uid()))
    or public.user_is_live_mini_participant(squad_id, (select auth.uid()))
  );
