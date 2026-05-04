import { Text } from "./AppText";
import {
  useCallback,
  useEffect,
  useRef,
  useState } from "react";
import {
  View,
  Pressable,
  StyleSheet,
  Image,
  Dimensions,
  Animated,
} from "react-native";
import * as Haptics from "expo-haptics";
import {
  Camera,
  ChevronDown,
  ChevronUp,
  Flame,
  Sparkles,
  ThumbsUp,
  Trophy,
  Zap,
} from "lucide-react-native";
import type { CommunityWinFeedItem } from "../lib/communityWinsApi";
import { buildStreakCelebrationKicker } from "../lib/communityStreakFeedCopy";
import { formatCompletedAt, formatRelativeTime } from "../lib/communityWinFeedFormat";
import type { AppTheme } from "../styles/theme";
import { CoachMarkTarget, type CoachMarkId } from "../context/CoachMarkContext";
import { levelFromTotalXp } from "../utils/xpLevel";
import { playerLeagueForLevel } from "../utils/playerLeague";

const SCREEN_W = Dimensions.get("window").width;
/** Second tap within this gap counts as double-tap (cheer + burst). */
const DOUBLE_TAP_GAP_MS = 280;
/** Single tap opens lightbox only after this delay if no second tap arrives. */
const LIGHTBOX_DELAY_MS = 360;

type Props = {
  win: CommunityWinFeedItem;
  variant: "feed" | "cards";
  isDark: boolean;
  theme: AppTheme;
  sessionUserId: string | null | undefined;
  expanded: boolean;
  reduceMotion: boolean;
  onToggleExpanded: () => void;
  onOpenLightbox: (uri: string) => void;
  onOpenPlayer?: (win: CommunityWinFeedItem) => void;
  /** Returns whether the cheer API succeeded (optimistic list update in parent). */
  onCheer: (win: CommunityWinFeedItem) => Promise<boolean>;
  onOpenCheerers?: (win: CommunityWinFeedItem) => void;
  /** When false, cheering others' wins is off (browse-only). Default true. */
  canCheer?: boolean;
  /** Optional; parent may already handle via `onCheer`. Used for accessibility copy. */
  onCheerBlocked?: () => void;
  cheerCoachId?: CoachMarkId | null;
};

function CheerBurstOverlay({
  burstKey,
  reduceMotion,
  thumbColor,
}: {
  burstKey: number;
  reduceMotion: boolean;
  thumbColor: string;
}) {
  const drivers = useRef(Array.from({ length: 6 }, () => new Animated.Value(0))).current;

  useEffect(() => {
    if (reduceMotion || burstKey < 1) return;
    drivers.forEach((d) => d.setValue(0));
    const anim = Animated.stagger(
      42,
      drivers.map((d) =>
        Animated.sequence([
          Animated.timing(d, { toValue: 1, duration: 420, useNativeDriver: true }),
          Animated.timing(d, { toValue: 0, duration: 200, useNativeDriver: true }),
        ]),
      ),
    );
    anim.start();
    return () => anim.stop();
  }, [burstKey, reduceMotion, drivers]);

  if (reduceMotion || burstKey < 1) return null;

  return (
    <View style={styles.burstLayer} pointerEvents="none">
      {drivers.map((d, i) => {
        const angle = (Math.PI * 2 * i) / 6;
        const dx = Math.cos(angle) * 56;
        const dy = Math.sin(angle) * 56;
        const opacity = d.interpolate({ inputRange: [0, 0.2, 0.55, 1], outputRange: [0, 1, 1, 0] });
        const scale = d.interpolate({ inputRange: [0, 0.45, 1], outputRange: [0.35, 1.2, 0.85] });
        const tx = d.interpolate({ inputRange: [0, 1], outputRange: [0, dx] });
        const ty = d.interpolate({ inputRange: [0, 1], outputRange: [0, dy] });
        return (
          <Animated.View
            key={`t-${i}`}
            style={[
              styles.burstThumbWrap,
              {
                opacity,
                transform: [{ translateX: tx }, { translateY: ty }, { scale }],
              },
            ]}
          >
            <ThumbsUp size={26} color={thumbColor} fill={thumbColor} strokeWidth={2} />
          </Animated.View>
        );
      })}
    </View>
  );
}

