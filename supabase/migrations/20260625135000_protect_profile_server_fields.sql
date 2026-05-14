-- Protect server-managed profile fields from client-side writes.
--
-- RLS correctly limits users to their own profile row, but that still lets a
-- modified client attempt to update billing/admin fields on that same row.
-- RevenueCat webhooks and admin/service-role jobs must keep write access.

create or replace function public.protect_profile_server_managed_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := auth.role();
begin
  -- Only browser/mobile client roles are normalized. Service-role jobs, SQL
  -- admin work, and internal triggers can write these columns intentionally.
  if coalesce(v_role, '') not in ('anon', 'authenticated') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.is_premium := false;
    new.premium_expires_at := null;
    new.premium_source := null;
    new.rc_app_user_id := null;
    new.debug_streak_reminders := false;
    return new;
  end if;

  new.is_premium := old.is_premium;
  new.premium_expires_at := old.premium_expires_at;
  new.premium_source := old.premium_source;
  new.rc_app_user_id := old.rc_app_user_id;
  new.debug_streak_reminders := old.debug_streak_reminders;
  return new;
end;
$$;

drop trigger if exists trg_profiles_protect_server_managed_fields on public.profiles;
create trigger trg_profiles_protect_server_managed_fields
  before insert or update on public.profiles
  for each row
  execute function public.protect_profile_server_managed_fields();

comment on function public.protect_profile_server_managed_fields() is
  'Preserves billing/admin/debug profile fields against anon/authenticated client writes; service-role/admin writes are allowed.';
