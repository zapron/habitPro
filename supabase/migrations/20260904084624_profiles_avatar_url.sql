-- Adds a user-uploadable profile picture. Stored in the existing
-- `streak-memories` Storage bucket (same per-uid-folder RLS pattern, no new
-- bucket/policy needed) under `{uid}/avatar.jpg`, written via a direct
-- client-side upsert (same pattern as `profiles.username`), not through the
-- rpc_sync_dirty_state/rpc_focus_delta_v1 multi-device sync machinery.

alter table public.profiles
  add column if not exists avatar_url text;

comment on column public.profiles.avatar_url is
  'Public URL of the user-uploaded profile picture in the streak-memories bucket ({uid}/avatar.jpg). Null until the user uploads one.';
