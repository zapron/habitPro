-- Keep old app versions compatible with the new defaulted RPC signatures.
-- If both old and new overloads exist, PostgREST can treat 3/4-arg calls as
-- ambiguous because the new target-context args have defaults.
drop function if exists public.rpc_send_challenge_nudge_v2(uuid, uuid, text, uuid);
drop function if exists public.rpc_send_challenge_custom_nudge(uuid, uuid, text);
