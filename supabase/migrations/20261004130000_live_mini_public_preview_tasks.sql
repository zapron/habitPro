-- rpc_live_mini_public_preview_v1 never returned the squad's task_checklist/
-- capture_mode snapshot, so a stranger who requests to join via a shared
-- link (before they have the app and are not yet a participant) ends up
-- with a bare mission — no tasks, no freeform mode — even though the
-- in-app username-invite accept path (handleAccept, app/live-mini/[id].tsx)
-- already copies both fields correctly from the full RLS-gated snapshot
-- (rpc_live_mini_snapshot_v1). That full snapshot isn't available to a
-- non-participant (RLS), so the link-join path has always relied on this
-- preview RPC instead — it just never carried the two fields the accept
-- path depends on. Extends it to also expose them so
-- handleRequestToJoin can do the same copy.
--
-- Return type changes require drop + recreate — create or replace can't
-- change an existing function's return shape.
drop function if exists public.rpc_live_mini_public_preview_v1(uuid);

create function public.rpc_live_mini_public_preview_v1(p_squad_id uuid)
returns table (
  squad_id uuid,
  title text,
  objective text,
  status text,
  creator_username citext,
  creator_display_name text,
  participant_count integer,
  my_status text,
  task_checklist jsonb,
  capture_mode text
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

  return query
  select
    s.id,
    s.title,
    s.objective,
    s.status,
    p.username,
    p.display_name,
    (
      select count(*)::integer
      from public.live_mini_participants lp
      where lp.squad_id = s.id
        and lp.status not in ('declined', 'expired', 'cancelled')
    ),
    case
      when s.creator_id = uid then 'creator'
      else coalesce(
        (select lp.status from public.live_mini_participants lp
         where lp.squad_id = s.id and lp.user_id = uid),
        'none'
      )
    end,
    s.task_checklist,
    s.capture_mode
  from public.live_mini_squads s
  left join public.profiles p on p.id = s.creator_id
  where s.id = p_squad_id;
end;
$$;

revoke all on function public.rpc_live_mini_public_preview_v1(uuid) from public;
grant execute on function public.rpc_live_mini_public_preview_v1(uuid) to authenticated;
