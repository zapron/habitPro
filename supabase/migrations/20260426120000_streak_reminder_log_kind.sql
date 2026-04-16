-- Two streak reminders per mission day from day 2+: slot_open (first hour) + slot_closing (last hour).

alter table public.streak_reminder_log
  add column if not exists reminder_kind text not null default 'slot_closing';

alter table public.streak_reminder_log drop constraint if exists streak_reminder_log_reminder_kind_check;

alter table public.streak_reminder_log
  add constraint streak_reminder_log_reminder_kind_check check (reminder_kind in ('slot_open', 'slot_closing', 'debug_10m'));

alter table public.streak_reminder_log drop constraint if exists streak_reminder_log_pkey;

alter table public.streak_reminder_log
  add constraint streak_reminder_log_pkey primary key (user_id, habit_id, reminder_date, reminder_kind);

comment on column public.streak_reminder_log.reminder_kind is
  'slot_open: first hour after mission day opens (day 2+). slot_closing: last hour before day ends (day 2+).';
