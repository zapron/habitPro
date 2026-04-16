-- Default + backfill Habit Plus for everyone. Manually set `profiles.is_premium = false`
-- for specific test accounts in the Supabase dashboard or SQL.

alter table public.profiles
  alter column is_premium set default true;

update public.profiles
set is_premium = true
where is_premium is distinct from true;
