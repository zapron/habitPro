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
  StyleSheet,
  StatusBar,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ChevronRight, Eye, Medal, Swords, Trophy, Clock, X } from "lucide-react-native";
import { Screen } from "../../src/components/Screen";
import { ConfirmDialog } from "../../src/components/ConfirmDialog";
import { useTheme } from "../../src/context/ThemeContext";
import { useToast } from "../../src/context/ToastContext";
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
import type { ChallengeGroupRow, ChallengeInviteRow } from "../../src/types/groupChallenge";
import { useAuth } from "../../src/context/AuthContext";
import { usePremium } from "../../src/context/PremiumContext";
import { usePlusUpsell } from "../../src/context/PlusUpsellContext";
import { useNotificationGate } from "../../src/context/NotificationGateContext";
import { isSupabaseConfigured } from "../../src/lib/env";
import {
  acceptInviteAndJoin,
  declineInvite,
  getChallengeGroup,
  listInvitesForMe,
  refreshCohortPeerHabits,
} from "../../src/lib/groupChallengesApi";
import { subscribeSyncSuccess } from "../../src/lib/syncQueue";
import { PlusBadge } from "../../src/components/PlusBadge";

const INVITE_ACCEPT_TIMEOUT_MS = 45_000;

type CompeteSegment = "leaderboard" | "challenges";

/** Sub-tabs when main segment is Challenges */
type ChallengesSubTab = "missions" | "invites";

type InviteCardMeta = {
  challengeName: string;
  pillLabel: string;
  description?: string;
};

function parseInviteCardMeta(g: ChallengeGroupRow): InviteCardMeta {
  const tpl = g.habit_template as Record<string, unknown>;
  const habitTitle = typeof tpl.title === "string" ? tpl.title.trim() : "";
  const description =
    typeof tpl.description === "string" && tpl.description.trim().length > 0
      ? tpl.description.trim()
      : undefined;

  let challengeName = habitTitle;
  if (!challengeName) {
    const raw = g.title.trim();
    const parts = raw.split(/\s*[—–]\s/).map((p) => p.trim()).filter(Boolean);
    challengeName = parts.length >= 1 ? parts[0] : raw;
  }
  if (!challengeName) challengeName = "Group mission";

  return { challengeName, pillLabel: "Group", description };
}

function InviteMissionHeader({
  meta,
  theme,
  isDark,
  onPress,
}: {
  meta: InviteCardMeta | undefined;
  theme: ReturnType<typeof useTheme>["theme"];
  isDark: boolean;
  onPress?: () => void;
}) {
  const name = meta?.challengeName ?? "Group mission";
  const pill = meta?.pillLabel ?? "Group";
  const header = (
    <>
      <View style={styles.inviteTitleRow}>
        <Text style={[styles.inviteChallengeName, { color: theme.colors.textPrimary }]} numberOfLines={2}>
          {name}
        </Text>
        <View
          style={[
            styles.inviteKindPill,
            {
              backgroundColor: isDark ? "rgba(99, 102, 241, 0.18)" : "rgba(79, 70, 229, 0.1)",
              borderColor: isDark ? "rgba(129, 140, 248, 0.45)" : "rgba(79, 70, 229, 0.28)",
            },
          ]}
        >
          <Text style={[styles.inviteKindPillText, { color: theme.colors.indigo[400] }]}>{pill}</Text>
        </View>
      </View>
      {meta?.description ? (
        <Text
          style={[
            styles.inviteMissionDesc,
            {
              color: theme.colors.textSecondary,
              fontFamily: Platform.select({ ios: "Georgia", android: "serif", default: undefined }),
            },
          ]}
          numberOfLines={2}
        >
          {meta.description}
        </Text>
      ) : null}
    </>
  );

  if (!onPress) return header;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.9}
      accessibilityRole="button"
      accessibilityLabel={`Open mission: ${name}`}
    >
      {header}
    </TouchableOpacity>
  );
}

