import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
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
import { ArrowLeft, Check, Clock3, Radio, Timer, Trophy, Users, X } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { Text } from "../../src/components/AppText";
import { Button } from "../../src/components/Button";
import { Screen } from "../../src/components/Screen";
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
import { useHabitStore } from "../../src/store/habitStore";
import type { MiniMission } from "../../src/types/habit";
import type {
  LiveMiniParticipantRow,
  LiveMiniParticipantStatus,
  LiveMiniProfileLabel,
  LiveMiniSquadSnapshot,
} from "../../src/types/liveMiniMission";

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

function ParticipantCard({
  row,
  rank,
  profile,
  isMe,
  localMission,
  onOpenMine,
}: {
  row: LiveMiniParticipantRow;
  rank: number | null;
  profile: LiveMiniProfileLabel | undefined;
  isMe: boolean;
  localMission?: MiniMission;
  onOpenMine: () => void;
}) {
  const { theme, isDark } = useTheme();
  const tone = statusTone(row.status, theme, isDark);
  const planned = row.planned_minutes ?? localMission?.estimatedMinutes ?? null;
  const reserve = row.reserve_minutes ?? 0;

  return (
    <View style={[styles.participantCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, ...theme.shadow.card }]}>
      <View style={styles.participantTop}>
        <View style={styles.nameBlock}>
          <Text style={[styles.participantName, { color: theme.colors.textPrimary }]} numberOfLines={2}>
            {displayName(profile)}
            {isMe ? "  You" : ""}
          </Text>
          <View style={styles.metaLineWrap}>
            {planned ? (
              <Text style={[styles.metaLine, { color: theme.colors.textMuted }]}>
                {planned + reserve} min total{reserve > 0 ? ` (${reserve} reserve)` : ""}
              </Text>
            ) : (
              <Text style={[styles.metaLine, { color: theme.colors.textMuted }]}>Waiting for timer</Text>
            )}
          </View>
        </View>

        <View style={[styles.statusPill, { backgroundColor: tone.bg }]}>
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
        </View>
      ) : null}

      {row.status === "in_progress" && row.deadline_at ? (
        <Text style={[styles.deadlineText, { color: theme.colors.textSecondary }]}>
          Deadline: {new Date(row.deadline_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </Text>
      ) : null}

      {row.memory_image_url ? (
        <Image source={{ uri: row.memory_image_url }} style={styles.memoryImage} resizeMode="cover" />
      ) : null}
      {row.memory_note ? (
        <Text style={[styles.memoryNote, { color: theme.colors.textSecondary }]} numberOfLines={4}>
          {row.memory_note}
        </Text>
      ) : null}

      {isMe && localMission ? (
        <TouchableOpacity
          onPress={onOpenMine}
          activeOpacity={0.86}
          style={[styles.openMineButton, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceElevated }]}
        >
          <Timer size={16} color={theme.colors.cyan[400]} />
          <Text style={[styles.openMineText, { color: theme.colors.textPrimary }]}>Open my timer</Text>
        </TouchableOpacity>
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
  const userIdRef = useRef(userId);
  const liveSyncKeyRef = useRef<string | null>(null);

  useEffect(() => {
    userIdRef.current = userId;
    setSnapshot(null);
    setLoading(Boolean(userId));
  }, [userId]);

  const localLiveMission = useMemo(
    () => miniMissions.find((m) => m.liveSquadId === squadId),
    [miniMissions, squadId],
  );

  const load = useCallback(
    async (silent = false) => {
      if (!squadId || !userId) {
        setSnapshot(null);
        setLoading(false);
        return;
      }
      if (!silent) setLoading(true);
      try {
        const next = await fetchLiveMiniSquad(squadId);
        if (userIdRef.current !== userId) return;
        setSnapshot(next);
        const mine = next?.participants.find((p) => p.user_id === userId);
        if (mine?.planned_minutes) {
          setSelectedMinutes(mine.planned_minutes);
          setManualMinutes(String(mine.planned_minutes));
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        showToast(msg, "error");
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [showToast, squadId, userId],
  );

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
    void syncLiveMiniFromLocalMission(localLiveMission)
      .then(() => load(true))
      .catch(() => {});
  }, [load, localLiveMission, squadId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  useEffect(() => {
    if (!squadId) return undefined;
    const unsub = subscribeLiveMiniSquad(squadId, () => void load(true));
    return () => {
      unsub?.();
    };
  }, [load, squadId]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load(true);
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const squad = snapshot?.squad ?? null;
  const participants = snapshot?.participants ?? [];
  const myParticipant = participants.find((p) => p.user_id === userId);
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

  const acceptDisabled = busy !== null || !myParticipant || myParticipant.status !== "invited";

  const handleAccept = async () => {
    if (!squad || !myParticipant || !squadId || acceptDisabled) return;
    const minutes = clampMinutes(selectedMinutes);
    const localId = createMiniMissionId();
    const startedAt = new Date().toISOString();
    setBusy("accept");
    try {
      const res = await acceptLiveMiniInvite({
        squadId,
        localMiniMissionId: localId,
        plannedMinutes: minutes,
        startedAt,
      });
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
      await load(true);
      router.push(`/mini/${localId}`);
    } finally {
      setBusy(null);
    }
  };

  const handleDecline = async () => {
    if (!squadId || !myParticipant || myParticipant.status !== "invited" || busy) return;
    setBusy("decline");
    try {
      const res = await declineLiveMiniInvite(squadId);
      if (res.ok === false) {
        showToast(res.error, "error");
        return;
      }
      showToast("Invite declined.", "success");
      await load(true);
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
          onPress={() => router.back()}
          activeOpacity={0.86}
          style={[styles.iconButton, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
        >
          <ArrowLeft size={20} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <View style={[styles.livePill, { backgroundColor: isDark ? "rgba(34,211,238,0.12)" : "rgba(8,145,178,0.1)" }]}>
          <Radio size={14} color={theme.colors.cyan[400]} />
          <Text style={[styles.livePillText, { color: theme.colors.cyan[400] }]}>Live Squad</Text>
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
            <Text style={[styles.objective, { color: theme.colors.textSecondary }]} numberOfLines={4}>
              {squad.objective}
            </Text>
          ) : null}

          <View style={[styles.summaryCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
            <View style={styles.summaryItem}>
              <Users size={18} color={theme.colors.indigo[400]} />
              <Text style={[styles.summaryValue, { color: theme.colors.textPrimary }]}>{participants.length}</Text>
              <Text style={[styles.summaryLabel, { color: theme.colors.textMuted }]}>players</Text>
            </View>
            <View style={styles.summaryItem}>
              <Check size={18} color={theme.colors.green[500]} />
              <Text style={[styles.summaryValue, { color: theme.colors.textPrimary }]}>{completedRows.length}</Text>
              <Text style={[styles.summaryLabel, { color: theme.colors.textMuted }]}>done</Text>
            </View>
            <View style={styles.summaryItem}>
              <Clock3 size={18} color={theme.colors.cyan[400]} />
              <Text style={[styles.summaryHint, { color: theme.colors.textSecondary }]} numberOfLines={2}>
                {bottomText}
              </Text>
            </View>
          </View>

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
                <TouchableOpacity
                  onPress={() => void handleDecline()}
                  disabled={busy !== null}
                  activeOpacity={0.86}
                  style={[styles.declineButton, { borderColor: theme.colors.border }]}
                >
                  {busy === "decline" ? (
                    <ActivityIndicator color={theme.colors.textMuted} />
                  ) : (
                    <>
                      <X size={16} color={theme.colors.textMuted} />
                      <Text style={[styles.declineText, { color: theme.colors.textMuted }]}>Decline</Text>
                    </>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => void handleAccept()}
                  disabled={acceptDisabled}
                  activeOpacity={0.9}
                  style={[styles.acceptButton, { backgroundColor: theme.colors.indigo[600], opacity: acceptDisabled ? 0.65 : 1 }]}
                >
                  {busy === "accept" ? (
                    <ActivityIndicator color={theme.colors.white} />
                  ) : (
                    <Text style={styles.acceptButtonText}>Accept & Start</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          ) : null}

          <Text style={[styles.sectionLabel, { color: theme.colors.textMuted }]}>SQUAD BOARD</Text>
          {sortedParticipants.map((row) => (
            <ParticipantCard
              key={row.id}
              row={row}
              rank={rankFor(row, completedRows)}
              profile={snapshot.profiles[row.user_id]}
              isMe={row.user_id === userId}
              localMission={row.user_id === userId ? localLiveMission : undefined}
              onOpenMine={() => {
                const mid = row.local_mini_mission_id ?? localLiveMission?.id;
                if (mid) router.push(`/mini/${mid}`);
              }}
            />
          ))}
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  iconButton: { width: 40, height: 40, borderRadius: 999, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  livePill: { minHeight: 34, borderRadius: 999, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 6 },
  livePillText: { fontSize: 12, fontWeight: "900" },
  centerState: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },
  centerTitle: { fontSize: 18, fontWeight: "900", marginTop: 12, textAlign: "center" },
  centerText: { fontSize: 13, lineHeight: 19, textAlign: "center", marginTop: 8, fontWeight: "600" },
  scrollContent: { paddingBottom: 28 },
  title: { fontSize: 28, lineHeight: 34, fontWeight: "900", marginBottom: 8 },
  objective: { fontSize: 14, lineHeight: 20, fontWeight: "600", marginBottom: 16 },
  summaryCard: { borderWidth: 1, borderRadius: 18, padding: 14, flexDirection: "row", gap: 12, marginBottom: 16 },
  summaryItem: { flex: 1, minWidth: 0, alignItems: "center", justifyContent: "center", gap: 4 },
  summaryValue: { fontSize: 20, fontWeight: "900" },
  summaryLabel: { fontSize: 11, fontWeight: "800" },
  summaryHint: { fontSize: 11, lineHeight: 15, fontWeight: "700", textAlign: "center" },
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
  sectionLabel: { fontSize: 11, fontWeight: "900", marginBottom: 10 },
  participantCard: { borderWidth: 1, borderRadius: 18, padding: 14, marginBottom: 12 },
  participantTop: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  nameBlock: { flex: 1, minWidth: 0 },
  participantName: { fontSize: 16, lineHeight: 21, fontWeight: "900" },
  metaLineWrap: { marginTop: 4 },
  metaLine: { fontSize: 12, lineHeight: 16, fontWeight: "700" },
  statusPill: { borderRadius: 999, paddingVertical: 5, paddingHorizontal: 9 },
  statusPillText: { fontSize: 11, fontWeight: "900" },
  resultRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 12 },
  rankBadge: { borderWidth: 1, borderRadius: 999, paddingVertical: 5, paddingHorizontal: 9, flexDirection: "row", alignItems: "center", gap: 5 },
  rankText: { fontSize: 12, fontWeight: "900" },
  elapsedText: { fontSize: 16, fontWeight: "900", fontVariant: ["tabular-nums"] },
  deadlineText: { fontSize: 12, lineHeight: 17, fontWeight: "700", marginTop: 10 },
  memoryImage: { width: "100%", aspectRatio: 1.8, borderRadius: 14, marginTop: 12 },
  memoryNote: { fontSize: 13, lineHeight: 19, fontWeight: "600", marginTop: 10 },
  openMineButton: { minHeight: 42, borderWidth: 1, borderRadius: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, marginTop: 12 },
  openMineText: { fontSize: 13, fontWeight: "900" },
});
