import AsyncStorage from "@react-native-async-storage/async-storage";
import { InteractionManager } from "react-native";
import type { HabitStore } from "../types/habit";

export type AccountBackupSnapshot = Pick<HabitStore, "habits" | "miniMissions" | "xp" | "username"> & {
  savedAt: string;
  reason: string;
};

export type AccountDeletedMissionIds = {
  habitIds: string[];
  miniMissionIds: string[];
};

const MAX_BACKUPS_PER_USER = 5;
const BACKUP_SAVE_DELAY_MS = 1200;
const MIN_BACKUP_INTERVAL_MS = 5 * 60 * 1000;
const MAX_DELETED_IDS_PER_USER = 250;

let cachedBackups: { [userId: string]: AccountBackupSnapshot[] } = {};
let cachedDeletedMissionIds: { [userId: string]: AccountDeletedMissionIds } = {};
const pendingBackupSaves = new Map<
  string,
  {
    snapshot: Pick<HabitStore, "habits" | "miniMissions" | "xp" | "username">;
    reason: string;
    timer: ReturnType<typeof setTimeout>;
    resolve: Array<() => void>;
    reject: Array<(error: unknown) => void>;
  }
>();

function backupKey(userId: string): string {
  return `habitpro-account-backup:${userId}`;
}

function deletedMissionIdsKey(userId: string): string {
  return `habitpro-account-deleted-missions:${userId}`;
}

function isBackupSnapshot(value: unknown): value is AccountBackupSnapshot {
  if (!value || typeof value !== "object") return false;
  const rec = value as Partial<AccountBackupSnapshot>;
  return (
    Array.isArray(rec.habits) &&
    Array.isArray(rec.miniMissions) &&
    typeof rec.xp === "number" &&
    (typeof rec.username === "string" || rec.username === null) &&
    typeof rec.savedAt === "string" &&
    typeof rec.reason === "string"
  );
}

function normalizeDeletedMissionIds(value: unknown): AccountDeletedMissionIds {
  if (!value || typeof value !== "object") return { habitIds: [], miniMissionIds: [] };
  const rec = value as Partial<Record<keyof AccountDeletedMissionIds, unknown>>;
  const habitIds = Array.isArray(rec.habitIds)
    ? rec.habitIds.filter((id): id is string => typeof id === "string" && id.length > 0)
    : [];
  const miniMissionIds = Array.isArray(rec.miniMissionIds)
    ? rec.miniMissionIds.filter((id): id is string => typeof id === "string" && id.length > 0)
    : [];
  return {
    habitIds: [...new Set(habitIds)].slice(0, MAX_DELETED_IDS_PER_USER),
    miniMissionIds: [...new Set(miniMissionIds)].slice(0, MAX_DELETED_IDS_PER_USER),
  };
}

export async function listAccountSnapshotBackups(
  userId: string | null | undefined,
): Promise<AccountBackupSnapshot[]> {
  if (!userId) return [];
  if (cachedBackups[userId]) {
    return cachedBackups[userId];
  }
  try {
    const raw = await AsyncStorage.getItem(backupKey(userId));
    const parsed = raw ? JSON.parse(raw) : [];
    const backups = Array.isArray(parsed) ? parsed.filter(isBackupSnapshot) : [];
    cachedBackups[userId] = backups;
    return backups;
  } catch (e) {
    if (__DEV__) console.warn("[habitPro] account backup read failed", e);
    return [];
  }
}

export async function listAccountDeletedMissionIds(
  userId: string | null | undefined,
): Promise<AccountDeletedMissionIds> {
  if (!userId) return { habitIds: [], miniMissionIds: [] };
  if (cachedDeletedMissionIds[userId]) {
    return cachedDeletedMissionIds[userId];
  }
  try {
    const raw = await AsyncStorage.getItem(deletedMissionIdsKey(userId));
    const parsed = raw ? JSON.parse(raw) : null;
    const deletedIds = normalizeDeletedMissionIds(parsed);
    cachedDeletedMissionIds[userId] = deletedIds;
    return deletedIds;
  } catch (e) {
    if (__DEV__) console.warn("[habitPro] deleted mission ids read failed", e);
    return { habitIds: [], miniMissionIds: [] };
  }
}

