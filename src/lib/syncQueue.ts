import type { HabitStore } from "../types/habit";
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
let commitSyncedSnapshot: ((snapshot: Snapshot) => { hasMoreDirty: boolean }) | null = null;

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let syncGeneration = 0;
type ScheduledInteractionTask = { cancel: () => void };
const scheduledInteractionTasks = new Set<ScheduledInteractionTask>();
let inFlightPushes = 0;
let queuedSyncAfterInFlight = false;
let failedSinceLastSuccess = false;
let localMutationGeneration = 0;
const DEFAULT_DEBOUNCE_MS = 900;
const IMMEDIATE_DEBOUNCE_MS = 700;
const REMOTE_DELETE_DELAY_MS = 4500;

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

export function registerSyncCommitHandler(fn: (snapshot: Snapshot) => { hasMoreDirty: boolean }) {
  commitSyncedSnapshot = fn;
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
  const disabling = !enabled;
  userId = uid;
  syncEnabled = enabled;
  if (userChanged || disabling) {
    syncGeneration += 1;
    failedSinceLastSuccess = false;
  }
  if (disabling && debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  if (userChanged || disabling) {
    scheduledInteractionTasks.forEach((task) => task.cancel());
    scheduledInteractionTasks.clear();
  }
}

export function noteLocalStoreMutation() {
  localMutationGeneration += 1;
}

export function getLocalStoreMutationGeneration(): number {
  return localMutationGeneration;
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

function runAfterIdle(task: () => void, delayMs = 0) {
  let interactionTask: ReturnType<typeof InteractionManager.runAfterInteractions> | null = null;
  let scheduledTask: ScheduledInteractionTask;
  const timer = setTimeout(() => {
    interactionTask = InteractionManager.runAfterInteractions(() => {
      scheduledInteractionTasks.delete(scheduledTask);
      task();
    });
  }, delayMs);
  scheduledTask = {
    cancel: () => {
      clearTimeout(timer);
      interactionTask?.cancel();
      scheduledInteractionTasks.delete(scheduledTask);
    },
  };
  scheduledInteractionTasks.add(scheduledTask);
}

function flush() {
  if (!canPush()) return;
  if (inFlightPushes > 0) {
    queuedSyncAfterInFlight = true;
    return;
  }
  const flushUserId = userId;
  if (!flushUserId) return;
  const flushGeneration = syncGeneration;
  const snap = getSnapshot!();
  void saveAccountSnapshotBackup(flushUserId, snap, "pre-remote-push");
  inFlightPushes += 1;
  let finished = false;
  const finishPush = () => {
    if (finished) return;
    finished = true;
    inFlightPushes = Math.max(0, inFlightPushes - 1);
  };
  let scheduledTask: ScheduledInteractionTask;
  const interactionTask = InteractionManager.runAfterInteractions(() => {
    scheduledInteractionTasks.delete(scheduledTask);
    if (!syncEnabled || userId !== flushUserId || syncGeneration !== flushGeneration) {
      finishPush();
      return;
    }
    pushFullState(flushUserId, snap)
      .then(() => {
        if (!syncEnabled || userId !== flushUserId || syncGeneration !== flushGeneration) return;
        const commitResult = commitSyncedSnapshot?.(snap);
        notifySyncSuccess();
        if (commitResult?.hasMoreDirty) {
          requestRemoteSync({ immediate: false });
        }
      })
      .catch((e) => {
        console.warn("[habitPro] remote sync failed", e);
        notifySyncFailure(e);
      })
      .finally(() => {
        finishPush();
        if (queuedSyncAfterInFlight) {
          queuedSyncAfterInFlight = false;
          requestRemoteSync({ immediate: false, debounceMs: DEFAULT_DEBOUNCE_MS });
        }
      });
  });
  scheduledTask = {
    cancel: () => {
      interactionTask.cancel();
      scheduledInteractionTasks.delete(scheduledTask);
      finishPush();
    },
  };
  scheduledInteractionTasks.add(scheduledTask);
}

export function hasPendingRemoteSync(): boolean {
  return Boolean(debounceTimer || inFlightPushes > 0 || queuedSyncAfterInFlight);
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
  const debounceMs = immediate
    ? Math.min(options?.debounceMs ?? IMMEDIATE_DEBOUNCE_MS, DEFAULT_DEBOUNCE_MS)
    : options?.debounceMs ?? DEFAULT_DEBOUNCE_MS;

  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }

  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    flush();
  }, debounceMs);
}

export function requestRemoteHabitDelete(habitId: string) {
  if (!canWriteRemote() || !habitId) return;
  const deleteUserId = userId!;
  const deleteGeneration = syncGeneration;
  runAfterIdle(() => {
    if (!syncEnabled || userId !== deleteUserId || syncGeneration !== deleteGeneration) return;
    inFlightPushes += 1;
    void deleteRemoteHabit(deleteUserId, habitId)
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
  }, REMOTE_DELETE_DELAY_MS);
}

export function requestRemoteMiniMissionDelete(miniMissionId: string) {
  if (!canWriteRemote() || !miniMissionId) return;
  const deleteUserId = userId!;
  const deleteGeneration = syncGeneration;
  runAfterIdle(() => {
    if (!syncEnabled || userId !== deleteUserId || syncGeneration !== deleteGeneration) return;
    inFlightPushes += 1;
    void deleteRemoteMiniMission(deleteUserId, miniMissionId)
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
  }, REMOTE_DELETE_DELAY_MS);
}
