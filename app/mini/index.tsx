import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Text } from "../../src/components/AppText";
import {
  Animated,
  Easing,
  View,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Switch,
} from "react-native";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useIsFocused } from "@react-navigation/native";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { useLocalSearchParams, useRouter } from "expo-router";
import { FlashList } from "@shopify/flash-list";
import {
  Clock3,
  CircleCheck,
  ArrowLeft,
  Check,
  Timer,
  Globe,
  Radio,
  Camera,
  Plus,
  CircleX,
} from "lucide-react-native";
import { Screen } from "../../src/components/Screen";
import { Button } from "../../src/components/Button";
import { MiniMissionFireProgressBar } from "../../src/components/MiniMissionFireProgressBar";
import { useTheme } from "../../src/context/ThemeContext";
import { useHabitStore } from "../../src/store/habitStore";
import { MiniMission } from "../../src/types/habit";
import { useRemoteStoreRefreshOnFocus } from "../../src/hooks/useRemoteStoreRefreshOnFocus";
import { useReducedMotion } from "../../src/hooks/useReducedMotion";
import { backOrReplace } from "../../src/lib/navigation";
import {
  getMiniMissionDisplayStatus,
  getMiniRemainingMs,
  isMiniMissionAwaitingCheckIn,
  isMiniMissionMissed,
} from "../../src/utils/miniMissionTime";
import {
  MINI_MISSION_KEEP_SCREEN_ON_KEY,
  MINI_MISSIONS_LIST_KEEP_AWAKE_TAG,
} from "../../src/constants/miniMissionKeepAwake";

type MiniTab = "active" | "queued" | "completed" | "failed";
const MINI_LIST_CLOCK_MS = 5000;

const formatCountdown = (ms: number) => {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
};

