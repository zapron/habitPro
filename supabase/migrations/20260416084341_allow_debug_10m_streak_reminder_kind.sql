-- Backfill local migration to match remote history (was previously applied directly on remote).
-- Allows the debug reminder kind used for 10-minute cadence dedupe.

alter table public.streak_reminder_log drop constraint if exists streak_reminder_log_reminder_kind_check;

alter table public.streak_reminder_log
  add constraint streak_reminder_log_reminder_kind_check
  check (reminder_kind in ('slot_open', 'slot_closing', 'debug_10m'));

