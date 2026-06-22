import { Text } from "../../src/components/AppText";
import {
  memo,
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
  Animated,
  Easing,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FlashList } from "@shopify/flash-list";
const DynamicFlashList = FlashList as any;
import { useFocusEffect, useIsFocused } from "@react-navigation/native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ChevronRight, Crown, Eye, Medal, Radio, RefreshCw, Swords, Trophy, Clock, X, Zap } from "lucide-react-native";
import { Screen } from "../../src/components/Screen";
import { Button } from "../../src/components/Button";
import { ConfirmDialog } from "../../src/components/ConfirmDialog";
import { useTheme } from "../../src/context/ThemeContext";
import { useToast } from "../../src/context/ToastContext";
import { useHabitStore } from "../../src/store/habitStore";
import { useChallengeStore } from "../../src/store/challengeStore";
import { useShallow } from "zustand/react/shallow";
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
  getProfileLabelsForIds,
  listInvitesForMePage,
  type ProfileLabel,
} from "../../src/lib/groupChallengesApi";
import { subscribeSyncSuccess } from "../../src/lib/syncQueue";
import { upsertRemoteHabit } from "../../src/lib/sync";
import { traceAsync } from "../../src/lib/perfTrace";
import { startJsStallProbe, traceSync } from "../../src/lib/jsThreadProbe";
import { waitForHabitPersistIdle } from "../../src/lib/chunkedHabitPersistStorage";
import { PlusBadge } from "../../src/components/PlusBadge";
import { ShimmerBlock } from "../../src/components/ShimmerBlock";
import { useRefreshPremiumAccess } from "../../src/hooks/useRefreshPremiumAccess";
import { useReducedMotion } from "../../src/hooks/useReducedMotion";
import { LevelXpRing } from "../../src/components/LevelXpRing";
import {
  fetchWeeklyLeaderboard,
  type WeeklyLeaderboardEntry,
} from "../../src/lib/weeklyLeaderboardApi";
import {
  declineLiveMiniInvite,
  formatLiveMiniElapsed,
  isLiveMiniInviteActionable,
  listLiveMiniInvitesForMePage,
  type LiveMiniInviteForMe,
} from "../../src/lib/liveMiniMissionsApi";
import { levelFromTotalXp, xpInCurrentLevel } from "../../src/utils/xpLevel";

const WEEKLY_RANK_PAGE_SIZE = 20;
const COMPETE_INVITES_PAGE_SIZE = 20;
const COMPETE_INVITES_RELOAD_TTL_MS = 30_000;
const COMPETE_LEAGUE_RELOAD_TTL_MS = 60_000;
const EMPTY_HABITS: Habit[] = [];
const EMPTY_MINI_MISSIONS: MiniMission[] = [];
const LINK_ROW_SEP = "\u001e";
const LINK_VALUE_SEP = "\u001f";

function encodeGroupHabitLinks(habits: Habit[]): string {
  const rows: string[] = [];
  for (const habit of habits) {
    if (!habit.challengeGroupId) continue;
    rows.push(`${habit.challengeGroupId}${LINK_VALUE_SEP}${habit.id}`);
  }
  return rows.sort().join(LINK_ROW_SEP);
}

function decodeGroupHabitLinks(key: string): Map<string, string> {
  const map = new Map<string, string>();
  if (!key) return map;
  for (const row of key.split(LINK_ROW_SEP)) {
    const [challengeId, habitId] = row.split(LINK_VALUE_SEP);
    if (challengeId && habitId) map.set(challengeId, habitId);
  }
  return map;
}

function encodeLiveMiniLinks(miniMissions: MiniMission[]): string {
  const rows: string[] = [];
  for (const mission of miniMissions) {
    if (!mission.liveSquadId) continue;
    rows.push(`${mission.liveSquadId}${LINK_VALUE_SEP}${mission.id}${LINK_VALUE_SEP}${mission.estimatedMinutes}`);
  }
  return rows.sort().join(LINK_ROW_SEP);
}

function decodeLiveMiniLinks(key: string): Map<string, Pick<MiniMission, "id" | "estimatedMinutes">> {
  const map = new Map<string, Pick<MiniMission, "id" | "estimatedMinutes">>();
  if (!key) return map;
  for (const row of key.split(LINK_ROW_SEP)) {
    const [squadId, missionId, minutes] = row.split(LINK_VALUE_SEP);
    if (!squadId || !missionId) continue;
    const estimatedMinutes = Number(minutes);
    map.set(squadId, {
      id: missionId,
      estimatedMinutes: Number.isFinite(estimatedMinutes) ? estimatedMinutes : 0,
    });
  }
  return map;
}

type CompeteSegment = "leaderboard" | "challenges";

/** Sub-tabs when main segment is Challenges */
type ChallengesSubTab = "missions" | "invites";

type InviteCardMeta = {
  challengeName: string;
  pillLabel: string;
  description?: string;
};

