-- TEMP: enable Habit Plus for all users (default + backfill).
-- This makes `profiles.is_premium` true for existing and future profile rows.

alter table public.profiles
  alter column is_premium set default true;

update public.profiles
set is_premium = true
where is_premium is distinct from true;

