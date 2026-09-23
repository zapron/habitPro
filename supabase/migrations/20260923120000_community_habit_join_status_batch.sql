-- Lets the Community feed/profile show a "Join" affordance proactively (before any tap)
-- instead of resolving membership lazily on tap — one batch call per loaded page instead
-- of N lookups. Mirrors rpc_challenge_group_id_for_habit_v1's security posture (habits'
-- owner isn't necessarily the caller; bypasses RLS for this narrow, non-sensitive read).
create or replace function public.rpc_community_habit_join_status_batch_v1(p_pairs jsonb)
returns table (
  owner_user_id uuid,
  habit_id text,
  challenge_group_id uuid,
  is_member boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if p_pairs is null or jsonb_typeof(p_pairs) <> 'array' then
    raise exception 'invalid_pairs';
  end if;

  return query
  select
    h.user_id,
    h.id,
    h.challenge_group_id,
    case
      when h.challenge_group_id is null then false
      else public.user_is_challenge_participant(h.challenge_group_id, uid)
    end
  from public.habits h
  join (
    select distinct
      (pair->>'owner_user_id')::uuid as owner_user_id,
      (pair->>'habit_id')::text as habit_id
    from jsonb_array_elements(p_pairs) as pair
  ) req
    on h.user_id = req.owner_user_id and h.id = req.habit_id;
end;
$$;

revoke all on function public.rpc_community_habit_join_status_batch_v1(jsonb) from public;
grant execute on function public.rpc_community_habit_join_status_batch_v1(jsonb) to authenticated;
