import "../src/splashInit";
import { useEffect, useRef } from "react";
import { View } from "react-native";
import { useFonts } from "expo-font";
import { fontAssets } from "../src/styles/fonts";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { Stack, usePathname, useRouter } from "expo-router";

WebBrowser.maybeCompleteAuthSession();
import { ThemeProvider } from "../src/context/ThemeContext";
import { AppDialogProvider } from "../src/context/AppDialogContext";
import { ToastHost, ToastProvider } from "../src/context/ToastContext";
import { AuthProvider, useAuth } from "../src/context/AuthContext";
import { BillingProvider } from "../src/context/BillingContext";
import { PremiumProvider } from "../src/context/PremiumContext";
import { UsernameGateProvider } from "../src/context/UsernameGateContext";
import { NotificationGateProvider } from "../src/context/NotificationGateContext";
import { PlusUpsellProvider } from "../src/context/PlusUpsellContext";
import { AppVersionProvider, useAppVersion } from "../src/context/AppVersionContext";
import { InviteBadgeProvider } from "../src/context/InviteBadgeContext";
import { ForceUpdateModal } from "../src/components/ForceUpdateModal";
import { SplashGate } from "../src/components/SplashGate";
import { AppLaunchNotificationNudge } from "../src/components/AppLaunchNotificationNudge";
import { OtaUpdateManager } from "../src/components/OtaUpdateManager";
import { SyncManager } from "../src/components/SyncManager";
import { SyncToast } from "../src/components/SyncToast";
import { NetworkRequiredGate } from "../src/components/NetworkRequiredGate";
import { setupNotifications } from "../src/utils/notifications";
import { syncMiniMissionNotifications } from "../src/utils/miniMissionNotifications";
import { useHabitStore } from "../src/store/habitStore";
import { isSupabaseConfigured } from "../src/lib/env";
import { tryCompleteAuthFromUrl } from "../src/lib/oauthExchange";
import { isPasswordRecoverySession } from "../src/lib/passwordRecovery";
import { getSupabase } from "../src/lib/supabase";
import { challengeMemoryRouteParamsFromPayload } from "../src/lib/challengeMemoryDetail";

