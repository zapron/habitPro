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
  Plane,
  Gamepad2,
  Globe,
  Swords,
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
import { CoachMarkTarget, useCoachMark } from "../../src/context/CoachMarkContext";
import { useReducedMotion } from "../../src/hooks/useReducedMotion";
import { AnimatedFire } from "../../src/components/AnimatedFire";
import { FireLottie, FIRE_LOTTIE_URI } from "../../src/components/FireLottie";
import { getMiniRemainingMs } from "../../src/utils/miniMissionTime";
import {
  isMainMissionPlayableOnHome,
  needsMainMissionOutcome,
} from "../../src/utils/mainMissionUi";
import {
  XP_PER_LEVEL,
  levelFromTotalXp,
  xpInCurrentLevel,
  xpProgressInCurrentLevel,
} from "../../src/utils/xpLevel";

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return "Burning the midnight oil";
  if (hour < 12) return "Good morning, warrior";
  if (hour < 17) return "Keep pushing forward";
  if (hour < 21) return "Evening focus mode";
  return "Night owl mode";
}

function MiniMissionLiveGradientLabel({ count, reduceMotion }: { count: number; reduceMotion: boolean }) {
  const fontSize = 17;
  const label = `${count} LIVE`;
  const w = Math.min(200, Math.max(44, Math.ceil(label.length * fontSize * 0.58)));
  const h = Math.ceil(fontSize * 1.2);
  const baseline = Math.ceil(fontSize * 0.88);

  const liveOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (reduceMotion || count <= 0) {
      liveOpacity.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(liveOpacity, { toValue: 0.55, duration: 650, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(liveOpacity, { toValue: 1, duration: 650, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
      { resetBeforeIteration: false },
    );
    loop.start();
    return () => loop.stop();
  }, [reduceMotion, count, liveOpacity]);

  return (
    <Animated.View style={{ opacity: reduceMotion ? 1 : liveOpacity }}>
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
    </Animated.View>
  );
}

const SECTION_GAP = 12;
const HEADER_BOTTOM_GAP = 6;

function MainMissionLegend({
  theme,
  isDark,
}: {
  theme: AppTheme;
  isDark: boolean;
}) {
  const items = [
    { key: "auto", label: "Auto", icon: Plane, color: theme.colors.cyan[400] },
    { key: "manual", label: "Manual", icon: Gamepad2, color: theme.colors.amber[500] },
    { key: "community", label: "Public", icon: Globe, color: theme.colors.cyan[400] },
    { key: "squad", label: "Squad", icon: Swords, color: theme.colors.indigo[400] },
  ] as const;

  return (
    <View style={styles.mainMissionLegend} accessibilityLabel="Main mission icon legend">
      {items.map(({ key, label, icon: Icon, color }) => (
        <View
          key={key}
          style={[
            styles.legendPill,
            {
              backgroundColor: isDark ? "rgba(148, 163, 184, 0.08)" : "rgba(148, 163, 184, 0.10)",
              borderColor: isDark ? "rgba(148, 163, 184, 0.18)" : "rgba(148, 163, 184, 0.24)",
            },
          ]}
        >
          <Icon size={11} color={color} strokeWidth={2.4} />
          <Text
            style={[styles.legendText, { color: theme.colors.textMuted }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.78}
          >
            {label}
          </Text>
        </View>
      ))}
    </View>
  );
}

function ShimmerTile({
  theme,
  isDark,
  reduceMotion,
}: {
  theme: AppTheme;
  isDark: boolean;
  reduceMotion: boolean;
}) {
  const shimmerX = useRef(new Animated.Value(0)).current;
  const [w, setW] = useState(0);

  useEffect(() => {
    if (reduceMotion || w <= 0) return;
    shimmerX.stopAnimation();
    shimmerX.setValue(-w);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerX, {
          toValue: w,
          duration: 1150,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.delay(250),
      ]),
      { resetBeforeIteration: true },
    );
    loop.start();
    return () => loop.stop();
  }, [reduceMotion, shimmerX, w]);

  const shimmerAlpha = reduceMotion ? 0 : 1;
  // Light mode needs a darker sheen to be visible on light surfaces.
  const sheen = isDark ? "rgba(255,255,255,0.22)" : "rgba(0,0,0,0.08)";
  const sheer = "rgba(255,255,255,0)";

  return (
    <View
      style={[
        skeletonStyles.bar,
        {
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surface,
        },
      ]}
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          skeletonStyles.shimmer,
          {
            opacity: shimmerAlpha,
            transform: [{ translateX: shimmerX }],
          },
        ]}
      >
        <LinearGradient
          colors={[sheer, sheen, sheer]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={skeletonStyles.shimmerGrad}
        />
      </Animated.View>
    </View>
  );
}

