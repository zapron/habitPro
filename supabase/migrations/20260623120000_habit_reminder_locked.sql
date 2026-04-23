-- One-time lock: after user confirms reminder time, it cannot be changed from the app.

alter table public.habits
  add column if not exists reminder_locked boolean not null default false;

comment on column public.habits.reminder_locked is
  'When true, reminder_time_local is final for this mission (client hides editor).';

-- Existing missions that already saved a custom reminder should behave as locked.
update public.habits
set reminder_locked = true
where reminder_enabled = true
  and reminder_time_local is not null
  and reminder_locked = false;
