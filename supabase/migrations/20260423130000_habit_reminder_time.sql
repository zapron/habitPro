-- Per-mission reminder preferences (custom-time reminders).
-- When enabled, server streak reminders can send a reminder at the user-chosen time
-- (and still keep the last-hour safety reminder).

alter table public.habits
  add column if not exists reminder_enabled boolean not null default false;

alter table public.habits
  add column if not exists reminder_time_local text;

comment on column public.habits.reminder_enabled is
  'When true, server sends a custom-time reminder for this mission (instead of slot_open/24h reminder).';

comment on column public.habits.reminder_time_local is
  'Local time (HH:MM 24h) in profiles.timezone for custom mission reminders.';