/* ─── Mini Mission Card ──────────────────────────────────── */
const MiniMissionCard = memo(function MiniMissionCard({ item }: { item: MiniMission }) {
  const router = useRouter();
  const { theme, isDark } = useTheme();
  const retryFailedMiniMission = useHabitStore((s) => s.retryFailedMiniMission);
  const [now, setNow] = useState(() => Date.now());

  const handleRetry = useCallback(() => {
    retryFailedMiniMission(item.id);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, [item.id, retryFailedMiniMission]);

  const totalMinutes = item.estimatedMinutes + (item.extendedMinutes ?? 0);
  const totalMs = totalMinutes * 60 * 1000;

  const isInProgress = item.status === "in_progress";
  const isCompleted = item.status === "completed";
  const isCancelled = item.status === "cancelled";
  const displayStatus = getMiniMissionDisplayStatus(item, now);

  useEffect(() => {
    if (!isInProgress || !item.startedAt) return;
    if (getMiniRemainingMs(item, Date.now()) <= 0) return;
    const timer = setInterval(() => {
      const next = Date.now();
      setNow(next);
      if (getMiniRemainingMs(item, next) <= 0) {
        clearInterval(timer);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [isInProgress, item]);

  // Countdown & progress for in-progress missions
  let remainingMs = totalMs;
  let elapsedMs = 0;
  let progress = 0;

  if (isInProgress && item.startedAt) {
    const startMs = new Date(item.startedAt).getTime();
    elapsedMs = now - startMs;
    remainingMs = Math.max(0, totalMs - elapsedMs);
    progress = Math.min(1, elapsedMs / totalMs);
  }

  const needsCheckIn = displayStatus === "review";
  const isTimerUp = displayStatus === "failed";

  // Status styling
  const statusConfig = needsCheckIn
    ? { label: "Check In", color: theme.colors.green[500] }
    : isTimerUp
    ? { label: "Failed", color: "#ef4444" }
    : isInProgress
      ? { label: "🔥 On mission", color: "#f97316" }
      : isCompleted
        ? { label: "✅ Completed", color: theme.colors.green[500] }
        : isCancelled
          ? { label: "Cancelled", color: theme.colors.textMuted }
          : { label: "Waiting", color: theme.colors.textSecondary };

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.lg,
          borderWidth: 1,
          ...theme.shadow.card,
        },
      ]}
    >
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => router.push(`/mini/${item.id}`)}
        accessibilityRole="button"
        accessibilityLabel={`Open mission: ${item.title}`}
      >
      {/* Top row: title + status badge */}
      <View style={[styles.cardTopRow, isTimerUp && styles.failedCardTopRow]}>
        <View style={styles.cardTitleRow}>
          {(item.visibility ?? "solo") === "public" && (
            <Globe size={theme.icon.md} color={theme.colors.cyan[400]} style={styles.publicTitleIcon} />
          )}
          <Text style={[styles.cardTitle, { color: theme.colors.textPrimary, fontSize: theme.typography.h3 }]} numberOfLines={1}>
            {item.title}
          </Text>
        </View>
        {!isTimerUp ? (
          <View style={styles.cardBadgeStack}>
            {item.liveSquadId ? (
              <View
                style={[
                  styles.liveBadge,
                  {
                    backgroundColor: isDark ? "rgba(34,211,238,0.12)" : "rgba(8,145,178,0.1)",
                    borderColor: isDark ? "rgba(34,211,238,0.3)" : "rgba(8,145,178,0.2)",
                  },
                ]}
              >
                <Radio size={12} color={theme.colors.cyan[400]} />
                <Text style={[styles.liveBadgeText, { color: theme.colors.cyan[400] }]}>Live</Text>
              </View>
            ) : null}
            <View style={[styles.statusBadge, { backgroundColor: statusConfig.color + "18" }]}>
              <Text style={[styles.statusBadgeText, { color: statusConfig.color }]}>{statusConfig.label}</Text>
            </View>
          </View>
        ) : null}
      </View>

      {isTimerUp ? (
        <View style={styles.failedMetaInlineRow}>
          {item.liveSquadId ? (
            <View
              style={[
                styles.liveBadge,
                {
                  backgroundColor: isDark ? "rgba(34,211,238,0.12)" : "rgba(8,145,178,0.1)",
                  borderColor: isDark ? "rgba(34,211,238,0.3)" : "rgba(8,145,178,0.2)",
                },
              ]}
            >
              <Radio size={12} color={theme.colors.cyan[400]} />
              <Text style={[styles.liveBadgeText, { color: theme.colors.cyan[400] }]}>Live</Text>
            </View>
          ) : null}
          <View style={[styles.statusBadge, { backgroundColor: statusConfig.color + "18" }]}>
            <Text style={[styles.statusBadgeText, { color: statusConfig.color }]}>{statusConfig.label}</Text>
          </View>
          <Text style={[styles.failedInlineTime, { color: theme.colors.textMuted }]} numberOfLines={1}>
            {totalMinutes} min total
          </Text>
        </View>
      ) : null}

      {/* Objective */}
      {!!item.objective && (
        <Text style={[styles.cardObjective, { color: theme.colors.textSecondary, fontSize: theme.typography.caption }]} numberOfLines={2}>
          {item.objective}
        </Text>
      )}

      {/* In-progress: live countdown + fire progress bar */}
      {isInProgress && !isTimerUp && !needsCheckIn && (
        <View style={styles.timerSection}>
          <View style={styles.timerRow}>
            <View style={styles.timerLeft}>
              <Timer size={16} color="#f97316" />
              <Text
                style={[
                  styles.countdownText,
                  { color: theme.colors.textPrimary },
                ]}
              >
                {formatCountdown(remainingMs)}
              </Text>
              <Text style={[styles.remainLabel, { color: theme.colors.textMuted }]}>remaining</Text>
            </View>
            <Text style={[styles.totalTime, { color: theme.colors.textMuted }]}>
              {totalMinutes} min total
            </Text>
          </View>
          <MiniMissionFireProgressBar
            progress={progress}
            isDark={isDark}
            showCompleteEffect={false}
          />
        </View>
      )}

      {needsCheckIn && (
        <View style={styles.cardFooter}>
          <View style={[styles.metaPill, { borderColor: theme.colors.green[500] + "40", backgroundColor: theme.colors.green[500] + "10" }]}>
            <Clock3 size={14} color={theme.colors.green[500]} />
            <Text style={[styles.metaText, { color: theme.colors.green[500] }]}>Check In</Text>
          </View>
        </View>
      )}

      {/* Queued: show estimated time */}
      {!isInProgress && !isCompleted && !isCancelled && !isTimerUp && (
        <View style={styles.cardFooter}>
          <View style={[styles.metaPill, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceElevated }]}>
            <Clock3 size={14} color={theme.colors.cyan[400]} />
            <Text style={[styles.metaText, { color: theme.colors.textPrimary }]}>{totalMinutes} min</Text>
          </View>
        </View>
      )}

      {/* Completed: show completion info */}
      {isCompleted && item.startedAt && item.completedAt && (
        <View style={styles.cardFooter}>
          <View style={[styles.metaPill, { borderColor: theme.colors.green[500] + "40", backgroundColor: theme.colors.green[500] + "10" }]}>
            <Check size={14} color={theme.colors.green[500]} />
            <Text style={[styles.metaText, { color: theme.colors.green[500] }]}>
              Done in {Math.ceil((new Date(item.completedAt).getTime() - new Date(item.startedAt).getTime()) / 60000)} min
            </Text>
          </View>
          {(item.completionMemory?.note ||
            item.completionMemory?.imageUri ||
            item.completionMemory?.imageUrl) && (
            <View style={styles.momentBadge}>
              <Camera size={12} color={theme.colors.amber[500]} />
              <Text style={[styles.momentBadgeText, { color: theme.colors.amber[500] }]}>Moment</Text>
            </View>
          )}
          <Text style={[styles.totalTime, { color: theme.colors.textMuted }]}>of {totalMinutes} min</Text>
        </View>
      )}
      </TouchableOpacity>

      {isTimerUp ? (
        <View style={[styles.cardRetrySection, { borderTopColor: theme.colors.border }]}>
          {item.liveSquadId ? (
            <Button
              title="Open Live Squad"
              variant="subtle"
              icon={<Radio size={16} color={theme.colors.cyan[400]} />}
              onPress={() => router.push(`/live-mini/${item.liveSquadId}`)}
              style={styles.failedActionButton}
              textStyle={styles.failedActionText}
              accessibilityLabel={`Open Live Squad: ${item.title}`}
            />
          ) : (
            <Button
              title="Retry"
              variant="subtle"
              icon={<Timer size={16} color={theme.colors.textSecondary} />}
              onPress={handleRetry}
              style={styles.failedActionButton}
              textStyle={styles.failedActionText}
              accessibilityLabel={`Retry mission: ${item.title}`}
            />
          )}
        </View>
      ) : null}
    </View>
  );
});

