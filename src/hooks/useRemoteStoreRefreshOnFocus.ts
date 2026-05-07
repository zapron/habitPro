import { useCallback, useRef } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { useAuth } from "../context/AuthContext";
import { saveAccountSnapshotBackup } from "../lib/accountBackup";
import { pullFromSupabase } from "../lib/sync";
import { hasPendingRemoteSync, hasRemoteSyncFault, requestRemoteSync } from "../lib/syncQueue";
import { useHabitStore } from "../store/habitStore";
import type { HabitStore, MiniMission } from "../types/habit";

type RemoteStoreSnapshot = Awaited<ReturnType<typeof pullFromSupabase>>;

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

  const refresh = useCallback(async () => {
    if (!enabled || !supabaseConfigured || !syncReady || !userId || busyRef.current) {
      return;
    }

    busyRef.current = true;
    try {
      if (hasPendingRemoteSync() || hasRemoteSyncFault()) {
        return;
      }
      const remote = await pullFromSupabase(userId);
      const local = useHabitStore.getState();
      const { snapshot, preserved } = preserveLocalMiniProgress(remote, local);
      void saveAccountSnapshotBackup(userId, local, "pre-focus-refresh");
      useHabitStore.setState(snapshot);
      void saveAccountSnapshotBackup(userId, snapshot, "focus-refresh");
      if (preserved) {
        requestRemoteSync({ immediate: true });
      }
    } catch (e) {
      if (__DEV__) console.warn("[habitPro] remote focus refresh failed", e);
    } finally {
      busyRef.current = false;
    }
  }, [enabled, supabaseConfigured, syncReady, userId]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
      return undefined;
    }, [refresh]),
  );

  return refresh;
}
