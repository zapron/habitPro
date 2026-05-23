import AsyncStorage from "@react-native-async-storage/async-storage";
import type { HabitStore } from "../types/habit";

export type AccountBackupSnapshot = Pick<HabitStore, "habits" | "miniMissions" | "xp" | "username"> & {
  savedAt: string;
  reason: string;
};

const MAX_BACKUPS_PER_USER = 5;

let cachedBackups: { [userId: string]: AccountBackupSnapshot[] } = {};

function backupKey(userId: string): string {
  return `habitpro-account-backup:${userId}`;
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

export async function saveAccountSnapshotBackup(
  userId: string | null | undefined,
  snapshot: Pick<HabitStore, "habits" | "miniMissions" | "xp" | "username">,
  reason: string,
): Promise<void> {
  if (!userId) return;
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
    const raw = await AsyncStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    const previous = Array.isArray(parsed) ? parsed : [];
    const backups = [next, ...previous].slice(0, MAX_BACKUPS_PER_USER);
    await AsyncStorage.setItem(key, JSON.stringify(backups));
    // Update the in-memory cache
    cachedBackups[userId] = backups.filter(isBackupSnapshot);
  } catch (e) {
    if (__DEV__) console.warn("[habitPro] account backup failed", e);
  }
}
