-- Tracks when a user permanently removed a mini mission from Community wins (cannot re-publish).

alter table public.mini_missions
  add column if not exists community_feed_revoked boolean not null default false;
