-- Backfill local migration to match remote history (was previously applied directly on remote).
-- Adds a debug-only flag so a single user can receive frequent streak reminders for testing.

alter table public.profiles
  add column if not exists debug_streak_reminders boolean not null default false;

comment on column public.profiles.debug_streak_reminders is
  'Debug-only: when true, server emits frequent streak reminder notifications for this user for testing.';

