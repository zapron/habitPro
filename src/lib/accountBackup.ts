import AsyncStorage from "@react-native-async-storage/async-storage";
import type { HabitStore } from "../types/habit";

type AccountBackupSnapshot = Pick<HabitStore, "habits" | "miniMissions" | "xp" | "username"> & {
  savedAt: string;
  reason: string;
};

const MAX_BACKUPS_PER_USER = 5;

function backupKey(userId: string): string {
  return `habitpro-account-backup:${userId}`;
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
  } catch (e) {
    if (__DEV__) console.warn("[habitPro] account backup failed", e);
  }
}
