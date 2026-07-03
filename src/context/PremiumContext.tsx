import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AppState, InteractionManager } from "react-native";
import { useAuth } from "./AuthContext";
import { useBilling } from "./BillingContext";
import { isSupabaseConfigured } from "../lib/env";
import {
  fetchCommunityAccessStatusForCurrentUser,
  type CommunityAccessStatus,
} from "../lib/communityAccessApi";
import { getSupabase } from "../lib/supabase";

const APP_ACTIVE_PREMIUM_REFRESH_IDLE_MS = 5 * 60 * 1000;

type PremiumContextValue = {
  /**
   * HabitPro Community access: backend effective access (paid/admin/trial) **or**
   * active RevenueCat entitlement on device (covers Test Store and before webhook lands).
   */
  isPremium: boolean;
  accessStatus: CommunityAccessStatus | null;
  /** True while waiting on profile fetch when RC has not already granted access. */
  loading: boolean;
  refresh: () => Promise<boolean>;
};

const PremiumContext = createContext<PremiumContextValue | null>(null);

export function PremiumProvider({ children }: { children: React.ReactNode }) {
  const { session, initializing } = useAuth();
  const { hasCommunityAccess } = useBilling();
  const [accessStatus, setAccessStatus] = useState<CommunityAccessStatus | null>(null);
  const [accessStatusUserId, setAccessStatusUserId] = useState<string | null>(null);
  const [dbLoading, setDbLoading] = useState(false);
  const activeUserIdRef = useRef<string | null>(null);
  const lastInactiveAtRef = useRef<number | null>(null);

  const userId = session?.user?.id ?? null;

  useEffect(() => {
    activeUserIdRef.current = userId;
    setAccessStatus(null);
    setAccessStatusUserId(null);
    setDbLoading(false);
    lastInactiveAtRef.current = null;
  }, [userId]);

  const refresh = useCallback(async () => {
    if (!isSupabaseConfigured() || !userId) {
      setAccessStatus(null);
      setAccessStatusUserId(null);
      setDbLoading(false);
      return false;
    }
    const requestedUserId = userId;
    setDbLoading(true);
    try {
      const status = await fetchCommunityAccessStatusForCurrentUser();
      const next = status?.hasAccess === true;
      if (activeUserIdRef.current === requestedUserId) {
        setAccessStatus(status);
        setAccessStatusUserId(requestedUserId);
        return next;
      }
      return false;
    } catch (e) {
      if (__DEV__) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn("[habitPro] Community access refresh failed:", msg);
      }
      if (activeUserIdRef.current === requestedUserId) {
        setAccessStatus(null);
        setAccessStatusUserId(requestedUserId);
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
    const task = InteractionManager.runAfterInteractions(() => {
      void refresh();
    });
    return () => {
      task.cancel?.();
    };
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

    let channel: ReturnType<typeof supabase.channel> | null = null;
    const task = InteractionManager.runAfterInteractions(() => {
      channel = supabase
        .channel(`community_access_${userId}`)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "profiles",
            filter: `id=eq.${userId}`,
          },
          () => {
            if (activeUserIdRef.current !== userId) return;
            void refresh();
          },
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "community_access_grants",
            filter: `user_id=eq.${userId}`,
          },
          () => {
            if (activeUserIdRef.current !== userId) return;
            void refresh();
          },
        )
        .subscribe();
    });

    return () => {
      task.cancel?.();
      if (channel) supabase.removeChannel(channel);
    };
  }, [initializing, userId, refresh]);

  const accessStatusForCurrentUser = accessStatusUserId === userId ? accessStatus : null;
  const serverAccessForCurrentUser = accessStatusForCurrentUser?.hasAccess === true;
  const isPremium = serverAccessForCurrentUser || hasCommunityAccess;
  const hasDbPremiumSnapshot = !userId || accessStatusUserId === userId || !isSupabaseConfigured();
  const loading =
    !hasCommunityAccess &&
    (initializing || dbLoading || (Boolean(userId) && !hasDbPremiumSnapshot));

  const value = useMemo(
    () => ({ isPremium, accessStatus: accessStatusForCurrentUser, loading, refresh }),
    [accessStatusForCurrentUser, isPremium, loading, refresh],
  );
  return <PremiumContext.Provider value={value}>{children}</PremiumContext.Provider>;
}

export function usePremium(): PremiumContextValue {
  const v = useContext(PremiumContext);
  if (!v) throw new Error("usePremium must be used within PremiumProvider");
  return v;
}
