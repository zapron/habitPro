import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Text } from "../../src/components/AppText";
import {
  View,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Animated,
  Easing,
  RefreshControl,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Defs, LinearGradient as SvgLinearGradient, Stop, Text as SvgText } from "react-native-svg";
import { FlashList } from "@shopify/flash-list";
import {
  Trophy,
  Bolt,
  Target,
  Plus,
  ChevronRight,
  Zap,
  Bell,
} from "lucide-react-native";
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
import {
  isMainMissionPlayableOnHome,
  needsMainMissionOutcome,
} from "../../src/utils/mainMissionUi";

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return "Burning the midnight oil";
  if (hour < 12) return "Good morning, warrior";
  if (hour < 17) return "Keep pushing forward";
  if (hour < 21) return "Evening focus mode";
  return "Night owl mode";
}

function MiniMissionLiveGradientLabel({ count }: { count: number }) {
  const fontSize = 17;
  const label = `${count} LIVE`;
  const w = Math.min(200, Math.max(44, Math.ceil(label.length * fontSize * 0.58)));
  const h = Math.ceil(fontSize * 1.2);
  const baseline = Math.ceil(fontSize * 0.88);

  return (
    <Svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      accessibilityLabel={`${count} live mini missions`}
    >
      <Defs>
        <SvgLinearGradient id="miniLiveGrad" x1="0" y1="0" x2={w} y2="0">
          <Stop offset="0" stopColor="#f97316" />
          <Stop offset="1" stopColor="#fde047" />
        </SvgLinearGradient>
      </Defs>
      <SvgText
        x={0}
        y={baseline}
        fill="url(#miniLiveGrad)"
        fontSize={fontSize}
        fontWeight="800"
      >
        {label}
      </SvgText>
    </Svg>
  );
}

const SECTION_GAP = 12;
const HEADER_BOTTOM_GAP = 6;