export function CommunityWinFeedPost({
  win,
  variant,
  isDark,
  theme,
  sessionUserId,
  expanded,
  reduceMotion,
  onToggleExpanded,
  onOpenLightbox,
  onOpenPlayer,
  onCheer,
  onOpenCheerers,
  canCheer = true,
  onCheerBlocked,
  cheerCoachId,
}: Props) {
  const isOwn = sessionUserId === win.user_id;
  const handle = win.username ? `@${win.username}` : "Someone";
  const displayName = win.displayName?.trim() || null;
  const normalizedDisplayName = displayName?.replace(/^@/, "").trim().toLowerCase();
  const normalizedHandle = win.username?.trim().toLowerCase() ?? null;
  const showHandle = Boolean(displayName && normalizedDisplayName !== normalizedHandle);
  const primaryName = displayName ?? handle;
  const isFeed = variant === "feed";
  const hasNote = Boolean((win.memory_note ?? "").trim());
  /** Older rows used synthetic id before feed_source existed */
  const legacyHabitStreak =
    win.feed_source === "mini" && win.mini_mission_id.startsWith("habitwin:");
  const isHabitStreak = win.feed_source === "habit_streak" || legacyHabitStreak;
  const legacyMissionTitle = win.title.replace(/\s*·\s*Day\s+\d+\s*$/i, "").trim();
  const streakKicker =
    win.feed_source === "habit_streak" &&
    typeof win.streak_mission_day === "number" &&
    typeof win.streak_count_at_post === "number"
      ? buildStreakCelebrationKicker({
          displayName: handle,
          missionTitle: win.title,
          missionDay: win.streak_mission_day,
          streakCount: win.streak_count_at_post,
        })
      : legacyHabitStreak
        ? {
            line1: `${handle} shared a streak moment 🔥`,
            missionLine: legacyMissionTitle.length > 0 ? legacyMissionTitle : win.title,
          }
        : null;
  const level = levelFromTotalXp(win.xp);
  const playerLeague = playerLeagueForLevel(level, theme, isDark);
  const sourceLabel = isHabitStreak ? "Habit streak" : "Mini win";
  const hasMoment = Boolean(win.memory_image_url || hasNote);

  const lastTapRef = useRef(0);
  const lightboxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [burstKey, setBurstKey] = useState(0);
  const cheerScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    return () => {
      if (lightboxTimerRef.current) clearTimeout(lightboxTimerRef.current);
    };
  }, []);

  const pumpCheer = useCallback(() => {
    if (reduceMotion) return;
    cheerScale.setValue(1);
    Animated.sequence([
      Animated.spring(cheerScale, { toValue: 1.14, friction: 5, useNativeDriver: true }),
      Animated.spring(cheerScale, { toValue: 1, friction: 7, useNativeDriver: true }),
    ]).start();
  }, [cheerScale, reduceMotion]);

  const fireCheerSuccessFx = useCallback(() => {
    if (reduceMotion) return;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    pumpCheer();
  }, [pumpCheer, reduceMotion]);

  const runCheer = useCallback(async () => {
    const ok = await onCheer(win);
    if (ok) fireCheerSuccessFx();
    return ok;
  }, [onCheer, win, fireCheerSuccessFx]);

  const clearLightboxTimer = useCallback(() => {
    if (lightboxTimerRef.current) {
      clearTimeout(lightboxTimerRef.current);
      lightboxTimerRef.current = null;
    }
  }, []);

  const scheduleLightbox = useCallback(
    (uri: string) => {
      clearLightboxTimer();
      lightboxTimerRef.current = setTimeout(() => {
        lightboxTimerRef.current = null;
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onOpenLightbox(uri);
      }, LIGHTBOX_DELAY_MS);
    },
    [clearLightboxTimer, onOpenLightbox],
  );

  const onImageAreaPress = useCallback(
    (uri: string | null) => {
      const now = Date.now();
      const delta = now - lastTapRef.current;
      lastTapRef.current = now;

      if (delta > 0 && delta < DOUBLE_TAP_GAP_MS) {
        clearLightboxTimer();
        lastTapRef.current = 0;
        if (!isOwn) {
          if (!canCheer) {
            onCheerBlocked?.();
            return;
          }
          if (!reduceMotion) setBurstKey((k) => k + 1);
          void runCheer();
        } else if (!reduceMotion) {
          setBurstKey((k) => k + 1);
        }
        return;
      }

      if (uri) scheduleLightbox(uri);
    },
    [clearLightboxTimer, scheduleLightbox, isOwn, reduceMotion, runCheer, canCheer, onCheerBlocked],
  );

  const imgStyle = isFeed
    ? [styles.memImgFeed, { width: SCREEN_W, aspectRatio: 1 }]
    : [styles.memImgCard, { aspectRatio: 1 }];

  const tileBorder = {
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
  };

  const cheerButton = (
    <Pressable
      onPress={() => void runCheer()}
      disabled={isOwn}
      style={({ pressed }) => [styles.cheerTap, { opacity: isOwn ? 0.55 : pressed ? 0.7 : 1 }]}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      accessibilityRole="button"
      accessibilityLabel={isOwn ? "Cheer" : win.viewerHasCheered ? "Unlike, remove cheer" : "Cheer"}
      accessibilityState={{ disabled: isOwn, selected: win.viewerHasCheered }}
    >
      <Animated.View style={{ transform: [{ scale: cheerScale }] }}>
        <ThumbsUp
          size={17}
          color={win.viewerHasCheered ? theme.colors.indigo[400] : theme.colors.textMuted}
          fill={win.viewerHasCheered ? theme.colors.indigo[400] : "transparent"}
          strokeWidth={2}
        />
      </Animated.View>
    </Pressable>
  );

  const wrapStyle = isFeed
    ? [styles.feedTile, tileBorder, { marginBottom: 12 }]
    : [
        styles.card,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          ...theme.shadow.card,
        },
      ];

  const imageBlock = win.memory_image_url ? (
    <Pressable
      onPress={() => onImageAreaPress(win.memory_image_url)}
      accessibilityRole="imagebutton"
      accessibilityLabel={
        !isOwn && !canCheer
          ? "Photo: tap to view full screen. Cheering is HabitPro Community."
          : "Photo: double-tap to cheer, tap to view full screen"
      }
    >
      <View style={styles.photoTouchWrap}>
        <Image
          source={{ uri: win.memory_image_url }}
          style={imgStyle}
          resizeMode="cover"
          accessibilityIgnoresInvertColors
        />
        <CheerBurstOverlay burstKey={burstKey} reduceMotion={reduceMotion} thumbColor={theme.colors.indigo[400]} />
      </View>
    </Pressable>
  ) : (
    <Pressable
      onPress={() => onImageAreaPress(null)}
      disabled={isOwn}
      accessibilityRole="button"
      accessibilityLabel={
        isOwn ? "No photo on your win" : !canCheer ? "No photo. Cheering is HabitPro Community." : "Double-tap to cheer"
      }
    >
      <View style={[styles.photoTouchWrap, styles.photoPlaceholder, imgStyle, { backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)" }]}>
        <Sparkles size={36} color={theme.colors.textMuted} strokeWidth={1.8} />
      </View>
    </Pressable>
  );

  return (
    <View style={wrapStyle}>
      <View
        style={[
          styles.postHeader,
          isFeed ? styles.padHFeed : styles.padCardInner,
          { borderBottomColor: theme.colors.border },
        ]}
      >
        <Pressable
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onOpenPlayer?.(win);
          }}
          style={({ pressed }) => [styles.playerTap, { opacity: pressed ? 0.76 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel={`Open ${primaryName} player card`}
        >
          <View style={styles.playerTextCol}>
            <Text style={[styles.playerName, { color: theme.colors.textPrimary }]} numberOfLines={1}>
              {primaryName}
            </Text>
            <View style={styles.playerLeagueRow}>
              {showHandle ? (
                <>
                  <Text style={[styles.playerHandle, { color: theme.colors.cyan[400] }]} numberOfLines={1}>
                    {handle}
                  </Text>
                  <Text style={[styles.playerDot, { color: theme.colors.textMuted }]}>/</Text>
                </>
              ) : null}
              <Text style={[styles.playerLeague, { color: playerLeague.color }]} numberOfLines={1}>
                {playerLeague.label}
              </Text>
            </View>
          </View>
        </Pressable>
        <View
          style={[
            styles.sourcePill,
            {
              backgroundColor: playerLeague.backgroundColor,
              borderColor: isHabitStreak ? theme.colors.amber[500] : theme.colors.indigo[400],
            },
          ]}
        >
          {isHabitStreak ? (
            <Flame size={12} color={theme.colors.amber[500]} />
          ) : (
            <Trophy size={12} color={theme.colors.indigo[400]} />
          )}
          <Text
            style={[
              styles.sourcePillText,
              { color: isHabitStreak ? theme.colors.amber[500] : theme.colors.indigo[400] },
            ]}
            numberOfLines={1}
          >
            {sourceLabel}
          </Text>
        </View>
      </View>

      {imageBlock}

      {streakKicker ? (
        <View
          style={[
            styles.streakBanner,
            {
              borderLeftColor: theme.colors.amber[500],
              backgroundColor: isDark ? "rgba(245, 158, 11, 0.12)" : "rgba(234, 88, 12, 0.09)",
            },
            isFeed ? styles.padHFeed : styles.padCardInner,
          ]}
          accessibilityRole="text"
          accessibilityLabel={`${streakKicker.line1}. ${streakKicker.missionLine}`}
        >
          <Text style={[styles.streakLine1, { color: theme.colors.textPrimary }]}>{streakKicker.line1}</Text>
          <Text style={[styles.streakMission, { color: theme.colors.amber[500] }]} numberOfLines={2}>
            {streakKicker.missionLine}
          </Text>
        </View>
      ) : null}

      <View
        style={[
          styles.metaBlock,
          isFeed ? styles.padHFeed : styles.padCardInner,
          { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.border },
        ]}
      >
        <View style={styles.cheerTimeRow}>
          <View style={styles.cheerTimeLeft}>
            <View style={styles.cheerIconRow}>
              {cheerCoachId ? <CoachMarkTarget id={cheerCoachId}>{cheerButton}</CoachMarkTarget> : cheerButton}

              <Pressable
                onPress={() => onOpenCheerers?.(win)}
                disabled={win.cheerCount < 1}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel={win.cheerCount < 1 ? "No cheers yet" : `View ${win.cheerCount} cheerers`}
              >
                <Text
                  style={[
                    styles.cheerCount,
                    { color: win.viewerHasCheered ? theme.colors.indigo[400] : theme.colors.textMuted },
                  ]}
                >
                  {win.cheerCount}
                </Text>
              </Pressable>
            </View>
            <View style={[styles.winMetricPill, { backgroundColor: theme.colors.surfaceElevated, borderColor: theme.colors.border }]}>
              <Zap size={11} color={theme.colors.yellow[400]} fill={theme.colors.yellow[400]} />
              <Text style={[styles.winMetricPillText, { color: theme.colors.textSecondary }]}>{win.xp} XP</Text>
            </View>
            <View style={[styles.winMetricPill, { backgroundColor: theme.colors.surfaceElevated, borderColor: theme.colors.border }]}>
              <Camera size={11} color={hasMoment ? theme.colors.amber[500] : theme.colors.textMuted} />
              <Text style={[styles.winMetricPillText, { color: theme.colors.textSecondary }]}>
                {hasMoment ? "Moment" : "Win"}
              </Text>
            </View>
            {isOwn ? (
              <Text style={[styles.ownHint, { color: theme.colors.textMuted }]}>Your win</Text>
            ) : !canCheer ? (
              <Text style={[styles.plusCheerHint, { color: theme.colors.textMuted }]}>Plus</Text>
            ) : null}
          </View>
          <Text style={[styles.timeInline, { color: theme.colors.textMuted }]}>
            {formatRelativeTime(win.created_at)}
          </Text>
        </View>

        <View style={styles.titleViewMoreRow}>
          <Text style={[styles.missionTitle, { color: theme.colors.textPrimary }]} numberOfLines={3}>
            {win.title}
          </Text>
          <Pressable
            onPress={onToggleExpanded}
            style={({ pressed }) => [
              styles.viewMorePill,
              {
                borderColor: expanded
                  ? theme.colors.indigo[400]
                  : isDark
                    ? "rgba(165, 180, 252, 0.38)"
                    : "rgba(79, 70, 229, 0.32)",
                backgroundColor: expanded
                  ? isDark
                    ? "rgba(99, 102, 241, 0.14)"
                    : "rgba(79, 70, 229, 0.08)"
                  : "transparent",
                opacity: pressed ? 0.82 : 1,
              },
            ]}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={expanded ? "View Less" : "View More"}
          >
            <View style={styles.viewMorePillInner}>
              <Text style={[styles.viewMorePillText, { color: theme.colors.indigo[400] }]}>
                {expanded ? "View Less" : "View More"}
              </Text>
              {expanded ? (
                <ChevronUp size={11} color={theme.colors.indigo[400]} strokeWidth={2.4} />
              ) : (
                <ChevronDown size={11} color={theme.colors.indigo[400]} strokeWidth={2.4} />
              )}
            </View>
          </Pressable>
        </View>

        {hasNote && !expanded ? (
          <Text style={[styles.memNotePreview, { color: theme.colors.textSecondary }]} numberOfLines={2}>
            {win.memory_note}
          </Text>
        ) : !hasNote && !expanded ? (
          <Text style={[styles.captionHint, { color: theme.colors.textMuted }]} numberOfLines={2}>
            {isHabitStreak
              ? "Streak moment from a main mission. Open View More for time and caption."
              : "From a public mini mission. Open View More for completion time and any caption."}
          </Text>
        ) : null}

        {expanded ? (
          <View style={styles.expandedBlock}>
            {hasNote ? (
              <Text style={[styles.memNoteFull, { color: theme.colors.textSecondary }]}>{win.memory_note}</Text>
            ) : null}
            <Text style={[styles.completedLine, { color: theme.colors.textMuted }]}>
              Mission completed {formatCompletedAt(win.completed_at)}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  feedTile: {
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
    overflow: "hidden",
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 0,
    marginBottom: 14,
    overflow: "hidden",
  },
  photoTouchWrap: {
    position: "relative",
  },
  burstLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  burstThumbWrap: {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: 28,
    height: 28,
    marginLeft: -14,
    marginTop: -14,
    alignItems: "center",
    justifyContent: "center",
  },
  memImgFeed: {
    backgroundColor: "#0a0a0a",
  },
  memImgCard: {
    width: "100%",
    backgroundColor: "#0a0a0a",
  },
  photoPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  postHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingTop: 12,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  playerTap: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 0,
  },
  playerTextCol: { flex: 1, minWidth: 0 },
  playerName: { fontSize: 15, lineHeight: 19, fontWeight: "900" },
  playerLeagueRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2, minWidth: 0 },
  playerHandle: { flexShrink: 1, minWidth: 0, fontSize: 12, lineHeight: 16, fontWeight: "800" },
  playerDot: { fontSize: 11, fontWeight: "900" },
  playerLeague: { flexShrink: 1, minWidth: 0, fontSize: 11, lineHeight: 15, fontWeight: "900" },
  sourcePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderRadius: 9999,
    paddingHorizontal: 9,
    paddingVertical: 6,
    maxWidth: 112,
    flexShrink: 0,
  },
  sourcePillText: { fontSize: 10, lineHeight: 13, fontWeight: "900", letterSpacing: 0.2 },
  streakBanner: {
    paddingVertical: 12,
    borderLeftWidth: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(245, 158, 11, 0.25)",
  },
  streakLine1: {
    fontSize: 15,
    fontWeight: "800",
    lineHeight: 21,
    letterSpacing: -0.2,
  },
  streakMission: {
    fontSize: 13,
    fontWeight: "700",
    marginTop: 4,
    lineHeight: 18,
    letterSpacing: 0.1,
  },
  metaBlock: {
    paddingTop: 14,
    paddingBottom: 10,
  },
  padHFeed: { paddingHorizontal: 16 },
  padCardInner: { paddingHorizontal: 16 },
  cheerTimeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  cheerTimeLeft: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1, minWidth: 0 },
  cheerIconRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  winMetricPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderRadius: 9999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  winMetricPillText: { fontSize: 10, lineHeight: 13, fontWeight: "900", fontVariant: ["tabular-nums"] },
  handleInline: { fontSize: 14, fontWeight: "700", flex: 1, minWidth: 0, marginLeft: 2, letterSpacing: 0.1 },
  timeInline: {
    fontSize: 12,
    fontWeight: "600",
    flexShrink: 0,
    fontVariant: ["tabular-nums"],
    opacity: 0.92,
  },
  titleViewMoreRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 12,
  },
  missionTitle: {
    fontSize: 17,
    fontWeight: "800",
    lineHeight: 23,
    flex: 1,
    minWidth: 0,
    paddingRight: 4,
    letterSpacing: -0.2,
  },
  captionHint: {
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18,
    marginTop: 8,
    fontStyle: "italic",
    opacity: 0.88,
  },
  memNotePreview: {
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20,
    marginTop: 8,
  },
  viewMorePill: {
    flexShrink: 0,
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 9999,
    borderWidth: 1,
    marginTop: 2,
    justifyContent: "center",
  },
  viewMorePillInner: { flexDirection: "row", alignItems: "center", gap: 3 },
  viewMorePillText: { fontSize: 11, fontWeight: "800", lineHeight: 15, letterSpacing: 0.12 },
  expandedBlock: { marginTop: 10 },
  memNoteFull: { fontSize: 15, lineHeight: 22, marginBottom: 10 },
  completedLine: { fontSize: 13, fontWeight: "600", lineHeight: 18 },
  cheerTap: {
    paddingVertical: 2,
    paddingRight: 4,
  },
  cheerCount: {
    fontSize: 12,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
    minWidth: 14,
  },
  ownHint: { fontSize: 12, fontWeight: "600" },
  plusCheerHint: { fontSize: 10, fontWeight: "900", letterSpacing: 0.4 },
});
