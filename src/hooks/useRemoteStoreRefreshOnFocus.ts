import { useCallback, useRef } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { useAuth } from "../context/AuthContext";
import { pullFromSupabase } from "../lib/sync";
import { useHabitStore } from "../store/habitStore";

export function useRemoteStoreRefreshOnFocus(enabled = true) {
  const { session, supabaseConfigured, syncReady } = useAuth();
  const userId = session?.user?.id ?? null;
  const busyRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!enabled || !supabaseConfigured || !syncReady || !userId || busyRef.current) {
      return;
    }

    busyRef.current = true;
    try {
      const remote = await pullFromSupabase(userId);
      useHabitStore.setState(remote);
    } catch (e) {
      if (__DEV__) console.warn("[habitPro] remote focus refresh failed", e);
    } finally {
      busyRef.current = false;
    }
  }, [enabled, supabaseConfigured, syncReady, userId]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
      return undefined;
    }, [refresh]),
  );

  return refresh;
}
