import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { AppState } from "react-native";
import { useAuth } from "./AuthContext";
import { useBilling } from "./BillingContext";
import { isSupabaseConfigured } from "../lib/env";
import { getMyProfileIsPremium } from "../lib/groupChallengesApi";
import { getSupabase } from "../lib/supabase";

type PremiumContextValue = {
  /**
   * HabitPro Community access: Supabase `profiles.is_premium` (webhook / admin) **or**
   * active RevenueCat entitlement on device (covers Test Store and before webhook lands).
   */
  isPremium: boolean;
  /** True while waiting on profile fetch when RC has not already granted access. */
  loading: boolean;
  refresh: () => Promise<void>;
};

const PremiumContext = createContext<PremiumContextValue | null>(null);

export function PremiumProvider({ children }: { children: React.ReactNode }) {
  const { session, initializing } = useAuth();
  const { hasCommunityAccess } = useBilling();
  const [dbPremium, setDbPremium] = useState(false);
  const [dbLoading, setDbLoading] = useState(false);

  const userId = session?.user?.id ?? null;

  const refresh = useCallback(async () => {
    if (!isSupabaseConfigured() || !userId) {
      setDbPremium(false);
      setDbLoading(false);
      return;
    }
    setDbLoading(true);
    try {
      const v = await getMyProfileIsPremium();
      setDbPremium(Boolean(v));
    } finally {
      setDbLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (initializing) return;
    void refresh();
  }, [initializing, refresh]);

  useEffect(() => {
    if (initializing) return;
    const sub = AppState.addEventListener("change", (st) => {
      if (st === "active") void refresh();
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
          const next = payload.new as Record<string, unknown> | null;
          if (!next) return;
          const v = next.is_premium;
          if (typeof v === "boolean") {
            setDbPremium(v);
          } else if (typeof v === "number") {
            setDbPremium(Boolean(v));
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

  const isPremium = dbPremium || hasCommunityAccess;
  const loading = dbLoading && !hasCommunityAccess;

  const value = useMemo(() => ({ isPremium, loading, refresh }), [isPremium, loading, refresh]);
  return <PremiumContext.Provider value={value}>{children}</PremiumContext.Provider>;
}

export function usePremium(): PremiumContextValue {
  const v = useContext(PremiumContext);
  if (!v) throw new Error("usePremium must be used within PremiumProvider");
  return v;
}

