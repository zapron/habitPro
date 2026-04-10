import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, StatusBar, Switch } from "react-native";
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
  Sparkles,
  Plus,
  CircleX,
} from "lucide-react-native";
import { Screen } from "../../src/components/Screen";
import { Button } from "../../src/components/Button";
import { MiniMissionFireProgressBar } from "../../src/components/MiniMissionFireProgressBar";
import { useTheme } from "../../src/context/ThemeContext";
import { useHabitStore } from "../../src/store/habitStore";
import { MiniMission } from "../../src/types/habit";
import { getMiniRemainingMs } from "../../src/utils/miniMissionTime";

type MiniTab = "active" | "queued" | "completed" | "failed";

const KEEP_SCREEN_ON_KEY = "@habitpro_mini_keep_screen_on";
const MINI_MISSIONS_KEEP_AWAKE_TAG = "mini-missions-list";

const formatCountdown = (ms: number) => {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
};

/* ─── Mini Mission Card ──────────────────────────────────── */
function MiniMissionCard({ item, now }: { item: MiniMission; now: number }) {
  const router = useRouter();
  const { theme, isDark } = useTheme();
  const retryFailedMiniMission = useHabitStore((s) => s.retryFailedMiniMission);

  const handleRetry = useCallback(() => {
    retryFailedMiniMission(item.id);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, [item.id, retryFailedMiniMission]);

  const totalMinutes = item.estimatedMinutes + (item.extendedMinutes ?? 0);
  const totalMs = totalMinutes * 60 * 1000;

  const isInProgress = item.status === "in_progress";
  const isCompleted = item.status === "completed";
  const isCancelled = item.status === "cancelled";

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

  const isTimerUp = isInProgress && remainingMs === 0;

  // Status styling
  const statusConfig = isTimerUp
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
      <View style={styles.cardTopRow}>
        <View style={styles.cardTitleRow}>
          {(item.visibility ?? "solo") === "public" && (
            <Globe size={theme.icon.md} color={theme.colors.cyan[400]} style={styles.publicTitleIcon} />
          )}
          <Text style={[styles.cardTitle, { color: theme.colors.textPrimary, fontSize: theme.typography.h3 }]} numberOfLines={1}>
            {item.title}
          </Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: statusConfig.color + "18" }]}>
          <Text style={[styles.statusBadgeText, { color: statusConfig.color }]}>{statusConfig.label}</Text>
        </View>
      </View>

      {/* Objective */}
      {!!item.objective && (
        <Text style={[styles.cardObjective, { color: theme.colors.textSecondary, fontSize: theme.typography.caption }]} numberOfLines={2}>
          {item.objective}
        </Text>
      )}

      {/* In-progress: live countdown + fire progress bar */}
      {isInProgress && (
        <View style={styles.timerSection}>
          <View style={styles.timerRow}>
            <View style={styles.timerLeft}>
              <Timer size={16} color={isTimerUp ? "#ef4444" : "#f97316"} />
              <Text
                style={[
                  styles.countdownText,
                  { color: isTimerUp ? "#ef4444" : theme.colors.textPrimary },
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
          <MiniMissionFireProgressBar progress={progress} isDark={isDark} />
        </View>
      )}

      {/* Queued: show estimated time */}
      {!isInProgress && !isCompleted && !isCancelled && (
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
              <Sparkles size={12} color={theme.colors.amber[500]} />
              <Text style={[styles.momentBadgeText, { color: theme.colors.amber[500] }]}>Moment</Text>
            </View>
          )}
          <Text style={[styles.totalTime, { color: theme.colors.textMuted }]}>of {totalMinutes} min</Text>
        </View>
      )}
      </TouchableOpacity>

      {isTimerUp ? (
        <View style={[styles.cardRetrySection, { borderTopColor: theme.colors.border }]}>
          <Button
            title="Retry mission"
            onPress={handleRetry}
            accessibilityLabel={`Retry mission: ${item.title}`}
          />
        </View>
      ) : null}
    </View>
  );
}

