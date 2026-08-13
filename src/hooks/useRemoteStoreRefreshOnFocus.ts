import { useCallback, useEffect, useRef } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { InteractionManager } from "react-native";
import { useAuth } from "../context/AuthContext";
import { saveAccountSnapshotBackup } from "../lib/accountBackup";
import {
  applyFocusDeltaToStore,
  pullFocusDeltaFromSupabase,
  pullFromSupabase,
  type RemoteSnapshot,
} from "../lib/sync";
import {
  getLocalStoreMutationGeneration,
  hasPendingRemoteSync,
  hasRemoteSyncFault,
  requestRemoteSync,
  subscribeSyncFailure,
  subscribeSyncSuccess,
} from "../lib/syncQueue";
import {
  getRemoteFocusLastRefreshAt,
  invalidateRemoteFocusRefresh,
  markRemoteFocusRefreshFresh,
} from "../lib/remoteFocusRefreshCache";
import { useHabitStore } from "../store/habitStore";
import type { HabitStore, MiniMission } from "../types/habit";

const REMOTE_FOCUS_REFRESH_TTL_MS = 60_000;
const REMOTE_FOCUS_REFRESH_DELAY_MS = 1200;

type RemoteStoreSnapshot = RemoteSnapshot;
type RefreshOptions = { force?: boolean };

function hasLocalRemoteWork(
  state: Pick<
    HabitStore,
    | "dirtyHabitIds"
    | "dirtyMiniMissionIds"
    | "pendingDeleteHabitIds"
    | "pendingDeleteMiniMissionIds"
    | "pendingResetHabitIds"
  >,
): boolean {
  return (
    (state.dirtyHabitIds?.length ?? 0) > 0 ||
    (state.dirtyMiniMissionIds?.length ?? 0) > 0 ||
    (state.pendingDeleteHabitIds?.length ?? 0) > 0 ||
    (state.pendingDeleteMiniMissionIds?.length ?? 0) > 0 ||
    (state.pendingResetHabitIds?.length ?? 0) > 0
  );
}

function shouldPreserveLocalMini(remoteMini: MiniMission, localMini: MiniMission): boolean {
  if (localMini.status === "completed" && remoteMini.status !== "completed") {
    return true;
  }
  if (
    localMini.status === "missed" &&
    remoteMini.status !== "completed" &&
    remoteMini.status !== "missed"
  ) {
    return true;
  }
  if (
    localMini.status === "in_progress" &&
    remoteMini.status !== "completed" &&
    remoteMini.status !== "missed" &&
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
    // draftTasks is local-only (never pushed/pulled, see MiniMission.draftTasks) — even
    // when the remote mini otherwise wins, an in-progress checklist run's logged-so-far
    // tasks must still survive, or they silently vanish the moment this mission's dirty
    // flag happens to clear from some unrelated field push before the user finishes.
    if (localMini?.draftTasks && remoteMini.status === "in_progress" && !remoteMini.draftTasks) {
      preserved = true;
      return { ...remoteMini, draftTasks: localMini.draftTasks };
    }
    return remoteMini;
  });

  for (const localMini of local.miniMissions) {
    if (
      (localMini.status === "completed" || localMini.status === "missed" || localMini.status === "in_progress") &&
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
      const local = useHabitStore.getState();
      if (hasLocalRemoteWork(local)) {
        requestRemoteSync({ immediate: true });
        return;
      }
      if (hasPendingRemoteSync() || hasRemoteSyncFault()) {
        return;
      }
      const now = Date.now();
      const lastRefreshAt = getRemoteFocusLastRefreshAt(userId);
      if (!options?.force && now - lastRefreshAt < REMOTE_FOCUS_REFRESH_TTL_MS) {
        return;
      }
      if (
        !options?.force &&
        hasLocalRemoteWork(local)
      ) {
        requestRemoteSync({ immediate: true });
        return;
      }
      const startedMutationGeneration = getLocalStoreMutationGeneration();
      let remoteWithLocalPeers: RemoteStoreSnapshot;
      if (!options?.force && lastRefreshAt > 0) {
        const delta = await pullFocusDeltaFromSupabase(userId, lastRefreshAt);
        if (delta) {
          remoteWithLocalPeers = applyFocusDeltaToStore(local, delta.partial, delta.deleted);
        } else {
          const remote = await pullFromSupabase(userId, { includeCohortPeerHabits: false });
          remoteWithLocalPeers = { ...remote, cohortPeerHabits: local.cohortPeerHabits };
        }
      } else {
        const remote = await pullFromSupabase(userId, { includeCohortPeerHabits: false });
        remoteWithLocalPeers = { ...remote, cohortPeerHabits: local.cohortPeerHabits };
      }
      const latestLocal = useHabitStore.getState();
      if (
        hasLocalRemoteWork(latestLocal) ||
        (!options?.force &&
          (hasPendingRemoteSync() ||
          hasRemoteSyncFault() ||
          getLocalStoreMutationGeneration() !== startedMutationGeneration))
      ) {
        if (hasLocalRemoteWork(latestLocal)) {
          requestRemoteSync({ immediate: true });
        }
        return;
      }
      const { snapshot, preserved } = preserveLocalMiniProgress(remoteWithLocalPeers, latestLocal);
      useHabitStore.setState(snapshot);
      void saveAccountSnapshotBackup(userId, snapshot, "focus-refresh");
      markRemoteFocusRefreshFresh(userId);
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
      invalidateRemoteFocusRefresh(null);
      return undefined;
    }
    const invalidate = () => {
      invalidateRemoteFocusRefresh(userId);
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
      let task: { cancel: () => void } | null = null;
      const timer = setTimeout(() => {
        task = InteractionManager.runAfterInteractions(() => {
          void refresh();
        });
      }, REMOTE_FOCUS_REFRESH_DELAY_MS);
      return () => {
        clearTimeout(timer);
        task?.cancel();
      };
    }, [refresh]),
  );

  return refresh;
}