type MixedInviteItem =
  | {
      kind: "live";
      id: string;
      actionRank: number;
      createdAtMs: number;
      invite: LiveMiniInviteForMe;
    }
  | {
      kind: "group";
      id: string;
      actionRank: number;
      createdAtMs: number;
      invite: ChallengeInviteRow;
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
  variant: "pending" | "accepted" | "declined" | "neutral";
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
        : variant === "neutral"
          ? {
              bg: "rgba(148, 163, 184, 0.12)",
              border: "rgba(148, 163, 184, 0.32)",
              text: theme.colors.textMuted,
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
      return "Action needed";
    case "expired":
      return "Expired";
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

function inviteCreatedAtMs(value: string | null | undefined): number {
  const ms = new Date(value ?? "").getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function groupInviteActionRank(status: ChallengeInviteRow["status"]): number {
  return status === "pending" ? 0 : 1;
}

function liveMiniInviteActionRank(status: LiveMiniInviteForMe["participant"]["status"]): number {
  if (status === "invited") return 0;
  if (status === "joined" || status === "in_progress") return 1;
  return 2;
}

function sortMixedInvites(a: MixedInviteItem, b: MixedInviteItem): number {
  if (a.actionRank !== b.actionRank) return a.actionRank - b.actionRank;
  return b.createdAtMs - a.createdAtMs;
}

function liveMiniStatusVariant(status: LiveMiniInviteForMe["participant"]["status"]): "pending" | "accepted" | "declined" | "neutral" {
  if (status === "invited" || status === "joined") return "pending";
  if (status === "in_progress" || status === "completed") return "accepted";
  if (status === "expired") return "neutral";
  return "declined";
}

function requesterHandle(username: string | null | undefined): string {
  const clean = username?.trim().toLowerCase();
  return clean ? `@${clean}` : "Someone";
}

function InviteRequesterLine({
  username,
  theme,
}: {
  username: string | null | undefined;
  theme: ReturnType<typeof useTheme>["theme"];
}) {
  return (
    <Text style={[styles.liveInviteFrom, { color: theme.colors.textMuted }]} numberOfLines={1}>
      From <Text style={[styles.inviteRequesterHandle, { color: theme.colors.cyan[400] }]}>{requesterHandle(username)}</Text>
    </Text>
  );
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

function formatInviteExpiry(expiresAt: string | null | undefined): string {
  if (!expiresAt) return "24h invite";
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return "Expired";
  const minutes = Math.ceil(ms / 60_000);
  if (minutes < 60) return `${minutes}m left`;
  const hours = Math.ceil(minutes / 60);
  if (hours < 24) return `${hours}h left`;
  const days = Math.ceil(hours / 24);
  return `${days}d left`;
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

const LeagueRow = memo(function LeagueRow({
  entry,
  theme,
  isDark,
  onPress,
}: {
  entry: WeeklyLeaderboardEntry;
  theme: ReturnType<typeof useTheme>["theme"];
  isDark: boolean;
  onPress: (entry: WeeklyLeaderboardEntry) => void;
}) {
  const accent = leaderboardAccent(entry.rankPosition, theme);
  const xpInLevel = xpInCurrentLevel(entry.xp);
  const displayName = entry.displayName ?? `@${entry.username}`;
  const showHandle = Boolean(entry.displayName);
  const playerLeague = lifetimeLeagueForLevel(entry.level, theme, isDark);
  return (
    <TouchableOpacity
      onPress={() => onPress(entry)}
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
});

export default function CompeteScreen() {
  const { theme, isDark } = useTheme();
  const { showToast } = useToast();
  const reduceMotion = useReducedMotion();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const isFocused = useIsFocused();
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
  const [inviteRequesterLabels, setInviteRequesterLabels] = useState<Record<string, ProfileLabel>>({});
  const [inviteBusy, setInviteBusy] = useState<string | null>(null);
  const [invitesLoading, setInvitesLoading] = useState(false);
  const [invitesLoadingMore, setInvitesLoadingMore] = useState(false);
  const [groupInvitesNextOffset, setGroupInvitesNextOffset] = useState<number | null>(null);
  const [liveMiniInvitesNextOffset, setLiveMiniInvitesNextOffset] = useState<number | null>(null);
  const [leaveEnrollmentId, setLeaveEnrollmentId] = useState<string | null>(null);
  const [highlightInviteId, setHighlightInviteId] = useState<string | null>(null);
  const [highlightChallengeId, setHighlightChallengeId] = useState<string | null>(null);
  const [leagueRows, setLeagueRows] = useState<WeeklyLeaderboardEntry[]>([]);
  const [leagueLoading, setLeagueLoading] = useState(false);
  const [leagueLoadingMore, setLeagueLoadingMore] = useState(false);
  const [leagueHasMore, setLeagueHasMore] = useState(false);
  const [leagueError, setLeagueError] = useState<string | null>(null);
  const deepLinkHandledRef = useRef(false);
  const userIdRef = useRef<string | null>(userId);
  const invitesLoadInFlightRef = useRef(false);
  const leagueLoadInFlightRef = useRef(false);
  const pendingInvitesForceLoadRef = useRef(false);
  const pendingLeagueForceLoadRef = useRef(false);
  const lastInvitesLoadAtRef = useRef(0);
  const lastLeagueLoadAtRef = useRef(0);
  const invitesLoadMoreInFlightRef = useRef(false);
  const inviteActionInFlightRef = useRef(new Set<string>());
  const groupInvitesRef = useRef<ChallengeInviteRow[]>([]);
  const liveMiniInvitesRef = useRef<LiveMiniInviteForMe[]>([]);
  const mountedRef = useRef(true);
  const invitePulse = useRef(new Animated.Value(0)).current;
  const hasAwaitingInvite =
    groupInvites.some((i) => i.status === "pending") ||
    liveMiniInvites.some((i) => isLiveMiniInviteActionable(i.participant));

  groupInvitesRef.current = groupInvites;
  liveMiniInvitesRef.current = liveMiniInvites;

  useLayoutEffect(() => {
    userIdRef.current = userId;
    setGroupInvites([]);
    setLiveMiniInvites([]);
    setInviteCardMeta({});
    setInviteRequesterLabels({});
    setInviteBusy(null);
    setInvitesLoading(false);
    setInvitesLoadingMore(false);
    setGroupInvitesNextOffset(null);
    setLiveMiniInvitesNextOffset(null);
    setLeagueRows([]);
    setLeagueLoading(false);
    setLeagueLoadingMore(false);
    setLeagueHasMore(false);
    setLeagueError(userId ? null : "Sign in to view Weekly Ranks.");
    invitesLoadInFlightRef.current = false;
    invitesLoadMoreInFlightRef.current = false;
    leagueLoadInFlightRef.current = false;
    pendingInvitesForceLoadRef.current = false;
    pendingLeagueForceLoadRef.current = false;
    lastInvitesLoadAtRef.current = 0;
    lastLeagueLoadAtRef.current = 0;
  }, [userId]);

  useEffect(() => {
    if (reduceMotion || !hasAwaitingInvite) {
      invitePulse.setValue(0);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(invitePulse, {
          toValue: 1,
          duration: 1050,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(invitePulse, {
          toValue: 0,
          duration: 1050,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [hasAwaitingInvite, invitePulse, reduceMotion]);

  const needsFullLocalData = isFocused && (segment === "leaderboard" || challengesSubTab === "missions");
  const needsInviteLocalLinks = isFocused && segment === "challenges" && challengesSubTab === "invites";
  const { xp, habits, miniMissions, groupHabitLinksKey, liveMiniLinksKey, addHabit, deleteHabit } = useHabitStore(
    useShallow((s) => ({
      xp: isFocused ? s.xp : 0,
      habits: needsFullLocalData ? s.habits : EMPTY_HABITS,
      miniMissions: needsFullLocalData ? s.miniMissions : EMPTY_MINI_MISSIONS,
      groupHabitLinksKey: needsInviteLocalLinks ? encodeGroupHabitLinks(s.habits) : "",
      liveMiniLinksKey: needsInviteLocalLinks ? encodeLiveMiniLinks(s.miniMissions) : "",
      addHabit: s.addHabit,
      deleteHabit: s.deleteHabit,
    })),
  );

  const enrollments = useChallengeStore((s) => s.enrollments);
  const completed = useChallengeStore((s) => s.completed);
  const enroll = useChallengeStore((s) => s.enroll);
  const abandon = useChallengeStore((s) => s.abandon);
  const reconcile = useChallengeStore((s) => s.reconcile);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!needsFullLocalData || segment !== "challenges" || challengesSubTab !== "missions") return undefined;
    const t = setTimeout(() => reconcile(habits, miniMissions), 200);
    return () => clearTimeout(t);
  }, [challengesSubTab, habits, miniMissions, needsFullLocalData, reconcile, segment]);

  const loadInvites = useCallback(async (options?: { force?: boolean }) => {
    const requestedUserId = userId;
    if (!isSupabaseConfigured() || !requestedUserId) {
      setGroupInvites([]);
      setLiveMiniInvites([]);
      setInviteCardMeta({});
      setInviteRequesterLabels({});
      setGroupInvitesNextOffset(null);
      setLiveMiniInvitesNextOffset(null);
      syncInviteBadgeCount(0);
      return;
    }
    if (invitesLoadInFlightRef.current) {
      if (options?.force) pendingInvitesForceLoadRef.current = true;
      return;
    }
    const now = Date.now();
    if (!options?.force && now - lastInvitesLoadAtRef.current < COMPETE_INVITES_RELOAD_TTL_MS) return;
    lastInvitesLoadAtRef.current = now;
    invitesLoadInFlightRef.current = true;
    if (groupInvitesRef.current.length === 0 && liveMiniInvitesRef.current.length === 0) {
      setInvitesLoading(true);
    }
    try {
      const [groupPage, livePage] = await traceAsync(
        "compete.invites.loadLists",
        () =>
          Promise.all([
            listInvitesForMePage({ offset: 0, limit: COMPETE_INVITES_PAGE_SIZE }),
            listLiveMiniInvitesForMePage({ offset: 0, limit: COMPETE_INVITES_PAGE_SIZE }),
          ]),
        { slowMs: 900 },
      );
      if (userIdRef.current !== requestedUserId) return;
      const rows = groupPage.items;
      const liveRows = livePage.items;
      setGroupInvites(rows);
      setLiveMiniInvites(liveRows);
      setGroupInvitesNextOffset(groupPage.nextOffset);
      setLiveMiniInvitesNextOffset(livePage.nextOffset);
      syncInviteBadgeCount(
        rows.filter((i) => i.status === "pending").length +
          liveRows.filter((i) => isLiveMiniInviteActionable(i.participant)).length,
      );
      const meta: Record<string, InviteCardMeta> = {};
      let requesterLabels: Record<string, ProfileLabel> = {};
      await traceAsync(
        "compete.invites.loadMeta",
        async () => {
          const [groups, labels] = await Promise.all([
            getChallengeGroupsByIds(rows.map((inv) => inv.challenge_id)),
            getProfileLabelsForIds(rows.map((inv) => inv.inviter_id)),
          ]);
          requesterLabels = labels;
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
      setInviteRequesterLabels(requesterLabels);
    } catch (e: unknown) {
      console.warn("[habitPro] loadInvites", e);
    } finally {
      invitesLoadInFlightRef.current = false;
      if (userIdRef.current === requestedUserId) setInvitesLoading(false);
      if (pendingInvitesForceLoadRef.current && userIdRef.current === requestedUserId) {
        pendingInvitesForceLoadRef.current = false;
        setTimeout(() => {
          void loadInvites({ force: true });
        }, 0);
      } else {
        pendingInvitesForceLoadRef.current = false;
      }
    }
  }, [syncInviteBadgeCount, userId]);

  const loadMoreInvites = useCallback(async () => {
    if (
      invitesLoading ||
      invitesLoadingMore ||
      invitesLoadMoreInFlightRef.current ||
      (groupInvitesNextOffset == null && liveMiniInvitesNextOffset == null)
    ) {
      return;
    }
    const requestedUserId = userId;
    if (!isSupabaseConfigured() || !requestedUserId) return;

    invitesLoadMoreInFlightRef.current = true;
    setInvitesLoadingMore(true);
    try {
      const [groupPage, livePage] = await traceAsync(
        "compete.invites.loadMore",
        () =>
          Promise.all([
            groupInvitesNextOffset == null
              ? Promise.resolve(null)
              : listInvitesForMePage({ offset: groupInvitesNextOffset, limit: COMPETE_INVITES_PAGE_SIZE }),
            liveMiniInvitesNextOffset == null
              ? Promise.resolve(null)
              : listLiveMiniInvitesForMePage({
                  offset: liveMiniInvitesNextOffset,
                  limit: COMPETE_INVITES_PAGE_SIZE,
                }),
          ]),
        { slowMs: 900 },
      );
      if (userIdRef.current !== requestedUserId) return;

      if (groupPage) {
        setGroupInvites((prev) => {
          const seen = new Set(prev.map((invite) => invite.id));
          return [...prev, ...groupPage.items.filter((invite) => !seen.has(invite.id))];
        });
        setGroupInvitesNextOffset(groupPage.nextOffset);
      }
      if (livePage) {
        setLiveMiniInvites((prev) => {
          const seen = new Set(prev.map((invite) => invite.participant.id));
          return [...prev, ...livePage.items.filter((invite) => !seen.has(invite.participant.id))];
        });
        setLiveMiniInvitesNextOffset(livePage.nextOffset);
      }

      const rows = groupPage?.items ?? [];
      if (rows.length > 0) {
        const meta: Record<string, InviteCardMeta> = {};
        const [groups, labels] = await Promise.all([
          getChallengeGroupsByIds(rows.map((inv) => inv.challenge_id)),
          getProfileLabelsForIds(rows.map((inv) => inv.inviter_id)),
        ]);
        if (userIdRef.current !== requestedUserId) return;
        const byId = new Map(groups.map((group) => [group.id, group]));
        for (const inv of rows) {
          const group = byId.get(inv.challenge_id);
          if (group) meta[inv.id] = parseInviteCardMeta(group);
        }
        setInviteCardMeta((prev) => ({ ...prev, ...meta }));
        setInviteRequesterLabels((prev) => ({ ...prev, ...labels }));
      }
    } catch (e: unknown) {
      console.warn("[habitPro] loadMoreInvites", e);
    } finally {
      invitesLoadMoreInFlightRef.current = false;
      if (userIdRef.current === requestedUserId) setInvitesLoadingMore(false);
    }
  }, [
    groupInvitesNextOffset,
    invitesLoading,
    invitesLoadingMore,
    liveMiniInvitesNextOffset,
    userId,
  ]);

  const loadLeague = useCallback(async (options?: { force?: boolean }) => {
    const requestedUserId = userId;
    if (!isSupabaseConfigured() || !requestedUserId) {
      setLeagueRows([]);
      setLeagueHasMore(false);
      setLeagueError("Sign in to view Weekly Ranks.");
      return;
    }
    if (leagueLoadInFlightRef.current) {
      if (options?.force) pendingLeagueForceLoadRef.current = true;
      return;
    }
    const now = Date.now();
    if (!options?.force && now - lastLeagueLoadAtRef.current < COMPETE_LEAGUE_RELOAD_TTL_MS) return;
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
      if (pendingLeagueForceLoadRef.current && userIdRef.current === requestedUserId) {
        pendingLeagueForceLoadRef.current = false;
        setTimeout(() => {
          void loadLeague({ force: true });
        }, 0);
      } else {
        pendingLeagueForceLoadRef.current = false;
      }
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
      if (segment === "challenges" && challengesSubTab === "invites") {
        void loadInvites();
      }
      if (segment === "leaderboard") {
        void loadLeague();
      }
    }, [challengesSubTab, loadInvites, loadLeague, segment]),
  );

  useFocusEffect(
    useCallback(() => {
      if (!isPremium || premiumLoading) {
        void refreshPremiumAccess({ serverOnly: true, cachedAccessOk: true, background: true });
      }
    }, [isPremium, premiumLoading, refreshPremiumAccess]),
  );

  useEffect(() => {
    if (segment === "challenges" && challengesSubTab === "invites") {
      void loadInvites();
    }
  }, [challengesSubTab, loadInvites, segment]);

  const leagueSyncDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (segment !== "leaderboard") return undefined;
    return subscribeSyncSuccess(() => {
      if (leagueSyncDebounceRef.current) clearTimeout(leagueSyncDebounceRef.current);
      leagueSyncDebounceRef.current = setTimeout(() => {
        leagueSyncDebounceRef.current = null;
        void loadLeague({ force: true });
      }, 2500);
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
      void loadInvites({ force: true });
    }
    if (inviteId) {
      setHighlightInviteId(inviteId);
      setHighlightChallengeId(null);
    } else if (challengeId) {
      setHighlightInviteId(null);
      setHighlightChallengeId(challengeId);
    }

    router.setParams({ inviteId: undefined, challengeId: undefined, focusInvites: undefined });
  }, [loadInvites, params.inviteId, params.challengeId, params.focusInvites, router]);

  useEffect(() => {
    if (!highlightInviteId && !highlightChallengeId) return;
    const t = setTimeout(() => {
      setHighlightInviteId(null);
      setHighlightChallengeId(null);
    }, 6000);
    return () => clearTimeout(t);
  }, [highlightInviteId, highlightChallengeId]);

  const handleAcceptGroupInvite = useCallback(async (invite: ChallengeInviteRow) => {
    const key = invite.id;
    if (inviteActionInFlightRef.current.has(key)) return;
    inviteActionInFlightRef.current.add(key);
    if (!userId) {
      showToast("Sign in to accept this invite.", "error");
      inviteActionInFlightRef.current.delete(key);
      return;
    }
    setInviteBusy(invite.id);
    startJsStallProbe(`compete.acceptInvite.${invite.id}`);
    try {
      if (!isPremium || premiumLoading) {
        const freshPremium = await refreshPremiumAccess({ serverOnly: true, cachedAccessOk: true });
        if (freshPremium !== true) {
          openUpsell("invite_accept");
          return;
        }
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
      const startIso = inviteeHabitStartIsoFromGroupStartDate(group.start_date, group.creator_timezone);

      const existingHabit = useHabitStore.getState().habits.find((h) => h.challengeGroupId === group.id);
      const createdLocalHabit = !existingHabit;
      const newHabitId =
        existingHabit?.id ??
        traceSync("compete.acceptInvite.addHabit", () =>
          addHabit({
            title,
            description,
            mode,
            totalDays: mode === "manual" ? totalDays : undefined,
            challengeGroupId: group.id,
            challengeCreatorTimezone: group.creator_timezone,
            missionTimezone: group.creator_timezone,
            startDate: startIso,
            endDate: mode === "manual" ? tplEnd : undefined,
            requestRemoteSync: false,
          }),
        );

      const habit = useHabitStore.getState().habits.find((h) => h.id === newHabitId);
      if (!habit) {
        throw new Error("Could not create the mission on this device.");
      }

      let joinedOnServer = false;
      try {
        await traceAsync("compete.groupInvite.upsertHabit", () => upsertRemoteHabit(userId, habit), {
            slowMs: 900,
          });
          const { error, reason } = await traceAsync(
            "compete.groupInvite.accept",
            () => acceptInviteAndJoin(invite, newHabitId),
            { slowMs: 900 },
          );
          if (error) {
            if (reason === "premium_required") {
              if (createdLocalHabit) deleteHabit(newHabitId);
              await refreshPremiumAccess({ force: true, serverOnly: true });
              openUpsell("invite_accept");
              return;
            }
            throw error;
          }
          joinedOnServer = true;
          if (!createdLocalHabit) {
            traceSync("compete.acceptInvite.synchronizeHabitWithChallengeGroup", () => {
              useHabitStore.getState().synchronizeHabitWithChallengeGroup(newHabitId, group);
            });
          }
          const optimisticGroupInvites = groupInvitesRef.current.map((row) =>
            row.id === invite.id ? { ...row, status: "accepted" as const } : row,
          );
          setGroupInvites(optimisticGroupInvites);
          syncInviteBadgeCount(
            optimisticGroupInvites.filter((row) => row.status === "pending").length +
              liveMiniInvitesRef.current.filter((row) => isLiveMiniInviteActionable(row.participant)).length,
          );
          const alignedHabit = useHabitStore.getState().habits.find((h) => h.id === newHabitId);
          if (alignedHabit) {
            await traceAsync(
              "compete.groupInvite.upsertAlignedHabit",
              () => upsertRemoteHabit(userId, alignedHabit),
              { slowMs: 900 },
            );
            if (createdLocalHabit) {
              useHabitStore.getState().clearDirtyState([newHabitId]);
            }
          }
          await waitForHabitPersistIdle();
          if (mountedRef.current) {
            showToast("Joined the group mission. Start it from Home.", "success", 1800);
          }
          setTimeout(() => {
            if (mountedRef.current) void suggestNotifications("invite_accept");
          }, 2200);
      } catch (joinErr) {
        if (!joinedOnServer && createdLocalHabit) {
          traceSync("compete.acceptInvite.rollbackDeleteHabit", () => deleteHabit(newHabitId));
        }
        throw joinErr;
      }
    } catch (e: unknown) {
      const msg =
        e instanceof Error
          ? e.message
          : typeof e === "object" && e && "message" in e
            ? String((e as { message: string }).message)
            : String(e);
      showToast(msg, "error");
    } finally {
      inviteActionInFlightRef.current.delete(key);
      setInviteBusy(null);
    }
  }, [
    userId,
    showToast,
    refreshPremiumAccess,
    openUpsell,
    addHabit,
    deleteHabit,
    syncInviteBadgeCount,
    suggestNotifications,
    isPremium,
    premiumLoading,
  ]);

  const handleDeclineGroupInvite = useCallback(async (invite: ChallengeInviteRow) => {
    const key = invite.id;
    if (inviteActionInFlightRef.current.has(key)) return;
    inviteActionInFlightRef.current.add(key);
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
      inviteActionInFlightRef.current.delete(key);
      setInviteBusy(null);
    }
  }, [showToast, loadInvites]);

  const handleDeclineLiveMiniInvite = useCallback(async (invite: LiveMiniInviteForMe) => {
    const busyKey = `live:${invite.participant.id}`;
    if (inviteActionInFlightRef.current.has(busyKey)) return;
    inviteActionInFlightRef.current.add(busyKey);
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
      inviteActionInFlightRef.current.delete(busyKey);
      setInviteBusy(null);
    }
  }, [showToast, loadInvites]);

  const handleLeagueRowPress = useCallback((entry: WeeklyLeaderboardEntry) => {
    if (userId && entry.userId === userId) {
      router.push({
        pathname: "/my-journey",
        params: {
          mode: "public",
          weeklyRankPosition: String(entry.rankPosition),
          weeklyPoints: String(entry.points),
        },
      });
      return;
    }
    router.push({
      pathname: "/community-player/[id]",
      params: {
        id: entry.userId,
        username: entry.username,
        displayName: entry.displayName ?? "",
        xp: String(entry.xp),
        weeklyRankPosition: String(entry.rankPosition),
        weeklyPoints: String(entry.points),
        weeklyHabitCheckIns: String(entry.habitCheckIns),
        weeklyMiniCompletions: String(entry.miniCompletions),
      },
    });
  }, [router, userId]);

  const level = levelFromTotalXp(xp);
  const xpInLevel = xpInCurrentLevel(xp);
  const myWeeklyRank = useMemo(() => leagueRows.find((row) => row.isMe) ?? null, [leagueRows]);

  const bottomPad = Math.max(insets.bottom, 16) + 8;

  const localWeeklyScore = useMemo(
    () => (segment === "leaderboard" ? weeklyCompeteScore(habits, miniMissions, level) : 0),
    [habits, miniMissions, level, segment],
  );
  const localHabitCheckInsWeek = useMemo(
    () => (segment === "leaderboard" ? countHabitCheckInsThisWeek(habits) : 0),
    [habits, segment],
  );
  const localMinisWeek = useMemo(
    () => (segment === "leaderboard" ? countMiniCompletionsThisWeek(miniMissions) : 0),
    [miniMissions, segment],
  );
  const weeklyScore = myWeeklyRank?.points ?? localWeeklyScore;
  const habitCheckInsWeek = myWeeklyRank?.habitCheckIns ?? localHabitCheckInsWeek;
  const minisWeek = myWeeklyRank?.miniCompletions ?? localMinisWeek;

  /** Map group challenge id → local habit id (accepted group missions). */
  const habitIdByChallengeId = useMemo(() => {
    if (needsInviteLocalLinks) return decodeGroupHabitLinks(groupHabitLinksKey);
    const m = new Map<string, string>();
    for (const h of habits) {
      if (h.challengeGroupId) {
        m.set(h.challengeGroupId, h.id);
      }
    }
    return m;
  }, [groupHabitLinksKey, habits, needsInviteLocalLinks]);

  const miniMissionByLiveSquadId = useMemo(() => {
    if (needsInviteLocalLinks) return decodeLiveMiniLinks(liveMiniLinksKey);
    const m = new Map<string, Pick<MiniMission, "id" | "estimatedMinutes">>();
    for (const mission of miniMissions) {
      if (mission.liveSquadId) m.set(mission.liveSquadId, mission);
    }
    return m;
  }, [liveMiniLinksKey, miniMissions, needsInviteLocalLinks]);

  const mixedInvites = useMemo<MixedInviteItem[]>(
    () =>
      [
        ...liveMiniInvites.map(
          (invite): MixedInviteItem => ({
            kind: "live",
            id: `live:${invite.participant.id}`,
            actionRank: liveMiniInviteActionRank(invite.participant.status),
            createdAtMs: inviteCreatedAtMs(invite.participant.created_at),
            invite,
          }),
        ),
        ...groupInvites.map(
          (invite): MixedInviteItem => ({
            kind: "group",
            id: `group:${invite.id}`,
            actionRank: groupInviteActionRank(invite.status),
            createdAtMs: inviteCreatedAtMs(invite.created_at),
            invite,
          }),
        ),
      ].sort(sortMixedInvites),
    [groupInvites, liveMiniInvites],
  );
  const awaitingInvitePulseStyle = useMemo(
    () => ({
      opacity: reduceMotion
        ? 0.34
        : invitePulse.interpolate({ inputRange: [0, 1], outputRange: [0.18, 0.48] }),
      transform: [
        {
          scale: reduceMotion
            ? 1
            : invitePulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.012] }),
        },
      ],
    }),
    [invitePulse, reduceMotion],
  );

  const pendingInviteCount = useMemo(
    () =>
      groupInvites.filter((i) => i.status === "pending").length +
      liveMiniInvites.filter((i) => isLiveMiniInviteActionable(i.participant)).length,
    [groupInvites, liveMiniInvites],
  );
  const invitesHasMore = groupInvitesNextOffset != null || liveMiniInvitesNextOffset != null;
  const handleContentScroll = useCallback(
    (event: {
      nativeEvent: {
        contentOffset: { y: number };
        contentSize: { height: number };
        layoutMeasurement: { height: number };
      };
    }) => {
      if (segment !== "challenges" || challengesSubTab !== "invites") return;
      if (!invitesHasMore || invitesLoadingMore) return;
      const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
      const distanceFromBottom = contentSize.height - (contentOffset.y + layoutMeasurement.height);
      if (distanceFromBottom < 260) {
        void loadMoreInvites();
      }
    },
    [challengesSubTab, invitesHasMore, invitesLoadingMore, loadMoreInvites, segment],
  );
  const tier = useMemo(() => weeklyTierLabel(weeklyScore), [weeklyScore]);
  const activeIds = useMemo(() => new Set(enrollments.map((e) => e.templateId)), [enrollments]);
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

  const renderLiveMiniInviteCard = (liveInvite: LiveMiniInviteForMe) => {
    const participant = liveInvite.participant;
    const squad = liveInvite.squad;
    const pending = isLiveMiniInviteActionable(participant);
    const effectiveStatus = !pending && participant.status === "invited" ? "expired" : participant.status;
    const expired = effectiveStatus === "expired";
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
      pending
        ? formatInviteExpiry(participant.invite_expires_at)
        : participant.status === "completed" && participant.final_elapsed_seconds != null
        ? `Done in ${formatLiveMiniElapsed(participant.final_elapsed_seconds)}`
        : formatLiveMiniMinutes(totalMinutes);
    const liveMeta: InviteCardMeta = {
      challengeName: squad.title,
      pillLabel: "Live Mini",
      description: squad.objective ?? undefined,
    };

    return (
      <View
        key={`live:${participant.id}`}
        style={[
          styles.card,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
            ...theme.shadow.card,
          },
        ]}
      >
        {pending ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.awaitingInvitePulse,
              {
                borderColor: theme.colors.cyan[400],
                backgroundColor: isDark ? "rgba(34, 211, 238, 0.05)" : "rgba(8, 145, 178, 0.04)",
              },
              awaitingInvitePulseStyle,
            ]}
          />
        ) : null}
        <InviteMissionHeader meta={liveMeta} theme={theme} isDark={isDark} />
        <InviteRequesterLine username={liveInvite.creator?.username} theme={theme} />
        <View style={styles.inviteStatusRow}>
          <InviteStatusPill
            variant={liveMiniStatusVariant(effectiveStatus)}
            label={liveMiniStatusLabel(effectiveStatus)}
            theme={theme}
          />
          {participant.status !== "declined" && !expired ? (
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
            : effectiveStatus === "in_progress"
              ? "Your timer is running. Finish before the deadline to rank on the board."
              : effectiveStatus === "completed"
                ? "Your result is saved on the Live Squad board."
                : effectiveStatus === "declined"
                  ? "You declined this Live Squad invite."
                  : effectiveStatus === "expired"
                    ? "This Live Squad invite expired."
                  : effectiveStatus === "missed"
                    ? "This Live Mini timer expired."
                    : "Open the board to see the squad status."}
        </Text>
        <View style={styles.inviteActions}>
          {pending ? (
            <Button
              title="Decline"
              variant="subtle"
              onPress={() => void handleDeclineLiveMiniInvite(liveInvite)}
              disabled={inviteBusy === busyKey}
              style={styles.declineBtn}
              textStyle={[styles.declineBtnText, { color: theme.colors.textMuted }]}
            />
          ) : null}
          <Button
            title={pending ? "View & Start" : canOpenTimer ? "Open Timer" : "Open Board"}
            variant={pending ? "primary" : "subtle"}
            icon={
              pending ? (
                <Radio size={15} color={theme.colors.white} />
              ) : canOpenTimer ? (
                <Clock size={15} color={theme.colors.cyan[400]} />
              ) : (
                <Eye size={15} color={theme.colors.cyan[400]} />
              )
            }
            loading={inviteBusy === busyKey}
            onPress={() => {
              if (canOpenTimer && localMissionId) router.push(`/mini/${localMissionId}`);
              else router.push(`/live-mini/${squad.id}`);
            }}
            disabled={inviteBusy === busyKey}
            style={[
              pending ? styles.acceptBtn : styles.inviteFullActionBtn,
              pending ? theme.shadow.glow : null,
            ]}
            textStyle={pending ? styles.acceptBtnText : styles.invitePassiveActionText}
          />
        </View>
      </View>
    );
  };

  const renderGroupInviteCard = (inv: ChallengeInviteRow) => {
    const pending = inv.status === "pending";
    const accepting = inviteBusy === inv.id;
    const meta = inviteCardMeta[inv.id];
    const requesterLabel = inviteRequesterLabels[inv.inviter_id];
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
        onPress={() => router.push(`/challenge/${inv.challenge_id}`)}
        activeOpacity={0.84}
        accessibilityRole="button"
        accessibilityLabel={`View group streaks: ${missionTitle}`}
        style={[
          styles.inviteGroupStreaksBtn,
          {
            backgroundColor: isDark ? "rgba(245, 158, 11, 0.13)" : "rgba(245, 158, 11, 0.10)",
            borderColor: isDark ? "rgba(245, 158, 11, 0.62)" : "rgba(217, 119, 6, 0.42)",
            shadowColor: theme.colors.amber[500],
          },
        ]}
      >
        <Eye size={19} color={theme.colors.amber[500]} strokeWidth={2.6} />
        <Text style={[styles.inviteGroupStreaksBtnText, { color: theme.colors.amber[500] }]}>
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
        <View key={`group:${inv.id}`} style={cardStyle}>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.awaitingInvitePulse,
              {
                borderColor: theme.colors.cyan[400],
                backgroundColor: isDark ? "rgba(34, 211, 238, 0.05)" : "rgba(8, 145, 178, 0.04)",
              },
              awaitingInvitePulseStyle,
            ]}
          />
          <InviteMissionHeader meta={meta} theme={theme} isDark={isDark} />
          <InviteRequesterLine username={requesterLabel?.username} theme={theme} />
          <View style={styles.inviteStatusRow}>
            <InviteStatusPill variant="pending" label={accepting ? "Joining..." : "Action needed"} theme={theme} />
          </View>
          {groupStreaksButton}
          <Text style={[styles.inviteHint, { color: theme.colors.textSecondary }]}>
            {accepting
              ? "Adding this mission to your list and joining the squad."
              : "Accept to add a matching mission and join everyone on this mission."}
          </Text>
          {inviteNeedsCommunityForAccept ? (
            <Text style={[styles.invitePlusHint, { color: theme.colors.textMuted }]}>
              Group missions need Community. Tap Accept to view your Play Store options.
            </Text>
          ) : null}
          <View style={styles.inviteActions}>
            <Button
              title="Decline"
              variant="subtle"
              onPress={() => void handleDeclineGroupInvite(inv)}
              disabled={inviteBusy === inv.id}
              style={styles.declineBtn}
              textStyle={[styles.declineBtnText, { color: theme.colors.textMuted }]}
            />
            <Button
              title="Accept"
              variant="primary"
              onPress={() => void handleAcceptGroupInvite(inv)}
              disabled={inviteAcceptPremiumUnknown || inviteBusy === inv.id}
              loading={inviteBusy === inv.id}
              style={[styles.acceptBtn, theme.shadow.glow]}
              textStyle={styles.acceptBtnText}
            />
          </View>
        </View>
      );
    }

    if (inv.status === "accepted" && canOpenMission) {
      return (
        <View key={`group:${inv.id}`} style={cardStyle}>
          <InviteMissionHeader
            meta={meta}
            theme={theme}
            isDark={isDark}
            onPress={() => router.push(`/habit/${linkedHabitId}`)}
          />
          <InviteRequesterLine username={requesterLabel?.username} theme={theme} />
          {resolvedBlock}
        </View>
      );
    }

    return (
      <View key={`group:${inv.id}`} style={cardStyle}>
        <InviteMissionHeader meta={meta} theme={theme} isDark={isDark} />
        <InviteRequesterLine username={requesterLabel?.username} theme={theme} />
        {resolvedBlock}
      </View>
    );
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

      {segment === "leaderboard" ? (
        <DynamicFlashList
          data={leagueRows}
          estimatedItemSize={82}
          keyExtractor={(item) => item.userId}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: bottomPad }}
          ListHeaderComponent={
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
                <View style={{ gap: 10, marginBottom: 10 }}>
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
                    { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, ...theme.shadow.card, marginBottom: 10 },
                  ]}
                >
                  <Text style={[styles.emptyTitle, { color: theme.colors.textPrimary }]}>Weekly Ranks unavailable</Text>
                  <Text style={[styles.emptyBody, { color: theme.colors.textSecondary }]}>{leagueError}</Text>
                </View>
              ) : leagueRows.length === 0 ? (
                <View
                  style={[
                    styles.card,
                    { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, ...theme.shadow.card, marginBottom: 10 },
                  ]}
                >
                  <Text style={[styles.emptyTitle, { color: theme.colors.textPrimary }]}>No weekly scores yet</Text>
                  <Text style={[styles.emptyBody, { color: theme.colors.textSecondary }]}>
                    Create a username from Profile and complete habits or minis this week.
                  </Text>
                </View>
              ) : null}
            </>
          }
          renderItem={({ item }) => (
            <LeagueRow
              entry={item}
              theme={theme}
              isDark={isDark}
              onPress={handleLeagueRowPress}
            />
          )}
          ListFooterComponent={
            <>
              {leagueHasMore && leagueRows.length > 0 ? (
                <TouchableOpacity
                  onPress={() => void loadMoreLeague()}
                  disabled={leagueLoadingMore}
                  activeOpacity={0.85}
                  style={[
                    styles.loadMoreLeague,
                    {
                      backgroundColor: theme.colors.surface,
                      opacity: leagueLoadingMore ? 0.72 : 1,
                      marginTop: 10,
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
            </>
          }
        />
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: bottomPad }}
          keyboardShouldPersistTaps="handled"
          onScroll={handleContentScroll}
          scrollEventThrottle={16}
        >
          {challengesSubTab === "invites" ? (
            <>
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
              ) : mixedInvites.length === 0 ? (
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
                  {mixedInvites.map((entry) =>
                    entry.kind === "live"
                      ? renderLiveMiniInviteCard(entry.invite)
                      : renderGroupInviteCard(entry.invite),
                  )}
                  {invitesHasMore ? (
                    <TouchableOpacity
                      onPress={() => void loadMoreInvites()}
                      disabled={invitesLoadingMore}
                      activeOpacity={0.85}
                      style={[
                        styles.loadMoreLeague,
                        {
                          backgroundColor: isDark ? "rgba(148, 163, 184, 0.08)" : theme.colors.surfaceElevated,
                          borderColor: theme.colors.border,
                          borderWidth: 1,
                          opacity: invitesLoadingMore ? 0.72 : 1,
                        },
                      ]}
                    >
                      {invitesLoadingMore ? (
                        <ActivityIndicator size="small" color={theme.colors.cyan[400]} />
                      ) : (
                        <Text style={[styles.loadMoreLeagueText, { color: theme.colors.textSecondary }]}>
                          Load older invites
                        </Text>
                      )}
                    </TouchableOpacity>
                  ) : null}
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
                          key={`${c.templateId}-${c.completedAt}`}
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
      )}

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
    position: "relative",
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
    marginBottom: 14,
  },
  awaitingInvitePulse: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderRadius: 16,
    borderWidth: 2,
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
  inviteRequesterHandle: { fontWeight: "900" },
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
    marginTop: 14,
    minHeight: 46,
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1,
    overflow: "hidden",
  },
  inviteGroupStreaksBtnText: { fontSize: 15, fontWeight: "900", letterSpacing: 0, backgroundColor: "transparent" },
  inviteActions: { flexDirection: "row", gap: 10, alignItems: "center" },
  declineBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  declineBtnText: { fontWeight: "800", fontSize: 14 },
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
    borderWidth: 1,
    minHeight: 44,
  },
  invitePassiveActionText: { fontWeight: "800", fontSize: 15 },
  acceptBtnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
});