export async function recordAccountDeletedMissionId(
  userId: string | null | undefined,
  kind: "habit" | "miniMission",
  missionId: string,
): Promise<void> {
  if (!userId || !missionId) return;
  try {
    const current = await listAccountDeletedMissionIds(userId);
    const next: AccountDeletedMissionIds = {
      habitIds:
        kind === "habit"
          ? [missionId, ...current.habitIds.filter((id) => id !== missionId)].slice(0, MAX_DELETED_IDS_PER_USER)
          : current.habitIds,
      miniMissionIds:
        kind === "miniMission"
          ? [missionId, ...current.miniMissionIds.filter((id) => id !== missionId)].slice(0, MAX_DELETED_IDS_PER_USER)
          : current.miniMissionIds,
    };
    cachedDeletedMissionIds[userId] = next;
    await AsyncStorage.setItem(deletedMissionIdsKey(userId), JSON.stringify(next));
  } catch (e) {
    if (__DEV__) console.warn("[habitPro] deleted mission id write failed", e);
  }
}

async function writeAccountSnapshotBackup(
  userId: string,
  snapshot: Pick<HabitStore, "habits" | "miniMissions" | "xp" | "username">,
  reason: string,
) {
  const key = backupKey(userId);
  const next: AccountBackupSnapshot = {
    habits: snapshot.habits,
    miniMissions: snapshot.miniMissions,
    xp: snapshot.xp,
    username: snapshot.username,
    savedAt: new Date().toISOString(),
    reason,
  };

  try {
    let previous = cachedBackups[userId];
    if (!previous) {
      const raw = await AsyncStorage.getItem(key);
      const parsed = raw ? JSON.parse(raw) : [];
      previous = Array.isArray(parsed) ? parsed.filter(isBackupSnapshot) : [];
    }
    const lastSavedAt = previous[0]?.savedAt ? new Date(previous[0].savedAt).getTime() : 0;
    if (Date.now() - lastSavedAt < MIN_BACKUP_INTERVAL_MS) {
      return;
    }
    const backups = [next, ...previous].slice(0, MAX_BACKUPS_PER_USER);
    await AsyncStorage.setItem(key, JSON.stringify(backups));
    // Update the in-memory cache
    cachedBackups[userId] = backups.filter(isBackupSnapshot);
  } catch (e) {
    if (__DEV__) console.warn("[habitPro] account backup failed", e);
  }
}

function flushPendingBackupSave(userId: string) {
  const job = pendingBackupSaves.get(userId);
  if (!job) return;
  pendingBackupSaves.delete(userId);
  InteractionManager.runAfterInteractions(() => {
    void writeAccountSnapshotBackup(userId, job.snapshot, job.reason)
      .then(() => {
        job.resolve.forEach((resolve) => resolve());
      })
      .catch((error) => {
        job.reject.forEach((reject) => reject(error));
      });
  });
}

export async function saveAccountSnapshotBackup(
  userId: string | null | undefined,
  snapshot: Pick<HabitStore, "habits" | "miniMissions" | "xp" | "username">,
  reason: string,
): Promise<void> {
  if (!userId) return;
  const cached = cachedBackups[userId];
  const lastSavedAt = cached?.[0]?.savedAt ? new Date(cached[0].savedAt).getTime() : 0;
  if (lastSavedAt > 0 && Date.now() - lastSavedAt < MIN_BACKUP_INTERVAL_MS) {
    return;
  }

  const previous = pendingBackupSaves.get(userId);
  if (previous) {
    clearTimeout(previous.timer);
    previous.resolve.forEach((resolve) => resolve());
  }

  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      flushPendingBackupSave(userId);
    }, BACKUP_SAVE_DELAY_MS);
    pendingBackupSaves.set(userId, {
      snapshot,
      reason,
      timer,
      resolve: [resolve],
      reject: [reject],
    });
  });
}
