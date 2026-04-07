import { useEffect, useRef } from "react";
import { View } from "react-native";
import { Stack, useRouter, useSegments } from "expo-router";
import { ThemeProvider } from "../src/context/ThemeContext";
import { AuthProvider, useAuth } from "../src/context/AuthContext";
import { SyncManager } from "../src/components/SyncManager";
import { SyncToast } from "../src/components/SyncToast";
import { setupNotifications } from "../src/utils/notifications";
import { syncMiniMissionNotifications } from "../src/utils/miniMissionNotifications";
import { useHabitStore } from "../src/store/habitStore";
import { isSupabaseConfigured } from "../src/lib/env";

function RootLayoutNav() {
  const { session, initializing } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const requireAuth = isSupabaseConfigured();

  useEffect(() => {
    void setupNotifications();
  }, []);

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
    const inAuth = segments[0] === "login";
    if (!session && !inAuth) {
      router.replace("/login");
    }
    if (session && inAuth) {
      router.replace("/");
    }
  }, [requireAuth, initializing, session, segments, router]);

  if (requireAuth && initializing) {
    return null;
  }

  return (
    <View style={{ flex: 1 }}>
      <SyncManager />
      <Stack screenOptions={{ headerShown: false }} />
      <SyncToast />
    </View>
  );
}

export default function Layout() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <RootLayoutNav />
      </AuthProvider>
    </ThemeProvider>
  );
}
