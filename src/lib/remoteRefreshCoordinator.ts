import { pullCohortPeerHabitsFromSupabase } from "./sync";
import { getRemoteSyncUserId } from "./syncQueue";
import { subscribeSyncSuccess } from "./syncQueue";
import { useHabitStore } from "../store/habitStore";

const COHORT_PEER_REFRESH_TTL_MS = 60_000;

let lastCohortRefreshAt = 0;
let lastCohortUserId: string | null = null;
let cohortRefreshInFlight: Promise<void> | null = null;

export function invalidateCohortPeerHabitsCache(userId?: string | null) {
  const uid = userId ?? getRemoteSyncUserId();
  if (uid && lastCohortUserId === uid) {
    lastCohortRefreshAt = 0;
  }
}

/**
 * Cohort peer habits with TTL and in-flight dedupe (challenge focus, home spark, etc.).
 */
export async function refreshCohortPeerHabitsCached(options?: { force?: boolean }): Promise<void> {
  const uid = getRemoteSyncUserId();
  if (!uid) return;

  if (lastCohortUserId !== uid) {
    lastCohortUserId = uid;
    lastCohortRefreshAt = 0;
  }

  const now = Date.now();
  if (!options?.force && now - lastCohortRefreshAt < COHORT_PEER_REFRESH_TTL_MS) {
    return;
  }

  if (cohortRefreshInFlight) {
    return cohortRefreshInFlight;
  }

  cohortRefreshInFlight = (async () => {
    try {
      const cohortPeerHabits = await pullCohortPeerHabitsFromSupabase(uid);
      useHabitStore.getState().setCohortPeerHabits(cohortPeerHabits);
      lastCohortRefreshAt = Date.now();
    } finally {
      cohortRefreshInFlight = null;
    }
  })();

  return cohortRefreshInFlight;
}

/** Uncached pull (sign-in hydrate paths, explicit user actions). */
export async function refreshCohortPeerHabitsImmediate(): Promise<void> {
  const uid = getRemoteSyncUserId();
  if (!uid) return;
  const cohortPeerHabits = await pullCohortPeerHabitsFromSupabase(uid);
  useHabitStore.getState().setCohortPeerHabits(cohortPeerHabits);
  lastCohortRefreshAt = Date.now();
  lastCohortUserId = uid;
}

let syncInvalidationBound = false;

export function ensureCohortCacheInvalidatesOnSyncSuccess() {
  if (syncInvalidationBound) return;
  syncInvalidationBound = true;
  subscribeSyncSuccess(() => {
    invalidateCohortPeerHabitsCache();
  });
}