/* ─── Screen ─────────────────────────────────────────────── */
export default function MiniMissionsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme, isDark } = useTheme();
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
  const [now, setNow] = useState(Date.now());
  const [keepScreenOn, setKeepScreenOn] = useState(false);
  const isFocused = useIsFocused();

  useEffect(() => {
    AsyncStorage.getItem(KEEP_SCREEN_ON_KEY).then((v) => {
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
      await deactivateKeepAwake(MINI_MISSIONS_KEEP_AWAKE_TAG);
      if (cancelled) return;
      if (!isFocused || !keepScreenOn) return;
      await activateKeepAwakeAsync(MINI_MISSIONS_KEEP_AWAKE_TAG);
    })();
    return () => {
      cancelled = true;
      void deactivateKeepAwake(MINI_MISSIONS_KEEP_AWAKE_TAG);
    };
  }, [isFocused, keepScreenOn]);

  const onKeepScreenOnChange = useCallback((value: boolean) => {
    setKeepScreenOn(value);
    AsyncStorage.setItem(KEEP_SCREEN_ON_KEY, value ? "true" : "false").catch(() => {});
  }, []);

  // Tick only while at least one mission still has countdown > 0 (stops when all are failed or completed)
  const hasActiveCountdown = useMemo(
    () =>
      miniMissions.some((m) => {
        if (m.status !== "in_progress") return false;
        return getMiniRemainingMs(m, now) > 0;
      }),
    [miniMissions, now],
  );
  useEffect(() => {
    if (!hasActiveCountdown) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [hasActiveCountdown]);

  const filtered = useMemo(() => {
    if (view === "running") return miniMissions.filter((m) => m.status === "in_progress");
    if (tab === "active") {
      return miniMissions.filter(
        (m) => m.status === "in_progress" && getMiniRemainingMs(m, now) > 0,
      );
    }
    if (tab === "failed") {
      return miniMissions.filter(
        (m) => m.status === "in_progress" && getMiniRemainingMs(m, now) === 0,
      );
    }
    if (tab === "queued") return miniMissions.filter((m) => m.status === "pending" || m.status === "scheduled");
    if (tab === "completed") return miniMissions.filter((m) => m.status === "completed" || m.status === "cancelled");
    return [];
  }, [miniMissions, tab, view, now]);

  const activeCount = miniMissions.filter(
    (m) => m.status === "in_progress" && getMiniRemainingMs(m, now) > 0,
  ).length;
  const failedCount = miniMissions.filter(
    (m) => m.status === "in_progress" && getMiniRemainingMs(m, now) === 0,
  ).length;
  const queuedCount = miniMissions.filter((m) => m.status === "pending" || m.status === "scheduled").length;
  const completedCount = miniMissions.filter((m) => m.status === "completed" || m.status === "cancelled").length;

  return (
    <Screen>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={theme.colors.background} />
      <View style={styles.headerControls}>
        <TouchableOpacity style={[styles.iconButton, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]} onPress={() => router.back()} activeOpacity={0.8}>
          <ArrowLeft size={20} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerAccent, { color: theme.colors.textSecondary, fontSize: theme.typography.caption }]}>Mission deck</Text>
      </View>
      <View style={styles.header}>
        <Text style={[styles.eyebrow, { color: theme.colors.cyan[400], fontSize: theme.typography.micro }]}>MINI MISSIONS</Text>
        <Text style={[styles.title, { color: theme.colors.textPrimary, fontSize: theme.typography.h2 }]}>Mini missions</Text>
        <Text style={[styles.subtitle, { color: theme.colors.textSecondary, fontSize: theme.typography.caption }]}>Time is fuel—pack it, burn it, and finish the mission.</Text>
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
            While this screen is open, don't auto-lock (uses more battery).
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
            {tab === "failed" ? (
              <CircleX size={40} color={theme.colors.slate[500]} />
            ) : (
              <CircleCheck size={40} color={theme.colors.slate[500]} />
            )}
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
          </View>
        ) : (
          <FlashList
            data={filtered}
            renderItem={({ item }) => <MiniMissionCard item={item} now={now} />}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
            extraData={now}
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
  cardTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  cardTitleRow: { flex: 1, flexDirection: "row", alignItems: "center", marginRight: 8, minWidth: 0 },
  publicTitleIcon: { marginRight: 6 },
  cardTitle: { fontWeight: "700", flex: 1, minWidth: 0 },
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
  emptyTitle: { marginTop: 12, marginBottom: 8, fontWeight: "700", textAlign: "center" },
  emptyText: { textAlign: "center", marginBottom: 16 },
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
