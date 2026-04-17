import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "./AuthContext";
import { isSupabaseConfigured } from "../lib/env";
import { getMyProfileIsPremium } from "../lib/groupChallengesApi";

type PremiumContextValue = {
  /** HabitPro Community entitlement for the current user. */
  isPremium: boolean;
  /** True while fetching the flag for a signed-in user. */
  loading: boolean;
  refresh: () => Promise<void>;
};

const PremiumContext = createContext<PremiumContextValue | null>(null);

export function PremiumProvider({ children }: { children: React.ReactNode }) {
  const { session, initializing } = useAuth();
  const [isPremium, setIsPremium] = useState(false);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!isSupabaseConfigured() || !session?.user) {
      setIsPremium(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const v = await getMyProfileIsPremium();
      setIsPremium(Boolean(v));
    } finally {
      setLoading(false);
    }
  }, [session?.user]);

  useEffect(() => {
    if (initializing) return;
    void refresh();
  }, [initializing, refresh]);

  const value = useMemo(() => ({ isPremium, loading, refresh }), [isPremium, loading, refresh]);
  return <PremiumContext.Provider value={value}>{children}</PremiumContext.Provider>;
}

export function usePremium(): PremiumContextValue {
  const v = useContext(PremiumContext);
  if (!v) throw new Error("usePremium must be used within PremiumProvider");
  return v;
}

