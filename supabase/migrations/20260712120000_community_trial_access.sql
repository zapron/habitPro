-- Community access: paid entitlement OR backend-controlled no-payment trial.
--
-- `profiles.is_premium` remains the RevenueCat/admin paid-access flag.
-- Trial/promo-style access lives in `community_access_grants`, and all gates
-- should ask `profile_is_premium(uid)` for effective Community access.

create table if not exists public.community_access_config (
  id integer primary key default 1 check (id = 1),
  trial_enabled boolean not null default true,
  trial_days integer not null default 7 check (trial_days between 1 and 120),
  updated_at timestamptz not null default now(),
  updated_by uuid null references public.profiles(id) on delete set null
);

insert into public.community_access_config (id, trial_enabled, trial_days)
values (1, true, 7)
on conflict (id) do nothing;

drop trigger if exists trg_community_access_config_updated_at on public.community_access_config;
create trigger trg_community_access_config_updated_at
  before update on public.community_access_config
  for each row
  execute function public._hp_touch_updated_at();

alter table public.community_access_config enable row level security;

drop policy if exists community_access_config_select on public.community_access_config;
create policy community_access_config_select
  on public.community_access_config for select
  to anon, authenticated
  using (true);

create table if not exists public.community_access_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  grant_type text not null check (grant_type in ('trial', 'promo')),
  source text not null default 'rpc_start_community_trial',
  started_at timestamptz not null default now(),
  expires_at timestamptz null,
  revoked_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at is null or expires_at > started_at)
);

create unique index if not exists community_access_grants_one_trial_per_user_idx
  on public.community_access_grants (user_id)
  where grant_type = 'trial';

create index if not exists community_access_grants_active_lookup_idx
  on public.community_access_grants (user_id, grant_type, expires_at)
  where revoked_at is null;

drop trigger if exists trg_community_access_grants_updated_at on public.community_access_grants;
create trigger trg_community_access_grants_updated_at
  before update on public.community_access_grants
  for each row
  execute function public._hp_touch_updated_at();

alter table public.community_access_grants enable row level security;

