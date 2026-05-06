import { useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { useBilling } from "../context/BillingContext";
import { usePremium } from "../context/PremiumContext";
import { HABITPRO_COMMUNITY_ENTITLEMENT_ID } from "../constants/revenueCat";

const DEFAULT_MIN_INTERVAL_MS = 30_000;

type RefreshPremiumAccessOptions = {
  force?: boolean;
  /** Server-gated Community actions need Supabase `profiles.is_premium`, not just local RevenueCat access. */
  serverOnly?: boolean;
};

type PremiumAccessSnapshot = {
  access: boolean | null;
  serverAccess: boolean | null;
  revenueCatAccess: boolean;
};

type PremiumAccessCache = {
  lastRefreshAt: number;
  lastSnapshot: PremiumAccessSnapshot | null;
  inFlight: Promise<PremiumAccessSnapshot> | null;
};

const cacheByUserId = new Map<string, PremiumAccessCache>();

function cacheForUser(userId: string): PremiumAccessCache {
  const existing = cacheByUserId.get(userId);
  if (existing) return existing;
  const next: PremiumAccessCache = {
    lastRefreshAt: 0,
    lastSnapshot: null,
    inFlight: null,
  };
  cacheByUserId.set(userId, next);
  return next;
}

function selectAccess(
  snapshot: PremiumAccessSnapshot | null,
  options?: RefreshPremiumAccessOptions,
): boolean | null {
  if (!snapshot) return null;
  return options?.serverOnly ? snapshot.serverAccess === true : snapshot.access;
}

export function useRefreshPremiumAccess(minIntervalMs = DEFAULT_MIN_INTERVAL_MS) {
  const { session } = useAuth();
  const { refresh: refreshBilling } = useBilling();
  const { refresh: refreshPremium } = usePremium();
  const userId = session?.user?.id ?? null;

  return useCallback(
    async (options?: RefreshPremiumAccessOptions) => {
      if (!userId) return null;
      const cache = cacheForUser(userId);
      const now = Date.now();
      if (!options?.force && cache.inFlight) {
        return selectAccess(await cache.inFlight, options);
      }
      if (!options?.force && now - cache.lastRefreshAt < minIntervalMs) {
        return selectAccess(cache.lastSnapshot, options);
      }
      cache.lastRefreshAt = now;

      const request = (async () => {
        const [billingResult, premiumResult] = await Promise.allSettled([
          refreshBilling(),
          refreshPremium(),
        ]);
        const info = billingResult.status === "fulfilled" ? billingResult.value : null;
        const dbPremium = premiumResult.status === "fulfilled" ? premiumResult.value : null;

        if (info == null && dbPremium == null) {
          return { access: null, serverAccess: null, revenueCatAccess: false };
        }

        const revenueCatAccess = Boolean(
          info?.entitlements?.active?.[HABITPRO_COMMUNITY_ENTITLEMENT_ID],
        );
        const serverAccess = dbPremium == null ? null : Boolean(dbPremium);
        return {
          access: Boolean(dbPremium) || revenueCatAccess,
          serverAccess,
          revenueCatAccess,
        };
      })();
      cache.inFlight = request;

      try {
        cache.lastSnapshot = await request;
        return selectAccess(cache.lastSnapshot, options);
      } finally {
        if (cache.inFlight === request) {
          cache.inFlight = null;
        }
      }
    },
    [minIntervalMs, refreshBilling, refreshPremium, userId],
  );
}
