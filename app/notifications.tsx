import { Text } from "../src/components/AppText";
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState } from "react";
import {
  Animated,
  View,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  ActivityIndicator,
  Easing,
  InteractionManager,
} from "react-native";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, Bell } from "lucide-react-native";
import { Screen } from "../src/components/Screen";
import { useTheme } from "../src/context/ThemeContext";
import { useAuth } from "../src/context/AuthContext";
import {
  adjustCachedUnreadNotificationCount,
  getCachedUnreadNotificationCount,
  listNotificationsPage,
  markAllNotificationsRead,
  markNotificationRead,
  setCachedUnreadNotificationCount,
} from "../src/lib/groupChallengesApi";
import { challengeMemoryRouteParamsFromPayload } from "../src/lib/challengeMemoryDetail";
import { parseCommunityWinCheerPayload } from "../src/lib/notificationPayloads";
import { backOrReplace } from "../src/lib/navigation";
import type { ChallengeNudgeKind, NotificationRow } from "../src/types/groupChallenge";
import { ShimmerBlock } from "../src/components/ShimmerBlock";
import { GlassTopHighlight } from "../src/components/GlassTopHighlight";
import { useListCardEntrance } from "../src/hooks/useListCardEntrance";
import type { AppTheme } from "../src/styles/theme";
import { formatDateDisplay, formatDateTimeDisplay } from "../src/utils/dateDisplay";

const NOTIFICATION_PAGE_SIZE = 20;
const NOTIFICATION_FIRST_PAGE_CACHE_TTL_MS = 45_000;

type NotificationFirstPageCache = {
  userId: string;
  items: NotificationRow[];
  hasMore: boolean;
  nextOffset: number | null;
  fetchedAt: number;
};

let notificationFirstPageCache: NotificationFirstPageCache | null = null;
let notificationFirstPageInFlight: Promise<{
  items: NotificationRow[];
  hasMore: boolean;
  nextOffset: number | null;
}> | null = null;

function updateNotificationFirstPageCache(
  userId: string | null,
  updater: (items: NotificationRow[]) => NotificationRow[],
) {
  if (!userId || notificationFirstPageCache?.userId !== userId) return;
  notificationFirstPageCache = {
    ...notificationFirstPageCache,
    items: updater(notificationFirstPageCache.items),
  };
}

function groupMissionInviteSubtitle(n: NotificationRow): string {
  const p = n.payload ?? {};
  const u = p.inviter_username;
  const from =
    typeof u === "string" && u.trim().length > 0 ? `From ${u.trim().toLowerCase()}` : "Group mission";
  return `${from} · Tap to view in Compete`;
}

function inviteeLabel(p: Record<string, unknown>): string {
  const u = p.invitee_username;
  if (typeof u === "string" && u.trim().length > 0) return u.trim().toLowerCase();
  return "Someone";
}

function nudgeKindLabel(kind: unknown): string {
  const k = typeof kind === "string" ? kind : "";
  const map: Record<ChallengeNudgeKind, string> = {
    cheer: "Cheer",
    ping: "What's up?!",
    fire: "Fire",
    congrats: "Congrats",
    custom_note: "a custom note",
  };
  if (k in map) return map[k as ChallengeNudgeKind];
  return k.length > 0 ? k : "Nudge";
}

