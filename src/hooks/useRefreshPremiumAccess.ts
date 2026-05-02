import { useCallback } from "react";
import { useBilling } from "../context/BillingContext";
import { usePremium } from "../context/PremiumContext";
import { HABITPRO_COMMUNITY_ENTITLEMENT_ID } from "../constants/revenueCat";

const DEFAULT_MIN_INTERVAL_MS = 30_000;

let lastRefreshAt = 0;
let lastAccess: boolean | null = null;
let inFlight: Promise<boolean | null> | null = null;

export function useRefreshPremiumAccess(minIntervalMs = DEFAULT_MIN_INTERVAL_MS) {
  const { refresh: refreshBilling } = useBilling();
  const { refresh: refreshPremium } = usePremium();

  return useCallback(
    async (options?: { force?: boolean }) => {
      const now = Date.now();
      if (!options?.force && inFlight) {
        return inFlight;
      }
      if (!options?.force && now - lastRefreshAt < minIntervalMs) {
        return lastAccess;
      }
      lastRefreshAt = now;

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
      inFlight = request;

      try {
        lastAccess = await request;
        return lastAccess;
      } finally {
        if (inFlight === request) {
          inFlight = null;
        }
      }
    },
    [minIntervalMs, refreshBilling, refreshPremium],
  );
}
