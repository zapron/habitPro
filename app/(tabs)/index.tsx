import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, StatusBar, Animated } from "react-native";
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
  const [activeTab, setActiveTab] = useState<"active" | "completed">("active");
  const [storeHydrated, setStoreHydrated] = useState(() => useHabitStore.persist.hasHydrated());
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);
  const showAccount = isSupabaseConfigured();

  const listBottomPad = Math.max(insets.bottom, 12) + 56;

  const level = Math.floor(xp / 100);
  const xpInLevel = xp % 100;
  const xpProgress = xpInLevel / 100;

  const filteredHabits = useMemo(() => {
    return habits.filter((habit) =>
      activeTab === "active" ? !habit.isCompleted : habit.isCompleted,
    );
  }, [habits, activeTab]);

  const stats = useMemo(() => {
    const activeCount = habits.filter((habit) => !habit.isCompleted).length;
    const completedCount = habits.filter((habit) => habit.isCompleted).length;
    return { activeCount, completedCount };
  }, [habits]);

  const miniMissionStats = useMemo(() => {
    const queued = miniMissions.filter((m) => m.status !== "completed").length;
    const running = miniMissions.filter((m) => m.status === "in_progress").length;
    return { queued, running };
  }, [miniMissions]);

  const miniCount = miniMissionStats.running > 0 ? miniMissionStats.running : miniMissionStats.queued;

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
              {stats.activeCount > 0 ? (
                <AnimatedFire size={theme.icon.sm} color={theme.colors.cyan[400]} />
              ) : (
                <Target size={theme.icon.md} color={theme.colors.cyan[400]} />
              )}
            </View>
            {stats.activeCount > 0 && (
              <Text style={[styles.countMain, { color: theme.colors.cyan[400] }]}>{stats.activeCount}</Text>
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
            {miniMissionStats.running > 0 ? "live now" : "waiting"}
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
            activeTab === "active" && [styles.tabSelected, { backgroundColor: theme.colors.indigo[600], ...theme.shadow.glow }],
          ]}
          onPress={() => setActiveTab("active")}
          activeOpacity={0.8}
        >
          <Text style={[styles.tabText, { color: theme.colors.textSecondary }, activeTab === "active" && styles.activeTabText]}>
            Active{stats.activeCount > 0 ? ` (${stats.activeCount})` : ""}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.tab,
            activeTab === "completed" && [styles.tabSelected, { backgroundColor: theme.colors.indigo[600], ...theme.shadow.glow }],
          ]}
          onPress={() => setActiveTab("completed")}
          activeOpacity={0.8}
        >
          <Text style={[styles.tabText, { color: theme.colors.textSecondary }, activeTab === "completed" && styles.activeTabText]}>
            Completed{stats.completedCount > 0 ? ` (${stats.completedCount})` : ""}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.listWrap}>
        {!storeHydrated ? (
          <ListSkeleton theme={theme} />
        ) : filteredHabits.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={[styles.emptyIconContainer, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
              <Trophy size={50} color={theme.colors.slate[500]} />
            </View>
            <Text style={[styles.emptyTitle, { color: theme.colors.textPrimary, fontSize: theme.typography.h3 }]}>
              {activeTab === "active" ? "No active missions" : "No completed missions yet"}
            </Text>
            <Text style={[styles.emptyDescription, { color: theme.colors.textSecondary }]}>
              {activeTab === "active"
                ? "Start your first mission and keep momentum daily."
                : "Complete your first mission to unlock this section."}
            </Text>
            {activeTab === "active" && (
              <View style={styles.emptyActions}>
                <Button title="Start a Mission" onPress={() => router.push("/create")} style={styles.emptyButton} />
                <TouchableOpacity onPress={() => router.push("/mini")} style={styles.emptySecondary} activeOpacity={0.85}>
                  <Text style={[styles.emptySecondaryText, { color: theme.colors.amber[500] }]}>Browse mini missions</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        ) : (
          <FlashList
            data={filteredHabits}
            renderItem={({ item }) => <HabitCard item={item} />}
            contentContainerStyle={[styles.listContent, { paddingBottom: listBottomPad }]}
            showsVerticalScrollIndicator={false}
            keyExtractor={(item) => item.id}
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
  emptyState: { flex: 1, justifyContent: "center", alignItems: "center" },
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
