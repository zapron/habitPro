-- Fix recurring 42P17 on challenge_members after later policy rewrites.
-- Keep membership checks behind a SECURITY DEFINER helper and avoid scanning
-- challenge_members directly from policies that may run while challenge_members
-- itself is being inserted or selected.

create or replace function public.user_is_challenge_member(p_challenge_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.challenge_members m
    where m.challenge_id = p_challenge_id
      and m.user_id = p_user_id
  );
$$;

revoke all on function public.user_is_challenge_member(uuid, uuid) from public;
grant execute on function public.user_is_challenge_member(uuid, uuid) to authenticated;

alter policy challenge_groups_select_member on public.challenge_groups
  using (
    ((select auth.uid()) = creator_id)
    or public.user_is_challenge_member(id, (select auth.uid()))
  );

alter policy challenge_members_select_participant on public.challenge_members
  using (public.user_is_challenge_member(challenge_id, (select auth.uid())));

alter policy challenge_members_insert_self_or_creator on public.challenge_members
  with check (
    public.profile_is_premium((select auth.uid()))
    and ((select auth.uid()) = user_id)
  );
