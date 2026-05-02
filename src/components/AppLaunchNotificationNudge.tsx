import { useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useNotificationGate } from "../context/NotificationGateContext";
import { isSupabaseConfigured } from "../lib/env";
import { shouldSkipRemotePushRegistration } from "../lib/pushTokens";

/**
 * One-time (per device) soft ask after cold start, once the user is signed in.
 * Delay matches splash minimum (~2s) + fade-out (~320ms) so the sheet does not sit under the overlay.
 */
const POST_SPLASH_SOFT_ASK_MS = 3000;

export function AppLaunchNotificationNudge() {
  const { session, initializing } = useAuth();
  const { suggestNotifications } = useNotificationGate();

  useEffect(() => {
    if (shouldSkipRemotePushRegistration()) return;
    if (!isSupabaseConfigured()) return;
    if (initializing || !session?.user?.id) return;

    const t = setTimeout(() => {
      void suggestNotifications("app_launch");
    }, POST_SPLASH_SOFT_ASK_MS);

    return () => clearTimeout(t);
  }, [session?.user?.id, initializing, suggestNotifications]);

  return null;
}
