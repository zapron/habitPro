-- Fix: Add missing GRANT EXECUTE and SET search_path on RPCs introduced in 20260627120000
-- Without explicit grants, PostgREST cannot call these functions as the authenticated role.
-- rpc_sync_dirty_state is the main write path for habits — if it fails silently, the
-- tg_habits_notify_challenge_squad_checkin trigger never fires, blocking squad notifications.

ALTER FUNCTION public.rpc_sync_dirty_state(jsonb, jsonb, integer, text)
  SET search_path = public;

GRANT EXECUTE ON FUNCTION public.rpc_sync_dirty_state(jsonb, jsonb, integer, text) TO authenticated;

ALTER FUNCTION public.get_community_player_profile(uuid)
  SET search_path = public;

GRANT EXECUTE ON FUNCTION public.get_community_player_profile(uuid) TO authenticated;
