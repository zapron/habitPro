-- rpc_get_community_access_status() only ever looked at grant_type = 'trial' when
-- deciding hasAccess — a 'promo' grant (the only other allowed grant_type; see
-- community_access_grants_grant_type_check) was completely invisible to it, even
-- though profile_is_premium()/profile_has_active_community_grant() already treat
-- any non-revoked, non-expired grant as active regardless of type. Real bug: a
-- promo grant silently never unlocked anything client-side — the paywall kept
-- showing "already used trial" forever. Trial-specific fields (trialActive,
-- trialUsed, etc.) are untouched — they must keep meaning "used the trial
-- specifically," not "has some grant" — only hasAccess/accessSource change.
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
  v_active_grant public.community_access_grants%rowtype;
  v_paid boolean := false;
  v_trial_active boolean := false;
  v_grant_active boolean := false;
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

  -- Any active grant (trial or promo) — mirrors profile_has_active_community_grant()
  -- exactly, so this RPC and that function can never disagree on hasAccess again.
  select *
  into v_active_grant
  from public.community_access_grants
  where user_id = uid
    and revoked_at is null
    and (expires_at is null or expires_at > v_now)
  order by created_at desc
  limit 1;

  v_paid := public.profile_paid_access(uid);
  v_trial_active :=
    v_trial.id is not null
    and v_trial.revoked_at is null
    and (v_trial.expires_at is null or v_trial.expires_at > v_now);
  v_grant_active := v_active_grant.id is not null;
  v_has_access := v_paid or v_grant_active;

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
        when v_grant_active then 'promo'
        else 'none'
      end,
    'serverNow', v_now
  );
end;
$$;