function textPayloadValue(payload: Record<string, unknown> | undefined, key: string): string | null {
  const value = payload?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function nudgeDayContext(payload: Record<string, unknown>): string | null {
  const parts: string[] = [];
  const missionDay = payload.target_mission_day;
  const dateStr = textPayloadValue(payload, "target_date_str");
  if (typeof missionDay === "number" && Number.isFinite(missionDay)) {
    parts.push(`Day ${missionDay}`);
  }
  if (dateStr) {
    parts.push(formatDateDisplay(dateStr, dateStr));
  }
  return parts.length > 0 ? parts.join(" - ") : null;
}

function formatReminderMinutesLeft(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  const minutes = Math.max(1, Math.round(value));
  const hh = Math.floor(minutes / 60);
  const mm = minutes % 60;
  if (hh > 0 && mm > 0) return `${hh}h ${mm}m`;
  if (hh > 0) return `${hh}h`;
  return `${mm}m`;
}

function streakReminderTitle(payload?: Record<string, unknown>): string {
  const serverTitle = textPayloadValue(payload, "display_title");
  if (serverTitle) return serverTitle;

  const phase = payload?.reminder_phase;
  if (phase === "open") return "Streak window is open";
  if (phase === "custom") return "Streak check-in";
  if (phase === "closing") return "Almost time's up";
  return "Streak window closing";
}

function streakReminderSubtitle(payload: Record<string, unknown>): string {
  const serverBody = textPayloadValue(payload, "display_body");
  if (serverBody) return `${serverBody.replace(/\s*\.\s*$/, "")} · Tap to open`;

  const title = typeof payload.habit_title === "string" ? payload.habit_title : "Mission";
  const phase = payload.reminder_phase;
  if (phase === "open") {
    return `You have 24 hours to finish today's habit for "${title}" · Tap to open`;
  }
  if (phase === "custom") {
    const left = formatReminderMinutesLeft(payload.minutes_left);
    return left
      ? `You have ${left} left to mark today for "${title}" · Tap to open`
      : `Time to mark today for "${title}" · Tap to open`;
  }
  if (phase === "closing") {
    return `You have almost an hour left. Complete your streak for "${title}" · Tap to open`;
  }
  return `About 1 hour left to mark today for "${title}" · Tap to open`;
}

function notificationTitle(type: string, payload?: Record<string, unknown>): string {
  if (type === "streak_window_reminder") {
    return streakReminderTitle(payload);
  }
  switch (type) {
    case "challenge_invite":
      return "Group mission invite";
    case "live_mini_invite":
      return "Live mini invite";
    case "live_mini_accepted":
      return "Live mini accepted";
    case "live_mini_declined":
      return "Live mini declined";
    case "live_mini_completed":
      return "Live mini completed";
    case "challenge_invite_accepted":
      return "Invite accepted";
    case "challenge_invite_declined":
      return "Invite declined";
    case "challenge_nudge":
      return "Squad nudge";
    case "challenge_squad_checkin":
      return "Squad streak";
    case "community_win_cheer": {
      const fs = payload?.feed_source;
      if (fs === "habit_streak") return "Love for your streak";
      return "Cheer on your win";
    }
    case "streak_repair_request":
      return "Streak repair request";
    case "streak_repair_result":
      return payload?.status === "applied" ? "Streak repaired! 🔥" : "Repair request declined";
    default:
      return type;
  }
}

function notificationSubtitle(n: NotificationRow): string | null {
  const p = n.payload ?? {};
  switch (n.type) {
    case "challenge_invite":
      return groupMissionInviteSubtitle(n);
    case "live_mini_invite": {
      const u = p.inviter_username;
      const from =
        typeof u === "string" && u.trim().length > 0 ? `From ${u.trim().toLowerCase()}` : "Live Squad";
      const title = typeof p.mini_mission_title === "string" ? p.mini_mission_title : "mini mission";
      return `${from} invited you to "${title}"`;
    }
    case "live_mini_accepted":
      return `${inviteeLabel(p)} joined your Live Squad`;
    case "live_mini_declined":
      return `${inviteeLabel(p)} declined your Live Squad invite`;
    case "live_mini_completed": {
      const u = p.participant_username;
      const who =
        typeof u === "string" && u.trim().length > 0 ? u.trim().toLowerCase() : "Someone";
      return `${who} completed the live mini mission`;
    }
    case "challenge_invite_accepted":
      return `${inviteeLabel(p)} joined your group mission · Tap to open`;
    case "challenge_invite_declined":
      return `${inviteeLabel(p)} declined · Tap to open`;
    case "challenge_nudge": {
      const from = p.from_username;
      const who =
        typeof from === "string" && from.trim().length > 0 ? from.trim().toLowerCase() : "Someone";
      const kind = p.kind;
      const context = nudgeDayContext(p);
      const suffix = context ? ` · ${context} · Tap to open squad` : " · Tap to open squad";
      if (kind === "custom_note") {
        const msg = typeof p.message === "string" ? p.message.trim() : "";
        const preview = msg.length > 80 ? `${msg.slice(0, 77)}...` : msg;
        return preview.length > 0
          ? `${who}: "${preview}"${suffix}`
          : `${who} sent you a note${suffix}`;
      }
      return `${who} sent you ${nudgeKindLabel(p.kind)}${suffix}`;
    }
    case "challenge_squad_checkin": {
      const from = p.actor_username;
      const who =
        typeof from === "string" && from.trim().length > 0 ? from.trim().toLowerCase() : "Someone";
      const mission =
        typeof p.habit_title === "string" && p.habit_title.trim().length > 0 ? p.habit_title.trim() : "Mission";
      return `${who} updated the streak on “${mission}” · Tap for squad`;
    }
    case "community_win_cheer": {
      const parsed = parseCommunityWinCheerPayload(p);
      if (!parsed) return "Someone cheered your Community win · Tap to view";
      const who =
        parsed.from_username && parsed.from_username !== "someone"
          ? parsed.from_username.toLowerCase()
          : "Someone";
      const title = parsed.mini_mission_title;
      if (parsed.feed_source === "habit_streak") {
        return `${who} cheered your streak moment on “${title}” · Tap to view`;
      }
      return `${who} cheered “${title}” · Tap to view`;
    }
    case "streak_window_reminder": {
      return streakReminderSubtitle(p);
    }
    case "streak_repair_request": {
      const dateStr = typeof p.date_str === "string" ? p.date_str : "a missed day";
      return `A squadmate needs approval to repair ${formatDateDisplay(dateStr, dateStr)} · Tap to review`;
    }
    case "streak_repair_result": {
      const status = typeof p.status === "string" ? p.status : "";
      if (status === "applied") return "Your squad approved — streak is back! · Tap to view mission";
      if (p.reason === "insufficient_xp") return "Approved but insufficient XP · Earn more and retry";
      return "Your repair was declined by the squad · Tap to view";
    }
    default:
      return null;
  }
}

const NotificationListItem = memo(function NotificationListItem({
  item,
  index,
  theme,
  onPress,
}: {
  item: NotificationRow;
  index: number;
  theme: AppTheme;
  onPress: (item: NotificationRow) => void;
}) {
  const title = useMemo(() => notificationTitle(item.type, item.payload), [item.payload, item.type]);
  const subtitle = useMemo(() => notificationSubtitle(item), [item.payload, item.type]);
  const createdAt = useMemo(() => formatDateTimeDisplay(item.created_at, item.created_at), [item.created_at]);
  const entranceStyle = useListCardEntrance(index);

  return (
    <Animated.View style={entranceStyle}>
      <TouchableOpacity
        style={[
          styles.row,
          {
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surface,
            opacity: item.read_at ? 0.72 : 1,
          },
        ]}
        onPress={() => onPress(item)}
      >
        <GlassTopHighlight radius={12} />
        <View style={styles.rowInner}>
          {!item.read_at ? (
            <View style={[styles.unreadDot, { backgroundColor: theme.colors.indigo[500] }]} />
          ) : (
            <View style={styles.unreadSpacer} />
          )}
          <View style={styles.rowTextCol}>
            <Text style={[styles.rowTitle, { color: theme.colors.textPrimary }]}>{title}</Text>
            {subtitle ? (
              <Text style={[styles.rowSubtitle, { color: theme.colors.cyan[400] }]}>{subtitle}</Text>
            ) : null}
            <Text style={[styles.rowTime, { color: theme.colors.textSecondary }]}>{createdAt}</Text>
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
});

export default function NotificationsScreen() {
  const router = useRouter();
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [markingAll, setMarkingAll] = useState(false);
  const userIdRef = useRef<string | null>(userId);
  const itemsRef = useRef<NotificationRow[]>([]);
  const markAllGlow = useRef(new Animated.Value(0)).current;

  itemsRef.current = items;

  useEffect(() => {
    if (!markingAll) {
      markAllGlow.stopAnimation();
      markAllGlow.setValue(0);
      return undefined;
    }

    markAllGlow.setValue(0);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(markAllGlow, {
          toValue: 1,
          duration: 720,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(markAllGlow, {
          toValue: 0,
          duration: 720,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [markAllGlow, markingAll]);

  const markAllGlowOpacity = markAllGlow.interpolate({
    inputRange: [0, 1],
    outputRange: [0.14, 0.36],
  });

  const load = useCallback(async (options?: { force?: boolean }) => {
    const requestedUserId = userId;
    if (!requestedUserId) {
      setItems([]);
      setLoading(false);
      setHasMore(false);
      setNextOffset(null);
      return;
    }

    const cache = notificationFirstPageCache;
    const now = Date.now();
    const canUseCache =
      !options?.force &&
      cache?.userId === requestedUserId &&
      cache.items.length > 0 &&
      now - cache.fetchedAt < NOTIFICATION_FIRST_PAGE_CACHE_TTL_MS;

    if (canUseCache) {
      setItems(cache.items);
      setHasMore(cache.hasMore);
      setNextOffset(cache.nextOffset);
      setLoading(false);
      return;
    }

    if (itemsRef.current.length === 0 || options?.force) {
      setLoading(true);
    }
    try {
      const request =
        !options?.force && notificationFirstPageInFlight
          ? notificationFirstPageInFlight
          : listNotificationsPage({ offset: 0, limit: NOTIFICATION_PAGE_SIZE }).finally(() => {
              notificationFirstPageInFlight = null;
            });
      notificationFirstPageInFlight = request;
      const page = await request;
      if (userIdRef.current !== requestedUserId) return;
      notificationFirstPageCache = {
        userId: requestedUserId,
        items: page.items,
        hasMore: page.hasMore,
        nextOffset: page.nextOffset,
        fetchedAt: Date.now(),
      };
      setItems(page.items);
      setHasMore(page.hasMore);
      setNextOffset(page.nextOffset);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const loadMore = useCallback(async () => {
    if (loading || loadingMore || !hasMore || nextOffset == null) return;
    const requestedUserId = userId;
    if (!requestedUserId) return;
    setLoadingMore(true);
    try {
      const page = await listNotificationsPage({ offset: nextOffset, limit: NOTIFICATION_PAGE_SIZE });
      if (userIdRef.current !== requestedUserId) return;
      setItems((prev) => {
        const seen = new Set(prev.map((item) => item.id));
        return [...prev, ...page.items.filter((item) => !seen.has(item.id))];
      });
      setHasMore(page.hasMore);
      setNextOffset(page.nextOffset);
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, loading, loadingMore, nextOffset, userId]);

  useLayoutEffect(() => {
    userIdRef.current = userId;
    const cache = notificationFirstPageCache;
    if (userId && cache?.userId === userId && cache.items.length > 0) {
      setItems(cache.items);
      setHasMore(cache.hasMore);
      setNextOffset(cache.nextOffset);
      setLoading(false);
    } else {
      setItems([]);
      setHasMore(false);
      setNextOffset(null);
      setLoading(Boolean(userId));
    }
    setMarkingAll(false);
    setLoadingMore(false);
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      const hasRows = itemsRef.current.length > 0;
      if (!hasRows) {
        void load();
        return undefined;
      }
      const task = InteractionManager.runAfterInteractions(() => {
        void load();
      });
      return () => {
        task.cancel?.();
      };
    }, [load]),
  );

  const onPressRow = useCallback((n: NotificationRow) => {
    if (!n.read_at) {
      const readAt = new Date().toISOString();
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read_at: readAt } : x)));
      updateNotificationFirstPageCache(userIdRef.current, (prev) =>
        prev.map((x) => (x.id === n.id ? { ...x, read_at: readAt } : x)),
      );
      adjustCachedUnreadNotificationCount(userIdRef.current, -1);
      void markNotificationRead(n.id).catch(() => undefined);
    }
    const p = n.payload ?? {};
    const challengeId = typeof p.challenge_id === "string" ? p.challenge_id : "";

    if (n.type === "challenge_invite") {
      const iid = typeof p.invite_id === "string" ? p.invite_id : "";
      if (challengeId || iid) {
        router.push({
          pathname: "/(tabs)/compete",
          params: {
            ...(iid ? { inviteId: iid } : {}),
            ...(challengeId ? { challengeId } : {}),
            focusInvites: "1",
          },
        });
      } else {
        router.push({ pathname: "/(tabs)/compete", params: { focusInvites: "1" } });
      }
      return;
    }

    if (
      n.type === "live_mini_invite" ||
      n.type === "live_mini_accepted" ||
      n.type === "live_mini_declined" ||
      n.type === "live_mini_completed"
    ) {
      const sid =
        typeof p.live_mini_squad_id === "string"
          ? p.live_mini_squad_id
          : typeof p.squad_id === "string"
            ? p.squad_id
            : "";
      if (sid) {
        router.push(`/live-mini/${sid}`);
      } else {
        router.push("/mini");
      }
      return;
    }

    if (n.type === "challenge_invite_accepted" || n.type === "challenge_invite_declined") {
      if (challengeId) {
        router.push(`/challenge/${challengeId}`);
      } else {
        router.push("/(tabs)/compete");
      }
      return;
    }

    if (n.type === "challenge_squad_checkin") {
      const params = challengeMemoryRouteParamsFromPayload(p, n.id);
      if (params) {
        router.push({ pathname: "/challenge-memory", params });
      } else if (challengeId) {
        router.push(`/challenge/${challengeId}`);
      } else {
        router.push("/(tabs)/compete");
      }
      return;
    }

    if (n.type === "challenge_nudge" && challengeId) {
      router.push({ pathname: "/challenge/[id]", params: { id: challengeId, tab: "activity" } });
      return;
    }

    if (n.type === "streak_repair_request" && challengeId) {
      const repairId = typeof p.repair_id === "string" ? p.repair_id : "";
      router.push({
        pathname: "/challenge/[id]",
        params: { id: challengeId, tab: "repairs", ...(repairId ? { repairId } : {}) },
      });
      return;
    }

    if (n.type === "streak_repair_result") {
      const hid = typeof p.habit_id === "string" ? p.habit_id : "";
      const repairId = typeof p.repair_id === "string" ? p.repair_id : "";
      if (challengeId) {
        router.push({
          pathname: "/challenge/[id]",
          params: { id: challengeId, tab: "repairs", ...(repairId ? { repairId } : {}) },
        });
      } else if (hid) {
        router.push(`/habit/${hid}`);
      } else {
        router.push("/(tabs)/compete");
      }
      return;
    }

    if (n.type === "community_win_cheer") {
      const parsed = parseCommunityWinCheerPayload(p);
      const winId = parsed?.win_id ?? (typeof p.win_id === "string" ? p.win_id : "");
      if (winId) {
        router.push(`/journey-moment/${winId}`);
      } else {
        router.push({ pathname: "/(tabs)/community" });
      }
      return;
    }

    if (n.type === "streak_window_reminder") {
      const hid = typeof p.habit_id === "string" ? p.habit_id : "";
      if (hid) {
        router.push(`/habit/${hid}`);
      }
    }
  }, [router]);

  const hasUnread = items.some((n) => !n.read_at);

  const onMarkAllRead = async () => {
    if (!hasUnread || markingAll) return;
    setMarkingAll(true);
    const previous = itemsRef.current;
    const previousUnreadCount = getCachedUnreadNotificationCount(userIdRef.current, Number.POSITIVE_INFINITY);
    const previousCacheItems =
      notificationFirstPageCache?.userId === userIdRef.current ? notificationFirstPageCache.items : null;
    const nowIso = new Date().toISOString();
    setItems((prev) => prev.map((n) => (n.read_at ? n : { ...n, read_at: nowIso })));
    updateNotificationFirstPageCache(userIdRef.current, (prev) =>
      prev.map((n) => (n.read_at ? n : { ...n, read_at: nowIso })),
    );
    setCachedUnreadNotificationCount(userIdRef.current, 0);
    try {
      await markAllNotificationsRead();
    } catch (e) {
      setItems(previous);
      if (previousCacheItems) {
        updateNotificationFirstPageCache(userIdRef.current, () => previousCacheItems);
      }
      if (previousUnreadCount != null) {
        setCachedUnreadNotificationCount(userIdRef.current, previousUnreadCount);
      }
      if (__DEV__) console.warn("[notifications] markAllNotificationsRead", e);
    } finally {
      setMarkingAll(false);
    }
  };

  const onRefreshList = useCallback(() => {
    void load({ force: true });
  }, [load]);

  const onEndReachedList = useCallback(() => {
    void loadMore();
  }, [loadMore]);

  const renderNotificationItem = useCallback(
    ({ item, index }: { item: NotificationRow; index: number }) => (
      <NotificationListItem item={item} index={index} theme={theme} onPress={onPressRow} />
    ),
    [onPressRow, theme],
  );

  const emptyList = useMemo(
    () => (
      <View style={[styles.emptyCard, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
        <GlassTopHighlight radius={16} />
        <Bell size={28} color={theme.colors.indigo[400]} />
        <Text style={[styles.emptyTitle, { color: theme.colors.textPrimary }]}>No notifications yet</Text>
        <Text style={[styles.emptyBody, { color: theme.colors.textSecondary }]}>
          Invites, approvals, cheers, and reminders will show up here.
        </Text>
      </View>
    ),
    [theme],
  );

  const listFooter = useMemo(
    () =>
      loadingMore ? (
        <View style={styles.footerLoader}>
          <ActivityIndicator size="small" color={theme.colors.indigo[400]} />
        </View>
      ) : null,
    [loadingMore, theme.colors.indigo],
  );

  return (
    <Screen>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={theme.colors.background} />

      <View style={styles.header}>
        <TouchableOpacity
          style={[styles.iconButton, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
          onPress={() => backOrReplace(router, "/")}
        >
          <ArrowLeft size={theme.icon.xl} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <Text
          style={[styles.title, { color: theme.colors.textPrimary, fontSize: theme.typography.h1 }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.86}
        >
          Notifications
        </Text>
        <TouchableOpacity
          style={[
            styles.markAllBtn,
            {
              borderColor: markingAll ? theme.colors.cyan[400] : theme.colors.border,
              backgroundColor: markingAll
                ? isDark
                  ? "rgba(34,211,238,0.08)"
                  : "rgba(8,145,178,0.06)"
                : theme.colors.surface,
              opacity: !hasUnread && !markingAll ? 0.55 : 1,
            },
            markingAll && {
              shadowColor: theme.colors.cyan[400],
              shadowOpacity: isDark ? 0.34 : 0.22,
              shadowRadius: 9,
              shadowOffset: { width: 0, height: 0 },
              elevation: 3,
            },
          ]}
          onPress={() => void onMarkAllRead()}
          disabled={!hasUnread || markingAll}
          accessibilityRole="button"
          accessibilityLabel={markingAll ? "Marking all notifications read" : "Mark all notifications read"}
        >
          {markingAll ? (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.markAllGlow,
                {
                  opacity: markAllGlowOpacity,
                  backgroundColor: theme.colors.cyan[400],
                  borderColor: theme.colors.cyan[400],
                },
              ]}
            />
          ) : null}
          <Text style={[styles.markAllText, { color: markingAll ? theme.colors.cyan[400] : theme.colors.indigo[400] }]}>
            Mark all read
          </Text>
        </TouchableOpacity>
      </View>

      {loading && items.length === 0 ? (
        <View style={{ marginTop: 10 }}>
          {Array.from({ length: 7 }, (_, i) => (
            <View
              key={i}
              style={[
                styles.row,
                {
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.surface,
                },
              ]}
            >
              <GlassTopHighlight radius={12} />
              <View style={styles.rowInner}>
                <View style={styles.unreadSpacer} />
                <View style={{ flex: 1, gap: 8 }}>
                  <ShimmerBlock
                    isDark={isDark}
                    height={14}
                    radius={7}
                    style={{ width: i % 3 === 0 ? "62%" : i % 3 === 1 ? "74%" : "55%" }}
                  />
                  <ShimmerBlock isDark={isDark} height={12} radius={6} style={{ width: "88%", opacity: 0.95 }} />
                  <ShimmerBlock isDark={isDark} height={12} radius={6} style={{ width: "42%", opacity: 0.9 }} />
                </View>
              </View>
            </View>
          ))}
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: Math.max(insets.bottom, 24) + 8 },
          ]}
          refreshing={loading && items.length > 0}
          onRefresh={onRefreshList}
          onEndReached={onEndReachedList}
          onEndReachedThreshold={0.45}
          ListEmptyComponent={emptyList}
          ListFooterComponent={listFooter}
          renderItem={renderNotificationItem}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 },
  iconButton: { padding: 8, borderRadius: 9999, borderWidth: 1 },
  title: { fontWeight: "800", flex: 1, minWidth: 0 },
  markAllBtn: {
    minWidth: 122,
    minHeight: 38,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 9999,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    position: "relative",
    overflow: "hidden",
  },
  markAllGlow: { ...StyleSheet.absoluteFillObject, borderRadius: 9999, borderWidth: 1 },
  markAllText: { fontWeight: "800", fontSize: 11, letterSpacing: 0.2 },
  listContent: { paddingBottom: 32, flexGrow: 1 },
  row: { borderRadius: 12, borderWidth: 1, padding: 14, marginBottom: 10 },
  rowInner: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  rowTextCol: { flex: 1 },
  rowTitle: { fontWeight: "700" },
  rowSubtitle: { fontSize: 13, marginTop: 4, fontWeight: "600" },
  rowTime: { fontSize: 13, marginTop: 4 },
  unreadDot: { width: 10, height: 10, borderRadius: 9999, marginTop: 5 },
  unreadSpacer: { width: 10, marginTop: 5 },
  footerLoader: { paddingVertical: 18, alignItems: "center", justifyContent: "center" },
  emptyCard: { borderRadius: 16, borderWidth: 1, padding: 20, alignItems: "center", marginTop: 8 },
  emptyTitle: { fontSize: 17, lineHeight: 22, fontWeight: "900", marginTop: 12, textAlign: "center" },
  emptyBody: { fontSize: 13, lineHeight: 19, fontWeight: "600", marginTop: 6, textAlign: "center" },
});