/* ─── Screen ─────────────────────────────────────────────── */
export default function MiniMissionsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme, isDark } = useTheme();
  useRemoteStoreRefreshOnFocus();
  const { view, tab: tabParam } = useLocalSearchParams<{ view?: string; tab?: string }>();
  const miniMissions = useHabitStore((state) => state.miniMissions);
  const initialTab: MiniTab =
    tabParam === "queued"
      ? "queued"
      : tabParam === "completed"
        ? "completed"
        : tabParam === "failed"
          ? "failed"
          : "active";
  const [tab, setTab] = useState<MiniTab>(initialTab);
  const [listNow, setListNow] = useState(Date.now());
  const [keepScreenOn, setKeepScreenOn] = useState(false);
  const isFocused = useIsFocused();
  const reduceMotion = useReducedMotion();
  const emptyIconScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (reduceMotion) {
      emptyIconScale.setValue(1);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(emptyIconScale, { toValue: 1.05, duration: 2000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(emptyIconScale, { toValue: 1, duration: 2000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduceMotion, emptyIconScale]);

  useEffect(() => {
    AsyncStorage.getItem(MINI_MISSION_KEEP_SCREEN_ON_KEY).then((v) => {
      if (v === "true") setKeepScreenOn(true);
    }).catch(() => {});
  }, []);

  /**
   * Keep awake only while this screen is focused AND the user opted in.
   * Always await deactivate before activate so a slow activate cannot re-lock after toggle off.
   */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await deactivateKeepAwake(MINI_MISSIONS_LIST_KEEP_AWAKE_TAG);
      if (cancelled) return;
      if (!isFocused || !keepScreenOn) return;
      await activateKeepAwakeAsync(MINI_MISSIONS_LIST_KEEP_AWAKE_TAG);
    })();
    return () => {
      cancelled = true;
      void deactivateKeepAwake(MINI_MISSIONS_LIST_KEEP_AWAKE_TAG);
    };
  }, [isFocused, keepScreenOn]);

  const onKeepScreenOnChange = useCallback((value: boolean) => {
    setKeepScreenOn(value);
    AsyncStorage.setItem(MINI_MISSION_KEEP_SCREEN_ON_KEY, value ? "true" : "false").catch(() => {});
  }, []);

  // Tick only while at least one mission still has countdown > 0 (stops when all are failed or completed)
  const hasActiveCountdown = useMemo(
    () =>
      miniMissions.some((m) => {
        if (m.status !== "in_progress") return false;
        return getMiniRemainingMs(m, listNow) > 0;
      }),
    [miniMissions, listNow],
  );
  useEffect(() => {
    if (!hasActiveCountdown) return;
    const timer = setInterval(() => setListNow(Date.now()), MINI_LIST_CLOCK_MS);
    return () => clearInterval(timer);
  }, [hasActiveCountdown]);

  const filtered = useMemo(() => {
    const latestMs = (m: MiniMission) => {
      const t =
        m.completedAt ??
        m.startedAt ??
        m.scheduledStartAt ??
        m.createdAt;
      const ms = new Date(t).getTime();
      return Number.isFinite(ms) ? ms : 0;
    };

    const sortByLatestDesc = (arr: MiniMission[]) =>
      [...arr].sort((a, b) => latestMs(b) - latestMs(a));

    if (view === "running") {
      return sortByLatestDesc(miniMissions.filter((m) => m.status === "in_progress"));
    }
    if (tab === "active") {
      return sortByLatestDesc(
        miniMissions.filter(
          (m) =>
            m.status === "in_progress" &&
            (getMiniRemainingMs(m, listNow) > 0 || isMiniMissionAwaitingCheckIn(m, listNow)),
        ),
      );
    }
    if (tab === "failed") {
      return sortByLatestDesc(
        miniMissions.filter((m) => {
          if (m.status === "cancelled") return true;
          return isMiniMissionMissed(m, listNow);
        }),
      );
    }
    if (tab === "queued") {
      return sortByLatestDesc(
        miniMissions.filter((m) => m.status === "pending" || m.status === "scheduled"),
      );
    }
    if (tab === "completed") {
      return sortByLatestDesc(
        miniMissions.filter((m) => m.status === "completed"),
      );
    }
    return [];
  }, [miniMissions, tab, view, listNow]);

  const activeCount = miniMissions.filter(
    (m) =>
      m.status === "in_progress" &&
      (getMiniRemainingMs(m, listNow) > 0 || isMiniMissionAwaitingCheckIn(m, listNow)),
  ).length;
  const failedCount = miniMissions.filter(
    (m) => m.status === "cancelled" || isMiniMissionMissed(m, listNow),
  ).length;
  const queuedCount = miniMissions.filter((m) => m.status === "pending" || m.status === "scheduled").length;
  const completedCount = miniMissions.filter((m) => m.status === "completed").length;
  const renderMiniMission = useCallback(
    ({ item }: { item: MiniMission }) => <MiniMissionCard item={item} />,
    [],
  );

  return (
    <Screen>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={theme.colors.background} />
      <View style={styles.headerControls}>
        <TouchableOpacity style={[styles.iconButton, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]} onPress={() => backOrReplace(router, "/")} activeOpacity={0.8}>
          <ArrowLeft size={20} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerAccent, { color: theme.colors.textSecondary, fontSize: theme.typography.caption }]}>Mission deck</Text>
      </View>
      <View style={styles.header}>
        <Text style={[styles.eyebrow, { color: theme.colors.cyan[400], fontSize: theme.typography.micro }]}>MINI MISSIONS</Text>
        <Text style={[styles.title, { color: theme.colors.textPrimary, fontSize: theme.typography.h2 }]}>Mini missions</Text>
        <Text style={[styles.subtitle, { color: theme.colors.textSecondary, fontSize: theme.typography.caption }]}>Time is fuel. Pack it, burn it, and finish the mission.</Text>
      </View>

      <View
        style={[
          styles.keepScreenRow,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
            borderRadius: theme.radius.md,
          },
        ]}
      >
        <View style={styles.keepScreenTextCol}>
          <Text style={[styles.keepScreenLabel, { color: theme.colors.textPrimary, fontSize: theme.typography.caption }]}>
            Keep screen on
          </Text>
          <Text style={[styles.keepScreenHint, { color: theme.colors.textMuted, fontSize: theme.typography.micro }]}>
            Mini mission timers won't auto-lock while running (uses more battery).
          </Text>
        </View>
        <Switch
          value={keepScreenOn}
          onValueChange={onKeepScreenOnChange}
          trackColor={{ false: theme.colors.border, true: theme.colors.indigo[600] }}
          thumbColor={theme.colors.white}
          ios_backgroundColor={theme.colors.border}
        />
      </View>

      <View style={[styles.tabContainer, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderRadius: theme.radius.md }]}>
        <TouchableOpacity
          style={[styles.tab, (tab === "active" || view === "running") && [styles.activeTab, { backgroundColor: theme.colors.indigo[600] }]]}
          onPress={() => { setTab("active"); if (view === "running") router.replace("/mini?tab=active"); }}
        >
          <Text
            style={[styles.tabText, { color: theme.colors.textSecondary }, (tab === "active" || view === "running") && styles.activeTabText]}
            numberOfLines={1}
          >
            Active ({activeCount})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === "queued" && [styles.activeTab, { backgroundColor: theme.colors.indigo[600] }]]}
          onPress={() => { setTab("queued"); if (view === "running") router.replace("/mini?tab=queued"); }}
        >
          <Text style={[styles.tabText, { color: theme.colors.textSecondary }, tab === "queued" && styles.activeTabText]} numberOfLines={1}>
            Waiting ({queuedCount})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === "completed" && [styles.activeTab, { backgroundColor: theme.colors.indigo[600] }]]}
          onPress={() => { setTab("completed"); if (view === "running") router.replace("/mini?tab=completed"); }}
        >
          <Text style={[styles.tabText, { color: theme.colors.textSecondary }, tab === "completed" && styles.activeTabText]} numberOfLines={1}>
            Done ({completedCount})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === "failed" && [styles.activeTab, { backgroundColor: theme.colors.indigo[600] }]]}
          onPress={() => { setTab("failed"); if (view === "running") router.replace("/mini?tab=failed"); }}
        >
          <Text style={[styles.tabText, { color: theme.colors.textSecondary }, tab === "failed" && styles.activeTabText]} numberOfLines={1}>
            Failed ({failedCount})
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.listWrap}>
        {filtered.length === 0 ? (
          <View style={styles.empty}>
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
              {tab === "failed" ? (
                <CircleX size={40} color={theme.colors.slate[500]} />
              ) : (
                <CircleCheck size={40} color={theme.colors.slate[500]} />
              )}
            </Animated.View>
            <Text style={[styles.emptyTitle, { color: theme.colors.textPrimary, fontSize: theme.typography.h3 }]}>
              {tab === "active"
                ? "No active mini missions"
                : tab === "failed"
                  ? "No failed missions"
                  : tab === "queued"
                    ? "No missions waiting yet"
                    : "No completed mini missions yet"}
            </Text>
            <Text style={[styles.emptyText, { color: theme.colors.textSecondary }]}>
              {tab === "active"
                ? "Start a mini mission to see it here."
                : tab === "failed"
                  ? "When time runs out before you mark complete, the mission lands here."
                  : tab === "queued"
                    ? "Create a mission and choose Start Later when you are ready."
                    : "Finish a mission to build momentum."}
            </Text>
            {tab === "active" || tab === "queued" ? (
              <Button
                title="Create a Mini Mission"
                onPress={() => router.push("/mini/create")}
                style={styles.emptyButton}
              />
            ) : null}
          </View>
        ) : (
          <FlashList
            data={filtered}
            renderItem={renderMiniMission}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
          />
        )}
      </View>

      <View
        style={[
          styles.fabWrap,
          {
            bottom: Math.max(insets.bottom, 12) + 12,
            right: Math.max(insets.right, 16),
          },
        ]}
        pointerEvents="box-none"
      >
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Create mini mission"
          onPress={() => router.push("/mini/create")}
          activeOpacity={0.92}
          style={[
            styles.fab,
            {
              backgroundColor: theme.colors.indigo[600],
              ...theme.shadow.glow,
            },
          ]}
        >
          <Plus size={28} color={theme.colors.white} strokeWidth={2.5} />
        </TouchableOpacity>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerControls: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  header: { alignItems: "flex-start", marginBottom: 16 },
  iconButton: { width: 40, height: 40, borderRadius: 9999, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  eyebrow: { fontWeight: "700", letterSpacing: 1.2, marginBottom: 6 },
  title: { fontWeight: "800" },
  subtitle: { marginTop: 4 },
  keepScreenRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    marginBottom: 14,
  },
  keepScreenTextCol: { flex: 1 },
  keepScreenLabel: { fontWeight: "700" },
  keepScreenHint: { marginTop: 3, lineHeight: 16 },
  headerAccent: { fontWeight: "700", letterSpacing: 0.3 },
  stats: { flexDirection: "row", gap: 10, marginBottom: 16 },
  statsCard: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 10, borderWidth: 1 },
  statsValue: { fontSize: 22, fontWeight: "800" },
  statsLabel: { fontSize: 11 },
  tabContainer: { flexDirection: "row", borderWidth: 1, padding: 4, marginBottom: 14 },
  tab: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 10, borderRadius: 10 },
  activeTab: {},
  tabText: { fontWeight: "700", fontSize: 11 },
  activeTabText: { color: "#ffffff" },
  listWrap: { flex: 1 },
  listContent: { paddingBottom: 100 },
  // Card styles
  card: { padding: 16, marginBottom: 12 },
  cardRetrySection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  failedActionButton: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 11,
    paddingHorizontal: 16,
  },
  failedActionText: { fontSize: 15, fontWeight: "800" },
  cardTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  failedCardTopRow: { alignItems: "flex-start", marginBottom: 0 },
  cardTitleRow: { flex: 1, flexDirection: "row", alignItems: "center", marginRight: 8, minWidth: 0 },
  publicTitleIcon: { marginRight: 6 },
  cardTitle: { fontWeight: "700", flex: 1, minWidth: 0 },
  cardBadgeStack: { alignItems: "flex-end", gap: 5, maxWidth: 118 },
  failedMetaInlineRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10, flexWrap: "wrap" },
  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 9999,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  liveBadgeText: { fontSize: 10, fontWeight: "900" },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 9999 },
  statusBadgeText: { fontSize: 11, fontWeight: "800", letterSpacing: 0.3 },
  cardObjective: { lineHeight: 20, marginBottom: 4 },
  // Timer section (in-progress cards)
  timerSection: { marginTop: 8 },
  timerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  timerLeft: { flexDirection: "row", alignItems: "center", gap: 6 },
  countdownText: { fontSize: 22, fontWeight: "800", fontVariant: ["tabular-nums"] },
  remainLabel: { fontSize: 11, fontWeight: "600" },
  totalTime: { fontSize: 11, fontWeight: "600" },
  failedInlineTime: { fontSize: 11, fontWeight: "800", lineHeight: 15 },
  // Footer (queued / completed)
  cardFooter: { marginTop: 10, flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  metaPill: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 9999, borderWidth: 1, paddingVertical: 4, paddingHorizontal: 10 },
  metaText: { fontSize: 12, fontWeight: "700" },
  momentBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.35)",
    backgroundColor: "rgba(245, 158, 11, 0.12)",
  },
  momentBadgeText: { fontSize: 11, fontWeight: "800" },
  // Empty state
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },
  emptyIconContainer: {
    width: 94,
    height: 94,
    borderRadius: 9999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    marginBottom: 16,
  },
  emptyTitle: { marginBottom: 8, fontWeight: "700", textAlign: "center" },
  emptyText: { textAlign: "center", marginBottom: 16 },
  emptyButton: { width: "100%", maxWidth: 280 },
  fabWrap: {
    position: "absolute",
    zIndex: 20,
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
});