function RootLayoutNav() {
  const { session, initializing, passwordRecoveryPending } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const requireAuth = isSupabaseConfigured();
  const { needsForceUpdate, downloadUrl, forceMessage, latestVersion, forceImageUrl, forceChangelog, forceChangelogUrl } =
    useAppVersion();

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

      if (
        type === "live_mini_invite" ||
        type === "live_mini_accepted" ||
        type === "live_mini_declined" ||
        type === "live_mini_completed"
      ) {
        const liveMiniSquadId =
          typeof data.live_mini_squad_id === "string"
            ? data.live_mini_squad_id
            : typeof data.squad_id === "string"
              ? data.squad_id
              : "";
        if (liveMiniSquadId) {
          router.push(`/live-mini/${liveMiniSquadId}`);
        } else {
          router.push("/mini");
        }
        return;
      }

      if (type === "community_win_cheer") {
        const winId = typeof data.win_id === "string" ? data.win_id : "";
        if (winId) {
          router.push(`/journey-moment/${winId}`);
        } else {
          router.push({ pathname: "/(tabs)/community" });
        }
        return;
      }

      if (type === "challenge_squad_checkin") {
        const challengeId = typeof data.challenge_id === "string" ? data.challenge_id : "";
        const notificationId = typeof data.notification_id === "string" ? data.notification_id : undefined;
        const params = challengeMemoryRouteParamsFromPayload(data, notificationId);
        if (params) {
          router.push({ pathname: "/challenge-memory", params });
        } else if (challengeId) {
          router.push(`/challenge/${challengeId}`);
        } else {
          router.push("/(tabs)/compete");
        }
        return;
      }

      if (type === "challenge_nudge") {
        const challengeId = typeof data.challenge_id === "string" ? data.challenge_id : "";
        if (challengeId) {
          router.push({ pathname: "/challenge/[id]", params: { id: challengeId, tab: "activity" } });
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

      if (type === "mini_mission") {
        const missionId = typeof data.missionId === "string" ? data.missionId : "";
        if (missionId) {
          router.push(`/mini/${missionId}`);
        } else {
          router.push("/(tabs)/home");
        }
        return;
      }

      if (type === "streak_repair_request") {
        const challengeId = typeof data.challenge_id === "string" ? data.challenge_id : "";
        const repairId = typeof data.repair_id === "string" ? data.repair_id : "";
        if (challengeId) {
          router.push({
            pathname: "/challenge/[id]",
            params: { id: challengeId, tab: "repairs", ...(repairId ? { repairId } : {}) },
          });
        } else {
          router.push("/(tabs)/compete");
        }
        return;
      }

      if (type === "streak_repair_result") {
        const habitId = typeof data.habit_id === "string" ? data.habit_id : "";
        const challengeId = typeof data.challenge_id === "string" ? data.challenge_id : "";
        const repairId = typeof data.repair_id === "string" ? data.repair_id : "";
        if (challengeId) {
          router.push({
            pathname: "/challenge/[id]",
            params: { id: challengeId, tab: "repairs", ...(repairId ? { repairId } : {}) },
          });
        } else if (habitId) {
          router.push(`/habit/${habitId}`);
        } else {
          router.push("/(tabs)/compete");
        }
        return;
      }
    };

    (async () => {
      const Constants = (await import("expo-constants")).default;
      if (Constants.appOwnership === "expo") return;
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

  /**
   * Realtime: when squad approvals flip a repair to `applied`,
   * update local mission UI immediately (no logout/login needed).
   */
  useEffect(() => {
    if (!session || initializing) return;
    const supabase = getSupabase();
    if (!supabase) return;

    const channel = supabase
      .channel(`streak_repairs_user_${session.user.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "streak_repairs",
          filter: `user_id=eq.${session.user.id}`,
        },
        (payload) => {
          const next = payload.new as Record<string, unknown> | null;
          if (!next) return;
          const status = typeof next.status === "string" ? next.status : "";
          if (status !== "applied") return;
          const habitId = typeof next.habit_id === "string" ? next.habit_id : "";
          const dateStr = typeof next.date_str === "string" ? next.date_str : "";
          const xpCost = typeof next.xp_cost === "number" ? next.xp_cost : undefined;
          if (!habitId || !dateStr) return;
          // Solo repairs update the client in StreakRepairSheet (avoids double XP); squad applies here.
          const cid = next.challenge_id;
          const isSquad =
            cid != null && typeof cid === "string" && (cid as string).length > 0;
          if (!isSquad) return;
          useHabitStore.getState().applyStreakRepairLocally({
            habitId,
            dateStr,
            xpCost,
            repairSource: "squad",
            deductXp: true,
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session, initializing]);

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
      <AppLaunchNotificationNudge />
      <OtaUpdateManager />
      <SyncManager />
      <Stack screenOptions={{ headerShown: false }} />
      <ToastHost />
      <SyncToast />
      <ForceUpdateModal
        visible={needsForceUpdate}
        downloadUrl={downloadUrl}
        message={forceMessage}
        version={latestVersion}
        imageUrl={forceImageUrl}
        changelog={forceChangelog}
        changelogUrl={forceChangelogUrl}
      />
      <NetworkRequiredGate />
    </View>
  );
}

export default function Layout() {
  const [fontsLoaded, fontError] = useFonts(fontAssets);

  useEffect(() => {
    if (fontError) throw fontError;
  }, [fontError]);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <ThemeProvider>
      <AppDialogProvider>
        <ToastProvider>
          <AuthProvider>
            <InviteBadgeProvider>
              <UsernameGateProvider>
                <NotificationGateProvider>
                  <BillingProvider>
                    <PremiumProvider>
                      <PlusUpsellProvider>
                        <AppVersionProvider>
                          <SplashGate>
                            <RootLayoutNav />
                          </SplashGate>
                        </AppVersionProvider>
                      </PlusUpsellProvider>
                    </PremiumProvider>
                  </BillingProvider>
                </NotificationGateProvider>
              </UsernameGateProvider>
            </InviteBadgeProvider>
          </AuthProvider>
        </ToastProvider>
      </AppDialogProvider>
    </ThemeProvider>
  );
}
