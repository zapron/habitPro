-- Lock streak repair requests: requester cannot edit after creation.

drop policy if exists "streak_repairs_update_requester_only" on public.streak_repairs;

