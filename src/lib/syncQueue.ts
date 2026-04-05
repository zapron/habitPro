import type { HabitStore } from "../types/habit";
import { pushFullState } from "./sync";

type Snapshot = Pick<HabitStore, "habits" | "miniMissions" | "xp">;

let userId: string | null = null;
let syncEnabled = false;
let getSnapshot: (() => Snapshot) | null = null;

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
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
  syncFailureListeners.forEach((l) => {
    try {
      l(error);
    } catch {
      /* ignore listener errors */
    }
  });
}

function notifySyncSuccess() {
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
  userId = uid;
  syncEnabled = enabled;
  if (!enabled && debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
}

function canPush(): boolean {
  return Boolean(syncEnabled && userId && getSnapshot);
}

function flush() {
  if (!canPush()) return;
  const snap = getSnapshot!();
  void pushFullState(userId!, snap)
    .then(() => {
      notifySyncSuccess();
    })
    .catch((e) => {
      console.warn("[habitPro] remote sync failed", e);
      notifySyncFailure(e);
    });
}

/**
 * Queue a push of habits / mini missions / xp to Supabase.
 * Use `immediate: true` when creating missions so rows appear in the DB right away.
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
