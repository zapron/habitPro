import { Text } from "../../src/components/AppText";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  InteractionManager,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  type StyleProp,
  useWindowDimensions,
  View,
  type ViewStyle,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ArrowLeft,
  Camera,
  Clock3,
  Flame,
  Image as ImageIcon,
  Radio,
  Sparkles,
  ThumbsUp,
  Trophy,
  X,
  Zap,
} from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path, Rect } from "react-native-svg";

import { Screen } from "../../src/components/Screen";
import { useTheme } from "../../src/context/ThemeContext";
import { useAuth } from "../../src/context/AuthContext";
import { useToast } from "../../src/context/ToastContext";
import { useUsernameGate } from "../../src/context/UsernameGateContext";
import { CommunityWinImageLightbox } from "../../src/components/CommunityWinImageLightbox";
import { LevelXpRing } from "../../src/components/LevelXpRing";
import {
  fetchCommunityPlayerStory,
  fetchCommunityPlayerMissionJourneyPage,
  mergeCommunityPlayerStoryPosts,
  toggleCheer,
  type CommunityPlayerMissionStory,
  type CommunityPlayerProfile,
  type CommunityPlayerStory,
  type CommunityPlayerStoryPost,
  type CommunityPlayerWeeklyRank,
} from "../../src/lib/communityWinsApi";
import { formatRelativeTime } from "../../src/lib/communityWinFeedFormat";
import { levelFromTotalXp, xpInCurrentLevel } from "../../src/utils/xpLevel";
import { playerLeagueForLevel } from "../../src/utils/playerLeague";
import type { AppTheme } from "../../src/styles/theme";

type StoryTab = "missions" | "minis";

const HERO_PHOTO_LIMIT = 10;
const MISSION_STORY_LIMIT = 8;
const GALLERY_PAGE_SIZE = 12;
const MINI_POST_LIMIT = 20;
const STORY_FETCH_LIMIT = 48;
const RECENT_PROOF_BADGE_PATH =
  "M31 4 H69 Q73 4 76 7 L93 24 Q96 27 96 31 V69 Q96 73 93 76 L76 93 Q73 96 69 96 H31 Q27 96 24 93 L7 76 Q4 73 4 69 V31 Q4 27 7 24 L24 7 Q27 4 31 4 Z";
const RECENT_PROOF_BADGE_MASK_PATH = `M0 0 H100 V100 H0 Z ${RECENT_PROOF_BADGE_PATH}`;

