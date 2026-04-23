-- Allow custom-time reminders in streak_reminder_log dedupe.

alter table public.streak_reminder_log drop constraint if exists streak_reminder_log_reminder_kind_check;

alter table public.streak_reminder_log
  add constraint streak_reminder_log_reminder_kind_check
  check (reminder_kind in ('slot_open', 'slot_closing', 'custom_time', 'debug_10m'));

comment on column public.streak_reminder_log.reminder_kind is
  'slot_open: first hour after mission day opens (day 2+). slot_closing: last hour before day ends. custom_time: user-picked time.';

