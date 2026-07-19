import React, {
  memo,
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
  InteractionManager,
  Linking,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useFocusEffect, useIsFocused } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Defs, LinearGradient as SvgLinearGradient, Stop, Text as SvgText } from "react-native-svg";
import { FlashList } from "@shopify/flash-list";
const MissionFlashList = FlashList as any;
const habitKeyExtractor = (item: { id: string }) => item.id;
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
  Flame,
  Download,
} from "lucide-react-native";
import { useHabitStore } from "../../src/store/habitStore";
import { useShallow } from "zustand/react/shallow";
import { useAuth } from "../../src/context/AuthContext";
import { useAppVersion } from "../../src/context/AppVersionContext";
import { isSupabaseConfigured } from "../../src/lib/env";
import {
  countUnreadNotificationsCached,
  getCachedUnreadNotificationCount,
  getCachedChallengePrimarySnapshot,
  loadChallengePrimarySnapshot,
} from "../../src/lib/groupChallengesApi";
import type { AppTheme } from "../../src/styles/theme";
import { Button } from "../../src/components/Button";
import { HabitCard } from "../../src/components/HabitCard";
import { Screen } from "../../src/components/Screen";
import { useTheme } from "../../src/context/ThemeContext";
import { useReducedMotion } from "../../src/hooks/useReducedMotion";
import { AnimatedFire } from "../../src/components/AnimatedFire";
import { FireLottie, FIRE_LOTTIE_URI } from "../../src/components/FireLottie";
import { getMiniRemainingMs } from "../../src/utils/miniMissionTime";
import {
  isMainMissionPlayableOnHome,
  needsMainMissionOutcome,
} from "../../src/utils/mainMissionUi";
import { getHabitActiveMissionDateKey } from "../../src/utils/missionDaySlots";
import type { Habit, MiniMission } from "../../src/types/habit";
import {
  XP_PER_LEVEL,
  levelFromTotalXp,
  xpInCurrentLevel,
  xpProgressInCurrentLevel,
} from "../../src/utils/xpLevel";

const EMPTY_HABITS: Habit[] = [];
const EMPTY_MINI_MISSIONS: MiniMission[] = [];
const HOME_NOTIFICATION_COUNT_TTL_MS = 30_000;
const HOME_NOTIFICATION_REFRESH_DELAY_MS = 600;

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return "Burning the midnight oil";
  if (hour < 12) return "Good morning, warrior";
  if (hour < 17) return "Keep pushing forward";
  if (hour < 21) return "Evening focus mode";
  return "Night owl mode";
}

const MiniMissionLiveGradientLabel = memo(function MiniMissionLiveGradientLabel({ count, reduceMotion }: { count: number; reduceMotion: boolean }) {
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
});

const SECTION_GAP = 12;
const HEADER_BOTTOM_GAP = 6;

type HomeSpark =
  | { kind: "lead" | "chase"; title: string; body: string; challengeId: string }
  | { kind: "mini" | "xp" | "reports"; title: string; body: string };

const MainMissionLegend = memo(function MainMissionLegend({
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
});

const ShimmerTile = memo(function ShimmerTile({
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
          duration: 780,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.delay(70),
      ]),
      { resetBeforeIteration: true },
    );
    loop.start();
    return () => loop.stop();
  }, [reduceMotion, shimmerX, w]);

  const shimmerAlpha = reduceMotion ? 0 : 1;
  // Light mode needs a darker sheen to be visible on light surfaces.
  const sheen = isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.12)";
  const sheer = "rgba(255,255,255,0)";
  const trailingX = Animated.add(shimmerX, -Math.max(120, w * 0.5));

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
      <Animated.View
        pointerEvents="none"
        style={[
          skeletonStyles.shimmer,
          skeletonStyles.shimmerTrailing,
          {
            opacity: shimmerAlpha * 0.62,
            transform: [{ translateX: trailingX }],
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
});

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
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <ShimmerTile key={i} theme={theme} isDark={isDark} reduceMotion={reduceMotion} />
      ))}
    </View>
  );
}