function paramString(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function paramNumber(value: string | string[] | undefined): number | null {
  const raw = paramString(value);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function initialsFromName(name: string): string {
  const parts = name.replace(/^@/, "").replace(/_/g, " ").split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  const compact = parts[0] ?? name.replace(/^@/, "");
  if (compact.length >= 2) return compact.slice(0, 2).toUpperCase();
  return compact.slice(0, 1).toUpperCase() || "?";
}

function plural(value: number, one: string, many: string): string {
  return value === 1 ? one : many;
}

function thumbnailUri(uri: string, width: number, height: number): string {
  try {
    const url = new URL(uri);
    const marker = "/storage/v1/object/public/";
    if (!url.pathname.includes(marker)) return uri;
    url.pathname = url.pathname.replace(marker, "/storage/v1/render/image/public/");
    url.searchParams.set("width", String(width));
    url.searchParams.set("height", String(height));
    url.searchParams.set("resize", "cover");
    url.searchParams.set("quality", "58");
    return url.toString();
  } catch {
    return uri;
  }
}

function storyDayLabel(post: CommunityPlayerStoryPost): string {
  const day = post.streakMissionDay ?? post.streakCountAtPost;
  if (typeof day === "number" && Number.isFinite(day) && day > 0) return `Day ${day}`;

  const completedAt = new Date(post.completedAt || post.createdAt);
  if (!Number.isNaN(completedAt.getTime())) {
    return completedAt.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  return "Moment";
}

const STORY_PILL_TONES = [
  "rgba(15, 23, 42, 0.68)",
  "rgba(49, 46, 129, 0.68)",
  "rgba(14, 116, 144, 0.68)",
  "rgba(146, 64, 14, 0.68)",
  "rgba(22, 101, 52, 0.68)",
];

function storyPillTone(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return STORY_PILL_TONES[hash % STORY_PILL_TONES.length];
}

function StatTile({
  label,
  value,
  accent,
  icon,
  theme,
}: {
  label: string;
  value: string | number;
  accent: string;
  icon: ReactNode;
  theme: AppTheme;
}) {
  return (
    <View style={styles.statTile}>
      <View style={styles.statValueRow}>
        <View style={styles.statIcon}>{icon}</View>
        <Text style={[styles.statValue, { color: accent }]} numberOfLines={1}>
          {value}
        </Text>
      </View>
      <Text style={[styles.statLabel, { color: theme.colors.textMuted }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function SegmentButton({
  active,
  label,
  value,
  kind,
  onPress,
  theme,
}: {
  active: boolean;
  label: string;
  value: number;
  kind: StoryTab;
  onPress: () => void;
  theme: AppTheme;
}) {
  const color = active ? theme.colors.textPrimary : theme.colors.textMuted;
  const accent = kind === "missions" ? theme.colors.amber[500] : theme.colors.cyan[400];
  const activeBackground = kind === "missions" ? "rgba(245, 158, 11, 0.14)" : "rgba(34, 211, 238, 0.14)";
  const inactiveBadgeBackground = "rgba(148, 163, 184, 0.1)";
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[
        styles.segmentButton,
        {
          borderColor: active ? accent : "transparent",
          backgroundColor: active ? activeBackground : "transparent",
        },
      ]}
    >
      <View style={styles.segmentLabelRow}>
        {kind === "missions" ? <Flame size={15} color={active ? accent : theme.colors.textMuted} /> : <Zap size={15} color={active ? accent : theme.colors.textMuted} />}
        <Text style={[styles.segmentLabel, { color }]} numberOfLines={1}>
          {label}
        </Text>
        <View
          style={[
            styles.segmentCountBadge,
            {
              borderColor: active ? accent : theme.colors.border,
              backgroundColor: active ? theme.colors.surface : inactiveBadgeBackground,
            },
          ]}
        >
          <Text style={[styles.segmentCount, { color: active ? accent : theme.colors.textMuted }]}>{value}</Text>
        </View>
      </View>
    </Pressable>
  );
}

function StoryThumbnail({
  uri,
  enabled,
  theme,
  style,
}: {
  uri: string;
  enabled: boolean;
  theme: AppTheme;
  style?: StyleProp<ViewStyle>;
}) {
  const [useOriginal, setUseOriginal] = useState(false);
  const thumb = thumbnailUri(uri, 420, 420);
  const displayUri = useOriginal ? uri : thumb;
  return (
    <View
      style={[
        styles.thumbnailFrame,
        {
          backgroundColor: theme.colors.surfaceElevated,
        },
        style,
      ]}
    >
      {enabled ? (
        <Image
          source={{ uri: displayUri, cache: "force-cache" }}
          style={styles.photoFill}
          resizeMode="cover"
          resizeMethod="resize"
          fadeDuration={80}
          onError={() => {
            if (!useOriginal) setUseOriginal(true);
          }}
          accessibilityIgnoresInvertColors
        />
      ) : (
        <View style={styles.photoPlaceholder}>
          <ImageIcon size={18} color={theme.colors.textMuted} />
        </View>
      )}
    </View>
  );
}

function StoryPhotoTile({
  post,
  width,
  height,
  radius = 16,
  theme,
  imagesEnabled,
  onPress,
  onMorePress,
  pillTone,
  imageStyle,
  tileStyle,
  extraCount = 0,
}: {
  post: CommunityPlayerStoryPost;
  width: number;
  height: number;
  radius?: number;
  theme: AppTheme;
  imagesEnabled: boolean;
  onPress?: (uri: string) => void;
  onMorePress?: () => void;
  pillTone?: string;
  imageStyle?: StyleProp<ViewStyle>;
  tileStyle?: StyleProp<ViewStyle>;
  extraCount?: number;
}) {
  const uri = post.memoryImageUrl;
  if (!uri) return null;

  const opensMore = extraCount > 0 && Boolean(onMorePress);
  const resolvedPillTone = pillTone ?? storyPillTone(`${post.feedSource}:${post.title}`);

  return (
    <Pressable
      disabled={!onPress && !onMorePress}
      onPress={() => {
        if (opensMore) {
          onMorePress?.();
          return;
        }
        onPress?.(uri);
      }}
      accessibilityRole={onPress ? "imagebutton" : "image"}
      accessibilityLabel={opensMore ? "View more journey photos" : `Open ${post.title} photo`}
      style={[
        styles.storyPhotoTile,
        {
          width,
          height,
          borderRadius: radius,
        },
        tileStyle,
      ]}
    >
      <StoryThumbnail
        uri={uri}
        enabled={imagesEnabled}
        theme={theme}
        style={[styles.storyPhotoImage, { borderRadius: radius }, imageStyle]}
      />
      <View style={[styles.dayPill, { backgroundColor: resolvedPillTone }]}>
        <Text style={styles.dayPillText} numberOfLines={1}>
          {storyDayLabel(post)}
        </Text>
      </View>
      {extraCount > 0 ? (
        <View style={styles.moreOverlay}>
          <Text style={styles.moreOverlayText}>View more</Text>
          <Text style={styles.moreOverlaySubtext}>+{extraCount} photos</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

function RecentProofBadge({
  post,
  size,
  theme,
  imagesEnabled,
  onPress,
}: {
  post: CommunityPlayerStoryPost;
  size: number;
  theme: AppTheme;
  imagesEnabled: boolean;
  onPress: (uri: string) => void;
}) {
  const uri = post.memoryImageUrl;
  const thumb = uri ? thumbnailUri(uri, Math.round(size * 2), Math.round(size * 2)) : null;
  const [useOriginal, setUseOriginal] = useState(false);
  const displayUri = useOriginal ? uri : thumb ?? uri;
  const pillTone = storyPillTone(`${post.feedSource}:${post.title}`);

  if (!uri) return null;

  return (
    <Pressable
      onPress={() => onPress(uri)}
      accessibilityRole="imagebutton"
      accessibilityLabel={`Open ${post.title} proof`}
      style={[styles.recentProofBadge, { width: size, height: size }]}
    >
      <View style={[styles.recentProofImageFrame, { backgroundColor: theme.colors.surfaceElevated }]}>
        {imagesEnabled && displayUri ? (
          <Image
            source={{ uri: displayUri, cache: "force-cache" }}
            style={styles.photoFill}
            resizeMode="cover"
            resizeMethod="resize"
            fadeDuration={80}
            onError={() => {
              if (!useOriginal) setUseOriginal(true);
            }}
            accessibilityIgnoresInvertColors
          />
        ) : (
          <View style={styles.photoPlaceholder}>
            <ImageIcon size={18} color={theme.colors.textMuted} />
          </View>
        )}
      </View>
      <Svg width={size} height={size} viewBox="0 0 100 100" style={styles.recentProofSvg} pointerEvents="none">
        <Rect x={0} y={0} width={100} height={100} fill="transparent" />
        <Path d={RECENT_PROOF_BADGE_MASK_PATH} fill={theme.colors.background} fillRule="evenodd" />
        <Path d={RECENT_PROOF_BADGE_PATH} fill="none" stroke={pillTone} strokeWidth={1} />
      </Svg>
      <View style={[styles.dayPill, styles.recentProofDayPill, { backgroundColor: pillTone }]}>
        <Text style={styles.dayPillText} numberOfLines={1}>
          {storyDayLabel(post)}
        </Text>
      </View>
    </Pressable>
  );
}

function GalleryMomentCard({
  post,
  width,
  imageHeight,
  theme,
  imagesEnabled,
  onOpenImage,
  onToggleCheer,
  isOwn,
  cheerPending,
  pillTone,
}: {
  post: CommunityPlayerStoryPost;
  width: number;
  imageHeight: number;
  theme: AppTheme;
  imagesEnabled: boolean;
  onOpenImage: (uri: string) => void;
  onToggleCheer: (post: CommunityPlayerStoryPost) => void;
  isOwn: boolean;
  cheerPending: boolean;
  pillTone: string;
}) {
  const note = post.memoryNote?.trim() ?? "";
  const liked = post.viewerHasCheered;

  return (
    <View style={[styles.galleryMomentCard, { width, borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
      <StoryPhotoTile
        post={post}
        width={width}
        height={imageHeight}
        radius={0}
        theme={theme}
        imagesEnabled={imagesEnabled}
        onPress={onOpenImage}
        pillTone={pillTone}
        tileStyle={styles.galleryMomentImage}
        imageStyle={styles.galleryMomentImage}
      />
      <Pressable
        onPress={() => onToggleCheer(post)}
        disabled={isOwn || cheerPending}
        accessibilityRole="button"
        accessibilityState={{ selected: liked, disabled: isOwn || cheerPending }}
        accessibilityLabel={isOwn ? "Likes on your proof" : liked ? "Unlike this proof" : "Like this proof"}
        style={[
          styles.galleryCheerPill,
          {
            borderColor: liked ? theme.colors.indigo[400] : "rgba(255, 255, 255, 0.32)",
            backgroundColor: liked ? "rgba(99, 102, 241, 0.88)" : "rgba(15, 23, 42, 0.72)",
            opacity: isOwn || cheerPending ? 0.68 : 1,
          },
        ]}
      >
        <ThumbsUp
          size={12}
          color="#FFFFFF"
          fill={liked ? "#FFFFFF" : "transparent"}
          strokeWidth={2.2}
        />
        <Text style={[styles.galleryCheerText, { color: "#FFFFFF" }]}>
          {post.cheerCount}
        </Text>
      </Pressable>
      {note ? (
        <View style={styles.galleryMomentBody}>
          <Text style={[styles.galleryMomentNote, { color: theme.colors.textSecondary }]}>
            {note}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function MissionProofTile({
  post,
  width,
  height,
  theme,
  imagesEnabled,
  onPress,
  onMorePress,
  pillTone,
  extraCount = 0,
}: {
  post: CommunityPlayerStoryPost;
  width: number;
  height: number;
  theme: AppTheme;
  imagesEnabled: boolean;
  onPress: (uri: string) => void;
  onMorePress?: () => void;
  pillTone: string;
  extraCount?: number;
}) {
  const uri = post.memoryImageUrl;
  const [useOriginal, setUseOriginal] = useState(false);
  const thumb = uri ? thumbnailUri(uri, Math.round(width * 2), Math.round(height * 2)) : null;
  const displayUri = useOriginal ? uri : thumb ?? uri;
  const opensMore = extraCount > 0 && Boolean(onMorePress);

  if (!uri) return null;

  return (
    <Pressable
      onPress={() => {
        if (opensMore) {
          onMorePress?.();
          return;
        }
        onPress(uri);
      }}
      accessibilityRole="imagebutton"
      accessibilityLabel={opensMore ? "View more journey photos" : `Open ${post.title} photo`}
      style={[styles.missionProofTile, { width, height }]}
    >
      <View
        style={[
          styles.missionProofImageFrame,
          {
            backgroundColor: theme.colors.surfaceElevated,
            borderColor: pillTone,
            borderRadius: Math.min(width, height) / 2,
          },
        ]}
      >
        {imagesEnabled && displayUri ? (
          <Image
            source={{ uri: displayUri, cache: "force-cache" }}
            style={styles.photoFill}
            resizeMode="cover"
            resizeMethod="resize"
            fadeDuration={80}
            onError={() => {
              if (!useOriginal) setUseOriginal(true);
            }}
            accessibilityIgnoresInvertColors
          />
        ) : (
          <View style={styles.photoPlaceholder}>
            <ImageIcon size={18} color={theme.colors.textMuted} />
          </View>
        )}
        {extraCount > 0 ? (
          <View style={styles.moreOverlay}>
            <Text style={styles.moreOverlayText}>View more</Text>
            <Text style={styles.moreOverlaySubtext}>+{extraCount} photos</Text>
          </View>
        ) : null}
      </View>
      <View style={[styles.dayPill, styles.missionProofDayPill, { backgroundColor: pillTone }]}>
        <Text style={[styles.dayPillText, styles.missionProofDayPillText]} numberOfLines={1}>
          {storyDayLabel(post)}
        </Text>
      </View>
    </Pressable>
  );
}

function estimateGalleryMomentHeight(post: CommunityPlayerStoryPost, width: number, imageHeight: number): number {
  const note = post.memoryNote?.trim() ?? "";
  if (!note) return imageHeight;
  const charsPerLine = Math.max(18, Math.floor(width / 6.7));
  const estimatedLines = Math.max(1, Math.ceil(note.length / charsPerLine));
  return imageHeight + 16 + estimatedLines * 17;
}

function buildGalleryMasonryColumns(
  posts: CommunityPlayerStoryPost[],
  columnCount: number,
  width: number,
  imageHeight: number,
): CommunityPlayerStoryPost[][] {
  const count = Math.max(1, columnCount);
  const columns = Array.from({ length: count }, () => [] as CommunityPlayerStoryPost[]);
  const heights = Array.from({ length: count }, () => 0);

  for (const post of posts) {
    let target = 0;
    for (let i = 1; i < heights.length; i += 1) {
      if (heights[i] < heights[target]) target = i;
    }
    columns[target].push(post);
    heights[target] += estimateGalleryMomentHeight(post, width, imageHeight);
  }

  return columns;
}

function MissionStoryCard({
  story,
  theme,
  isDark,
  onOpenGallery,
  onOpenImage,
  photoWidth,
  photoHeight,
  imagesEnabled,
}: {
  story: CommunityPlayerMissionStory;
  theme: AppTheme;
  isDark: boolean;
  onOpenGallery: () => void;
  onOpenImage: (uri: string) => void;
  photoWidth: number;
  photoHeight: number;
  imagesEnabled: boolean;
}) {
  const previewPhotos = story.posts.filter((post) => post.memoryImageUrl).slice(0, 8);
  const latest = story.posts[0];
  const latestNote = latest?.memoryNote?.trim() ?? "";
  const moreCount = Math.max(0, story.photoCount - previewPhotos.length);
  const pillTone = storyPillTone(story.key);
  const proofCount = story.photoCount > 0 ? story.photoCount : story.postCount;
  const proofLabel =
    story.photoCount > 0
      ? `${proofCount} ${plural(proofCount, "photo", "photos")}`
      : `${proofCount} ${plural(proofCount, "moment", "moments")}`;
  const metaPillBackground = isDark ? "rgba(15, 23, 42, 0.38)" : "rgba(248, 250, 252, 0.82)";

  return (
    <View style={[styles.missionCard, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
      <View style={styles.missionHeader}>
        <View style={styles.missionTitleWrap}>
          <Text style={[styles.missionTitle, { color: theme.colors.textPrimary }]} numberOfLines={1}>
            {story.title}
          </Text>
        </View>
        <Pressable
          onPress={onOpenGallery}
          accessibilityRole="button"
          accessibilityLabel={`View ${story.title} journey`}
          style={[styles.journeyButton, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceElevated }]}
        >
          <Text style={[styles.journeyText, { color: theme.colors.indigo[400] }]} numberOfLines={1}>
            View journey
          </Text>
        </Pressable>
      </View>

      <View style={styles.missionStatRow}>
        <View style={[styles.missionStatPill, { borderColor: theme.colors.border, backgroundColor: metaPillBackground }]}>
          <Camera size={9} color={theme.colors.cyan[400]} />
          <Text style={[styles.missionStatText, { color: theme.colors.textSecondary }]} numberOfLines={1}>
            {proofLabel}
          </Text>
        </View>
        <View style={[styles.missionStatPill, { borderColor: theme.colors.border, backgroundColor: metaPillBackground }]}>
          <Clock3 size={9} color={theme.colors.textMuted} />
          <Text style={[styles.missionStatText, { color: theme.colors.textSecondary }]} numberOfLines={1}>
            Last {formatRelativeTime(story.latestAt).replace(/\s+ago$/, "")}
          </Text>
        </View>
        {story.bestStreak ? (
          <View style={[styles.missionStatPill, { borderColor: theme.colors.border, backgroundColor: metaPillBackground }]}>
            <Flame size={9} color={theme.colors.amber[500]} />
            <Text style={[styles.missionStatText, { color: theme.colors.textSecondary }]} numberOfLines={1}>
              Streak {story.bestStreak}d
            </Text>
          </View>
        ) : null}
      </View>

      {previewPhotos.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.missionPhotoRail}
        >
          {previewPhotos.map((post, index) => (
            <MissionProofTile
              key={post.id}
              post={post}
              width={photoWidth}
              height={photoHeight}
              theme={theme}
              imagesEnabled={imagesEnabled}
              onPress={onOpenImage}
              onMorePress={index === previewPhotos.length - 1 ? onOpenGallery : undefined}
              pillTone={pillTone}
              extraCount={index === previewPhotos.length - 1 ? moreCount : 0}
            />
          ))}
        </ScrollView>
      ) : (
        <View style={[styles.textOnlyMoment, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceElevated }]}>
          <Sparkles size={16} color={theme.colors.indigo[400]} />
          <Text style={[styles.textOnlyCopy, { color: theme.colors.textSecondary }]} numberOfLines={2}>
          {latestNote || "A public mission moment without a photo."}
          </Text>
        </View>
      )}
    </View>
  );
}

function MissionGalleryModal({
  mission,
  userId,
  visible,
  theme,
  isDark,
  imagesEnabled,
  onClose,
  onOpenImage,
}: {
  mission: CommunityPlayerMissionStory | null;
  userId: string | null;
  visible: boolean;
  theme: AppTheme;
  isDark: boolean;
  imagesEnabled: boolean;
  onClose: () => void;
  onOpenImage: (uri: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { session } = useAuth();
  const { showToast } = useToast();
  const { requireUsername } = useUsernameGate();
  const [journeyPosts, setJourneyPosts] = useState<CommunityPlayerStoryPost[]>([]);
  const [journeyHasMore, setJourneyHasMore] = useState(false);
  const [journeyLoading, setJourneyLoading] = useState(false);
  const [journeyLoadingMore, setJourneyLoadingMore] = useState(false);
  const [journeyError, setJourneyError] = useState<string | null>(null);
  const [cheeringIds, setCheeringIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (!visible || !mission || !userId) {
      setJourneyPosts([]);
      setJourneyHasMore(false);
      setJourneyError(null);
      setJourneyLoading(false);
      setCheeringIds(new Set());
      return;
    }

    let cancelled = false;
    setJourneyPosts(mission.posts);
    setJourneyHasMore(false);
    setJourneyError(null);
    setJourneyLoading(true);
    setCheeringIds(new Set());

    fetchCommunityPlayerMissionJourneyPage({
      userId,
      missionKey: mission.key,
      missionTitle: mission.title,
      offset: 0,
      limit: GALLERY_PAGE_SIZE,
    })
      .then((res) => {
        if (cancelled) return;
        if (res.ok === true) {
          setJourneyPosts(res.page.posts);
          setJourneyHasMore(res.page.hasMore);
        } else {
          setJourneyError(res.error);
        }
      })
      .catch((e) => {
        if (cancelled) return;
        setJourneyError(e instanceof Error ? e.message : "Could not load journey.");
      })
      .finally(() => {
        if (!cancelled) setJourneyLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [mission, userId, visible]);

  const viewerOwnsJourney = Boolean(session?.user?.id && userId && session.user.id === userId);

  const handleGalleryCheer = useCallback(
    async (post: CommunityPlayerStoryPost) => {
      if (!session?.user) {
        showToast("Sign in to like proofs.", "error");
        return;
      }
      if (viewerOwnsJourney || cheeringIds.has(post.id)) return;

      const ok = await requireUsername("community_like");
      if (!ok) return;

      setCheeringIds((current) => {
        const next = new Set(current);
        next.add(post.id);
        return next;
      });
      setJourneyPosts((current) =>
        current.map((item) =>
          item.id === post.id
            ? {
                ...item,
                viewerHasCheered: !item.viewerHasCheered,
                cheerCount: item.viewerHasCheered ? Math.max(0, item.cheerCount - 1) : item.cheerCount + 1,
              }
            : item,
        ),
      );

      try {
        const result = await toggleCheer(post.id, post.viewerHasCheered);
        if (result.ok === false) {
          setJourneyPosts((current) =>
            current.map((item) =>
              item.id === post.id
                ? {
                    ...item,
                    viewerHasCheered: post.viewerHasCheered,
                    cheerCount: post.cheerCount,
                  }
                : item,
            ),
          );
          showToast(result.error, "error");
        }
      } catch (e) {
        setJourneyPosts((current) =>
          current.map((item) =>
            item.id === post.id
              ? {
                  ...item,
                  viewerHasCheered: post.viewerHasCheered,
                  cheerCount: post.cheerCount,
                }
              : item,
          ),
        );
        showToast(e instanceof Error ? e.message : "Could not update like.", "error");
      } finally {
        setCheeringIds((current) => {
          const next = new Set(current);
          next.delete(post.id);
          return next;
        });
      }
    },
    [cheeringIds, requireUsername, session?.user, showToast, viewerOwnsJourney],
  );

  const loadMoreJourney = useCallback(async () => {
    if (!mission || !userId || journeyLoadingMore || journeyLoading) return;
    setJourneyLoadingMore(true);
    setJourneyError(null);
    try {
      const res = await fetchCommunityPlayerMissionJourneyPage({
        userId,
        missionKey: mission.key,
        missionTitle: mission.title,
        offset: journeyPosts.length,
        limit: GALLERY_PAGE_SIZE,
      });
      if (res.ok === true) {
        setJourneyPosts((current) => mergeCommunityPlayerStoryPosts(current, res.page.posts));
        setJourneyHasMore(res.page.hasMore);
      } else {
        setJourneyError(res.error);
      }
    } catch (e) {
      setJourneyError(e instanceof Error ? e.message : "Could not load more journey.");
    } finally {
      setJourneyLoadingMore(false);
    }
  }, [journeyLoading, journeyLoadingMore, journeyPosts.length, mission, userId]);

  if (!mission) return null;

  const photos = journeyPosts.filter((post) => post.memoryImageUrl);
  const shownPhotos = photos;
  const galleryPadding = 16;
  const galleryGap = 8;
  const galleryColumns = width >= 700 ? 4 : width >= 460 ? 3 : 2;
  const galleryCardWidth = Math.floor(
    (width - galleryPadding * 2 - galleryGap * (galleryColumns - 1)) / galleryColumns,
  );
  const galleryCardHeight = Math.round(galleryCardWidth * 1.28);
  const textMoments = journeyPosts.filter((post) => !post.memoryImageUrl && post.memoryNote?.trim());
  const pillTone = storyPillTone(mission.key);
  const galleryMasonryColumns = buildGalleryMasonryColumns(
    shownPhotos,
    galleryColumns,
    galleryCardWidth,
    galleryCardHeight,
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.galleryRoot, { backgroundColor: theme.colors.background, paddingTop: Math.max(insets.top, 14) }]}>
        <View style={styles.galleryHeader}>
          <View style={styles.galleryTitleWrap}>
            <Text style={[styles.galleryTitle, { color: theme.colors.textPrimary }]} numberOfLines={1}>
              {mission.title}
            </Text>
            <Text style={[styles.gallerySubtitle, { color: theme.colors.textMuted }]} numberOfLines={1}>
              {journeyPosts.length || mission.postCount} loaded - {photos.length || mission.photoCount} photos
            </Text>
          </View>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close story gallery"
            hitSlop={12}
            style={[
              styles.galleryClose,
              {
                borderColor: theme.colors.border,
                backgroundColor: isDark ? theme.colors.surfaceElevated : theme.colors.surface,
              },
            ]}
          >
            <X size={20} color={theme.colors.textPrimary} />
          </Pressable>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 18) + 20 }}
        >
          {shownPhotos.length > 0 ? (
            <View style={[styles.galleryMasonry, { gap: galleryGap, paddingHorizontal: galleryPadding }]}>
              {galleryMasonryColumns.map((column, columnIndex) => (
                <View
                  key={`journey-column-${columnIndex}`}
                  style={[styles.galleryMasonryColumn, { width: galleryCardWidth, gap: galleryGap }]}
                >
                  {column.map((post) => (
                    <GalleryMomentCard
                      key={post.id}
                      post={post}
                      width={galleryCardWidth}
                      imageHeight={galleryCardHeight}
                      theme={theme}
                      imagesEnabled={imagesEnabled}
                      onOpenImage={onOpenImage}
                      onToggleCheer={handleGalleryCheer}
                      isOwn={viewerOwnsJourney}
                      cheerPending={cheeringIds.has(post.id)}
                      pillTone={pillTone}
                    />
                  ))}
                </View>
              ))}
            </View>
          ) : (
            <View style={[styles.emptyState, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
              <Sparkles size={24} color={theme.colors.indigo[400]} />
              <Text style={[styles.emptyTitle, { color: theme.colors.textPrimary }]}>No public photos here</Text>
              <Text style={[styles.emptyBody, { color: theme.colors.textSecondary }]}>
                This mission story has text-only public moments.
              </Text>
            </View>
          )}

          {textMoments.length > 0 ? (
            <View style={styles.galleryNotes}>
              <Text style={[styles.sectionLabel, { color: theme.colors.textMuted }]}>TEXT MOMENTS</Text>
              {textMoments.map((post) => (
                <View
                  key={post.id}
                  style={[styles.galleryNote, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}
                >
                  <Text style={[styles.galleryNoteTitle, { color: theme.colors.textPrimary }]} numberOfLines={1}>
                    {post.title}
                  </Text>
                  <Text style={[styles.galleryNoteBody, { color: theme.colors.textSecondary }]} numberOfLines={3}>
                    {post.memoryNote?.trim()}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

          {journeyLoading ? (
            <View style={styles.galleryStatusRow}>
              <ActivityIndicator size="small" color={theme.colors.indigo[400]} />
              <Text style={[styles.galleryStatusText, { color: theme.colors.textMuted }]}>Loading journey...</Text>
            </View>
          ) : null}

          {journeyError ? (
            <Text style={[styles.galleryErrorText, { color: theme.colors.red[500] }]}>{journeyError}</Text>
          ) : null}

          {journeyHasMore ? (
            <Pressable
              onPress={loadMoreJourney}
              disabled={journeyLoadingMore}
              accessibilityRole="button"
              accessibilityLabel="Load more journey moments"
              style={[styles.loadMoreButton, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}
            >
              <Text style={[styles.loadMoreText, { color: theme.colors.textSecondary }]}>
                {journeyLoadingMore ? "Loading..." : "Load more journey"}
              </Text>
            </Pressable>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

function MiniPostTile({
  post,
  width,
  theme,
  isDark,
  onOpenImage,
  onToggleCheer,
  isOwn,
  cheerPending,
  imagesEnabled,
}: {
  post: CommunityPlayerStoryPost;
  width: number;
  theme: AppTheme;
  isDark: boolean;
  onOpenImage: (uri: string) => void;
  onToggleCheer: (post: CommunityPlayerStoryPost) => void;
  isOwn: boolean;
  cheerPending: boolean;
  imagesEnabled: boolean;
}) {
  const hasImage = Boolean(post.memoryImageUrl);
  const imageUri = post.memoryImageUrl as string | null;
  const [useOriginal, setUseOriginal] = useState(false);
  const thumb = imageUri ? thumbnailUri(imageUri, Math.round(width * 2), Math.round(width * 2.2)) : null;
  const displayUri = useOriginal ? imageUri : thumb;
  const liked = post.viewerHasCheered;
  const cheerButton = (
    <Pressable
      onPress={() => onToggleCheer(post)}
      disabled={isOwn || cheerPending}
      accessibilityRole="button"
      accessibilityState={{ selected: liked, disabled: isOwn || cheerPending }}
      accessibilityLabel={isOwn ? "Likes on your mini proof" : liked ? "Unlike this mini proof" : "Like this mini proof"}
      style={[
        styles.miniImageCheerButton,
        {
          borderColor: liked ? "rgba(245, 158, 11, 0.74)" : isDark ? "rgba(226, 232, 240, 0.24)" : "rgba(15, 23, 42, 0.14)",
          backgroundColor: liked
            ? isDark
              ? "rgba(120, 53, 15, 0.9)"
              : "rgba(255, 251, 235, 0.94)"
            : isDark
              ? "rgba(15, 23, 42, 0.76)"
              : "rgba(255, 255, 255, 0.88)",
          opacity: isOwn || cheerPending ? 0.62 : 1,
        },
      ]}
    >
      <ThumbsUp
        size={12}
        color={liked ? theme.colors.amber[500] : isDark ? "#CBD5E1" : theme.colors.slate[600]}
        fill={liked ? theme.colors.amber[500] : "transparent"}
        strokeWidth={2.2}
      />
      <Text
        style={[
          styles.miniCheerText,
          { color: liked ? theme.colors.amber[500] : isDark ? "#E2E8F0" : theme.colors.slate[700] },
        ]}
        numberOfLines={1}
      >
        {post.cheerCount}
      </Text>
    </Pressable>
  );
  return (
    <View style={[styles.miniTile, { width, borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
      {hasImage ? (
        <View style={styles.miniImageFrame}>
          <Pressable
            onPress={() => onOpenImage(post.memoryImageUrl as string)}
            accessibilityRole="imagebutton"
            accessibilityLabel={`Open ${post.title} photo`}
            style={styles.miniImagePressable}
          >
            {imagesEnabled && displayUri ? (
              <Image
                source={{ uri: displayUri, cache: "force-cache" }}
                style={styles.photoFill}
                resizeMode="cover"
                resizeMethod="resize"
                fadeDuration={80}
                onError={() => {
                  if (!useOriginal) setUseOriginal(true);
                }}
                accessibilityIgnoresInvertColors
              />
            ) : (
              <View style={styles.photoPlaceholder}>
                <ImageIcon size={22} color={theme.colors.textMuted} />
              </View>
            )}
          </Pressable>
          <View style={[styles.dayPill, { backgroundColor: storyPillTone(`${post.feedSource}:${post.title}`) }]}>
            <Text style={styles.dayPillText} numberOfLines={1}>
              {storyDayLabel(post)}
            </Text>
          </View>
          {post.liveSquadId ? (
            <View
              style={[
                styles.liveBadge,
                {
                  borderColor: isDark ? "rgba(103, 232, 249, 0.52)" : "rgba(6, 182, 212, 0.5)",
                  backgroundColor: isDark ? "rgba(8, 47, 73, 0.92)" : "rgba(236, 254, 255, 0.96)",
                },
              ]}
            >
              <Radio size={11} color={theme.colors.cyan[400]} strokeWidth={2.6} />
              <Text style={[styles.liveBadgeText, { color: isDark ? "#A5F3FC" : theme.colors.cyan[400] }]}>LIVE</Text>
            </View>
          ) : null}
          {cheerButton}
        </View>
      ) : (
        <View style={styles.miniImageFrame}>
          <View style={[styles.miniImageFallback, { backgroundColor: theme.colors.surfaceElevated }]}>
            <ImageIcon size={22} color={theme.colors.textMuted} />
          </View>
          <View style={[styles.dayPill, { backgroundColor: storyPillTone(`${post.feedSource}:${post.title}`) }]}>
            <Text style={styles.dayPillText} numberOfLines={1}>
              {storyDayLabel(post)}
            </Text>
          </View>
          {cheerButton}
        </View>
      )}
      <View style={styles.miniBody}>
        <Text style={[styles.miniTitle, { color: theme.colors.textPrimary }]} numberOfLines={2}>
          {post.title}
        </Text>
      </View>
    </View>
  );
}

export default function CommunityPlayerStoryScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { session } = useAuth();
  const { showToast } = useToast();
  const { requireUsername } = useUsernameGate();
  const userId = paramString(params.id);
  const [story, setStory] = useState<CommunityPlayerStory | null>(null);
  const [activeTab, setActiveTab] = useState<StoryTab>("missions");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lightboxUri, setLightboxUri] = useState<string | null>(null);
  const [selectedMission, setSelectedMission] = useState<CommunityPlayerMissionStory | null>(null);
  const [imagesEnabled, setImagesEnabled] = useState(false);
  const [miniCheeringIds, setMiniCheeringIds] = useState<Set<string>>(() => new Set());

  const seedProfile = useMemo<CommunityPlayerProfile | null>(() => {
    if (!userId) return null;
    const username = paramString(params.username);
    const displayName = paramString(params.displayName);
    const xp = paramNumber(params.xp) ?? 0;
    return {
      userId,
      username: username && username.length > 0 ? username : null,
      displayName: displayName && displayName.length > 0 ? displayName : null,
      xp,
      publicWins: 0,
      miniWins: 0,
      habitStreakWins: 0,
      cheersReceived: 0,
      recentWins: [],
    };
  }, [params.displayName, params.username, params.xp, userId]);

  const seedWeekly = useMemo<CommunityPlayerWeeklyRank | null>(() => {
    const rankPosition = paramNumber(params.weeklyRankPosition);
    if (!rankPosition || rankPosition <= 0) return null;
    return {
      rankPosition,
      points: paramNumber(params.weeklyPoints) ?? 0,
      habitCheckIns: paramNumber(params.weeklyHabitCheckIns) ?? 0,
      miniCompletions: paramNumber(params.weeklyMiniCompletions) ?? 0,
    };
  }, [
    params.weeklyHabitCheckIns,
    params.weeklyMiniCompletions,
    params.weeklyPoints,
    params.weeklyRankPosition,
  ]);

  const loadStory = useCallback(async (mode: "initial" | "refresh" = "initial") => {
    if (!userId) {
      setError("Player not found.");
      setLoading(false);
      return;
    }
    if (mode === "refresh") setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await fetchCommunityPlayerStory(userId, STORY_FETCH_LIMIT);
      if (res.ok === true) {
        setStory(res.story);
        setMiniCheeringIds(new Set());
      } else {
        setError(res.error);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not load player story.";
      setError(message);
    }
    setLoading(false);
    setRefreshing(false);
  }, [userId]);

  useEffect(() => {
    void loadStory();
  }, [loadStory]);

  useEffect(() => {
    setImagesEnabled(false);
    const task = InteractionManager.runAfterInteractions(() => {
      setImagesEnabled(true);
    });
    return () => {
      task.cancel();
    };
  }, [activeTab, story?.profile.userId]);

  const viewerOwnsProfile = Boolean(session?.user?.id && userId && session.user.id === userId);

  const handleMiniCheer = useCallback(
    async (post: CommunityPlayerStoryPost) => {
      if (!session?.user) {
        showToast("Sign in to like proofs.", "error");
        return;
      }
      if (viewerOwnsProfile || miniCheeringIds.has(post.id)) return;

      const ok = await requireUsername("community_like");
      if (!ok) return;

      const nextLiked = !post.viewerHasCheered;
      const delta = nextLiked ? 1 : -1;
      setMiniCheeringIds((current) => {
        const next = new Set(current);
        next.add(post.id);
        return next;
      });
      setStory((current) =>
        current
          ? {
              ...current,
              profile: {
                ...current.profile,
                cheersReceived: Math.max(0, current.profile.cheersReceived + delta),
              },
              miniPosts: current.miniPosts.map((item) =>
                item.id === post.id
                  ? {
                      ...item,
                      viewerHasCheered: nextLiked,
                      cheerCount: Math.max(0, item.cheerCount + delta),
                    }
                  : item,
              ),
            }
          : current,
      );

      try {
        const result = await toggleCheer(post.id, post.viewerHasCheered);
        if (result.ok === false) {
          setStory((current) =>
            current
              ? {
                  ...current,
                  profile: {
                    ...current.profile,
                    cheersReceived: Math.max(0, current.profile.cheersReceived - delta),
                  },
                  miniPosts: current.miniPosts.map((item) =>
                    item.id === post.id
                      ? {
                          ...item,
                          viewerHasCheered: post.viewerHasCheered,
                          cheerCount: post.cheerCount,
                        }
                      : item,
                  ),
                }
              : current,
          );
          showToast(result.error, "error");
        }
      } catch (e) {
        setStory((current) =>
          current
            ? {
                ...current,
                profile: {
                  ...current.profile,
                  cheersReceived: Math.max(0, current.profile.cheersReceived - delta),
                },
                miniPosts: current.miniPosts.map((item) =>
                  item.id === post.id
                    ? {
                        ...item,
                        viewerHasCheered: post.viewerHasCheered,
                        cheerCount: post.cheerCount,
                      }
                    : item,
                ),
              }
            : current,
        );
        showToast(e instanceof Error ? e.message : "Could not update like.", "error");
      } finally {
        setMiniCheeringIds((current) => {
          const next = new Set(current);
          next.delete(post.id);
          return next;
        });
      }
    },
    [miniCheeringIds, requireUsername, session?.user, showToast, viewerOwnsProfile],
  );

  const shown = story?.profile ?? seedProfile;
  const weeklyRank = story?.weeklyRank ?? seedWeekly;
  const level = shown ? levelFromTotalXp(shown.xp) : 0;
  const xpInLevel = shown ? xpInCurrentLevel(shown.xp) : 0;
  const league = playerLeagueForLevel(level, theme, isDark);
  const handle = shown?.username ? `@${shown.username}` : "Player";
  const displayName = shown?.displayName?.trim() || null;
  const normalizedDisplayName = displayName?.replace(/^@/, "").trim().toLowerCase();
  const normalizedHandle = shown?.username?.trim().toLowerCase() ?? null;
  const showHandle = Boolean(displayName && normalizedDisplayName !== normalizedHandle);
  const primaryName = displayName ?? handle;

  const photoMoments = useMemo(() => {
    if (!story) return [];
    const missionPhotos = story.missionStories.flatMap((mission) => mission.posts);
    return [...missionPhotos, ...story.miniPosts]
      .filter((post) => Boolean(post.memoryImageUrl))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, HERO_PHOTO_LIMIT);
  }, [story]);

  const visibleMissionStories = useMemo(
    () => story?.missionStories.slice(0, MISSION_STORY_LIMIT) ?? [],
    [story?.missionStories],
  );
  const visibleMiniPosts = useMemo(
    () => story?.miniPosts.slice(0, MINI_POST_LIMIT) ?? [],
    [story?.miniPosts],
  );

  const miniTileWidth = Math.max(132, Math.floor((width - 38) / 2));
  const publicMomentPhotoSize = Math.min(104, Math.max(82, Math.floor((width - 96) / 3)));
  const missionPreviewPhotoSize = Math.min(96, Math.max(78, Math.floor((width - 88) / 4)));
  const bottomPad = Math.max(insets.bottom, 18) + 18;

  return (
    <Screen style={{ backgroundColor: theme.colors.background }}>
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor={theme.colors.background}
      />
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={[styles.backButton, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}
        >
          <ArrowLeft size={20} color={theme.colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.colors.textPrimary }]} numberOfLines={1}>
          Player story
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: bottomPad }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void loadStory("refresh")}
            tintColor={theme.colors.indigo[400]}
          />
        }
      >
        <View style={styles.hero}>
          <LevelXpRing level={level} xpInLevel={xpInLevel} size={94} strokeWidth={5}>
            <View style={[styles.avatar, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
              <Text style={[styles.avatarText, { color: theme.colors.textPrimary }]}>
                {initialsFromName(primaryName)}
              </Text>
            </View>
          </LevelXpRing>
          <View style={styles.heroText}>
            <Text style={[styles.name, { color: theme.colors.textPrimary }]} numberOfLines={2}>
              {primaryName}
            </Text>
            {showHandle ? (
              <Text style={[styles.handle, { color: theme.colors.cyan[400] }]} numberOfLines={1}>
                {handle}
              </Text>
            ) : null}
            <View style={styles.heroPillRow}>
              <View style={[styles.leaguePill, { borderColor: league.color, backgroundColor: league.backgroundColor }]}>
                <Text style={[styles.leagueText, { color: league.color }]} numberOfLines={1}>
                  {league.label}
                </Text>
              </View>
              <View
                style={[
                  styles.levelPill,
                  {
                    borderColor: theme.colors.indigo[400],
                    backgroundColor: isDark ? "rgba(99, 102, 241, 0.14)" : "rgba(99, 102, 241, 0.1)",
                  },
                ]}
              >
                <Text style={[styles.levelPillText, { color: theme.colors.indigo[400] }]} numberOfLines={1}>
                  Level {level}
                </Text>
              </View>
            </View>
          </View>
        </View>

        <View style={[styles.statPanel, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
          <View style={[styles.statPanelRow, styles.statPanelDivider, { borderBottomColor: theme.colors.border }]}>
            <StatTile
              theme={theme}
              label="Weekly rank"
              value={weeklyRank ? `#${weeklyRank.rankPosition}` : "-"}
              accent={theme.colors.amber[500]}
              icon={<Trophy size={15} color={theme.colors.amber[500]} />}
            />
            <StatTile
              theme={theme}
              label="Global rank"
              value={story?.globalRank ? `#${story.globalRank.rankPosition}` : "-"}
              accent={theme.colors.indigo[400]}
              icon={<Sparkles size={15} color={theme.colors.indigo[400]} />}
            />
            <StatTile
              theme={theme}
              label="Week pts"
              value={weeklyRank?.points ?? "-"}
              accent={theme.colors.cyan[400]}
              icon={<Zap size={15} color={theme.colors.cyan[400]} />}
            />
          </View>
          <View style={styles.statPanelRow}>
            <StatTile
              theme={theme}
              label="Public wins"
              value={shown?.publicWins ?? "-"}
              accent={theme.colors.green[500]}
              icon={<Camera size={15} color={theme.colors.green[500]} />}
            />
            <StatTile
              theme={theme}
              label="Photos"
              value={story?.totalPhotoMoments ?? "-"}
              accent={theme.colors.cyan[400]}
              icon={<ImageIcon size={15} color={theme.colors.cyan[400]} />}
            />
            <StatTile
              theme={theme}
              label="Cheers"
              value={shown?.cheersReceived ?? "-"}
              accent={theme.colors.amber[500]}
              icon={<ThumbsUp size={15} color={theme.colors.amber[500]} />}
            />
          </View>
        </View>

        {photoMoments.length > 0 ? (
          <View style={styles.photoStripSection}>
            <Text style={[styles.sectionLabel, { color: theme.colors.textMuted }]}>RECENT PROOFS</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.heroPhotoRail}
            >
              {photoMoments.map((post) => (
                <View key={post.id} style={[styles.publicMomentItem, { width: publicMomentPhotoSize }]}>
                  <RecentProofBadge
                    post={post}
                    size={publicMomentPhotoSize}
                    theme={theme}
                    imagesEnabled={imagesEnabled}
                    onPress={setLightboxUri}
                  />
                  <Text style={[styles.publicMomentTitle, { color: theme.colors.textSecondary }]} numberOfLines={1}>
                    {post.title}
                  </Text>
                </View>
              ))}
            </ScrollView>
          </View>
        ) : null}

        <View
          style={[
            styles.segmentRow,
            {
              borderColor: theme.colors.border,
              backgroundColor: isDark ? "rgba(15, 23, 42, 0.42)" : theme.colors.surfaceElevated,
            },
          ]}
        >
          <SegmentButton
            active={activeTab === "missions"}
            label="Missions"
            value={story?.missionStories.length ?? 0}
            kind="missions"
            onPress={() => setActiveTab("missions")}
            theme={theme}
          />
          <SegmentButton
            active={activeTab === "minis"}
            label="Minis"
            value={story?.miniPosts.length ?? 0}
            kind="minis"
            onPress={() => setActiveTab("minis")}
            theme={theme}
          />
        </View>

        {loading && !story ? (
          <View style={styles.loadingBlock}>
            <ActivityIndicator size="small" color={theme.colors.indigo[400]} />
            <Text style={[styles.loadingText, { color: theme.colors.textMuted }]}>Loading story...</Text>
          </View>
        ) : error ? (
          <View style={[styles.emptyState, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
            <Sparkles size={24} color={theme.colors.textMuted} />
            <Text style={[styles.emptyTitle, { color: theme.colors.textPrimary }]}>Story unavailable</Text>
            <Text style={[styles.emptyBody, { color: theme.colors.textSecondary }]}>{error}</Text>
          </View>
        ) : activeTab === "missions" ? (
          <View style={styles.sectionStack}>
            {story && story.missionStories.length > 0 ? (
              <>
              {visibleMissionStories.map((mission) => (
                <MissionStoryCard
                  key={mission.key}
                  story={mission}
                  theme={theme}
                  isDark={isDark}
                  imagesEnabled={imagesEnabled}
                  onOpenImage={setLightboxUri}
                  photoWidth={missionPreviewPhotoSize}
                  photoHeight={missionPreviewPhotoSize}
                  onOpenGallery={() => setSelectedMission(mission)}
                />
              ))}
              {story.missionStories.length > visibleMissionStories.length ? (
                <Text style={[styles.limitHint, { color: theme.colors.textMuted }]}>
                  Showing the latest {visibleMissionStories.length} mission stories for speed.
                </Text>
              ) : null}
              </>
            ) : (
              <View
                style={[
                  styles.storyEmptyState,
                  {
                    borderColor: theme.colors.border,
                    backgroundColor: isDark ? "rgba(15, 23, 42, 0.34)" : theme.colors.surfaceElevated,
                  },
                ]}
              >
                <View
                  style={[
                    styles.storyEmptyIcon,
                    {
                      borderColor: "rgba(245, 158, 11, 0.32)",
                      backgroundColor: isDark ? "rgba(245, 158, 11, 0.12)" : "rgba(245, 158, 11, 0.09)",
                    },
                  ]}
                >
                  <Flame size={17} color={theme.colors.amber[500]} />
                </View>
                <View style={styles.storyEmptyCopy}>
                  <Text style={[styles.storyEmptyTitle, { color: theme.colors.textPrimary }]} numberOfLines={1}>
                    No public missions yet
                  </Text>
                  <Text style={[styles.storyEmptyBody, { color: theme.colors.textMuted }]} numberOfLines={1}>
                    Main-mission proofs will show here.
                  </Text>
                </View>
              </View>
            )}
          </View>
        ) : (
          <View style={styles.miniGrid}>
            {story && story.miniPosts.length > 0 ? (
              <>
              {visibleMiniPosts.map((post) => (
                <MiniPostTile
                  key={post.id}
                  post={post}
                  width={miniTileWidth}
                  theme={theme}
                  isDark={isDark}
                  imagesEnabled={imagesEnabled}
                  onOpenImage={setLightboxUri}
                  onToggleCheer={handleMiniCheer}
                  isOwn={viewerOwnsProfile}
                  cheerPending={miniCheeringIds.has(post.id)}
                />
              ))}
              {story.miniPosts.length > visibleMiniPosts.length ? (
                <Text style={[styles.limitHint, { color: theme.colors.textMuted }]}>
                  Showing the latest {visibleMiniPosts.length} public minis for speed.
                </Text>
              ) : null}
              </>
            ) : (
              <View
                style={[
                  styles.storyEmptyState,
                  {
                    borderColor: theme.colors.border,
                    backgroundColor: isDark ? "rgba(15, 23, 42, 0.34)" : theme.colors.surfaceElevated,
                  },
                ]}
              >
                <View
                  style={[
                    styles.storyEmptyIcon,
                    {
                      borderColor: "rgba(34, 211, 238, 0.32)",
                      backgroundColor: isDark ? "rgba(34, 211, 238, 0.12)" : "rgba(34, 211, 238, 0.09)",
                    },
                  ]}
                >
                  <Zap size={17} color={theme.colors.cyan[400]} />
                </View>
                <View style={styles.storyEmptyCopy}>
                  <Text style={[styles.storyEmptyTitle, { color: theme.colors.textPrimary }]} numberOfLines={1}>
                    No public minis yet
                  </Text>
                  <Text style={[styles.storyEmptyBody, { color: theme.colors.textMuted }]} numberOfLines={1}>
                    Mini proofs will show here.
                  </Text>
                </View>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      <MissionGalleryModal
        visible={selectedMission !== null}
        mission={selectedMission}
        userId={userId}
        theme={theme}
        isDark={isDark}
        imagesEnabled={imagesEnabled}
        onClose={() => setSelectedMission(null)}
        onOpenImage={setLightboxUri}
      />

      <CommunityWinImageLightbox
        visible={lightboxUri !== null}
        imageUri={lightboxUri}
        onClose={() => setLightboxUri(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { fontSize: 16, lineHeight: 21, fontWeight: "900" },
  headerSpacer: { width: 42 },
  hero: { flexDirection: "row", alignItems: "center", gap: 16, paddingTop: 4, paddingBottom: 16 },
  avatar: {
    width: 70,
    height: 70,
    borderRadius: 35,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 21, lineHeight: 26, fontWeight: "900" },
  heroText: { flex: 1, minWidth: 0 },
  name: { fontSize: 26, lineHeight: 32, fontWeight: "900" },
  handle: { fontSize: 14, lineHeight: 19, fontWeight: "800", marginTop: 2 },
  heroPillRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6, marginTop: 10 },
  leaguePill: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: 9999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  leagueText: { fontSize: 11, lineHeight: 14, fontWeight: "900" },
  levelPill: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: 9999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  levelPillText: { fontSize: 11, lineHeight: 14, fontWeight: "900" },
  statPanel: {
    borderWidth: 1,
    borderRadius: 16,
    overflow: "hidden",
  },
  statPanelRow: {
    minHeight: 48,
    flexDirection: "row",
  },
  statPanelDivider: { borderBottomWidth: 1 },
  statTile: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 6,
    paddingVertical: 7,
    alignItems: "center",
    justifyContent: "center",
    gap: 1,
  },
  statValueRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, maxWidth: "100%" },
  statIcon: { width: 16, height: 18, alignItems: "center", justifyContent: "center" },
  statValue: { fontSize: 15, lineHeight: 18, fontWeight: "900", fontVariant: ["tabular-nums"] },
  statLabel: { width: "100%", fontSize: 9, lineHeight: 12, fontWeight: "900", marginTop: 1, textAlign: "center" },
  photoStripSection: { marginTop: 16 },
  sectionLabel: { fontSize: 11, lineHeight: 15, fontWeight: "900", marginBottom: 10 },
  heroPhotoRail: { gap: 10, paddingRight: 12 },
  publicMomentItem: { alignItems: "center", gap: 6 },
  publicMomentTitle: { fontSize: 10, lineHeight: 13, fontWeight: "900", textAlign: "center" },
  recentProofBadge: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  recentProofImageFrame: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
    borderRadius: 12,
  },
  recentProofSvg: {
    position: "absolute",
    left: 0,
    top: 0,
  },
  thumbnailFrame: { overflow: "hidden" },
  storyPhotoTile: {
    overflow: "hidden",
    backgroundColor: "rgba(148, 163, 184, 0.14)",
  },
  storyPhotoImage: { width: "100%", height: "100%" },
  dayPill: {
    position: "absolute",
    left: 6,
    top: 6,
    minHeight: 19,
    borderRadius: 9999,
    paddingHorizontal: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  recentProofDayPill: { left: 8, top: 5, minHeight: 18 },
  dayPillText: { color: "#FFFFFF", fontSize: 9, lineHeight: 11, fontWeight: "900" },
  photoFill: { width: "100%", height: "100%" },
  photoPlaceholder: { flex: 1, alignItems: "center", justifyContent: "center" },
  segmentRow: {
    flexDirection: "row",
    gap: 6,
    marginTop: 18,
    marginBottom: 12,
    borderWidth: 1,
    borderRadius: 18,
    padding: 4,
  },
  segmentButton: {
    flex: 1,
    minHeight: 40,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 9,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  segmentLabelRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, minWidth: 0 },
  segmentLabel: { flexShrink: 1, fontSize: 14, lineHeight: 18, fontWeight: "900" },
  segmentCountBadge: {
    minWidth: 21,
    height: 21,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  segmentCount: { fontSize: 11, lineHeight: 14, fontWeight: "900", fontVariant: ["tabular-nums"] },
  sectionStack: { gap: 10 },
  missionCard: { borderRadius: 15, borderWidth: 1, padding: 9, overflow: "hidden" },
  missionHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  missionTitleWrap: { flex: 1, minWidth: 0 },
  missionTitle: { fontSize: 14, lineHeight: 18, fontWeight: "900" },
  missionStatRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 5, overflow: "hidden" },
  missionStatPill: {
    minHeight: 19,
    maxWidth: "100%",
    flexShrink: 1,
    borderWidth: 1,
    borderRadius: 9999,
    paddingHorizontal: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  missionStatText: { flexShrink: 1, fontSize: 9, lineHeight: 11, fontWeight: "900" },
  journeyButton: {
    minHeight: 27,
    minWidth: 96,
    maxWidth: 112,
    borderWidth: 1,
    borderRadius: 9999,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  journeyText: { fontSize: 10, lineHeight: 13, fontWeight: "900" },
  missionPhotoRail: { gap: 8, paddingTop: 12, paddingRight: 4 },
  moreOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15, 23, 42, 0.58)",
  },
  moreOverlayText: { color: "#FFFFFF", fontSize: 11, lineHeight: 14, fontWeight: "900" },
  moreOverlaySubtext: { color: "#FFFFFF", fontSize: 9, lineHeight: 12, fontWeight: "800", marginTop: 1 },
  textOnlyMoment: {
    marginTop: 10,
    borderRadius: 12,
    borderWidth: 1,
    minHeight: 62,
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  textOnlyCopy: { flex: 1, minWidth: 0, fontSize: 12, lineHeight: 16, fontWeight: "800" },
  miniGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  miniTile: { borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  miniImageFrame: { width: "100%", aspectRatio: 0.9, overflow: "hidden" },
  miniImagePressable: { width: "100%", height: "100%" },
  miniImageFallback: { width: "100%", height: "100%", alignItems: "center", justifyContent: "center" },
  liveBadge: {
    position: "absolute",
    right: 8,
    top: 8,
    borderRadius: 9999,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  liveBadgeText: { fontSize: 9, lineHeight: 12, fontWeight: "900" },
  miniBody: { paddingHorizontal: 10, paddingVertical: 9 },
  miniTitle: { fontSize: 13, lineHeight: 17, fontWeight: "900" },
  miniImageCheerButton: {
    position: "absolute",
    right: 8,
    bottom: 8,
    minHeight: 24,
    minWidth: 44,
    borderRadius: 9999,
    borderWidth: 1,
    paddingHorizontal: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  miniCheerText: { fontSize: 11, lineHeight: 14, fontWeight: "900", fontVariant: ["tabular-nums"] },
  loadingBlock: { alignItems: "center", justifyContent: "center", minHeight: 180, gap: 10 },
  loadingText: { fontSize: 13, lineHeight: 18, fontWeight: "800" },
  emptyState: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 18,
    alignItems: "center",
  },
  emptyTitle: { fontSize: 16, lineHeight: 21, fontWeight: "900", textAlign: "center", marginTop: 10 },
  emptyBody: { fontSize: 13, lineHeight: 19, fontWeight: "700", textAlign: "center", marginTop: 6 },
  storyEmptyState: {
    width: "100%",
    minHeight: 68,
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  storyEmptyIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  storyEmptyCopy: { flex: 1, minWidth: 0 },
  storyEmptyTitle: { fontSize: 14, lineHeight: 18, fontWeight: "900" },
  storyEmptyBody: { fontSize: 11, lineHeight: 15, fontWeight: "800", marginTop: 2 },
  galleryRoot: { flex: 1 },
  galleryHeader: {
    minHeight: 58,
    paddingHorizontal: 16,
    paddingBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  galleryTitleWrap: { flex: 1, minWidth: 0 },
  galleryTitle: { fontSize: 19, lineHeight: 25, fontWeight: "900" },
  gallerySubtitle: { fontSize: 12, lineHeight: 16, fontWeight: "800", marginTop: 2 },
  galleryClose: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  galleryMasonry: { flexDirection: "row", alignItems: "flex-start", paddingTop: 12 },
  galleryMasonryColumn: { flexDirection: "column" },
  missionProofTile: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible",
  },
  missionProofImageFrame: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
    borderWidth: 1,
  },
  missionProofDayPill: { left: 38, top: -1, minHeight: 16, paddingHorizontal: 5 },
  missionProofDayPillText: { fontSize: 8, lineHeight: 10 },
  galleryMomentCard: {
    position: "relative",
    borderRadius: 10,
    borderWidth: 1,
    overflow: "hidden",
  },
  galleryMomentImage: {
    borderRadius: 0,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  galleryCheerPill: {
    position: "absolute",
    right: 7,
    top: 7,
    minHeight: 25,
    minWidth: 42,
    borderRadius: 9999,
    borderWidth: 1,
    paddingHorizontal: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  galleryCheerText: { fontSize: 11, lineHeight: 14, fontWeight: "900", fontVariant: ["tabular-nums"] },
  galleryMomentBody: {
    paddingHorizontal: 9,
    paddingVertical: 8,
  },
  galleryMomentNote: { fontSize: 12, lineHeight: 17, fontWeight: "700" },
  galleryStatusRow: {
    minHeight: 42,
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  galleryStatusText: { fontSize: 12, lineHeight: 16, fontWeight: "800" },
  galleryErrorText: {
    marginTop: 14,
    marginHorizontal: 16,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "800",
    textAlign: "center",
  },
  loadMoreButton: {
    minHeight: 44,
    marginTop: 16,
    marginHorizontal: 16,
    borderRadius: 9999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  loadMoreText: { fontSize: 13, lineHeight: 18, fontWeight: "900" },
  galleryNotes: { paddingHorizontal: 16, paddingTop: 22, gap: 10 },
  galleryNote: { borderRadius: 14, borderWidth: 1, padding: 12 },
  galleryNoteTitle: { fontSize: 13, lineHeight: 18, fontWeight: "900" },
  galleryNoteBody: { fontSize: 13, lineHeight: 19, fontWeight: "700", marginTop: 5 },
  limitHint: { width: "100%", fontSize: 12, lineHeight: 17, fontWeight: "800", textAlign: "center", paddingVertical: 8 },
});
