import { useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { useBilling } from "../context/BillingContext";
import { usePremium } from "../context/PremiumContext";
import { HABITPRO_COMMUNITY_ENTITLEMENT_ID } from "../constants/revenueCat";

const DEFAULT_MIN_INTERVAL_MS = 30_000;

type PremiumAccessCache = {
  lastRefreshAt: number;
  lastAccess: boolean | null;
  inFlight: Promise<boolean | null> | null;
};

const cacheByUserId = new Map<string, PremiumAccessCache>();

function cacheForUser(userId: string): PremiumAccessCache {
  const existing = cacheByUserId.get(userId);
  if (existing) return existing;
  const next: PremiumAccessCache = {
    lastRefreshAt: 0,
    lastAccess: null,
    inFlight: null,
  };
  cacheByUserId.set(userId, next);
  return next;
}

export function useRefreshPremiumAccess(minIntervalMs = DEFAULT_MIN_INTERVAL_MS) {
  const { session } = useAuth();
  const { refresh: refreshBilling } = useBilling();
  const { refresh: refreshPremium } = usePremium();
  const userId = session?.user?.id ?? null;

  return useCallback(
    async (options?: { force?: boolean }) => {
      if (!userId) return null;
      const cache = cacheForUser(userId);
      const now = Date.now();
      if (!options?.force && cache.inFlight) {
        return cache.inFlight;
      }
      if (!options?.force && now - cache.lastRefreshAt < minIntervalMs) {
        return cache.lastAccess;
      }
      cache.lastRefreshAt = now;

      const request = (async () => {
        const [billingResult, premiumResult] = await Promise.allSettled([
          refreshBilling(),
          refreshPremium(),
        ]);
        const info = billingResult.status === "fulfilled" ? billingResult.value : null;
        const dbPremium = premiumResult.status === "fulfilled" ? premiumResult.value : null;

        if (info == null && dbPremium == null) return null;

        const hasCommunityAccess = Boolean(
          info?.entitlements?.active?.[HABITPRO_COMMUNITY_ENTITLEMENT_ID],
        );
        return Boolean(dbPremium) || hasCommunityAccess;
      })();
      cache.inFlight = request;

      try {
        cache.lastAccess = await request;
        return cache.lastAccess;
      } finally {
        if (cache.inFlight === request) {
          cache.inFlight = null;
        }
      }
    },
    [minIntervalMs, refreshBilling, refreshPremium, userId],
  );
}