export default function Home() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme, isDark } = useTheme();
  const isFocused = useIsFocused();
  const { session, syncReady, syncError, retryHydrate } = useAuth();
  const { softUpdateAvailable, latestVersion, softUpdateUrl, softUpdateMessage } = useAppVersion();
  const reduceMotion = useReducedMotion();
  const { habits, cohortPeerHabits, miniMissions, xp } = useHabitStore(
    useShallow((s) => ({
      habits: isFocused ? s.habits : EMPTY_HABITS,
      cohortPeerHabits: isFocused ? s.cohortPeerHabits : EMPTY_HABITS,
      miniMissions: isFocused ? s.miniMissions : EMPTY_MINI_MISSIONS,
      xp: isFocused ? s.xp : 0,
    })),
  );
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
  const [xpTrackWidth, setXpTrackWidth] = useState(0);
  const showAccount = isSupabaseConfigured();
  // On new devices, zustand can hydrate an "empty" store before Supabase hydrate completes.
  // Returning users should still see their persisted actions immediately.
  const waitingForFirstSync = Boolean(showAccount && session?.user && !syncReady && !syncError);
  const hasLocalHomeActions = habits.length > 0 || miniMissions.length > 0;
  const shouldHoldForFirstSync = waitingForFirstSync && !hasLocalHomeActions;
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
  const listContentStyle = useMemo(() => [
    styles.listContent,
    { paddingBottom: listBottomPad },
  ], [listBottomPad]);
  const renderHabitCard = useCallback(
    ({ item }: { item: (typeof filteredHabits)[0] }) => (
      <HabitCard item={item} nowMs={missionNow} />
    ),
    [missionNow],
  );

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
    let missionsCount = 0;
    let pending = 0;
    let accomplished = 0;
    let failed = 0;
    let hasIncomplete = false;

    for (const habit of habits) {
      if (isMainMissionPlayableOnHome(habit, missionNow)) missionsCount += 1;
      if (needsMainMissionOutcome(habit, missionNow)) pending += 1;
      if (habit.missionReport === "accomplished") accomplished += 1;
      if (habit.missionReport === "failed") failed += 1;
      if (!habit.missionReport && habit.status === "active") hasIncomplete = true;
    }

    const reportsCount = pending + accomplished + failed;
    const openMissionCount = missionsCount;
    return {
      missionsCount,
      reportsCount,
      openMissionCount,
      pending,
      accomplished,
      failed,
      hasIncomplete,
    };
  }, [habits, missionNow]);

  const miniMissionStats = useMemo(() => {
    let live = 0;
    let waiting = 0;
    for (const mission of miniMissions) {
      if (mission.status === "in_progress" && getMiniRemainingMs(mission, miniNow) > 0) {
        live += 1;
      } else if (mission.status === "pending" || mission.status === "scheduled") {
        waiting += 1;
      }
    }
    return { live, waiting, hasActiveCountdown: live > 0 };
  }, [miniMissions, miniNow]);

  const hasActiveMiniCountdown = miniMissionStats.hasActiveCountdown;

  useEffect(() => {
    if (!hasActiveMiniCountdown) return;
    const t = setInterval(() => setMiniNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, [hasActiveMiniCountdown]);

  const hasIncompleteMission = stats.hasIncomplete;

  useEffect(() => {
    if (!hasIncompleteMission) return;
    const t = setInterval(() => setMissionNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, [hasIncompleteMission]);

  const miniCount =
    miniMissionStats.live > 0
      ? miniMissionStats.live
      : miniMissionStats.waiting;

  const cohortPeersByChallengeId = useMemo(() => {
    const peersByChallenge = new Map<string, typeof cohortPeerHabits>();
    for (const peer of cohortPeerHabits) {
      const challengeId = peer.challengeGroupId;
      if (!challengeId) continue;
      const peers = peersByChallenge.get(challengeId);
      if (peers) {
        peers.push(peer);
      } else {
        peersByChallenge.set(challengeId, [peer]);
      }
    }
    return peersByChallenge;
  }, [cohortPeerHabits]);

  const homeSpark = useMemo<HomeSpark | null>(() => {
    // Deterministic daily seed so the card rotates across missions each day
    // without being random on every render.
    const todaySeed = new Date(missionNow).toISOString().slice(0, 10)
      .split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);

    const groupHabits = habits.filter(
      (h) =>
        h.challengeGroupId &&
        !h.missionReport &&
        isMainMissionPlayableOnHome(h, missionNow),
    );

    const squadSparks: HomeSpark[] = [];
    for (const habit of groupHabits) {
      // Skip habits the user already checked in for today — nothing left to ask.
      const todayKey = getHabitActiveMissionDateKey(habit, missionNow);
      if (todayKey != null && habit.completedDates.includes(todayKey)) continue;

      const challengeId = habit.challengeGroupId;
      if (!challengeId) continue;
      const peers = cohortPeersByChallengeId.get(challengeId);
      if (!peers || peers.length === 0) continue;
      const peerMaxStreak = peers.reduce((m, p) => Math.max(m, p.streak ?? 0), 0);
      const leadBy = habit.streak - peerMaxStreak;
      const behindBy = peerMaxStreak - habit.streak;
      if (leadBy > 0) {
        squadSparks.push({
          kind: "lead",
          title: "You are leading the squad",
          body: `Hold ${habit.title} today to keep a ${leadBy}d gap.`,
          challengeId,
        });
      } else if (behindBy > 0) {
        squadSparks.push({
          kind: "chase",
          title: "A squadmate moved ahead",
          body: `${behindBy}d gap in ${habit.title}. One check-in keeps you close.`,
          challengeId,
        });
      }
    }
    // Rotate daily through all actionable squad sparks so no single mission monopolises the card.
    if (squadSparks.length > 0) return squadSparks[todaySeed % squadSparks.length];

    if (miniMissionStats.live > 0) {
      return {
        kind: "mini",
        title: miniMissionStats.live === 1 ? "One mini mission is live" : `${miniMissionStats.live} mini missions are live`,
        body: "Finish before the timer cools off.",
      };
    }

    const xpLeft = Math.max(0, XP_PER_LEVEL - xpInLevel);
    if (xpLeft > 0 && xpLeft <= 50) {
      return {
        kind: "xp",
        title: `${xpLeft} XP from Level ${level + 1}`,
        body: "A check-in or quick mini can push you closer.",
      };
    }

    if (stats.pending > 0) {
      return {
        kind: "reports",
        title: stats.pending === 1 ? "One mission needs review" : `${stats.pending} missions need review`,
        body: "Lock the outcome from Reports when you are ready.",
      };
    }

    return null;
  }, [cohortPeersByChallengeId, habits, level, miniMissionStats.live, missionNow, stats.pending, xpInLevel]);

  const prewarmedChallengeIdRef = useRef<string | null>(null);

  useEffect(() => {
    const sparkChallengeId =
      homeSpark?.kind === "lead" || homeSpark?.kind === "chase" ? homeSpark.challengeId : null;
    if (!sparkChallengeId) return;
    if (prewarmedChallengeIdRef.current === sparkChallengeId) return;
    if (getCachedChallengePrimarySnapshot(sparkChallengeId)) {
      prewarmedChallengeIdRef.current = sparkChallengeId;
      return;
    }

    prewarmedChallengeIdRef.current = sparkChallengeId;
    const task = InteractionManager.runAfterInteractions(() => {
      void loadChallengePrimarySnapshot(sparkChallengeId).catch((error) => {
        if (__DEV__) console.warn("[home] prewarm challenge snapshot", error);
        if (prewarmedChallengeIdRef.current === sparkChallengeId) {
          prewarmedChallengeIdRef.current = null;
        }
      });
    });

    return () => {
      task.cancel?.();
    };
  }, [homeSpark]);

  const onHomeSparkPress = useCallback(() => {
    if (!homeSpark) return;
    if (homeSpark.kind === "lead" || homeSpark.kind === "chase") {
      router.push(`/challenge/${homeSpark.challengeId}`);
      return;
    }
    if (homeSpark.kind === "reports") {
      setActiveTab("reports");
      setReportsSegment("pending");
      return;
    }
    router.push("/mini");
  }, [homeSpark, router]);

  const onSoftUpdatePress = useCallback(() => {
    if (!softUpdateUrl) return;
    void Linking.openURL(softUpdateUrl).catch(() => {});
  }, [softUpdateUrl]);

  const greetingText = useMemo(() => getGreeting(), []);

  const headerOpacity = useRef(new Animated.Value(0)).current;
  const headerSlide = useRef(new Animated.Value(-15)).current;
  const animXpFill = useRef(new Animated.Value(xpProgress)).current;
  const prevXpProgressRef = useRef(xpProgress);

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
    if (prevXpProgressRef.current === xpProgress) return;
    prevXpProgressRef.current = xpProgress;
    if (reduceMotion) {
      animXpFill.setValue(xpProgress);
      return;
    }
    Animated.spring(animXpFill, {
      toValue: xpProgress,
      tension: 60,
      friction: 8,
      useNativeDriver: true,
    }).start();
  }, [animXpFill, reduceMotion, xpProgress]);

  useEffect(() => {
    const unsub = useHabitStore.persist.onFinishHydration(() =>
      setStoreHydrated(true),
    );
    if (useHabitStore.persist.hasHydrated()) setStoreHydrated(true);
    return unsub;
  }, []);

  const refreshNotificationCount = useCallback(async () => {
    const userId = session?.user?.id;
    if (!userId || !showAccount) {
      setUnreadNotifCount(0);
      return;
    }
    setNotifRefreshBusy(true);
    try {
      const n = await countUnreadNotificationsCached(userId, { force: true });
      setUnreadNotifCount((current) => (current === n ? current : n));
    } catch {
      setUnreadNotifCount(0);
    } finally {
      setNotifRefreshBusy(false);
    }
  }, [session?.user?.id, showAccount]);

  useFocusEffect(
    useCallback(() => {
      const userId = session?.user?.id;
      if (!userId || !showAccount) {
        setUnreadNotifCount(0);
        return;
      }
      let cancelled = false;
      let timer: ReturnType<typeof setTimeout> | null = null;
      const cached = getCachedUnreadNotificationCount(userId, Number.POSITIVE_INFINITY);
      if (cached != null) {
        setUnreadNotifCount((current) => (current === cached ? current : cached));
      }
      const task = InteractionManager.runAfterInteractions(() => {
        timer = setTimeout(() => {
          void countUnreadNotificationsCached(userId, { maxAgeMs: HOME_NOTIFICATION_COUNT_TTL_MS })
            .then((n) => {
              if (!cancelled) setUnreadNotifCount((current) => (current === n ? current : n));
            })
            .catch(() => {
              if (!cancelled) setUnreadNotifCount(0);
            });
        }, cached == null ? 0 : HOME_NOTIFICATION_REFRESH_DELAY_MS);
      });
      return () => {
        cancelled = true;
        if (timer) clearTimeout(timer);
        task.cancel();
      };
    }, [session?.user?.id, showAccount]),
  );

  useFocusEffect(
    useCallback(() => {
      const task = InteractionManager.runAfterInteractions(() => {
        setMissionNow(Date.now());
      });
      return () => task.cancel();
    }, []),
  );

  const refreshColors = useMemo(() => [theme.colors.indigo[400]], [theme.colors.indigo]);
  const notifRefreshControl = useMemo(() => (
    <RefreshControl
      refreshing={notifRefreshBusy}
      onRefresh={refreshNotificationCount}
      tintColor={theme.colors.indigo[400]}
      colors={refreshColors}
    />
  ), [notifRefreshBusy, refreshNotificationCount, theme.colors.indigo, refreshColors]);

  const SparkIcon =
    homeSpark?.kind === "lead"   ? Trophy :
    homeSpark?.kind === "chase"  ? Flame  :
    homeSpark?.kind === "mini"   ? Bolt   :
    homeSpark?.kind === "xp"     ? Zap    :
    Target;
  const sparkAccent =
    homeSpark?.kind === "lead"   ? theme.colors.yellow[400] :
    homeSpark?.kind === "chase"  ? theme.colors.red[500]    :
    homeSpark?.kind === "mini"   ? theme.colors.amber[500]  :
    theme.colors.cyan[400];
  const sparkTint =
    homeSpark?.kind === "lead"   ? (isDark ? "rgba(234,179,8,0.08)"   : "rgba(234,179,8,0.07)")   :
    homeSpark?.kind === "chase"  ? (isDark ? "rgba(239,68,68,0.09)"   : "rgba(239,68,68,0.07)")   :
    homeSpark?.kind === "mini"   ? (isDark ? "rgba(245,158,11,0.09)"  : "rgba(245,158,11,0.07)")  :
    homeSpark?.kind === "xp"     ? (isDark ? "rgba(34,211,238,0.08)"  : "rgba(34,211,238,0.06)")  :
    "transparent";

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
            onLayout={(e) => setXpTrackWidth(e.nativeEvent.layout.width)}
          >
            <Animated.View
              style={[
                StyleSheet.absoluteFillObject,
                {
                  transform: [
                    {
                      translateX: animXpFill.interpolate({
                        inputRange: [0, 1],
                        outputRange: [-(xpTrackWidth / 2), 0],
                        extrapolate: "clamp",
                      }),
                    },
                    { scaleX: animXpFill },
                  ],
                },
              ]}
            >
              <LinearGradient
                colors={["#f97316", "#fde047"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={{ flex: 1, borderRadius: 3 }}
              />
            </Animated.View>
          </View>
          {homeSpark ? (
            <TouchableOpacity
              activeOpacity={0.86}
              onPress={onHomeSparkPress}
              accessibilityRole="button"
            >
              <Animated.View
                style={[
                  styles.sparkInlineRow,
                  {
                    backgroundColor: sparkTint,
                    borderRadius: theme.radius.sm,
                  },
                ]}
              >
                <SparkIcon
                  size={13}
                  color={sparkAccent}
                  strokeWidth={2.6}
                  fill={homeSpark?.kind === "chase" ? sparkAccent : "transparent"}
                />
                <Text style={[styles.sparkInlineText, { color: theme.colors.textSecondary }]} numberOfLines={1}>
                  <Text style={[styles.sparkInlineTitle, { color: theme.colors.textPrimary }]}>
                    {homeSpark.title}
                  </Text>
                  {"  "}
                  {homeSpark.body}
                </Text>
                <ChevronRight size={14} color={theme.colors.textMuted} />
              </Animated.View>
            </TouchableOpacity>
          ) : stats.missionsCount > 0 ? (
            <Text style={[styles.sparkInlineText, { color: theme.colors.textMuted, marginTop: 7, paddingTop: 6 }]} numberOfLines={1}>
              All missions on track — keep the streak alive.
            </Text>
          ) : null}
        </View>

        {softUpdateAvailable ? (
          <TouchableOpacity
            activeOpacity={softUpdateUrl ? 0.86 : 1}
            disabled={!softUpdateUrl}
            onPress={onSoftUpdatePress}
            accessibilityRole={softUpdateUrl ? "button" : undefined}
            accessibilityLabel={
              latestVersion
                ? `Update version ${latestVersion} available`
                : "App update available"
            }
            style={[
              styles.softUpdateStrip,
              {
                backgroundColor: isDark ? "rgba(79, 70, 229, 0.14)" : "rgba(79, 70, 229, 0.08)",
                borderColor: isDark ? "rgba(129, 140, 248, 0.34)" : "rgba(79, 70, 229, 0.16)",
              },
            ]}
          >
            <View
              style={[
                styles.softUpdateIcon,
                {
                  backgroundColor: isDark ? "rgba(34, 211, 238, 0.14)" : "rgba(8, 145, 178, 0.1)",
                },
              ]}
            >
              <Download size={15} color={theme.colors.cyan[400]} strokeWidth={2.5} />
            </View>
            <View style={styles.softUpdateCopy}>
              <Text style={[styles.softUpdateTitle, { color: theme.colors.textPrimary }]} numberOfLines={1}>
                {latestVersion ? `Update v${latestVersion} available` : "Update available"}
              </Text>
              <Text style={[styles.softUpdateBody, { color: theme.colors.textMuted }]} numberOfLines={1}>
                {softUpdateMessage ?? "Small improvements are ready when you are."}
              </Text>
            </View>
            {softUpdateUrl ? (
              <View style={[styles.softUpdateAction, { backgroundColor: theme.colors.indigo[600] }]}>
                <Text style={styles.softUpdateActionText}>Update</Text>
              </View>
            ) : null}
          </TouchableOpacity>
        ) : null}

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
          ) : !storeHydrated || shouldHoldForFirstSync ? (
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
            <MissionFlashList
              data={filteredHabits}
              renderItem={renderHabitCard}
              estimatedItemSize={132}
              contentContainerStyle={listContentStyle}
              showsVerticalScrollIndicator={false}
              keyExtractor={habitKeyExtractor}
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
  softUpdateStrip: {
    minHeight: 48,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  softUpdateIcon: {
    width: 30,
    height: 30,
    borderRadius: 9999,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  softUpdateCopy: {
    flex: 1,
    minWidth: 0,
  },
  softUpdateTitle: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: "900",
  },
  softUpdateBody: {
    marginTop: 2,
    fontSize: 10.5,
    lineHeight: 13,
    fontWeight: "700",
  },
  softUpdateAction: {
    minHeight: 28,
    borderRadius: 9999,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  softUpdateActionText: {
    color: "#ffffff",
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "900",
  },
  sparkInlineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 7,
    paddingVertical: 6,
    paddingHorizontal: 8,
    minHeight: 22,
  },
  sparkInlineText: {
    flex: 1,
    minWidth: 0,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "700",
  },
  sparkInlineTitle: { fontWeight: "900" },
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
    width: "46%",
  },
  shimmerTrailing: { width: "34%" },
  shimmerGrad: { flex: 1 },
});
