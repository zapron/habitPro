import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Animated,
  RefreshControl,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { FlashList } from "@shopify/flash-list";
import { Trophy, Bolt, Target, Plus, ChevronRight, Sun, Moon, Sunrise, Sunset, Zap, Bell } from "lucide-react-native";
import { useHabitStore } from "../../src/store/habitStore";
import { useAuth } from "../../src/context/AuthContext";
import { isSupabaseConfigured } from "../../src/lib/env";
import { countUnreadNotifications } from "../../src/lib/groupChallengesApi";
import type { AppTheme } from "../../src/styles/theme";
import { Button } from "../../src/components/Button";
import { HabitCard } from "../../src/components/HabitCard";
import { Screen } from "../../src/components/Screen";
import { useTheme } from "../../src/context/ThemeContext";
import { useReducedMotion } from "../../src/hooks/useReducedMotion";
import { AnimatedFire } from "../../src/components/AnimatedFire";
import { getMiniRemainingMs } from "../../src/utils/miniMissionTime";
import { isHabitMissionWindowClosed } from "../../src/utils/habitMissionWindow";

function getGreeting(): { text: string; emoji: string; Icon: typeof Sun } {
  const hour = new Date().getHours();
  if (hour < 5) return { text: "Burning the midnight oil", emoji: "🌙", Icon: Moon };
  if (hour < 12) return { text: "Good morning, warrior", emoji: "☀️", Icon: Sunrise };
  if (hour < 17) return { text: "Keep pushing forward", emoji: "💪", Icon: Sun };
  if (hour < 21) return { text: "Evening focus mode", emoji: "🌅", Icon: Sunset };
  return { text: "Night owl mode", emoji: "🌙", Icon: Moon };
}

const SECTION_GAP = 16;
const HEADER_BOTTOM_GAP = 10;

