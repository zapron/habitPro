import { Text } from "../../src/components/AppText";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
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
import { ChevronRight, Crown, Eye, Medal, Radio, RefreshCw, Swords, Trophy, Clock, X, Zap } from "lucide-react-native";
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
  countHabitCheckInsThisWeek,
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
import { useInviteBadge } from "../../src/context/InviteBadgeContext";
import { isSupabaseConfigured } from "../../src/lib/env";
import {
  acceptInviteAndJoin,
  declineInvite,
  getChallengeGroup,
  getChallengeGroupsByIds,
  listInvitesForMe,
  refreshCohortPeerHabits,
} from "../../src/lib/groupChallengesApi";
import { subscribeSyncSuccess } from "../../src/lib/syncQueue";
import { upsertRemoteHabit } from "../../src/lib/sync";
import { traceAsync } from "../../src/lib/perfTrace";
import { PlusBadge } from "../../src/components/PlusBadge";
import { ShimmerBlock } from "../../src/components/ShimmerBlock";
import { useRefreshPremiumAccess } from "../../src/hooks/useRefreshPremiumAccess";
import { LevelXpRing } from "../../src/components/LevelXpRing";
import { CommunityPlayerDrawer, type CommunityPlayerDrawerSeed } from "../../src/components/CommunityPlayerDrawer";
import {
  fetchWeeklyLeaderboard,
  type WeeklyLeaderboardEntry,
} from "../../src/lib/weeklyLeaderboardApi";
import {
  declineLiveMiniInvite,
  formatLiveMiniElapsed,
  listLiveMiniInvitesForMe,
  type LiveMiniInviteForMe,
} from "../../src/lib/liveMiniMissionsApi";
import { levelFromTotalXp, xpInCurrentLevel } from "../../src/utils/xpLevel";

const WEEKLY_RANK_PAGE_SIZE = 20;
const COMPETE_AUTO_RELOAD_COOLDOWN_MS = 15_000;

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

function liveMiniStatusLabel(status: LiveMiniInviteForMe["participant"]["status"]): string {
  switch (status) {
    case "invited":
      return "Pending";
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
    case "declined":
      return "Declined";
  }
}

function liveMiniStatusVariant(status: LiveMiniInviteForMe["participant"]["status"]): "pending" | "accepted" | "declined" {
  if (status === "invited" || status === "joined") return "pending";
  if (status === "in_progress" || status === "completed") return "accepted";
  return "declined";
}

function liveMiniCreatorLabel(invite: LiveMiniInviteForMe): string {
  const creator = invite.creator;
  if (creator?.displayName?.trim()) return creator.displayName.trim();
  if (creator?.username?.trim()) return `@${creator.username.trim().toLowerCase()}`;
  return "Someone";
}

