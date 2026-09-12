-- Backfill local migration to match remote history (was previously applied directly on remote).
-- Allows the debug reminder kind used for 10-minute cadence dedupe.
--
-- This file's timestamp predates 20260425120000 (creates streak_reminder_log)
-- and 20260426120000 (adds the reminder_kind column) — on production, this
-- ran after both existed (applied directly, then backfilled as a migration
-- with a timestamp that doesn't reflect the real dependency order). A fresh
-- replay in file order hits this before the column exists, so guard on the
-- column's presence rather than reordering — reordering would change this
-- migration's version identifier, which production already has recorded as
-- applied under the current one. Found 2026-09-13 setting up local dev.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'streak_reminder_log' and column_name = 'reminder_kind'
  ) then
    alter table public.streak_reminder_log drop constraint if exists streak_reminder_log_reminder_kind_check;

    alter table public.streak_reminder_log
      add constraint streak_reminder_log_reminder_kind_check
      check (reminder_kind in ('slot_open', 'slot_closing', 'debug_10m'));
  end if;
end $$;

