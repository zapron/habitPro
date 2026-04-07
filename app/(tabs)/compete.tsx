import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Medal, Swords, Trophy, Clock, X } from "lucide-react-native";
import { Screen } from "../../src/components/Screen";
import { useTheme } from "../../src/context/ThemeContext";
import { useHabitStore } from "../../src/store/habitStore";
import { useChallengeStore } from "../../src/store/challengeStore";
import { CHALLENGE_TEMPLATES, getChallengeTemplate } from "../../src/constants/challengeTemplates";
import { computeChallengeProgress } from "../../src/utils/challengeProgress";
import {
  weeklyCompeteScore,
  weeklyTierLabel,
  countDistinctHabitDaysThisWeek,
  countMiniCompletionsThisWeek,
} from "../../src/utils/weekStats";
import { inviteeHabitStartIsoFromGroupStartDate } from "../../src/utils/challengeInviteeStart";
import type { ChallengeEnrollment } from "../../src/types/challenge";
import type { Habit, MiniMission } from "../../src/types/habit";
import type { ChallengeInviteRow } from "../../src/types/groupChallenge";
import { useAuth } from "../../src/context/AuthContext";
import { isSupabaseConfigured } from "../../src/lib/env";
import {
  acceptInviteAndJoin,
  declineInvite,
  getChallengeGroup,
  listInvitesForMe,
  refreshCohortPeerHabits,
} from "../../src/lib/groupChallengesApi";
import { subscribeSyncSuccess } from "../../src/lib/syncQueue";

type CompeteSegment = "leaderboard" | "challenges";

function formatEndsIn(endsAtMs: number): string {
  const ms = endsAtMs - Date.now();
  if (ms <= 0) return "Ends today";
  const d = Math.ceil(ms / (24 * 60 * 60 * 1000));
  return d === 1 ? "1 day left" : `${d} days left`;
}

function ActiveChallengeCard({
  enrollment,
  habits,
  miniMissions,
  theme,
  isDark,
  onAbandon,
}: {
  enrollment: ChallengeEnrollment;
  habits: Habit[];
  miniMissions: MiniMission[];
  theme: ReturnType<typeof useTheme>["theme"];
  isDark: boolean;
  onAbandon: (id: string) => void;
}) {
  const template = getChallengeTemplate(enrollment.templateId);
  if (!template) return null;

  const progress = computeChallengeProgress(template, enrollment.startedAt, habits, miniMissions);
  const pct = Math.round(progress.ratio * 100);

  const progressLabel =
    template.metric === "min_streak"
      ? progress.done
        ? "Streak goal met"
        : "Reach 3+ day streak on any habit"
      : `${Math.min(progress.current, template.target)} / ${template.target}`;

  return (
    <View
      style={[
        styles.activeCard,
        { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, ...theme.shadow.card },
      ]}
    >
      <View style={styles.activeCardTop}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.activeTitle, { color: theme.colors.textPrimary }]}>{template.title}</Text>
          <Text style={[styles.activeSub, { color: theme.colors.textSecondary }]}>{template.goalLine}</Text>
        </View>
        <TouchableOpacity
          onPress={() =>
            Alert.alert("Leave challenge?", "Progress for this run will be lost.", [
              { text: "Cancel", style: "cancel" },
              { text: "Leave", style: "destructive", onPress: () => onAbandon(enrollment.id) },
            ])
          }
          hitSlop={10}
          style={[styles.abandonBtn, { borderColor: theme.colors.border }]}
        >
          <X size={18} color={theme.colors.textMuted} />
        </TouchableOpacity>
      </View>

      <View style={[styles.track, { backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)" }]}>
        <View
          style={[styles.fill, { width: `${pct}%`, backgroundColor: theme.colors.indigo[500] }]}
        />
      </View>

      <View style={styles.activeMeta}>
        <View style={styles.metaRow}>
          <Clock size={14} color={theme.colors.textMuted} />
          <Text style={[styles.metaText, { color: theme.colors.textMuted }]}>{formatEndsIn(progress.endsAtMs)}</Text>
        </View>
        <Text style={[styles.progressText, { color: theme.colors.cyan[400] }]}>{progressLabel}</Text>
      </View>
    </View>
  );
}