function ListSkeleton({ theme }: { theme: AppTheme }) {
  return (
    <View style={skeletonStyles.wrap}>
      {[0, 1, 2].map((i) => (
        <View
          key={i}
          style={[skeletonStyles.bar, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}
        />
      ))}
    </View>
  );
}

export default function Home() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme, isDark } = useTheme();
  const { session } = useAuth();
  const reduceMotion = useReducedMotion();
  const habits = useHabitStore((state) => state.habits);
  const miniMissions = useHabitStore((state) => state.miniMissions);
  const xp = useHabitStore((state) => state.xp);
  const [activeTab, setActiveTab] = useState<"missions" | "reports">("missions");
  const [storeHydrated, setStoreHydrated] = useState(() => useHabitStore.persist.hasHydrated());
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);
  const [notifRefreshBusy, setNotifRefreshBusy] = useState(false);
  const [miniNow, setMiniNow] = useState(() => Date.now());
  const [missionNow, setMissionNow] = useState(() => Date.now());
  const showAccount = isSupabaseConfigured();

  const listBottomPad = Math.max(insets.bottom, 12) + 56;

  const level = Math.floor(xp / 100);
  const xpInLevel = xp % 100;
  const xpProgress = xpInLevel / 100;

  const filteredHabits = useMemo(() => {
    if (activeTab === "reports") {
      return habits.filter(
        (h) => !h.isCompleted && isHabitMissionWindowClosed(h, missionNow),
      );
    }
    return habits.filter(
      (h) => !( !h.isCompleted && isHabitMissionWindowClosed(h, missionNow) ),
    );
  }, [habits, activeTab, missionNow]);

  const stats = useMemo(() => {
    const missionsCount = habits.filter(
      (h) => !( !h.isCompleted && isHabitMissionWindowClosed(h, missionNow) ),
    ).length;
    const reportsCount = habits.filter(
      (h) => !h.isCompleted && isHabitMissionWindowClosed(h, missionNow),
    ).length;
    const openMissionCount = habits.filter(
      (h) => !h.isCompleted && !isHabitMissionWindowClosed(h, missionNow),
    ).length;
    return { missionsCount, reportsCount, openMissionCount };
  }, [habits, missionNow]);

  const hasActiveMiniCountdown = useMemo(
    () =>
      miniMissions.some(
        (m) => m.status === "in_progress" && getMiniRemainingMs(m, miniNow) > 0,
      ),
    [miniMissions, miniNow],
  );

  useEffect(() => {
    if (!hasActiveMiniCountdown) return;
    const t = setInterval(() => setMiniNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [hasActiveMiniCountdown]);

  const hasIncompleteMission = useMemo(
    () => habits.some((h) => !h.isCompleted),
    [habits],
  );

  useEffect(() => {
    if (!hasIncompleteMission) return;
    const t = setInterval(() => setMissionNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, [hasIncompleteMission]);

  const miniMissionStats = useMemo(() => {
    const live = miniMissions.filter(
      (m) => m.status === "in_progress" && getMiniRemainingMs(m, miniNow) > 0,
    ).length;
    const waiting = miniMissions.filter(
      (m) => m.status === "pending" || m.status === "scheduled",
    ).length;
    return { live, waiting };
  }, [miniMissions, miniNow]);

  const miniCount =
    miniMissionStats.live > 0 ? miniMissionStats.live : miniMissionStats.waiting;

  const greeting = useMemo(() => getGreeting(), []);

  const headerOpacity = useRef(new Animated.Value(0)).current;
  const headerSlide = useRef(new Animated.Value(-15)).current;

  useEffect(() => {
    if (reduceMotion) {
      headerOpacity.setValue(1);
      headerSlide.setValue(0);
      return;
    }
    Animated.parallel([
      Animated.timing(headerOpacity, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.spring(headerSlide, { toValue: 0, tension: 50, friction: 10, useNativeDriver: true }),
    ]).start();
  }, [headerOpacity, headerSlide, reduceMotion]);

  useEffect(() => {
    const unsub = useHabitStore.persist.onFinishHydration(() => setStoreHydrated(true));
    if (useHabitStore.persist.hasHydrated()) setStoreHydrated(true);
    return unsub;
  }, []);

  const refreshNotificationCount = useCallback(async () => {
    if (!session?.user || !showAccount) {
      setUnreadNotifCount(0);
      return;
    }
    setNotifRefreshBusy(true);
    try {
      const n = await countUnreadNotifications();
      setUnreadNotifCount(n);
    } catch {
      setUnreadNotifCount(0);
    } finally {
      setNotifRefreshBusy(false);
    }
  }, [session?.user, showAccount]);

  useFocusEffect(
    useCallback(() => {
      if (!session?.user || !showAccount) {
        setUnreadNotifCount(0);
        return;
      }
      let cancelled = false;
      void countUnreadNotifications()
        .then((n) => {
          if (!cancelled) setUnreadNotifCount(n);
        })
        .catch(() => {
          if (!cancelled) setUnreadNotifCount(0);
        });
      return () => {
        cancelled = true;
      };
    }, [session?.user, showAccount]),
  );

  useFocusEffect(
    useCallback(() => {
      setMissionNow(Date.now());
    }, []),
  );

  const notifRefreshControl = (
    <RefreshControl
      refreshing={notifRefreshBusy}
      onRefresh={() => void refreshNotificationCount()}
      tintColor={theme.colors.indigo[400]}
      colors={[theme.colors.indigo[400]]}
    />
  );

  return (
    <Screen>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={theme.colors.background} />

      <View style={styles.rootCol}>
      <Animated.View
        style={[styles.header, { opacity: headerOpacity, transform: [{ translateY: headerSlide }] }]}
      >
        <View style={styles.headerTopRow}>
          <Text style={[styles.headerEyebrow, { color: theme.colors.cyan[400] }]}>MISSION CONTROL</Text>
          <View style={styles.headerRightCluster}>
            {showAccount && session?.user ? (
              <View style={styles.bellWrap}>
                <TouchableOpacity
                  onPress={() => router.push("/notifications")}
                  style={[styles.headerIconBtn, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
                  activeOpacity={0.85}
                  accessibilityLabel={
                    unreadNotifCount > 0 ? `Notifications, ${unreadNotifCount} unread` : "Notifications"
                  }
                >
                  <Bell size={20} color={theme.colors.textPrimary} />
                </TouchableOpacity>
                {unreadNotifCount > 0 ? (
                  <View style={[styles.notifBadge, { borderColor: theme.colors.background, backgroundColor: theme.colors.red[500] }]} />
                ) : null}
              </View>
            ) : null}
            <View style={[styles.headerBadge, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
              <Text style={[styles.levelNumber, { color: theme.colors.yellow[400] }]}>{level}</Text>
              <Text style={[styles.levelLabel, { color: theme.colors.textMuted }]}>LVL</Text>
            </View>
          </View>
        </View>
        <Text style={[styles.headerTitle, { color: theme.colors.textPrimary }]}>
          {greeting.text} {greeting.emoji}
        </Text>
      </Animated.View>

      <View style={[styles.xpBar, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderRadius: theme.radius.md }]}>
        <View style={styles.xpInfo}>
          <View style={styles.xpLeft}>
            <Zap size={12} color={theme.colors.yellow[400]} fill={theme.colors.yellow[400]} />
            <Text style={[styles.xpLabel, { color: theme.colors.textSecondary }]}>Level {level}</Text>
          </View>
          <Text style={[styles.xpValue, { color: theme.colors.textMuted }]}>
            {xpInLevel} / 100 XP
          </Text>
        </View>
        <View style={[styles.xpTrack, { backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)" }]}>
          <View
            style={[
              styles.xpFill,
              {
                width: `${Math.max(xpProgress * 100, 2)}%`,
                backgroundColor: theme.colors.yellow[400],
              },
            ]}
          />
        </View>
      </View>

      <View style={styles.commandRow}>
        <TouchableOpacity
          style={[styles.commandCard, { backgroundColor: theme.colors.surface, borderColor: isDark ? "rgba(34, 211, 238, 0.3)" : "rgba(6, 182, 212, 0.25)", borderRadius: theme.radius.lg }]}
          activeOpacity={0.85}
          onPress={() => router.push("/create")}
        >
          <View style={styles.commandTopRow}>
            <View style={styles.commandIconMain}>
              {stats.openMissionCount > 0 ? (
                <AnimatedFire size={theme.icon.sm} color={theme.colors.cyan[400]} />
              ) : (
                <Target size={theme.icon.md} color={theme.colors.cyan[400]} />
              )}
            </View>
            {stats.openMissionCount > 0 && (
              <Text style={[styles.countMain, { color: theme.colors.cyan[400] }]}>{stats.openMissionCount}</Text>
            )}
          </View>
          <Text style={[styles.commandTitle, { color: theme.colors.textPrimary }]}>New Mission</Text>
          <Text style={[styles.commandHint, { color: theme.colors.textMuted }]}>21-day or custom</Text>
          <View style={[styles.commandCta, { backgroundColor: theme.colors.indigo[600], ...theme.shadow.glow }]}>
            <Plus size={theme.icon.sm} color="#fff" strokeWidth={3} />
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.commandCard, { backgroundColor: theme.colors.surface, borderColor: isDark ? "rgba(245, 158, 11, 0.3)" : "rgba(217, 119, 6, 0.25)", borderRadius: theme.radius.lg }]}
          activeOpacity={0.85}
          onPress={() => router.push("/mini")}
        >
          <View style={styles.commandTopRow}>
            <View style={styles.commandIconMini}>
              {miniCount > 0 ? (
                <AnimatedFire size={theme.icon.sm} color={theme.colors.amber[500]} />
              ) : (
                <Bolt size={theme.icon.md} color={theme.colors.yellow[400]} />
              )}
            </View>
            {miniCount > 0 && (
              <Text style={[styles.countMini, { color: theme.colors.amber[500] }]}>{miniCount}</Text>
            )}
          </View>
          <Text style={[styles.commandTitle, { color: theme.colors.textPrimary }]}>Mini Missions</Text>
          <Text style={[styles.commandHint, { color: theme.colors.textMuted }]}>
            {miniMissionStats.live > 0 ? "live now" : "waiting"}
          </Text>
          <View style={[styles.commandCtaMini, { borderColor: isDark ? "rgba(245, 158, 11, 0.3)" : "rgba(217, 119, 6, 0.25)" }]}>
            <ChevronRight size={theme.icon.sm} color={theme.colors.amber[500]} strokeWidth={3} />
          </View>
        </TouchableOpacity>
      </View>

      <Text style={[styles.missionsLabel, { color: theme.colors.textMuted }]}>YOUR MISSIONS</Text>

      <View style={[styles.tabContainer, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
        <TouchableOpacity
          style={[
            styles.tab,
            activeTab === "missions" && [styles.tabSelected, { backgroundColor: theme.colors.indigo[600], ...theme.shadow.glow }],
          ]}
          onPress={() => setActiveTab("missions")}
          activeOpacity={0.8}
        >
          <Text style={[styles.tabText, { color: theme.colors.textSecondary }, activeTab === "missions" && styles.activeTabText]}>
            Missions{stats.missionsCount > 0 ? ` (${stats.missionsCount})` : ""}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.tab,
            activeTab === "reports" && [styles.tabSelected, { backgroundColor: theme.colors.indigo[600], ...theme.shadow.glow }],
          ]}
          onPress={() => setActiveTab("reports")}
          activeOpacity={0.8}
        >
          <Text style={[styles.tabText, { color: theme.colors.textSecondary }, activeTab === "reports" && styles.activeTabText]}>
            Reports{stats.reportsCount > 0 ? ` (${stats.reportsCount})` : ""}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.listWrap}>
        {!storeHydrated ? (
          <ListSkeleton theme={theme} />
        ) : filteredHabits.length === 0 ? (
          <ScrollView
            style={styles.emptyScroll}
            contentContainerStyle={styles.emptyScrollContent}
            refreshControl={showAccount && session?.user ? notifRefreshControl : undefined}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.emptyStateInner}>
              <View style={[styles.emptyIconContainer, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
                <Trophy size={50} color={theme.colors.slate[500]} />
              </View>
              <Text style={[styles.emptyTitle, { color: theme.colors.textPrimary, fontSize: theme.typography.h3 }]}>
                {activeTab === "missions"
                  ? habits.length === 0
                    ? "No missions yet"
                    : "Nothing in Missions"
                  : "No mission reports"}
              </Text>
              <Text style={[styles.emptyDescription, { color: theme.colors.textSecondary }]}>
                {activeTab === "missions"
                  ? habits.length === 0
                    ? "Start your first mission and keep momentum daily."
                    : "Open missions and finished grids live here. If a window ended before the grid was full, check the Reports tab."
                  : "When a mission window ends before the grid is full, it appears here so you can close it out."}
              </Text>
              {activeTab === "missions" && habits.length === 0 && (
                <View style={styles.emptyActions}>
                  <Button title="Start a Mission" onPress={() => router.push("/create")} style={styles.emptyButton} />
                  <TouchableOpacity onPress={() => router.push("/mini")} style={styles.emptySecondary} activeOpacity={0.85}>
                    <Text style={[styles.emptySecondaryText, { color: theme.colors.amber[500] }]}>Browse mini missions</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </ScrollView>
        ) : (
          <FlashList
            data={filteredHabits}
            renderItem={({ item }) => <HabitCard item={item} />}
            contentContainerStyle={[styles.listContent, { paddingBottom: listBottomPad }]}
            showsVerticalScrollIndicator={false}
            keyExtractor={(item) => item.id}
            refreshControl={showAccount && session?.user ? notifRefreshControl : undefined}
          />
        )}
      </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  rootCol: { flex: 1, minHeight: 0 },
  header: { marginBottom: HEADER_BOTTOM_GAP },
  headerTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 4,
  },
  headerRightCluster: { flexDirection: "row", alignItems: "center", gap: 12, flexShrink: 0 },
  headerEyebrow: { fontSize: 11, fontWeight: "700", letterSpacing: 1.3, flex: 1, minWidth: 0 },
  headerTitle: { fontSize: 22, fontWeight: "800", lineHeight: 28 },
  bellWrap: { position: "relative" },
  notifBadge: {
    position: "absolute",
    top: 2,
    right: 2,
    width: 10,
    height: 10,
    borderRadius: 9999,
    borderWidth: 2,
  },
  headerIconBtn: {
    width: 44,
    height: 44,
    borderRadius: 9999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  headerBadge: {
    width: 52,
    height: 52,
    borderRadius: 9999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    flexShrink: 0,
  },
  levelNumber: { fontSize: 20, fontWeight: "800", lineHeight: 22 },
  levelLabel: { fontSize: 9, fontWeight: "800", letterSpacing: 1 },
  commandRow: { flexDirection: "row", gap: 10, marginBottom: SECTION_GAP },
  commandCard: { flex: 1, paddingVertical: 14, paddingHorizontal: 14, position: "relative", overflow: "hidden", borderWidth: 1 },
  commandTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  commandIconMain: { width: 36, height: 36, borderRadius: 9999, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(34, 211, 238, 0.12)" },
  commandIconMini: { width: 36, height: 36, borderRadius: 9999, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(251, 191, 36, 0.14)" },
  countMain: { fontSize: 20, fontWeight: "800" },
  countMini: { fontSize: 20, fontWeight: "800" },
  commandTitle: { fontWeight: "700", fontSize: 15, marginBottom: 2 },
  commandHint: { fontSize: 11 },
  commandCta: { position: "absolute", bottom: 12, right: 12, width: 28, height: 28, borderRadius: 9999, alignItems: "center", justifyContent: "center" },
  commandCtaMini: { position: "absolute", bottom: 12, right: 12, width: 28, height: 28, borderRadius: 9999, backgroundColor: "rgba(245, 158, 11, 0.15)", borderWidth: 1, alignItems: "center", justifyContent: "center" },
  missionsLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 1.2, marginBottom: 8 },
  tabContainer: { flexDirection: "row", borderRadius: 14, padding: 4, marginBottom: 12, borderWidth: 1 },
  tab: { flex: 1, paddingVertical: 10, alignItems: "center", borderRadius: 10, minHeight: 42, justifyContent: "center" },
  tabSelected: { paddingVertical: 11 },
  tabText: { fontWeight: "700" },
  activeTabText: { color: "#ffffff" },
  listWrap: { flex: 1, minHeight: 0 },
  listContent: { paddingBottom: 40 },
  emptyScroll: { flex: 1 },
  emptyScrollContent: { flexGrow: 1, justifyContent: "center", alignItems: "center", paddingVertical: 24 },
  emptyStateInner: { alignItems: "center", width: "100%" },
  emptyIconContainer: { width: 94, height: 94, borderRadius: 9999, alignItems: "center", justifyContent: "center", borderWidth: 1, marginBottom: 16 },
  emptyTitle: { fontWeight: "700", marginBottom: 8 },
  emptyDescription: { textAlign: "center", marginBottom: 20, paddingHorizontal: 24 },
  emptyActions: { width: "100%", maxWidth: 320, alignItems: "center" },
  emptyButton: { width: "100%" },
  emptySecondary: { marginTop: 4, paddingVertical: 10, paddingHorizontal: 12 },
  emptySecondaryText: { fontSize: 14, fontWeight: "700" },
  xpBar: { paddingHorizontal: 14, paddingVertical: 8, marginBottom: 12, borderWidth: 1 },
  xpInfo: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  xpLeft: { flexDirection: "row", alignItems: "center", gap: 4 },
  xpLabel: { fontSize: 12, fontWeight: "700" },
  xpValue: { fontSize: 11, fontWeight: "600" },
  xpTrack: { height: 6, borderRadius: 3, overflow: "hidden" },
  xpFill: { height: "100%", borderRadius: 3 },
});

const skeletonStyles = StyleSheet.create({
  wrap: { flex: 1, gap: 12, paddingVertical: 8, minHeight: 200 },
  bar: { height: 88, borderRadius: 14, borderWidth: 1, opacity: 0.92 },
});
