-- HabitPro Community is now gated by RevenueCat/webhook/admin state.
-- New profile rows must start free; paid access is granted later by the
-- RevenueCat webhook or an explicit admin/promo update.

alter table public.profiles
  alter column is_premium set default false;

comment on column public.profiles.is_premium is
  'Set by billing webhook / admin / promo. New users default to false.';
