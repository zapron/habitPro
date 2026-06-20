import { Text } from "../../src/components/AppText";
import React, {
  memo,
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
  InteractionManager,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import * as Haptics from "expo-haptics";
import { ArrowLeft, Clock, Eye, EyeOff, Info, LogOut, Users, X } from "lucide-react-native";
import { CohortLeaderHero } from "../../src/components/CohortLeaderHero";
import type { CohortMastheadModel } from "../../src/components/CohortMasthead";
import { CohortNudgeChips } from "../../src/components/CohortNudgeChips";
import { CustomNudgeModal } from "../../src/components/CustomNudgeModal";
import { Screen } from "../../src/components/Screen";
import { ConfirmDialog } from "../../src/components/ConfirmDialog";
import { LazyMount } from "../../src/components/LazyMount";
import {
  CohortParticipantTimelineLegend,
  CohortPeerStreakDots,
} from "../../src/components/CohortPeerStreakDots";
import { CohortStreakPill } from "../../src/components/CohortStreakPill";
import { SquadActivitySection } from "../../src/components/SquadActivitySection";
import { MissionDetailsSheet } from "../../src/components/MissionDetailsSheet";
import { Button } from "../../src/components/Button";
import { useTheme } from "../../src/context/ThemeContext";
import { useToast } from "../../src/context/ToastContext";
import { useAuth } from "../../src/context/AuthContext";
import { usePremium } from "../../src/context/PremiumContext";
import { usePlusUpsell } from "../../src/context/PlusUpsellContext";
import { useHabitStore } from "../../src/store/habitStore";
import {
  listChallengeActivityPage,
  listRecentNudgesPage,
  sendChallengeCustomNudge,
  sendChallengeNudge,
} from "../../src/lib/challengeCohort";
import {
  getCachedChallengePrimarySnapshot,
  getProfileLabelsForIds,
  leaveChallengeGroup,
  listChallengeStreakMembersPage,
  loadChallengePrimarySnapshot,
  type ProfileLabel,
} from "../../src/lib/groupChallengesApi";
import { backOrReplace } from "../../src/lib/navigation";
import { isSupabaseConfigured } from "../../src/lib/env";
import { deleteAllCommunityWinsForHabit } from "../../src/lib/communityWinsApi";
import { PlusBadge } from "../../src/components/PlusBadge";
import {
  listChallengeStreakRepairsPage,
  voteStreakRepair,
  type StreakRepairRow,
  type StreakRepairVoteRow,
} from "../../src/lib/streakRepairApi";
import { ShimmerBlock } from "../../src/components/ShimmerBlock";
import { useRefreshPremiumAccess } from "../../src/hooks/useRefreshPremiumAccess";
import { getSupabase } from "../../src/lib/supabase";
import type {
  ChallengeActivityRow,
  ChallengeGroupRow,
  ChallengeNudgeRow,
  PresetChallengeNudgeKind,
} from "../../src/types/groupChallenge";
import type { Habit } from "../../src/types/habit";
import { isHabitMissionWindowClosed } from "../../src/utils/habitMissionWindow";
import {
  getHabitActiveMissionDaySlot,
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

const CHALLENGE_ACTIVITY_PAGE_SIZE = 20;
const CHALLENGE_REPAIR_PAGE_SIZE = 20;
const REPAIR_BADGE_PEEK_LIMIT = 3;
const STREAK_MEMBERS_PAGE_SIZE = 5;
const STREAK_SKELETON_CARD_COUNT = 3;
const REPAIR_DISMISS_STORAGE_PREFIX = "challenge-repair-dismissed";

type ChallengeDetailTab = "streaks" | "activity" | "repairs";

function repairDismissStorageKey(userId: string, challengeId: string): string {
  return `${REPAIR_DISMISS_STORAGE_PREFIX}:${userId}:${challengeId}`;
}

type ParticipantCardProps = {
  memberId: string;
  label: ProfileLabel | undefined;
  habit: Habit | undefined;
  myXp: number;
  myUserId: string | null;
  squadNudgeActionsEnabled: boolean;
  nudgeBusyKey: string | null;
  socialLocked: boolean;
  customNoteSentToday: boolean;
  onSendNudge: (toUserId: string, kind: PresetChallengeNudgeKind) => Promise<void>;
  openUpsell: (reason: any) => void;
  onOpenCustomNote: (toUserId: string) => void;
  onOpenPlayerJourney: (memberId: string, label?: ProfileLabel) => void;
  themedStyles: any;
  theme: any;
  isDark: boolean;
  nowMs: number;
};

type ParticipantCardSkeletonProps = {
  themedStyles: any;
  isDark: boolean;
};

const ParticipantCardSkeleton = memo(function ParticipantCardSkeleton({
  themedStyles,
  isDark,
}: ParticipantCardSkeletonProps) {
  return (
    <View style={[styles.participantCard, themedStyles.card]}>
      <View style={styles.participantSkeletonHeader}>
        <View style={styles.participantSkeletonTitleCluster}>
          <ShimmerBlock isDark={isDark} height={20} radius={10} style={{ width: "58%" }} />
          <View style={styles.participantSkeletonPills}>
            <ShimmerBlock isDark={isDark} height={24} radius={999} style={{ width: 54 }} />
            <ShimmerBlock isDark={isDark} height={24} radius={999} style={{ width: 30 }} />
          </View>
        </View>
        <ShimmerBlock isDark={isDark} height={30} radius={999} style={{ width: 126 }} />
      </View>

      <View style={styles.participantSkeletonProgress}>
        <View style={styles.participantSkeletonProgressTop}>
          <ShimmerBlock isDark={isDark} height={12} radius={6} style={{ width: 78 }} />
          <ShimmerBlock isDark={isDark} height={12} radius={6} style={{ width: 48 }} />
        </View>
        <ShimmerBlock isDark={isDark} height={8} radius={999} style={{ width: "86%" }} />
      </View>

      <View style={styles.participantSkeletonFooter}>
        <ShimmerBlock isDark={isDark} height={34} radius={14} style={{ width: 46 }} />
        <View style={styles.participantSkeletonFooterCopy}>
          <ShimmerBlock isDark={isDark} height={14} radius={7} style={{ width: "74%" }} />
          <ShimmerBlock isDark={isDark} height={12} radius={6} style={{ width: "46%" }} />
        </View>
      </View>
    </View>
  );
});

ParticipantCardSkeleton.displayName = "ParticipantCardSkeleton";

const ParticipantCard = memo(function ParticipantCard({
  memberId,
  label,
  habit,
  myXp,
  myUserId,
  squadNudgeActionsEnabled,
  nudgeBusyKey,
  socialLocked,
  customNoteSentToday,
  onSendNudge,
  openUpsell,
  onOpenCustomNote,
  onOpenPlayerJourney,
  themedStyles,
  theme,
  isDark,
  nowMs,
}: ParticipantCardProps) {
  const nameOnCard = participantDisplayName(label);
  const xpForLevel = label?.xp != null ? label.xp : myUserId === memberId ? myXp : null;
  const memberLevel = xpForLevel != null ? levelFromTotalXp(xpForLevel) : null;
  const squadVisible = (habit?.visibility ?? "solo") === "public";
  const VisibilityIcon = squadVisible ? Eye : EyeOff;

  const handleNudgePress = useCallback((kind: PresetChallengeNudgeKind) => {
    void onSendNudge(memberId, kind);
  }, [onSendNudge, memberId]);

  const handlePlusLocked = useCallback(() => {
    openUpsell("squad_nudge");
  }, [openUpsell]);

  const handleCustomNotePress = useCallback(() => {
    onOpenCustomNote(memberId);
  }, [onOpenCustomNote, memberId]);

  const handlePlayerJourneyPress = useCallback(() => {
    onOpenPlayerJourney(memberId, label);
  }, [label, memberId, onOpenPlayerJourney]);

  return (
    <View style={[styles.participantCard, themedStyles.card]}>
      <View style={styles.participantHeaderRow}>
        <View style={styles.participantNameLevelCluster}>
          <Pressable
            onPress={handlePlayerJourneyPress}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={`Open player journey for ${nameOnCard}`}
            style={({ pressed }) => [
              styles.participantNamePressable,
              pressed ? styles.participantNamePressed : null,
            ]}
          >
            <Text
              style={[styles.participantName, { color: theme.colors.textPrimary }]}
              numberOfLines={2}
            >
              {nameOnCard}
            </Text>
          </Pressable>
          {memberLevel != null ? (
            <View style={[styles.levelPill, themedStyles.levelPill]}>
              <Text style={[styles.levelPillText, { color: theme.colors.yellow[400] }]}>
                Lv {memberLevel}
              </Text>
            </View>
          ) : null}
          {habit ? (
            <View
              style={[
                styles.memoryVisibilityPill,
                {
                  borderColor: squadVisible
                    ? isDark ? "rgba(34, 211, 238, 0.36)" : "rgba(8, 145, 178, 0.28)"
                    : theme.colors.border,
                  backgroundColor: squadVisible
                    ? isDark ? "rgba(34, 211, 238, 0.12)" : "rgba(8, 145, 178, 0.08)"
                    : isDark ? "rgba(148, 163, 184, 0.1)" : "rgba(100, 116, 139, 0.07)",
                },
              ]}
              accessibilityLabel={squadVisible ? "Memories visible to squad" : "Memories private"}
            >
              <VisibilityIcon
                size={13}
                color={squadVisible ? theme.colors.cyan[400] : theme.colors.textMuted}
              />
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
          nowMs={nowMs}
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
          onPress={handleNudgePress}
          plusLocked={socialLocked}
          onPlusLocked={handlePlusLocked}
          customNoteSentToday={customNoteSentToday}
          onCustomNotePress={handleCustomNotePress}
        />
      ) : null}
    </View>
  );
});

ParticipantCard.displayName = "ParticipantCard";

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

  const myHabit = useHabitStore(
    useCallback(
      (s) => s.habits.find((h) => h.challengeGroupId === challengeId),
      [challengeId]
    )
  );
  const myXp = useHabitStore((s) => s.xp);
  const deleteHabit = useHabitStore((s) => s.deleteHabit);

  // Seed from the in-memory snapshot cache so revisits paint instantly instead of
  // blocking on a network round trip behind a spinner. Refresh still runs on focus.
  const cachedSnapshot = challengeId ? getCachedChallengePrimarySnapshot(challengeId) : null;
  const [group, setGroup] = useState<ChallengeGroupRow | null>(cachedSnapshot?.group ?? null);
  const [loading, setLoading] = useState(!cachedSnapshot);
  const [memberIdsOrdered, setMemberIdsOrdered] = useState<string[]>(
    cachedSnapshot?.memberIdsOrdered ?? [],
  );
  const [profileLabels, setProfileLabels] = useState<Record<string, ProfileLabel>>(
    cachedSnapshot?.profileLabels ?? {},
  );
  const [feedActivity, setFeedActivity] = useState<ChallengeActivityRow[]>([]);
  const [feedNudges, setFeedNudges] = useState<ChallengeNudgeRow[]>([]);
  const [nudgeBusyKey, setNudgeBusyKey] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [secondaryLoading, setSecondaryLoading] = useState(false);
  const [secondaryHydrated, setSecondaryHydrated] = useState(false);
  const [repairInitialLoading, setRepairInitialLoading] = useState(false);
  const [repairHydrated, setRepairHydrated] = useState(false);
  const [activityLoadingMore, setActivityLoadingMore] = useState(false);
  const [repairLoadingMore, setRepairLoadingMore] = useState(false);
  const [activityNextOffset, setActivityNextOffset] = useState<number | null>(null);
  const [nudgeNextOffset, setNudgeNextOffset] = useState<number | null>(null);
  const [repairNextOffset, setRepairNextOffset] = useState<number | null>(null);
  const [repairPreviewHasMore, setRepairPreviewHasMore] = useState(false);
  const [streakMemberIds, setStreakMemberIds] = useState<string[]>([]);
  const [streakHabitByMemberId, setStreakHabitByMemberId] = useState<Record<string, Habit>>({});
  const [streakNextOffset, setStreakNextOffset] = useState<number | null>(null);
  const [streakInitialLoading, setStreakInitialLoading] = useState(false);
  const [streakLoadingMore, setStreakLoadingMore] = useState(false);
  const [streakHydrated, setStreakHydrated] = useState(false);
  const [cohortNow, setCohortNow] = useState(() => Date.now());
  const [leaveBusy, setLeaveBusy] = useState(false);
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const [customNoteToUserId, setCustomNoteToUserId] = useState<string | null>(null);
  const [repairRows, setRepairRows] = useState<StreakRepairRow[]>([]);
  const [repairVotes, setRepairVotes] = useState<StreakRepairVoteRow[]>([]);
  const [expandedRepairId, setExpandedRepairId] = useState<string | null>(null);
  const [dismissedRepairIds, setDismissedRepairIds] = useState<Set<string>>(() => new Set());
  const [repairBusyAction, setRepairBusyAction] = useState<{
    id: string;
    vote: "approve" | "decline";
  } | null>(null);
  const [missionDetailsOpen, setMissionDetailsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ChallengeDetailTab>("streaks");

  const themedStyles = useMemo(() => {
    return {
      card: {
        backgroundColor: theme.colors.surface,
        borderColor: theme.colors.border,
        ...theme.shadow.card,
      },
      levelPill: {
        borderColor: theme.colors.border,
        backgroundColor: isDark ? "rgba(251, 191, 36, 0.12)" : "rgba(234, 179, 8, 0.12)",
      },
      recoveryCard: {
        backgroundColor: theme.colors.surface,
        borderColor: theme.colors.border,
        ...theme.shadow.card,
      },
      repairCard: {
        backgroundColor: theme.colors.surface,
        borderColor: theme.colors.border,
        ...theme.shadow.card,
      },
    };
  }, [theme, isDark]);

  // When seeded from cache, treat the very first focus as a silent background
  // refresh (content is already on screen — no spinner needed).
  const focusOnceRef = useRef(Boolean(cachedSnapshot));
  const screenActiveRef = useRef(false);
  const hydrationTasksRef = useRef<ReturnType<typeof InteractionManager.runAfterInteractions>[]>([]);
  const secondaryLoadInFlightRef = useRef(false);
  const secondaryHydratedRef = useRef(false);
  const repairInitialLoadInFlightRef = useRef(false);
  const repairHydratedRef = useRef(false);
  const repairBadgeProbeInFlightRef = useRef(false);
  const repairBadgeProbeHydratedRef = useRef(false);
  const activityLoadMoreInFlightRef = useRef(false);
  const repairLoadMoreInFlightRef = useRef(false);
  const streakLoadInFlightRef = useRef(false);
  const streakNextOffsetRef = useRef<number | null>(null);
  const socialActionInFlightRef = useRef(false);
  const activeTabRef = useRef<ChallengeDetailTab>("streaks");

  const loadSecondary = useCallback(async (opts?: { silent?: boolean }) => {
    if (!challengeId) return;
    if (secondaryLoadInFlightRef.current) return;
    const silent = opts?.silent ?? false;
    const firstSecondaryLoad = !secondaryHydratedRef.current;
    const showSecondaryLoading = !silent || firstSecondaryLoad;
    secondaryLoadInFlightRef.current = true;
    if (showSecondaryLoading) setSecondaryLoading(true);
    try {
      const [activityPage, nudgePage] = await Promise.all([
        listChallengeActivityPage(challengeId, {
          offset: 0,
          limit: CHALLENGE_ACTIVITY_PAGE_SIZE,
        }).catch(() => ({ items: [], hasMore: false, nextOffset: null })),
        listRecentNudgesPage(challengeId, {
          offset: 0,
          limit: CHALLENGE_ACTIVITY_PAGE_SIZE,
        }).catch(() => ({ items: [], hasMore: false, nextOffset: null })),
      ]);
      if (!screenActiveRef.current) return;
      setFeedActivity(activityPage.items);
      setFeedNudges(nudgePage.items);
      setActivityNextOffset(activityPage.nextOffset);
      setNudgeNextOffset(nudgePage.nextOffset);
      const labelIds = new Set<string>();
      for (const a of activityPage.items) labelIds.add(a.actor_user_id);
      for (const n of nudgePage.items) {
        labelIds.add(n.from_user_id);
        labelIds.add(n.to_user_id);
      }
      const labels = await getProfileLabelsForIds([...labelIds]);
      if (!screenActiveRef.current) return;
      setProfileLabels((prev) => ({ ...prev, ...labels }));
    } finally {
      secondaryLoadInFlightRef.current = false;
      if (screenActiveRef.current) {
        secondaryHydratedRef.current = true;
        setSecondaryHydrated(true);
        if (showSecondaryLoading) setSecondaryLoading(false);
      } else {
        secondaryHydratedRef.current = false;
      }
    }
  }, [challengeId]);

  const loadRepairRequests = useCallback(async (opts?: { silent?: boolean }) => {
    if (!challengeId) return;
    if (repairInitialLoadInFlightRef.current) return;
    const silent = opts?.silent ?? false;
    const firstRepairLoad = !repairHydratedRef.current;
    const showRepairLoading = !silent || firstRepairLoad;
    repairInitialLoadInFlightRef.current = true;
    if (showRepairLoading) setRepairInitialLoading(true);
    try {
      const res = await listChallengeStreakRepairsPage(challengeId, {
        offset: 0,
        limit: CHALLENGE_REPAIR_PAGE_SIZE,
        status: "pending",
      });
      if (!res.ok) return;
      if (!screenActiveRef.current) return;
      setRepairRows(res.page.items);
      setRepairVotes(res.votes);
      setRepairNextOffset(res.page.nextOffset);
      setRepairPreviewHasMore(res.page.nextOffset != null);
      const labels =
        res.profileLabels ?? await getProfileLabelsForIds(res.page.items.map((row) => row.user_id));
      if (!screenActiveRef.current) return;
      setProfileLabels((prev) => ({ ...prev, ...labels }));
    } finally {
      repairInitialLoadInFlightRef.current = false;
      if (screenActiveRef.current) {
        repairHydratedRef.current = true;
        setRepairHydrated(true);
        if (showRepairLoading) setRepairInitialLoading(false);
      } else {
        repairHydratedRef.current = false;
      }
    }
  }, [challengeId]);

  const loadRepairBadgeHint = useCallback(async () => {
    if (!challengeId) return;
    if (repairHydratedRef.current || repairInitialLoadInFlightRef.current) return;
    if (repairBadgeProbeInFlightRef.current || repairBadgeProbeHydratedRef.current) return;
    repairBadgeProbeInFlightRef.current = true;
    try {
      const res = await listChallengeStreakRepairsPage(challengeId, {
        offset: 0,
        limit: REPAIR_BADGE_PEEK_LIMIT,
        status: "pending",
      });
      if (!res.ok) return;
      if (!screenActiveRef.current || repairHydratedRef.current) return;
      setRepairRows(res.page.items);
      setRepairVotes(res.votes);
      setRepairNextOffset(res.page.nextOffset);
      setRepairPreviewHasMore(res.page.nextOffset != null);
      if (res.profileLabels) {
        setProfileLabels((prev) => ({ ...prev, ...res.profileLabels }));
      }
    } finally {
      repairBadgeProbeInFlightRef.current = false;
      repairBadgeProbeHydratedRef.current = true;
    }
  }, [challengeId]);

  const loadStreakMembers = useCallback(async (opts?: { reset?: boolean; silent?: boolean }) => {
    if (!challengeId) return;
    if (streakLoadInFlightRef.current) return;
    const reset = opts?.reset ?? false;
    const silent = opts?.silent ?? false;
    const offset = reset ? 0 : streakNextOffsetRef.current;
    if (!reset && offset == null) return;

    streakLoadInFlightRef.current = true;
    if (reset) {
      if (!silent) setStreakInitialLoading(true);
    } else {
      setStreakLoadingMore(true);
    }
    try {
      const page = await listChallengeStreakMembersPage(challengeId, {
        offset: offset ?? 0,
        limit: STREAK_MEMBERS_PAGE_SIZE,
      });
      if (!screenActiveRef.current) return;
      setStreakMemberIds((prev) => {
        if (reset) return page.items.map((item) => item.memberId);
        const seen = new Set(prev);
        const next = [...prev];
        for (const item of page.items) {
          if (seen.has(item.memberId)) continue;
          seen.add(item.memberId);
          next.push(item.memberId);
        }
        return next;
      });
      setStreakHabitByMemberId((prev) => {
        const next: Record<string, Habit> = reset ? {} : { ...prev };
        for (const item of page.items) {
          if (item.habit) next[item.memberId] = item.habit;
        }
        return next;
      });
      setProfileLabels((prev) => {
        const next = { ...prev };
        for (const item of page.items) {
          if (item.label) next[item.memberId] = item.label;
        }
        return next;
      });
      streakNextOffsetRef.current = page.nextOffset;
      setStreakNextOffset(page.nextOffset);
      setStreakHydrated(true);
    } catch (e) {
      if (__DEV__) console.warn("[challenge] loadStreakMembers", e);
    } finally {
      streakLoadInFlightRef.current = false;
      if (screenActiveRef.current) {
        setStreakInitialLoading(false);
        setStreakLoadingMore(false);
      }
    }
  }, [challengeId]);

  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  useEffect(() => {
    if (!screenActiveRef.current) return undefined;
    const shouldLoadActivity =
      activeTab === "activity" &&
      !secondaryHydratedRef.current &&
      !secondaryLoadInFlightRef.current;
    const shouldLoadRepairs =
      activeTab === "repairs" &&
      !repairHydratedRef.current &&
      !repairInitialLoadInFlightRef.current;
    if (!shouldLoadActivity && !shouldLoadRepairs) return undefined;

    const task = InteractionManager.runAfterInteractions(() => {
      hydrationTasksRef.current = hydrationTasksRef.current.filter((item) => item !== task);
      if (!screenActiveRef.current || activeTabRef.current !== activeTab) return;
      if (shouldLoadActivity) void loadSecondary({ silent: false });
      if (shouldLoadRepairs) void loadRepairRequests({ silent: false });
    });
    hydrationTasksRef.current.push(task);
    return () => {
      task.cancel?.();
      hydrationTasksRef.current = hydrationTasksRef.current.filter((item) => item !== task);
    };
  }, [activeTab, loadRepairRequests, loadSecondary]);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!challengeId) return;
    const silent = opts?.silent ?? false;
    if (!silent) setLoading(true);
    try {
      const primary = await loadChallengePrimarySnapshot(challengeId);
      if (!screenActiveRef.current) return;
      setGroup(primary.group);
      setMemberIdsOrdered(primary.memberIdsOrdered);
      setProfileLabels((prev) => ({ ...prev, ...primary.profileLabels }));
    } finally {
      if (!silent && screenActiveRef.current) setLoading(false);
    }
  }, [challengeId]);

  useEffect(() => {
    setFeedActivity([]);
    setFeedNudges([]);
    setRepairRows([]);
    setRepairVotes([]);
    setExpandedRepairId(null);
    setDismissedRepairIds(new Set());
    setSecondaryHydrated(false);
    setSecondaryLoading(false);
    setRepairHydrated(false);
    setRepairInitialLoading(false);
    setRepairPreviewHasMore(false);
    setStreakMemberIds([]);
    setStreakHabitByMemberId({});
    setStreakNextOffset(null);
    setStreakInitialLoading(false);
    setStreakLoadingMore(false);
    setStreakHydrated(false);
    setActivityNextOffset(null);
    setNudgeNextOffset(null);
    setRepairNextOffset(null);
    secondaryLoadInFlightRef.current = false;
    secondaryHydratedRef.current = false;
    repairInitialLoadInFlightRef.current = false;
    repairHydratedRef.current = false;
    repairBadgeProbeInFlightRef.current = false;
    repairBadgeProbeHydratedRef.current = false;
    activityLoadMoreInFlightRef.current = false;
    repairLoadMoreInFlightRef.current = false;
    streakLoadInFlightRef.current = false;
    streakNextOffsetRef.current = null;
    activeTabRef.current = "streaks";
    setActiveTab("streaks");
  }, [challengeId]);

  useEffect(() => {
    if (!challengeId || !myUserId) {
      setDismissedRepairIds(new Set());
      return;
    }
    let cancelled = false;
    void AsyncStorage.getItem(repairDismissStorageKey(myUserId, challengeId))
      .then((raw) => {
        if (cancelled) return;
        const parsed = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(parsed)) return;
        setDismissedRepairIds(new Set(parsed.filter((id): id is string => typeof id === "string" && id.length > 0)));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [challengeId, myUserId]);

  useFocusEffect(
    useCallback(() => {
      screenActiveRef.current = true;
      setCohortNow(Date.now());
      const silent = focusOnceRef.current;
      focusOnceRef.current = true;
      void load({ silent });
      void loadStreakMembers({ reset: true, silent });
      void refreshPremiumAccess({ serverOnly: true, cachedAccessOk: true, background: true });
      const repairBadgeTask = InteractionManager.runAfterInteractions(() => {
        hydrationTasksRef.current = hydrationTasksRef.current.filter((item) => item !== repairBadgeTask);
        if (!screenActiveRef.current || activeTabRef.current === "repairs") return;
        void loadRepairBadgeHint();
      });
      hydrationTasksRef.current.push(repairBadgeTask);
      return () => {
        screenActiveRef.current = false;
        hydrationTasksRef.current.forEach((task) => task.cancel?.());
        hydrationTasksRef.current = [];
      };
    }, [load, loadRepairBadgeHint, loadStreakMembers, refreshPremiumAccess]),
  );

  useEffect(() => {
    if (!challengeId || !isSupabaseConfigured()) return undefined;
    const supabase = getSupabase();
    if (!supabase) return undefined;

    const channel = supabase
      .channel(`challenge_repairs_${challengeId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "streak_repairs",
          filter: `challenge_id=eq.${challengeId}`,
        },
        (payload) => {
          const next = payload.new as { id?: string; status?: string } | null;
          if (!next?.id) return;
          if (next.status && next.status !== "pending") {
            setRepairRows((prev) => prev.filter((row) => row.id !== next.id));
            setRepairVotes((prev) => prev.filter((vote) => vote.repair_id !== next.id));
            return;
          }
          if (repairHydratedRef.current || activeTabRef.current === "repairs") {
            void loadRepairRequests({ silent: true });
          } else {
            repairBadgeProbeHydratedRef.current = false;
            void loadRepairBadgeHint();
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "streak_repairs",
          filter: `challenge_id=eq.${challengeId}`,
        },
        () => {
          if (repairHydratedRef.current || activeTabRef.current === "repairs") {
            void loadRepairRequests({ silent: true });
          } else {
            repairBadgeProbeHydratedRef.current = false;
            void loadRepairBadgeHint();
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [challengeId, loadRepairBadgeHint, loadRepairRequests]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const tasks: Promise<unknown>[] = [
        load({ silent: true }),
      ];
      if (activeTab === "streaks") tasks.push(loadStreakMembers({ reset: true, silent: true }));
      if (activeTab === "activity") tasks.push(loadSecondary({ silent: true }));
      if (activeTab === "repairs") tasks.push(loadRepairRequests({ silent: true }));
      await Promise.all(tasks);
    } finally {
      if (screenActiveRef.current) setRefreshing(false);
    }
  }, [activeTab, load, loadRepairRequests, loadSecondary, loadStreakMembers]);

  const loadMoreSquadActivity = useCallback(async () => {
    if (
      !challengeId ||
      activityLoadingMore ||
      activityLoadMoreInFlightRef.current ||
      (activityNextOffset == null && nudgeNextOffset == null)
    ) {
      return;
    }
    activityLoadMoreInFlightRef.current = true;
    setActivityLoadingMore(true);
    try {
      const [activityPage, nudgePage] = await Promise.all([
        activityNextOffset == null
          ? Promise.resolve(null)
          : listChallengeActivityPage(challengeId, {
              offset: activityNextOffset,
              limit: CHALLENGE_ACTIVITY_PAGE_SIZE,
            }),
        nudgeNextOffset == null
          ? Promise.resolve(null)
          : listRecentNudgesPage(challengeId, {
              offset: nudgeNextOffset,
              limit: CHALLENGE_ACTIVITY_PAGE_SIZE,
            }),
      ]);
      if (!screenActiveRef.current) return;
      const labelIds = new Set<string>();
      if (activityPage) {
        setFeedActivity((prev) => {
          const seen = new Set(prev.map((row) => row.id));
          return [...prev, ...activityPage.items.filter((row) => !seen.has(row.id))];
        });
        setActivityNextOffset(activityPage.nextOffset);
        for (const row of activityPage.items) labelIds.add(row.actor_user_id);
      }
      if (nudgePage) {
        setFeedNudges((prev) => {
          const seen = new Set(prev.map((row) => row.id));
          return [...prev, ...nudgePage.items.filter((row) => !seen.has(row.id))];
        });
        setNudgeNextOffset(nudgePage.nextOffset);
        for (const row of nudgePage.items) {
          labelIds.add(row.from_user_id);
          labelIds.add(row.to_user_id);
        }
      }
      const labels = await getProfileLabelsForIds([...labelIds]);
      if (!screenActiveRef.current) return;
      setProfileLabels((prev) => ({ ...prev, ...labels }));
    } catch (e) {
      if (__DEV__) console.warn("[challenge] loadMoreSquadActivity", e);
    } finally {
      activityLoadMoreInFlightRef.current = false;
      if (screenActiveRef.current) setActivityLoadingMore(false);
    }
  }, [activityLoadingMore, activityNextOffset, challengeId, nudgeNextOffset]);

  const loadMoreRepairs = useCallback(async () => {
    if (!challengeId || repairLoadingMore || repairLoadMoreInFlightRef.current || repairNextOffset == null) {
      return;
    }
    repairLoadMoreInFlightRef.current = true;
    setRepairLoadingMore(true);
    try {
      const res = await listChallengeStreakRepairsPage(challengeId, {
        offset: repairNextOffset,
        limit: CHALLENGE_REPAIR_PAGE_SIZE,
        status: "pending",
      });
      if (!res.ok) return;
      if (!screenActiveRef.current) return;
      setRepairRows((prev) => {
        const seen = new Set(prev.map((row) => row.id));
        return [...prev, ...res.page.items.filter((row) => !seen.has(row.id))];
      });
      setRepairVotes((prev) => {
        const seen = new Set(prev.map((vote) => `${vote.repair_id}:${vote.voter_id}`));
        return [...prev, ...res.votes.filter((vote) => !seen.has(`${vote.repair_id}:${vote.voter_id}`))];
      });
      setRepairNextOffset(res.page.nextOffset);
      const labels =
        res.profileLabels ?? await getProfileLabelsForIds(res.page.items.map((row) => row.user_id));
      if (!screenActiveRef.current) return;
      setProfileLabels((prev) => ({ ...prev, ...labels }));
    } catch (e) {
      if (__DEV__) console.warn("[challenge] loadMoreRepairs", e);
    } finally {
      repairLoadMoreInFlightRef.current = false;
      if (screenActiveRef.current) setRepairLoadingMore(false);
    }
  }, [challengeId, repairLoadingMore, repairNextOffset]);

  const handleServerPremiumRequired = useCallback(
    async (reason: "squad_nudge" | "streak_repair") => {
      await refreshPremiumAccess({ force: true, serverOnly: true });
      openUpsell(reason);
    },
    [openUpsell, refreshPremiumAccess],
  );

  const onSendNudge = useCallback(
    async (toUserId: string, kind: PresetChallengeNudgeKind) => {
      if (!challengeId || !myUserId || toUserId === myUserId) return;
      if (socialActionInFlightRef.current) return;
      socialActionInFlightRef.current = true;
      const key = `${toUserId}-${kind}`;
      setNudgeBusyKey(key);
      try {
        const freshPremium = await refreshPremiumAccess({ serverOnly: true, cachedAccessOk: true });
        if (freshPremium !== true) {
          openUpsell("squad_nudge");
          return;
        }
        if (
          myHabit &&
          !myHabit.isCompleted &&
          isHabitMissionWindowClosed(myHabit, Date.now())
        ) {
          return;
        }
        const { error, reason } = await sendChallengeNudge(challengeId, toUserId, kind);
        if (error) {
          if (reason === "premium_required") {
            await handleServerPremiumRequired("squad_nudge");
            return;
          }
          showToast(error.message, "error");
          return;
        }
        await load({ silent: true });
      } finally {
        socialActionInFlightRef.current = false;
        setNudgeBusyKey(null);
      }
    },
    [challengeId, myUserId, load, myHabit, showToast, openUpsell, refreshPremiumAccess, handleServerPremiumRequired],
  );

  const onCongrats = useCallback(
    async (actorUserId: string, activityId: string) => {
      if (!challengeId || !myUserId || actorUserId === myUserId) return;
      if (socialActionInFlightRef.current) return;
      socialActionInFlightRef.current = true;
      const key = `${actorUserId}-congrats`;
      setNudgeBusyKey(key);
      try {
        const freshPremium = await refreshPremiumAccess({ serverOnly: true, cachedAccessOk: true });
        if (freshPremium !== true) {
          openUpsell("squad_nudge");
          return;
        }
        if (
          myHabit &&
          !myHabit.isCompleted &&
          isHabitMissionWindowClosed(myHabit, Date.now())
        ) {
          return;
        }
        const { error, reason } = await sendChallengeNudge(challengeId, actorUserId, "congrats", { activityId });
        if (error) {
          if (reason === "premium_required") {
            await handleServerPremiumRequired("squad_nudge");
            return;
          }
          showToast(error.message, "error");
          return;
        }
        await load({ silent: true });
      } finally {
        socialActionInFlightRef.current = false;
        setNudgeBusyKey(null);
      }
    },
    [challengeId, myUserId, load, myHabit, showToast, openUpsell, refreshPremiumAccess, handleServerPremiumRequired],
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

  const persistDismissedRepairIds = useCallback((next: Set<string>) => {
    if (!challengeId || !myUserId) return;
    const ids = Array.from(next).slice(-120);
    void AsyncStorage.setItem(repairDismissStorageKey(myUserId, challengeId), JSON.stringify(ids)).catch(() => {});
  }, [challengeId, myUserId]);

  const dismissRepairRequest = useCallback((repairId: string) => {
    setDismissedRepairIds((prev) => {
      if (prev.has(repairId)) return prev;
      const next = new Set(prev);
      next.add(repairId);
      persistDismissedRepairIds(next);
      return next;
    });
  }, [persistDismissedRepairIds]);

  const onRepairVote = useCallback(
    async (repair: StreakRepairRow, vote: "approve" | "decline") => {
      if (!myUserId || repairBusyAction) return;
      const votesForRepair = repairVotes.filter((v) => v.repair_id === repair.id);
      if (votesForRepair.some((v) => v.voter_id === myUserId)) return;

      setRepairBusyAction({ id: repair.id, vote });
      try {
        const freshPremium = await refreshPremiumAccess({ serverOnly: true, cachedAccessOk: true });
        if (!screenActiveRef.current) return;
        if (freshPremium !== true) {
          openUpsell("streak_repair");
          return;
        }

        const res = await voteStreakRepair({ repairId: repair.id, vote });
        if (!screenActiveRef.current) return;
        if (!res.ok) {
          if ("reason" in res && res.reason === "premium_required") {
            await handleServerPremiumRequired("streak_repair");
            return;
          }
          const msg = "error" in res ? res.error : "Could not save vote.";
          showToast(msg, "error");
          return;
        }

        const nextVote: StreakRepairVoteRow = {
          repair_id: repair.id,
          voter_id: myUserId,
          vote,
        };
        setRepairVotes((prev) => [
          ...prev.filter((v) => !(v.repair_id === repair.id && v.voter_id === myUserId)),
          nextVote,
        ]);

        const approveCount =
          votesForRepair.filter((v) => v.vote === "approve").length +
          (vote === "approve" ? 1 : 0);
        const resolvesRequest = vote === "decline" || approveCount >= repair.approvals_required;
        if (resolvesRequest) {
          setRepairRows((prev) => prev.filter((row) => row.id !== repair.id));
          showToast(vote === "approve" ? "Repair vote saved." : "Repair declined.", "success");
        } else {
          if (vote === "approve") dismissRepairRequest(repair.id);
          showToast("Repair vote saved.", "success");
        }

        void loadSecondary({ silent: true });
        void loadStreakMembers({ reset: true, silent: true });
      } finally {
        if (screenActiveRef.current) setRepairBusyAction(null);
      }
    },
    [
      loadSecondary,
      loadStreakMembers,
      dismissRepairRequest,
      myUserId,
      openUpsell,
      refreshPremiumAccess,
      handleServerPremiumRequired,
      repairBusyAction,
      repairVotes,
      showToast,
    ],
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
        await loadStreakMembers({ reset: true, silent: true }).catch(() => {});
        showToast("Left group mission", "success");
        backOrReplace(router, "/(tabs)/compete");
      } finally {
        setLeaveBusy(false);
      }
    })();
  }, [challengeId, myHabit, deleteHabit, loadStreakMembers, router, showToast]);

  useEffect(() => {
    if (!myHabit || myHabit.isCompleted) return;
    const t = setInterval(() => setCohortNow(Date.now()), 300_000); // 5 minutes
    return () => clearInterval(t);
  }, [myHabit?.id, myHabit?.isCompleted]);

  const squadNudgeActionsEnabled = useMemo(() => {
    if (!myHabit) return true;
    if (myHabit.isCompleted) return true;
    return !isHabitMissionWindowClosed(myHabit, cohortNow);
  }, [myHabit, cohortNow]);

  const { title: missionTitle, description: missionDescription } = useMemo(
    () => parseGroupMissionDisplay(group),
    [group],
  );

  const habitByMemberId = useMemo(() => {
    const m = new Map<string, Habit>();
    for (const [memberId, habit] of Object.entries(streakHabitByMemberId)) {
      m.set(memberId, habit);
    }
    if (myUserId && myHabit) {
      m.set(myUserId, myHabit);
    }
    return m;
  }, [streakHabitByMemberId, myUserId, myHabit]);

  const habitForMember = useCallback(
    (memberId: string): Habit | undefined => habitByMemberId.get(memberId),
    [habitByMemberId],
  );

  const visibleSortedMemberIds = useMemo(() => {
    const visibleCount = streakMemberIds.length;
    if (visibleCount === 0) return streakMemberIds;

    const indexById = new Map<string, number>();
    const candidates: string[] = [];
    const seen = new Set<string>();

    streakMemberIds.forEach((memberId, index) => {
      indexById.set(memberId, index);
      if (seen.has(memberId)) return;
      seen.add(memberId);
      candidates.push(memberId);
    });

    if (myUserId && myHabit && !seen.has(myUserId)) {
      indexById.set(myUserId, Number.MAX_SAFE_INTEGER);
      candidates.push(myUserId);
    }

    return candidates
      .sort((a, b) => {
        const habitA = habitForMember(a);
        const habitB = habitForMember(b);
        const streakDiff = (habitB?.streak ?? -1) - (habitA?.streak ?? -1);
        if (streakDiff !== 0) return streakDiff;
        const checkInDiff = (habitB?.completedDates.length ?? 0) - (habitA?.completedDates.length ?? 0);
        if (checkInDiff !== 0) return checkInDiff;
        return (indexById.get(a) ?? Number.MAX_SAFE_INTEGER) - (indexById.get(b) ?? Number.MAX_SAFE_INTEGER);
      })
      .slice(0, visibleCount);
  }, [habitForMember, myHabit, myUserId, streakMemberIds]);

  const cohortBoard = useMemo((): {
    model: CohortMastheadModel;
    spotlight: { userId: string; habit: Habit; name: string } | null;
    rankedMembers: { userId: string; habit: Habit; name: string }[];
  } | null => {
    if (memberIdsOrdered.length === 0) return null;
    const rows = memberIdsOrdered.map((id) => ({
      id,
      habit: habitForMember(id),
      name: participantDisplayName(profileLabels[id]),
    }));
    const withHabit = rows.filter((r): r is typeof r & { habit: Habit } => Boolean(r.habit));
    if (withHabit.length === 0) {
      return { model: { kind: "sync_prompt" }, spotlight: null, rankedMembers: [] };
    }
    const sorted = [...withHabit].sort((a, b) => {
      const d = b.habit.streak - a.habit.streak;
      if (d !== 0) return d;
      return b.habit.completedDates.length - a.habit.completedDates.length;
    });
    const rankedMembers = sorted.slice(0, 3).map((row) => ({ userId: row.id, habit: row.habit, name: row.name }));
    const top = sorted[0];
    const maxS = top.habit.streak;
    const leaders = sorted.filter((r) => r.habit.streak === maxS);
    if (maxS === 0) {
      const byDays = [...sorted].sort((a, b) => b.habit.completedDates.length - a.habit.completedDates.length)[0];
      const n = byDays.habit.completedDates.length;
      return {
        model: { kind: "most_days", leaderName: byDays.name, daysChecked: n },
        spotlight: { userId: byDays.id, habit: byDays.habit, name: byDays.name },
        rankedMembers,
      };
    }
    if (leaders.length >= 2) {
      return {
        model: { kind: "tie", leadersCount: leaders.length, streakDays: maxS },
        spotlight: { userId: top.id, habit: top.habit, name: top.name },
        rankedMembers,
      };
    }
    return {
      model: { kind: "leader", leaderName: top.name, streakDays: maxS },
      spotlight: { userId: top.id, habit: top.habit, name: top.name },
      rankedMembers,
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
    return getHabitActiveMissionDaySlot(myHabit, cohortNow);
  }, [myHabit, cohortNow]);

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
        const freshPremium = await refreshPremiumAccess({ serverOnly: true, cachedAccessOk: true });
        if (freshPremium !== true) {
          openUpsell("squad_nudge");
          return;
        }
        setCustomNoteToUserId(toUserId);
      })();
    },
    [openUpsell, refreshPremiumAccess],
  );

  const onOpenPlayerJourney = useCallback(
    (memberId: string, label?: ProfileLabel) => {
      if (!memberId) return;
      if (myUserId && memberId === myUserId) {
        router.push("/my-journey");
        return;
      }
      router.push({
        pathname: "/community-player/[id]",
        params: {
          id: memberId,
          username: label?.username ?? "",
          displayName: label?.displayName ?? "",
          xp: label?.xp != null ? String(label.xp) : "0",
        },
      });
    },
    [myUserId, router],
  );

  const onSubmitCustomNote = useCallback(
    async (text: string) => {
      if (!challengeId || !customNoteToUserId || !myUserId) return;
      const freshPremium = await refreshPremiumAccess({ serverOnly: true, cachedAccessOk: true });
      if (freshPremium !== true) {
        openUpsell("squad_nudge");
        return;
      }
      if (
        myHabit &&
        !myHabit.isCompleted &&
        isHabitMissionWindowClosed(myHabit, Date.now())
      ) {
        showToast("Mission window ended. Nudges are disabled.", "info");
        return;
      }
      setNudgeBusyKey(`${customNoteToUserId}-custom_note`);
      try {
        const { error, reason } = await sendChallengeCustomNudge(challengeId, customNoteToUserId, text);
        if (error) {
          if (reason === "premium_required") {
            await handleServerPremiumRequired("squad_nudge");
            return;
          }
          showToast(error.message, "error");
          return;
        }
        setCustomNoteToUserId(null);
        await load({ silent: true });
      } finally {
        setNudgeBusyKey(null);
      }
    },
    [challengeId, customNoteToUserId, myUserId, myHabit, showToast, load, openUpsell, refreshPremiumAccess, handleServerPremiumRequired],
  );

  const repairVotesByRepairId = useMemo(() => {
    const map = new Map<string, StreakRepairVoteRow[]>();
    for (const vote of repairVotes) {
      const list = map.get(vote.repair_id);
      if (list) list.push(vote);
      else map.set(vote.repair_id, [vote]);
    }
    return map;
  }, [repairVotes]);

  const actionableRepairRows = useMemo(
    () =>
      repairRows.filter((repair) => {
        if (repair.status !== "pending") return false;
        if (dismissedRepairIds.has(repair.id)) return false;
        if (!myUserId) return true;
        if (repair.user_id === myUserId) return true;
        const votes = repairVotesByRepairId.get(repair.id) ?? [];
        return !votes.some((vote) => vote.voter_id === myUserId);
      }),
    [dismissedRepairIds, myUserId, repairRows, repairVotesByRepairId],
  );
  const showRepairSkeleton = repairInitialLoading && !repairHydrated && actionableRepairRows.length === 0;
  const showRepairSlot = showRepairSkeleton || actionableRepairRows.length > 0;
  const activityTabCount = secondaryHydrated ? feedActivity.length + feedNudges.length : null;
  const repairTabCount =
    repairHydrated || actionableRepairRows.length > 0
      ? repairNextOffset != null || (!repairHydrated && repairPreviewHasMore)
        ? `${actionableRepairRows.length}+`
        : actionableRepairRows.length
      : null;
  const detailTabs: { key: ChallengeDetailTab; label: string; count: number | string | null }[] = [
    { key: "streaks", label: "Streaks", count: memberIdsOrdered.length },
    { key: "activity", label: "Activity", count: activityTabCount },
    { key: "repairs", label: "Repairs", count: repairTabCount },
  ];

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
          onPress={() => backOrReplace(router, "/(tabs)/compete")}
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
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          {...({ delaysContentTouches: false } as object)}
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

          <View
            style={[
              styles.detailTabs,
              {
                backgroundColor: isDark ? "rgba(15, 23, 42, 0.72)" : theme.colors.surface,
                borderColor: theme.colors.border,
              },
            ]}
          >
            {detailTabs.map((tab) => {
              const active = activeTab === tab.key;
              return (
                <TouchableOpacity
                  key={tab.key}
                  activeOpacity={0.86}
                  accessibilityRole="button"
                  accessibilityLabel={`Show ${tab.label}`}
                  onPress={() => setActiveTab(tab.key)}
                  style={[
                    styles.detailTab,
                    {
                      backgroundColor: active
                        ? theme.colors.indigo[500]
                        : "transparent",
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.detailTabText,
                      { color: active ? theme.colors.white : theme.colors.textSecondary },
                    ]}
                    numberOfLines={1}
                  >
                    {tab.label}
                  </Text>
                  {tab.count != null ? (
                    <View
                      style={[
                        styles.detailTabBadge,
                        {
                          backgroundColor: active
                            ? "rgba(255,255,255,0.18)"
                            : isDark
                              ? "rgba(148, 163, 184, 0.14)"
                              : theme.colors.surfaceElevated,
                          borderColor: active
                            ? "rgba(255,255,255,0.26)"
                            : theme.colors.border,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.detailTabBadgeText,
                          { color: active ? theme.colors.white : theme.colors.textMuted },
                        ]}
                      >
                        {tab.count}
                      </Text>
                    </View>
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </View>

          {activeTab === "repairs" ? (
            showRepairSlot ? (
              <View style={styles.repairSlot}>
                {showRepairSkeleton ? (
                <View
                  style={[
                    styles.repairCompactCard,
                    {
                      backgroundColor: theme.colors.surface,
                      borderColor: theme.colors.border,
                      ...theme.shadow.card,
                    },
                  ]}
                >
                  <View style={styles.repairCompactHead}>
                    <View
                      style={[
                        styles.repairIconBadgeCompact,
                        {
                          backgroundColor: isDark ? "rgba(34, 211, 238, 0.10)" : "rgba(6, 182, 212, 0.10)",
                          borderColor: isDark ? "rgba(34, 211, 238, 0.24)" : "rgba(6, 182, 212, 0.22)",
                        },
                      ]}
                    >
                      <Clock size={16} color={theme.colors.cyan[500]} />
                    </View>
                    <View style={styles.repairCompactCopy}>
                      <Text style={[styles.repairCompactTitle, { color: theme.colors.textPrimary }]} numberOfLines={1}>
                        Checking repair requests
                      </Text>
                      <Text style={[styles.repairCompactMeta, { color: theme.colors.textMuted }]} numberOfLines={1}>
                        Squad approvals will appear here if needed.
                      </Text>
                      <ShimmerBlock isDark={isDark} height={10} radius={5} style={{ width: "82%", marginTop: 8 }} />
                    </View>
                  </View>
                </View>
            ) : actionableRepairRows.map((r, repairIndex) => {
              const requester = profileLabels[r.user_id];
              const name = participantDisplayName(requester);
              const votes = repairVotesByRepairId.get(r.id) ?? [];
              const approves = votes.filter((v) => v.vote === "approve").length;
              const declines = votes.filter((v) => v.vote === "decline").length;
              const myVote = myUserId ? votes.find((v) => v.voter_id === myUserId)?.vote ?? null : null;
              const isRequester = Boolean(myUserId && myUserId === r.user_id);
              const busyVote = repairBusyAction?.id === r.id ? repairBusyAction.vote : null;
              const canVote = Boolean(myUserId && !isRequester && !myVote && declines === 0 && !busyVote);
              const approvalsRequired = Math.max(1, r.approvals_required);
              const approvalsLeft = Math.max(0, approvalsRequired - approves);
              const approvalProgress = Math.min(1, approves / approvalsRequired);
              const approvalProgressWidth = `${Math.round(approvalProgress * 100)}%` as const;
              const repairToneBg = isDark ? "rgba(34, 211, 238, 0.10)" : "rgba(6, 182, 212, 0.10)";
              const repairToneBorder = isDark ? "rgba(34, 211, 238, 0.24)" : "rgba(6, 182, 212, 0.22)";
              const approveBg = isDark ? "rgba(34, 211, 238, 0.14)" : "rgba(6, 182, 212, 0.08)";
              const approveSelectedBg = isDark ? "rgba(34, 211, 238, 0.22)" : "rgba(6, 182, 212, 0.13)";
              const approveBorder = isDark ? "rgba(34, 211, 238, 0.38)" : "rgba(6, 182, 212, 0.26)";
              const declineBg = theme.colors.surfaceElevated;
              const declineSelectedBg = isDark ? "rgba(239, 68, 68, 0.14)" : "rgba(220, 38, 38, 0.08)";
              const declineBorder = theme.colors.border;
              const declineSelectedBorder = isDark ? "rgba(239, 68, 68, 0.32)" : "rgba(220, 38, 38, 0.24)";
              const actionDisabled = Boolean(!myUserId || isRequester || declines !== 0 || busyVote);
              const expanded = expandedRepairId === r.id;
              const extraCount = Math.max(0, actionableRepairRows.length - repairIndex - 1);
              return (
                <View
                  key={r.id}
                  style={[
                    styles.repairCompactCard,
                    expanded && styles.repairCompactCardExpanded,
                    {
                      backgroundColor: theme.colors.surface,
                      borderColor: theme.colors.border,
                      ...theme.shadow.card,
                    },
                  ]}
                >
                  <View style={styles.repairCompactHead}>
                    <Pressable
                      onPress={() => setExpandedRepairId((prev) => (prev === r.id ? null : r.id))}
                      style={styles.repairCompactHeadPress}
                      accessibilityRole="button"
                      accessibilityLabel={expanded ? "Collapse repair request" : "Expand repair request"}
                    >
                      <View
                        style={[
                          styles.repairIconBadgeCompact,
                          {
                            backgroundColor: repairToneBg,
                            borderColor: repairToneBorder,
                          },
                        ]}
                      >
                        <Users size={16} color={theme.colors.cyan[500]} />
                      </View>
                      <View style={styles.repairCompactCopy}>
                        <View style={styles.repairCompactTitleRow}>
                          <Text style={[styles.repairCompactTitle, { color: theme.colors.textPrimary }]} numberOfLines={1}>
                            {actionableRepairRows.length === 1
                              ? "1 pending streak repair"
                              : `Repair ${repairIndex + 1} of ${actionableRepairRows.length}`}
                          </Text>
                          <View
                            style={[
                              styles.repairXpChip,
                              {
                                backgroundColor: isDark ? "rgba(251, 191, 36, 0.12)" : "rgba(234, 179, 8, 0.12)",
                                borderColor: isDark ? "rgba(251, 191, 36, 0.28)" : "rgba(234, 179, 8, 0.24)",
                              },
                            ]}
                          >
                            <Text style={[styles.repairXpChipText, { color: theme.colors.yellow[400] }]}>
                              {r.xp_cost} XP
                            </Text>
                          </View>
                        </View>
                        <Text style={[styles.repairCompactMeta, { color: theme.colors.textMuted }]} numberOfLines={1}>
                          {name} missed {r.date_str} · {approves}/{approvalsRequired} approvals{extraCount > 0 ? ` · +${extraCount} more` : ""}
                        </Text>
                      </View>
                    </Pressable>
                    <TouchableOpacity
                      activeOpacity={0.75}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel="Do not show this repair request again"
                      onPress={() => dismissRepairRequest(r.id)}
                      style={[
                        styles.repairDismissButtonCompact,
                        {
                          backgroundColor: theme.colors.surfaceElevated,
                          borderColor: theme.colors.border,
                        },
                      ]}
                    >
                      <X size={14} color={theme.colors.textMuted} />
                    </TouchableOpacity>
                  </View>

                  {expanded ? (
                    <View style={styles.repairExpandedBody}>
                      <View style={styles.repairFactsRow}>
                        <View
                          style={[
                            styles.repairFactChip,
                            {
                              backgroundColor: theme.colors.surfaceElevated,
                              borderColor: theme.colors.border,
                            },
                          ]}
                        >
                          <Text style={[styles.repairFactLabel, { color: theme.colors.textMuted }]}>From</Text>
                          <Text style={[styles.repairFactValue, { color: theme.colors.textPrimary }]} numberOfLines={1}>
                            {name}
                          </Text>
                        </View>
                        <View
                          style={[
                            styles.repairFactChip,
                            {
                              backgroundColor: theme.colors.surfaceElevated,
                              borderColor: theme.colors.border,
                            },
                          ]}
                        >
                          <Text style={[styles.repairFactLabel, { color: theme.colors.textMuted }]}>Missed</Text>
                          <Text style={[styles.repairFactValue, { color: theme.colors.textPrimary }]} numberOfLines={1}>
                            {r.date_str}
                          </Text>
                        </View>
                      </View>

                      <View
                        style={[
                          styles.repairProgressPanel,
                          {
                            backgroundColor: theme.colors.surfaceElevated,
                            borderColor: theme.colors.border,
                          },
                        ]}
                      >
                        <View style={styles.repairProgressHead}>
                          <Text style={[styles.repairProgressTitle, { color: theme.colors.textSecondary }]}>
                            {approves} of {approvalsRequired} approvals
                          </Text>
                          <Text style={[styles.repairProgressHint, { color: theme.colors.textMuted }]}>
                            {approvalsLeft === 0 ? "Ready" : `${approvalsLeft} more`}
                          </Text>
                        </View>
                        <View style={[styles.repairProgressTrack, { backgroundColor: theme.colors.border }]}>
                          <View
                            style={[
                              styles.repairProgressFill,
                              {
                                width: approvalProgressWidth,
                                backgroundColor: theme.colors.cyan[500],
                              },
                            ]}
                          />
                        </View>
                      </View>

                      {r.reason ? (
                        <View
                          style={[
                            styles.repairReasonBox,
                            {
                              backgroundColor: isDark ? "rgba(15, 23, 42, 0.7)" : "rgba(241, 245, 249, 0.9)",
                              borderColor: theme.colors.border,
                            },
                          ]}
                        >
                          <Text style={[styles.repairReasonLabel, { color: theme.colors.textMuted }]}>Reason</Text>
                          <Text style={[styles.repairReason, { color: theme.colors.textSecondary }]} numberOfLines={3}>
                            "{r.reason}"
                          </Text>
                        </View>
                      ) : null}

                      {isRequester ? (
                        <View
                          style={[
                            styles.repairRequesterRow,
                            {
                              backgroundColor: repairToneBg,
                              borderColor: repairToneBorder,
                            },
                          ]}
                        >
                          <Clock size={15} color={theme.colors.cyan[500]} />
                          <Text style={[styles.repairRequesterText, { color: theme.colors.textSecondary }]}>
                            Waiting for squad approvals...
                          </Text>
                        </View>
                      ) : (
                        <View style={styles.repairActionsRow}>
                          <Button
                            title={myVote === "approve" ? "Approved" : "Approve"}
                            variant="subtle"
                            loading={busyVote === "approve"}
                            disabled={actionDisabled || Boolean(myVote && myVote !== "approve")}
                            onPress={() => {
                              if (!canVote) return;
                              void onRepairVote(r, "approve");
                            }}
                            style={[
                              styles.repairBtn,
                              {
                                backgroundColor: myVote === "approve" ? approveSelectedBg : approveBg,
                                borderColor: myVote === "approve" ? theme.colors.cyan[500] : approveBorder,
                              },
                            ]}
                            textStyle={[
                              styles.repairBtnText,
                              { color: theme.colors.cyan[500] },
                            ]}
                          />

                          <Button
                            title={myVote === "decline" ? "Declined" : "Decline"}
                            variant="subtle"
                            loading={busyVote === "decline"}
                            disabled={actionDisabled || Boolean(myVote && myVote !== "decline")}
                            onPress={() => {
                              if (!canVote) return;
                              void onRepairVote(r, "decline");
                            }}
                            style={[
                              styles.repairBtn,
                              {
                                backgroundColor: myVote === "decline" ? declineSelectedBg : declineBg,
                                borderColor: myVote === "decline" ? declineSelectedBorder : declineBorder,
                              },
                            ]}
                            textStyle={[
                              styles.repairBtnText,
                              { color: theme.colors.red[500] },
                            ]}
                          />
                        </View>
                      )}
                    </View>
                  ) : null}
                </View>
              );
            })}
            {!showRepairSkeleton && repairNextOffset != null ? (
              <TouchableOpacity
                onPress={() => void loadMoreRepairs()}
                disabled={repairLoadingMore}
                activeOpacity={0.85}
                style={[
                  styles.repairInlineLoadMore,
                  {
                    backgroundColor: theme.colors.surfaceElevated,
                    borderColor: theme.colors.border,
                    opacity: repairLoadingMore ? 0.72 : 1,
                  },
                ]}
              >
                {repairLoadingMore ? (
                  <ActivityIndicator size="small" color={theme.colors.indigo[400]} />
                ) : (
                  <Text style={[styles.loadMoreSecondaryText, { color: theme.colors.textSecondary }]}>
                    Load older repair requests
                  </Text>
                )}
              </TouchableOpacity>
            ) : null}
              </View>
            ) : (
              <View
                style={[
                  styles.tabEmptyCard,
                  {
                    backgroundColor: theme.colors.surface,
                    borderColor: theme.colors.border,
                  },
                ]}
              >
                {repairInitialLoading || !repairHydrated ? (
                  <ActivityIndicator size="small" color={theme.colors.cyan[500]} />
                ) : (
                  <Clock size={18} color={theme.colors.cyan[500]} />
                )}
                <View style={styles.tabEmptyCopy}>
                  <Text style={[styles.tabEmptyTitle, { color: theme.colors.textPrimary }]}>
                    {repairInitialLoading || !repairHydrated ? "Checking repairs" : "No repair requests"}
                  </Text>
                  <Text style={[styles.tabEmptyBody, { color: theme.colors.textMuted }]}>
                    {repairInitialLoading || !repairHydrated
                      ? "Squad approvals will appear here."
                      : "Pending squad repair requests will show here."}
                  </Text>
                </View>
              </View>
            )
          ) : null}

          {activeTab === "activity" ? (
            <>
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
                loading={secondaryLoading}
                loadingMore={activityLoadingMore}
                hasMore={activityNextOffset != null || nudgeNextOffset != null}
                onLoadMore={() => void loadMoreSquadActivity()}
                alwaysExpanded
              />

              {!secondaryHydrated && !secondaryLoading ? (
                <View
                  style={[
                    styles.tabEmptyCard,
                    {
                      backgroundColor: theme.colors.surface,
                      borderColor: theme.colors.border,
                    },
                  ]}
                >
                  <ActivityIndicator size="small" color={theme.colors.indigo[400]} />
                  <View style={styles.tabEmptyCopy}>
                    <Text style={[styles.tabEmptyTitle, { color: theme.colors.textPrimary }]}>
                      Loading activity
                    </Text>
                    <Text style={[styles.tabEmptyBody, { color: theme.colors.textMuted }]}>
                      Milestones and nudges will appear here.
                    </Text>
                  </View>
                </View>
              ) : null}

              {!secondaryLoading && secondaryHydrated && feedActivity.length === 0 && feedNudges.length === 0 ? (
                <View
                  style={[
                    styles.tabEmptyCard,
                    {
                      backgroundColor: theme.colors.surface,
                      borderColor: theme.colors.border,
                    },
                  ]}
                >
                  <Users size={18} color={theme.colors.indigo[400]} />
                  <View style={styles.tabEmptyCopy}>
                    <Text style={[styles.tabEmptyTitle, { color: theme.colors.textPrimary }]}>
                      No squad activity yet
                    </Text>
                    <Text style={[styles.tabEmptyBody, { color: theme.colors.textMuted }]}>
                      Milestones and nudges will appear here.
                    </Text>
                  </View>
                </View>
              ) : null}
            </>
          ) : null}

          {activeTab === "streaks" ? (
            <>
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
                  rankedMembers={cohortBoard.rankedMembers}
                />
              ) : null}

              <View style={styles.participantsSectionHeader}>
                <Text style={[styles.sectionLabel, styles.participantsSectionTitle, { color: theme.colors.textMuted }]}>
                  PARTICIPANTS
                </Text>
                <CohortParticipantTimelineLegend theme={theme} isDark={isDark} />
              </View>

              {!streakHydrated && (streakInitialLoading || memberIdsOrdered.length > 0) ? (
                Array.from({ length: STREAK_SKELETON_CARD_COUNT }, (_, index) => (
                  <ParticipantCardSkeleton
                    key={`streak-skeleton-${index}`}
                    themedStyles={themedStyles}
                    isDark={isDark}
                  />
                ))
              ) : memberIdsOrdered.length === 0 ? (
                <Text style={{ color: theme.colors.textSecondary }}>No members loaded yet.</Text>
              ) : visibleSortedMemberIds.length === 0 ? (
                <Text style={{ color: theme.colors.textSecondary }}>No streaks loaded yet.</Text>
              ) : (
                visibleSortedMemberIds.map((memberId) => (
                  <ParticipantCard
                    key={memberId}
                    memberId={memberId}
                    label={profileLabels[memberId]}
                    habit={habitForMember(memberId)}
                    myXp={myXp}
                    myUserId={myUserId}
                    squadNudgeActionsEnabled={squadNudgeActionsEnabled}
                    nudgeBusyKey={
                      nudgeBusyKey?.startsWith(`${memberId}-`) ? nudgeBusyKey : null
                    }
                    socialLocked={socialLocked}
                    customNoteSentToday={customNoteSentTodayToUserIds.has(memberId)}
                    onSendNudge={onSendNudge}
                    openUpsell={openUpsell}
                    onOpenCustomNote={onOpenCustomNote}
                    onOpenPlayerJourney={onOpenPlayerJourney}
                    themedStyles={themedStyles}
                    theme={theme}
                    isDark={isDark}
                    nowMs={cohortNow}
                  />
                ))
              )}
              {streakNextOffset != null ? (
                <TouchableOpacity
                  onPress={() => void loadStreakMembers({ reset: false })}
                  disabled={streakLoadingMore}
                  activeOpacity={0.85}
                  style={[
                    styles.loadMoreSecondaryBtn,
                    {
                      backgroundColor: theme.colors.surfaceElevated,
                      borderColor: theme.colors.border,
                      opacity: streakLoadingMore ? 0.72 : 1,
                    },
                  ]}
                >
                  {streakLoadingMore ? (
                    <ActivityIndicator size="small" color={theme.colors.indigo[400]} />
                  ) : (
                    <Text style={[styles.loadMoreSecondaryText, { color: theme.colors.textSecondary }]}>
                      Load more members
                    </Text>
                  )}
                </TouchableOpacity>
              ) : null}
            </>
          ) : null}

        </ScrollView>
      )}

      <LazyMount visible={customNoteToUserId !== null} unmountOnExit>
        <CustomNudgeModal
          visible={customNoteToUserId !== null}
          onRequestClose={() => setCustomNoteToUserId(null)}
          recipientLabel={participantDisplayName(profileLabels[customNoteToUserId ?? ""])}
          busy={customNoteToUserId !== null && nudgeBusyKey === `${customNoteToUserId}-custom_note`}
          onSend={(t) => void onSubmitCustomNote(t)}
        />
      </LazyMount>

      <LazyMount visible={leaveDialogOpen} unmountOnExit>
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
      </LazyMount>

      <LazyMount visible={missionDetailsOpen} unmountOnExit>
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
      </LazyMount>
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
  detailTabs: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 18,
    padding: 4,
    gap: 4,
    marginBottom: 14,
  },
  detailTab: {
    flex: 1,
    minHeight: 44,
    borderRadius: 14,
    paddingHorizontal: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  detailTabText: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "900",
  },
  detailTabBadge: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  detailTabBadgeText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "900",
  },
  tabEmptyCard: {
    minHeight: 84,
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  tabEmptyCopy: {
    flex: 1,
    minWidth: 0,
  },
  tabEmptyTitle: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "900",
  },
  tabEmptyBody: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
  },
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
  participantProgressiveFooter: {
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  repairSlot: {
    minHeight: 76,
    marginBottom: 14,
    justifyContent: "center",
  },
  repairCompactCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 10,
  },
  repairCompactCardExpanded: {
    paddingBottom: 12,
  },
  repairCompactHead: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  repairCompactHeadPress: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  repairIconBadgeCompact: {
    width: 34,
    height: 34,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  repairCompactCopy: {
    flex: 1,
    minWidth: 0,
  },
  repairCompactTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
  },
  repairCompactTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "900",
  },
  repairCompactMeta: {
    marginTop: 3,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "800",
  },
  repairExpandedBody: {
    marginTop: 4,
  },
  repairCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    marginBottom: 14,
  },
  repairSkeletonCard: {
    paddingVertical: 14,
  },
  repairSkeletonTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  repairSkeletonCopy: {
    flex: 1,
    minWidth: 0,
  },
  repairSkeletonHint: {
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17,
    marginTop: 4,
  },
  repairSkeletonBar: {
    marginTop: 14,
  },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
  },
  repairTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  repairIconBadge: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  repairDismissButton: {
    width: 30,
    height: 30,
    borderRadius: 9999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  repairDismissButtonCompact: {
    width: 30,
    height: 30,
    borderRadius: 9999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  repairEyebrowRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 5,
  },
  repairEyebrow: { fontSize: 10, fontWeight: "900" },
  repairXpChip: {
    borderRadius: 9999,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  repairXpChipText: { fontSize: 10, fontWeight: "900" },
  repairTitle: { fontSize: 16, fontWeight: "900" },
  repairFactsRow: { flexDirection: "row", gap: 8, marginTop: 12 },
  repairFactChip: {
    flex: 1,
    minWidth: 0,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  repairFactLabel: { fontSize: 9, fontWeight: "900", marginBottom: 3 },
  repairFactValue: { fontSize: 12, fontWeight: "900" },
  repairProgressPanel: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 10,
    marginTop: 10,
  },
  repairProgressHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 8,
  },
  repairProgressTitle: { fontSize: 12, fontWeight: "900" },
  repairProgressHint: { fontSize: 11, fontWeight: "800" },
  repairProgressTrack: {
    height: 7,
    borderRadius: 9999,
    overflow: "hidden",
  },
  repairProgressFill: {
    height: "100%",
    borderRadius: 9999,
  },
  repairReasonBox: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 11,
    paddingVertical: 10,
    marginTop: 10,
  },
  repairReasonLabel: { fontSize: 9, fontWeight: "900", marginBottom: 4 },
  repairReason: { fontSize: 12, fontWeight: "700", lineHeight: 17 },
  repairActionsRow: { flexDirection: "row", gap: 10, marginTop: 12 },
  repairRequesterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 11,
    paddingVertical: 10,
    marginTop: 12,
  },
  repairRequesterText: { fontSize: 12, fontWeight: "800" },
  repairInlineLoadMore: {
    minHeight: 42,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
  },
  loadMoreSecondaryBtn: {
    minHeight: 46,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  loadMoreSecondaryText: { fontSize: 13, fontWeight: "900" },
  repairBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 7,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 40,
  },
  repairBtnText: { fontSize: 13, fontWeight: "900", letterSpacing: 0 },
  participantCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    marginBottom: 14,
  },
  participantSkeletonHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 14,
  },
  participantSkeletonTitleCluster: {
    flex: 1,
    minWidth: 0,
    gap: 8,
  },
  participantSkeletonPills: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  participantSkeletonProgress: {
    gap: 8,
    marginBottom: 14,
  },
  participantSkeletonProgressTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  participantSkeletonFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  participantSkeletonFooterCopy: {
    flex: 1,
    minWidth: 0,
    gap: 8,
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
  memoryVisibilityPill: {
    width: 24,
    height: 24,
    borderRadius: 9999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  participantName: {
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  participantNamePressable: {
    flexGrow: 0,
    flexShrink: 1,
    minWidth: 0,
    maxWidth: "100%",
  },
  participantNamePressed: { opacity: 0.72 },
  participantNameInline: {
    flexGrow: 0,
    flexShrink: 1,
    minWidth: 0,
    maxWidth: "100%",
  },
  streakPlaceholder: { fontSize: 13, fontWeight: "700" },
  noSyncHint: { fontSize: 12, lineHeight: 17, fontStyle: "italic", marginTop: 4 },
});
