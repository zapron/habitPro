import { useEffect, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { useHabitStore } from "../store/habitStore";
import { pushFullState } from "../lib/sync";

const DEBOUNCE_MS = 700;

/**
 * Pushes local habit/mini/xp state to Supabase after changes (debounced).
 * Only runs when `syncReady` so the initial hydrate does not race with a stale push.
 */
export function SyncManager() {
  const { session, syncReady, supabaseConfigured } = useAuth();
  const userId = session?.user?.id;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSnapshotRef = useRef<string>("");

  useEffect(() => {
    if (!supabaseConfigured || !userId || !syncReady) return;

    const unsub = useHabitStore.subscribe((state) => {
      const snap = JSON.stringify({
        habits: state.habits,
        miniMissions: state.miniMissions,
        xp: state.xp,
      });
      if (snap === lastSnapshotRef.current) return;
      lastSnapshotRef.current = snap;

      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        const s = useHabitStore.getState();
        void pushFullState(userId, {
          habits: s.habits,
          miniMissions: s.miniMissions,
          xp: s.xp,
        }).catch((e) => console.warn("[habitPro] sync failed", e));
      }, DEBOUNCE_MS);
    });

    return () => {
      unsub();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [session?.user?.id, supabaseConfigured, syncReady, userId]);

  return null;
}