function ListSkeleton({ theme }: { theme: AppTheme }) {
  return (
    <View style={skeletonStyles.wrap}>
      {[0, 1, 2].map((i) => (
        <View
          key={i}
          style={[
            skeletonStyles.bar,
            {
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.surface,
            },
          ]}
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
  const [activeTab, setActiveTab] = useState<"missions" | "reports">(
    "missions",
  );
  const [reportsSegment, setReportsSegment] = useState<
    "pending" | "accomplished" | "failed"
  >("pending");
  const [storeHydrated, setStoreHydrated] = useState(() =>
    useHabitStore.persist.hasHydrated(),
  );
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);
  const [notifRefreshBusy, setNotifRefreshBusy] = useState(false);
  const [miniNow, setMiniNow] = useState(() => Date.now());
  const [missionNow, setMissionNow] = useState(() => Date.now());
  const showAccount = isSupabaseConfigured();
  const bellScale = useRef(new Animated.Value(1)).current;
  const emptyIconScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (reduceMotion) {
      bellScale.setValue(1);
      return;
    }
    if (unreadNotifCount > 0) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(bellScale, { toValue: 1.18, duration: 120, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          Animated.timing(bellScale, { toValue: 0.96, duration: 110, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          Animated.timing(bellScale, { toValue: 1, duration: 140, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          Animated.delay(2400),
        ]),
      );
      loop.start();
      return () => loop.stop();
    }
  }, [unreadNotifCount, reduceMotion, bellScale]);

  useEffect(() => {
    if (reduceMotion) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(emptyIconScale, { toValue: 1.05, duration: 2000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(emptyIconScale, { toValue: 1, duration: 2000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [reduceMotion, emptyIconScale]);

  const listBottomPad = Math.max(insets.bottom, 12) + 48;

  const level = Math.floor(xp / 100);
  const xpInLevel = xp % 100;
  const xpProgress = xpInLevel / 100;

  const filteredHabits = useMemo(() => {
    if (activeTab === "missions") {
      return habits.filter((h) => isMainMissionPlayableOnHome(h, missionNow));
    }
    if (reportsSegment === "pending") {
      return habits.filter((h) => needsMainMissionOutcome(h, missionNow));
    }
    if (reportsSegment === "accomplished") {
      return habits.filter((h) => h.missionReport === "accomplished");
    }
    return habits.filter((h) => h.missionReport === "failed");
  }, [habits, activeTab, reportsSegment, missionNow]);

  const stats = useMemo(() => {
    const missionsCount = habits.filter((h) =>
      isMainMissionPlayableOnHome(h, missionNow),
    ).length;
    const pending = habits.filter((h) =>
      needsMainMissionOutcome(h, missionNow),
    ).length;
    const accomplished = habits.filter(
      (h) => h.missionReport === "accomplished",
    ).length;
    const failed = habits.filter((h) => h.missionReport === "failed").length;
    const reportsCount = pending + accomplished + failed;
    const openMissionCount = missionsCount;
    return {
      missionsCount,
      reportsCount,
      openMissionCount,
      pending,
      accomplished,
      failed,
    };
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
    () => habits.some((h) => !h.missionReport && h.status === "active"),
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
    miniMissionStats.live > 0
      ? miniMissionStats.live
      : miniMissionStats.waiting;

  const greetingText = useMemo(() => getGreeting(), []);

  const headerOpacity = useRef(new Animated.Value(0)).current;
  const headerSlide = useRef(new Animated.Value(-15)).current;

  useEffect(() => {
    if (reduceMotion) {
      headerOpacity.setValue(1);
      headerSlide.setValue(0);
      return;
    }
    Animated.parallel([
      Animated.timing(headerOpacity, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.spring(headerSlide, {
        toValue: 0,
        tension: 50,
        friction: 10,
        useNativeDriver: true,
      }),
    ]).start();
  }, [headerOpacity, headerSlide, reduceMotion]);

  useEffect(() => {
    const unsub = useHabitStore.persist.onFinishHydration(() =>
      setStoreHydrated(true),
    );
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
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor={theme.colors.background}
      />

      <View style={styles.rootCol}>
        <Animated.View
          style={[
            styles.header,
            {
              opacity: headerOpacity,
              transform: [{ translateY: headerSlide }],
            },
          ]}
        >
          <Text
            style={[styles.headerEyebrow, { color: theme.colors.cyan[400] }]}
          >
            MISSION CONTROL
          </Text>
          <View style={styles.headerGreetingRow}>
            <Text
              style={[
                styles.headerTitle,
                {
                  color: theme.colors.textPrimary,
                  letterSpacing: theme.letterSpacing.tight,
                },
              ]}
              numberOfLines={2}
            >
              {greetingText}
            </Text>
            <View style={styles.headerRightCluster}>
              {showAccount && session?.user ? (
                <View style={styles.bellWrap}>
                  <Animated.View
                    style={{
                      transform: [
                        { scale: unreadNotifCount > 0 ? bellScale : 1 },
                      ],
                    }}
                  >
                    <TouchableOpacity
                      onPress={() => router.push("/notifications")}
                      style={[
                        styles.headerIconBtn,
                        {
                          backgroundColor: theme.colors.surface,
                          borderColor: theme.colors.border,
                        },
                      ]}
                      activeOpacity={0.85}
                      accessibilityLabel={
                        unreadNotifCount > 0
                          ? `Notifications, ${unreadNotifCount} unread`
                          : "Notifications"
                      }
                    >
                      <Bell size={20} color={theme.colors.textPrimary} />
                    </TouchableOpacity>
                  </Animated.View>
                  {unreadNotifCount > 0 ? (
                    <View
                      style={[
                        styles.notifBadge,
                        {
                          borderColor: theme.colors.background,
                          backgroundColor: theme.colors.red[500],
                        },
                      ]}
                      accessibilityElementsHidden
                      importantForAccessibility="no-hide-descendants"
                    >
                      <Text
                        style={[
                          styles.notifBadgeText,
                          { color: theme.colors.white },
                        ]}
                      >
                        {unreadNotifCount > 99 ? "99+" : String(unreadNotifCount)}
                      </Text>
                    </View>
                  ) : null}
                </View>
              ) : null}
              <View
                style={[
                  styles.headerBadge,
                  {
                    backgroundColor: theme.colors.surface,
                    borderColor: theme.colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.levelNumber,
                    { color: theme.colors.yellow[400] },
                  ]}
                >
                  {level}
                </Text>
                <Text
                  style={[styles.levelLabel, { color: theme.colors.textMuted }]}
                >
                  LVL
                </Text>
              </View>
            </View>
          </View>
        </Animated.View>

        <View
          style={[
            styles.xpBar,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
              borderRadius: theme.radius.md,
            },
          ]}
        >
          <View style={styles.xpInfo}>
            <View style={styles.xpLeft}>
              <Zap
                size={12}
                color={theme.colors.yellow[400]}
                fill={theme.colors.yellow[400]}
              />
              <Text
                style={[styles.xpLabel, { color: theme.colors.textSecondary }]}
              >
                Level {level}
              </Text>
            </View>
            <Text style={[styles.xpValue, { color: theme.colors.textMuted }]}>
              {xpInLevel} / 100 XP
            </Text>
          </View>
          <View
            style={[
              styles.xpTrack,
              {
                backgroundColor: isDark
                  ? "rgba(255,255,255,0.06)"
                  : "rgba(0,0,0,0.06)",
              },
            ]}
          >
            <LinearGradient
              colors={["#f97316", "#fde047"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[
                styles.xpFill,
                {
                  width: `${Math.max(xpProgress * 100, 2)}%`,
                },
              ]}
            />
          </View>
        </View>

        <TouchableOpacity
          style={[
            styles.miniBanner,
            {
              backgroundColor: theme.colors.surface,
              borderColor: isDark ? "rgba(245, 158, 11, 0.3)" : "rgba(217, 119, 6, 0.25)",
              borderRadius: theme.radius.lg,
            },
          ]}
          activeOpacity={0.85}
          onPress={() => router.push("/mini")}
        >
          <View style={styles.miniBannerLeft}>
            <View style={styles.commandIconMini}>
              {miniCount > 0 ? (
                <AnimatedFire size={theme.icon.sm} color={theme.colors.amber[500]} />
              ) : (
                <Bolt size={18} color={theme.colors.yellow[400]} />
              )}
            </View>
            <View style={{ marginLeft: 10 }}>
              <Text style={{ color: theme.colors.textPrimary, fontWeight: "700", fontSize: 15 }}>Mini Missions</Text>
              {miniMissionStats.live === 0 ? (
                <Text style={{ color: theme.colors.textMuted, fontSize: 11 }}>Browse side-quests</Text>
              ) : null}
            </View>
          </View>
          <View style={styles.miniBannerRight}>
            {miniMissionStats.live > 0 ? (
              <MiniMissionLiveGradientLabel count={miniMissionStats.live} />
            ) : null}
            <ChevronRight size={20} color={theme.colors.textMuted} />
          </View>
        </TouchableOpacity>

        <Text style={[styles.missionsLabel, { color: theme.colors.textMuted }]}>
          MAIN MISSIONS
        </Text>

        <View
          style={[
            styles.tabContainer,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <TouchableOpacity
            style={[
              styles.tab,
              activeTab === "missions" && [
                styles.tabSelected,
                {
                  backgroundColor: theme.colors.indigo[600],
                  ...theme.shadow.glow,
                },
              ],
            ]}
            onPress={() => setActiveTab("missions")}
            activeOpacity={0.8}
          >
            <Text
              style={[
                styles.tabText,
                { color: theme.colors.textSecondary },
                activeTab === "missions" && styles.activeTabText,
              ]}
            >
              Main Missions
              {stats.missionsCount > 0 ? ` (${stats.missionsCount})` : ""}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.tab,
              activeTab === "reports" && [
                styles.tabSelected,
                {
                  backgroundColor: theme.colors.indigo[600],
                  ...theme.shadow.glow,
                },
              ],
            ]}
            onPress={() => setActiveTab("reports")}
            activeOpacity={0.8}
          >
            <Text
              style={[
                styles.tabText,
                { color: theme.colors.textSecondary },
                activeTab === "reports" && styles.activeTabText,
              ]}
            >
              Reports{stats.reportsCount > 0 ? ` (${stats.reportsCount})` : ""}
            </Text>
          </TouchableOpacity>
        </View>

        {activeTab === "reports" ? (
          <View
            style={[styles.reportSegRow, { borderColor: theme.colors.border }]}
          >
            {(
              [
                ["pending", "Pending", stats.pending] as const,
                ["accomplished", "Accomplished", stats.accomplished] as const,
                ["failed", "Failed", stats.failed] as const,
              ] as const
            ).map(([key, label, count]) => (
              <TouchableOpacity
                key={key}
                style={[
                  styles.reportSegBtn,
                  reportsSegment === key && {
                    backgroundColor: theme.colors.indigo[600],
                    ...theme.shadow.glow,
                  },
                ]}
                onPress={() => setReportsSegment(key)}
                activeOpacity={0.85}
              >
                <Text
                  style={[
                    styles.reportSegText,
                    { color: theme.colors.textSecondary },
                    reportsSegment === key && styles.activeTabText,
                  ]}
                  numberOfLines={1}
                >
                  {label}
                  {count > 0 ? ` (${count})` : ""}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        <View style={styles.listWrap}>
          {!storeHydrated ? (
            <ListSkeleton theme={theme} />
          ) : filteredHabits.length === 0 ? (
            <ScrollView
              style={styles.emptyScroll}
              contentContainerStyle={styles.emptyScrollContent}
              refreshControl={
                showAccount && session?.user ? notifRefreshControl : undefined
              }
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.emptyStateInner}>
                <Animated.View
                  style={[
                    styles.emptyIconContainer,
                    {
                      backgroundColor: theme.colors.surface,
                      borderColor: theme.colors.border,
                      transform: [{ scale: emptyIconScale }],
                    },
                  ]}
                >
                  <Trophy size={50} color={theme.colors.slate[500]} />
                </Animated.View>
                <Text
                  style={[
                    styles.emptyTitle,
                    {
                      color: theme.colors.textPrimary,
                      fontSize: theme.typography.h3,
                    },
                  ]}
                >
                  {activeTab === "missions"
                    ? habits.length === 0
                      ? "No missions yet"
                      : "Nothing in Missions"
                    : reportsSegment === "pending"
                      ? "Nothing pending"
                      : reportsSegment === "accomplished"
                        ? "No accomplished missions"
                        : "No failed missions"}
                </Text>
                <Text
                  style={[
                    styles.emptyDescription,
                    { color: theme.colors.textSecondary },
                  ]}
                >
                  {activeTab === "missions"
                    ? habits.length === 0
                      ? "Start your first mission and keep momentum daily."
                      : "Active missions you can still check in on appear here. When the timer ends or the grid is full, move to Reports."
                    : reportsSegment === "pending"
                      ? "When the mission window ends or every day is checked in, open Reports → Pending to confirm if the mission is complete for you."
                      : reportsSegment === "accomplished"
                        ? "Missions you mark as complete in the review step are listed here."
                        : "Missions you mark as not completed appear here."}
                </Text>
                {activeTab === "missions" && habits.length === 0 && (
                  <View style={styles.emptyActions}>
                    <Button
                      title="Start a Mission"
                      onPress={() => router.push("/create")}
                      style={styles.emptyButton}
                    />
                    <TouchableOpacity
                      onPress={() => router.push("/mini")}
                      style={styles.emptySecondary}
                      activeOpacity={0.85}
                    >
                      <Text
                        style={[
                          styles.emptySecondaryText,
                          { color: theme.colors.amber[500] },
                        ]}
                      >
                        Browse mini missions
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </ScrollView>
          ) : (
            <FlashList
              data={filteredHabits}
              renderItem={({ item }) => <HabitCard item={item} />}
              contentContainerStyle={[
                styles.listContent,
                { paddingBottom: listBottomPad },
              ]}
              showsVerticalScrollIndicator={false}
              keyExtractor={(item) => item.id}
              refreshControl={
                showAccount && session?.user ? notifRefreshControl : undefined
              }
            />
          )}
        </View>
      </View>

      <Animated.View
        style={[
          styles.fab,
          {
            backgroundColor: theme.colors.indigo[600],
            ...theme.shadow.glow,
            opacity: headerOpacity,
            transform: [{ translateY: headerSlide }],
          },
        ]}
      >
        <TouchableOpacity
          onPress={() => router.push("/create")}
          activeOpacity={0.8}
          style={styles.fabInner}
        >
          <Plus size={24} color="#fff" strokeWidth={3} />
        </TouchableOpacity>
      </Animated.View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  rootCol: { flex: 1, minHeight: 0 },
  header: { marginBottom: HEADER_BOTTOM_GAP },
  headerGreetingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginTop: 2,
    minHeight: 44,
  },
  headerRightCluster: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
  },
  headerEyebrow: { fontSize: 10, fontWeight: "700", letterSpacing: 1.25 },
  headerTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 20,
    fontWeight: "800",
    lineHeight: 24,
  },
  bellWrap: { position: "relative" },
  notifBadge: {
    position: "absolute",
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 9999,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  notifBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
    lineHeight: 12,
  },
  headerIconBtn: {
    width: 42,
    height: 42,
    borderRadius: 9999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  headerBadge: {
    width: 46,
    height: 46,
    borderRadius: 9999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    flexShrink: 0,
  },
  levelNumber: { fontSize: 19, fontWeight: "800", lineHeight: 21 },
  levelLabel: { fontSize: 9, fontWeight: "800", letterSpacing: 1 },
  miniBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
    borderWidth: 1,
    marginBottom: SECTION_GAP,
  },
  miniBannerLeft: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 1,
  },
  miniBannerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
    marginLeft: 10,
  },
  commandIconMini: {
    width: 36,
    height: 36,
    borderRadius: 9999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(251, 191, 36, 0.14)",
  },
  fab: {
    position: "absolute",
    bottom: 30,
    right: 20,
    width: 52,
    height: 52,
    borderRadius: 26,
    elevation: 8,
  },
  fabInner: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  missionsLabel: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
    marginBottom: 6,
  },
  tabContainer: {
    flexDirection: "row",
    borderRadius: 14,
    padding: 4,
    marginBottom: 10,
    borderWidth: 1,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 10,
    minHeight: 42,
    justifyContent: "center",
  },
  tabSelected: { paddingVertical: 11 },
  tabText: { fontWeight: "700" },
  activeTabText: { color: "#ffffff" },
  reportSegRow: {
    flexDirection: "row",
    borderRadius: 12,
    borderWidth: 1,
    padding: 3,
    marginBottom: 10,
    gap: 4,
  },
  reportSegBtn: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 36,
  },
  reportSegText: { fontSize: 11, fontWeight: "700", textAlign: "center" },
  listWrap: { flex: 1, minHeight: 0 },
  listContent: { paddingBottom: 40 },
  emptyScroll: { flex: 1 },
  emptyScrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 24,
  },
  emptyStateInner: { alignItems: "center", width: "100%" },
  emptyIconContainer: {
    width: 94,
    height: 94,
    borderRadius: 9999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    marginBottom: 16,
  },
  emptyTitle: { fontWeight: "700", marginBottom: 8 },
  emptyDescription: {
    textAlign: "center",
    marginBottom: 20,
    paddingHorizontal: 24,
  },
  emptyActions: { width: "100%", maxWidth: 320, alignItems: "center" },
  emptyButton: { width: "100%" },
  emptySecondary: { marginTop: 4, paddingVertical: 10, paddingHorizontal: 12 },
  emptySecondaryText: { fontSize: 14, fontWeight: "700" },
  xpBar: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 8,
    borderWidth: 1,
  },
  xpInfo: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
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
