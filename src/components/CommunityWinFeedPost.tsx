import { Text } from "./AppText";
import {
  memo,
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
  type StyleProp,
  type ViewStyle,
} from "react-native";
import * as Haptics from "expo-haptics";
import {
  ChevronDown,
  ChevronUp,
  Radio,
  Sparkles,
  ThumbsUp,
} from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
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
/** RN aspectRatio is width / height; below 1 makes community moments slightly taller. */
const COMMUNITY_PHOTO_ASPECT_RATIO = 0.9;

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

export const CommunityWinFeedPost = memo(function CommunityWinFeedPost({
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
  const noteText = (win.memory_note ?? "").trim();
  const hasNote = noteText.length > 0;
  const hasLongNote = noteText.length > 90 || noteText.includes("\n");
  /** Older rows used synthetic id before feed_source existed */
  const legacyHabitStreak =
    win.feed_source === "mini" && win.mini_mission_id.startsWith("habitwin:");
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
            line1: "Streak moment",
            missionLine: `on ${legacyMissionTitle.length > 0 ? legacyMissionTitle : win.title}`,
          }
        : null;
  const level = levelFromTotalXp(win.xp);
  const playerLeague = playerLeagueForLevel(level, theme, isDark);
  const showMissionTitle = !streakKicker;
  const showDetailsToggle = hasLongNote || expanded;
  const isLiveSquadWin = win.feed_source === "mini" && Boolean(win.live_squad_id);
  const showMiniMissionBanner = showMissionTitle;

  const lastTapRef = useRef(0);
  const lightboxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [burstKey, setBurstKey] = useState(0);
  const cheerScale = useRef(new Animated.Value(1)).current;
  const imageOpacity = useRef(new Animated.Value(0)).current;
  const [imageLoaded, setImageLoaded] = useState(false);

  useEffect(() => {
    return () => {
      if (lightboxTimerRef.current) clearTimeout(lightboxTimerRef.current);
    };
  }, []);

  useEffect(() => {
    imageOpacity.setValue(0);
    setImageLoaded(false);
  }, [imageOpacity, win.memory_image_url]);

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

  const photoFrameStyle: StyleProp<ViewStyle> = isFeed
    ? [styles.photoTouchWrap, { width: SCREEN_W, aspectRatio: COMMUNITY_PHOTO_ASPECT_RATIO }]
    : [styles.photoTouchWrap, { aspectRatio: COMMUNITY_PHOTO_ASPECT_RATIO }];

  const handleImageLoad = useCallback(() => {
    setImageLoaded(true);
    Animated.timing(imageOpacity, {
      toValue: 1,
      duration: reduceMotion ? 0 : 220,
      useNativeDriver: true,
    }).start();
  }, [imageOpacity, reduceMotion]);

  const tileBorder = {
    borderColor: isDark ? "rgba(148, 163, 184, 0.2)" : "rgba(148, 163, 184, 0.34)",
    backgroundColor: isDark ? "rgba(15, 23, 42, 0.96)" : theme.colors.background,
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
    ? [
        styles.feedTile,
        tileBorder,
        {
          marginBottom: 14,
        },
      ]
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
      <View style={photoFrameStyle}>
        <Image
          source={{ uri: win.memory_image_url }}
          style={styles.photoImageFill}
          resizeMode="cover"
          blurRadius={18}
          accessibilityIgnoresInvertColors
        />
        {!imageLoaded ? (
          <LinearGradient
            pointerEvents="none"
            colors={
              isDark
                ? ["rgba(6, 182, 212, 0.16)", "rgba(99, 102, 241, 0.12)", "rgba(2, 6, 23, 0.34)"]
                : ["rgba(207, 250, 254, 0.38)", "rgba(238, 242, 255, 0.4)", "rgba(255, 247, 237, 0.42)"]
            }
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.photoImageFill}
          />
        ) : null}
        <Animated.Image
          source={{ uri: win.memory_image_url }}
          style={[styles.photoImageFill, { opacity: imageOpacity }]}
          resizeMode="cover"
          onLoad={handleImageLoad}
          accessibilityIgnoresInvertColors
        />
        {!imageLoaded ? <View pointerEvents="none" style={styles.photoLoadGlow} /> : null}
        {isLiveSquadWin ? (
          <View
            pointerEvents="none"
            style={[
              styles.liveSquadPhotoBadge,
              {
                backgroundColor: isDark ? "rgba(8, 47, 73, 0.88)" : "rgba(236, 254, 255, 0.94)",
                borderColor: isDark ? "rgba(34, 211, 238, 0.42)" : "rgba(6, 182, 212, 0.28)",
              },
            ]}
          >
            <Radio size={12} color={theme.colors.cyan[400]} strokeWidth={2.4} />
            <Text style={[styles.liveSquadPhotoBadgeText, { color: theme.colors.cyan[400] }]} numberOfLines={1}>
              Live Squad
            </Text>
          </View>
        ) : null}
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
      <View style={[photoFrameStyle, styles.photoPlaceholder, { backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)" }]}>
        <Sparkles size={36} color={theme.colors.textMuted} strokeWidth={1.8} />
      </View>
    </Pressable>
  );

  return (
    <View style={wrapStyle}>
      {imageBlock}

      {streakKicker ? (
        <LinearGradient
          colors={
            isDark
              ? ["rgba(8, 47, 73, 0.72)", "rgba(49, 46, 129, 0.58)", "rgba(88, 28, 135, 0.42)"]
              : ["rgba(207, 250, 254, 0.74)", "rgba(238, 242, 255, 0.78)", "rgba(255, 247, 237, 0.76)"]
          }
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={[
            styles.streakBanner,
            {
              borderLeftColor: isDark ? "rgba(34, 211, 238, 0.82)" : "rgba(6, 182, 212, 0.72)",
              borderBottomColor: isDark ? "rgba(34, 211, 238, 0.14)" : "rgba(245, 158, 11, 0.14)",
            },
            isFeed ? styles.padHFeed : styles.padCardInner,
          ]}
          accessibilityRole="text"
          accessibilityLabel={`${streakKicker.line1}. ${streakKicker.missionLine}`}
        >
          <Text style={[styles.streakLine1, { color: isDark ? theme.colors.textPrimary : theme.colors.cyan[500] }]}>
            {streakKicker.line1}
          </Text>
          <Text style={[styles.streakMission, { color: isDark ? theme.colors.cyan[400] : theme.colors.indigo[600] }]} numberOfLines={2}>
            {streakKicker.missionLine}
          </Text>
        </LinearGradient>
      ) : null}

      {showMiniMissionBanner ? (
        <LinearGradient
          colors={
            isDark
              ? ["rgba(8, 47, 73, 0.72)", "rgba(49, 46, 129, 0.58)", "rgba(30, 41, 59, 0.72)"]
              : ["rgba(236, 254, 255, 0.92)", "rgba(238, 242, 255, 0.92)", "rgba(255, 255, 255, 0.96)"]
          }
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={[
            styles.miniMissionBanner,
            {
              borderLeftColor: isDark ? "rgba(34, 211, 238, 0.82)" : "rgba(6, 182, 212, 0.72)",
              borderBottomColor: isDark ? "rgba(34, 211, 238, 0.14)" : "rgba(99, 102, 241, 0.14)",
            },
            isFeed ? styles.padHFeed : styles.padCardInner,
          ]}
          accessibilityRole="text"
          accessibilityLabel={`Mini Mission. ${win.title}`}
        >
          <Text style={[styles.miniMissionBannerLabel, { color: theme.colors.cyan[400] }]}>Mini Mission</Text>
          <Text
            style={[
              styles.miniMissionBannerTitle,
              { color: isDark ? theme.colors.textPrimary : theme.colors.indigo[600] },
            ]}
            numberOfLines={2}
          >
            {win.title}
          </Text>
        </LinearGradient>
      ) : null}

      <View
        style={[
          styles.metaBlock,
          isFeed ? styles.padHFeed : styles.padCardInner,
          { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.border },
        ]}
      >
        <View style={styles.postIdentityRow}>
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
              <View style={styles.playerNameLeagueRow}>
                <Text style={[styles.playerName, { color: theme.colors.textPrimary }]} numberOfLines={1}>
                  {primaryName}
                </Text>
                <Text
                  style={[
                    styles.playerLeague,
                    {
                      color: playerLeague.color,
                      backgroundColor: playerLeague.backgroundColor,
                      borderColor: playerLeague.color,
                    },
                  ]}
                  numberOfLines={1}
                >
                  {playerLeague.label}
                </Text>
              </View>
              {showHandle ? (
                <Text style={[styles.playerHandle, { color: theme.colors.cyan[400] }]} numberOfLines={1}>
                  {handle}
                </Text>
              ) : null}
            </View>
          </Pressable>

          <View style={styles.postActionRow}>
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
            <Text style={[styles.timeInline, { color: theme.colors.textMuted }]}>
              {formatRelativeTime(win.created_at)}
            </Text>
          </View>
        </View>
        {hasNote ? (
          <View style={styles.captionRow}>
            <View style={styles.captionTextCol}>
              {hasNote && !expanded ? (
                <Text style={[styles.memNotePreview, { color: theme.colors.textMuted }]} numberOfLines={2}>
                  {noteText}
                </Text>
              ) : null}
            </View>
            {showDetailsToggle ? (
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
            ) : null}
          </View>
        ) : null}

        {expanded ? (
          <View style={styles.expandedBlock}>
            {hasNote ? (
              <Text style={[styles.memNoteFull, { color: theme.colors.textSecondary }]}>{noteText}</Text>
            ) : null}
            <Text style={[styles.completedLine, { color: theme.colors.textMuted }]}>
              Mission completed {formatCompletedAt(win.completed_at)}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  feedTile: {
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
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
    overflow: "hidden",
    backgroundColor: "#0a0a0a",
  },
  photoImageFill: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
  },
  photoLoadGlow: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
  },
  liveSquadPhotoBadge: {
    position: "absolute",
    left: 14,
    top: 14,
    maxWidth: 142,
    minHeight: 28,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 9999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  liveSquadPhotoBadgeText: {
    flexShrink: 1,
    fontSize: 12,
    lineHeight: 14,
    fontWeight: "900",
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
  photoPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  playerTap: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 0,
  },
  playerTextCol: { flex: 1, minWidth: 0 },
  playerNameLeagueRow: { flexDirection: "row", alignItems: "center", gap: 6, minWidth: 0 },
  playerName: { fontSize: 15, lineHeight: 19, fontWeight: "900" },
  playerHandle: { flexShrink: 1, minWidth: 0, fontSize: 12, lineHeight: 16, fontWeight: "800" },
  playerLeague: {
    flexShrink: 0,
    maxWidth: 112,
    overflow: "hidden",
    borderWidth: 1,
    borderRadius: 9999,
    paddingHorizontal: 7,
    paddingVertical: 2,
    fontSize: 10,
    lineHeight: 12,
    fontWeight: "900",
    textAlign: "center",
    textAlignVertical: "center",
  },
  streakBanner: {
    paddingTop: 8,
    paddingBottom: 8,
    borderLeftWidth: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  streakLine1: {
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 17,
    letterSpacing: -0.2,
  },
  streakMission: {
    fontSize: 12,
    fontWeight: "700",
    marginTop: 1,
    lineHeight: 16,
    letterSpacing: 0.1,
  },
  miniMissionBanner: {
    paddingTop: 8,
    paddingBottom: 8,
    borderLeftWidth: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  miniMissionBannerLabel: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "900",
    letterSpacing: 1,
  },
  miniMissionBannerTitle: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "900",
    marginTop: 2,
  },
  metaBlock: {
    paddingTop: 6,
    paddingBottom: 7,
  },
  padHFeed: { paddingHorizontal: 16 },
  padCardInner: { paddingHorizontal: 16 },
  cheerIconRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  timeInline: {
    fontSize: 12,
    fontWeight: "600",
    flexShrink: 0,
    fontVariant: ["tabular-nums"],
    opacity: 0.92,
  },
  postIdentityRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  postActionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
  },
  titleViewMoreRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 12,
  },
  captionRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
    marginTop: 4,
  },
  captionTextCol: {
    flex: 1,
    minWidth: 0,
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
  memNotePreview: {
    fontSize: 13,
    fontWeight: "500",
    lineHeight: 18,
  },
  viewMorePill: {
    flexShrink: 0,
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 9999,
    borderWidth: 1,
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
});