function formatLiveMiniMinutes(minutes: number | null | undefined): string {
  if (typeof minutes !== "number" || !Number.isFinite(minutes)) return "Timer not chosen";
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}h ${m}m timer` : `${h}h timer`;
  }
  return `${minutes}m timer`;
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

function leaderboardAccent(rank: number, theme: ReturnType<typeof useTheme>["theme"]) {
  if (rank === 1) return theme.colors.amber[500];
  if (rank === 2) return theme.colors.cyan[400];
  if (rank === 3) return theme.colors.indigo[400];
  return theme.colors.textMuted;
}

function lifetimeLeagueForLevel(
  level: number,
  theme: ReturnType<typeof useTheme>["theme"],
  isDark: boolean,
) {
  if (level >= 25) {
    return {
      label: "Mythic League",
      color: theme.colors.indigo[400],
      backgroundColor: isDark ? "rgba(99, 102, 241, 0.16)" : "rgba(99, 102, 241, 0.09)",
    };
  }
  if (level >= 15) {
    return {
      label: "Gold League",
      color: theme.colors.amber[500],
      backgroundColor: isDark ? "rgba(245, 158, 11, 0.15)" : "rgba(245, 158, 11, 0.11)",
    };
  }
  if (level >= 8) {
    return {
      label: "Silver League",
      color: theme.colors.cyan[400],
      backgroundColor: isDark ? "rgba(34, 211, 238, 0.13)" : "rgba(8, 145, 178, 0.09)",
    };
  }
  if (level >= 3) {
    return {
      label: "Bronze League",
      color: theme.colors.yellow[400],
      backgroundColor: isDark ? "rgba(217, 119, 6, 0.14)" : "rgba(180, 83, 9, 0.08)",
    };
  }
  return {
    label: "Rookie League",
    color: theme.colors.textMuted,
    backgroundColor: isDark ? "rgba(148, 163, 184, 0.08)" : "rgba(148, 163, 184, 0.12)",
  };
}

function LeagueRow({
  entry,
  theme,
  isDark,
  onPress,
}: {
  entry: WeeklyLeaderboardEntry;
  theme: ReturnType<typeof useTheme>["theme"];
  isDark: boolean;
  onPress: () => void;
}) {
  const accent = leaderboardAccent(entry.rankPosition, theme);
  const xpInLevel = xpInCurrentLevel(entry.xp);
  const displayName = entry.displayName ?? `@${entry.username}`;
  const showHandle = Boolean(entry.displayName);
  const playerLeague = lifetimeLeagueForLevel(entry.level, theme, isDark);
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.82}
      accessibilityRole="button"
      accessibilityLabel={`Open ${displayName} player stats`}
      style={[
        styles.leagueRow,
        {
          backgroundColor: playerLeague.backgroundColor,
        },
      ]}
    >
      <View style={styles.leagueRankSlot}>
        {entry.rankPosition === 1 ? (
          <Crown size={22} color={accent} fill={accent} />
        ) : (
          <Text style={[styles.leagueRankText, { color: accent }]}>#{entry.rankPosition}</Text>
        )}
      </View>

      <LevelXpRing level={entry.level} xpInLevel={xpInLevel} size={46} strokeWidth={3}>
        <View style={[styles.leagueLevelOrb, { borderColor: theme.colors.border }]}>
          <Text style={[styles.leagueLevelNum, { color: theme.colors.textPrimary }]}>{entry.level}</Text>
          <Text style={[styles.leagueLevelLabel, { color: theme.colors.textMuted }]}>LVL</Text>
        </View>
      </LevelXpRing>

      <View style={styles.leaguePerson}>
        <View style={styles.leagueNameRow}>
          <Text style={[styles.leagueName, { color: theme.colors.textPrimary }]} numberOfLines={1}>
            {displayName}
          </Text>
          {entry.isMe ? (
            <View style={[styles.youPill, { backgroundColor: theme.colors.indigo[600] }]}>
              <Text style={styles.youPillText}>YOU</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.leagueMetaRow}>
          <Text style={[styles.leagueTier, { color: playerLeague.color }]} numberOfLines={1}>
            {playerLeague.label}
          </Text>
          {showHandle ? (
            <Text style={[styles.leagueHandle, { color: theme.colors.textMuted }]} numberOfLines={1}>
              - @{entry.username}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={styles.leagueXpCol}>
        <Text style={[styles.leagueXp, { color: theme.colors.textPrimary }]}>{entry.points}</Text>
        <View style={styles.leagueXpLabelRow}>
          <Zap size={11} color={theme.colors.yellow[400]} fill={theme.colors.yellow[400]} />
          <Text style={[styles.leagueXpLabel, { color: theme.colors.textMuted }]}>PTS</Text>
        </View>
      </View>
    </TouchableOpacity>
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
  const userId = session?.user?.id ?? null;
  const { isPremium, loading: premiumLoading } = usePremium();
  const { openUpsell } = usePlusUpsell();
  const refreshPremiumAccess = useRefreshPremiumAccess();
  const { suggestNotifications } = useNotificationGate();
  const { syncInviteBadgeCount } = useInviteBadge();
  /** True while we do not know premium yet — do not run accept API or open paywall. */
  const inviteAcceptPremiumUnknown = premiumLoading;
  /** Non-premium users see Accept → paywall instead of API (avoids RLS errors on accept). */
  const inviteNeedsCommunityForAccept = !isPremium && !premiumLoading;
  const [segment, setSegment] = useState<CompeteSegment>("challenges");
  const [challengesSubTab, setChallengesSubTab] = useState<ChallengesSubTab>("missions");
  const [groupInvites, setGroupInvites] = useState<ChallengeInviteRow[]>([]);
  const [liveMiniInvites, setLiveMiniInvites] = useState<LiveMiniInviteForMe[]>([]);
  const [inviteCardMeta, setInviteCardMeta] = useState<Record<string, InviteCardMeta>>({});
  const [inviteBusy, setInviteBusy] = useState<string | null>(null);
  const [invitesLoading, setInvitesLoading] = useState(false);
  const [leaveEnrollmentId, setLeaveEnrollmentId] = useState<string | null>(null);
  const [highlightInviteId, setHighlightInviteId] = useState<string | null>(null);
  const [highlightChallengeId, setHighlightChallengeId] = useState<string | null>(null);
  const [leagueRows, setLeagueRows] = useState<WeeklyLeaderboardEntry[]>([]);
  const [leagueLoading, setLeagueLoading] = useState(false);
  const [leagueLoadingMore, setLeagueLoadingMore] = useState(false);
  const [leagueHasMore, setLeagueHasMore] = useState(false);
  const [leagueError, setLeagueError] = useState<string | null>(null);
  const [leaguePlayerDrawer, setLeaguePlayerDrawer] = useState<CommunityPlayerDrawerSeed | null>(null);
  const deepLinkHandledRef = useRef(false);
  const userIdRef = useRef<string | null>(userId);
  const invitesLoadInFlightRef = useRef(false);
  const leagueLoadInFlightRef = useRef(false);
  const lastInvitesLoadAtRef = useRef(0);
  const lastLeagueLoadAtRef = useRef(0);

  useLayoutEffect(() => {
    userIdRef.current = userId;
    setGroupInvites([]);
    setLiveMiniInvites([]);
    setInviteCardMeta({});
    setInviteBusy(null);
    setInvitesLoading(Boolean(userId && isSupabaseConfigured()));
    setLeagueRows([]);
    setLeagueLoading(false);
    setLeagueLoadingMore(false);
    setLeagueHasMore(false);
    setLeagueError(userId ? null : "Sign in to view Weekly Ranks.");
    setLeaguePlayerDrawer(null);
    invitesLoadInFlightRef.current = false;
    leagueLoadInFlightRef.current = false;
    lastInvitesLoadAtRef.current = 0;
    lastLeagueLoadAtRef.current = 0;
  }, [userId]);

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

  const loadInvites = useCallback(async (options?: { force?: boolean }) => {
    const requestedUserId = userId;
    if (!isSupabaseConfigured() || !requestedUserId) {
      setGroupInvites([]);
      setLiveMiniInvites([]);
      setInviteCardMeta({});
      syncInviteBadgeCount(0);
      return;
    }
    if (invitesLoadInFlightRef.current) return;
    const now = Date.now();
    if (!options?.force && now - lastInvitesLoadAtRef.current < COMPETE_AUTO_RELOAD_COOLDOWN_MS) return;
    lastInvitesLoadAtRef.current = now;
    invitesLoadInFlightRef.current = true;
    setInvitesLoading(true);
    try {
      const [rows, liveRows] = await traceAsync(
        "compete.invites.loadLists",
        () => Promise.all([listInvitesForMe(), listLiveMiniInvitesForMe()]),
        { slowMs: 900 },
      );
      if (userIdRef.current !== requestedUserId) return;
      setGroupInvites(rows);
      setLiveMiniInvites(liveRows);
      syncInviteBadgeCount(
        rows.filter((i) => i.status === "pending").length +
          liveRows.filter((i) => i.participant.status === "invited").length,
      );
      const meta: Record<string, InviteCardMeta> = {};
      await traceAsync(
        "compete.invites.loadMeta",
        async () => {
          const groups = await getChallengeGroupsByIds(rows.map((inv) => inv.challenge_id));
          const byId = new Map(groups.map((group) => [group.id, group]));
          for (const inv of rows) {
            const group = byId.get(inv.challenge_id);
            if (group) meta[inv.id] = parseInviteCardMeta(group);
          }
        },
        { slowMs: 900, meta: { count: rows.length } },
      );
      if (userIdRef.current !== requestedUserId) return;
      setInviteCardMeta(meta);
    } catch (e: unknown) {
      console.warn("[habitPro] loadInvites", e);
    } finally {
      invitesLoadInFlightRef.current = false;
      if (userIdRef.current === requestedUserId) setInvitesLoading(false);
    }
  }, [syncInviteBadgeCount, userId]);

  const loadLeague = useCallback(async (options?: { force?: boolean }) => {
    const requestedUserId = userId;
    if (!isSupabaseConfigured() || !requestedUserId) {
      setLeagueRows([]);
      setLeagueHasMore(false);
      setLeagueError("Sign in to view Weekly Ranks.");
      return;
    }
    if (leagueLoadInFlightRef.current) return;
    const now = Date.now();
    if (!options?.force && now - lastLeagueLoadAtRef.current < COMPETE_AUTO_RELOAD_COOLDOWN_MS) return;
    lastLeagueLoadAtRef.current = now;
    leagueLoadInFlightRef.current = true;
    setLeagueLoading(true);
    setLeagueError(null);
    try {
      const res = await traceAsync(
        "compete.league.load",
        () => fetchWeeklyLeaderboard(WEEKLY_RANK_PAGE_SIZE, 0),
        { slowMs: 900 },
      );
      if (userIdRef.current !== requestedUserId) return;
      if (res.ok === true) {
        setLeagueRows(res.items);
        setLeagueHasMore(res.hasMore);
      } else {
        setLeagueRows([]);
        setLeagueHasMore(false);
        setLeagueError(res.error);
      }
    } catch (e: unknown) {
      console.warn("[habitPro] loadLeague", e);
      setLeagueRows([]);
      setLeagueHasMore(false);
      setLeagueError("Couldn’t load Weekly Ranks.");
    } finally {
      leagueLoadInFlightRef.current = false;
      if (userIdRef.current === requestedUserId) setLeagueLoading(false);
    }
  }, [userId]);

  const loadMoreLeague = useCallback(async () => {
    if (leagueLoading || leagueLoadingMore || !leagueHasMore) return;
    const requestedUserId = userId;
    if (!isSupabaseConfigured() || !requestedUserId) return;

    setLeagueLoadingMore(true);
    setLeagueError(null);
    try {
      const res = await traceAsync(
        "compete.league.loadMore",
        () => fetchWeeklyLeaderboard(WEEKLY_RANK_PAGE_SIZE, leagueRows.length),
        { slowMs: 900, meta: { offset: leagueRows.length } },
      );
      if (userIdRef.current !== requestedUserId) return;
      if (res.ok === true) {
        setLeagueRows((prev) => {
          const seen = new Set(prev.map((row) => row.userId));
          return [...prev, ...res.items.filter((row) => !seen.has(row.userId))];
        });
        setLeagueHasMore(res.hasMore);
      } else {
        setLeagueError(res.error);
      }
    } catch (e: unknown) {
      console.warn("[habitPro] loadMoreLeague", e);
      setLeagueError("Couldn’t load more players.");
    } finally {
      setLeagueLoadingMore(false);
    }
  }, [leagueHasMore, leagueLoading, leagueLoadingMore, leagueRows.length, userId]);

  useFocusEffect(
    useCallback(() => {
      void loadInvites();
      if (segment === "leaderboard") {
        void loadLeague();
      }
    }, [loadInvites, loadLeague, segment]),
  );

  useFocusEffect(
    useCallback(() => {
      if (!isPremium || premiumLoading) {
        void refreshPremiumAccess();
      }
    }, [isPremium, premiumLoading, refreshPremiumAccess]),
  );

  useEffect(() => {
    if (segment === "leaderboard") {
      void loadLeague();
    }
  }, [loadLeague, segment]);

  useEffect(() => {
    if (segment !== "leaderboard") return undefined;
    return subscribeSyncSuccess(() => {
      void loadLeague({ force: true });
    });
  }, [loadLeague, segment]);

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
    if (inviteBusy) return;
    if (!userId) {
      showToast("Sign in to accept this invite.", "error");
      return;
    }
    setInviteBusy(invite.id);
    try {
      const freshPremium = await refreshPremiumAccess({ force: true, cachedAccessOk: true });
      if (freshPremium !== true) {
        openUpsell("invite_accept");
        return;
      }
      const group = await traceAsync(
        "compete.groupInvite.fetchGroup",
        () => getChallengeGroup(invite.challenge_id),
        { slowMs: 800 },
      );
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

      const existingHabit = useHabitStore.getState().habits.find((h) => h.challengeGroupId === group.id);
      const newHabitId =
        existingHabit?.id ??
        addHabit({
          title,
          description,
          mode,
          totalDays: mode === "manual" ? totalDays : undefined,
          challengeGroupId: group.id,
          challengeCreatorTimezone: group.creator_timezone,
          startDate: startIso,
          endDate: mode === "manual" ? tplEnd : undefined,
        });

      const habit = useHabitStore.getState().habits.find((h) => h.id === newHabitId);
      if (!habit) {
        throw new Error("Could not create the mission on this device.");
      }

      await traceAsync("compete.groupInvite.upsertHabit", () => upsertRemoteHabit(userId, habit), {
        slowMs: 900,
      });
      const { error } = await traceAsync(
        "compete.groupInvite.accept",
        () => acceptInviteAndJoin(invite, newHabitId),
        { slowMs: 900 },
      );
      if (error) throw error;

      useHabitStore.getState().synchronizeHabitWithChallengeGroup(newHabitId, group);
      const alignedHabit = useHabitStore.getState().habits.find((h) => h.id === newHabitId);
      if (alignedHabit) {
        await traceAsync("compete.groupInvite.upsertAlignedHabit", () => upsertRemoteHabit(userId, alignedHabit), {
          slowMs: 900,
        });
      }
      void refreshCohortPeerHabits();
      void loadInvites({ force: true });
      showToast("Joined the group mission", "success");
      setTimeout(() => {
        void suggestNotifications("invite_accept");
      }, 450);
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
      void loadInvites({ force: true });
    } finally {
      setInviteBusy(null);
    }
  };

  const handleDeclineLiveMiniInvite = async (invite: LiveMiniInviteForMe) => {
    const busyKey = `live:${invite.participant.id}`;
    setInviteBusy(busyKey);
    try {
      const res = await declineLiveMiniInvite(invite.squad.id);
      if (res.ok === false) {
        showToast(res.error, "error");
        return;
      }
      showToast("Live Squad invite declined", "success");
      void loadInvites({ force: true });
    } finally {
      setInviteBusy(null);
    }
  };

  const level = levelFromTotalXp(xp);
  const xpInLevel = xpInCurrentLevel(xp);
  const myWeeklyRank = useMemo(() => leagueRows.find((row) => row.isMe) ?? null, [leagueRows]);

  const bottomPad = Math.max(insets.bottom, 16) + 8;

  const localWeeklyScore = useMemo(
    () => weeklyCompeteScore(habits, miniMissions, level),
    [habits, miniMissions, level],
  );
  const localHabitCheckInsWeek = useMemo(() => countHabitCheckInsThisWeek(habits), [habits]);
  const localMinisWeek = useMemo(() => countMiniCompletionsThisWeek(miniMissions), [miniMissions]);
  const weeklyScore = myWeeklyRank?.points ?? localWeeklyScore;
  const habitCheckInsWeek = myWeeklyRank?.habitCheckIns ?? localHabitCheckInsWeek;
  const minisWeek = myWeeklyRank?.miniCompletions ?? localMinisWeek;

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

  const miniMissionByLiveSquadId = useMemo(() => {
    const m = new Map<string, MiniMission>();
    for (const mission of miniMissions) {
      if (mission.liveSquadId) m.set(mission.liveSquadId, mission);
    }
    return m;
  }, [miniMissions]);

  const pendingInviteCount = useMemo(
    () =>
      groupInvites.filter((i) => i.status === "pending").length +
      liveMiniInvites.filter((i) => i.participant.status === "invited").length,
    [groupInvites, liveMiniInvites],
  );
  const tier = useMemo(() => weeklyTierLabel(weeklyScore), [weeklyScore]);
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
            <View
              style={[
                styles.leagueHero,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.border,
                  ...theme.shadow.card,
                },
              ]}
            >
              <View style={styles.leagueHeroTop}>
                <View style={styles.leagueHeroText}>
                  <Text style={[styles.leagueTitle, { color: theme.colors.textPrimary }]}>Weekly Ranks</Text>
                  <Text style={[styles.leagueBody, { color: theme.colors.textSecondary }]}>
                    Ranked by habit check-ins and mini missions completed this week.
                  </Text>
                  <View style={styles.leagueHeroPills}>
                    <View style={[styles.leagueHeroPill, { borderColor: theme.colors.border }]}>
                      <Trophy size={13} color={theme.colors.amber[500]} />
                      <Text style={[styles.leagueHeroPillText, { color: theme.colors.textSecondary }]}>
                        {myWeeklyRank ? `Rank #${myWeeklyRank.rankPosition}` : "Enter with a username"}
                      </Text>
                    </View>
                    <View style={[styles.leagueHeroPill, { borderColor: theme.colors.border }]}>
                      <Medal size={13} color={theme.colors.indigo[400]} />
                      <Text style={[styles.leagueHeroPillText, { color: theme.colors.textSecondary }]}>
                        {tier.label} this week
                      </Text>
                    </View>
                  </View>
                </View>
                <LevelXpRing level={level} xpInLevel={xpInLevel} size={92} strokeWidth={5}>
                  <View style={[styles.leagueHeroOrb, { borderColor: theme.colors.border }]}>
                    <Text style={[styles.leagueHeroLevel, { color: theme.colors.textPrimary }]}>{level}</Text>
                    <Text style={[styles.leagueHeroLevelLabel, { color: theme.colors.textMuted }]}>LVL</Text>
                  </View>
                </LevelXpRing>
              </View>

              <View style={[styles.leagueStatsBand, { borderColor: theme.colors.border }]}>
                <View style={styles.leagueStatMini}>
                  <Text style={[styles.leagueStatValue, { color: theme.colors.indigo[400] }]}>{weeklyScore}</Text>
                  <Text style={[styles.leagueStatLabel, { color: theme.colors.textMuted }]}>week pts</Text>
                </View>
                <View style={[styles.leagueStatDivider, { backgroundColor: theme.colors.border }]} />
                <View style={styles.leagueStatMini}>
                  <Text style={[styles.leagueStatValue, { color: theme.colors.cyan[400] }]}>{habitCheckInsWeek}</Text>
                  <Text style={[styles.leagueStatLabel, { color: theme.colors.textMuted }]}>check-ins</Text>
                </View>
                <View style={[styles.leagueStatDivider, { backgroundColor: theme.colors.border }]} />
                <View style={styles.leagueStatMini}>
                  <Text style={[styles.leagueStatValue, { color: theme.colors.amber[500] }]}>{minisWeek}</Text>
                  <Text style={[styles.leagueStatLabel, { color: theme.colors.textMuted }]}>minis/week</Text>
                </View>
              </View>
            </View>

            <View style={styles.leagueToolbar}>
              <Text style={[styles.sectionLabel, { color: theme.colors.textMuted, marginBottom: 0 }]}>
                THIS WEEK
              </Text>
              <TouchableOpacity
                onPress={() => void loadLeague({ force: true })}
                disabled={leagueLoading || leagueLoadingMore}
                activeOpacity={0.85}
                style={[
                  styles.leagueRefresh,
                  {
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.surface,
                    opacity: leagueLoading || leagueLoadingMore ? 0.72 : 1,
                  },
                ]}
              >
                {leagueLoading ? (
                  <ActivityIndicator size="small" color={theme.colors.indigo[400]} />
                ) : (
                  <RefreshCw size={15} color={theme.colors.textSecondary} />
                )}
              </TouchableOpacity>
            </View>

            {leagueLoading && leagueRows.length === 0 ? (
              <View style={{ gap: 10 }}>
                {Array.from({ length: 6 }, (_, i) => (
                  <View
                    key={i}
                    style={[
                      styles.leagueRow,
                      {
                        backgroundColor: theme.colors.surface,
                        borderColor: theme.colors.border,
                        ...theme.shadow.card,
                      },
                    ]}
                  >
                    <ShimmerBlock isDark={isDark} height={22} radius={11} style={{ width: 34 }} />
                    <ShimmerBlock isDark={isDark} height={50} radius={25} style={{ width: 50 }} />
                    <View style={{ flex: 1, gap: 8 }}>
                      <ShimmerBlock isDark={isDark} height={15} radius={8} style={{ width: i % 2 === 0 ? "64%" : "48%" }} />
                      <ShimmerBlock isDark={isDark} height={11} radius={6} style={{ width: "38%" }} />
                    </View>
                    <ShimmerBlock isDark={isDark} height={18} radius={9} style={{ width: 52 }} />
                  </View>
                ))}
              </View>
            ) : leagueError ? (
              <View
                style={[
                  styles.card,
                  { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, ...theme.shadow.card },
                ]}
              >
                <Text style={[styles.emptyTitle, { color: theme.colors.textPrimary }]}>Weekly Ranks unavailable</Text>
                <Text style={[styles.emptyBody, { color: theme.colors.textSecondary }]}>{leagueError}</Text>
              </View>
            ) : leagueRows.length === 0 ? (
              <View
                style={[
                  styles.card,
                  { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, ...theme.shadow.card },
                ]}
              >
                <Text style={[styles.emptyTitle, { color: theme.colors.textPrimary }]}>No weekly scores yet</Text>
                <Text style={[styles.emptyBody, { color: theme.colors.textSecondary }]}>
                  Create a username from Profile and complete habits or minis this week.
                </Text>
              </View>
            ) : (
              <View style={styles.leagueList}>
                {leagueRows.map((entry) => (
                  <LeagueRow
                    key={entry.userId}
                    entry={entry}
                    theme={theme}
                    isDark={isDark}
                    onPress={() =>
                      setLeaguePlayerDrawer({
                        userId: entry.userId,
                        username: entry.username,
                        displayName: entry.displayName,
                        xp: entry.xp,
                        weekly: {
                          rankPosition: entry.rankPosition,
                          points: entry.points,
                          habitCheckIns: entry.habitCheckIns,
                          miniCompletions: entry.miniCompletions,
                          isMe: entry.isMe,
                        },
                      })
                    }
                  />
                ))}
                {leagueHasMore ? (
                  <TouchableOpacity
                    onPress={() => void loadMoreLeague()}
                    disabled={leagueLoadingMore}
                    activeOpacity={0.85}
                    style={[
                      styles.loadMoreLeague,
                      {
                        backgroundColor: theme.colors.surface,
                        opacity: leagueLoadingMore ? 0.72 : 1,
                      },
                    ]}
                  >
                    {leagueLoadingMore ? (
                      <ActivityIndicator size="small" color={theme.colors.indigo[400]} />
                    ) : (
                      <Text style={[styles.loadMoreLeagueText, { color: theme.colors.textSecondary }]}>
                        Load more
                      </Text>
                    )}
                  </TouchableOpacity>
                ) : null}
              </View>
            )}
            <CommunityPlayerDrawer
              visible={leaguePlayerDrawer !== null}
              player={leaguePlayerDrawer}
              onClose={() => setLeaguePlayerDrawer(null)}
            />
          </>
        ) : challengesSubTab === "invites" ? (
          <>
            <Text style={[styles.sectionLabel, { color: theme.colors.textMuted }]}>INVITES</Text>
            {invitesLoading ? (
              <View style={{ gap: 12 }}>
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
                      <ShimmerBlock
                        isDark={isDark}
                        height={18}
                        radius={9}
                        style={{ width: i % 2 === 0 ? "70%" : "58%" }}
                      />
                      <ShimmerBlock isDark={isDark} height={12} radius={6} style={{ width: "86%" }} />
                      <ShimmerBlock isDark={isDark} height={12} radius={6} style={{ width: "62%" }} />
                      <View style={{ flexDirection: "row", gap: 10, marginTop: 6 }}>
                        <ShimmerBlock isDark={isDark} height={38} radius={12} style={{ flex: 1 }} />
                        <ShimmerBlock isDark={isDark} height={38} radius={12} style={{ flex: 1 }} />
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            ) : groupInvites.length === 0 && liveMiniInvites.length === 0 ? (
              <View
                style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, ...theme.shadow.card }]}
              >
                <Text style={[styles.emptyTitle, { color: theme.colors.textPrimary }]}>No invites yet</Text>
                <Text style={[styles.emptyBody, { color: theme.colors.textSecondary }]}>
                  When someone invites you to a group mission or Live Mini Mission, it will show up here.
                </Text>
              </View>
            ) : (
              <>
                {liveMiniInvites.length > 0 ? (
                  <>
                    <Text style={[styles.sectionLabel, styles.inviteSubSectionLabel, { color: theme.colors.textMuted }]}>
                      LIVE MINI INVITES
                    </Text>
                    {liveMiniInvites.map((liveInvite) => {
                      const participant = liveInvite.participant;
                      const squad = liveInvite.squad;
                      const pending = participant.status === "invited";
                      const busyKey = `live:${participant.id}`;
                      const localMission = miniMissionByLiveSquadId.get(squad.id);
                      const localMissionId = localMission?.id ?? participant.local_mini_mission_id;
                      const canOpenTimer =
                        Boolean(localMissionId) &&
                        (participant.status === "in_progress" || participant.status === "completed");
                      const plannedMinutes = participant.planned_minutes ?? localMission?.estimatedMinutes ?? null;
                      const totalMinutes =
                        plannedMinutes == null ? null : plannedMinutes + (participant.reserve_minutes ?? 0);
                      const timerLabel =
                        participant.status === "completed" && participant.final_elapsed_seconds != null
                          ? `Done in ${formatLiveMiniElapsed(participant.final_elapsed_seconds)}`
                          : formatLiveMiniMinutes(totalMinutes);
                      const liveMeta: InviteCardMeta = {
                        challengeName: squad.title,
                        pillLabel: "Live Mini",
                        description: squad.objective ?? undefined,
                      };

                      return (
                        <View
                          key={participant.id}
                          style={[
                            styles.card,
                            {
                              backgroundColor: theme.colors.surface,
                              borderColor: theme.colors.border,
                              ...theme.shadow.card,
                            },
                          ]}
                        >
                          <InviteMissionHeader meta={liveMeta} theme={theme} isDark={isDark} />
                          <Text style={[styles.liveInviteFrom, { color: theme.colors.textMuted }]} numberOfLines={1}>
                            From {liveMiniCreatorLabel(liveInvite)}
                          </Text>
                          <View style={styles.inviteStatusRow}>
                            <InviteStatusPill
                              variant={liveMiniStatusVariant(participant.status)}
                              label={liveMiniStatusLabel(participant.status)}
                              theme={theme}
                            />
                            {participant.status !== "declined" ? (
                              <View
                                style={[
                                  styles.liveInviteTimerPill,
                                  {
                                    backgroundColor: isDark ? "rgba(34, 211, 238, 0.1)" : "rgba(8, 145, 178, 0.08)",
                                    borderColor: isDark ? "rgba(34, 211, 238, 0.28)" : "rgba(8, 145, 178, 0.2)",
                                  },
                                ]}
                              >
                                <Clock size={13} color={theme.colors.cyan[400]} />
                                <Text style={[styles.liveInviteTimerText, { color: theme.colors.cyan[400] }]} numberOfLines={1}>
                                  {timerLabel}
                                </Text>
                              </View>
                            ) : null}
                          </View>
                          <Text style={[styles.inviteHint, { color: theme.colors.textSecondary }]}>
                            {pending
                              ? "Open this invite to choose your timer. Joining Live Mini Missions is free for invitees."
                              : participant.status === "in_progress"
                                ? "Your timer is running. Finish before the deadline to rank on the board."
                                : participant.status === "completed"
                                  ? "Your result is saved on the Live Squad board."
                                  : participant.status === "declined"
                                    ? "You declined this Live Squad invite."
                                    : participant.status === "missed"
                                      ? "This Live Mini timer expired."
                                      : "Open the board to see the squad status."}
                          </Text>
                          <View style={styles.inviteActions}>
                            {pending ? (
                              <TouchableOpacity
                                style={[styles.declineBtn, { borderColor: theme.colors.border }]}
                                onPress={() => void handleDeclineLiveMiniInvite(liveInvite)}
                                disabled={inviteBusy === busyKey}
                              >
                                <Text style={{ color: theme.colors.textMuted, fontWeight: "700" }}>Decline</Text>
                              </TouchableOpacity>
                            ) : null}
                            <TouchableOpacity
                              style={[
                                pending ? styles.acceptBtn : styles.inviteFullActionBtn,
                                {
                                  backgroundColor: theme.colors.indigo[600],
                                  ...theme.shadow.glow,
                                },
                              ]}
                              onPress={() => {
                                if (canOpenTimer && localMissionId) router.push(`/mini/${localMissionId}`);
                                else router.push(`/live-mini/${squad.id}`);
                              }}
                              disabled={inviteBusy === busyKey}
                              activeOpacity={0.88}
                            >
                              {inviteBusy === busyKey ? (
                                <ActivityIndicator color={theme.colors.white} />
                              ) : (
                                <>
                                  {pending ? (
                                    <Radio size={15} color={theme.colors.white} />
                                  ) : canOpenTimer ? (
                                    <Clock size={15} color={theme.colors.white} />
                                  ) : (
                                    <Eye size={15} color={theme.colors.white} />
                                  )}
                                  <Text style={styles.acceptBtnText}>
                                    {pending ? "View & Start" : canOpenTimer ? "Open Timer" : "Open Board"}
                                  </Text>
                                </>
                              )}
                            </TouchableOpacity>
                          </View>
                        </View>
                      );
                    })}
                  </>
                ) : null}

                {groupInvites.length > 0 ? (
                  <Text
                    style={[
                      styles.sectionLabel,
                      styles.inviteSubSectionLabel,
                      { color: theme.colors.textMuted, marginTop: liveMiniInvites.length > 0 ? 14 : 0 },
                    ]}
                  >
                    GROUP MISSION INVITES
                  </Text>
                ) : null}

                {groupInvites.map((inv) => {
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
                          Group missions need Community. Tap Accept to view your Play Store options.
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
                })}
              </>
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
                  {t.durationDays} days - {t.target} {t.metric === "min_streak" ? "goal" : "target"}
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
  leagueHero: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    marginBottom: 14,
  },
  leagueHeroTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  leagueHeroText: { flex: 1, minWidth: 0 },
  leagueTitle: { fontSize: 18, lineHeight: 23, fontWeight: "900" },
  leagueBody: { fontSize: 12, lineHeight: 17, marginTop: 4, fontWeight: "600" },
  leagueHeroPills: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
  },
  leagueHeroPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  leagueHeroPillText: { fontSize: 11, fontWeight: "800" },
  leagueHeroOrb: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  leagueHeroLevel: { fontSize: 24, fontWeight: "900", fontVariant: ["tabular-nums"], lineHeight: 27 },
  leagueHeroLevelLabel: { fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  leagueToolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 2,
    marginBottom: 10,
  },
  leagueRefresh: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  leagueList: { gap: 10 },
  loadMoreLeague: {
    minHeight: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  loadMoreLeagueText: { fontSize: 13, fontWeight: "900" },
  leagueRow: {
    minHeight: 74,
    borderRadius: 16,
    borderWidth: 0,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  leagueRankSlot: {
    width: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  leagueRankText: {
    width: 44,
    textAlign: "center",
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "900",
    fontVariant: ["tabular-nums"],
  },
  leagueLevelOrb: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  leagueLevelNum: { fontSize: 14, lineHeight: 16, fontWeight: "900", fontVariant: ["tabular-nums"] },
  leagueLevelLabel: { fontSize: 6, lineHeight: 8, fontWeight: "900", letterSpacing: 0.7 },
  leaguePerson: { flex: 1, minWidth: 0 },
  leagueNameRow: { flexDirection: "row", alignItems: "center", gap: 6, minWidth: 0 },
  leagueName: { flexShrink: 1, minWidth: 0, fontSize: 15, lineHeight: 20, fontWeight: "900" },
  leagueMetaRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2, minWidth: 0 },
  leagueTier: { fontSize: 11, lineHeight: 15, fontWeight: "900" },
  leagueHandle: { flexShrink: 1, minWidth: 0, fontSize: 11, lineHeight: 15, fontWeight: "700" },
  youPill: {
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  youPillText: { color: "#fff", fontSize: 8, fontWeight: "900", letterSpacing: 0.8 },
  leagueXpCol: { width: 50, alignItems: "flex-end" },
  leagueXp: { fontSize: 16, lineHeight: 20, fontWeight: "900", fontVariant: ["tabular-nums"] },
  leagueXpLabelRow: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 2 },
  leagueXpLabel: { fontSize: 9, fontWeight: "900", letterSpacing: 0.8 },
  leagueStatsBand: {
    marginTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 14,
    flexDirection: "row",
    alignItems: "center",
  },
  leagueStatMini: { flex: 1, alignItems: "center", gap: 2 },
  leagueStatDivider: { width: StyleSheet.hairlineWidth, height: 30 },
  leagueStatValue: { fontSize: 18, fontWeight: "900", fontVariant: ["tabular-nums"] },
  leagueStatLabel: { fontSize: 10, fontWeight: "800", letterSpacing: 0.6 },
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
  inviteSubSectionLabel: { marginTop: 0, marginBottom: 10 },
  liveInviteFrom: { fontSize: 11, lineHeight: 15, fontWeight: "800", marginTop: 6 },
  liveInviteTimerPill: {
    marginLeft: 8,
    minHeight: 27,
    maxWidth: 170,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  liveInviteTimerText: { flexShrink: 1, fontSize: 11, lineHeight: 14, fontWeight: "900" },
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
    flexDirection: "row",
    gap: 7,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 12,
    minHeight: 44,
  },
  inviteFullActionBtn: {
    flex: 1,
    flexDirection: "row",
    gap: 7,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 12,
    minHeight: 44,
  },
  acceptBtnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
});

