import { useCallback, useEffect, useRef } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { InteractionManager } from "react-native";
import { useAuth } from "../context/AuthContext";
import { saveAccountSnapshotBackup } from "../lib/accountBackup";
import { pullFromSupabase } from "../lib/sync";
import {
  hasPendingRemoteSync,
  hasRemoteSyncFault,
  requestRemoteSync,
  subscribeSyncFailure,
  subscribeSyncSuccess,
} from "../lib/syncQueue";
import { useHabitStore } from "../store/habitStore";
import type { HabitStore, MiniMission } from "../types/habit";

const REMOTE_FOCUS_REFRESH_TTL_MS = 60_000;
const lastRemoteFocusRefreshAtByUserId = new Map<string, number>();
let lastRemoteFocusUserId: string | null = null;

type RemoteStoreSnapshot = Awaited<ReturnType<typeof pullFromSupabase>>;
type RefreshOptions = { force?: boolean };

function shouldPreserveLocalMini(remoteMini: MiniMission, localMini: MiniMission): boolean {
  if (localMini.status === "completed" && remoteMini.status !== "completed") {
    return true;
  }
  if (
    localMini.status === "in_progress" &&
    remoteMini.status !== "completed" &&
    remoteMini.status !== "cancelled"
  ) {
    const localStarted = localMini.startedAt ? new Date(localMini.startedAt).getTime() : 0;
    const remoteStarted = remoteMini.startedAt ? new Date(remoteMini.startedAt).getTime() : 0;
    return remoteMini.status !== "in_progress" || localStarted > remoteStarted;
  }
  return false;
}

function preserveLocalMiniProgress(
  remote: RemoteStoreSnapshot,
  local: Pick<HabitStore, "miniMissions">,
): { snapshot: RemoteStoreSnapshot; preserved: boolean } {
  let preserved = false;
  const localById = new Map(local.miniMissions.map((m) => [m.id, m]));
  const remoteIds = new Set(remote.miniMissions.map((m) => m.id));
  const miniMissions = remote.miniMissions.map((remoteMini): MiniMission => {
    const localMini = localById.get(remoteMini.id);
    if (localMini && shouldPreserveLocalMini(remoteMini, localMini)) {
      preserved = true;
      return localMini;
    }
    return remoteMini;
  });

  for (const localMini of local.miniMissions) {
    if (
      (localMini.status === "completed" || localMini.status === "in_progress") &&
      !remoteIds.has(localMini.id)
    ) {
      preserved = true;
      miniMissions.push(localMini);
    }
  }

  return {
    snapshot: preserved ? { ...remote, miniMissions } : remote,
    preserved,
  };
}

export function useRemoteStoreRefreshOnFocus(enabled = true) {
  const { session, supabaseConfigured, syncReady } = useAuth();
  const userId = session?.user?.id ?? null;
  const busyRef = useRef(false);

  const refresh = useCallback(async (options?: RefreshOptions) => {
    if (!enabled || !supabaseConfigured || !syncReady || !userId || busyRef.current) {
      return;
    }

    busyRef.current = true;
    try {
      if (hasPendingRemoteSync() || hasRemoteSyncFault()) {
        return;
      }
      if (lastRemoteFocusUserId !== userId) {
        lastRemoteFocusRefreshAtByUserId.clear();
        lastRemoteFocusUserId = userId;
      }
      const now = Date.now();
      const lastRefreshAt = lastRemoteFocusRefreshAtByUserId.get(userId) ?? 0;
      if (!options?.force && now - lastRefreshAt < REMOTE_FOCUS_REFRESH_TTL_MS) {
        return;
      }
      const local = useHabitStore.getState();
      const remote = await pullFromSupabase(userId, { includeCohortPeerHabits: false });
      const remoteWithLocalPeers = {
        ...remote,
        cohortPeerHabits: local.cohortPeerHabits,
      };
      const { snapshot, preserved } = preserveLocalMiniProgress(remoteWithLocalPeers, local);
      void saveAccountSnapshotBackup(userId, local, "pre-focus-refresh");
      useHabitStore.setState(snapshot);
      void saveAccountSnapshotBackup(userId, snapshot, "focus-refresh");
      lastRemoteFocusRefreshAtByUserId.set(userId, Date.now());
      if (preserved) {
        requestRemoteSync({ immediate: true });
      }
    } catch (e) {
      if (__DEV__) console.warn("[habitPro] remote focus refresh failed", e);
    } finally {
      busyRef.current = false;
    }
  }, [enabled, supabaseConfigured, syncReady, userId]);

  useEffect(() => {
    if (!userId) {
      lastRemoteFocusUserId = null;
      lastRemoteFocusRefreshAtByUserId.clear();
      return undefined;
    }
    const invalidate = () => {
      lastRemoteFocusRefreshAtByUserId.delete(userId);
    };
    const unsubSuccess = subscribeSyncSuccess(invalidate);
    const unsubFailure = subscribeSyncFailure(invalidate);
    return () => {
      unsubSuccess();
      unsubFailure();
    };
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      const task = InteractionManager.runAfterInteractions(() => {
        void refresh();
      });
      return () => task.cancel();
    }, [refresh]),
  );

  return refresh;
}
