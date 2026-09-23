-- Lets a Community profile viewer tap a habit-streak story and get routed to the
-- underlying group mission (if any) — reuses the existing request-to-join flow on
-- /challenge/[id] rather than building a second one. habits' primary key is
-- (user_id, id), not id alone, so both are required for a correct lookup.
create or replace function public.rpc_challenge_group_id_for_habit_v1(
  p_user_id uuid,
  p_habit_id text
)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select challenge_group_id
  from public.habits
  where user_id = p_user_id and id = p_habit_id;
$$;

revoke all on function public.rpc_challenge_group_id_for_habit_v1(uuid, text) from public;
grant execute on function public.rpc_challenge_group_id_for_habit_v1(uuid, text) to authenticated;
