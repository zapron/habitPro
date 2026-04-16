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
import { ChevronDown, ChevronUp, Sparkles, ThumbsUp } from "lucide-react-native";
import type { CommunityWinFeedItem } from "../lib/communityWinsApi";
import { buildStreakCelebrationKicker } from "../lib/communityStreakFeedCopy";
import { formatCompletedAt, formatRelativeTime } from "../lib/communityWinFeedFormat";
import type { AppTheme } from "../styles/theme";

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
  /** Returns whether the cheer API succeeded (optimistic list update in parent). */
  onCheer: (win: CommunityWinFeedItem) => Promise<boolean>;
  /** When false, cheering others' wins is off (browse-only). Default true. */
  canCheer?: boolean;
  /** Optional; parent may already handle via `onCheer`. Used for accessibility copy. */
  onCheerBlocked?: () => void;
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
  onCheer,
  canCheer = true,
  onCheerBlocked,
}: Props) {
  const isOwn = sessionUserId === win.user_id;
  const handle = win.username ? `@${win.username}` : "Someone";
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
          ? "Photo: tap to view full screen. Cheering is Habit Plus."
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
        isOwn ? "No photo on your win" : !canCheer ? "No photo. Cheering is Habit Plus." : "Double-tap to cheer"
      }
    >
      <View style={[styles.photoTouchWrap, styles.photoPlaceholder, imgStyle, { backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)" }]}>
        <Sparkles size={36} color={theme.colors.textMuted} strokeWidth={1.8} />
      </View>
    </Pressable>
  );

  return (
    <View style={wrapStyle}>
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
            <Pressable
              onPress={() => void runCheer()}
              disabled={isOwn}
              style={({ pressed }) => [
                styles.cheerTap,
                { opacity: isOwn ? 0.55 : pressed ? 0.7 : 1 },
              ]}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel={
                isOwn
                  ? `${win.cheerCount} cheers on your win`
                  : win.viewerHasCheered
                    ? "Unlike, remove cheer"
                    : "Cheer"
              }
              accessibilityState={{ disabled: isOwn, selected: win.viewerHasCheered }}
            >
              <Animated.View style={{ transform: [{ scale: cheerScale }] }}>
                <View style={styles.cheerIconRow}>
                  <ThumbsUp
                    size={17}
                    color={win.viewerHasCheered ? theme.colors.indigo[400] : theme.colors.textMuted}
                    fill={win.viewerHasCheered ? theme.colors.indigo[400] : "transparent"}
                    strokeWidth={2}
                  />
                  <Text
                    style={[
                      styles.cheerCount,
                      { color: win.viewerHasCheered ? theme.colors.indigo[400] : theme.colors.textMuted },
                    ]}
                  >
                    {win.cheerCount}
                  </Text>
                </View>
              </Animated.View>
            </Pressable>
            <Text style={[styles.handleInline, { color: theme.colors.cyan[400] }]} numberOfLines={1}>
              {handle}
            </Text>
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

        {!hasNote && !expanded ? (
          <Text style={[styles.captionHint, { color: theme.colors.textMuted }]} numberOfLines={2}>
            {isHabitStreak
              ? "Streak moment from a main mission — open View More for time and caption."
              : "From a public mini mission — open View More for completion time and any caption."}
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
