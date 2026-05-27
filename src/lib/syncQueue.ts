import type { HabitStore } from "../types/habit";
import { useHabitStore } from "../store/habitStore";
import { InteractionManager } from "react-native";
import { saveAccountSnapshotBackup } from "./accountBackup";
import { deleteRemoteHabit, deleteRemoteMiniMission, pushFullState } from "./sync";

type Snapshot = Pick<
  HabitStore,
  "habits" | "miniMissions" | "xp" | "username" | "dirtyHabitIds" | "dirtyMiniMissionIds"
>;

let userId: string | null = null;
let syncEnabled = false;
let getSnapshot: (() => Snapshot) | null = null;

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let inFlightPushes = 0;
let failedSinceLastSuccess = false;
const DEFAULT_DEBOUNCE_MS = 450;

type SyncFailureListener = (error: unknown) => void;
type SyncSuccessListener = () => void;

const syncFailureListeners = new Set<SyncFailureListener>();
const syncSuccessListeners = new Set<SyncSuccessListener>();

export function subscribeSyncFailure(listener: SyncFailureListener): () => void {
  syncFailureListeners.add(listener);
  return () => {
    syncFailureListeners.delete(listener);
  };
}

export function subscribeSyncSuccess(listener: SyncSuccessListener): () => void {
  syncSuccessListeners.add(listener);
  return () => {
    syncSuccessListeners.delete(listener);
  };
}

function notifySyncFailure(error: unknown) {
  failedSinceLastSuccess = true;
  syncFailureListeners.forEach((l) => {
    try {
      l(error);
    } catch {
      /* ignore listener errors */
    }
  });
}

function notifySyncSuccess() {
  failedSinceLastSuccess = false;
  syncSuccessListeners.forEach((l) => {
    try {
      l();
    } catch {
      /* ignore listener errors */
    }
  });
}

export function registerSyncSnapshotGetter(fn: () => Snapshot) {
  getSnapshot = fn;
}

/**
 * Call when auth + initial hydrate are ready (or on sign-out).
 * When disabled, remote pushes are skipped (local persist still runs).
 */
/** Auth user id for the active session (set by SyncManager); use when stamping new missions. */
export function getRemoteSyncUserId(): string | null {
  return userId;
}

export function setRemoteSyncContext(uid: string | null, enabled: boolean) {
  const userChanged = userId !== uid;
  userId = uid;
  syncEnabled = enabled;
  if (userChanged || !enabled) {
    failedSinceLastSuccess = false;
  }
  if (!enabled && debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
}

/** Disable remote sync and cancel any queued debounce before account state is reset. */
export function disableAndCancelRemoteSync() {
  setRemoteSyncContext(null, false);
}

function canPush(): boolean {
  return Boolean(syncEnabled && userId && getSnapshot);
}

function canWriteRemote(): boolean {
  return Boolean(syncEnabled && userId);
}

function flush() {
  if (!canPush()) return;
  const snap = getSnapshot!();
  void saveAccountSnapshotBackup(userId, snap, "pre-remote-push");
  inFlightPushes += 1;
  InteractionManager.runAfterInteractions(() => {
    pushFullState(userId!, snap)
      .then(() => {
        // Clear the dirty flags in the store on successful sync
        useHabitStore.getState().clearDirtyState(snap.dirtyHabitIds, snap.dirtyMiniMissionIds);
        notifySyncSuccess();
      })
      .catch((e) => {
        console.warn("[habitPro] remote sync failed", e);
        notifySyncFailure(e);
      })
      .finally(() => {
        inFlightPushes = Math.max(0, inFlightPushes - 1);
      });
  });
}

export function hasPendingRemoteSync(): boolean {
  return Boolean(debounceTimer || inFlightPushes > 0);
}

export function hasRemoteSyncFault(): boolean {
  return failedSinceLastSuccess;
}

/**
 * Queue a push of habits / mini missions / xp to Supabase.
 * Use `immediate: true` for user-visible transitions that must survive focus refreshes.
 */
export function requestRemoteSync(options?: {
  immediate?: boolean;
  debounceMs?: number;
}) {
  if (!canPush()) return;

  const immediate = options?.immediate ?? false;
  const debounceMs = options?.debounceMs ?? DEFAULT_DEBOUNCE_MS;

  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }

  if (immediate) {
    flush();
    return;
  }

  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    flush();
  }, debounceMs);
}

export function requestRemoteHabitDelete(habitId: string) {
  if (!canWriteRemote() || !habitId) return;
  inFlightPushes += 1;
  void deleteRemoteHabit(userId!, habitId)
    .then(() => {
      notifySyncSuccess();
    })
    .catch((e) => {
      console.warn("[habitPro] remote habit delete failed", e);
      notifySyncFailure(e);
    })
    .finally(() => {
      inFlightPushes = Math.max(0, inFlightPushes - 1);
    });
}

export function requestRemoteMiniMissionDelete(miniMissionId: string) {
  if (!canWriteRemote() || !miniMissionId) return;
  inFlightPushes += 1;
  void deleteRemoteMiniMission(userId!, miniMissionId)
    .then(() => {
      notifySyncSuccess();
    })
    .catch((e) => {
      console.warn("[habitPro] remote mini mission delete failed", e);
      notifySyncFailure(e);
    })
    .finally(() => {
      inFlightPushes = Math.max(0, inFlightPushes - 1);
    });
}
