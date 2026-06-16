import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import { useAuth } from "./AuthContext";
import { useBilling } from "./BillingContext";
import { isSupabaseConfigured } from "../lib/env";
import { getProfileIsPremiumForUser } from "../lib/groupChallengesApi";
import { getSupabase } from "../lib/supabase";

const APP_ACTIVE_PREMIUM_REFRESH_IDLE_MS = 5 * 60 * 1000;

type PremiumContextValue = {
  /**
   * HabitPro Community access: Supabase `profiles.is_premium` (webhook / admin) **or**
   * active RevenueCat entitlement on device (covers Test Store and before webhook lands).
   */
  isPremium: boolean;
  /** True while waiting on profile fetch when RC has not already granted access. */
  loading: boolean;
  refresh: () => Promise<boolean>;
};

const PremiumContext = createContext<PremiumContextValue | null>(null);

export function PremiumProvider({ children }: { children: React.ReactNode }) {
  const { session, initializing } = useAuth();
  const { hasCommunityAccess } = useBilling();
  const [dbPremium, setDbPremium] = useState(false);
  const [dbPremiumUserId, setDbPremiumUserId] = useState<string | null>(null);
  const [dbLoading, setDbLoading] = useState(false);
  const activeUserIdRef = useRef<string | null>(null);
  const lastInactiveAtRef = useRef<number | null>(null);

  const userId = session?.user?.id ?? null;

  useEffect(() => {
    activeUserIdRef.current = userId;
    setDbPremium(false);
    setDbPremiumUserId(null);
    setDbLoading(false);
    lastInactiveAtRef.current = null;
  }, [userId]);

  const refresh = useCallback(async () => {
    if (!isSupabaseConfigured() || !userId) {
      setDbPremium(false);
      setDbPremiumUserId(null);
      setDbLoading(false);
      return false;
    }
    const requestedUserId = userId;
    setDbLoading(true);
    try {
      const v = await getProfileIsPremiumForUser(requestedUserId);
      const next = Boolean(v);
      if (activeUserIdRef.current === requestedUserId) {
        setDbPremium(next);
        setDbPremiumUserId(requestedUserId);
        return next;
      }
      return false;
    } finally {
      if (activeUserIdRef.current === requestedUserId) {
        setDbLoading(false);
      }
    }
  }, [userId]);

  useEffect(() => {
    if (initializing) return;
    void refresh();
  }, [initializing, refresh]);

  useEffect(() => {
    if (initializing) return;
    const sub = AppState.addEventListener("change", (st) => {
      if (st === "active") {
        const lastInactiveAt = lastInactiveAtRef.current;
        lastInactiveAtRef.current = null;
        if (
          lastInactiveAt != null &&
          Date.now() - lastInactiveAt >= APP_ACTIVE_PREMIUM_REFRESH_IDLE_MS
        ) {
          void refresh();
        }
        return;
      }
      if (st === "inactive" || st === "background") {
        lastInactiveAtRef.current ??= Date.now();
      }
    });
    return () => sub.remove();
  }, [initializing, refresh]);

  useEffect(() => {
    if (initializing) return;
    if (!isSupabaseConfigured() || !userId) return;
    const supabase = getSupabase();
    if (!supabase) return;

    const channel = supabase
      .channel(`profiles_premium_${userId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "profiles",
          filter: `id=eq.${userId}`,
        },
        (payload) => {
          if (activeUserIdRef.current !== userId) return;
          const next = payload.new as Record<string, unknown> | null;
          if (!next) return;
          const v = next.is_premium;
          if (typeof v === "boolean") {
            setDbPremium(v);
            setDbPremiumUserId(userId);
          } else if (typeof v === "number") {
            setDbPremium(Boolean(v));
            setDbPremiumUserId(userId);
          } else {
            void refresh();
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [initializing, userId, refresh]);

  const dbPremiumForCurrentUser = dbPremiumUserId === userId && dbPremium;
  const isPremium = dbPremiumForCurrentUser || hasCommunityAccess;
  const hasDbPremiumSnapshot = !userId || dbPremiumUserId === userId || !isSupabaseConfigured();
  const loading =
    !hasCommunityAccess &&
    (initializing || dbLoading || (Boolean(userId) && !hasDbPremiumSnapshot));

  const value = useMemo(() => ({ isPremium, loading, refresh }), [isPremium, loading, refresh]);
  return <PremiumContext.Provider value={value}>{children}</PremiumContext.Provider>;
}

export function usePremium(): PremiumContextValue {
  const v = useContext(PremiumContext);
  if (!v) throw new Error("usePremium must be used within PremiumProvider");
  return v;
}