export default function CompeteScreen() {
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ inviteId?: string; challengeId?: string; focusInvites?: string }>();
  const { session } = useAuth();
  const [segment, setSegment] = useState<CompeteSegment>("challenges");
  const [groupInvites, setGroupInvites] = useState<ChallengeInviteRow[]>([]);
  const [inviteTitles, setInviteTitles] = useState<Record<string, string>>({});
  const [inviteBusy, setInviteBusy] = useState<string | null>(null);
  const [highlightInviteId, setHighlightInviteId] = useState<string | null>(null);
  const [highlightChallengeId, setHighlightChallengeId] = useState<string | null>(null);
  const deepLinkHandledRef = useRef(false);

  const xp = useHabitStore((s) => s.xp);
  const habits = useHabitStore((s) => s.habits);
  const miniMissions = useHabitStore((s) => s.miniMissions);
  const addHabit = useHabitStore((s) => s.addHabit);

  const enrollments = useChallengeStore((s) => s.enrollments);
  const completed = useChallengeStore((s) => s.completed);
  const enroll = useChallengeStore((s) => s.enroll);
  const abandon = useChallengeStore((s) => s.abandon);
  const reconcile = useChallengeStore((s) => s.reconcile);

  useEffect(() => {
    reconcile(habits, miniMissions);
  }, [habits, miniMissions, reconcile]);

  const loadInvites = useCallback(async () => {
    if (!isSupabaseConfigured() || !session?.user) {
      setGroupInvites([]);
      setInviteTitles({});
      return;
    }
    try {
      const rows = await listInvitesForMe();
      setGroupInvites(rows);
      const titles: Record<string, string> = {};
      await Promise.all(
        rows.map(async (inv) => {
          const g = await getChallengeGroup(inv.challenge_id);
          if (g) titles[inv.id] = g.title;
        }),
      );
      setInviteTitles(titles);
    } catch (e: unknown) {
      console.warn("[habitPro] loadInvites", e);
    }
  }, [session?.user]);

  useFocusEffect(
    useCallback(() => {
      void loadInvites();
    }, [loadInvites]),
  );

  useEffect(() => {
    const inviteId = typeof params.inviteId === "string" ? params.inviteId.trim() : "";
    const challengeId = typeof params.challengeId === "string" ? params.challengeId.trim() : "";
    const focus = params.focusInvites === "1" || params.focusInvites === "true";
    if (!inviteId && !challengeId && !focus) {
      deepLinkHandledRef.current = false;
      return;
    }
    if (deepLinkHandledRef.current) return;
    deepLinkHandledRef.current = true;

    if (focus || inviteId || challengeId) {
      setSegment("challenges");
    }
    if (inviteId) {
      setHighlightInviteId(inviteId);
      setHighlightChallengeId(null);
    } else if (challengeId) {
      setHighlightInviteId(null);
      setHighlightChallengeId(challengeId);
    }

    router.setParams({ inviteId: undefined, challengeId: undefined, focusInvites: undefined });
  }, [params.inviteId, params.challengeId, params.focusInvites, router]);

  useEffect(() => {
    if (!highlightInviteId && !highlightChallengeId) return;
    const t = setTimeout(() => {
      setHighlightInviteId(null);
      setHighlightChallengeId(null);
    }, 6000);
    return () => clearTimeout(t);
  }, [highlightInviteId, highlightChallengeId]);

  const handleAcceptGroupInvite = async (invite: ChallengeInviteRow) => {
    setInviteBusy(invite.id);
    try {
      const group = await getChallengeGroup(invite.challenge_id);
      if (!group) {
        Alert.alert("Error", "Group mission not found.");
        return;
      }
      const tpl = group.habit_template as Record<string, unknown>;
      const title = typeof tpl.title === "string" ? tpl.title : "Group mission";
      const mode = tpl.mode === "manual" ? "manual" : "autopilot";
      const totalDays = typeof tpl.totalDays === "number" ? tpl.totalDays : 21;
      const description = typeof tpl.description === "string" ? tpl.description : undefined;
      const startIso = inviteeHabitStartIsoFromGroupStartDate(group.start_date);

      let newHabitId = "";
      const unsub = subscribeSyncSuccess(() => {
        unsub();
        void acceptInviteAndJoin(invite, newHabitId).then(({ error }) => {
          if (error) {
            Alert.alert("Could not join", error.message);
            return;
          }
          void refreshCohortPeerHabits();
          void loadInvites();
        });
      });
      newHabitId = addHabit({
        title,
        description,
        mode,
        totalDays: mode === "manual" ? totalDays : undefined,
        challengeGroupId: group.id,
        challengeCreatorTimezone: group.creator_timezone,
        startDate: startIso,
      });
    } finally {
      setInviteBusy(null);
    }
  };

  const handleDeclineGroupInvite = async (invite: ChallengeInviteRow) => {
    setInviteBusy(invite.id);
    try {
      const { error } = await declineInvite(invite.id);
      if (error) {
        Alert.alert("Could not decline", error.message);
        return;
      }
      void loadInvites();
    } finally {
      setInviteBusy(null);
    }
  };

  const level = Math.floor(xp / 100);
  const completedMissions = useMemo(
    () => habits.filter((h) => h.isCompleted).length + miniMissions.filter((m) => m.status === "completed").length,
    [habits, miniMissions],
  );

  const bottomPad = Math.max(insets.bottom, 16) + 8;

  const weeklyScore = useMemo(
    () => weeklyCompeteScore(habits, miniMissions, level),
    [habits, miniMissions, level],
  );
  const tier = useMemo(() => weeklyTierLabel(weeklyScore), [weeklyScore]);
  const habitDaysWeek = useMemo(() => countDistinctHabitDaysThisWeek(habits), [habits]);
  const minisWeek = useMemo(() => countMiniCompletionsThisWeek(miniMissions), [miniMissions]);

  const activeIds = new Set(enrollments.map((e) => e.templateId));
  const catalog = useMemo(
    () => CHALLENGE_TEMPLATES.filter((t) => !activeIds.has(t.id)),
    [activeIds],
  );

  const handleJoin = (templateId: (typeof CHALLENGE_TEMPLATES)[number]["id"]) => {
    const r = enroll(templateId);
    if (r.ok === false) {
      Alert.alert("Can't join", r.reason);
    }
  };

  return (
    <Screen>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={theme.colors.background} />

      <Text style={[styles.title, { color: theme.colors.textPrimary, fontSize: theme.typography.h1 }]}>Compete</Text>
      <Text style={[styles.subtitle, { color: theme.colors.textSecondary, fontSize: theme.typography.caption }]}>
        Weekly tiers and time-boxed challenges — all local for now; online leaderboards later.
      </Text>

      <View
        style={[
          styles.segmentWrap,
          { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
        ]}
      >
        <TouchableOpacity
          style={[
            styles.segment,
            segment === "challenges" && [
              styles.segmentActive,
              { backgroundColor: theme.colors.indigo[600], ...theme.shadow.glow },
            ],
          ]}
          onPress={() => setSegment("challenges")}
          activeOpacity={0.85}
        >
          <Swords size={16} color={segment === "challenges" ? theme.colors.white : theme.colors.textMuted} />
          <Text
            style={[
              styles.segmentLabel,
              { color: segment === "challenges" ? theme.colors.white : theme.colors.textSecondary },
            ]}
          >
            Challenges
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.segment,
            segment === "leaderboard" && [
              styles.segmentActive,
              { backgroundColor: theme.colors.indigo[600], ...theme.shadow.glow },
            ],
          ]}
          onPress={() => setSegment("leaderboard")}
          activeOpacity={0.85}
        >
          <Medal size={16} color={segment === "leaderboard" ? theme.colors.white : theme.colors.textMuted} />
          <Text
            style={[
              styles.segmentLabel,
              { color: segment === "leaderboard" ? theme.colors.white : theme.colors.textSecondary },
            ]}
          >
            Leaderboard
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: bottomPad }}
        keyboardShouldPersistTaps="handled"
      >
        {groupInvites.length > 0 ? (
          <>
            <Text style={[styles.sectionLabel, { color: theme.colors.textMuted }]}>GROUP MISSION INVITES</Text>
            {groupInvites.map((inv) => {
              const pending = inv.status === "pending";
              const highlighted =
                (highlightInviteId !== null && highlightInviteId === inv.id) ||
                (highlightChallengeId !== null && highlightChallengeId === inv.challenge_id);
              return (
                <View
                  key={inv.id}
                  style={[
                    styles.card,
                    {
                      backgroundColor: theme.colors.surface,
                      borderColor: highlighted ? theme.colors.indigo[400] : theme.colors.border,
                      borderWidth: highlighted ? 2 : 1,
                      ...theme.shadow.card,
                    },
                  ]}
                >
                  <Text style={[styles.cardTitle, { color: theme.colors.textPrimary }]}>
                    {inviteTitles[inv.id] ?? "Group mission"}
                  </Text>
                  {pending ? (
                    <>
                      <Text style={[styles.inviteHint, { color: theme.colors.textSecondary }]}>
                        Accept to add a matching mission and join the cohort.
                      </Text>
                      <View style={styles.inviteActions}>
                        <TouchableOpacity
                          style={[styles.declineBtn, { borderColor: theme.colors.border }]}
                          onPress={() => void handleDeclineGroupInvite(inv)}
                          disabled={inviteBusy === inv.id}
                        >
                          <Text style={{ color: theme.colors.textMuted, fontWeight: "700" }}>Decline</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.acceptBtn, { backgroundColor: theme.colors.indigo[600], ...theme.shadow.glow }]}
                          onPress={() => void handleAcceptGroupInvite(inv)}
                          disabled={inviteBusy === inv.id}
                        >
                          {inviteBusy === inv.id ? (
                            <ActivityIndicator color={theme.colors.white} />
                          ) : (
                            <Text style={styles.acceptBtnText}>Accept</Text>
                          )}
                        </TouchableOpacity>
                      </View>
                    </>
                  ) : (
                    <Text
                      style={[
                        styles.inviteResolvedHint,
                        { color: inv.status === "accepted" ? theme.colors.cyan[400] : theme.colors.textMuted },
                      ]}
                    >
                      {inv.status === "accepted"
                        ? "Accepted — you’re in this cohort."
                        : "Declined — this invite stays here for your records."}
                    </Text>
                  )}
                </View>
              );
            })}
          </>
        ) : null}

        {segment === "leaderboard" ? (
          <>
            <View>
              <Text style={[styles.sectionLabel, { color: theme.colors.textMuted }]}>THIS WEEK</Text>
              <View
                style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, ...theme.shadow.card }]}
              >
                <View style={styles.tierRow}>
                  <Trophy size={28} color={theme.colors.amber[500]} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.tierTitle, { color: theme.colors.textPrimary }]}>{tier.label} tier</Text>
                    <Text style={[styles.tierDetail, { color: theme.colors.textSecondary }]}>{tier.detail}</Text>
                  </View>
                  <Text style={[styles.scorePill, { color: theme.colors.indigo[400], borderColor: theme.colors.border }]}>
                    {weeklyScore} pts
                  </Text>
                </View>
                <Text style={[styles.scoreHint, { color: theme.colors.textMuted }]}>
                  Score blends habit days, mini completions, and level — for solo motivation until global ranks ship.
                </Text>
              </View>
            </View>

            <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, ...theme.shadow.card }]}>
              <Text style={[styles.cardTitle, { color: theme.colors.textPrimary }]}>Your stats</Text>
              <View style={[styles.statRow, { borderTopColor: theme.colors.border }]}>
                <Text style={[styles.statLabel, { color: theme.colors.textMuted }]}>Level</Text>
                <Text style={[styles.statValue, { color: theme.colors.yellow[400] }]}>{level}</Text>
              </View>
              <View style={[styles.statRow, { borderTopColor: theme.colors.border }]}>
                <Text style={[styles.statLabel, { color: theme.colors.textMuted }]}>Total XP</Text>
                <Text style={[styles.statValue, { color: theme.colors.indigo[400] }]}>{xp}</Text>
              </View>
              <View style={[styles.statRow, { borderTopColor: theme.colors.border }]}>
                <Text style={[styles.statLabel, { color: theme.colors.textMuted }]}>Missions completed</Text>
                <Text style={[styles.statValue, { color: theme.colors.cyan[400] }]}>{completedMissions}</Text>
              </View>
              <View style={[styles.statRow, { borderTopColor: theme.colors.border }]}>
                <Text style={[styles.statLabel, { color: theme.colors.textMuted }]}>Habit days this week</Text>
                <Text style={[styles.statValue, { color: theme.colors.cyan[400] }]}>{habitDaysWeek}</Text>
              </View>
              <View style={[styles.statRow, { borderTopColor: theme.colors.border }]}>
                <Text style={[styles.statLabel, { color: theme.colors.textMuted }]}>Minis finished this week</Text>
                <Text style={[styles.statValue, { color: theme.colors.amber[500] }]}>{minisWeek}</Text>
              </View>
            </View>

            <Text style={[styles.roadmap, { color: theme.colors.textMuted }]}>
              Next: global leaderboards (Supabase), friend duels, and shared group mission invites.
            </Text>
          </>
        ) : (
          <>
            <Text style={[styles.sectionLabel, { color: theme.colors.textMuted }]}>ACTIVE</Text>
            {enrollments.length === 0 ? (
              <View
                style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, ...theme.shadow.card }]}
              >
                <Text style={[styles.emptyTitle, { color: theme.colors.textPrimary }]}>No active challenges</Text>
                <Text style={[styles.emptyBody, { color: theme.colors.textSecondary }]}>
                  Pick a challenge below — up to two at a time. Progress uses your habit + mini mission data on this device.
                </Text>
              </View>
            ) : (
              enrollments.map((e) => (
                <ActiveChallengeCard
                  key={e.id}
                  enrollment={e}
                  habits={habits}
                  miniMissions={miniMissions}
                  theme={theme}
                  isDark={isDark}
                  onAbandon={abandon}
                />
              ))
            )}

            <Text style={[styles.sectionLabel, { color: theme.colors.textMuted, marginTop: 14 }]}>BROWSE</Text>
            {catalog.map((t) => (
              <TouchableOpacity
                key={t.id}
                style={[styles.catalogCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
                onPress={() => handleJoin(t.id)}
                activeOpacity={0.88}
              >
                <Text style={[styles.catalogTitle, { color: theme.colors.textPrimary }]}>{t.title}</Text>
                <Text style={[styles.catalogSub, { color: theme.colors.textSecondary }]}>{t.subtitle}</Text>
                <Text style={[styles.catalogGoal, { color: theme.colors.textMuted }]}>{t.goalLine}</Text>
                <Text style={[styles.catalogMeta, { color: theme.colors.textMuted }]}>
                  {t.durationDays} days · {t.target} {t.metric === "min_streak" ? "goal" : "target"}
                </Text>
                <View style={[styles.joinCta, { backgroundColor: theme.colors.indigo[600], ...theme.shadow.glow }]}>
                  <Text style={styles.joinCtaText}>Join</Text>
                </View>
              </TouchableOpacity>
            ))}

            {completed.length > 0 ? (
              <>
                <Text style={[styles.sectionLabel, { color: theme.colors.textMuted, marginTop: 14 }]}>RECENT WINS</Text>
                <View
                  style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, ...theme.shadow.card }]}
                >
                  {completed.slice(0, 6).map((c, i) => {
                    const tpl = getChallengeTemplate(c.templateId);
                    const d = new Date(c.completedAt);
                    return (
                      <View
                        key={`${c.templateId}-${c.completedAt}-${i}`}
                        style={[styles.winRow, i > 0 && { borderTopColor: theme.colors.border, borderTopWidth: StyleSheet.hairlineWidth }]}
                      >
                        <Medal size={16} color={theme.colors.amber[500]} />
                        <Text style={[styles.winTitle, { color: theme.colors.textPrimary }]}>{tpl?.title ?? c.templateId}</Text>
                        <Text style={[styles.winDate, { color: theme.colors.textMuted }]}>
                          {d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </>
            ) : null}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontWeight: "800", marginBottom: 6 },
  subtitle: { marginBottom: 18, lineHeight: 18 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
    marginBottom: 10,
  },
  segmentWrap: {
    flexDirection: "row",
    borderRadius: 14,
    padding: 4,
    marginBottom: 18,
    borderWidth: 1,
    gap: 4,
  },
  segment: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
  },
  segmentActive: {},
  segmentLabel: { fontWeight: "700", fontSize: 13 },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
    marginBottom: 14,
  },
  cardTitle: { fontWeight: "800", fontSize: 17, marginBottom: 10 },
  statRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  statLabel: { fontSize: 14, fontWeight: "600" },
  statValue: { fontSize: 16, fontWeight: "800" },
  tierRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 10 },
  tierTitle: { fontSize: 20, fontWeight: "900" },
  tierDetail: { fontSize: 13, marginTop: 4, lineHeight: 18 },
  scorePill: {
    fontSize: 13,
    fontWeight: "800",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 9999,
    borderWidth: 1,
    overflow: "hidden",
  },
  scoreHint: { fontSize: 12, lineHeight: 17, fontStyle: "italic" },
  roadmap: { fontSize: 12, lineHeight: 18, marginTop: 4, fontStyle: "italic" },
  activeCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
  },
  activeCardTop: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: 12 },
  activeTitle: { fontSize: 17, fontWeight: "800" },
  activeSub: { fontSize: 13, fontWeight: "500", marginTop: 4, lineHeight: 18 },
  abandonBtn: {
    width: 44,
    height: 44,
    borderRadius: 9999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  track: { height: 8, borderRadius: 4, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 4 },
  activeMeta: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  metaText: { fontSize: 12, fontWeight: "600" },
  progressText: { fontSize: 13, fontWeight: "800" },
  catalogCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
    position: "relative",
    paddingBottom: 52,
  },
  catalogTitle: { fontSize: 17, fontWeight: "800", marginBottom: 4 },
  catalogSub: { fontSize: 13, marginBottom: 8, lineHeight: 18 },
  catalogGoal: { fontSize: 12, lineHeight: 17, marginBottom: 6 },
  catalogMeta: { fontSize: 11, fontWeight: "700", letterSpacing: 0.4 },
  joinCta: {
    position: "absolute",
    right: 14,
    bottom: 14,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 9999,
  },
  joinCtaText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  emptyTitle: { fontWeight: "800", fontSize: 16, marginBottom: 8 },
  emptyBody: { lineHeight: 20, fontSize: 14 },
  winRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  winTitle: { flex: 1, fontWeight: "700", fontSize: 15 },
  winDate: { fontSize: 12, fontWeight: "600" },
  inviteHint: { fontSize: 13, lineHeight: 18, marginBottom: 14 },
  inviteResolvedHint: { fontSize: 13, lineHeight: 18, fontWeight: "600" },
  inviteActions: { flexDirection: "row", gap: 10, alignItems: "center" },
  declineBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  acceptBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 12,
    minHeight: 44,
  },
  acceptBtnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
});