function InviteStatusPill({
  variant,
  label,
  theme,
}: {
  variant: "pending" | "accepted" | "declined";
  label: string;
  theme: ReturnType<typeof useTheme>["theme"];
}) {
  const cfg =
    variant === "accepted"
      ? {
          bg: "rgba(34, 197, 94, 0.14)",
          border: "rgba(34, 197, 94, 0.45)",
          text: theme.colors.green[500],
        }
      : variant === "declined"
        ? {
            bg: "rgba(239, 68, 68, 0.12)",
            border: "rgba(239, 68, 68, 0.45)",
            text: theme.colors.red[500],
          }
        : {
            bg: "rgba(245, 158, 11, 0.14)",
            border: "rgba(245, 158, 11, 0.45)",
            text: theme.colors.amber[500],
          };
  return (
    <View style={[styles.inviteStatusPill, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
      <Text style={[styles.inviteStatusPillText, { color: cfg.text }]}>{label}</Text>
    </View>
  );
}

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
  onRequestAbandon,
}: {
  enrollment: ChallengeEnrollment;
  habits: Habit[];
  miniMissions: MiniMission[];
  theme: ReturnType<typeof useTheme>["theme"];
  isDark: boolean;
  onRequestAbandon: () => void;
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
        <TouchableOpacity onPress={onRequestAbandon} hitSlop={10} style={[styles.abandonBtn, { borderColor: theme.colors.border }]}>
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
  const { showToast } = useToast();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{
    inviteId?: string;
    challengeId?: string;
    focusInvites?: string;
  }>();
  const { session } = useAuth();
  const { isPremium, loading: premiumLoading } = usePremium();
  const { openUpsell } = usePlusUpsell();
  const { suggestNotifications } = useNotificationGate();
  /** True while we do not know premium yet — do not run accept API or open paywall. */
  const inviteAcceptPremiumUnknown = premiumLoading;
  /** Non-premium users see Accept → paywall instead of API (avoids RLS errors on accept). */
  const inviteNeedsCommunityForAccept = !isPremium && !premiumLoading;
  const [segment, setSegment] = useState<CompeteSegment>("challenges");
  const [challengesSubTab, setChallengesSubTab] = useState<ChallengesSubTab>("missions");
  const [groupInvites, setGroupInvites] = useState<ChallengeInviteRow[]>([]);
  const [inviteCardMeta, setInviteCardMeta] = useState<Record<string, InviteCardMeta>>({});
  const [inviteBusy, setInviteBusy] = useState<string | null>(null);
  const [leaveEnrollmentId, setLeaveEnrollmentId] = useState<string | null>(null);
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
      setInviteCardMeta({});
      return;
    }
    try {
      const rows = await listInvitesForMe();
      setGroupInvites(rows);
      const meta: Record<string, InviteCardMeta> = {};
      await Promise.all(
        rows.map(async (inv) => {
          const g = await getChallengeGroup(inv.challenge_id);
          if (g) meta[inv.id] = parseInviteCardMeta(g);
        }),
      );
      setInviteCardMeta(meta);
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
      setChallengesSubTab("invites");
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
    if (inviteAcceptPremiumUnknown) return;
    if (inviteNeedsCommunityForAccept) {
      openUpsell("invite_accept");
      return;
    }
    setInviteBusy(invite.id);
    try {
      const group = await getChallengeGroup(invite.challenge_id);
      if (!group) {
        showToast("Group mission not found.", "error");
        return;
      }
      const tpl = group.habit_template as Record<string, unknown>;
      const title = typeof tpl.title === "string" ? tpl.title : "Group mission";
      const mode = tpl.mode === "manual" ? "manual" : "autopilot";
      const totalDays = typeof tpl.totalDays === "number" ? tpl.totalDays : 21;
      const description = typeof tpl.description === "string" ? tpl.description : undefined;
      const tplEnd =
        typeof tpl.endDate === "string" && tpl.endDate.trim().length > 0 ? tpl.endDate.trim() : undefined;
      const startIso = inviteeHabitStartIsoFromGroupStartDate(group.start_date);

      let newHabitId = "";
      await new Promise<void>((resolve, reject) => {
        let unsub: (() => void) | undefined;
        const timeoutId = setTimeout(() => {
          unsub?.();
          reject(new Error("Couldn’t sync in time. Check your connection and try again."));
        }, INVITE_ACCEPT_TIMEOUT_MS);

        const finish = (err?: unknown) => {
          clearTimeout(timeoutId);
          if (err) reject(err);
          else resolve();
        };

        newHabitId = addHabit({
          title,
          description,
          mode,
          totalDays: mode === "manual" ? totalDays : undefined,
          challengeGroupId: group.id,
          challengeCreatorTimezone: group.creator_timezone,
          startDate: startIso,
          endDate: mode === "manual" ? tplEnd : undefined,
        });

        unsub = subscribeSyncSuccess(() => {
          unsub?.();
          unsub = undefined;
          void acceptInviteAndJoin(invite, newHabitId)
            .then(({ error }) => {
              if (error) {
                finish(error);
                return;
              }
              useHabitStore.getState().synchronizeHabitWithChallengeGroup(newHabitId, group);
              void refreshCohortPeerHabits();
              void loadInvites();
              showToast("Joined the group mission", "success");
              setTimeout(() => {
                void suggestNotifications("invite_accept");
              }, 450);
              finish();
            })
            .catch(finish);
        });
      });
    } catch (e: unknown) {
      const msg =
        e instanceof Error
          ? e.message
          : typeof e === "object" && e && "message" in e
            ? String((e as { message: string }).message)
            : String(e);
      showToast(msg, "error");
    } finally {
      setInviteBusy(null);
    }
  };

  const handleDeclineGroupInvite = async (invite: ChallengeInviteRow) => {
    setInviteBusy(invite.id);
    try {
      const { error } = await declineInvite(invite.id);
      if (error) {
        showToast(error.message, "error");
        return;
      }
      showToast("Invite declined", "success");
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

  /** Map group challenge id → local habit id (accepted group missions). */
  const habitIdByChallengeId = useMemo(() => {
    const m = new Map<string, string>();
    for (const h of habits) {
      if (h.challengeGroupId) {
        m.set(h.challengeGroupId, h.id);
      }
    }
    return m;
  }, [habits]);

  const pendingInviteCount = useMemo(
    () => groupInvites.filter((i) => i.status === "pending").length,
    [groupInvites],
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
      showToast(r.reason, "error");
    } else {
      showToast("Challenge joined", "success");
    }
  };

  return (
    <Screen>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={theme.colors.background} />

      <Text
        style={[
          styles.title,
          {
            color: theme.colors.textPrimary,
            fontSize: theme.typography.h1,
            letterSpacing: theme.letterSpacing.tight,
          },
        ]}
      >
        Compete
      </Text>
      <Text style={[styles.subtitle, { color: theme.colors.textSecondary, fontSize: theme.typography.caption }]}>
        Weekly tiers and time-boxed challenges.
      </Text>

      <View
        style={[
          styles.segmentWrap,
          { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
          { marginBottom: segment === "challenges" ? 8 : 18 },
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

      {segment === "challenges" ? (
        <View style={styles.challengesSubOuter}>
          <TouchableOpacity
            style={[
              styles.challengesSubPill,
              challengesSubTab === "missions" && {
                backgroundColor: isDark ? "rgba(99, 102, 241, 0.2)" : "rgba(79, 70, 229, 0.12)",
              },
            ]}
            onPress={() => setChallengesSubTab("missions")}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Weeklies"
          >
            <Text
              style={[
                styles.challengesSubText,
                {
                  color:
                    challengesSubTab === "missions" ? theme.colors.indigo[400] : theme.colors.textSecondary,
                },
              ]}
            >
              Weeklies
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.challengesSubPill,
              challengesSubTab === "invites" && {
                backgroundColor: isDark ? "rgba(99, 102, 241, 0.2)" : "rgba(79, 70, 229, 0.12)",
              },
            ]}
            onPress={() => setChallengesSubTab("invites")}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={`Group invites, ${pendingInviteCount} pending`}
          >
            <View style={styles.invitesLabelRow}>
              <Text
                style={[
                  styles.challengesSubText,
                  {
                    color:
                      challengesSubTab === "invites" ? theme.colors.indigo[400] : theme.colors.textSecondary,
                  },
                ]}
              >
                Invites ({pendingInviteCount})
              </Text>
              {!isPremium ? <PlusBadge withFlame /> : null}
            </View>
          </TouchableOpacity>
        </View>
      ) : null}

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: bottomPad }}
        keyboardShouldPersistTaps="handled"
      >
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
          </>
        ) : challengesSubTab === "invites" ? (
          <>
            <Text style={[styles.sectionLabel, { color: theme.colors.textMuted }]}>GROUP MISSION INVITES</Text>
            {groupInvites.length === 0 ? (
              <View
                style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, ...theme.shadow.card }]}
              >
                <Text style={[styles.emptyTitle, { color: theme.colors.textPrimary }]}>No invites yet</Text>
                <Text style={[styles.emptyBody, { color: theme.colors.textSecondary }]}>
                  When someone invites you to a group mission, it will show up here. You can still use Weeklies for solo
                  time-boxed challenges.
                </Text>
              </View>
            ) : (
              groupInvites.map((inv) => {
                const pending = inv.status === "pending";
                const meta = inviteCardMeta[inv.id];
                const missionTitle = meta?.challengeName ?? "Group mission";
                const linkedHabitId =
                  inv.status === "accepted" ? habitIdByChallengeId.get(inv.challenge_id) : undefined;
                const canOpenMission = Boolean(linkedHabitId);
                const highlighted =
                  (highlightInviteId !== null && highlightInviteId === inv.id) ||
                  (highlightChallengeId !== null && highlightChallengeId === inv.challenge_id);

                const cardStyle = [
                  styles.card,
                  {
                    backgroundColor: theme.colors.surface,
                    borderColor: highlighted ? theme.colors.indigo[400] : theme.colors.border,
                    borderWidth: highlighted ? 2 : 1,
                    ...theme.shadow.card,
                  },
                ];

                const groupStreaksButton = (
                  <TouchableOpacity
                    style={[
                      styles.inviteGroupStreaksBtn,
                      {
                        backgroundColor: isDark ? "rgba(99, 102, 241, 0.16)" : "rgba(79, 70, 229, 0.1)",
                        borderColor: isDark ? "rgba(129, 140, 248, 0.35)" : "rgba(79, 70, 229, 0.28)",
                      },
                    ]}
                    onPress={() => router.push(`/challenge/${inv.challenge_id}`)}
                    activeOpacity={0.88}
                    accessibilityRole="button"
                    accessibilityLabel={`View group streaks: ${missionTitle}`}
                  >
                    <Eye size={18} color={theme.colors.indigo[400]} />
                    <Text style={[styles.inviteGroupStreaksBtnText, { color: theme.colors.indigo[400] }]}>
                      View Group Streaks
                    </Text>
                  </TouchableOpacity>
                );

                const resolvedBlock = (
                  <>
                    <View style={styles.inviteStatusRow}>
                      <InviteStatusPill
                        variant={inv.status === "accepted" ? "accepted" : "declined"}
                        label={inv.status === "accepted" ? "Accepted" : "Declined"}
                        theme={theme}
                      />
                    </View>
                    {inv.status === "accepted" ? (
                      <Text style={[styles.inviteStatusSubtext, { color: theme.colors.textSecondary }]}>
                        You're part of this group mission.
                      </Text>
                    ) : (
                      <Text style={[styles.inviteStatusSubtext, { color: theme.colors.textMuted }]}>
                        Kept on your list for your records.
                      </Text>
                    )}
                    {inv.status === "accepted" ? groupStreaksButton : null}
                    {inv.status === "accepted" && !canOpenMission ? (
                      <Text style={[styles.inviteSyncHint, { color: theme.colors.textMuted }]}>
                        Open this mission from Home once your device has finished syncing.
                      </Text>
                    ) : null}
                  </>
                );

                if (pending) {
                  return (
                    <View key={inv.id} style={cardStyle}>
                      <InviteMissionHeader meta={meta} theme={theme} isDark={isDark} />
                      <View style={styles.inviteStatusRow}>
                        <InviteStatusPill variant="pending" label="Pending" theme={theme} />
                      </View>
                      {groupStreaksButton}
                      <Text style={[styles.inviteHint, { color: theme.colors.textSecondary }]}>
                        Accept to add a matching mission and join everyone on this mission.
                      </Text>
                      {inviteNeedsCommunityForAccept ? (
                        <Text style={[styles.invitePlusHint, { color: theme.colors.textMuted }]}>
                          Group missions need Community. Tap Accept to start your trial or subscribe.
                        </Text>
                      ) : null}
                      <View style={styles.inviteActions}>
                        <TouchableOpacity
                          style={[styles.declineBtn, { borderColor: theme.colors.border }]}
                          onPress={() => void handleDeclineGroupInvite(inv)}
                          disabled={inviteBusy === inv.id}
                        >
                          <Text style={{ color: theme.colors.textMuted, fontWeight: "700" }}>Decline</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[
                            styles.acceptBtn,
                            {
                              backgroundColor: theme.colors.indigo[600],
                              ...theme.shadow.glow,
                            },
                          ]}
                          onPress={() => void handleAcceptGroupInvite(inv)}
                          disabled={inviteAcceptPremiumUnknown || inviteBusy === inv.id}
                        >
                          {inviteBusy === inv.id ? (
                            <ActivityIndicator color={theme.colors.white} />
                          ) : (
                            <Text style={styles.acceptBtnText}>Accept</Text>
                          )}
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                }

                if (inv.status === "accepted" && canOpenMission) {
                  return (
                    <View key={inv.id} style={cardStyle}>
                      <InviteMissionHeader
                        meta={meta}
                        theme={theme}
                        isDark={isDark}
                        onPress={() => router.push(`/habit/${linkedHabitId}`)}
                      />
                      {resolvedBlock}
                    </View>
                  );
                }

                return (
                  <View key={inv.id} style={cardStyle}>
                    <InviteMissionHeader meta={meta} theme={theme} isDark={isDark} />
                    {resolvedBlock}
                  </View>
                );
              })
            )}
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
                  Pick a challenge below. Up to two at a time. Progress uses your habit + mini mission data on this device.
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
                  onRequestAbandon={() => setLeaveEnrollmentId(e.id)}
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

      <ConfirmDialog
        visible={leaveEnrollmentId !== null}
        onRequestClose={() => setLeaveEnrollmentId(null)}
        title="Leave challenge?"
        message="Progress for this run will be lost."
        actions={[
          { label: "Cancel", variant: "secondary", onPress: () => setLeaveEnrollmentId(null) },
          {
            label: "Leave",
            variant: "danger",
            onPress: () => {
              const id = leaveEnrollmentId;
              setLeaveEnrollmentId(null);
              if (id) {
                abandon(id);
                showToast("Left challenge", "success");
              }
            },
          },
        ]}
      />
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
  segmentLabel: { fontWeight: "700", fontSize: 12 },
  /** Secondary row — mirrors tryitfirst-mobile-v2 dashboard selling/buying sub-tabs (rounded pills + brand tint). */
  challengesSubOuter: {
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
    marginBottom: 10,
  },
  invitesLabelRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  challengesSubPill: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  challengesSubText: {
    textAlign: "center",
    fontSize: 12,
    fontWeight: "600",
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
    marginBottom: 14,
  },
  cardTitle: { fontWeight: "800", fontSize: 17, marginBottom: 10 },
  inviteTitleRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 10,
    marginBottom: 4,
  },
  inviteChallengeName: {
    flex: 1,
    minWidth: 140,
    fontSize: 21,
    fontWeight: "800",
    letterSpacing: -0.3,
    lineHeight: 26,
  },
  inviteKindPill: {
    borderRadius: 9999,
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderWidth: 1,
  },
  inviteKindPillText: { fontSize: 11, fontWeight: "800", letterSpacing: 0.4 },
  inviteMissionDesc: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 20,
    fontStyle: "italic",
    letterSpacing: 0.15,
  },
  inviteStatusRow: { marginTop: 12, flexDirection: "row", alignItems: "center" },
  inviteStatusPill: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 9999,
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  inviteStatusPillText: { fontSize: 12, fontWeight: "800", letterSpacing: 0.25 },
  inviteStatusSubtext: { fontSize: 12, lineHeight: 17, marginTop: 8, fontWeight: "500" },
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
  inviteHint: { fontSize: 12, lineHeight: 17, fontWeight: "500", marginTop: 8, marginBottom: 12 },
  invitePlusHint: { fontSize: 11, lineHeight: 16, fontWeight: "600", marginTop: -6, marginBottom: 10, fontStyle: "italic" },
  inviteSyncHint: { fontSize: 11, lineHeight: 16, marginTop: 8, fontStyle: "italic" },
  inviteGroupStreaksBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  inviteGroupStreaksBtnText: { fontSize: 14, fontWeight: "700" },
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
