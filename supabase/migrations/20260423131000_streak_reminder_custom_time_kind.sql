-- Allow custom-time reminders in streak_reminder_log dedupe.
--
-- Same backfill-ordering note as 20260416084341: this timestamp predates
-- 20260425120000 (creates streak_reminder_log) and 20260426120000 (adds
-- reminder_kind), so a fresh replay hits this before the column exists.
-- Guarded rather than reordered for the same reason — see that file.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'streak_reminder_log' and column_name = 'reminder_kind'
  ) then
    alter table public.streak_reminder_log drop constraint if exists streak_reminder_log_reminder_kind_check;

    alter table public.streak_reminder_log
      add constraint streak_reminder_log_reminder_kind_check
      check (reminder_kind in ('slot_open', 'slot_closing', 'custom_time', 'debug_10m'));

    comment on column public.streak_reminder_log.reminder_kind is
      'slot_open: first hour after mission day opens (day 2+). slot_closing: last hour before day ends. custom_time: user-picked time.';
  end if;
end $$;

