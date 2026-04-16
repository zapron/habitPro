-- Debug support for streak reminders (user-scoped testing).
--
-- 1) `profiles.debug_streak_reminders`: opt-in flag so only specific users receive
--    frequent streak reminder notifications (e.g. every 10 minutes) while testing.
-- 2) `streak_reminder_log.reminder_kind`: allow the debug kind used for dedupe.

alter table public.profiles
  add column if not exists debug_streak_reminders boolean not null default false;

comment on column public.profiles.debug_streak_reminders is
  'Debug-only: when true, server emits frequent streak reminder notifications for this user for testing.';

alter table public.streak_reminder_log drop constraint if exists streak_reminder_log_reminder_kind_check;

alter table public.streak_reminder_log
  add constraint streak_reminder_log_reminder_kind_check
  check (reminder_kind in ('slot_open', 'slot_closing', 'debug_10m'));

