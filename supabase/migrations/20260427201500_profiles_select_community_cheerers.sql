-- Allow Community viewers to see usernames of users who cheered a win.
-- Without this, `profiles_select_community_win_authors` only exposes authors, not cheerers.

create policy "profiles_select_community_win_cheerers"
  on public.profiles for select
  to authenticated
  using (
    exists (
      select 1
      from public.community_win_cheers c
      where c.user_id = profiles.id
    )
  );

