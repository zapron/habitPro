-- Hot-window plan, Phase B: once the local store no longer guarantees
-- every mission is loaded, opening one specific mission (a detail screen,
-- or an old mission's private gallery) needs a direct fetch-by-id path
-- rather than relying on a store lookup that might miss. Owner-scoped
-- (auth.uid() = user_id), so unlike the other-viewer RPCs
-- (fetchCommunityPlayerMissionJourneyPage), no public/private filtering
-- is needed here — the owner is always allowed to see their own full
-- record, private memories included, in one shot.

create or replace function public.rpc_habit_by_id_v1(p_id text)
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
    and h.id = p_id;

  return v_row;
end;
$$;

grant execute on function public.rpc_habit_by_id_v1(text) to authenticated;

create or replace function public.rpc_mini_mission_by_id_v1(p_id text)
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

  select to_jsonb(m.*)
    into v_row
  from public.mini_missions m
  where m.user_id = uid
    and m.id = p_id;

  return v_row;
end;
$$;

grant execute on function public.rpc_mini_mission_by_id_v1(text) to authenticated;
