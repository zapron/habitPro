import "../src/splashInit";
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
import { SplashGate } from "../src/components/SplashGate";
import { SyncManager } from "../src/components/SyncManager";
import { SyncToast } from "../src/components/SyncToast";
import { setupNotifications } from "../src/utils/notifications";
import { syncMiniMissionNotifications } from "../src/utils/miniMissionNotifications";
import { useHabitStore } from "../src/store/habitStore";
import { isSupabaseConfigured } from "../src/lib/env";
import { tryCompleteAuthFromUrl } from "../src/lib/oauthExchange";
import { isPasswordRecoverySession } from "../src/lib/passwordRecovery";
import { getSupabase } from "../src/lib/supabase";

function RootLayoutNav() {
  const { session, initializing, passwordRecoveryPending } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const requireAuth = isSupabaseConfigured();
  const { needsForceUpdate, downloadUrl, forceMessage } = useAppVersion();

  useEffect(() => {
    void setupNotifications();
  }, []);

  /** Complete PKCE / recovery tokens from deep links. Recovery → `/reset-password`; do not force `/` (races PASSWORD_RECOVERY → home). */
  useEffect(() => {
    const run = async (url: string | null) => {
      if (!url) return;
      const isRecoveryDeepLink =
        url.includes("reset-password") ||
        url.includes("type=recovery") ||
        /[#&?]type=recovery\b/.test(url);
      const ok = await tryCompleteAuthFromUrl(url);
      if (!ok) return;
      const supabase = getSupabase();
      if (supabase) {
        const { data } = await supabase.auth.getSession();
        if (data.session && isPasswordRecoverySession(data.session)) {
          router.replace("/reset-password");
          return;
        }
      }
      if (isRecoveryDeepLink) {
        router.replace("/reset-password");
      }
    };
    void Linking.getInitialURL().then((u) => void run(u));
    const sub = Linking.addEventListener("url", ({ url }) => void run(url));
    return () => sub.remove();
  }, [router]);

  const remotePushRouteHandledRef = useRef(false);

  useEffect(() => {
    if (!session || initializing) return;

    let cancelled = false;
    let subscription: { remove: () => void } | undefined;

    const routeFromNotificationData = (data: Record<string, unknown> | undefined) => {
      if (!data) return;
      const type = typeof data.type === "string" ? data.type : "";

      if (type === "challenge_invite") {
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
        return;
      }

      if (type === "community_win_cheer") {
        router.push({ pathname: "/(tabs)/community" });
        return;
      }

      if (type === "challenge_nudge" || type === "challenge_squad_checkin") {
        const challengeId = typeof data.challenge_id === "string" ? data.challenge_id : "";
        if (challengeId) {
          router.push(`/challenge/${challengeId}`);
        } else {
          router.push("/(tabs)/compete");
        }
        return;
      }

      if (type === "challenge_invite_accepted" || type === "challenge_invite_declined") {
        const challengeId = typeof data.challenge_id === "string" ? data.challenge_id : "";
        if (challengeId) {
          router.push(`/challenge/${challengeId}`);
        } else {
          router.push("/(tabs)/compete");
        }
        return;
      }

      if (type === "streak_window_reminder") {
        const habitId = typeof data.habit_id === "string" ? data.habit_id : "";
        if (habitId) {
          router.push(`/habit/${habitId}`);
        }
        return;
      }
    };

    (async () => {
      const Constants = (await import("expo-constants")).default;
      const { Platform } = await import("react-native");
      if (Constants.appOwnership === "expo" && Platform.OS === "android") return;
      const Notifications = await import("expo-notifications");
      if (cancelled) return;

      if (!remotePushRouteHandledRef.current) {
        const last = await Notifications.getLastNotificationResponseAsync();
        const data = last?.notification.request.content.data as Record<string, unknown> | undefined;
        if (data?.type) {
          remotePushRouteHandledRef.current = true;
          routeFromNotificationData(data);
        }
      }

      subscription = Notifications.addNotificationResponseReceivedListener((response) => {
        const data = response.notification.request.content.data as Record<string, unknown> | undefined;
        routeFromNotificationData(data);
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
    if (passwordRecoveryPending && session && p !== "/reset-password") {
      router.replace("/reset-password");
      return;
    }
    const inAuth =
      p === "/login" ||
      p.startsWith("/auth") ||
      p === "/forgot-password" ||
      p === "/reset-password";
    if (!session && !inAuth) {
      router.replace("/login");
    }
    if (session && inAuth && p !== "/reset-password") {
      router.replace("/");
    }
  }, [requireAuth, initializing, session, pathname, router, passwordRecoveryPending]);

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
          <SplashGate>
            <RootLayoutNav />
          </SplashGate>
        </AppVersionProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
