-- Debug: allow user-scoped streak reminder testing.
-- When `profiles.debug_streak_reminders = true`, `process-streak-reminders` will only emit
-- frequent debug reminders for that user (see function code). Keep default false.

alter table public.profiles
  add column if not exists debug_streak_reminders boolean not null default false;

comment on column public.profiles.debug_streak_reminders is
  'Debug-only: when true, server emits frequent streak reminder notifications for this user for testing.';