function ListSkeleton({
  theme,
  isDark,
  reduceMotion,
}: {
  theme: AppTheme;
  isDark: boolean;
  reduceMotion: boolean;
}) {
  return (
    <View style={skeletonStyles.wrap}>
      {[0, 1, 2, 3, 4].map((i) => (
        <ShimmerTile key={i} theme={theme} isDark={isDark} reduceMotion={reduceMotion} />
      ))}
    </View>
  );
}

export default function Home() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme, isDark } = useTheme();
  const { session, syncReady, syncError, retryHydrate } = useAuth();
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
  // On new devices, zustand can hydrate an "empty" store before Supabase hydrate completes.
  // Show skeleton until first Supabase hydrate finishes to avoid a confusing empty flash.
  const waitingForFirstSync = Boolean(showAccount && session?.user && !syncReady && !syncError);
  const cloudSyncBlocked = Boolean(showAccount && session?.user && syncError);

  const bellScale = useRef(new Animated.Value(1)).current;
  const bellBuzz = useRef(new Animated.Value(0)).current;
  const emptyIconScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (reduceMotion) {
      bellScale.setValue(1);
      bellBuzz.setValue(0);
      return;
    }
    if (unreadNotifCount > 0) {
      const loop = Animated.loop(
        Animated.sequence([
          // Quick "buzz" wiggle + punch scale, then rest.
          Animated.parallel([
            Animated.sequence([
              Animated.timing(bellBuzz, { toValue: 1, duration: 60, easing: Easing.out(Easing.linear), useNativeDriver: true }),
              Animated.timing(bellBuzz, { toValue: -1, duration: 60, easing: Easing.out(Easing.linear), useNativeDriver: true }),
              Animated.timing(bellBuzz, { toValue: 1, duration: 60, easing: Easing.out(Easing.linear), useNativeDriver: true }),
              Animated.timing(bellBuzz, { toValue: 0, duration: 70, easing: Easing.out(Easing.linear), useNativeDriver: true }),
            ]),
            Animated.sequence([
              Animated.timing(bellScale, { toValue: 1.22, duration: 110, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
              Animated.timing(bellScale, { toValue: 0.98, duration: 110, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
              Animated.timing(bellScale, { toValue: 1, duration: 160, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
            ]),
          ]),
          Animated.delay(2400),
        ]),
      );
      loop.start();
      return () => loop.stop();
    }
  }, [unreadNotifCount, reduceMotion, bellScale]);

  const bellBuzzStyle = useMemo(() => {
    const rotate = bellBuzz.interpolate({ inputRange: [-1, 0, 1], outputRange: ["-12deg", "0deg", "12deg"] });
    const translateX = bellBuzz.interpolate({ inputRange: [-1, 0, 1], outputRange: [-1.2, 0, 1.2] });
    return { transform: [{ translateX }, { rotate }] } as const;
  }, [bellBuzz]);

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

  const level = levelFromTotalXp(xp);
  const xpInLevel = xpInCurrentLevel(xp);
  const xpProgress = xpProgressInCurrentLevel(xp);

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

  const readyForCoachMarks = storeHydrated && !waitingForFirstSync;
  useCoachMark(
    "home_create_mission",
    {
      title: "Start with one mission",
      body: "Tap here when you are ready to build your first streak.",
      placement: "above",
    },
    readyForCoachMarks && activeTab === "missions" && habits.length === 0,
    900,
  );
  useCoachMark(
    "home_mini_missions",
    {
      title: "Use mini missions for quick focus",
      body: "Short timers are best for a task you can finish right now.",
      placement: "below",
    },
    readyForCoachMarks && habits.length > 0 && miniMissions.length === 0,
    900,
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
                    <Animated.View style={unreadNotifCount > 0 && !reduceMotion ? bellBuzzStyle : undefined}>
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
              {xpInLevel} / {XP_PER_LEVEL} XP
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

        <CoachMarkTarget id="home_mini_missions">
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
                {miniMissionStats.live > 0 ? (
                  <FireLottie
                    source={{ uri: FIRE_LOTTIE_URI }}
                    size={28}
                  />
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
                <MiniMissionLiveGradientLabel count={miniMissionStats.live} reduceMotion={reduceMotion} />
              ) : null}
              <ChevronRight size={20} color={theme.colors.textMuted} />
            </View>
          </TouchableOpacity>
        </CoachMarkTarget>

        <View style={styles.mainMissionsHeader}>
          <Text style={[styles.missionsLabel, { color: theme.colors.textMuted }]}>
            MAIN MISSIONS
          </Text>
          <MainMissionLegend theme={theme} isDark={isDark} />
        </View>

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
                    backgroundColor: isDark ? "rgba(99, 102, 241, 0.2)" : "rgba(79, 70, 229, 0.12)",
                  },
                ]}
                onPress={() => setReportsSegment(key)}
                activeOpacity={0.85}
              >
                <Text
                  style={[
                    styles.reportSegText,
                    { color: theme.colors.textSecondary },
                    reportsSegment === key && { color: theme.colors.indigo[400] },
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
          {cloudSyncBlocked ? (
            <ScrollView
              style={styles.emptyScroll}
              contentContainerStyle={styles.emptyScrollContent}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.emptyStateInner}>
                <View
                  style={[
                    styles.emptyIconContainer,
                    {
                      backgroundColor: theme.colors.surface,
                      borderColor: theme.colors.border,
                    },
                  ]}
                >
                  <Bell size={42} color={theme.colors.red[500]} />
                </View>
                <Text style={[styles.emptyTitle, { color: theme.colors.textPrimary, fontSize: theme.typography.h3 }]}>
                  Cloud sync paused
                </Text>
                <Text style={[styles.emptyDescription, { color: theme.colors.textSecondary }]}>
                  We could not safely load your account data. Remote writes are blocked until this retry succeeds.
                </Text>
                <View style={styles.emptyActions}>
                  <Button title="Retry Sync" onPress={retryHydrate} style={styles.emptyButton} />
                </View>
              </View>
            </ScrollView>
          ) : !storeHydrated || waitingForFirstSync ? (
            <ListSkeleton theme={theme} isDark={isDark} reduceMotion={reduceMotion} />
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
        <CoachMarkTarget id="home_create_mission" style={styles.fabInner}>
          <TouchableOpacity
            onPress={() => router.push("/create")}
            activeOpacity={0.8}
            style={styles.fabInner}
          >
            <Plus size={24} color="#fff" strokeWidth={3} />
          </TouchableOpacity>
        </CoachMarkTarget>
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
    flexShrink: 0,
  },
  mainMissionsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 6,
  },
  mainMissionLegend: {
    flexDirection: "row",
    flexWrap: "nowrap",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 3,
    flex: 1,
    minWidth: 0,
  },
  legendPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    borderWidth: 1,
    borderRadius: 9999,
    paddingHorizontal: 4,
    paddingVertical: 2,
    minHeight: 20,
    flexShrink: 1,
  },
  legendText: {
    fontSize: 8,
    lineHeight: 10,
    fontWeight: "800",
    flexShrink: 1,
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
  wrap: { flex: 1, gap: 12, paddingVertical: 8, minHeight: 360 },
  bar: {
    height: 104,
    borderRadius: 14,
    borderWidth: 1,
    opacity: 0.92,
    overflow: "hidden",
  },
  shimmer: {
    position: "absolute",
    top: -2,
    bottom: -2,
    left: 0,
    width: "55%",
  },
  shimmerGrad: { flex: 1 },
});
