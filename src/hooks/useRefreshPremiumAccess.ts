import { useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { useBilling } from "../context/BillingContext";
import { usePremium } from "../context/PremiumContext";
import { HABITPRO_COMMUNITY_ENTITLEMENT_ID } from "../constants/revenueCat";
import { traceAsync } from "../lib/perfTrace";

const DEFAULT_MIN_INTERVAL_MS = 30_000;
const BILLING_REFRESH_TIMEOUT_MS = 2_500;
const SERVER_REFRESH_TIMEOUT_MS = 2_500;

type RefreshPremiumAccessOptions = {
  force?: boolean;
  /** Server-gated Community actions need Supabase effective access, not just local RevenueCat access. */
  serverOnly?: boolean;
  /** For actions that have server-side enforcement, trust current local premium state before forcing a refresh. */
  cachedAccessOk?: boolean;
  /** Passive screen warmup. Never start a network refresh while the app-level premium flag is still loading. */
  background?: boolean;
};

type PremiumAccessSnapshot = {
  access: boolean | null;
  serverAccess: boolean | null;
  revenueCatAccess: boolean;
};

type PremiumAccessCache = {
  lastRefreshAt: number;
  lastServerRefreshAt: number;
  lastSnapshot: PremiumAccessSnapshot | null;
  inFlight: Promise<PremiumAccessSnapshot> | null;
  serverInFlight: Promise<PremiumAccessSnapshot> | null;
  /** Local calendar day (YYYY-MM-DD) when we last confirmed premium access. */
  lastPremiumOkDayKey: string | null;
  /** Local calendar day (YYYY-MM-DD) when we last confirmed server premium access. */
  lastServerPremiumOkDayKey: string | null;
};

const cacheByUserId = new Map<string, PremiumAccessCache>();

function cacheForUser(userId: string): PremiumAccessCache {
  const existing = cacheByUserId.get(userId);
  if (existing) return existing;
  const next: PremiumAccessCache = {
    lastRefreshAt: 0,
    lastServerRefreshAt: 0,
    lastSnapshot: null,
    inFlight: null,
    serverInFlight: null,
    lastPremiumOkDayKey: null,
    lastServerPremiumOkDayKey: null,
  };
  cacheByUserId.set(userId, next);
  return next;
}

function localDayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => {
      setTimeout(() => resolve(fallback), timeoutMs);
    }),
  ]);
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
  const {
    isPremium,
    accessStatus,
    loading: premiumLoading,
    refresh: refreshPremium,
  } = usePremium();
  const userId = session?.user?.id ?? null;

  return useCallback(
    async (options?: RefreshPremiumAccessOptions) => {
      if (!userId) return null;
      const cache = cacheForUser(userId);
      const now = Date.now();
      const todayKey = localDayKey(new Date(now));

      // Tap-time guards should be instant once the app-level premium flag is settled.
      // Mutations are still protected by Supabase RLS/RPCs, so stale edge cases fail safely.
      if (options?.cachedAccessOk && !options.force) {
        if (options.serverOnly) {
          if (accessStatus?.hasAccess === true) return true;
          if (!premiumLoading && !isPremium) return false;
          if (options.background) return selectAccess(cache.lastSnapshot, options);
        } else {
          if (isPremium) return true;
          if (!premiumLoading) return false;
          if (options.background) return selectAccess(cache.lastSnapshot, options);
        }
      }

      // Premium users: avoid re-checking on every interaction. If we've already confirmed
      // premium today, trust cached status and rely on server enforcement on edge cases.
      if (options?.cachedAccessOk && !options.force && isPremium) {
        if (options.serverOnly) {
          if (
            cache.lastSnapshot?.serverAccess === true &&
            cache.lastServerPremiumOkDayKey === todayKey
          ) {
            return true;
          }
        } else if (cache.lastPremiumOkDayKey === todayKey) {
          return true;
        }
      }

      if (options?.serverOnly) {
        if (!options.force && cache.serverInFlight) {
          return selectAccess(await cache.serverInFlight, options);
        }
        if (!options.force && now - cache.lastServerRefreshAt < minIntervalMs) {
          return selectAccess(cache.lastSnapshot, options);
        }
        cache.lastServerRefreshAt = now;

        const request = traceAsync(
          "premium.refresh",
          async () => {
            const dbPremium = await withTimeout<boolean | null>(
              refreshPremium(),
              SERVER_REFRESH_TIMEOUT_MS,
              null,
            );
            const priorRevenueCatAccess = cache.lastSnapshot?.revenueCatAccess === true;
            const serverAccess = dbPremium == null ? null : Boolean(dbPremium);
            return {
              access: serverAccess === true || priorRevenueCatAccess,
              serverAccess,
              revenueCatAccess: priorRevenueCatAccess,
            };
          },
          {
            slowMs: 700,
            meta: {
              force: Boolean(options.force),
              serverOnly: true,
              cachedAccessOk: Boolean(options.cachedAccessOk),
              background: Boolean(options.background),
            },
          },
        );
        cache.serverInFlight = request;

        try {
          cache.lastSnapshot = await request;
          if (cache.lastSnapshot.serverAccess === true) {
            cache.lastServerPremiumOkDayKey = todayKey;
          }
          return selectAccess(cache.lastSnapshot, options);
        } finally {
          if (cache.serverInFlight === request) {
            cache.serverInFlight = null;
          }
        }
      }

      if (!options?.force && cache.inFlight) {
        return selectAccess(await cache.inFlight, options);
      }
      if (!options?.force && now - cache.lastRefreshAt < minIntervalMs) {
        return selectAccess(cache.lastSnapshot, options);
      }
      cache.lastRefreshAt = now;

      const request = traceAsync(
        "premium.refresh",
        async () => {
          const [billingResult, premiumResult] = await Promise.allSettled([
            withTimeout(refreshBilling(), BILLING_REFRESH_TIMEOUT_MS, null),
            withTimeout<boolean | null>(refreshPremium(), SERVER_REFRESH_TIMEOUT_MS, null),
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
        },
        {
          slowMs: 700,
          meta: {
            force: Boolean(options?.force),
            serverOnly: Boolean(options?.serverOnly),
            cachedAccessOk: Boolean(options?.cachedAccessOk),
            background: Boolean(options?.background),
          },
        },
      );
      cache.inFlight = request;

      try {
        cache.lastSnapshot = await request;
        if (cache.lastSnapshot.access === true) {
          cache.lastPremiumOkDayKey = todayKey;
        }
        if (cache.lastSnapshot.serverAccess === true) {
          cache.lastServerPremiumOkDayKey = todayKey;
        }
        return selectAccess(cache.lastSnapshot, options);
      } finally {
        if (cache.inFlight === request) {
          cache.inFlight = null;
        }
      }
    },
    [
      accessStatus?.hasAccess,
      isPremium,
      premiumLoading,
      minIntervalMs,
      refreshBilling,
      refreshPremium,
      userId,
    ],
  );
}
