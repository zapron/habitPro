import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, Check, Flame, Info, Radio, Timer, Trophy, UserPlus, Users, X } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { Text } from "../../src/components/AppText";
import { LiveMiniInviteSheet } from "../../src/components/LiveMiniInviteSheet";
import { Screen } from "../../src/components/Screen";
import { Button } from "../../src/components/Button";
import { FuelQuickMinutesStrip } from "../../src/components/fuel/FuelQuickMinutesStrip";
import { FuelTimePresetButton } from "../../src/components/fuel/FuelTimePresetButton";
import { useAuth } from "../../src/context/AuthContext";
import { useNotificationGate } from "../../src/context/NotificationGateContext";
import { useTheme } from "../../src/context/ThemeContext";
import { useToast } from "../../src/context/ToastContext";
import {
  acceptLiveMiniInvite,
  declineLiveMiniInvite,
  fetchLiveMiniSquad,
  formatLiveMiniElapsed,
  subscribeLiveMiniSquad,
} from "../../src/lib/liveMiniMissionsApi";
import { syncLiveMiniFromLocalMission } from "../../src/lib/liveMiniMissionProgress";
import { backOrReplace } from "../../src/lib/navigation";
import { traceAsync } from "../../src/lib/perfTrace";
import { useHabitStore } from "../../src/store/habitStore";
import type { MiniMission } from "../../src/types/habit";
import type {
  LiveMiniParticipantRow,
  LiveMiniParticipantStatus,
  LiveMiniProfileLabel,
  LiveMiniSquadSnapshot,
} from "../../src/types/liveMiniMission";
import { levelFromTotalXp } from "../../src/utils/xpLevel";

const QUICK_MINUTES = [
  { label: "5m", minutes: 5 },
  { label: "15m", minutes: 15 },
  { label: "30m", minutes: 30 },
  { label: "45m", minutes: 45 },
];

const LONG_PRESETS = [
  { label: "1h", minutes: 60 },
  { label: "90m", minutes: 90 },
  { label: "2h", minutes: 120 },
  { label: "4h", minutes: 240 },
  { label: "8h", minutes: 480 },
];

const LIVE_MINI_BOARD_RELOAD_TTL_MS = 12_000;
const LIVE_MINI_REALTIME_DEBOUNCE_MS = 350;

function clampMinutes(value: number): number {
  return Math.max(1, Math.min(480, Math.round(value)));
}

function createMiniMissionId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

function displayName(label: LiveMiniProfileLabel | undefined): string {
  if (label?.displayName) return label.displayName;
  if (label?.username) return `@${label.username.toLowerCase()}`;
  return "Member";
}

function shortDisplayName(label: LiveMiniProfileLabel | undefined, fallback = "Member"): string {
  const name = displayName(label).replace(/^@/, "");
  return name || fallback;
}

function initialsFromLabel(label: LiveMiniProfileLabel | undefined): string {
  const raw = shortDisplayName(label, "M").trim();
  const parts = raw.split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "M";
  const second = parts.length > 1 ? parts[1]?.[0] : raw.replace(/[^A-Za-z0-9]/g, "")[1];
  return `${first}${second ?? ""}`.toUpperCase();
}

function formatMinutesLabel(minutes: number | null | undefined): string {
  if (typeof minutes !== "number" || !Number.isFinite(minutes)) return "--";
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  return `${minutes}m`;
}

function withImageVersion(url: string, version: string | null | undefined): string {
  if (!version) return url;
  return `${url}${url.includes("?") ? "&" : "?"}v=${encodeURIComponent(version)}`;
}

