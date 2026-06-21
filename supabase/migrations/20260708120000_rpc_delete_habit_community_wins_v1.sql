-- Delete every Community habit-streak win for one habit in a single server call.
-- Additive and safe: old clients keep working, new clients fall back if this RPC
-- is not present in an environment yet.

create or replace function public.rpc_delete_habit_community_wins_v1(
  p_habit_id text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_habit_id is null or length(trim(p_habit_id)) = 0 then
    return 0;
  end if;

  delete from public.community_wins
  where user_id = auth.uid()
    and feed_source = 'habit_streak'
    and mini_mission_id like ('habitwin:' || p_habit_id || ':%');

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

grant execute on function public.rpc_delete_habit_community_wins_v1(text) to authenticated;
