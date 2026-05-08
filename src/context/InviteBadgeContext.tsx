import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import { isSupabaseConfigured } from "../lib/env";
import { countPendingInvitesForMe } from "../lib/groupChallengesApi";
import { countPendingLiveMiniInvitesForMe } from "../lib/liveMiniMissionsApi";
import { useAuth } from "./AuthContext";

type InviteBadgeContextValue = {
  pendingInviteCount: number;
  refreshing: boolean;
  refreshInviteBadge: (options?: { force?: boolean }) => Promise<void>;
  syncInviteBadgeCount: (count: number) => void;
};

const INVITE_BADGE_REFRESH_TTL_MS = 45_000;

const InviteBadgeContext = createContext<InviteBadgeContextValue | null>(null);

export function InviteBadgeProvider({ children }: { children: React.ReactNode }) {
  const { session, initializing } = useAuth();
  const userId = session?.user?.id ?? null;
  const [pendingInviteCount, setPendingInviteCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const requestIdRef = useRef(0);
  const refreshInFlightRef = useRef(false);
  const lastRefreshAtRef = useRef(0);

  const syncInviteBadgeCount = useCallback((count: number) => {
    lastRefreshAtRef.current = Date.now();
    setPendingInviteCount(Math.max(0, Math.floor(count)));
  }, []);

  const refreshInviteBadge = useCallback(async (options?: { force?: boolean }) => {
    if (initializing || !userId || !isSupabaseConfigured()) {
      requestIdRef.current += 1;
      setPendingInviteCount(0);
      lastRefreshAtRef.current = 0;
      return;
    }
    if (refreshInFlightRef.current) return;
    const now = Date.now();
    if (!options?.force && now - lastRefreshAtRef.current < INVITE_BADGE_REFRESH_TTL_MS) {
      return;
    }
    const requestId = ++requestIdRef.current;
    refreshInFlightRef.current = true;
    setRefreshing(true);
    try {
      const [groupCount, liveMiniCount] = await Promise.all([
        countPendingInvitesForMe(),
        countPendingLiveMiniInvitesForMe(),
      ]);
      if (requestIdRef.current !== requestId) return;
      setPendingInviteCount(groupCount + liveMiniCount);
      lastRefreshAtRef.current = Date.now();
    } catch (e) {
      console.warn("[habitPro] refreshInviteBadge", e);
    } finally {
      refreshInFlightRef.current = false;
      if (requestIdRef.current === requestId) setRefreshing(false);
    }
  }, [initializing, userId]);

  useEffect(() => {
    if (!userId || initializing) {
      setPendingInviteCount(0);
      lastRefreshAtRef.current = 0;
      return;
    }
    void refreshInviteBadge({ force: true });
  }, [initializing, refreshInviteBadge, userId]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void refreshInviteBadge();
    });
    return () => sub.remove();
  }, [refreshInviteBadge]);

  const value = useMemo<InviteBadgeContextValue>(
    () => ({
      pendingInviteCount,
      refreshing,
      refreshInviteBadge,
      syncInviteBadgeCount,
    }),
    [pendingInviteCount, refreshing, refreshInviteBadge, syncInviteBadgeCount],
  );

  return <InviteBadgeContext.Provider value={value}>{children}</InviteBadgeContext.Provider>;
}

export function useInviteBadge(): InviteBadgeContextValue {
  const ctx = useContext(InviteBadgeContext);
  if (!ctx) throw new Error("useInviteBadge must be used within InviteBadgeProvider");
  return ctx;
}
