import { useCallback, useRef } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { useAuth } from "../context/AuthContext";
import { pullFromSupabase } from "../lib/sync";
import { requestRemoteSync } from "../lib/syncQueue";
import { useHabitStore } from "../store/habitStore";
import type { HabitStore, MiniMission } from "../types/habit";

type RemoteStoreSnapshot = Awaited<ReturnType<typeof pullFromSupabase>>;

function preserveLocalCompletedMinis(
  remote: RemoteStoreSnapshot,
  local: Pick<HabitStore, "miniMissions">,
): { snapshot: RemoteStoreSnapshot; preserved: boolean } {
  let preserved = false;
  const localById = new Map(local.miniMissions.map((m) => [m.id, m]));
  const remoteIds = new Set(remote.miniMissions.map((m) => m.id));
  const miniMissions = remote.miniMissions.map((remoteMini): MiniMission => {
    const localMini = localById.get(remoteMini.id);
    if (localMini?.status === "completed" && remoteMini.status !== "completed") {
      preserved = true;
      return localMini;
    }
    return remoteMini;
  });

  for (const localMini of local.miniMissions) {
    if (localMini.status === "completed" && !remoteIds.has(localMini.id)) {
      preserved = true;
      miniMissions.push(localMini);
    }
  }

  return {
    snapshot: preserved ? { ...remote, miniMissions } : remote,
    preserved,
  };
}

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
      const local = useHabitStore.getState();
      const { snapshot, preserved } = preserveLocalCompletedMinis(remote, local);
      useHabitStore.setState(snapshot);
      if (preserved) {
        requestRemoteSync({ immediate: true });
      }
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
