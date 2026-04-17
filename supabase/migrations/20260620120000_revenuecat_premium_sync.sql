-- RevenueCat subscription sync fields (Android now; iOS later).
-- Webhook/worker updates these server-side; client gates features via profiles.is_premium.

alter table public.profiles
  add column if not exists premium_expires_at timestamptz null;

comment on column public.profiles.premium_expires_at is 'Optional expiry timestamp from billing provider (best-effort).';

alter table public.profiles
  add column if not exists premium_source text null;

comment on column public.profiles.premium_source is 'Billing source (e.g. revenuecat, admin, promo).';

alter table public.profiles
  add column if not exists rc_app_user_id text null;

comment on column public.profiles.rc_app_user_id is 'RevenueCat app_user_id mapped to this profile (we use Supabase auth uid).';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_premium_source_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_premium_source_check
      check (premium_source is null or premium_source in ('revenuecat', 'admin', 'promo'));
  end if;
end $$;

create index if not exists profiles_rc_app_user_id_idx
  on public.profiles (rc_app_user_id);

