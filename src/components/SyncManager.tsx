import { useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { setRemoteSyncContext } from "../lib/syncQueue";

/**
 * Enables remote Supabase sync after auth + initial hydrate (syncReady).
 * Actual pushes are triggered from the habit store (immediate on new missions,
 * debounced on other updates).
 */
export function SyncManager() {
  const { session, syncReady, supabaseConfigured } = useAuth();
  const userId = session?.user?.id;

  useEffect(() => {
    if (!supabaseConfigured) {
      setRemoteSyncContext(null, false);
      return;
    }
    const enabled = Boolean(syncReady && userId);
    setRemoteSyncContext(userId ?? null, enabled);
  }, [supabaseConfigured, syncReady, userId]);

  return null;
}
