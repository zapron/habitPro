import { useEffect, useRef } from "react";
import { View } from "react-native";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { Stack, usePathname, useRouter } from "expo-router";

WebBrowser.maybeCompleteAuthSession();
import { ThemeProvider } from "../src/context/ThemeContext";
import { AuthProvider, useAuth } from "../src/context/AuthContext";
import { AppVersionProvider, useAppVersion } from "../src/context/AppVersionContext";
import { ForceUpdateModal } from "../src/components/ForceUpdateModal";
import { SyncManager } from "../src/components/SyncManager";
import { SyncToast } from "../src/components/SyncToast";
import { setupNotifications } from "../src/utils/notifications";
import { syncMiniMissionNotifications } from "../src/utils/miniMissionNotifications";
import { useHabitStore } from "../src/store/habitStore";
import { isSupabaseConfigured } from "../src/lib/env";
import { tryCompleteOAuthFromUrl } from "../src/lib/oauthExchange";

function RootLayoutNav() {
  const { session, initializing } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const requireAuth = isSupabaseConfigured();
  const { needsForceUpdate, downloadUrl, forceMessage } = useAppVersion();

  useEffect(() => {
    void setupNotifications();
  }, []);

  /** Backup: complete PKCE if the deep link doesn’t land on `app/auth/callback` (e.g. timing). */
  useEffect(() => {
    const run = async (url: string | null) => {
      const ok = await tryCompleteOAuthFromUrl(url);
      if (ok) router.replace("/");
    };
    void Linking.getInitialURL().then((u) => void run(u));
    const sub = Linking.addEventListener("url", ({ url }) => void run(url));
    return () => sub.remove();
  }, [router]);

  const challengeInviteNotificationHandledRef = useRef(false);

  useEffect(() => {
    if (!session || initializing) return;

    let cancelled = false;
    let subscription: { remove: () => void } | undefined;

    const routeChallengeInvite = (data: Record<string, unknown> | undefined) => {
      if (!data || data.type !== "challenge_invite") return;
      const challengeId = typeof data.challenge_id === "string" ? data.challenge_id : "";
      const inviteId = typeof data.invite_id === "string" ? data.invite_id : "";
      if (!challengeId && !inviteId) return;
      router.push({
        pathname: "/(tabs)/compete",
        params: {
          ...(inviteId ? { inviteId } : {}),
          ...(challengeId ? { challengeId } : {}),
          focusInvites: "1",
        },
      });
    };

    (async () => {
      const Constants = (await import("expo-constants")).default;
      const { Platform } = await import("react-native");
      if (Constants.appOwnership === "expo" && Platform.OS === "android") return;
      const Notifications = await import("expo-notifications");
      if (cancelled) return;

      if (!challengeInviteNotificationHandledRef.current) {
        const last = await Notifications.getLastNotificationResponseAsync();
        const data = last?.notification.request.content.data as Record<string, unknown> | undefined;
        if (data?.type === "challenge_invite") {
          challengeInviteNotificationHandledRef.current = true;
          routeChallengeInvite(data);
        }
      }

      subscription = Notifications.addNotificationResponseReceivedListener((response) => {
        const data = response.notification.request.content.data as Record<string, unknown> | undefined;
        routeChallengeInvite(data);
      });
    })();

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [session, initializing, router]);

  useEffect(() => {
    const runSync = () => {
      void syncMiniMissionNotifications(useHabitStore.getState().miniMissions);
    };

    const unsubHydration = useHabitStore.persist.onFinishHydration(() => {
      runSync();
    });
    if (useHabitStore.persist.hasHydrated()) {
      runSync();
    }

    let prevMiniMissions = useHabitStore.getState().miniMissions;
    const unsub = useHabitStore.subscribe((state) => {
      if (state.miniMissions === prevMiniMissions) return;
      prevMiniMissions = state.miniMissions;
      runSync();
    });

    return () => {
      unsubHydration();
      unsub();
    };
  }, []);

  useEffect(() => {
    if (!requireAuth || initializing) return;
    const p = pathname ?? "";
    const inAuth = p === "/login" || p.startsWith("/auth");
    if (!session && !inAuth) {
      router.replace("/login");
    }
    if (session && inAuth) {
      router.replace("/");
    }
  }, [requireAuth, initializing, session, pathname, router]);

  if (requireAuth && initializing) {
    return null;
  }

  return (
    <View style={{ flex: 1 }}>
      <SyncManager />
      <Stack screenOptions={{ headerShown: false }} />
      <SyncToast />
      <ForceUpdateModal visible={needsForceUpdate} downloadUrl={downloadUrl} message={forceMessage} />
    </View>
  );
}

export default function Layout() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppVersionProvider>
          <RootLayoutNav />
        </AppVersionProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