drop policy if exists community_access_grants_select_own on public.community_access_grants;
create policy community_access_grants_select_own
  on public.community_access_grants for select
  to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.profile_paid_access(uid uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce((
    select
      p.is_premium
      and (
        p.premium_expires_at is null
        or p.premium_expires_at > now()
      )
    from public.profiles p
    where p.id = uid
  ), false);
$$;

revoke all on function public.profile_paid_access(uuid) from public;
grant execute on function public.profile_paid_access(uuid) to authenticated;

create or replace function public.profile_has_active_community_grant(uid uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.community_access_grants g
    where g.user_id = uid
      and g.revoked_at is null
      and (
        g.expires_at is null
        or g.expires_at > now()
      )
  );
$$;

revoke all on function public.profile_has_active_community_grant(uuid) from public;
grant execute on function public.profile_has_active_community_grant(uuid) to authenticated;

create or replace function public.profile_is_premium(uid uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select
    public.profile_paid_access(uid)
    or public.profile_has_active_community_grant(uid);
$$;

revoke all on function public.profile_is_premium(uuid) from public;
grant execute on function public.profile_is_premium(uuid) to authenticated;

create or replace function public.rpc_get_community_access_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_now timestamptz := now();
  v_cfg public.community_access_config%rowtype;
  v_trial public.community_access_grants%rowtype;
  v_paid boolean := false;
  v_trial_active boolean := false;
  v_has_access boolean := false;
begin
  if uid is null then
    raise exception 'auth_required';
  end if;

  select *
  into v_cfg
  from public.community_access_config
  where id = 1;

  if not found then
    v_cfg.id := 1;
    v_cfg.trial_enabled := false;
    v_cfg.trial_days := 7;
  end if;

  select *
  into v_trial
  from public.community_access_grants
  where user_id = uid
    and grant_type = 'trial'
  order by created_at asc
  limit 1;

  v_paid := public.profile_paid_access(uid);
  v_trial_active :=
    v_trial.id is not null
    and v_trial.revoked_at is null
    and (v_trial.expires_at is null or v_trial.expires_at > v_now);
  v_has_access := v_paid or v_trial_active;

  return jsonb_build_object(
    'hasAccess', v_has_access,
    'paidAccess', v_paid,
    'trialEnabled', coalesce(v_cfg.trial_enabled, false),
    'trialDays', coalesce(v_cfg.trial_days, 7),
    'trialAvailable', coalesce(v_cfg.trial_enabled, false) and v_trial.id is null and not v_paid,
    'trialActive', v_trial_active,
    'trialStartedAt', case when v_trial.id is null then null else v_trial.started_at end,
    'trialExpiresAt', case when v_trial.id is null then null else v_trial.expires_at end,
    'trialUsed', v_trial.id is not null,
    'accessSource',
      case
        when v_paid then 'paid'
        when v_trial_active then 'trial'
        else 'none'
      end,
    'serverNow', v_now
  );
end;
$$;

revoke all on function public.rpc_get_community_access_status() from public;
grant execute on function public.rpc_get_community_access_status() to authenticated;

create or replace function public.rpc_start_community_trial()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_now timestamptz := now();
  v_cfg public.community_access_config%rowtype;
  v_existing public.community_access_grants%rowtype;
  v_expires_at timestamptz;
begin
  if uid is null then
    raise exception 'auth_required';
  end if;

  if public.profile_paid_access(uid) then
    return jsonb_build_object(
      'ok', true,
      'started', false,
      'reason', 'already_paid',
      'status', public.rpc_get_community_access_status()
    );
  end if;

  select *
  into v_cfg
  from public.community_access_config
  where id = 1;

  if not found or coalesce(v_cfg.trial_enabled, false) is false then
    return jsonb_build_object(
      'ok', false,
      'started', false,
      'reason', 'trial_disabled',
      'status', public.rpc_get_community_access_status()
    );
  end if;

  select *
  into v_existing
  from public.community_access_grants
  where user_id = uid
    and grant_type = 'trial'
  order by created_at asc
  limit 1;

  if v_existing.id is not null then
    return jsonb_build_object(
      'ok',
        v_existing.revoked_at is null
        and (v_existing.expires_at is null or v_existing.expires_at > v_now),
      'started', false,
      'reason', 'trial_already_used',
      'status', public.rpc_get_community_access_status()
    );
  end if;

  v_expires_at := v_now + make_interval(days => greatest(1, least(120, v_cfg.trial_days)));

  insert into public.community_access_grants (
    user_id,
    grant_type,
    source,
    started_at,
    expires_at,
    metadata
  )
  values (
    uid,
    'trial',
    'rpc_start_community_trial',
    v_now,
    v_expires_at,
    jsonb_build_object(
      'configuredTrialDays', v_cfg.trial_days,
      'configuredTrialEnabled', v_cfg.trial_enabled
    )
  );

  return jsonb_build_object(
    'ok', true,
    'started', true,
    'reason', 'trial_started',
    'status', public.rpc_get_community_access_status()
  );
end;
$$;

revoke all on function public.rpc_start_community_trial() from public;
grant execute on function public.rpc_start_community_trial() to authenticated;

-- Public mission visibility should use effective Community access, not only
-- the paid RevenueCat flag, so active trials can publish/publicize missions.
alter policy habits_insert_own on public.habits
  with check (
    ((select auth.uid()) = user_id)
    and (
      coalesce(visibility, 'solo') is distinct from 'public'
      or public.profile_is_premium((select auth.uid()))
    )
  );

alter policy habits_update_own on public.habits
  using ((select auth.uid()) = user_id)
  with check (
    ((select auth.uid()) = user_id)
    and (
      coalesce(visibility, 'solo') is distinct from 'public'
      or public.profile_is_premium((select auth.uid()))
    )
  );
