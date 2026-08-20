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
  Camera,
  Clock3,
  CircleCheck,
  ArrowLeft,
  Timer,
  Globe,
  Radio,
  Plus,
  CircleX,
} from "lucide-react-native";
import { Screen } from "../../src/components/Screen";
import { Button } from "../../src/components/Button";
import { MiniMissionFireProgressBar } from "../../src/components/MiniMissionFireProgressBar";
import { useListCardEntrance } from "../../src/hooks/useListCardEntrance";
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
const MiniMissionCard = memo(function MiniMissionCard({ item, index }: { item: MiniMission; index: number }) {
  const router = useRouter();
  const { theme, isDark } = useTheme();
  const retryFailedMiniMission = useHabitStore((s) => s.retryFailedMiniMission);
  const [now, setNow] = useState(() => Date.now());
  const entranceStyle = useListCardEntrance(index);

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
  const isWaiting = !needsCheckIn && !isTimerUp && !isInProgress && !isCompleted && !isCancelled;

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

  const hasMoment = Boolean(
    item.completionMemory?.note ||
    item.completionMemory?.imageUri ||
    item.completionMemory?.imageUrl,
  );

  return (
    <Animated.View style={entranceStyle}>
    <View style={styles.card}>
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => router.push(`/mini/${item.id}`)}
        accessibilityRole="button"
        accessibilityLabel={`Open mission: ${item.title}`}
      >
      {/* Top row: title + status badge */}
      <View style={styles.cardTopRow}>
        <View style={styles.cardTitleRow}>
          {(item.visibility ?? "solo") === "public" && (
            <Globe size={theme.icon.md} color={theme.colors.cyan[400]} style={styles.publicTitleIcon} />
          )}
          <Text style={[styles.cardTitle, { color: theme.colors.textPrimary, fontSize: 13 }]} numberOfLines={1}>
            {item.title}
          </Text>
        </View>
        {item.liveSquadId || (!isWaiting && !isCompleted && !isTimerUp) || (isCompleted && hasMoment) ? (
          <View style={styles.cardBadgeStack}>
            {/* Live now shows top-right on every tab, including Failed, same spot as Done */}
            {item.liveSquadId ? (
              <View style={[styles.liveBadge, { borderColor: theme.colors.border }]}>
                <Text style={[styles.liveBadgeText, { color: theme.colors.textSecondary }]}>Live</Text>
              </View>
            ) : null}
            {/* Done tab: a dull camera glyph marks a captured moment instead of an inline "· Moment" text */}
            {isCompleted && hasMoment ? (
              <Camera size={14} color={theme.colors.textMuted} />
            ) : null}
            {/* "Waiting"/"Completed"/"Failed" are redundant with the tab they're already filtered into — skip the pill there */}
            {!isWaiting && !isCompleted && !isTimerUp ? (
              <View style={[styles.statusBadge, { backgroundColor: statusConfig.color + "18" }]}>
                <Text style={[styles.statusBadgeText, { color: statusConfig.color }]}>{statusConfig.label}</Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>

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

      {/* Queued: show estimated time — plain, no chip chrome */}
      {isWaiting && (
        <View style={styles.cardFooter}>
          <View style={styles.plainMetaRow}>
            <Clock3 size={14} color={theme.colors.textMuted} />
            <Text style={[styles.metaText, { color: theme.colors.textSecondary }]}>{totalMinutes} min</Text>
          </View>
        </View>
      )}

      {/* Completed: one plain line, no icons — matches the "quiet mono" design reference */}
      {isCompleted && item.startedAt && item.completedAt && (
        <Text style={[styles.completedMetaText, { color: theme.colors.green[500] }]}>
          Done in {Math.ceil((new Date(item.completedAt).getTime() - new Date(item.startedAt).getTime()) / 60000)} of {totalMinutes} min
        </Text>
      )}
      </TouchableOpacity>

      {/* Failed: no "Failed" pill (Live moved up top, same spot as Done) — Retry stays a plain text link, Open Squad is a real elevated button so it reads clearly as the primary action */}
      {isTimerUp ? (
        <View style={styles.failedMetaInlineRow}>
          <Text style={[styles.failedInlineTime, { color: theme.colors.textMuted }]} numberOfLines={1}>
            {totalMinutes} min
          </Text>
          {item.liveSquadId ? (
            <Button
              title="Open Squad"
              variant="secondary"
              icon={<Radio size={13} color={theme.colors.indigo[400]} />}
              onPress={() => router.push(`/live-mini/${item.liveSquadId}`)}
              style={styles.openSquadButton}
              textStyle={[styles.inlineActionText, { color: theme.colors.indigo[400] }]}
              accessibilityLabel={`Open Squad: ${item.title}`}
            />
          ) : (
            <TouchableOpacity
              style={styles.inlineActionLink}
              onPress={handleRetry}
              accessibilityRole="button"
              accessibilityLabel={`Retry mission: ${item.title}`}
            >
              <Timer size={13} color={theme.colors.green[500]} />
              <Text style={[styles.inlineActionText, { color: theme.colors.green[500] }]}>Retry</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : null}
    </View>
    </Animated.View>
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
  const activeTabIndex = tab === "active" || view === "running" ? 0 : tab === "queued" ? 1 : tab === "completed" ? 2 : 3;
  const [tabTrackWidth, setTabTrackWidth] = useState(0);
  const tabIndicatorX = useRef(new Animated.Value(activeTabIndex)).current;
  useEffect(() => {
    if (reduceMotion) {
      tabIndicatorX.setValue(activeTabIndex);
      return;
    }
    Animated.spring(tabIndicatorX, {
      toValue: activeTabIndex,
      useNativeDriver: true,
      friction: 10,
      tension: 90,
    }).start();
  }, [activeTabIndex, reduceMotion, tabIndicatorX]);

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
  // The FAB and the empty state's own "Create a Mini Mission" button would otherwise
  // stack redundantly on an empty Active/Waiting tab; and with nothing in any tab at
  // all, the empty state's button is the only create entry point that should show.
  const totalMiniMissionCount = activeCount + queuedCount + completedCount + failedCount;
  const hideFab =
    totalMiniMissionCount === 0 ||
    (tab === "active" && activeCount === 0) ||
    (tab === "queued" && queuedCount === 0);
  const renderMiniMission = useCallback(
    ({ item, index }: { item: MiniMission; index: number }) => <MiniMissionCard item={item} index={index} />,
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
            borderTopColor: theme.colors.border,
            borderBottomColor: theme.colors.border,
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

      <View
        style={[
          styles.tabContainer,
          {
            backgroundColor: isDark ? theme.colors.surface : theme.colors.surfaceElevated,
            borderColor: "transparent",
          },
        ]}
        onLayout={(event) => {
          const fullWidth = event.nativeEvent.layout.width;
          setTabTrackWidth(Math.max(0, fullWidth - 2 * 4 - 2 * 1));
        }}
      >
        {tabTrackWidth > 0 ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.tabIndicator,
              {
                width: tabTrackWidth / 4,
                backgroundColor: isDark ? theme.colors.surfaceElevated : theme.colors.surface,
                ...theme.shadow.card,
                transform: [
                  {
                    translateX: tabIndicatorX.interpolate({
                      inputRange: [0, 1, 2, 3],
                      outputRange: [0, tabTrackWidth / 4, (tabTrackWidth / 4) * 2, (tabTrackWidth / 4) * 3],
                    }),
                  },
                ],
              },
            ]}
          />
        ) : null}
        {(
          [
            ["active", "Active", activeCount] as const,
            ["queued", "Waiting", queuedCount] as const,
            ["completed", "Done", completedCount] as const,
            ["failed", "Failed", failedCount] as const,
          ] as const
        ).map(([key, label, count]) => {
          const selected = tab === key || (key === "active" && view === "running");
          return (
            <TouchableOpacity
              key={key}
              style={styles.tab}
              onPress={() => {
                setTab(key);
                if (view === "running") router.replace(`/mini?tab=${key}`);
              }}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.tabText,
                  { color: theme.colors.textSecondary },
                  selected && { color: theme.colors.indigo[600] },
                ]}
                numberOfLines={1}
              >
                {label}
              </Text>
              {/* Badge is always rendered (not just when selected) so a tab's own footprint never changes on selection — only its color does */}
              <View
                style={[
                  styles.tabCountBadge,
                  { backgroundColor: selected ? theme.colors.indigo[600] : theme.colors.border },
                ]}
              >
                <Text
                  style={[
                    styles.tabCountBadgeText,
                    !selected && { color: theme.colors.textSecondary },
                  ]}
                >
                  {count}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
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
            ItemSeparatorComponent={() => (
              <View style={[styles.rowDivider, { backgroundColor: theme.colors.border }]} />
            )}
          />
        )}
      </View>

      {hideFab ? null : (
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
      )}
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
    paddingVertical: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
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
  tabContainer: { flexDirection: "row", borderRadius: 14, padding: 4, marginBottom: 10, borderWidth: 1 },
  tab: { flex: 1, flexDirection: "row", paddingVertical: 10, alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 10, minHeight: 42 },
  tabIndicator: { position: "absolute", top: 4, bottom: 4, left: 4, borderRadius: 10 },
  tabText: { fontWeight: "700", fontSize: 13 },
  tabCountBadge: { minWidth: 20, height: 20, paddingHorizontal: 5, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  tabCountBadgeText: { color: "#ffffff", fontSize: 11, fontWeight: "800" },
  listWrap: { flex: 1 },
  listContent: { paddingBottom: 100 },
  rowDivider: { height: StyleSheet.hairlineWidth },
  // Card styles — flat list rows, no chip/border/shadow chrome (divider comes from the list's own ItemSeparatorComponent)
  card: { paddingVertical: 14 },
  inlineActionLink: {
    marginLeft: "auto",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  inlineActionText: { fontSize: 12, fontWeight: "700" },
  openSquadButton: {
    marginLeft: "auto",
    minHeight: 0,
    borderRadius: 10,
    paddingVertical: 7,
    paddingHorizontal: 12,
    gap: 5,
  },
  cardTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  cardTitleRow: { flex: 1, flexDirection: "row", alignItems: "center", marginRight: 8, minWidth: 0 },
  publicTitleIcon: { marginRight: 6 },
  cardTitle: { fontWeight: "700", flex: 1, minWidth: 0 },
  cardBadgeStack: { flexDirection: "row", alignItems: "center", gap: 8, maxWidth: 118 },
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
  liveBadgeText: { fontSize: 10, fontWeight: "700" },
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
  plainMetaRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  metaText: { fontSize: 12, fontWeight: "700" },
  completedMetaText: { fontSize: 11.5, fontWeight: "600", letterSpacing: 0.1, marginTop: 5 },
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
