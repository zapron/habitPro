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
  Platform,
  RefreshControl,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { ArrowLeft, LogOut } from "lucide-react-native";
import {
  CohortMasthead,
  type CohortMastheadModel,
} from "../../src/components/CohortMasthead";
import { CohortNudgeChips } from "../../src/components/CohortNudgeChips";
import { CustomNudgeModal } from "../../src/components/CustomNudgeModal";
import { Screen } from "../../src/components/Screen";
import { ConfirmDialog } from "../../src/components/ConfirmDialog";
import { CohortPeerStreakDots } from "../../src/components/CohortPeerStreakDots";
import { CohortStreakPill } from "../../src/components/CohortStreakPill";
import { SquadActivitySection } from "../../src/components/SquadActivitySection";
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
import type {
  ChallengeActivityRow,
  ChallengeGroupRow,
  ChallengeNudgeRow,
  PresetChallengeNudgeKind,
} from "../../src/types/groupChallenge";
import type { Habit } from "../../src/types/habit";
import { isHabitMissionWindowClosed } from "../../src/utils/habitMissionWindow";

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
  const socialLocked = !isPremium || premiumLoading;
  const myUserId = session?.user?.id ?? null;

  const habits = useHabitStore((s) => s.habits);
  const cohortPeerHabits = useHabitStore((s) => s.cohortPeerHabits);
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
    }, [load]),
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
      if (socialLocked) {
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
    [challengeId, myUserId, load, habits, showToast, socialLocked, openUpsell],
  );

  const onCongrats = useCallback(
    async (actorUserId: string) => {
      if (!challengeId || !myUserId || actorUserId === myUserId) return;
      if (socialLocked) {
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
        const { error } = await sendChallengeNudge(challengeId, actorUserId, "congrats");
        if (error) {
          showToast(error.message, "error");
          return;
        }
        await load({ silent: true });
      } finally {
        setNudgeBusyKey(null);
      }
    },
    [challengeId, myUserId, load, habits, showToast, socialLocked, openUpsell],
  );

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

  const cohortMastheadModel = useMemo((): CohortMastheadModel | null => {
    if (memberIdsOrdered.length === 0) return null;
    const rows = memberIdsOrdered.map((id) => ({
      id,
      habit: habitForMember(id),
      name: participantDisplayName(profileLabels[id]),
    }));
    const withHabit = rows.filter((r): r is typeof r & { habit: Habit } => Boolean(r.habit));
    if (withHabit.length === 0) {
      return { kind: "sync_prompt" };
    }
    const sorted = [...withHabit].sort((a, b) => {
      const d = b.habit.streak - a.habit.streak;
      if (d !== 0) return d;
      return b.habit.completedDates.length - a.habit.completedDates.length;
    });
    const top = sorted[0];
    const maxS = top.habit.streak;
    const leaders = sorted.filter((r) => r.habit.streak === maxS);
    if (maxS === 0) {
      const byDays = [...sorted].sort((a, b) => b.habit.completedDates.length - a.habit.completedDates.length)[0];
      const n = byDays.habit.completedDates.length;
      return { kind: "most_days", leaderName: byDays.name, daysChecked: n };
    }
    if (leaders.length >= 2) {
      return { kind: "tie", leadersCount: leaders.length, streakDays: maxS };
    }
    return { kind: "leader", leaderName: top.name, streakDays: maxS };
  }, [memberIdsOrdered, profileLabels, habitForMember]);

  const customNoteSentToUserIds = useMemo(() => {
    if (!myUserId) return new Set<string>();
    const s = new Set<string>();
    for (const n of feedNudges) {
      if (n.from_user_id === myUserId && n.kind === "custom_note") {
        s.add(n.to_user_id);
      }
    }
    return s;
  }, [feedNudges, myUserId]);

  const onOpenCustomNote = useCallback(
    (toUserId: string) => {
      if (socialLocked) {
        openUpsell("squad_nudge");
        return;
      }
      setCustomNoteToUserId(toUserId);
    },
    [socialLocked, openUpsell],
  );

  const onSubmitCustomNote = useCallback(
    async (text: string) => {
      if (!challengeId || !customNoteToUserId || !myUserId) return;
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
    [challengeId, customNoteToUserId, myUserId, habits, showToast, load],
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

      {loading ? (
        <ActivityIndicator color={theme.colors.indigo[400]} style={{ marginTop: 24 }} />
      ) : (
        <ScrollView
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

          <Text style={[styles.metaLine, { color: theme.colors.textMuted }]}>
            {memberIdsOrdered.length} participant{memberIdsOrdered.length === 1 ? "" : "s"} ·{" "}
            {group?.creator_timezone ?? "-"}
          </Text>

          {!isPremium ? (
            <View style={styles.plusGateRow}>
              <PlusBadge label="HABITPRO COMMUNITY" />
              <Text style={[styles.plusGateText, { color: theme.colors.textMuted }]}>
                Squad features are part of HabitPro Community.
              </Text>
            </View>
          ) : null}

          {missionDescription ? (
            <Text
              style={[
                styles.missionDescription,
                {
                  color: theme.colors.textSecondary,
                  fontFamily: Platform.select({ ios: "Georgia", android: "serif", default: undefined }),
                },
              ]}
              numberOfLines={6}
            >
              {missionDescription}
            </Text>
          ) : null}

          <SquadActivitySection
            theme={theme}
            isDark={isDark}
            feedActivity={feedActivity}
            feedNudges={feedNudges}
            profileLabels={profileLabels}
            myUserId={myUserId}
            nudgeBusyKey={nudgeBusyKey}
            onCongrats={(actorUserId) => void onCongrats(actorUserId)}
            allowNudgeActions={squadNudgeActionsEnabled}
          />

          {cohortMastheadModel ? (
            <CohortMasthead theme={theme} isDark={isDark} model={cohortMastheadModel} />
          ) : null}

          <Text style={[styles.sectionLabel, { color: theme.colors.textMuted }]}>PARTICIPANTS</Text>

          {memberIdsOrdered.length === 0 ? (
            <Text style={{ color: theme.colors.textSecondary }}>No members loaded yet.</Text>
          ) : (
            sortedMemberIds.map((memberId) => {
              const label = profileLabels[memberId];
              const habit = habitForMember(memberId);
              const nameOnCard = participantDisplayName(label);

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
                    <Text style={[styles.participantName, { color: theme.colors.textPrimary }]} numberOfLines={2}>
                      {nameOnCard}
                    </Text>
                    {habit ? (
                      <CohortStreakPill streak={habit.streak} isDark={isDark} />
                    ) : (
                      <Text style={[styles.streakPlaceholder, { color: theme.colors.textMuted }]}>-</Text>
                    )}
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
                      customNoteAlreadySent={customNoteSentToUserIds.has(memberId)}
                      onCustomNotePress={() => onOpenCustomNote(memberId)}
                    />
                  ) : null}
                </View>
              );
            })
          )}
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
  metaLine: { fontSize: 13, fontWeight: "600", marginBottom: 12 },
  plusGateRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14 },
  plusGateText: { fontSize: 12, fontWeight: "700" },
  missionDescription: {
    fontSize: 15,
    lineHeight: 24,
    fontStyle: "italic",
    letterSpacing: 0.2,
    marginBottom: 22,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
    marginBottom: 12,
  },
  participantCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    marginBottom: 14,
  },
  participantHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 6,
  },
  participantName: {
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: -0.2,
    flex: 1,
    minWidth: 0,
  },
  streakPlaceholder: { fontSize: 13, fontWeight: "700" },
  noSyncHint: { fontSize: 12, lineHeight: 17, fontStyle: "italic", marginTop: 4 },
});
