import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useMemo, useState } from "react";

/**
 * Which finished-mission reports (accomplished / failed) the user hasn't
 * looked at yet, remembered per account on this device. The first time a user
 * has any reports, everything already there is treated as seen — so existing
 * users don't suddenly get a "new" marker for months-old reports.
 */
export function useUnseenReports(userId: string | null | undefined, reportKeys: string[]) {
  const storageKey = userId ? `habitpro.reportsSeen.${userId}` : null;
  const [seen, setSeen] = useState<Set<string> | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!storageKey) return;
    let cancelled = false;
    void AsyncStorage.getItem(storageKey).then((raw) => {
      if (cancelled) return;
      setSeen(raw ? new Set<string>(JSON.parse(raw) as string[]) : null);
      setLoadedKey(storageKey);
    });
    return () => {
      cancelled = true;
    };
  }, [storageKey]);

  // Baseline: first time this account has reports, mark them all as seen.
  useEffect(() => {
    if (!storageKey || loadedKey !== storageKey || seen !== null || reportKeys.length === 0) return;
    const baseline = new Set(reportKeys);
    setSeen(baseline);
    void AsyncStorage.setItem(storageKey, JSON.stringify([...baseline]));
  }, [storageKey, loadedKey, seen, reportKeys]);

  const unseenCount = useMemo(
    () => (seen ? reportKeys.filter((k) => !seen.has(k)).length : 0),
    [seen, reportKeys],
  );

  // No-op when nothing is new — otherwise every call would store a fresh Set,
  // re-create this callback, and loop any effect that calls it.
  const markAllSeen = useCallback(() => {
    if (!storageKey || loadedKey !== storageKey || reportKeys.length === 0) return;
    if (seen && reportKeys.every((k) => seen.has(k))) return;
    const next = new Set([...(seen ?? []), ...reportKeys]);
    setSeen(next);
    void AsyncStorage.setItem(storageKey, JSON.stringify([...next]));
  }, [storageKey, loadedKey, reportKeys, seen]);

  return { unseenCount, markAllSeen };
}
