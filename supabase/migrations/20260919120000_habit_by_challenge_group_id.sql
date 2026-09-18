-- Hot-window plan, Phase F fix: challenge/[id].tsx and compete.tsx's invite-accept
-- flow both look up "my own habit for this challenge group" via
-- habits.find(h => h.challengeGroupId === challengeId) against the local store.
-- That was judged "likely safe" in the original audit (challenge-linked habits are
-- active by nature) but verification found it's wrong for an OLD, already-completed
-- challenge whose habit now falls outside the hot window:
--   - challenge/[id].tsx would show the screen as if the user was never part of it.
--   - compete.tsx's invite-accept flow is worse: it uses this same check to decide
--     whether to create a new habit, so a false "not found" would create a DUPLICATE
--     habit for a challenge group the user already has a completed record for.
-- This RPC is the fallback for both: owner-scoped, single-row, mirrors Phase B's
-- rpc_habit_by_id_v1 shape exactly, just keyed by challenge_group_id instead of id.

create or replace function public.rpc_habit_by_challenge_group_id_v1(p_challenge_group_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_row jsonb;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  select to_jsonb(h.*)
    into v_row
  from public.habits h
  where h.user_id = uid
    and h.challenge_group_id = p_challenge_group_id
  order by h.start_date desc
  limit 1;

  return v_row;
end;
$$;

grant execute on function public.rpc_habit_by_challenge_group_id_v1(uuid) to authenticated;
