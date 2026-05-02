import { Text } from "../../src/components/AppText";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState } from "react";
import {
  View,
  ScrollView,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  StatusBar,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import * as Haptics from "expo-haptics";
import { ArrowLeft, Info, LogOut, Users } from "lucide-react-native";
import { CohortLeaderHero } from "../../src/components/CohortLeaderHero";
import type { CohortMastheadModel } from "../../src/components/CohortMasthead";
import { CohortNudgeChips } from "../../src/components/CohortNudgeChips";
import { CustomNudgeModal } from "../../src/components/CustomNudgeModal";
import { Screen } from "../../src/components/Screen";
import { ConfirmDialog } from "../../src/components/ConfirmDialog";
import {
  CohortParticipantTimelineLegend,
  CohortPeerStreakDots,
} from "../../src/components/CohortPeerStreakDots";
import { CohortStreakPill } from "../../src/components/CohortStreakPill";
import { SquadActivitySection } from "../../src/components/SquadActivitySection";
import { MissionDetailsSheet } from "../../src/components/MissionDetailsSheet";
import { useTheme } from "../../src/context/ThemeContext";
import { useToast } from "../../src/context/ToastContext";
import { useAuth } from "../../src/context/AuthContext";
import { usePremium } from "../../src/context/PremiumContext";
import { usePlusUpsell } from "../../src/context/PlusUpsellContext";
import { useHabitStore } from "../../src/store/habitStore";
import {
  listChallengeActivity,
  listRecentNudges,
  sendChallengeCustomNudge,
  sendChallengeNudge,
} from "../../src/lib/challengeCohort";
import {
  getChallengeGroup,
  getProfileLabelsForIds,
  leaveChallengeGroup,
  listChallengeMembers,
  refreshCohortPeerHabits,
  type ProfileLabel,
} from "../../src/lib/groupChallengesApi";
import { isSupabaseConfigured } from "../../src/lib/env";
import { deleteAllCommunityWinsForHabit } from "../../src/lib/communityWinsApi";
import { PlusBadge } from "../../src/components/PlusBadge";
import { listChallengeStreakRepairs, voteStreakRepair, type StreakRepairRow, type StreakRepairVoteRow } from "../../src/lib/streakRepairApi";
import { ShimmerBlock } from "../../src/components/ShimmerBlock";
import { useRefreshPremiumAccess } from "../../src/hooks/useRefreshPremiumAccess";
import type {
  ChallengeActivityRow,
  ChallengeGroupRow,
  ChallengeNudgeRow,
  PresetChallengeNudgeKind,
} from "../../src/types/groupChallenge";
import type { Habit } from "../../src/types/habit";
import { isHabitMissionWindowClosed } from "../../src/utils/habitMissionWindow";
import {
  getActiveMissionDaySlot,
} from "../../src/utils/missionDaySlots";
import { levelFromTotalXp } from "../../src/utils/xpLevel";

function parseGroupMissionDisplay(g: ChallengeGroupRow | null): { title: string; description?: string } {
  if (!g) return { title: "Group mission" };
  const tpl = g.habit_template as Record<string, unknown>;
  const habitTitle = typeof tpl.title === "string" ? tpl.title.trim() : "";
  const description =
    typeof tpl.description === "string" && tpl.description.trim().length > 0 ? tpl.description.trim() : undefined;

  let title = habitTitle;
  if (!title) {
    const raw = g.title.trim();
    const parts = raw.split(/\s*[—–]\s/).map((p) => p.trim()).filter(Boolean);
    title = parts.length >= 1 ? parts[0] : raw;
  }
  if (!title) title = "Group mission";

  return { title, description };
}

function participantDisplayName(label: ProfileLabel | undefined): string {
  if (label?.displayName) return label.displayName;
  if (label?.username) {
    const u = label.username;
    return u.charAt(0).toUpperCase() + u.slice(1);
  }
  return "Member";
}

export default function ChallengeDetailScreen() {
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const challengeId = Array.isArray(id) ? id[0] : id;
  const router = useRouter();
  const { theme, isDark } = useTheme();
  const { showToast } = useToast();
  const { session } = useAuth();
  const { isPremium, loading: premiumLoading } = usePremium();
  const { openUpsell } = usePlusUpsell();
  const refreshPremiumAccess = useRefreshPremiumAccess();
  const socialLocked = !isPremium || premiumLoading;
  const myUserId = session?.user?.id ?? null;

  const habits = useHabitStore((s) => s.habits);
  const cohortPeerHabits = useHabitStore((s) => s.cohortPeerHabits);
  const myXp = useHabitStore((s) => s.xp);
  const deleteHabit = useHabitStore((s) => s.deleteHabit);

  const [group, setGroup] = useState<ChallengeGroupRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [memberIdsOrdered, setMemberIdsOrdered] = useState<string[]>([]);
  const [profileLabels, setProfileLabels] = useState<Record<string, ProfileLabel>>({});
  const [feedActivity, setFeedActivity] = useState<ChallengeActivityRow[]>([]);
  const [feedNudges, setFeedNudges] = useState<ChallengeNudgeRow[]>([]);
  const [nudgeBusyKey, setNudgeBusyKey] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [cohortNow, setCohortNow] = useState(() => Date.now());
  const [leaveBusy, setLeaveBusy] = useState(false);
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const [customNoteToUserId, setCustomNoteToUserId] = useState<string | null>(null);
  const [repairRows, setRepairRows] = useState<StreakRepairRow[]>([]);
  const [repairVotes, setRepairVotes] = useState<StreakRepairVoteRow[]>([]);
  const [repairBusyId, setRepairBusyId] = useState<string | null>(null);
  const [missionDetailsOpen, setMissionDetailsOpen] = useState(false);

  const focusOnceRef = useRef(false);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!challengeId) return;
    const silent = opts?.silent ?? false;
    if (!silent) setLoading(true);
    try {
      const [g, members, activity, nudges] = await Promise.all([
        getChallengeGroup(challengeId),
        listChallengeMembers(challengeId),
        listChallengeActivity(challengeId).catch(() => [] as ChallengeActivityRow[]),
        listRecentNudges(challengeId).catch(() => [] as ChallengeNudgeRow[]),
      ]);
      setGroup(g);
      const ids = members.map((m) => m.user_id);
      setMemberIdsOrdered(ids);
      setFeedActivity(activity);
      setFeedNudges(nudges);
      const labelIds = new Set<string>(ids);
      for (const a of activity) labelIds.add(a.actor_user_id);
      for (const n of nudges) {
        labelIds.add(n.from_user_id);
        labelIds.add(n.to_user_id);
      }
      const labels = await getProfileLabelsForIds([...labelIds]);
      setProfileLabels(labels);

      const repairsRes = await listChallengeStreakRepairs(challengeId);
      if (repairsRes.ok) {
        setRepairRows(repairsRes.repairs);
        setRepairVotes(repairsRes.votes);
      } else {
        setRepairRows([]);
        setRepairVotes([]);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [challengeId]);

  useFocusEffect(
    useCallback(() => {
      setCohortNow(Date.now());
      const silent = focusOnceRef.current;
      focusOnceRef.current = true;
      void load({ silent });
      void refreshCohortPeerHabits();
      void refreshPremiumAccess();
    }, [load, refreshPremiumAccess]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([load({ silent: true }), refreshCohortPeerHabits()]);
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const onSendNudge = useCallback(
    async (toUserId: string, kind: PresetChallengeNudgeKind) => {
      if (!challengeId || !myUserId || toUserId === myUserId) return;
      const freshPremium = await refreshPremiumAccess({ force: true });
      if (freshPremium !== true) {
        openUpsell("squad_nudge");
        return;
      }
      const viewerHabit = habits.find((h) => h.challengeGroupId === challengeId);
      if (
        viewerHabit &&
        !viewerHabit.isCompleted &&
        isHabitMissionWindowClosed(viewerHabit, Date.now())
      ) {
        return;
      }
      const key = `${toUserId}-${kind}`;
      setNudgeBusyKey(key);
      try {
        const { error } = await sendChallengeNudge(challengeId, toUserId, kind);
        if (error) {
          showToast(error.message, "error");
          return;
        }
        await load({ silent: true });
      } finally {
        setNudgeBusyKey(null);
      }
    },
    [challengeId, myUserId, load, habits, showToast, openUpsell, refreshPremiumAccess],
  );

  const onCongrats = useCallback(
    async (actorUserId: string, activityId: string) => {
      if (!challengeId || !myUserId || actorUserId === myUserId) return;
      const freshPremium = await refreshPremiumAccess({ force: true });
      if (freshPremium !== true) {
        openUpsell("squad_nudge");
        return;
      }
      const viewerHabit = habits.find((h) => h.challengeGroupId === challengeId);
      if (
        viewerHabit &&
        !viewerHabit.isCompleted &&
        isHabitMissionWindowClosed(viewerHabit, Date.now())
      ) {
        return;
      }
      const key = `${actorUserId}-congrats`;
      setNudgeBusyKey(key);
      try {
        const { error } = await sendChallengeNudge(challengeId, actorUserId, "congrats", { activityId });
        if (error) {
          showToast(error.message, "error");
          return;
        }
        await load({ silent: true });
      } finally {
        setNudgeBusyKey(null);
      }
    },
    [challengeId, myUserId, load, habits, showToast, openUpsell, refreshPremiumAccess],
  );

  const congratsSentActivityIds = useMemo(() => {
    if (!myUserId) return new Set<string>();
    const s = new Set<string>();
    for (const n of feedNudges) {
      if (n.from_user_id === myUserId && n.kind === "congrats" && typeof n.activity_id === "string" && n.activity_id) {
        s.add(n.activity_id);
      }
    }
    return s;
  }, [feedNudges, myUserId]);

  const myHabit = useMemo(
    () => habits.find((h) => h.challengeGroupId === challengeId),
    [habits, challengeId],
  );

  const canLeaveMission = Boolean(
    challengeId && myHabit?.id && session && isSupabaseConfigured(),
  );

  const onLeaveMission = useCallback(() => {
    if (!challengeId || !myHabit?.id) return;
    setLeaveDialogOpen(true);
  }, [challengeId, myHabit?.id]);

  const confirmLeaveMission = useCallback(() => {
    if (!challengeId || !myHabit?.id) return;
    setLeaveDialogOpen(false);
    void (async () => {
      setLeaveBusy(true);
      try {
        const habitId = myHabit.id;
        const habitSnapshot = myHabit;
        const { error } = await leaveChallengeGroup(challengeId);
        if (error) {
          showToast(error.message, "error");
          return;
        }
        await deleteAllCommunityWinsForHabit(habitSnapshot);
        deleteHabit(habitId);
        await refreshCohortPeerHabits().catch(() => {});
        showToast("Left group mission", "success");
        router.back();
      } finally {
        setLeaveBusy(false);
      }
    })();
  }, [challengeId, myHabit, deleteHabit, router, showToast]);

  useEffect(() => {
    if (!myHabit || myHabit.isCompleted) return;
    const t = setInterval(() => setCohortNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, [myHabit?.id, myHabit?.isCompleted]);

  const squadNudgeActionsEnabled = useMemo(() => {
    if (!myHabit) return true;
    if (myHabit.isCompleted) return true;
    return !isHabitMissionWindowClosed(myHabit, cohortNow);
  }, [myHabit, cohortNow]);

  const peers = useMemo(
    () => cohortPeerHabits.filter((h) => h.challengeGroupId === challengeId),
    [cohortPeerHabits, challengeId],
  );

  const { title: missionTitle, description: missionDescription } = useMemo(
    () => parseGroupMissionDisplay(group),
    [group],
  );

  const habitForMember = useCallback(
    (memberId: string): Habit | undefined => {
      const fromPeers = peers.find((h) => (h.ownerUserId ?? "") === memberId);
      if (fromPeers) return fromPeers;
      if (myUserId && memberId === myUserId && myHabit) return myHabit;
      return undefined;
    },
    [peers, myUserId, myHabit],
  );

  const sortedMemberIds = useMemo(() => {
    return [...memberIdsOrdered].sort((a, b) => {
      const ha = habitForMember(a);
      const hb = habitForMember(b);
      const sa = ha?.streak ?? -1;
      const sb = hb?.streak ?? -1;
      if (sb !== sa) return sb - sa;
      const da = ha?.completedDates.length ?? 0;
      const db = hb?.completedDates.length ?? 0;
      return db - da;
    });
  }, [memberIdsOrdered, habitForMember]);

  const cohortBoard = useMemo((): {
    model: CohortMastheadModel;
    spotlight: { userId: string; habit: Habit; name: string } | null;
    /** Second-ranked member (same sort as spotlight) for 1st vs 2nd progress in the hero card. */
    runnerUp: { userId: string; habit: Habit; name: string } | null;
  } | null => {
    if (memberIdsOrdered.length === 0) return null;
    const rows = memberIdsOrdered.map((id) => ({
      id,
      habit: habitForMember(id),
      name: participantDisplayName(profileLabels[id]),
    }));
    const withHabit = rows.filter((r): r is typeof r & { habit: Habit } => Boolean(r.habit));
    if (withHabit.length === 0) {
      return { model: { kind: "sync_prompt" }, spotlight: null, runnerUp: null };
    }
    const sorted = [...withHabit].sort((a, b) => {
      const d = b.habit.streak - a.habit.streak;
      if (d !== 0) return d;
      return b.habit.completedDates.length - a.habit.completedDates.length;
    });
    const runnerUp =
      sorted.length >= 2
        ? { userId: sorted[1].id, habit: sorted[1].habit, name: sorted[1].name }
        : null;
    const top = sorted[0];
    const maxS = top.habit.streak;
    const leaders = sorted.filter((r) => r.habit.streak === maxS);
    if (maxS === 0) {
      const byDays = [...sorted].sort((a, b) => b.habit.completedDates.length - a.habit.completedDates.length)[0];
      const n = byDays.habit.completedDates.length;
      return {
        model: { kind: "most_days", leaderName: byDays.name, daysChecked: n },
        spotlight: { userId: byDays.id, habit: byDays.habit, name: byDays.name },
        runnerUp,
      };
    }
    if (leaders.length >= 2) {
      return {
        model: { kind: "tie", leadersCount: leaders.length, streakDays: maxS },
        spotlight: { userId: top.id, habit: top.habit, name: top.name },
        runnerUp,
      };
    }
    return {
      model: { kind: "leader", leaderName: top.name, streakDays: maxS },
      spotlight: { userId: top.id, habit: top.habit, name: top.name },
      runnerUp,
    };
  }, [memberIdsOrdered, profileLabels, habitForMember]);

  const missionTotalDays = useMemo(() => {
    if (myHabit) return Math.max(1, myHabit.totalDays ?? 21);
    const tpl = group?.habit_template as Record<string, unknown> | undefined;
    const n = tpl && typeof tpl.totalDays === "number" ? tpl.totalDays : null;
    if (n != null && Number.isFinite(n)) return Math.max(1, Math.floor(n));
    return 21;
  }, [myHabit, group?.habit_template]);

  const groupMissionMode = useMemo((): "manual" | "autopilot" => {
    const tpl = group?.habit_template as Record<string, unknown> | undefined;
    if (tpl && tpl.mode === "manual") return "manual";
    return "autopilot";
  }, [group?.habit_template]);

  const groupTemplateEndDate = useMemo(() => {
    const tpl = group?.habit_template as Record<string, unknown> | undefined;
    const e = tpl?.endDate;
    return typeof e === "string" && e.trim().length > 0 ? e.trim() : null;
  }, [group?.habit_template]);

  const viewerMissionSlot = useMemo(() => {
    if (!myHabit || myHabit.isCompleted) return null;
    return getActiveMissionDaySlot(myHabit.startDate, cohortNow, missionTotalDays);
  }, [myHabit, cohortNow, missionTotalDays]);

  const scrollRef = useRef<ScrollView>(null);
  const squadSectionOffsetY = useRef(0);

  const customNoteSentTodayToUserIds = useMemo(() => {
    if (!myUserId) return new Set<string>();
    const s = new Set<string>();
    const todayUtc = new Date().toISOString().slice(0, 10);
    for (const n of feedNudges) {
      if (
        n.from_user_id === myUserId &&
        n.kind === "custom_note" &&
        typeof n.created_at === "string" &&
        n.created_at.slice(0, 10) === todayUtc
      ) {
        s.add(n.to_user_id);
      }
    }
    return s;
  }, [feedNudges, myUserId]);

  const onOpenCustomNote = useCallback(
    (toUserId: string) => {
      void (async () => {
        const freshPremium = await refreshPremiumAccess({ force: true });
        if (freshPremium !== true) {
          openUpsell("squad_nudge");
          return;
        }
        setCustomNoteToUserId(toUserId);
      })();
    },
    [openUpsell, refreshPremiumAccess],
  );

  const onSubmitCustomNote = useCallback(
    async (text: string) => {
      if (!challengeId || !customNoteToUserId || !myUserId) return;
      const freshPremium = await refreshPremiumAccess({ force: true });
      if (freshPremium !== true) {
        openUpsell("squad_nudge");
        return;
      }
      const viewerHabit = habits.find((h) => h.challengeGroupId === challengeId);
      if (
        viewerHabit &&
        !viewerHabit.isCompleted &&
        isHabitMissionWindowClosed(viewerHabit, Date.now())
      ) {
        showToast("Mission window ended. Nudges are disabled.", "info");
        return;
      }
      setNudgeBusyKey(`${customNoteToUserId}-custom_note`);
      try {
        const { error } = await sendChallengeCustomNudge(challengeId, customNoteToUserId, text);
        if (error) {
          showToast(error.message, "error");
          return;
        }
        setCustomNoteToUserId(null);
        await load({ silent: true });
      } finally {
        setNudgeBusyKey(null);
      }
    },
    [challengeId, customNoteToUserId, myUserId, habits, showToast, load, openUpsell, refreshPremiumAccess],
  );

  const bottomPad = 40;

  if (!challengeId) {
    return (
      <Screen>
        <Text style={{ color: theme.colors.textPrimary }}>Invalid group mission</Text>
      </Screen>
    );
  }

  return (
    <Screen>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={theme.colors.background} />

      <View style={styles.header}>
        <TouchableOpacity
          style={[styles.iconButton, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
          onPress={() => router.back()}
        >
          <ArrowLeft size={theme.icon.xl} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerActionsRow}>
          {group ? (
            <TouchableOpacity
              style={[
                styles.missionDetailsButton,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.border,
                  opacity: loading ? 0.65 : 1,
                },
              ]}
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setMissionDetailsOpen(true);
              }}
              disabled={loading}
              accessibilityRole="button"
              accessibilityLabel="View mission detail"
            >
              <Info size={theme.icon.md} color={theme.colors.indigo[400]} />
              <Text style={[styles.missionDetailsButtonText, { color: theme.colors.indigo[400] }]}>View mission detail</Text>
            </TouchableOpacity>
          ) : null}

          {canLeaveMission ? (
            <TouchableOpacity
              style={[
                styles.leaveButton,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.border,
                  opacity: leaveBusy ? 0.65 : 1,
                },
              ]}
              onPress={onLeaveMission}
              disabled={leaveBusy}
              accessibilityRole="button"
              accessibilityLabel="Leave group mission"
            >
              {leaveBusy ? (
                <ActivityIndicator color={theme.colors.red[500]} size="small" />
              ) : (
                <LogOut size={theme.icon.md} color={theme.colors.red[500]} />
              )}
              <Text style={[styles.leaveButtonText, { color: theme.colors.red[500] }]}>Leave</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {loading ? (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: bottomPad }}
        >
          <View style={{ gap: 12, paddingTop: 6 }}>
            <ShimmerBlock isDark={isDark} height={26} radius={10} style={{ width: "72%" }} />
            <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
              <ShimmerBlock isDark={isDark} height={30} radius={999} style={{ width: 140 }} />
              <ShimmerBlock isDark={isDark} height={30} radius={999} style={{ width: 118 }} />
              <ShimmerBlock isDark={isDark} height={30} radius={999} style={{ width: 170 }} />
            </View>
            <View
              style={[
                styles.card,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.border,
                  ...theme.shadow.card,
                },
              ]}
            >
              <View style={{ gap: 10 }}>
                <ShimmerBlock isDark={isDark} height={14} radius={7} style={{ width: "48%" }} />
                <ShimmerBlock isDark={isDark} height={12} radius={6} style={{ width: "92%" }} />
                <ShimmerBlock isDark={isDark} height={12} radius={6} style={{ width: "66%" }} />
              </View>
            </View>

            <View style={{ gap: 10 }}>
              <ShimmerBlock isDark={isDark} height={14} radius={7} style={{ width: "40%" }} />
              {Array.from({ length: 3 }, (_, i) => (
                <View
                  key={i}
                  style={[
                    styles.card,
                    {
                      backgroundColor: theme.colors.surface,
                      borderColor: theme.colors.border,
                      ...theme.shadow.card,
                    },
                  ]}
                >
                  <View style={{ gap: 10 }}>
                    <ShimmerBlock isDark={isDark} height={16} radius={8} style={{ width: i % 2 === 0 ? "62%" : "54%" }} />
                    <ShimmerBlock isDark={isDark} height={12} radius={6} style={{ width: "88%" }} />
                    <ShimmerBlock isDark={isDark} height={12} radius={6} style={{ width: "52%" }} />
                  </View>
                </View>
              ))}
            </View>
          </View>
        </ScrollView>
      ) : (
        <ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: bottomPad }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.colors.indigo[400]}
              colors={[theme.colors.indigo[400]]}
            />
          }
        >
          {myHabit?.id ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Open mission: ${missionTitle}`}
              onPress={() => router.push(`/habit/${myHabit.id}`)}
              style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1 }]}
            >
              <Text style={[styles.heroTitle, { color: theme.colors.textPrimary }]}>{missionTitle}</Text>
            </Pressable>
          ) : (
            <Text style={[styles.heroTitle, { color: theme.colors.textPrimary }]}>{missionTitle}</Text>
          )}

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.metaPillsRow}
            style={{ marginBottom: 14 }}
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
              <Users size={14} color={theme.colors.indigo[400]} strokeWidth={2.2} />
              <Text style={[styles.metaChipText, { color: theme.colors.textSecondary }]}>
                {memberIdsOrdered.length} participant{memberIdsOrdered.length === 1 ? "" : "s"}
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
              <Text style={[styles.metaChipText, { color: theme.colors.textSecondary }]}>
                {missionTotalDays}-day mission
              </Text>
            </View>

            {viewerMissionSlot != null ? (
              <View
                style={[
                  styles.dayPill,
                  {
                    backgroundColor: isDark ? "rgba(99, 102, 241, 0.2)" : "rgba(99, 102, 241, 0.14)",
                  },
                ]}
              >
                <Text style={[styles.dayPillText, { color: theme.colors.indigo[400] }]}>
                  Day {viewerMissionSlot} of {missionTotalDays}
                </Text>
              </View>
            ) : null}
          </ScrollView>

          {!isPremium ? (
            <View style={styles.plusGateRow}>
              <PlusBadge withFlame />
              <Text style={[styles.plusGateText, { color: theme.colors.textMuted }]}>
                Squad features are part of HabitPro Community.
              </Text>
            </View>
          ) : null}

          {repairRows.some((r) => r.status === "pending") ? (
            <>
              <Text style={[styles.sectionLabel, { color: theme.colors.textMuted }]}>REPAIR REQUESTS</Text>
              {repairRows
                .filter((r) => r.status === "pending")
                .slice(0, 10)
                .map((r) => {
                  const requester = profileLabels[r.user_id];
                  const name = participantDisplayName(requester);
                  const votes = repairVotes.filter((v) => v.repair_id === r.id);
                  const approves = votes.filter((v) => v.vote === "approve").length;
                  const declines = votes.filter((v) => v.vote === "decline").length;
                  const myVote = myUserId ? votes.find((v) => v.voter_id === myUserId)?.vote ?? null : null;
                  const isRequester = Boolean(myUserId && myUserId === r.user_id);
                  const canVote = Boolean(myUserId && !isRequester && declines === 0);
                  return (
                    <View
                      key={r.id}
                      style={[
                        styles.repairCard,
                        {
                          backgroundColor: theme.colors.surface,
                          borderColor: theme.colors.border,
                          ...theme.shadow.card,
                        },
                      ]}
                    >
                      <View style={styles.repairTopRow}>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={[styles.repairTitle, { color: theme.colors.textPrimary }]} numberOfLines={2}>
                            Approve streak repair?
                          </Text>
                          <Text style={[styles.repairMeta, { color: theme.colors.textSecondary }]} numberOfLines={2}>
                            {name} missed {r.date_str} · {approves} / {r.approvals_required} approvals · {r.xp_cost} XP
                          </Text>
                        </View>
                        <Users size={18} color={theme.colors.indigo[400]} />
                      </View>

                      <Text style={[styles.repairReason, { color: theme.colors.textMuted }]} numberOfLines={3}>
                        “{r.reason}”
                      </Text>

                      {isRequester ? (
                        <View style={styles.repairRequesterRow}>
                          <Text style={[styles.repairRequesterText, { color: theme.colors.textMuted }]}>
                            Waiting for approvals…
                          </Text>
                        </View>
                      ) : (
                        <View style={styles.repairActionsRow}>
                          <TouchableOpacity
                            disabled={!canVote || repairBusyId === r.id}
                            onPress={() => {
                              if (!canVote) return;
                              void (async () => {
                                const freshPremium = await refreshPremiumAccess({ force: true });
                                if (freshPremium !== true) {
                                  openUpsell("streak_repair");
                                  return;
                                }
                                setRepairBusyId(r.id);
                                const res = await voteStreakRepair({ repairId: r.id, vote: "approve" });
                                setRepairBusyId(null);
                                if (!res.ok) {
                                  const msg = "error" in res ? res.error : "Could not approve.";
                                  showToast(msg, "error");
                                  return;
                                }
                                await Promise.all([load({ silent: true }), refreshCohortPeerHabits()]);
                              })();
                            }}
                            activeOpacity={0.88}
                            style={[
                              styles.repairBtn,
                              {
                                backgroundColor: myVote === "approve" ? theme.colors.indigo[600] : theme.colors.surfaceElevated,
                                borderColor: theme.colors.border,
                                opacity: !canVote || repairBusyId === r.id ? 0.6 : 1,
                              },
                            ]}
                          >
                            <Text style={[styles.repairBtnText, { color: myVote === "approve" ? "#fff" : theme.colors.textPrimary }]}>
                              Approve
                            </Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            disabled={!canVote || repairBusyId === r.id}
                            onPress={() => {
                              if (!canVote) return;
                              void (async () => {
                                const freshPremium = await refreshPremiumAccess({ force: true });
                                if (freshPremium !== true) {
                                  openUpsell("streak_repair");
                                  return;
                                }
                                setRepairBusyId(r.id);
                                const res = await voteStreakRepair({ repairId: r.id, vote: "decline" });
                                setRepairBusyId(null);
                                if (!res.ok) {
                                  const msg = "error" in res ? res.error : "Could not decline.";
                                  showToast(msg, "error");
                                  return;
                                }
                                await Promise.all([load({ silent: true }), refreshCohortPeerHabits()]);
                              })();
                            }}
                            activeOpacity={0.88}
                            style={[
                              styles.repairBtn,
                              {
                                backgroundColor: myVote === "decline" ? "rgba(239, 68, 68, 0.14)" : theme.colors.surfaceElevated,
                                borderColor: theme.colors.border,
                                opacity: !canVote || repairBusyId === r.id ? 0.6 : 1,
                              },
                            ]}
                          >
                            <Text style={[styles.repairBtnText, { color: myVote === "decline" ? theme.colors.red[500] : theme.colors.textPrimary }]}>
                              Decline
                            </Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  );
                })}
            </>
          ) : null}

          {cohortBoard ? (
            <CohortLeaderHero
              theme={theme}
              isDark={isDark}
              model={cohortBoard.model}
              leaderName={cohortBoard.spotlight?.name ?? "Squad"}
              leaderLabel={
                cohortBoard.spotlight ? profileLabels[cohortBoard.spotlight.userId] : undefined
              }
              leaderHabit={cohortBoard.spotlight?.habit}
              runnerUp={cohortBoard.runnerUp}
            />
          ) : null}

          <View style={styles.participantsSectionHeader}>
            <Text style={[styles.sectionLabel, styles.participantsSectionTitle, { color: theme.colors.textMuted }]}>
              PARTICIPANTS
            </Text>
            <CohortParticipantTimelineLegend theme={theme} isDark={isDark} />
          </View>

          {memberIdsOrdered.length === 0 ? (
            <Text style={{ color: theme.colors.textSecondary }}>No members loaded yet.</Text>
          ) : (
            sortedMemberIds.map((memberId) => {
              const label = profileLabels[memberId];
              const habit = habitForMember(memberId);
              const nameOnCard = participantDisplayName(label);
              const xpForLevel =
                label?.xp != null ? label.xp : myUserId === memberId ? myXp : null;
              const memberLevel = xpForLevel != null ? levelFromTotalXp(xpForLevel) : null;

              return (
                <View
                  key={memberId}
                  style={[
                    styles.participantCard,
                    {
                      backgroundColor: theme.colors.surface,
                      borderColor: theme.colors.border,
                      ...theme.shadow.card,
                    },
                  ]}
                >
                  <View style={styles.participantHeaderRow}>
                    <View style={styles.participantNameLevelCluster}>
                      <Text
                        style={[
                          styles.participantName,
                          styles.participantNameInline,
                          { color: theme.colors.textPrimary },
                        ]}
                        numberOfLines={2}
                      >
                        {nameOnCard}
                      </Text>
                      {memberLevel != null ? (
                        <View
                          style={[
                            styles.levelPill,
                            {
                              borderColor: theme.colors.border,
                              backgroundColor: isDark ? "rgba(251, 191, 36, 0.12)" : "rgba(234, 179, 8, 0.12)",
                            },
                          ]}
                        >
                          <Text style={[styles.levelPillText, { color: theme.colors.yellow[400] }]}>
                            Lv {memberLevel}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    <View style={styles.participantHeaderSpacer} />
                    <View style={styles.participantHeaderStreakWrap}>
                      {habit ? (
                        <CohortStreakPill streak={habit.streak} isDark={isDark} />
                      ) : (
                        <Text style={[styles.streakPlaceholder, { color: theme.colors.textMuted }]}>-</Text>
                      )}
                    </View>
                  </View>

                  {habit ? (
                    <CohortPeerStreakDots
                      habit={habit}
                      peerUsername={label?.username ?? null}
                      showIdentityRow={false}
                    />
                  ) : (
                    <Text style={[styles.noSyncHint, { color: theme.colors.textMuted }]}>
                      Mission progress will show here once it syncs.
                    </Text>
                  )}

                  {squadNudgeActionsEnabled && myUserId && memberId !== myUserId ? (
                    <CohortNudgeChips
                      theme={theme}
                      isDark={isDark}
                      memberId={memberId}
                      nudgeBusyKey={nudgeBusyKey}
                      onPress={(kind) => void onSendNudge(memberId, kind)}
                      plusLocked={socialLocked}
                      onPlusLocked={() => openUpsell("squad_nudge")}
                      customNoteSentToday={customNoteSentTodayToUserIds.has(memberId)}
                      onCustomNotePress={() => onOpenCustomNote(memberId)}
                    />
                  ) : null}
                </View>
              );
            })
          )}

          <View
            onLayout={(e) => {
              squadSectionOffsetY.current = e.nativeEvent.layout.y;
            }}
          >
            <SquadActivitySection
              theme={theme}
              isDark={isDark}
              feedActivity={feedActivity}
              feedNudges={feedNudges}
              profileLabels={profileLabels}
              myUserId={myUserId}
              nudgeBusyKey={nudgeBusyKey}
              congratsSentActivityIds={congratsSentActivityIds}
              onCongrats={(actorUserId, activityId) => void onCongrats(actorUserId, activityId)}
              allowNudgeActions={squadNudgeActionsEnabled}
              onScrollToSection={() => {
                setTimeout(() => {
                  scrollRef.current?.scrollTo({
                    y: Math.max(0, squadSectionOffsetY.current - 16),
                    animated: true,
                  });
                }, 100);
              }}
            />
          </View>
        </ScrollView>
      )}

      <CustomNudgeModal
        visible={customNoteToUserId !== null}
        onRequestClose={() => setCustomNoteToUserId(null)}
        recipientLabel={participantDisplayName(profileLabels[customNoteToUserId ?? ""])}
        busy={customNoteToUserId !== null && nudgeBusyKey === `${customNoteToUserId}-custom_note`}
        onSend={(t) => void onSubmitCustomNote(t)}
      />

      <ConfirmDialog
        visible={leaveDialogOpen}
        onRequestClose={() => setLeaveDialogOpen(false)}
        title="Leave group mission?"
        message="You’ll be removed from the squad and this mission will disappear from your list. This can’t be undone."
        actions={[
          { label: "Cancel", variant: "secondary", onPress: () => setLeaveDialogOpen(false) },
          { label: "Leave", variant: "danger", onPress: confirmLeaveMission },
        ]}
      />

      {group ? (
        <MissionDetailsSheet
          variant="group"
          visible={missionDetailsOpen}
          onClose={() => setMissionDetailsOpen(false)}
          title={missionTitle}
          description={missionDescription ?? null}
          mode={groupMissionMode}
          totalDays={missionTotalDays}
          startDate={group.start_date}
          endDate={groupTemplateEndDate}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
    gap: 12,
  },
  iconButton: { padding: 8, borderRadius: 9999, borderWidth: 1 },
  headerActionsRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  missionDetailsButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 9999,
    borderWidth: 1,
  },
  missionDetailsButtonText: { fontSize: 13, fontWeight: "800" },
  leaveButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 9999,
    borderWidth: 1,
  },
  leaveButtonText: { fontSize: 14, fontWeight: "800" },
  heroTitle: {
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: -0.5,
    lineHeight: 34,
    marginBottom: 8,
  },
  metaPillsRow: {
    flexDirection: "row",
    gap: 8,
    paddingRight: 16,
  },
  metaChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 9999,
    borderWidth: 1,
    maxWidth: "100%",
  },
  metaChipText: { fontSize: 12, fontWeight: "700", flexShrink: 1 },
  dayPill: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 9999,
    borderWidth: 0,
  },
  dayPillText: { fontSize: 11, fontWeight: "800", letterSpacing: 0.3 },
  plusGateRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14 },
  plusGateText: { fontSize: 12, fontWeight: "700" },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
    marginBottom: 12,
  },
  participantsSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    flexWrap: "wrap",
    marginBottom: 12,
  },
  participantsSectionTitle: {
    marginBottom: 0,
    flexShrink: 0,
  },
  repairCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
  },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
  },
  repairTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  repairTitle: { fontSize: 14, fontWeight: "900" },
  repairMeta: { fontSize: 12, fontWeight: "700", marginTop: 4 },
  repairReason: { fontSize: 12, fontWeight: "600", marginTop: 10, lineHeight: 17 },
  repairActionsRow: { flexDirection: "row", gap: 10, marginTop: 12 },
  repairRequesterRow: { marginTop: 12 },
  repairRequesterText: { fontSize: 12, fontWeight: "800" },
  repairBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 10,
    alignItems: "center",
  },
  repairBtnText: { fontSize: 12, fontWeight: "900" },
  participantCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    marginBottom: 14,
  },
  participantHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    marginBottom: 6,
  },
  participantNameLevelCluster: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 1,
    minWidth: 0,
    gap: 6,
  },
  participantHeaderSpacer: {
    flex: 1,
    minWidth: 8,
  },
  participantHeaderStreakWrap: {
    flexShrink: 0,
  },
  levelPill: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 9999,
    borderWidth: 1,
  },
  levelPillText: { fontSize: 11, fontWeight: "800", letterSpacing: 0.2 },
  participantName: {
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  participantNameInline: {
    flexGrow: 0,
    flexShrink: 1,
    minWidth: 0,
    maxWidth: "100%",
  },
  streakPlaceholder: { fontSize: 13, fontWeight: "700" },
  noSyncHint: { fontSize: 12, lineHeight: 17, fontStyle: "italic", marginTop: 4 },
});
