-- Revert TEMP migration `20260614120000_enable_premium_for_all.sql`:
-- default new profiles to non-Plus; backfill everyone to false so dev/staging shows gating.

alter table public.profiles
  alter column is_premium set default false;

update public.profiles
set is_premium = false
where is_premium is distinct from false;
