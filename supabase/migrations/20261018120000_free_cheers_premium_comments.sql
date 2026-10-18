-- Social access swap.
--
-- Cheers ("likes") are now free for every signed-in user, including on their
-- own post. notify_community_win_cheer() already skips the post owner, so a
-- self-cheer never notifies anyone.
--
-- Reading comments stays open to everyone signed in; *posting* a comment now
-- needs HabitPro Community (paid, trial, or promo — profile_is_premium).
-- Deleting stays as before (comment author or post owner), so someone who
-- loses access can still remove their own old comments.

alter policy community_win_cheers_insert_own on public.community_win_cheers
  with check ((select auth.uid()) = user_id);

alter policy community_win_comments_insert_own on public.community_win_comments
  with check (
    ((select auth.uid()) = author_id)
    and public.profile_is_premium((select auth.uid()))
  );