function formatShortDateTime(iso?: string | null): string {
  if (!iso) return "Not set";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function statusCopy(status: LiveMiniParticipantStatus): string {
  switch (status) {
    case "invited":
      return "Invited";
    case "declined":
      return "Declined";
    case "joined":
      return "Joined";
    case "in_progress":
      return "On mission";
    case "completed":
      return "Done";
    case "missed":
      return "Missed";
    case "cancelled":
      return "Cancelled";
  }
}

function statusTone(status: LiveMiniParticipantStatus, theme: ReturnType<typeof useTheme>["theme"], isDark: boolean) {
  if (status === "completed") {
    return { fg: theme.colors.green[500], bg: isDark ? "rgba(34,197,94,0.14)" : "rgba(22,163,74,0.1)" };
  }
  if (status === "in_progress") {
    return { fg: theme.colors.cyan[400], bg: isDark ? "rgba(34,211,238,0.13)" : "rgba(8,145,178,0.1)" };
  }
  if (status === "missed" || status === "cancelled" || status === "declined") {
    return { fg: theme.colors.red[500], bg: isDark ? "rgba(239,68,68,0.12)" : "rgba(220,38,38,0.08)" };
  }
  return { fg: theme.colors.indigo[400], bg: isDark ? "rgba(129,140,248,0.15)" : "rgba(99,102,241,0.1)" };
}

function isTerminalLiveMiniStatus(status: LiveMiniParticipantStatus): boolean {
  return status === "completed" || status === "missed" || status === "cancelled" || status === "declined";
}

function participantSortValue(row: LiveMiniParticipantRow): number {
  if (row.status === "completed") return 0;
  if (row.status === "in_progress") return 1;
  if (row.status === "joined" || row.status === "invited") return 2;
  return 3;
}

function rankFor(row: LiveMiniParticipantRow, completed: LiveMiniParticipantRow[]): number | null {
  if (row.status !== "completed" || row.final_elapsed_seconds == null) return null;
  const idx = completed.findIndex((p) => p.id === row.id);
  return idx >= 0 ? idx + 1 : null;
}

function ordinalLabel(rank: number): string {
  if (rank === 1) return "1st";
  if (rank === 2) return "2nd";
  if (rank === 3) return "3rd";
  return `${rank}th`;
}

function LiveSquadDetailsSheet({
  visible,
  snapshot,
  onClose,
}: {
  visible: boolean;
  snapshot: LiveMiniSquadSnapshot;
  onClose: () => void;
}) {
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { squad, participants, profiles } = snapshot;
  const objective =
    typeof squad.objective === "string" && squad.objective.trim().length > 0
      ? squad.objective.trim()
      : "No objective added.";
  const creatorName = displayName(profiles[squad.creator_id]);
  const completed = participants.filter((p) => p.status === "completed").length;
  const onMission = participants.filter((p) => p.status === "in_progress").length;
  const waiting = participants.filter((p) => p.status === "invited" || p.status === "joined").length;
  const inactive = participants.filter((p) =>
    p.status === "declined" || p.status === "cancelled" || p.status === "missed",
  ).length;
  const statusLabel =
    squad.status === "active" ? "Active" : squad.status === "ended" ? "Ended" : "Cancelled";

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.detailsRoot}>
        <Pressable
          style={styles.detailsBackdrop}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close Live Squad details"
        />
        <View
          style={[
            styles.detailsSheet,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
              paddingBottom: Math.max(insets.bottom, 16),
            },
          ]}
        >
          <View style={styles.detailsHeader}>
            <Text
              style={[
                styles.detailsHeaderTitle,
                { color: isDark ? theme.colors.indigo[400] : theme.colors.indigo[500] },
              ]}
              numberOfLines={2}
            >
              {squad.title}
            </Text>
            <TouchableOpacity
              onPress={onClose}
              activeOpacity={0.86}
              hitSlop={12}
              style={[styles.detailsClose, { backgroundColor: theme.colors.surfaceElevated, borderColor: theme.colors.border }]}
              accessibilityRole="button"
              accessibilityLabel="Close details"
            >
              <X size={20} color={theme.colors.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.detailsContent}
          >
            <View
              style={[
                styles.detailsModePill,
                {
                  backgroundColor: isDark ? "rgba(34,211,238,0.1)" : "rgba(8,145,178,0.08)",
                  borderColor: isDark ? "rgba(34,211,238,0.3)" : "rgba(8,145,178,0.2)",
                },
              ]}
            >
              <Radio size={14} color={theme.colors.cyan[400]} />
              <Text style={[styles.detailsModeText, { color: theme.colors.cyan[400] }]}>Live Squad</Text>
            </View>

            <Text style={[styles.detailsSectionLabel, { color: theme.colors.textMuted }]}>Objective</Text>
            <Text style={[styles.detailsBody, { color: theme.colors.textSecondary }]}>{objective}</Text>

            <Text style={[styles.detailsSectionLabel, { color: theme.colors.textMuted }]}>Squad</Text>
            <Text style={[styles.detailsLine, { color: theme.colors.textPrimary }]}>Creator: {creatorName}</Text>
            <Text style={[styles.detailsSubLine, { color: theme.colors.textSecondary }]}>Status: {statusLabel}</Text>

            <View style={styles.detailsStatsGrid}>
              <View style={[styles.detailsStat, { backgroundColor: theme.colors.surfaceElevated, borderColor: theme.colors.border }]}>
                <Text style={[styles.detailsStatValue, { color: theme.colors.textPrimary }]}>{participants.length}</Text>
                <Text style={[styles.detailsStatLabel, { color: theme.colors.textMuted }]}>players</Text>
              </View>
              <View style={[styles.detailsStat, { backgroundColor: theme.colors.surfaceElevated, borderColor: theme.colors.border }]}>
                <Text style={[styles.detailsStatValue, { color: theme.colors.green[500] }]}>{completed}</Text>
                <Text style={[styles.detailsStatLabel, { color: theme.colors.textMuted }]}>done</Text>
              </View>
              <View style={[styles.detailsStat, { backgroundColor: theme.colors.surfaceElevated, borderColor: theme.colors.border }]}>
                <Text style={[styles.detailsStatValue, { color: theme.colors.cyan[400] }]}>{onMission}</Text>
                <Text style={[styles.detailsStatLabel, { color: theme.colors.textMuted }]}>on mission</Text>
              </View>
              <View style={[styles.detailsStat, { backgroundColor: theme.colors.surfaceElevated, borderColor: theme.colors.border }]}>
                <Text style={[styles.detailsStatValue, { color: theme.colors.indigo[400] }]}>{waiting}</Text>
                <Text style={[styles.detailsStatLabel, { color: theme.colors.textMuted }]}>waiting</Text>
              </View>
            </View>

            {inactive > 0 ? (
              <>
                <Text style={[styles.detailsSectionLabel, { color: theme.colors.textMuted }]}>Closed slots</Text>
                <Text style={[styles.detailsLine, { color: theme.colors.textPrimary }]}>
                  {inactive} declined, missed, or cancelled
                </Text>
              </>
            ) : null}

            <Text style={[styles.detailsSectionLabel, { color: theme.colors.textMuted }]}>Created</Text>
            <Text style={[styles.detailsLine, { color: theme.colors.textPrimary }]}>{formatShortDateTime(squad.created_at)}</Text>

            <Text style={[styles.detailsSectionLabel, { color: theme.colors.textMuted }]}>Last update</Text>
            <Text style={[styles.detailsLine, { color: theme.colors.textPrimary }]}>{formatShortDateTime(squad.updated_at)}</Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function LiveSquadHero({
  completedRows,
  participants,
  profiles,
  bottomText,
}: {
  completedRows: LiveMiniParticipantRow[];
  participants: LiveMiniParticipantRow[];
  profiles: Record<string, LiveMiniProfileLabel>;
  bottomText: string;
}) {
  const { theme, isDark } = useTheme();
  const leader = completedRows[0] ?? null;
  const runnerUp = completedRows[1] ?? null;
  const topRows = completedRows.slice(0, 3);
  const leaderProfile = leader ? profiles[leader.user_id] : undefined;
  const leaderLevel =
    leaderProfile?.xp != null && Number.isFinite(leaderProfile.xp)
      ? levelFromTotalXp(leaderProfile.xp)
      : null;
  const leaderName = leader ? shortDisplayName(leaderProfile) : "Squad";
  const maxSeconds = Math.max(
    60,
    ...topRows.map((row) =>
      Math.max(
        ((row.planned_minutes ?? 0) + (row.reserve_minutes ?? 0)) * 60,
        row.final_elapsed_seconds ?? 0,
      ),
    ),
  );
  const boardCanStillFlip = participants.some(
    (p) => p.status === "invited" || p.status === "joined" || p.status === "in_progress",
  );
  const squadSettled =
    participants.length > 0 && participants.every((p) => isTerminalLiveMiniStatus(p.status));
  const allCompleted = participants.length > 0 && participants.every((p) => p.status === "completed");
  const paceColors = [theme.colors.indigo[500], theme.colors.cyan[500], theme.colors.amber[500]];
  const activeRows = participants.filter((p) => p.status === "in_progress");
  const waitingCount = participants.filter((p) => p.status === "invited" || p.status === "joined").length;
  const activeCount = activeRows.length;
  const leaderGapSeconds =
    leader && runnerUp && leader.final_elapsed_seconds != null && runnerUp.final_elapsed_seconds != null
      ? Math.max(0, runnerUp.final_elapsed_seconds - leader.final_elapsed_seconds)
      : null;
  const emptyHeroTitle =
    squadSettled
      ? "Squad run ended"
      : activeCount > 1
      ? `${activeCount} are racing the clock`
      : activeCount === 1
        ? `${shortDisplayName(profiles[activeRows[0].user_id])} is racing the clock`
        : "Squad is warming up";
  const emptyHeroSubtitle =
    squadSettled
      ? "No ranked finish this time. Results stay locked."
      : activeCount > 0
      ? waitingCount > 0
        ? `One finish can flip the board. ${waitingCount} still choosing a timer.`
        : "First finisher locks the pace."
      : bottomText;

  return (
    <View
      style={[
        styles.heroCard,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          ...theme.shadow.card,
        },
      ]}
    >
      {leader ? (
        <>
          <View style={styles.heroTopRow}>
            <View
              style={[
                styles.heroAvatar,
                {
                  backgroundColor: isDark ? "rgba(129, 140, 248, 0.22)" : "rgba(99, 102, 241, 0.12)",
                  borderColor: isDark ? "rgba(129, 140, 248, 0.4)" : "rgba(99, 102, 241, 0.25)",
                },
              ]}
            >
              <Text style={[styles.heroAvatarText, { color: theme.colors.indigo[400] }]}>
                {initialsFromLabel(leaderProfile)}
              </Text>
            </View>
            <View style={styles.heroLeaderText}>
              <View style={styles.heroNameRow}>
                <Text style={[styles.heroLeaderName, { color: theme.colors.textPrimary }]} numberOfLines={1}>
                  {leaderName}
                </Text>
                {leaderLevel != null ? (
                  <View
                    style={[
                      styles.levelPill,
                      {
                        backgroundColor: isDark ? "rgba(251, 191, 36, 0.12)" : "rgba(234, 179, 8, 0.12)",
                        borderColor: theme.colors.border,
                      },
                    ]}
                  >
                    <Text style={[styles.levelPillText, { color: theme.colors.yellow[400] }]}>Lv {leaderLevel}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={[styles.heroSubtitle, { color: theme.colors.textMuted }]} numberOfLines={2}>
                {runnerUp
                  ? boardCanStillFlip
                    ? leaderGapSeconds != null && leaderGapSeconds > 0
                      ? `${formatLiveMiniElapsed(leaderGapSeconds)} ahead. One finish can flip it.`
                      : "Tied at the top. One finish can flip it."
                    : "Fastest finish is locked."
                  : activeCount > 0 && boardCanStillFlip
                    ? "First finish is on the board. Chasers still running."
                    : boardCanStillFlip
                      ? "Fastest finisher on the board."
                    : "Final fastest finish."}
              </Text>
            </View>
            <View
              style={[
                styles.fastestPill,
                {
                  backgroundColor: isDark ? "rgba(34, 211, 238, 0.12)" : "rgba(8, 145, 178, 0.1)",
                  borderColor: isDark ? "rgba(34, 211, 238, 0.32)" : "rgba(8, 145, 178, 0.2)",
                },
              ]}
            >
              <Text style={[styles.fastestPillText, { color: theme.colors.cyan[400] }]}>
                {formatLiveMiniElapsed(leader.final_elapsed_seconds)}
              </Text>
            </View>
          </View>

          <View style={styles.paceRows}>
            {topRows.map((row, index) => {
              const elapsed = row.final_elapsed_seconds ?? 0;
              const progress = Math.max(0.04, Math.min(1, elapsed / maxSeconds));
              return (
                <View key={row.id} style={styles.paceRow}>
                  <Text style={[styles.paceLabel, { color: theme.colors.textMuted }]} numberOfLines={1}>
                    {ordinalLabel(index + 1)} - {shortDisplayName(profiles[row.user_id])}
                  </Text>
                  <View style={[styles.paceTrack, { backgroundColor: isDark ? "rgba(255,255,255,0.09)" : "rgba(15,23,42,0.06)" }]}>
                    <View style={[styles.paceFill, { width: `${progress * 100}%`, backgroundColor: paceColors[index] }]} />
                  </View>
                  <Text style={[styles.paceValue, { color: theme.colors.textSecondary }]}>
                    {formatLiveMiniElapsed(row.final_elapsed_seconds)}
                  </Text>
                </View>
              );
            })}
          </View>

          <View style={[styles.heroNarrative, { borderTopColor: theme.colors.border }]}>
            <Trophy size={28} color={theme.colors.amber[500]} />
            <Text style={[styles.heroNarrativeText, { color: theme.colors.textSecondary }]}>
              <Text style={{ color: theme.colors.textPrimary, fontWeight: "900" }}>{leaderName}</Text>
              {boardCanStillFlip ? " leads with " : allCompleted ? " wins with " : " leads the final board with "}
              <Text style={{ color: theme.colors.indigo[400], fontWeight: "900" }}>
                {formatLiveMiniElapsed(leader.final_elapsed_seconds)}
              </Text>
              {boardCanStillFlip
                ? runnerUp
                  ? ", but the board can still flip."
                  : ". Waiting for the next finisher."
                : allCompleted
                  ? ". Squad board is final."
                  : "."}
            </Text>
          </View>
        </>
      ) : (
        <View style={styles.emptyHeroRow}>
          <View
            style={[
              styles.emptyHeroIcon,
              {
                backgroundColor: isDark ? "rgba(34, 211, 238, 0.13)" : "rgba(8,145,178,0.1)",
                borderColor: theme.colors.border,
              },
            ]}
          >
            <Flame size={28} color={theme.colors.cyan[400]} />
          </View>
          <View style={styles.emptyHeroCopy}>
            <Text style={[styles.heroLeaderName, { color: theme.colors.textPrimary }]}>{emptyHeroTitle}</Text>
            <Text style={[styles.heroSubtitle, { color: theme.colors.textMuted }]}>
              {emptyHeroSubtitle}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

function StatusLegend() {
  const { theme, isDark } = useTheme();
  const items = [
    { label: "Done", color: theme.colors.green[500] },
    { label: "On", color: theme.colors.cyan[400] },
    { label: "Waiting", color: theme.colors.indigo[400] },
  ];
  return (
    <View style={styles.legendRow}>
      {items.map((item) => (
        <View key={item.label} style={styles.legendItem}>
          <View
            style={[
              styles.legendDot,
              {
                borderColor: item.color,
                backgroundColor: isDark ? `${item.color}33` : `${item.color}22`,
              },
            ]}
          />
          <Text style={[styles.legendText, { color: theme.colors.textMuted }]}>{item.label}</Text>
        </View>
      ))}
    </View>
  );
}

function PulsingOnMissionDot({ color }: { color: string }) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 920,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 260,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.72, 1.85] });
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] });

  return (
    <View style={styles.statusPulseWrap} pointerEvents="none">
      <Animated.View
        style={[
          styles.statusPulseHalo,
          {
            backgroundColor: color,
            opacity,
            transform: [{ scale }],
          },
        ]}
      />
      <View style={[styles.statusPulseCore, { backgroundColor: color }]} />
    </View>
  );
}

