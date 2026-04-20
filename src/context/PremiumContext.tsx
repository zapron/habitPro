import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "./AuthContext";
import { useBilling } from "./BillingContext";
import { isSupabaseConfigured } from "../lib/env";
import { getMyProfileIsPremium } from "../lib/groupChallengesApi";

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

  const refresh = useCallback(async () => {
    if (!isSupabaseConfigured() || !session?.user) {
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
  }, [session?.user]);

  useEffect(() => {
    if (initializing) return;
    void refresh();
  }, [initializing, refresh]);

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