function ParticipantCard({
  row,
  rank,
  profile,
  isMe,
  localMission,
  highlightFinish,
  onOpenMine,
  onOpenImage,
}: {
  row: LiveMiniParticipantRow;
  rank: number | null;
  profile: LiveMiniProfileLabel | undefined;
  isMe: boolean;
  localMission?: MiniMission;
  highlightFinish: boolean;
  onOpenMine: () => void;
  onOpenImage: (uri: string) => void;
}) {
  const { theme, isDark } = useTheme();
  const finishGlow = useRef(new Animated.Value(0)).current;
  const tone = statusTone(row.status, theme, isDark);
  const planned = row.planned_minutes ?? localMission?.estimatedMinutes ?? null;
  const reserve = row.reserve_minutes ?? 0;
  const totalMinutes = planned != null ? planned + reserve : null;
  const level =
    profile?.xp != null && Number.isFinite(profile.xp)
      ? levelFromTotalXp(profile.xp)
      : null;
  const elapsedSeconds =
    row.status === "completed"
      ? row.final_elapsed_seconds ?? null
      : row.status === "in_progress" && row.started_at
        ? Math.max(0, Math.floor((Date.now() - new Date(row.started_at).getTime()) / 1000))
        : null;
  const totalSeconds = Math.max(60, (totalMinutes ?? 1) * 60);
  const progress = elapsedSeconds == null ? 0 : Math.min(1, elapsedSeconds / totalSeconds);
  const showProgress = row.status === "completed" || row.status === "in_progress";
  const memoryImage = row.memory_image_url ? withImageVersion(row.memory_image_url, row.updated_at) : null;

  useEffect(() => {
    if (!highlightFinish) return;
    finishGlow.setValue(0.18);
    Animated.timing(finishGlow, {
      toValue: 0,
      duration: 2200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [finishGlow, highlightFinish]);

  return (
    <View
      style={[
        styles.participantCard,
        {
          backgroundColor: theme.colors.surface,
          borderColor: highlightFinish ? theme.colors.green[500] : theme.colors.border,
          ...theme.shadow.card,
        },
      ]}
    >
      <Animated.View
        pointerEvents="none"
        style={[styles.finishGlow, { backgroundColor: theme.colors.green[500], opacity: finishGlow }]}
      />
      <View style={styles.participantTop}>
        <View style={styles.nameBlock}>
          <View style={styles.participantNameRow}>
            <Text style={[styles.participantName, { color: theme.colors.textPrimary }]} numberOfLines={1}>
              {displayName(profile)}
            </Text>
            {isMe ? (
              <View
                style={[
                  styles.youBadge,
                  {
                    backgroundColor: isDark ? "rgba(99, 102, 241, 0.18)" : "rgba(79, 70, 229, 0.1)",
                    borderColor: isDark ? "rgba(129, 140, 248, 0.36)" : "rgba(79, 70, 229, 0.22)",
                  },
                ]}
              >
                <Text style={[styles.youBadgeText, { color: theme.colors.indigo[400] }]}>You</Text>
              </View>
            ) : null}
            {level != null ? (
              <View
                style={[
                  styles.levelPill,
                  {
                    backgroundColor: isDark ? "rgba(251, 191, 36, 0.12)" : "rgba(234, 179, 8, 0.12)",
                    borderColor: theme.colors.border,
                  },
                ]}
              >
                <Text style={[styles.levelPillText, { color: theme.colors.yellow[400] }]}>Lv {level}</Text>
              </View>
            ) : null}
          </View>
          <View style={styles.metaLineWrap}>
            {totalMinutes ? (
              <Text style={[styles.metaLine, { color: theme.colors.textMuted }]}>
                {formatMinutesLabel(totalMinutes)} total{reserve > 0 ? ` (${reserve} reserve)` : ""}
              </Text>
            ) : (
              <Text style={[styles.metaLine, { color: theme.colors.textMuted }]}>Waiting for timer</Text>
            )}
          </View>
        </View>

        <View style={[styles.statusPill, { backgroundColor: tone.bg }]}>
          {row.status === "in_progress" ? <PulsingOnMissionDot color={theme.colors.green[500]} /> : null}
          <Text style={[styles.statusPillText, { color: tone.fg }]}>{statusCopy(row.status)}</Text>
        </View>
      </View>

      {row.status === "completed" ? (
        <View style={styles.resultRow}>
          <View style={[styles.rankBadge, { borderColor: rank === 1 ? theme.colors.amber[500] : theme.colors.border }]}>
            <Trophy size={14} color={rank === 1 ? theme.colors.amber[500] : theme.colors.textMuted} />
            <Text style={[styles.rankText, { color: rank === 1 ? theme.colors.amber[500] : theme.colors.textSecondary }]}>
              #{rank ?? "-"}
            </Text>
          </View>
          <Text style={[styles.elapsedText, { color: theme.colors.textPrimary }]}>
            {formatLiveMiniElapsed(row.final_elapsed_seconds)}
          </Text>
          <View
            style={[
              styles.lockedPill,
              {
                backgroundColor: isDark ? "rgba(34,197,94,0.12)" : "rgba(22,163,74,0.08)",
                borderColor: isDark ? "rgba(34,197,94,0.34)" : "rgba(22,163,74,0.22)",
              },
            ]}
          >
            <Check size={12} color={theme.colors.green[500]} />
            <Text style={[styles.lockedPillText, { color: theme.colors.green[500] }]}>Locked</Text>
          </View>
        </View>
      ) : null}

      {showProgress ? (
        <View style={styles.progressBlock}>
          <View style={[styles.resultTrack, { backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(15,23,42,0.06)" }]}>
            <View
              style={[
                styles.resultFill,
                {
                  width: `${Math.max(0.04, progress) * 100}%`,
                  backgroundColor: row.status === "completed" ? theme.colors.indigo[500] : theme.colors.cyan[500],
                },
              ]}
            />
          </View>
          <View style={styles.progressMetaRow}>
            <Text style={[styles.progressMetaText, { color: theme.colors.textMuted }]}>
              {elapsedSeconds == null ? "--" : formatLiveMiniElapsed(elapsedSeconds)}
            </Text>
            <Text style={[styles.progressMetaText, { color: theme.colors.textMuted }]}>
              of {formatMinutesLabel(totalMinutes)}
            </Text>
          </View>
        </View>
      ) : null}

      {row.status === "in_progress" && row.deadline_at ? (
        <Text style={[styles.deadlineText, { color: theme.colors.textSecondary }]}>
          Deadline: {new Date(row.deadline_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </Text>
      ) : null}

      {memoryImage ? (
        <Pressable
          onPress={() => onOpenImage(memoryImage)}
          accessibilityRole="button"
          accessibilityLabel="View squad memory photo"
          style={({ pressed }) => ({ opacity: pressed ? 0.92 : 1 })}
        >
          <Image source={{ uri: memoryImage }} style={styles.memoryImage} resizeMode="cover" />
        </Pressable>
      ) : null}
      {row.memory_note ? (
        <Text style={[styles.memoryNote, { color: theme.colors.textSecondary }]} numberOfLines={4}>
          {row.memory_note}
        </Text>
      ) : null}

      {isMe && localMission ? (
        <Button
          title="Open my timer"
          variant="subtle"
          icon={<Timer size={16} color={theme.colors.cyan[400]} />}
          onPress={onOpenMine}
          style={styles.openMineButton}
          textStyle={styles.openMineText}
        />
      ) : null}
    </View>
  );
}

export default function LiveMiniSquadScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const squadId = Array.isArray(params.id) ? params.id[0] : params.id;
  const { theme, isDark } = useTheme();
  const { showToast } = useToast();
  const { session } = useAuth();
  const { suggestNotifications } = useNotificationGate();
  const userId = session?.user?.id ?? null;
  const addMiniMission = useHabitStore((s) => s.addMiniMission);
  const miniMissions = useHabitStore((s) => s.miniMissions);

  const [snapshot, setSnapshot] = useState<LiveMiniSquadSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);
  const [selectedMinutes, setSelectedMinutes] = useState(15);
  const [manualMinutes, setManualMinutes] = useState("15");
  const [openImageUri, setOpenImageUri] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [finishHighlightIds, setFinishHighlightIds] = useState<Set<string>>(() => new Set());
  const userIdRef = useRef(userId);
  const liveSyncKeyRef = useRef<string | null>(null);
  const previousParticipantStatusRef = useRef<Record<string, LiveMiniParticipantStatus>>({});
  const finishHighlightTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const snapshotRef = useRef<LiveMiniSquadSnapshot | null>(null);
  const loadInFlightRef = useRef(false);
  const pendingSilentLoadRef = useRef(false);
  const lastBoardLoadAtRef = useRef(0);
  const realtimeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    userIdRef.current = userId;
    snapshotRef.current = null;
    setSnapshot(null);
    setLoading(Boolean(userId));
    setFinishHighlightIds(new Set());
    previousParticipantStatusRef.current = {};
    pendingSilentLoadRef.current = false;
    lastBoardLoadAtRef.current = 0;
    if (realtimeDebounceRef.current) {
      clearTimeout(realtimeDebounceRef.current);
      realtimeDebounceRef.current = null;
    }
    Object.values(finishHighlightTimersRef.current).forEach(clearTimeout);
    finishHighlightTimersRef.current = {};
  }, [squadId, userId]);

  const localLiveMission = useMemo(
    () => miniMissions.find((m) => m.liveSquadId === squadId),
    [miniMissions, squadId],
  );

  const load = useCallback(
    async (silent = false, options?: { force?: boolean }) => {
      if (!squadId || !userId) {
        snapshotRef.current = null;
        setSnapshot(null);
        setLoading(false);
        return;
      }
      if (loadInFlightRef.current) {
        if (silent || options?.force) pendingSilentLoadRef.current = true;
        return;
      }
      const now = Date.now();
      if (
        !options?.force &&
        snapshotRef.current &&
        now - lastBoardLoadAtRef.current < LIVE_MINI_BOARD_RELOAD_TTL_MS
      ) {
        return;
      }
      loadInFlightRef.current = true;
      if (!silent && !snapshotRef.current) setLoading(true);
      try {
        const next = await traceAsync("liveMini.board.load", () => fetchLiveMiniSquad(squadId), {
          slowMs: silent ? 1_200 : 800,
          meta: { silent },
        });
        if (userIdRef.current !== userId) return;
        snapshotRef.current = next;
        setSnapshot(next);
        lastBoardLoadAtRef.current = Date.now();
        const mine = next?.participants.find((p) => p.user_id === userId);
        if (mine?.planned_minutes) {
          setSelectedMinutes(mine.planned_minutes);
          setManualMinutes(String(mine.planned_minutes));
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        showToast(msg, "error");
      } finally {
        loadInFlightRef.current = false;
        if (!silent) setLoading(false);
        if (pendingSilentLoadRef.current) {
          pendingSilentLoadRef.current = false;
          setTimeout(() => {
            void load(true, { force: true });
          }, 0);
        }
      }
    },
    [showToast, squadId, userId],
  );

  const scheduleRealtimeLoad = useCallback(() => {
    if (realtimeDebounceRef.current) {
      clearTimeout(realtimeDebounceRef.current);
    }
    realtimeDebounceRef.current = setTimeout(() => {
      realtimeDebounceRef.current = null;
      void load(true, { force: true });
    }, LIVE_MINI_REALTIME_DEBOUNCE_MS);
  }, [load]);

  useEffect(() => {
    if (!localLiveMission?.liveSquadId || localLiveMission.liveSquadId !== squadId) return;
    const key = [
      localLiveMission.id,
      localLiveMission.status,
      localLiveMission.startedAt ?? "",
      localLiveMission.completedAt ?? "",
      localLiveMission.extendedMinutes ?? 0,
    ].join(":");
    if (liveSyncKeyRef.current === key) return;
    liveSyncKeyRef.current = key;
    void traceAsync("liveMini.progress.syncLocal", () => syncLiveMiniFromLocalMission(localLiveMission), {
      slowMs: 900,
      meta: { status: localLiveMission.status },
    })
      .then(() => load(true, { force: true }))
      .catch(() => {});
  }, [load, localLiveMission, squadId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  useEffect(() => {
    if (!squadId) return undefined;
    const unsub = subscribeLiveMiniSquad(squadId, scheduleRealtimeLoad);
    return () => {
      unsub?.();
      if (realtimeDebounceRef.current) {
        clearTimeout(realtimeDebounceRef.current);
        realtimeDebounceRef.current = null;
      }
    };
  }, [scheduleRealtimeLoad, squadId]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load(true, { force: true });
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const squad = snapshot?.squad ?? null;
  const participants = snapshot?.participants ?? [];
  const myParticipant = participants.find((p) => p.user_id === userId);
  const squadSettled = useMemo(
    () => participants.length > 0 && participants.every((p) => isTerminalLiveMiniStatus(p.status)),
    [participants],
  );
  const creatorInviteMission = useMemo<MiniMission | null>(() => {
    if (!localLiveMission || !squad || squad.status !== "active" || squadSettled) return null;
    if (localLiveMission.liveSquadRole === "creator" || myParticipant?.role === "creator") {
      return { ...localLiveMission, liveSquadRole: "creator" };
    }
    return null;
  }, [localLiveMission, myParticipant?.role, squad, squadSettled]);
  const completedRows = useMemo(
    () =>
      participants
        .filter((p) => p.status === "completed" && p.final_elapsed_seconds != null)
        .sort((a, b) => (a.final_elapsed_seconds ?? 0) - (b.final_elapsed_seconds ?? 0)),
    [participants],
  );
  const sortedParticipants = useMemo(
    () =>
      [...participants].sort((a, b) => {
        const av = participantSortValue(a);
        const bv = participantSortValue(b);
        if (av !== bv) return av - bv;
        if (a.status === "completed" && b.status === "completed") {
          return (a.final_elapsed_seconds ?? 0) - (b.final_elapsed_seconds ?? 0);
        }
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      }),
    [participants],
  );

  useEffect(() => {
    const previous = previousParticipantStatusRef.current;
    const next: Record<string, LiveMiniParticipantStatus> = {};
    const previousWasLoaded = Object.keys(previous).length > 0;

    for (const row of participants) {
      next[row.id] = row.status;
      if (!previousWasLoaded) continue;
      if (row.status === "completed" && previous[row.id] && previous[row.id] !== "completed") {
        if (finishHighlightTimersRef.current[row.id]) {
          clearTimeout(finishHighlightTimersRef.current[row.id]);
        }
        setFinishHighlightIds((prev) => {
          const copy = new Set(prev);
          copy.add(row.id);
          return copy;
        });
        finishHighlightTimersRef.current[row.id] = setTimeout(() => {
          setFinishHighlightIds((prev) => {
            const copy = new Set(prev);
            copy.delete(row.id);
            return copy;
          });
          delete finishHighlightTimersRef.current[row.id];
        }, 2400);
      }
    }

    previousParticipantStatusRef.current = next;
  }, [participants]);

  useEffect(() => {
    return () => {
      Object.values(finishHighlightTimersRef.current).forEach(clearTimeout);
      finishHighlightTimersRef.current = {};
    };
  }, []);

  const acceptDisabled = busy !== null || !myParticipant || myParticipant.status !== "invited";

  const handleAccept = async () => {
    if (!squad || !myParticipant || !squadId || acceptDisabled) return;
    const minutes = clampMinutes(selectedMinutes);
    const localId = createMiniMissionId();
    const startedAt = new Date().toISOString();
    setBusy("accept");
    try {
      const res = await traceAsync(
        "liveMini.acceptStart",
        () =>
          acceptLiveMiniInvite({
            squadId,
            localMiniMissionId: localId,
            plannedMinutes: minutes,
            startedAt,
          }),
        { slowMs: 900, meta: { minutes } },
      );
      if (res.ok === false) {
        showToast(res.error, "error");
        return;
      }
      addMiniMission({
        id: localId,
        title: squad.title,
        objective: squad.objective ?? undefined,
        estimatedMinutes: minutes,
        startMode: "now",
        createdAt: startedAt,
        startedAt,
        liveSquadId: squadId,
        liveSquadRole: "member",
      });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast("Joined Live Squad. Timer started.", "success");
      setTimeout(() => {
        void suggestNotifications("invite_accept");
      }, 350);
      void load(true, { force: true });
      router.push(`/mini/${localId}`);
    } finally {
      setBusy(null);
    }
  };

  const handleDecline = async () => {
    if (!squadId || !myParticipant || myParticipant.status !== "invited" || busy) return;
    setBusy("decline");
    try {
      const res = await traceAsync("liveMini.decline", () => declineLiveMiniInvite(squadId), {
        slowMs: 900,
      });
      if (res.ok === false) {
        showToast(res.error, "error");
        return;
      }
      showToast("Invite declined.", "success");
      await load(true, { force: true });
    } finally {
      setBusy(null);
    }
  };

  const setMinutes = (minutes: number) => {
    const next = clampMinutes(minutes);
    setSelectedMinutes(next);
    setManualMinutes(String(next));
  };

  const bottomText =
    myParticipant?.status === "invited"
      ? "Choose your timer. Accept starts it immediately."
      : myParticipant?.status === "completed"
        ? "Your result is locked on the squad board."
        : myParticipant?.status === "in_progress"
          ? "Finish before your timer runs out to rank."
          : "Squad results update as people finish.";

  return (
    <Screen>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={theme.colors.background} />
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => backOrReplace(router, "/mini")}
          activeOpacity={0.86}
          style={[styles.iconButton, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
        >
          <ArrowLeft size={20} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerActions}>
          {snapshot?.squad ? (
            <TouchableOpacity
              onPress={() => setDetailsOpen(true)}
              activeOpacity={0.86}
              style={[styles.iconButton, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
              accessibilityRole="button"
              accessibilityLabel="Open Live Squad details"
            >
              <Info size={18} color={theme.colors.indigo[400]} />
            </TouchableOpacity>
          ) : null}
          <View
            style={[
              styles.livePill,
              {
                backgroundColor: isDark ? "rgba(34,211,238,0.12)" : "rgba(8,145,178,0.1)",
                borderColor: isDark ? "rgba(34,211,238,0.24)" : "rgba(8,145,178,0.16)",
              },
            ]}
          >
            <Radio size={14} color={theme.colors.cyan[400]} />
            <Text style={[styles.livePillText, { color: theme.colors.cyan[400] }]}>Live Squad</Text>
          </View>
        </View>
      </View>

      {loading ? (
        <View style={styles.centerState}>
          <ActivityIndicator color={theme.colors.indigo[400]} />
          <Text style={[styles.centerText, { color: theme.colors.textSecondary }]}>Loading Live Squad...</Text>
        </View>
      ) : !snapshot || !squad ? (
        <View style={styles.centerState}>
          <Users size={36} color={theme.colors.textMuted} />
          <Text style={[styles.centerTitle, { color: theme.colors.textPrimary }]}>Live Squad not found</Text>
          <Text style={[styles.centerText, { color: theme.colors.textSecondary }]}>
            This invite may have expired or your account cannot view it.
          </Text>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.colors.indigo[400]}
              colors={[theme.colors.indigo[400]]}
            />
          }
          contentContainerStyle={styles.scrollContent}
        >
          <Text style={[styles.title, { color: theme.colors.textPrimary }]} numberOfLines={3}>
            {squad.title}
          </Text>
          {squad.objective ? (
            <Text style={[styles.objective, { color: theme.colors.textSecondary }]} numberOfLines={2}>
              {squad.objective}
            </Text>
          ) : null}

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.metaPillsRow}
            style={styles.metaPillsScroll}
          >
            <View
              style={[
                styles.metaChip,
                {
                  borderColor: theme.colors.border,
                  backgroundColor: isDark ? "rgba(255,255,255,0.06)" : theme.colors.surfaceElevated,
                },
              ]}
            >
              <Users size={18} color={theme.colors.indigo[400]} />
              <Text style={[styles.metaChipText, { color: theme.colors.textSecondary }]}>
                {participants.length} player{participants.length === 1 ? "" : "s"}
              </Text>
            </View>

            <View
              style={[
                styles.metaChip,
                {
                  borderColor: theme.colors.border,
                  backgroundColor: isDark ? "rgba(255,255,255,0.06)" : theme.colors.surfaceElevated,
                },
              ]}
            >
              <Check size={18} color={theme.colors.green[500]} />
              <Text style={[styles.metaChipText, { color: theme.colors.textSecondary }]}>
                {completedRows.length} done
              </Text>
            </View>

          </ScrollView>

          <LiveSquadHero
            completedRows={completedRows}
            participants={participants}
            profiles={snapshot.profiles}
            bottomText={bottomText}
          />

          {creatorInviteMission ? (
            <TouchableOpacity
              onPress={() => setInviteOpen(true)}
              activeOpacity={0.88}
              style={[
                styles.inviteMoreCard,
                {
                  backgroundColor: isDark ? "rgba(34,211,238,0.08)" : "rgba(8,145,178,0.06)",
                  borderColor: isDark ? "rgba(34,211,238,0.24)" : "rgba(8,145,178,0.16)",
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Invite more people to Live Squad"
            >
              <View
                style={[
                  styles.inviteMoreIcon,
                  { backgroundColor: isDark ? "rgba(34,211,238,0.14)" : "rgba(8,145,178,0.1)" },
                ]}
              >
                <UserPlus size={18} color={theme.colors.cyan[400]} />
              </View>
              <View style={styles.inviteMoreTextCol}>
                <Text style={[styles.inviteMoreTitle, { color: theme.colors.textPrimary }]}>Invite more</Text>
                <Text style={[styles.inviteMoreBody, { color: theme.colors.textSecondary }]} numberOfLines={2}>
                  Add people while the squad is active. They pick their own timer.
                </Text>
              </View>
              <Text style={[styles.inviteMoreCta, { color: theme.colors.cyan[400] }]}>Open</Text>
            </TouchableOpacity>
          ) : null}

          {myParticipant?.status === "invited" ? (
            <View style={[styles.acceptCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, ...theme.shadow.card }]}>
              <Text style={[styles.acceptTitle, { color: theme.colors.textPrimary }]}>Pick your timer</Text>
              <Text style={[styles.acceptBody, { color: theme.colors.textSecondary }]}>
                Your timer starts as soon as you accept. Max duration is 8 hours.
              </Text>
              <FuelQuickMinutesStrip
                presets={QUICK_MINUTES}
                selectedMinutes={selectedMinutes}
                onSelect={setMinutes}
                isDark={isDark}
              />
              <View style={styles.longPresetWrap}>
                {LONG_PRESETS.map((p) => (
                  <FuelTimePresetButton
                    key={p.minutes}
                    label={p.label}
                    minutes={p.minutes}
                    active={selectedMinutes === p.minutes}
                    onPress={() => setMinutes(p.minutes)}
                    isDark={isDark}
                  />
                ))}
              </View>
              <TextInput
                value={manualMinutes}
                onChangeText={(t) => {
                  const cleaned = t.replace(/[^0-9]/g, "");
                  setManualMinutes(cleaned);
                  if (cleaned.length > 0) setSelectedMinutes(clampMinutes(Number(cleaned)));
                }}
                onBlur={() => setManualMinutes(String(clampMinutes(selectedMinutes)))}
                keyboardType="number-pad"
                maxLength={3}
                selectTextOnFocus
                style={[
                  styles.minutesInput,
                  {
                    color: theme.colors.textPrimary,
                    backgroundColor: theme.colors.background,
                    borderColor: theme.colors.border,
                  },
                ]}
              />
              <View style={styles.acceptActions}>
                <Button
                  title="Decline"
                  variant="subtle"
                  icon={<X size={16} color={theme.colors.textMuted} />}
                  loading={busy === "decline"}
                  onPress={() => void handleDecline()}
                  disabled={busy !== null}
                  style={styles.declineButton}
                  textStyle={[styles.declineText, { color: theme.colors.textMuted }]}
                />
                <Button
                  title="Accept & Start"
                  variant="primary"
                  loading={busy === "accept"}
                  onPress={() => void handleAccept()}
                  disabled={acceptDisabled}
                  style={styles.acceptButton}
                  textStyle={styles.acceptButtonText}
                />
              </View>
            </View>
          ) : null}

          <View style={styles.participantsSectionHeader}>
            <Text style={[styles.sectionLabel, styles.participantsSectionTitle, { color: theme.colors.textMuted }]}>
              PARTICIPANTS
            </Text>
            <StatusLegend />
          </View>
          {sortedParticipants.map((row) => (
            <ParticipantCard
              key={row.id}
              row={row}
              rank={rankFor(row, completedRows)}
              profile={snapshot.profiles[row.user_id]}
              isMe={row.user_id === userId}
              localMission={row.user_id === userId ? localLiveMission : undefined}
              highlightFinish={finishHighlightIds.has(row.id)}
              onOpenMine={() => {
                const mid = row.local_mini_mission_id ?? localLiveMission?.id;
                if (mid) router.push(`/mini/${mid}`);
              }}
              onOpenImage={setOpenImageUri}
            />
          ))}
        </ScrollView>
      )}

      {snapshot ? (
        <LiveSquadDetailsSheet
          visible={detailsOpen}
          snapshot={snapshot}
          onClose={() => setDetailsOpen(false)}
        />
      ) : null}

      {creatorInviteMission ? (
        <LiveMiniInviteSheet
          visible={inviteOpen}
          mission={creatorInviteMission}
          onClose={() => {
            setInviteOpen(false);
            void load(true);
          }}
        />
      ) : null}

      <Modal
        visible={openImageUri !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setOpenImageUri(null)}
      >
        <Pressable
          style={styles.imageViewerBackdrop}
          onPress={() => setOpenImageUri(null)}
          accessibilityRole="button"
          accessibilityLabel="Close photo viewer"
        >
          <Pressable style={styles.imageViewerInner} onPress={(e) => e.stopPropagation()}>
            {openImageUri ? (
              <Image source={{ uri: openImageUri }} style={styles.imageViewerPhoto} resizeMode="contain" />
            ) : null}
            <TouchableOpacity
              onPress={() => setOpenImageUri(null)}
              activeOpacity={0.86}
              style={[styles.imageViewerClose, { backgroundColor: theme.colors.surface }]}
              accessibilityRole="button"
              accessibilityLabel="Close photo"
            >
              <X size={22} color={theme.colors.textPrimary} />
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  iconButton: { width: 40, height: 40, borderRadius: 999, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  livePill: { minHeight: 36, borderRadius: 999, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1 },
  livePillText: { fontSize: 12, fontWeight: "900" },
  centerState: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },
  centerTitle: { fontSize: 18, fontWeight: "900", marginTop: 12, textAlign: "center" },
  centerText: { fontSize: 13, lineHeight: 19, textAlign: "center", marginTop: 8, fontWeight: "600" },
  scrollContent: { paddingBottom: 32 },
  title: { fontSize: 30, lineHeight: 36, fontWeight: "900", marginBottom: 8 },
  objective: { fontSize: 14, lineHeight: 20, fontWeight: "700", marginBottom: 14 },
  metaPillsScroll: { marginBottom: 14 },
  metaPillsRow: { flexDirection: "row", gap: 8, paddingRight: 16 },
  metaChip: {
    minHeight: 38,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  metaChipText: { fontSize: 12, lineHeight: 16, fontWeight: "800" },
  heroCard: { borderWidth: 1, borderRadius: 20, padding: 16, marginBottom: 18 },
  heroTopRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  heroAvatar: {
    width: 62,
    height: 62,
    borderRadius: 999,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  heroAvatarText: { fontSize: 21, fontWeight: "900", letterSpacing: 0.2 },
  heroLeaderText: { flex: 1, minWidth: 0 },
  heroNameRow: { flexDirection: "row", alignItems: "center", gap: 8, minWidth: 0 },
  heroLeaderName: { fontSize: 18, lineHeight: 23, fontWeight: "900", flexShrink: 1 },
  levelPill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 },
  levelPillText: { fontSize: 11, lineHeight: 14, fontWeight: "900", letterSpacing: 0.2 },
  heroSubtitle: { fontSize: 13, lineHeight: 18, fontWeight: "800", marginTop: 4 },
  fastestPill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  fastestPillText: { fontSize: 12, lineHeight: 15, fontWeight: "900", fontVariant: ["tabular-nums"] },
  paceRows: { gap: 10, marginTop: 18 },
  paceRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  paceLabel: { width: 92, fontSize: 11, lineHeight: 15, fontWeight: "900" },
  paceTrack: { flex: 1, minWidth: 56, height: 10, borderRadius: 999, overflow: "hidden" },
  paceFill: { height: "100%", borderRadius: 999 },
  paceValue: { width: 50, textAlign: "right", fontSize: 12, fontWeight: "900", fontVariant: ["tabular-nums"] },
  heroNarrative: { borderTopWidth: 1, marginTop: 18, paddingTop: 16, flexDirection: "row", alignItems: "center", gap: 14 },
  heroNarrativeText: { flex: 1, minWidth: 0, fontSize: 14, lineHeight: 21, fontWeight: "700" },
  emptyHeroRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  emptyHeroIcon: {
    width: 58,
    height: 58,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyHeroCopy: { flex: 1, minWidth: 0 },
  acceptCard: { borderWidth: 1, borderRadius: 18, padding: 14, gap: 12, marginBottom: 18 },
  acceptTitle: { fontSize: 18, fontWeight: "900" },
  acceptBody: { fontSize: 13, lineHeight: 18, fontWeight: "600" },
  longPresetWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "space-between" },
  minutesInput: { borderWidth: 1, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14, fontSize: 20, fontWeight: "900", textAlign: "center" },
  acceptActions: { flexDirection: "row", gap: 10 },
  declineButton: { flex: 1, minHeight: 50, borderWidth: 1, borderRadius: 16, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6 },
  declineText: { fontSize: 14, fontWeight: "900" },
  acceptButton: { flex: 1.2, minHeight: 50, borderRadius: 16, alignItems: "center", justifyContent: "center", paddingHorizontal: 12 },
  acceptButtonText: { color: "#fff", fontSize: 14, fontWeight: "900", textAlign: "center" },
  inviteMoreCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 13,
    marginBottom: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  inviteMoreIcon: {
    width: 42,
    height: 42,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  inviteMoreTextCol: { flex: 1, minWidth: 0 },
  inviteMoreTitle: { fontSize: 15, lineHeight: 19, fontWeight: "900" },
  inviteMoreBody: { fontSize: 12, lineHeight: 17, fontWeight: "600", marginTop: 2 },
  inviteMoreCta: { fontSize: 12, lineHeight: 16, fontWeight: "900" },
  participantsSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    flexWrap: "wrap",
    marginBottom: 12,
  },
  participantsSectionTitle: { marginBottom: 0 },
  sectionLabel: { fontSize: 11, fontWeight: "900", letterSpacing: 1.2, marginBottom: 10 },
  legendRow: { flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 0 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4, flexShrink: 0 },
  legendDot: { width: 9, height: 9, borderRadius: 999, borderWidth: 2 },
  legendText: { fontSize: 9, lineHeight: 12, fontWeight: "900" },
  participantCard: { borderWidth: 1, borderRadius: 20, padding: 16, marginBottom: 14, overflow: "hidden", position: "relative" },
  finishGlow: { ...StyleSheet.absoluteFillObject },
  participantTop: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  nameBlock: { flex: 1, minWidth: 0 },
  participantNameRow: { flexDirection: "row", alignItems: "center", gap: 7, minWidth: 0 },
  participantName: { fontSize: 19, lineHeight: 24, fontWeight: "900", flexShrink: 1 },
  youBadge: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 3, flexShrink: 0 },
  youBadgeText: { fontSize: 10, lineHeight: 12, fontWeight: "900" },
  metaLineWrap: { marginTop: 4 },
  metaLine: { fontSize: 12, lineHeight: 16, fontWeight: "700" },
  statusPill: {
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  statusPillText: { fontSize: 11, fontWeight: "900" },
  statusPulseWrap: {
    width: 10,
    height: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  statusPulseHalo: {
    position: "absolute",
    width: 10,
    height: 10,
    borderRadius: 999,
  },
  statusPulseCore: {
    width: 6,
    height: 6,
    borderRadius: 999,
  },
  resultRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 12, flexWrap: "wrap" },
  rankBadge: { borderWidth: 1, borderRadius: 999, paddingVertical: 5, paddingHorizontal: 9, flexDirection: "row", alignItems: "center", gap: 5 },
  rankText: { fontSize: 12, fontWeight: "900" },
  elapsedText: { fontSize: 16, fontWeight: "900", fontVariant: ["tabular-nums"] },
  lockedPill: { borderWidth: 1, borderRadius: 999, paddingVertical: 4, paddingHorizontal: 8, flexDirection: "row", alignItems: "center", gap: 4 },
  lockedPillText: { fontSize: 11, lineHeight: 14, fontWeight: "900" },
  progressBlock: { marginTop: 12, gap: 7 },
  resultTrack: { height: 10, borderRadius: 999, overflow: "hidden" },
  resultFill: { height: "100%", borderRadius: 999 },
  progressMetaRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  progressMetaText: { fontSize: 11, lineHeight: 15, fontWeight: "800", fontVariant: ["tabular-nums"] },
  deadlineText: { fontSize: 12, lineHeight: 17, fontWeight: "700", marginTop: 10 },
  memoryImage: { width: "100%", aspectRatio: 1.8, borderRadius: 14, marginTop: 12 },
  memoryNote: { fontSize: 13, lineHeight: 19, fontWeight: "600", marginTop: 10 },
  openMineButton: { minHeight: 42, borderWidth: 1, borderRadius: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, marginTop: 12 },
  openMineText: { fontSize: 13, fontWeight: "900" },
  imageViewerBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.88)",
    justifyContent: "center",
    padding: 18,
  },
  imageViewerInner: { borderRadius: 18, overflow: "hidden" },
  imageViewerPhoto: { width: "100%", height: 420, backgroundColor: "#000" },
  imageViewerClose: {
    position: "absolute",
    top: 12,
    right: 12,
    width: 42,
    height: 42,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  detailsRoot: {
    flex: 1,
    justifyContent: "flex-end",
  },
  detailsBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  detailsSheet: {
    width: "100%",
    maxHeight: "88%",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingTop: 16,
  },
  detailsHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 10,
  },
  detailsHeaderTitle: { flex: 1, minWidth: 0, fontSize: 23, lineHeight: 29, fontWeight: "900" },
  detailsClose: {
    width: 40,
    height: 40,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  detailsContent: { paddingBottom: 20 },
  detailsModePill: {
    alignSelf: "flex-start",
    minHeight: 30,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 14,
  },
  detailsModeText: { fontSize: 12, lineHeight: 15, fontWeight: "900" },
  detailsSectionLabel: { fontSize: 11, lineHeight: 15, fontWeight: "900", letterSpacing: 1.1, marginTop: 14, marginBottom: 6 },
  detailsBody: { fontSize: 14, lineHeight: 21, fontWeight: "600" },
  detailsLine: { fontSize: 14, lineHeight: 20, fontWeight: "800" },
  detailsSubLine: { fontSize: 13, lineHeight: 19, fontWeight: "600", marginTop: 2 },
  detailsStatsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
  },
  detailsStat: {
    width: "48%",
    minHeight: 66,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  detailsStatValue: { fontSize: 20, lineHeight: 24, fontWeight: "900", fontVariant: ["tabular-nums"] },
  detailsStatLabel: { fontSize: 11, lineHeight: 15, fontWeight: "800", marginTop: 2 },
});
