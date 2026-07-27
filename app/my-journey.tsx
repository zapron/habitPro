import { Text } from "../src/components/AppText";
import type { ReactNode } from "react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Image,
  InteractionManager,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import type { ImageStyle, LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { FlashList, type ListRenderItem } from "@shopify/flash-list";
import Svg, { ClipPath, Defs, Image as SvgImage, Path } from "react-native-svg";
import {
  ArrowLeft,
  Camera,
  Clock3,
  Copy,
  Flame,
  Globe,
  Image as ImageIcon,
  Info,
  LockKeyhole,
  ThumbsUp,
  Trophy,
  User,
  X,
  Zap,
} from "lucide-react-native";
import { useShallow } from "zustand/react/shallow";

import { Screen } from "../src/components/Screen";
import { AnimatedCountText } from "../src/components/AnimatedCountText";
import { LevelXpRing } from "../src/components/LevelXpRing";
import { GlassTopHighlight } from "../src/components/GlassTopHighlight";
import { useListCardEntrance } from "../src/hooks/useListCardEntrance";
import { useCardMaterialize } from "../src/hooks/useCardMaterialize";
import { useAuth } from "../src/context/AuthContext";
import { useTheme } from "../src/context/ThemeContext";
import { showAppAlert } from "../src/context/AppDialogContext";
import { useHabitStore } from "../src/store/habitStore";
import type { AppTheme } from "../src/styles/theme";
import type { Habit, MiniMission, StreakMemory } from "../src/types/habit";
import {
  fetchCommunityPlayerStory,
  fetchCommunityPlayerStoryPage,
  type CommunityMemoryGalleryItem,
  type CommunityPlayerMissionStory,
  type CommunityPlayerProfile,
  type CommunityPlayerStory,
  type CommunityPlayerStoryPage,
  type CommunityPlayerStoryPost,
  type CommunityPlayerWeeklyRank,
} from "../src/lib/communityWinsApi";
import { formatRelativeTime } from "../src/lib/communityWinFeedFormat";
import { formatDateDisplay } from "../src/utils/dateDisplay";
import { getJourneyMiniGridLayout } from "../src/utils/journeyMiniGrid";
import { levelFromTotalXp, xpInCurrentLevel } from "../src/utils/xpLevel";
import { playerLeagueForLevel } from "../src/utils/playerLeague";
import { storageThumbnailUri } from "../src/utils/imageThumbnail";

type StoryTab = "missions" | "minis";
type JourneyMode = "public" | "private";
type JourneyStoryData = {
  missionStories: CommunityPlayerMissionStory[];
  miniPosts: CommunityPlayerStoryPost[];
};
type StoryRow =
  | { kind: "mission"; story: CommunityPlayerMissionStory }
  | { kind: "mini"; post: CommunityPlayerStoryPost };

const STORY_FETCH_LIMIT = 48;
const HERO_PHOTO_LIMIT = 8;
const MISSION_STORY_LIMIT = 8;
const MINI_POST_LIMIT = 20;
const DAY_PILL_BACKGROUND = "rgba(14, 116, 144, 0.86)";
const COMMUNITY_BADGE_BACKGROUND = "rgba(79, 70, 229, 0.9)";
const LIKE_BADGE_BACKGROUND = "rgba(15, 23, 42, 0.76)";
const PRIVATE_BADGE_BACKGROUND = "rgba(8, 145, 178, 0.86)";
const RECENT_PROOF_BADGE_PATH =
  "M33 5 H67 Q71 5 74 8 L92 26 Q95 29 95 33 V67 Q95 71 92 74 L74 92 Q71 95 67 95 H33 Q29 95 26 92 L8 74 Q5 71 5 67 V33 Q5 29 8 26 L26 8 Q29 5 33 5 Z";

function paramString(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
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

function missionDescriptionText(story: CommunityPlayerMissionStory): string {
  const description = story.description?.trim();
  return description || "No mission description is available for this mission yet.";
}

function safeDate(iso: string | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function sortTime(iso: string | undefined): number {
  return safeDate(iso)?.getTime() ?? 0;
}

function storyDayLabel(post: CommunityPlayerStoryPost): string {
  const day = post.streakMissionDay ?? post.streakCountAtPost;
  if (typeof day === "number" && Number.isFinite(day) && day > 0) return `Day ${day}`;

  const completedAt = safeDate(post.completedAt || post.createdAt);
  if (completedAt) return formatDateDisplay(completedAt, "Moment");
  return "Moment";
}

function storyProgressValue(post: CommunityPlayerStoryPost): number {
  const day = post.streakMissionDay ?? post.streakCountAtPost;
  if (typeof day === "number" && Number.isFinite(day) && day > 0) return day;
  const completed = sortTime(post.completedAt);
  if (completed > 0) return completed / 86400000;
  return sortTime(post.createdAt) / 86400000;
}

function compareJourneyProgress(a: CommunityPlayerStoryPost, b: CommunityPlayerStoryPost): number {
  const progress = storyProgressValue(a) - storyProgressValue(b);
  if (progress !== 0) return progress;
  return sortTime(a.createdAt) - sortTime(b.createdAt);
}

function estimateGalleryCardHeight(post: CommunityPlayerStoryPost, width: number): number {
  const note = post.memoryNote?.trim() ?? "";
  const imageHeight = post.memoryImageUrl ? Math.max(150, Math.min(220, width * 1.12)) : 0;
  const charsPerLine = Math.max(14, Math.floor(width / 7));
  const noteLines = note ? Math.min(9, Math.max(1, Math.ceil(note.length / charsPerLine))) : 1;
  const textHeight = noteLines * 17 + 16;
  const textOnlyTop = post.memoryImageUrl ? 0 : 34;
  return imageHeight + textOnlyTop + textHeight + 2;
}

function buildZigzagMasonryColumns(
  posts: readonly CommunityPlayerStoryPost[],
  columnCount: number,
  cardWidth: number,
  gap: number,
): CommunityPlayerStoryPost[][] {
  const columns = Array.from({ length: columnCount }, () => [] as CommunityPlayerStoryPost[]);
  const heights = Array.from({ length: columnCount }, () => 0);
  const ordered = [...posts].sort(compareJourneyProgress);

  ordered.forEach((post, index) => {
    const naturalColumn = columnCount === 2 ? index % 2 : index % columnCount;
    const shortestColumn = heights.reduce((best, height, column) => (height < heights[best] ? column : best), 0);
    const estimate = estimateGalleryCardHeight(post, cardWidth) + gap;
    const naturalIsTooTall = heights[naturalColumn] - heights[shortestColumn] > estimate * 0.65;
    const column = naturalIsTooTall ? shortestColumn : naturalColumn;
    columns[column].push(post);
    heights[column] += estimate;
  });

  return columns;
}

function missionDayNumber(habit: Habit, dateStr: string): number | null {
  const start = safeDate(habit.startDate);
  const day = safeDate(dateStr);
  if (!start || !day) return null;
  const startUtc = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const dayUtc = Date.UTC(day.getFullYear(), day.getMonth(), day.getDate());
  const diff = Math.floor((dayUtc - startUtc) / 86400000) + 1;
  return diff > 0 ? diff : null;
}

function memoryImageUri(memory: StreakMemory | undefined): string | null {
  return memory?.imageUrl?.trim() || memory?.imageUri?.trim() || null;
}

function memoryNote(memory: StreakMemory | undefined): string | null {
  const note = memory?.note?.trim();
  return note ? note : null;
}

/** First task note found in log order — covers a checklist day where every task is text-only (no photo). */
function firstTaskNote(memory: StreakMemory | undefined): string | null {
  for (const task of memory?.tasks ?? []) {
    const note = task.note?.trim();
    if (note) return note;
  }
  return null;
}

/**
 * Local-only mirror of `storyMemoryGallery` in communityWinsApi, but richer: since this
 * feeds the private Journey view ("everything is visible," per the user), it also keeps
 * a task that has only a note and no photo — `imageUrl: null` — rendered as a text-card
 * slide in the gallery/lightbox instead of being dropped. Community-shared galleries
 * never contain one of these (sharing only ever includes photo tasks); this is purely a
 * local, private-view-only difference.
 */
function memoryTaskGallery(memory: StreakMemory | undefined): CommunityMemoryGalleryItem[] | null {
  const tasks = memory?.tasks;
  if (!tasks || tasks.length === 0) return null;
  const items = tasks
    .map((task): CommunityMemoryGalleryItem | null => {
      const imageUrl = task.proofUrls[0]?.trim() || null;
      const note = task.note?.trim() || null;
      if (!imageUrl && !note) return null;
      return { taskId: task.taskId, label: task.label, imageUrl, note };
    })
    .filter((item): item is CommunityMemoryGalleryItem => item !== null);
  return items.length > 0 ? items : null;
}

function isPublicCommunityMemory(memory: StreakMemory | undefined, revoked?: boolean): boolean {
  return memory?.communityPosted === true && memory.communityFeedRevoked !== true && revoked !== true;
}

function isPrivateStoryPost(post: CommunityPlayerStoryPost): boolean {
  return post.id.startsWith("private-");
}

/**
 * Full slide set for the lightbox — the catalog (mixed photo + text-only tasks) when
 * present, else a single synthetic photo slide wrapping the classic cover photo.
 */
function journeySlidesForPost(post: CommunityPlayerStoryPost): CommunityMemoryGalleryItem[] {
  if (post.memoryGallery && post.memoryGallery.length > 0) {
    return post.memoryGallery;
  }
  return post.memoryImageUrl
    ? [{ taskId: post.id, label: post.title, imageUrl: post.memoryImageUrl, note: null }]
    : [];
}

function repairSourceForPost(post: CommunityPlayerStoryPost): "squad" | "solo" | null {
  return post.repairSource ?? null;
}

function isSquadSavedPost(post: CommunityPlayerStoryPost | undefined): boolean {
  return post ? repairSourceForPost(post) === "squad" : false;
}

function repairCopy(source: "squad" | "solo" | undefined): string | null {
  if (source === "squad") return "Streak repair saved by squad approval.";
  if (source === "solo") return "Streak repair saved with solo XP.";
  return null;
}

function privatePostFromMemory(input: {
  id: string;
  title: string;
  completedAt: string;
  memory: StreakMemory;
  source: "habit_streak" | "mini";
  dayNumber?: number | null;
}): CommunityPlayerStoryPost {
  const repairText = repairCopy(input.memory.repairSource);
  const gallery = memoryTaskGallery(input.memory);
  return {
    id: input.id,
    title: input.title,
    completedAt: input.completedAt,
    createdAt: input.memory.createdAt || input.completedAt,
    // Falls back to a task's note (e.g. a checklist day where every task is
    // text-only, no photo anywhere) before falling back to repair copy.
    memoryNote: memoryNote(input.memory) ?? firstTaskNote(input.memory) ?? repairText,
    // Checklist days never write the legacy single-shot note/imageUrl fields (only
    // .tasks) — fall back to the first task that actually has a photo (not just
    // array index 0, which might be a text-only task) so grid tiles, photo counts,
    // and every other place downstream that keys off memoryImageUrl still work,
    // same as the cover-photo backfill already done when sharing to Community.
    memoryImageUrl: memoryImageUri(input.memory) ?? gallery?.find((g) => g.imageUrl)?.imageUrl ?? null,
    memoryGallery: gallery,
    feedSource: input.source,
    streakMissionDay: input.dayNumber ?? null,
    streakCountAtPost: input.dayNumber ?? null,
    liveSquadId: null,
    cheerCount: 0,
    viewerHasCheered: false,
    repairSource: input.memory.repairSource ?? null,
  };
}

function buildPrivateStory(habits: readonly Habit[], minis: readonly MiniMission[]): JourneyStoryData {
  const missionStories: CommunityPlayerMissionStory[] = [];
  const miniPosts: CommunityPlayerStoryPost[] = [];

  for (const habit of habits) {
    const posts: CommunityPlayerStoryPost[] = [];
    for (const [dateStr, memory] of Object.entries(habit.streakMemories ?? {})) {
      const imageUri = memoryImageUri(memory);
      const note = memoryNote(memory);
      const repair = memory.repairSource;
      const hasTasks = Boolean(memory.tasks && memory.tasks.length > 0);
      if (isPublicCommunityMemory(memory) || (!imageUri && !note && !repair && !hasTasks)) continue;

      posts.push(
        privatePostFromMemory({
          id: `private-habit-${habit.id}-${dateStr}`,
          title: habit.title,
          completedAt: memory.createdAt || dateStr,
          memory,
          source: "habit_streak",
          dayNumber: missionDayNumber(habit, dateStr),
        }),
      );
    }

    if (posts.length > 0) {
      const sorted = posts.sort((a, b) => sortTime(b.createdAt) - sortTime(a.createdAt));
      missionStories.push({
        key: `private-habit-${habit.id}`,
        title: habit.title,
        description: habit.description?.trim() || null,
        postCount: sorted.length,
        photoCount: sorted.filter((post) => Boolean(post.memoryImageUrl)).length,
        latestAt: sorted[0]?.createdAt ?? new Date(0).toISOString(),
        bestStreak: sorted.reduce<number | null>((best, post) => {
          const n = post.streakCountAtPost;
          if (typeof n !== "number" || !Number.isFinite(n)) return best;
          return best === null ? n : Math.max(best, n);
        }, null),
        posts: sorted,
      });
    }
  }

  for (const mini of minis) {
    const memory = mini.completionMemory;
    if (!memory || isPublicCommunityMemory(memory, mini.communityFeedRevoked)) continue;
    const imageUri = memoryImageUri(memory);
    const note = memoryNote(memory);
    const hasTasks = Boolean(memory.tasks && memory.tasks.length > 0);
    if (!imageUri && !note && !hasTasks) continue;

    miniPosts.push(
      privatePostFromMemory({
        id: `private-mini-${mini.id}`,
        title: mini.title,
        completedAt: memory.createdAt || mini.completedAt || mini.startedAt || mini.createdAt,
        memory,
        source: "mini",
      }),
    );
  }

  return {
    missionStories: missionStories.sort((a, b) => sortTime(b.latestAt) - sortTime(a.latestAt)),
    miniPosts: miniPosts.sort((a, b) => sortTime(b.createdAt) - sortTime(a.createdAt)),
  };
}

function normalizeStoryTitle(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeStoryImageUri(uri: string | null | undefined): string | null {
  if (!uri) return null;
  try {
    const url = new URL(uri.trim());
    url.pathname = url.pathname.replace("/storage/v1/render/image/public/", "/storage/v1/object/public/");
    url.search = "";
    url.hash = "";
    return `${url.origin}${url.pathname}`.toLowerCase();
  } catch {
    const clean = uri.trim();
    return clean ? clean.toLowerCase() : null;
  }
}

function storyDateKey(post: CommunityPlayerStoryPost): string {
  const d = safeDate(post.completedAt || post.createdAt);
  return d ? d.toISOString().slice(0, 10) : "";
}

function storyPostIdentityKeys(post: CommunityPlayerStoryPost): string[] {
  const title = normalizeStoryTitle(post.title);
  const day = post.streakMissionDay ?? post.streakCountAtPost ?? storyDateKey(post);
  const image = normalizeStoryImageUri(post.memoryImageUrl);
  const note = post.memoryNote?.trim().toLowerCase().replace(/\s+/g, " ") ?? "";
  const keys = [`id:${post.id}`];
  if (image) {
    keys.push(`image:${image}`);
    keys.push(`memory:${post.feedSource}:${title}:${day}:${image}`);
  }
  if (note) keys.push(`memory:${post.feedSource}:${title}:${day}:${note}`);
  if (post.feedSource === "habit_streak" && day) keys.push(`habit-day:${title}:${day}`);
  return keys;
}

/**
 * Union of both galleries by `taskId`, `b` winning on overlap — preserves `a`'s task
 * order as the base. Used to keep a private day's text-only/bare-excluded tasks visible
 * after that same day gets replaced by its public counterpart below, since the public
 * gallery is photo-only by design (see `CommunityMemoryGalleryItem` doc comment in
 * communityWinsApi.ts) and would otherwise silently drop the private-only entries.
 */
function mergeMemoryGalleries(
  a: CommunityMemoryGalleryItem[] | null,
  b: CommunityMemoryGalleryItem[] | null,
): CommunityMemoryGalleryItem[] | null {
  if (!a || a.length === 0) return b;
  if (!b || b.length === 0) return a;
  const byTaskId = new Map<string, CommunityMemoryGalleryItem>();
  for (const item of a) byTaskId.set(item.taskId, item);
  for (const item of b) byTaskId.set(item.taskId, item);
  return Array.from(byTaskId.values());
}

function dedupeStoryPostsPreferPublic(posts: readonly CommunityPlayerStoryPost[]): CommunityPlayerStoryPost[] {
  const indexByKey = new Map<string, number>();
  const out: CommunityPlayerStoryPost[] = [];

  for (const post of posts) {
    const keys = storyPostIdentityKeys(post);
    const existingIndex = keys.map((key) => indexByKey.get(key)).find((index) => index != null);
    if (existingIndex != null) {
      const existing = out[existingIndex];
      if (existing && isPrivateStoryPost(existing) && !isPrivateStoryPost(post)) {
        out[existingIndex] = {
          ...post,
          memoryGallery: mergeMemoryGalleries(existing.memoryGallery, post.memoryGallery),
        };
        keys.forEach((key) => indexByKey.set(key, existingIndex));
      }
      continue;
    }

    const nextIndex = out.length;
    out.push(post);
    keys.forEach((key) => indexByKey.set(key, nextIndex));
  }

  return out;
}

function rebuildMissionStory(
  key: string,
  title: string,
  posts: readonly CommunityPlayerStoryPost[],
  description?: string | null,
): CommunityPlayerMissionStory {
  const sorted = dedupeStoryPostsPreferPublic(posts).sort((a, b) => sortTime(b.createdAt) - sortTime(a.createdAt));
  return {
    key,
    title,
    description: description?.trim() || null,
    postCount: sorted.length,
    photoCount: sorted.filter((post) => Boolean(post.memoryImageUrl)).length,
    latestAt: sorted[0]?.createdAt ?? new Date(0).toISOString(),
    bestStreak: sorted.reduce<number | null>((best, post) => {
      const n = post.streakCountAtPost;
      if (typeof n !== "number" || !Number.isFinite(n)) return best;
      return best === null ? n : Math.max(best, n);
    }, null),
    posts: sorted,
  };
}

function buildCompleteOwnerStory(
  publicMissions: readonly CommunityPlayerMissionStory[],
  publicMinis: readonly CommunityPlayerStoryPost[],
  privateStory: JourneyStoryData,
): JourneyStoryData {
  const missionGroups = new Map<string, { key: string; title: string; description: string | null; posts: CommunityPlayerStoryPost[] }>();
  const addMissionStory = (story: CommunityPlayerMissionStory) => {
    const groupKey = normalizeStoryTitle(story.title) || story.key;
    const description = story.description?.trim() || null;
    const existing = missionGroups.get(groupKey);
    if (existing) {
      if (!existing.description && description) existing.description = description;
      existing.posts.push(...story.posts);
      return;
    }
    missionGroups.set(groupKey, {
      key: `complete-${groupKey || story.key}`,
      title: story.title,
      description,
      posts: [...story.posts],
    });
  };

  publicMissions.forEach(addMissionStory);
  privateStory.missionStories.forEach(addMissionStory);

  return {
    missionStories: Array.from(missionGroups.values())
      .map((story) => rebuildMissionStory(story.key, story.title, story.posts, story.description))
      .sort((a, b) => sortTime(b.latestAt) - sortTime(a.latestAt)),
    miniPosts: dedupeStoryPostsPreferPublic([...publicMinis, ...privateStory.miniPosts]).sort(
      (a, b) => sortTime(b.createdAt) - sortTime(a.createdAt),
    ),
  };
}

function allPhotoPosts(missionStories: readonly CommunityPlayerMissionStory[], miniPosts: readonly CommunityPlayerStoryPost[]) {
  return [...missionStories.flatMap((mission) => mission.posts), ...miniPosts]
    .filter((post) => Boolean(post.memoryImageUrl))
    .sort((a, b) => sortTime(b.createdAt) - sortTime(a.createdAt));
}

function storyPagePostCount(page: Pick<JourneyStoryData, "missionStories" | "miniPosts">): number {
  return page.missionStories.reduce((total, story) => total + story.postCount, 0) + page.miniPosts.length;
}

function mergeMissionStoriesByTitle(
  existing: readonly CommunityPlayerMissionStory[],
  incoming: readonly CommunityPlayerMissionStory[],
): CommunityPlayerMissionStory[] {
  const groups = new Map<string, { key: string; title: string; description: string | null; posts: CommunityPlayerStoryPost[] }>();
  const add = (story: CommunityPlayerMissionStory) => {
    const groupKey = normalizeStoryTitle(story.title) || story.key;
    const description = story.description?.trim() || null;
    const current = groups.get(groupKey);
    if (current) {
      if (!current.description && description) current.description = description;
      current.posts.push(...story.posts);
      return;
    }
    groups.set(groupKey, { key: story.key, title: story.title, description, posts: [...story.posts] });
  };
  existing.forEach(add);
  incoming.forEach(add);
  return Array.from(groups.values())
    .map((story) => rebuildMissionStory(story.key, story.title, story.posts, story.description))
    .sort((a, b) => sortTime(b.latestAt) - sortTime(a.latestAt));
}

function mergePublicStoryPage(story: CommunityPlayerStory, page: CommunityPlayerStoryPage): CommunityPlayerStory {
  const missionStories = mergeMissionStoriesByTitle(story.missionStories, page.missionStories);
  const miniPosts = dedupeStoryPostsPreferPublic([...story.miniPosts, ...page.miniPosts]).sort(
    (a, b) => sortTime(b.createdAt) - sortTime(a.createdAt),
  );
  return {
    ...story,
    missionStories,
    miniPosts,
    totalPhotoMoments: allPhotoPosts(missionStories, miniPosts).length,
    hasMore: page.hasMore,
  };
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
        <Text style={[styles.statValue, { color: accent }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
          {value}
        </Text>
      </View>
      <Text style={[styles.statLabel, { color: theme.colors.textMuted }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function StoryToggle({
  mode,
  onChange,
  theme,
}: {
  mode: JourneyMode;
  onChange: (mode: JourneyMode) => void;
  theme: AppTheme;
}) {
  return (
    <View style={[styles.modeToggle, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
      <GlassTopHighlight radius={15} />
      {(["public", "private"] as const).map((nextMode) => {
        const active = mode === nextMode;
        const accent = nextMode === "public" ? theme.colors.indigo[600] : theme.colors.cyan[500];
        return (
          <Pressable
            key={nextMode}
            onPress={() => onChange(nextMode)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={[styles.modeToggleButton, { backgroundColor: active ? accent : "transparent" }]}
          >
            {nextMode === "public" ? (
              <Globe size={14} color={active ? "#FFFFFF" : theme.colors.indigo[400]} />
            ) : (
              <LockKeyhole size={14} color={active ? "#FFFFFF" : theme.colors.cyan[400]} />
            )}
            <Text style={[styles.modeToggleText, { color: active ? "#FFFFFF" : theme.colors.textSecondary }]} numberOfLines={1}>
              {nextMode === "public" ? "Public" : "Private"}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function TabButton({
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
              backgroundColor: active ? theme.colors.surface : "rgba(148, 163, 184, 0.1)",
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
  const thumb = storageThumbnailUri(uri, 420, 420);
  const displayUri = useOriginal ? uri : thumb;
  return (
    <View style={[styles.thumbnailFrame, { backgroundColor: theme.colors.surfaceElevated }, style]}>
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
  onPress: (slides: CommunityMemoryGalleryItem[], initialIndex?: number) => void;
}) {
  const uri = post.memoryImageUrl;
  const clipId = useMemo(
    () => `myJourneyRecentProof${post.id.replace(/[^a-zA-Z0-9]/g, "").slice(-18)}${Math.round(size)}`,
    [post.id, size],
  );

  if (!uri) return null;

  return (
    <Pressable
      onPress={() => onPress(journeySlidesForPost(post), 0)}
      accessibilityRole="imagebutton"
      accessibilityLabel={`Open ${post.title} proof`}
      style={[styles.recentProofBadge, { width: size, height: size }]}
    >
      <Svg width={size} height={size} viewBox="0 0 100 100" style={styles.recentProofSvg} pointerEvents="none">
        <Defs>
          <ClipPath id={clipId}>
            <Path d={RECENT_PROOF_BADGE_PATH} />
          </ClipPath>
        </Defs>
        {imagesEnabled && uri ? (
          <SvgImage
            href={{ uri }}
            x={0}
            y={0}
            width={100}
            height={100}
            preserveAspectRatio="xMidYMid slice"
            clipPath={`url(#${clipId})`}
          />
        ) : (
          <Path d={RECENT_PROOF_BADGE_PATH} fill={theme.colors.surfaceElevated} />
        )}
        <Path d={RECENT_PROOF_BADGE_PATH} fill="none" stroke={DAY_PILL_BACKGROUND} strokeWidth={1.1} />
      </Svg>
      <View style={[styles.dayPill, styles.recentProofDayPill, { backgroundColor: DAY_PILL_BACKGROUND }]}>
        <Text style={styles.dayPillText} numberOfLines={1}>
          {storyDayLabel(post)}
        </Text>
      </View>
    </Pressable>
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
  tileStyle,
  journeyMode,
  shape = "rounded",
}: {
  post: CommunityPlayerStoryPost;
  width: number;
  height: number;
  radius?: number;
  theme: AppTheme;
  imagesEnabled: boolean;
  onPress?: (slides: CommunityMemoryGalleryItem[], initialIndex?: number) => void;
  onMorePress?: () => void;
  tileStyle?: StyleProp<ViewStyle>;
  journeyMode: JourneyMode;
  shape?: "rounded" | "circle";
}) {
  const uri = post.memoryImageUrl;
  const isPrivate = isPrivateStoryPost(post);
  const showPublicBadge = journeyMode === "private" && !isPrivate;
  const showLikeBadge = !isPrivate && (showPublicBadge || post.cheerCount > 0);
  const isCircle = shape === "circle";
  const tileRadius = isCircle ? Math.min(width, height) / 2 : radius;
  const showTypeBadge = !isCircle && (isPrivate || showPublicBadge);
  const showTopLikeBadge = isCircle && showLikeBadge;
  const showStackBadge = Boolean(uri) && journeySlidesForPost(post).length > 1;
  const showBottomLikeBadge = !isCircle && showLikeBadge;
  const body = (
    <View
      style={[
        styles.storyPhotoTile,
        isCircle && styles.storyPhotoCircleTile,
        { width, height, borderRadius: tileRadius },
        tileStyle,
      ]}
    >
      {uri ? (
        <StoryThumbnail
          uri={uri}
          enabled={imagesEnabled}
          theme={theme}
          style={[
            styles.storyPhotoImage,
            { borderRadius: tileRadius },
            isCircle && styles.storyPhotoCircleImage,
            isCircle && { borderColor: DAY_PILL_BACKGROUND },
          ]}
        />
      ) : (
        <View style={styles.photoPlaceholder}>
          <ImageIcon size={18} color={theme.colors.textMuted} />
        </View>
      )}
      <View style={[styles.dayPill, isCircle && styles.missionCircleDayPill, { backgroundColor: DAY_PILL_BACKGROUND }]}>
        <Text style={styles.dayPillText} numberOfLines={1}>
          {storyDayLabel(post)}
        </Text>
      </View>
      {showTypeBadge || showTopLikeBadge ? (
        <View style={[styles.tileStatusGroup, isCircle && styles.missionCircleStatusGroup]}>
          {showTypeBadge ? (
            <View style={[styles.tileIconPill, { backgroundColor: isPrivate ? PRIVATE_BADGE_BACKGROUND : COMMUNITY_BADGE_BACKGROUND }]}>
              {isPrivate ? (
                <LockKeyhole size={10} color="#FFFFFF" />
              ) : (
                <Globe size={10} color="#FFFFFF" />
              )}
            </View>
          ) : null}
          {showTopLikeBadge ? (
            <View style={[styles.tileStatusPill, { backgroundColor: LIKE_BADGE_BACKGROUND }]}>
              <ThumbsUp size={10} color="#FFFFFF" fill="#FFFFFF" />
              <Text style={styles.tileStatusText}>{post.cheerCount}</Text>
            </View>
          ) : null}
        </View>
      ) : null}
      {showBottomLikeBadge ? (
        <View style={[styles.tileStatusPill, styles.tileBottomStatusPill, { backgroundColor: LIKE_BADGE_BACKGROUND }]}>
          <ThumbsUp size={10} color="#FFFFFF" fill="#FFFFFF" />
          <Text style={styles.tileStatusText}>{post.cheerCount}</Text>
        </View>
      ) : null}
      {showStackBadge ? (
        <View
          style={[
            isCircle ? styles.circleStackBadge : styles.roundedStackBadge,
            { backgroundColor: LIKE_BADGE_BACKGROUND },
          ]}
        >
          <Copy size={9} color="#FFFFFF" />
        </View>
      ) : null}
    </View>
  );

  if (!uri) return body;

  return (
    <Pressable
      onPress={onMorePress ?? (() => onPress?.(journeySlidesForPost(post), 0))}
      accessibilityRole="imagebutton"
      accessibilityLabel={`Open ${post.title} proof`}
    >
      {body}
    </Pressable>
  );
}

const MissionStoryCard = memo(function MissionStoryCard({
  story,
  theme,
  isDark,
  onOpenGallery,
  onOpenImage,
  photoSize,
  imagesEnabled,
  journeyMode,
  index,
}: {
  story: CommunityPlayerMissionStory;
  theme: AppTheme;
  isDark: boolean;
  onOpenGallery: (story: CommunityPlayerMissionStory) => void;
  onOpenImage: (slides: CommunityMemoryGalleryItem[], initialIndex?: number) => void;
  photoSize: number;
  imagesEnabled: boolean;
  journeyMode: JourneyMode;
  index: number;
}) {
  const entranceStyle = useListCardEntrance(index);
  const previewPhotos = story.posts.filter((post) => post.memoryImageUrl).slice(0, 8);
  const latest = story.posts[0];
  const latestNote = latest?.memoryNote?.trim() ?? "";
  const moreCount = Math.max(0, story.photoCount - previewPhotos.length);
  const proofCount = story.photoCount > 0 ? story.photoCount : story.postCount;
  const proofLabel =
    story.photoCount > 0
      ? `${proofCount} ${plural(proofCount, "photo", "photos")}`
      : `${proofCount} ${plural(proofCount, "moment", "moments")}`;
  const metaPillBackground = isDark ? "rgba(15, 23, 42, 0.38)" : "rgba(248, 250, 252, 0.82)";
  const latestIsSquadSave = isSquadSavedPost(latest);
  const textOnlyBg = latestIsSquadSave
    ? isDark
      ? "rgba(8, 145, 178, 0.16)"
      : "rgba(8, 145, 178, 0.1)"
    : theme.colors.surfaceElevated;
  const textOnlyBorder = latestIsSquadSave ? theme.colors.cyan[500] : theme.colors.border;

  return (
    <Animated.View style={entranceStyle}>
    <View style={[styles.missionCard, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
      <GlassTopHighlight radius={15} />
      <View style={styles.missionHeader}>
        <View style={styles.missionTitleWrap}>
          <Text style={[styles.missionTitle, { color: theme.colors.textPrimary }]} numberOfLines={1}>
            {story.title}
          </Text>
          <ScrollView
            horizontal
            nestedScrollEnabled
            showsHorizontalScrollIndicator={false}
            style={styles.missionStatScroller}
            contentContainerStyle={styles.missionStatRow}
          >
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
          </ScrollView>
        </View>
        <Pressable
          onPress={() => onOpenGallery(story)}
          accessibilityRole="button"
          accessibilityLabel={`View ${story.title} journey`}
          style={[styles.journeyButton, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceElevated }]}
        >
          <Text style={[styles.journeyText, { color: theme.colors.indigo[400] }]} numberOfLines={1}>
            View journey
          </Text>
        </Pressable>
      </View>

      {previewPhotos.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.missionPhotoRail}>
          {previewPhotos.map((post, index) => (
            <StoryPhotoTile
              key={post.id}
              post={post}
              width={photoSize}
              height={photoSize}
              theme={theme}
              imagesEnabled={imagesEnabled}
              onPress={onOpenImage}
              onMorePress={index === previewPhotos.length - 1 && moreCount > 0 ? () => onOpenGallery(story) : undefined}
              journeyMode={journeyMode}
              shape="circle"
            />
          ))}
        </ScrollView>
      ) : (
        <View style={[styles.textOnlyMoment, { borderColor: textOnlyBorder, backgroundColor: textOnlyBg }]}>
          <View style={[styles.textDayPill, { backgroundColor: DAY_PILL_BACKGROUND }]}>
            <Text style={styles.dayPillText} numberOfLines={1}>
              {latest ? storyDayLabel(latest) : "Moment"}
            </Text>
          </View>
          <View style={styles.textOnlyContent}>
            <Text style={[styles.textOnlyCopy, { color: theme.colors.textSecondary }]} numberOfLines={2}>
              {latestNote || "A text-only memory from this mission."}
            </Text>
          </View>
        </View>
      )}
    </View>
    </Animated.View>
  );
});

const MiniPostCard = memo(function MiniPostCard({
  post,
  width,
  gap,
  theme,
  isDark,
  imagesEnabled,
  onOpenImage,
  journeyMode,
  index,
}: {
  post: CommunityPlayerStoryPost;
  width: number;
  /** Masonry spacing — applied as right/bottom margin so packed cards don't touch their neighbors. */
  gap: number;
  theme: AppTheme;
  isDark: boolean;
  imagesEnabled: boolean;
  onOpenImage: (slides: CommunityMemoryGalleryItem[], initialIndex?: number) => void;
  journeyMode: JourneyMode;
  index: number;
}) {
  const entranceStyle = useCardMaterialize(index);
  const imageUri = post.memoryImageUrl;
  const note = post.memoryNote?.trim() ?? "";
  const thumb = imageUri ? storageThumbnailUri(imageUri, Math.round(width * 2), Math.round(width * 2.25)) : null;
  const [useOriginal, setUseOriginal] = useState(false);
  const displayUri = useOriginal ? imageUri : thumb;
  /** Checklist minis with only text-only tasks have no cover photo but still have slides to open. */
  const hasTextOnlySlides = !imageUri && journeySlidesForPost(post).length > 0;
  const hasMultipleSlides = journeySlidesForPost(post).length > 1;
  const isPrivate = isPrivateStoryPost(post);
  const isSquadSave = isSquadSavedPost(post);
  const showPublicBadge = journeyMode === "private" && !isPrivate;
  const showLikeBadge = !isPrivate;
  const textOnlyBg = isSquadSave
    ? isDark
      ? "rgba(8, 145, 178, 0.16)"
      : "rgba(8, 145, 178, 0.1)"
    : isDark
      ? "rgba(99,102,241,0.14)"
      : "rgba(99,102,241,0.1)";

  return (
    <Animated.View
      style={[
        styles.miniCard,
        {
          width,
          marginRight: gap,
          marginBottom: gap,
          borderColor: isSquadSave ? theme.colors.cyan[500] : theme.colors.border,
          backgroundColor: theme.colors.surface,
        },
        entranceStyle,
      ]}
    >
      <GlassTopHighlight radius={16} />
      {imageUri ? (
        <Pressable onPress={() => onOpenImage(journeySlidesForPost(post), 0)} accessibilityRole="imagebutton" accessibilityLabel={`Open ${post.title} photo`}>
          <View style={[styles.miniImageWrap, { backgroundColor: theme.colors.surfaceElevated }]}>
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
            <View style={[styles.miniDatePill, { backgroundColor: DAY_PILL_BACKGROUND }]}>
              <Text style={styles.dayPillText}>{storyDayLabel(post)}</Text>
            </View>
            <View style={styles.miniStatusGroup}>
              {isPrivate ? (
                <View style={[styles.miniIconPill, { backgroundColor: PRIVATE_BADGE_BACKGROUND }]}>
                  <LockKeyhole size={11} color="#FFFFFF" />
                </View>
              ) : null}
              {showPublicBadge ? (
                <View style={[styles.miniIconPill, { backgroundColor: COMMUNITY_BADGE_BACKGROUND }]}>
                  <Globe size={11} color="#FFFFFF" />
                </View>
              ) : null}
              {showLikeBadge ? (
                <View style={[styles.miniStatusPill, { backgroundColor: LIKE_BADGE_BACKGROUND }]}>
                  <ThumbsUp size={11} color="#FFFFFF" fill="#FFFFFF" />
                  <Text style={styles.miniStatusText}>{post.cheerCount}</Text>
                </View>
              ) : null}
            </View>
            {hasMultipleSlides ? (
              <View style={[styles.miniStackBadge, { backgroundColor: LIKE_BADGE_BACKGROUND }]}>
                <Copy size={11} color="#FFFFFF" />
              </View>
            ) : null}
          </View>
        </Pressable>
      ) : (
        <Pressable
          onPress={hasTextOnlySlides ? () => onOpenImage(journeySlidesForPost(post), 0) : undefined}
          accessibilityRole={hasTextOnlySlides ? "imagebutton" : undefined}
          accessibilityLabel={hasTextOnlySlides ? `Open ${post.title}` : undefined}
        >
          <View style={[styles.miniTextOnlyTop, { backgroundColor: textOnlyBg }]}>
            <View style={[styles.miniDatePill, { backgroundColor: DAY_PILL_BACKGROUND }]}>
              <Text style={styles.dayPillText}>{storyDayLabel(post)}</Text>
            </View>
            <View style={styles.miniStatusGroup}>
              {isPrivate ? (
                <View style={[styles.miniIconPill, { backgroundColor: PRIVATE_BADGE_BACKGROUND }]}>
                  <LockKeyhole size={11} color="#FFFFFF" />
                </View>
              ) : null}
              {showPublicBadge ? (
                <View style={[styles.miniIconPill, { backgroundColor: COMMUNITY_BADGE_BACKGROUND }]}>
                  <Globe size={11} color="#FFFFFF" />
                </View>
              ) : null}
              {showLikeBadge ? (
                <View style={[styles.miniStatusPill, { backgroundColor: LIKE_BADGE_BACKGROUND }]}>
                  <ThumbsUp size={11} color="#FFFFFF" fill="#FFFFFF" />
                  <Text style={styles.miniStatusText}>{post.cheerCount}</Text>
                </View>
              ) : null}
            </View>
            {hasMultipleSlides ? (
              <View style={[styles.miniStackBadge, { backgroundColor: LIKE_BADGE_BACKGROUND }]}>
                <Copy size={11} color="#FFFFFF" />
              </View>
            ) : null}
          </View>
        </Pressable>
      )}
      <View style={styles.miniBody}>
        <Text style={[styles.miniTitle, { color: theme.colors.textPrimary }]} numberOfLines={2}>
          {post.title}
        </Text>
        {note ? (
          <Text style={[styles.miniNote, { color: theme.colors.textSecondary }]} numberOfLines={2}>
            {note}
          </Text>
        ) : null}
      </View>
    </Animated.View>
  );
});

function GalleryMomentCard({
  post,
  width,
  theme,
  imagesEnabled,
  onOpenImage,
  journeyMode,
}: {
  post: CommunityPlayerStoryPost;
  width: number;
  theme: AppTheme;
  imagesEnabled: boolean;
  onOpenImage: (slides: CommunityMemoryGalleryItem[], initialIndex?: number) => void;
  journeyMode: JourneyMode;
}) {
  const note = post.memoryNote?.trim() ?? "";
  const imageHeight = Math.max(150, Math.min(220, width * 1.12));
  const isSquadSave = isSquadSavedPost(post);
  const cardBg = isSquadSave
    ? "rgba(8, 145, 178, 0.1)"
    : theme.colors.surface;
  const cardBorder = isSquadSave ? theme.colors.cyan[500] : theme.colors.border;
  return (
    <View style={[styles.galleryMomentCard, { width, borderColor: cardBorder, backgroundColor: cardBg }]}>
      {post.memoryImageUrl ? (
        <StoryPhotoTile
          post={post}
          width={width}
          height={imageHeight}
          radius={0}
          theme={theme}
          imagesEnabled={imagesEnabled}
          onPress={onOpenImage}
          tileStyle={styles.galleryMomentImage}
          journeyMode={journeyMode}
        />
      ) : (
        <View style={[styles.galleryFloatingDayPill, { backgroundColor: DAY_PILL_BACKGROUND }]}>
          <Text style={styles.dayPillText} numberOfLines={1}>
            {storyDayLabel(post)}
          </Text>
        </View>
      )}
      <View style={[styles.galleryMomentBody, !post.memoryImageUrl && styles.galleryTextOnlyBody]}>
        <Text style={[styles.galleryMomentNote, { color: theme.colors.textPrimary }]}>
          {note || "Visual proof saved for this moment."}
        </Text>
      </View>
    </View>
  );
}

function MissionGalleryModal({
  mission,
  visible,
  theme,
  imagesEnabled,
  onClose,
  onOpenImage,
  journeyMode,
}: {
  mission: CommunityPlayerMissionStory | null;
  visible: boolean;
  theme: AppTheme;
  imagesEnabled: boolean;
  onClose: () => void;
  onOpenImage: (slides: CommunityMemoryGalleryItem[], initialIndex?: number) => void;
  journeyMode: JourneyMode;
}) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const horizontalPad = 12;
  const gap = 8;
  const columnCount = width >= 720 ? 3 : 2;
  const cardWidth = Math.floor((width - horizontalPad * 2 - gap * (columnCount - 1)) / columnCount);
  const columns = useMemo(() => {
    const posts = mission?.posts ?? [];
    return buildZigzagMasonryColumns(posts, columnCount, cardWidth, gap);
  }, [cardWidth, columnCount, gap, mission?.posts]);
  const hasDescription = Boolean(mission?.description?.trim());
  const handleShowDescription = useCallback(() => {
    if (!mission) return;
    showAppAlert(mission.title, missionDescriptionText(mission));
  }, [mission]);

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View
        style={[
          styles.galleryOverlay,
          {
            backgroundColor: theme.colors.background,
            paddingTop: Math.max(insets.top, 28),
          },
        ]}
      >
        <View style={styles.gallerySheet}>
          <View style={styles.galleryHeader}>
            <View style={styles.galleryHeaderText}>
              <View style={styles.galleryTitleRow}>
                <Text style={[styles.galleryTitle, { color: theme.colors.textPrimary }]} numberOfLines={1}>
                  {mission?.title ?? "Journey"}
                </Text>
                {hasDescription ? (
                  <Pressable
                    onPress={handleShowDescription}
                    accessibilityRole="button"
                    accessibilityLabel={`View ${mission?.title ?? "journey"} description`}
                    hitSlop={8}
                    style={styles.galleryInfoButton}
                  >
                    <Info size={16} color={theme.colors.textMuted} />
                  </Pressable>
                ) : null}
              </View>
              <Text style={[styles.gallerySubtitle, { color: theme.colors.textMuted }]} numberOfLines={1}>
                {mission?.postCount ?? 0} memories - {mission?.photoCount ?? 0} photos
              </Text>
            </View>
            <Pressable onPress={onClose} style={[styles.galleryClose, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
              <Text style={[styles.galleryCloseText, { color: theme.colors.textPrimary }]}>Close</Text>
            </Pressable>
          </View>
          <ScrollView
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={[
              styles.galleryScrollContent,
              { paddingBottom: Math.max(insets.bottom, 28) + 12 },
            ]}
          >
            <View style={[styles.galleryMasonryRow, { gap, paddingHorizontal: horizontalPad }]}>
              {columns.map((column, columnIndex) => (
                <View key={`column-${columnIndex}`} style={[styles.galleryMasonryColumn, { width: cardWidth, gap }]}>
                  {column.map((post) => (
                    <GalleryMomentCard
                      key={post.id}
                      post={post}
                      width={cardWidth}
                      theme={theme}
                      imagesEnabled={imagesEnabled}
                      onOpenImage={onOpenImage}
                      journeyMode={journeyMode}
                    />
                  ))}
                </View>
              ))}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function RowSeparator() {
  return <View style={styles.rowSeparator} />;
}

/**
 * Full-screen memory viewer for the Journey tab — same chrome as
 * `CommunityWinImageLightbox` (dark backdrop, X close, "N / M" counter, paged swipe),
 * but slide-aware: a task with only a note and no photo renders as a text card instead
 * of being skipped. Journey-specific (not a `CommunityWinImageLightbox` prop change)
 * because Community-shared galleries never actually contain a text-only entry — only
 * the private, local-only side of this screen does.
 */
function JourneyMemoryLightbox({
  visible,
  slides,
  initialIndex = 0,
  onClose,
}: {
  visible: boolean;
  slides: CommunityMemoryGalleryItem[];
  initialIndex?: number;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [failedUris, setFailedUris] = useState<ReadonlySet<string>>(() => new Set());
  const listRef = useRef<FlatList<CommunityMemoryGalleryItem>>(null);

  useEffect(() => {
    if (visible) setActiveIndex(initialIndex);
  }, [visible, initialIndex]);

  if (slides.length === 0) return null;

  const onMomentumScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (width <= 0) return;
    const idx = Math.round(e.nativeEvent.contentOffset.x / width);
    setActiveIndex(Math.max(0, Math.min(slides.length - 1, idx)));
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={journeyLightboxStyles.root}>
        <Pressable
          style={[journeyLightboxStyles.closeBtn, { top: insets.top + 8, right: Math.max(insets.right, 16) }]}
          onPress={onClose}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <View style={journeyLightboxStyles.closeInner}>
            <X size={22} color="#fff" />
          </View>
        </Pressable>
        {slides.length > 1 ? (
          <View style={[journeyLightboxStyles.counterPill, { top: insets.top + 8 }]} pointerEvents="none">
            <Text style={journeyLightboxStyles.counterText}>
              {activeIndex + 1} / {slides.length}
            </Text>
          </View>
        ) : null}
        <FlatList
          ref={listRef}
          data={slides}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={initialIndex}
          getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
          keyExtractor={(item, index) => `${index}-${item.taskId}`}
          onMomentumScrollEnd={onMomentumScrollEnd}
          renderItem={({ item }) => {
            const uri = item.imageUrl;
            const failed = uri ? failedUris.has(uri) : false;
            const note = item.note?.trim() || null;
            return (
              <View style={[journeyLightboxStyles.imgWrap, { width }]}>
                {uri && !failed ? (
                  <>
                    <Image
                      source={{ uri }}
                      style={journeyLightboxStyles.img}
                      resizeMode="contain"
                      onError={() => setFailedUris((prev) => (prev.has(uri) ? prev : new Set(prev).add(uri)))}
                    />
                    {note ? (
                      <View
                        style={[journeyLightboxStyles.captionBar, { paddingBottom: Math.max(insets.bottom, 12) + 28 }]}
                        pointerEvents="none"
                      >
                        <Text style={journeyLightboxStyles.captionText} numberOfLines={4}>
                          {note}
                        </Text>
                      </View>
                    ) : null}
                  </>
                ) : (
                  <View style={journeyLightboxStyles.textCard}>
                    {failed ? (
                      <Text style={[journeyLightboxStyles.textCardNote, { color: "rgba(255,255,255,0.6)" }]}>
                        Photo unavailable
                      </Text>
                    ) : (
                      <Text style={journeyLightboxStyles.textCardNote} numberOfLines={10}>
                        {note ?? item.label}
                      </Text>
                    )}
                  </View>
                )}
              </View>
            );
          }}
        />
        {slides.length > 1 ? (
          <View pointerEvents="none" style={[journeyLightboxStyles.dotsRow, { bottom: Math.max(insets.bottom, 12) + 8 }]}>
            {slides.map((_, i) => (
              <View
                key={i}
                style={[
                  journeyLightboxStyles.dot,
                  { backgroundColor: i === activeIndex ? "#fff" : "rgba(255,255,255,0.4)" },
                ]}
              />
            ))}
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const journeyLightboxStyles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.92)",
    justifyContent: "center",
  },
  closeBtn: {
    position: "absolute",
    zIndex: 2,
  },
  closeInner: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.55)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  counterPill: {
    position: "absolute",
    alignSelf: "center",
    zIndex: 2,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  counterText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  imgWrap: {
    height: "100%",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  img: {
    width: "100%",
    height: "100%",
  },
  textCard: {
    width: "100%",
    minHeight: 220,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  textCardNote: {
    fontSize: 17,
    lineHeight: 25,
    fontWeight: "700",
    textAlign: "center",
    color: "#fff",
  },
  captionBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 24,
    paddingTop: 14,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  captionText: {
    color: "#fff",
    fontSize: 14,
    lineHeight: 19,
    textAlign: "center",
  },
  dotsRow: {
    position: "absolute",
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 5,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});

export default function MyJourneyScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { theme, isDark } = useTheme();
  const { session } = useAuth();
  const { width } = useWindowDimensions();
  const routeMode = paramString(params.mode) === "private" ? "private" : "public";
  const routeTab = paramString(params.tab) === "minis" ? "minis" : "missions";
  const [journeyMode, setJourneyMode] = useState<JourneyMode>(routeMode);
  const [activeTab, setActiveTab] = useState<StoryTab>(routeTab);
  const [publicStory, setPublicStory] = useState<CommunityPlayerStory | null>(null);
  const [loadingPublic, setLoadingPublic] = useState(true);
  const [publicMissionHasMore, setPublicMissionHasMore] = useState(false);
  const [publicMiniHasMore, setPublicMiniHasMore] = useState(false);
  const [publicMissionFetchedCount, setPublicMissionFetchedCount] = useState(0);
  const [publicMiniFetchedCount, setPublicMiniFetchedCount] = useState(0);
  const [loadingMoreHistory, setLoadingMoreHistory] = useState(false);
  const [missionVisibleCount, setMissionVisibleCount] = useState(MISSION_STORY_LIMIT);
  const [miniVisibleCount, setMiniVisibleCount] = useState(MINI_POST_LIMIT);
  const [refreshing, setRefreshing] = useState(false);
  const [publicError, setPublicError] = useState<string | null>(null);
  const [imagesEnabled, setImagesEnabled] = useState(false);
  const [lightboxSlides, setLightboxSlides] = useState<CommunityMemoryGalleryItem[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [selectedMission, setSelectedMission] = useState<CommunityPlayerMissionStory | null>(null);
  // MissionGalleryModal is itself a full-screen Modal — opening the lightbox Modal
  // on top of it (photo tap inside "View journey") hits the same "iOS can't stack a
  // second native Modal" bug documented in app-architecture.md. Close the gallery
  // modal before opening the lightbox and restore it afterward.
  const missionBeforeLightboxRef = useRef<CommunityPlayerMissionStory | null>(null);
  const openLightbox = useCallback(
    (slides: CommunityMemoryGalleryItem[], initialIndex?: number) => {
      missionBeforeLightboxRef.current = selectedMission;
      if (selectedMission) setSelectedMission(null);
      setLightboxSlides(slides);
      setLightboxIndex(initialIndex ?? 0);
    },
    [selectedMission],
  );
  const closeLightbox = useCallback(() => {
    setLightboxSlides([]);
    if (missionBeforeLightboxRef.current) {
      setSelectedMission(missionBeforeLightboxRef.current);
      missionBeforeLightboxRef.current = null;
    }
  }, []);
  const [listWidth, setListWidth] = useState(0);
  const { xp, username, habits, miniMissions } = useHabitStore(
    useShallow((s) => ({
      xp: s.xp,
      username: s.username,
      habits: s.habits,
      miniMissions: s.miniMissions,
    })),
  );
  const userId = session?.user?.id ?? null;
  const level = levelFromTotalXp(xp);
  const xpInLevel = xpInCurrentLevel(xp);
  const league = playerLeagueForLevel(level, theme, isDark);

  const loadPublicStory = useCallback(async (mode: "initial" | "refresh" = "initial") => {
    if (!userId) {
      setPublicStory(null);
      setPublicError("Sign in to view your public journey.");
      setPublicMissionHasMore(false);
      setPublicMiniHasMore(false);
      setPublicMissionFetchedCount(0);
      setPublicMiniFetchedCount(0);
      setLoadingPublic(false);
      return;
    }
    if (mode === "refresh") setRefreshing(true);
    else setLoadingPublic(true);
    setPublicError(null);
    const res = await fetchCommunityPlayerStory(userId, STORY_FETCH_LIMIT);
    if (res.ok === true) {
      setPublicStory(res.story);
      setPublicMissionHasMore(Boolean(res.story.missionHasMore ?? res.story.hasMore));
      setPublicMiniHasMore(Boolean(res.story.miniHasMore ?? res.story.hasMore));
      setPublicMissionFetchedCount(
        res.story.missionFetchedCount ?? storyPagePostCount({ missionStories: res.story.missionStories, miniPosts: [] }),
      );
      setPublicMiniFetchedCount(res.story.miniFetchedCount ?? res.story.miniPosts.length);
      setMissionVisibleCount(MISSION_STORY_LIMIT);
      setMiniVisibleCount(MINI_POST_LIMIT);
    } else {
      setPublicError(res.error);
      setPublicMissionHasMore(false);
      setPublicMiniHasMore(false);
    }
    setLoadingPublic(false);
    setRefreshing(false);
  }, [userId]);

  useEffect(() => {
    void loadPublicStory("initial");
  }, [loadPublicStory]);

  useEffect(() => {
    setJourneyMode(routeMode);
    setActiveTab(routeTab);
  }, [routeMode, routeTab]);

  useEffect(() => {
    setImagesEnabled(false);
    const task = InteractionManager.runAfterInteractions(() => {
      setImagesEnabled(true);
    });
    return () => {
      task.cancel();
    };
  }, [activeTab, journeyMode, publicStory?.profile.userId]);

  const privateStory = useMemo(() => buildPrivateStory(habits, miniMissions), [habits, miniMissions]);
  const missionDescriptions = useMemo(() => {
    const byTitle = new Map<string, string>();
    const byKey = new Map<string, string>();
    habits.forEach((habit) => {
      const description = habit.description?.trim();
      if (!description) return;
      byTitle.set(normalizeStoryTitle(habit.title), description);
      byKey.set(`habit:${habit.id}`, description);
      byKey.set(`private-habit-${habit.id}`, description);
    });
    return { byTitle, byKey };
  }, [habits]);
  const publicMissions = useMemo(
    () =>
      (publicStory?.missionStories ?? []).map((story) => ({
        ...story,
        description:
          story.description?.trim() ||
          missionDescriptions.byKey.get(story.key) ||
          missionDescriptions.byTitle.get(normalizeStoryTitle(story.title)) ||
          null,
      })),
    [missionDescriptions, publicStory?.missionStories],
  );
  const publicMinis = useMemo(() => publicStory?.miniPosts ?? [], [publicStory?.miniPosts]);
  const completeStory = useMemo(
    () => buildCompleteOwnerStory(publicMissions, publicMinis, privateStory),
    [privateStory, publicMissions, publicMinis],
  );
  const activeMissions = journeyMode === "public" ? publicMissions : completeStory.missionStories;
  const activeMinis = journeyMode === "public" ? publicMinis : completeStory.miniPosts;
  const visibleMissions = useMemo(() => activeMissions.slice(0, missionVisibleCount), [activeMissions, missionVisibleCount]);
  const visibleMinis = useMemo(() => activeMinis.slice(0, miniVisibleCount), [activeMinis, miniVisibleCount]);

  const publicPhotoPosts = useMemo(
    () => allPhotoPosts(publicMissions, publicMinis).slice(0, HERO_PHOTO_LIMIT),
    [publicMissions, publicMinis],
  );
  const contentPad = 0;
  const contentRightPad = 0;
  const measuredListWidth = listWidth > 0 ? listWidth : width;
  const miniAvailableWidth = Math.max(0, measuredListWidth - contentPad - contentRightPad - 4);
  const {
    columnCount: miniColumnCount,
    gap: miniGridGap,
  } = getJourneyMiniGridLayout(miniAvailableWidth, { gap: 9 });
  // FlashList's native masonry mode allocates each column a raw, gap-unaware
  // slot (availableWidth / columnCount) — not the row-flexbox-style tileWidth
  // above (which pre-subtracts total gap space for a `flexDirection: "row"`
  // layout). Compute the slot width masonry will actually use, then leave
  // `miniGridGap` as this card's own right/bottom margin so it doesn't touch
  // its neighbors.
  const masonrySlotWidth = miniColumnCount > 0 ? miniAvailableWidth / miniColumnCount : miniAvailableWidth;
  const miniTileWidth = Math.max(0, Math.floor(masonrySlotWidth - miniGridGap));
  const shownProfile: CommunityPlayerProfile | null = publicStory?.profile ?? (userId ? {
    userId,
    username,
    displayName: username,
    xp,
    publicWins: publicMissions.reduce((total, story) => total + story.postCount, 0) + publicMinis.length,
    miniWins: publicMinis.length,
    habitStreakWins: publicMissions.reduce((total, story) => total + story.postCount, 0),
    cheersReceived: 0,
    journeyViews: 0,
    recentWins: [],
  } : null);
  const weeklyRank: CommunityPlayerWeeklyRank | null = publicStory?.weeklyRank ?? null;
  const primaryName = shownProfile?.displayName || shownProfile?.username || username || "You";
  const handle = shownProfile?.username ? `@${shownProfile.username}` : username ? `@${username}` : "Your journey";
  const missionPreviewPhotoSize = Math.max(72, Math.min(86, (width - 54) / 4.35));
  const recentProofSize = Math.max(84, Math.min(104, width * 0.23));
  const totalPublicPhotos = publicStory?.totalPhotoMoments ?? publicPhotoPosts.length;
  const rows = useMemo<StoryRow[]>(() => {
    if (activeTab === "missions") return visibleMissions.map((story) => ({ kind: "mission", story }));
    return visibleMinis.map((post) => ({ kind: "mini", post }));
  }, [activeTab, visibleMissions, visibleMinis]);
  const activeTabTotal = activeTab === "missions" ? activeMissions.length : activeMinis.length;
  const activeTabVisible = activeTab === "missions" ? visibleMissions.length : visibleMinis.length;
  const hasLocalHistoryMore = activeTabVisible < activeTabTotal;
  const activePublicHasMore =
    journeyMode === "public" ? (activeTab === "missions" ? publicMissionHasMore : publicMiniHasMore) : false;
  const hasMoreHistory = hasLocalHistoryMore || activePublicHasMore;

  const onModeChange = useCallback((mode: JourneyMode) => {
    if (mode === journeyMode) return;
    setJourneyMode(mode);
  }, [journeyMode]);

  const handleListLayout = useCallback((event: LayoutChangeEvent) => {
    const nextWidth = Math.floor(event.nativeEvent.layout.width);
    setListWidth((current) => (Math.abs(current - nextWidth) > 1 ? nextWidth : current));
  }, []);

  const loadMoreHistory = useCallback(async () => {
    if (activeTab === "missions" && missionVisibleCount < activeMissions.length) {
      setMissionVisibleCount((count) => Math.min(count + MISSION_STORY_LIMIT, activeMissions.length));
      return;
    }
    if (activeTab === "minis" && miniVisibleCount < activeMinis.length) {
      setMiniVisibleCount((count) => Math.min(count + MINI_POST_LIMIT, activeMinis.length));
      return;
    }
    const feedSource = activeTab === "missions" ? "habit_streak" : "mini";
    const offset = activeTab === "missions" ? publicMissionFetchedCount : publicMiniFetchedCount;
    const remoteHasMore = activeTab === "missions" ? publicMissionHasMore : publicMiniHasMore;
    if (journeyMode !== "public" || !userId || !remoteHasMore || loadingMoreHistory) return;

    setLoadingMoreHistory(true);
    setPublicError(null);
    try {
      const res = await fetchCommunityPlayerStoryPage({
        userId,
        offset,
        limit: STORY_FETCH_LIMIT,
        feedSource,
      });
      if (res.ok === true) {
        const pageCount = storyPagePostCount(res.page);
        setPublicStory((current) => (current ? mergePublicStoryPage(current, res.page) : current));
        if (activeTab === "missions") {
          setPublicMissionFetchedCount((count) => count + (res.page.fetchedCount ?? pageCount));
          setPublicMissionHasMore(res.page.hasMore);
          setMissionVisibleCount((count) => count + MISSION_STORY_LIMIT);
        } else {
          setPublicMiniFetchedCount((count) => count + (res.page.fetchedCount ?? pageCount));
          setPublicMiniHasMore(res.page.hasMore);
          setMiniVisibleCount((count) => count + MINI_POST_LIMIT);
        }
      } else {
        setPublicError(res.error);
      }
    } catch (e) {
      setPublicError(e instanceof Error ? e.message : "Unable to load older journey history.");
    } finally {
      setLoadingMoreHistory(false);
    }
  }, [
    activeMissions.length,
    activeMinis.length,
    activeTab,
    loadingMoreHistory,
    miniVisibleCount,
    missionVisibleCount,
    journeyMode,
    publicMiniFetchedCount,
    publicMiniHasMore,
    publicMissionFetchedCount,
    publicMissionHasMore,
    userId,
  ]);

  const renderRow: ListRenderItem<StoryRow> = useCallback(
    ({ item, index }) => {
      if (item.kind === "mission") {
        return (
          <MissionStoryCard
            story={item.story}
            theme={theme}
            isDark={isDark}
            imagesEnabled={imagesEnabled}
            onOpenImage={openLightbox}
            onOpenGallery={setSelectedMission}
            photoSize={missionPreviewPhotoSize}
            journeyMode={journeyMode}
            index={index}
          />
        );
      }
      return (
        <MiniPostCard
          post={item.post}
          width={miniTileWidth}
          gap={miniGridGap}
          theme={theme}
          isDark={isDark}
          imagesEnabled={imagesEnabled}
          onOpenImage={openLightbox}
          journeyMode={journeyMode}
          index={index}
        />
      );
    },
    [imagesEnabled, isDark, journeyMode, miniGridGap, miniTileWidth, missionPreviewPhotoSize, theme],
  );

  const listHeader = useMemo(() => (
    <>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={[styles.backButton, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <ArrowLeft size={22} color={theme.colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.colors.textPrimary }]}>My journey</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.profileHero}>
        <View style={[styles.avatarRing, { borderColor: theme.colors.border }]}>
          <Text style={[styles.avatarInitials, { color: theme.colors.textPrimary }]}>{initialsFromName(primaryName)}</Text>
          <LevelXpRing level={level} xpInLevel={xpInLevel} size={104}>
            <View style={styles.levelRingInner} />
          </LevelXpRing>
        </View>
        <View style={styles.profileTextBlock}>
          <Text style={[styles.handle, { color: theme.colors.textPrimary }]} numberOfLines={1}>
            {handle}
          </Text>
          <View style={styles.profilePillRow}>
            <View style={[styles.leaguePill, { borderColor: league.color, backgroundColor: league.color + "18" }]}>
              <Text style={[styles.leaguePillText, { color: league.color }]} numberOfLines={1}>
                {league.label}
              </Text>
            </View>
            <View style={[styles.levelPill, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
              <User size={12} color={theme.colors.indigo[400]} />
              <Text style={[styles.levelPillText, { color: theme.colors.indigo[400] }]} numberOfLines={1}>
                Level {level}
              </Text>
            </View>
            {journeyMode === "public" ? (
              <View
                style={styles.viewsMetric}
                accessibilityLabel={`${shownProfile?.journeyViews ?? 0} public journey views`}
              >
                <AnimatedCountText
                  value={shownProfile?.journeyViews ?? 0}
                  style={[styles.viewsMetricNumber, { color: theme.colors.textSecondary }]}
                />
                <Text style={[styles.viewsMetricLabel, { color: theme.colors.textMuted }]} numberOfLines={1}>
                  views
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      </View>

      <View style={[styles.statPanel, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
        <GlassTopHighlight radius={16} />
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
            value={publicStory?.globalRank ? `#${publicStory.globalRank.rankPosition}` : "-"}
            accent={theme.colors.indigo[400]}
            icon={<Globe size={15} color={theme.colors.indigo[400]} />}
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
            value={shownProfile?.publicWins ?? "-"}
            accent={theme.colors.green[500]}
            icon={<Camera size={15} color={theme.colors.green[500]} />}
          />
          <StatTile
            theme={theme}
            label="Photos"
            value={totalPublicPhotos}
            accent={theme.colors.cyan[400]}
            icon={<ImageIcon size={15} color={theme.colors.cyan[400]} />}
          />
          <StatTile
            theme={theme}
            label="Cheers"
            value={shownProfile?.cheersReceived ?? "-"}
            accent={theme.colors.amber[500]}
            icon={<ThumbsUp size={15} color={theme.colors.amber[500]} />}
          />
        </View>
      </View>

      {publicPhotoPosts.length > 0 ? (
        <View style={styles.photoStripSection}>
          <Text style={[styles.sectionLabel, { color: theme.colors.textMuted }]}>RECENT PROOFS</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.heroPhotoRail}>
            {publicPhotoPosts.map((post) => (
              <View key={post.id} style={[styles.publicMomentItem, { width: recentProofSize }]}>
                <RecentProofBadge
                  post={post}
                  size={recentProofSize}
                  theme={theme}
                  imagesEnabled={imagesEnabled}
                  onPress={openLightbox}
                />
                <Text style={[styles.publicMomentTitle, { color: theme.colors.textSecondary }]} numberOfLines={1}>
                  {post.title}
                </Text>
              </View>
            ))}
          </ScrollView>
        </View>
      ) : null}

      <View style={styles.modeBlock}>
        <StoryToggle mode={journeyMode} onChange={onModeChange} theme={theme} />
        <Text style={[styles.modeHint, { color: theme.colors.textMuted }]} numberOfLines={2}>
          {journeyMode === "public"
            ? "Showing your Community journey."
            : "Showing your complete journey with public and private memories together."}
        </Text>
      </View>

      <View style={[styles.segmentRow, { borderBottomColor: theme.colors.border }]}>
        <TabButton
          active={activeTab === "missions"}
          label="Missions"
          value={activeMissions.length}
          kind="missions"
          onPress={() => setActiveTab("missions")}
          theme={theme}
        />
        <TabButton
          active={activeTab === "minis"}
          label="Minis"
          value={activeMinis.length}
          kind="minis"
          onPress={() => setActiveTab("minis")}
          theme={theme}
        />
      </View>
    </>
  ), [
    activeMissions.length,
    activeMinis.length,
    activeTab,
    handle,
    imagesEnabled,
    isDark,
    journeyMode,
    league.color,
    league.label,
    level,
    onModeChange,
    primaryName,
    publicPhotoPosts,
    publicStory?.globalRank,
    recentProofSize,
    router,
    shownProfile?.cheersReceived,
    shownProfile?.journeyViews,
    shownProfile?.publicWins,
    theme,
    totalPublicPhotos,
    weeklyRank,
    xpInLevel,
  ]);

  const empty = useMemo(() => {
    if (journeyMode === "public" && loadingPublic) {
      return (
        <View style={styles.loadingBlock}>
          <ActivityIndicator size="small" color={theme.colors.indigo[400]} />
          <Text style={[styles.loadingText, { color: theme.colors.textMuted }]}>Loading your public journey...</Text>
        </View>
      );
    }
    if (journeyMode === "public" && publicError) {
      return (
        <View style={[styles.emptyState, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
          <GlassTopHighlight radius={16} />
          <Globe size={24} color={theme.colors.textMuted} />
          <Text style={[styles.emptyTitle, { color: theme.colors.textPrimary }]}>Public journey unavailable</Text>
          <Text style={[styles.emptyBody, { color: theme.colors.textSecondary }]}>{publicError}</Text>
        </View>
      );
    }
    return (
      <View style={[styles.emptyState, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
        <GlassTopHighlight radius={16} />
        {journeyMode === "private" ? (
          <LockKeyhole size={24} color={theme.colors.textMuted} />
        ) : activeTab === "missions" ? (
          <Flame size={24} color={theme.colors.textMuted} />
        ) : (
          <Zap size={24} color={theme.colors.textMuted} />
        )}
        <Text style={[styles.emptyTitle, { color: theme.colors.textPrimary }]}>
          {journeyMode === "private" ? "No journey memories yet" : "No public memories yet"}
        </Text>
        <Text style={[styles.emptyBody, { color: theme.colors.textSecondary }]}>
          {journeyMode === "private"
            ? "Photos, notes, streak repairs, and public posts will appear here."
            : "Publish Community moments to build this journey."}
        </Text>
      </View>
    );
  }, [activeTab, journeyMode, loadingPublic, publicError, theme]);

  const listFooter = useMemo(() => {
    if (!hasMoreHistory && !loadingMoreHistory) return null;
    const noun = activeTab === "missions" ? "missions" : "minis";
    return (
      <View style={styles.loadMoreWrap}>
        <Pressable
          onPress={loadMoreHistory}
          disabled={loadingMoreHistory}
          accessibilityRole="button"
          accessibilityLabel={`Load more ${noun} history`}
          style={[
            styles.loadMoreButton,
            {
              borderColor: isDark ? "rgba(165, 180, 252, 0.42)" : "rgba(79, 70, 229, 0.2)",
              opacity: loadingMoreHistory ? 0.78 : 1,
            },
          ]}
        >
          <LinearGradient
            colors={
              isDark
                ? (["rgba(79, 70, 229, 0.82)", "rgba(6, 182, 212, 0.62)"] as const)
                : ([theme.colors.indigo[500], theme.colors.cyan[500]] as const)
            }
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.loadMoreGradient}
          >
            {loadingMoreHistory ? <ActivityIndicator size="small" color={theme.colors.white} /> : null}
            <Text style={[styles.loadMoreText, { color: theme.colors.white }]}>
              {loadingMoreHistory ? "Loading..." : `Load more ${noun}`}
            </Text>
          </LinearGradient>
        </Pressable>
      </View>
    );
  }, [activeTab, hasMoreHistory, isDark, loadMoreHistory, loadingMoreHistory, theme]);

  return (
    <Screen plain>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={theme.colors.background} />
      <FlashList
        style={styles.list}
        onLayout={handleListLayout}
        data={rows}
        keyExtractor={(row) => (row.kind === "mission" ? row.story.key : row.post.id)}
        renderItem={renderRow}
        // Minis tab: true masonry — each card packs into whichever column is
        // currently shortest, so a short card lets the next item in its own
        // column start immediately instead of waiting for its old row
        // partner. Deliberately not setting `optimizeItemArrangement`: it
        // would reorder items to balance column heights, which would break
        // this feed's chronological order — slightly uneven columns are the
        // right trade-off here, not shuffled dates.
        masonry={activeTab === "minis"}
        numColumns={activeTab === "minis" ? miniColumnCount : 1}
        ItemSeparatorComponent={activeTab === "minis" ? undefined : RowSeparator}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={empty}
        ListFooterComponent={listFooter}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void loadPublicStory("refresh")}
            tintColor={theme.colors.indigo[400]}
          />
        }
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingLeft: contentPad, paddingRight: contentRightPad, paddingTop: 6, paddingBottom: 26, flexGrow: 1 }}
      />

      <MissionGalleryModal
        visible={selectedMission !== null}
        mission={selectedMission}
        theme={theme}
        imagesEnabled={imagesEnabled}
        onClose={() => setSelectedMission(null)}
        onOpenImage={openLightbox}
        journeyMode={journeyMode}
      />

      <JourneyMemoryLightbox
        visible={lightboxSlides.length > 0}
        slides={lightboxSlides}
        initialIndex={lightboxIndex}
        onClose={closeLightbox}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { flex: 1 },
  header: {
    height: 46,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { flex: 1, textAlign: "center", fontSize: 17, lineHeight: 22, fontWeight: "900" },
  headerSpacer: { width: 42, height: 42 },
  profileHero: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingTop: 6,
    marginBottom: 14,
  },
  avatarRing: {
    width: 98,
    height: 98,
    borderRadius: 49,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitials: { position: "absolute", fontSize: 25, lineHeight: 30, fontWeight: "900" },
  levelRingInner: { width: 84, height: 84, borderRadius: 42 },
  profileTextBlock: { flex: 1, minWidth: 0, gap: 7 },
  handle: { fontSize: 27, lineHeight: 33, fontWeight: "900" },
  profilePillRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
  },
  leaguePill: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  leaguePillText: { fontSize: 12, lineHeight: 15, fontWeight: "900" },
  levelPill: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  levelPillText: { fontSize: 11, lineHeight: 14, fontWeight: "900" },
  viewsMetric: {
    alignSelf: "flex-start",
    minHeight: 26,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 3,
    paddingVertical: 4,
    gap: 4,
  },
  viewsMetricNumber: { fontSize: 16, lineHeight: 19, fontWeight: "800" },
  viewsMetricLabel: { fontSize: 11, lineHeight: 14, fontWeight: "700", textTransform: "lowercase" },
  statPanel: { borderWidth: 1, borderRadius: 16, overflow: "hidden" },
  statPanelRow: { minHeight: 48, flexDirection: "row" },
  statPanelDivider: { borderBottomWidth: 1 },
  statTile: { flex: 1, minWidth: 0, paddingHorizontal: 6, paddingVertical: 7, alignItems: "center", justifyContent: "center", gap: 1 },
  statValueRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, maxWidth: "100%" },
  statIcon: { width: 16, height: 18, alignItems: "center", justifyContent: "center" },
  statValue: { fontSize: 15, lineHeight: 18, fontWeight: "900", fontVariant: ["tabular-nums"] },
  statLabel: { width: "100%", fontSize: 9, lineHeight: 12, fontWeight: "900", marginTop: 1, textAlign: "center" },
  photoStripSection: { marginTop: 14 },
  sectionLabel: { fontSize: 11, lineHeight: 15, fontWeight: "900", marginBottom: 8 },
  heroPhotoRail: { gap: 9, paddingRight: 10 },
  publicMomentItem: { alignItems: "center", gap: 5 },
  publicMomentTitle: { fontSize: 10, lineHeight: 13, fontWeight: "900", textAlign: "center" },
  recentProofBadge: { position: "relative", alignItems: "center", justifyContent: "center" },
  recentProofImageFrame: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
    borderRadius: 12,
  },
  recentProofSvg: { position: "absolute", left: 0, top: 0 },
  thumbnailFrame: { overflow: "hidden" },
  photoFill: { width: "100%", height: "100%" },
  photoPlaceholder: { flex: 1, alignItems: "center", justifyContent: "center" },
  dayPill: {
    position: "absolute",
    left: 6,
    top: 6,
    minHeight: 19,
    borderRadius: 999,
    paddingHorizontal: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  recentProofDayPill: { left: 8, top: 5, minHeight: 18 },
  dayPillText: { color: "#FFFFFF", fontSize: 9, lineHeight: 11, fontWeight: "900" },
  modeBlock: { marginTop: 14, gap: 7 },
  modeToggle: { minHeight: 42, borderRadius: 15, borderWidth: 1, padding: 4, flexDirection: "row", gap: 4 },
  modeToggleButton: { flex: 1, borderRadius: 11, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  modeToggleText: { fontSize: 13, lineHeight: 17, fontWeight: "900" },
  modeHint: { fontSize: 11, lineHeight: 15, fontWeight: "800", paddingHorizontal: 2 },
  segmentRow: { flexDirection: "row", gap: 6, marginTop: 14, marginBottom: 10, paddingBottom: 8, borderBottomWidth: 1 },
  segmentButton: { flex: 1, minHeight: 44, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
  segmentLabelRow: { maxWidth: "100%", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  segmentLabel: { flexShrink: 1, minWidth: 0, fontSize: 16, lineHeight: 20, fontWeight: "900" },
  segmentCountBadge: { minWidth: 27, height: 27, borderRadius: 999, borderWidth: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  segmentCount: { fontSize: 11, lineHeight: 14, fontWeight: "900", fontVariant: ["tabular-nums"] },
  rowSeparator: { height: 10 },
  missionCard: { borderRadius: 15, borderWidth: 1, padding: 9, overflow: "hidden" },
  missionHeader: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  missionTitleWrap: { flex: 1, minWidth: 0 },
  missionTitleRow: { flexDirection: "row", alignItems: "center", gap: 6, minWidth: 0 },
  missionTitle: { flex: 1, minWidth: 0, fontSize: 16, lineHeight: 20, fontWeight: "900" },
  missionInfoButton: { padding: 2, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  missionStatScroller: { marginTop: 5, maxWidth: "100%" },
  missionStatRow: { flexDirection: "row", alignItems: "center", gap: 4, paddingRight: 8 },
  missionStatPill: { minHeight: 24, flexShrink: 0, borderRadius: 999, borderWidth: 1, paddingHorizontal: 8, flexDirection: "row", alignItems: "center", gap: 4 },
  missionStatText: { fontSize: 11, lineHeight: 14, fontWeight: "900" },
  journeyButton: { minHeight: 34, borderRadius: 999, borderWidth: 1, paddingHorizontal: 10, alignItems: "center", justifyContent: "center", maxWidth: 112 },
  journeyText: { fontSize: 12, lineHeight: 15, fontWeight: "900" },
  missionPhotoRail: { gap: 12, paddingTop: 14, paddingRight: 14 },
  storyPhotoTile: { overflow: "hidden", backgroundColor: "rgba(148, 163, 184, 0.14)" },
  storyPhotoCircleTile: { overflow: "visible", backgroundColor: "transparent" },
  storyPhotoImage: { width: "100%", height: "100%" },
  storyPhotoCircleImage: { borderWidth: 1 },
  missionCircleDayPill: { left: 4, top: -2, minHeight: 17, paddingHorizontal: 5 },
  missionCircleStatusGroup: { right: -5, top: -2 },
  tileStatusGroup: {
    position: "absolute",
    right: 6,
    top: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  tileIconPill: {
    minWidth: 19,
    minHeight: 19,
    borderRadius: 999,
    paddingHorizontal: 5,
    alignItems: "center",
    justifyContent: "center",
  },
  tileStatusPill: {
    minHeight: 19,
    borderRadius: 999,
    paddingHorizontal: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  tileBottomStatusPill: { position: "absolute", right: 7, bottom: 7 },
  circleStackBadge: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  // Rounded (non-circle) tiles keep the bottom-right corner for the like badge —
  // this sits bottom-left instead.
  roundedStackBadge: {
    position: "absolute",
    left: 7,
    bottom: 7,
    width: 19,
    height: 19,
    borderRadius: 9.5,
    alignItems: "center",
    justifyContent: "center",
  },
  tileStatusText: { color: "#FFFFFF", fontSize: 9, lineHeight: 11, fontWeight: "900", fontVariant: ["tabular-nums"] },
  textOnlyMoment: { minHeight: 52, borderRadius: 14, borderWidth: 1, marginTop: 10, padding: 9, flexDirection: "row", alignItems: "center", gap: 9 },
  textDayPill: { minHeight: 19, borderRadius: 999, paddingHorizontal: 7, alignItems: "center", justifyContent: "center", alignSelf: "center" },
  textOnlyContent: { flex: 1, minWidth: 0 },
  textOnlyCopy: { flex: 1, minWidth: 0, fontSize: 12, lineHeight: 17, fontWeight: "800" },
  miniCard: { borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  miniImageWrap: { width: "100%", aspectRatio: 1.08, overflow: "hidden" },
  miniDatePill: { position: "absolute", left: 8, top: 8, minHeight: 22, borderRadius: 999, paddingHorizontal: 8, alignItems: "center", justifyContent: "center" },
  miniStatusGroup: {
    position: "absolute",
    right: 8,
    top: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  miniIconPill: {
    minWidth: 22,
    minHeight: 22,
    borderRadius: 999,
    paddingHorizontal: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  miniStatusPill: {
    minHeight: 22,
    borderRadius: 999,
    paddingHorizontal: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  miniStatusText: { color: "#FFFFFF", fontSize: 10, lineHeight: 13, fontWeight: "900", fontVariant: ["tabular-nums"] },
  miniStackBadge: {
    position: "absolute",
    right: 8,
    bottom: 8,
    minWidth: 22,
    minHeight: 22,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  miniTextOnlyTop: { position: "relative", minHeight: 42 },
  miniBody: { paddingHorizontal: 8, paddingVertical: 8, gap: 5 },
  miniTitle: { fontSize: 13, lineHeight: 17, fontWeight: "900" },
  miniNote: { fontSize: 11, lineHeight: 15, fontWeight: "700" },
  loadMoreWrap: { paddingTop: 12, paddingBottom: 4, alignItems: "center" },
  loadMoreButton: {
    minHeight: 38,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  loadMoreGradient: {
    minHeight: 38,
    paddingHorizontal: 18,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  loadMoreText: { fontSize: 12, lineHeight: 16, fontWeight: "900" },
  loadingBlock: { alignItems: "center", justifyContent: "center", minHeight: 160, gap: 10 },
  loadingText: { fontSize: 13, lineHeight: 18, fontWeight: "800" },
  emptyState: { borderWidth: 1, borderRadius: 16, minHeight: 145, alignItems: "center", justifyContent: "center", padding: 18 },
  emptyTitle: { fontSize: 17, lineHeight: 22, fontWeight: "900", marginTop: 10, textAlign: "center" },
  emptyBody: { fontSize: 13, lineHeight: 19, fontWeight: "700", textAlign: "center", marginTop: 5 },
  galleryOverlay: { flex: 1, paddingTop: 28 },
  gallerySheet: { flex: 1 },
  galleryHeader: { minHeight: 56, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, marginBottom: 4 },
  galleryHeaderText: { flex: 1, minWidth: 0 },
  galleryTitleRow: { flexDirection: "row", alignItems: "center", gap: 6, minWidth: 0 },
  galleryTitle: { flexShrink: 1, minWidth: 0, fontSize: 21, lineHeight: 26, fontWeight: "900" },
  galleryInfoButton: { padding: 2, alignItems: "center", justifyContent: "center", flexShrink: 0, transform: [{ translateY: 2 }] },
  gallerySubtitle: { fontSize: 12, lineHeight: 16, fontWeight: "900", marginTop: 2 },
  galleryClose: { minHeight: 36, borderRadius: 999, borderWidth: 1, paddingHorizontal: 13, alignItems: "center", justifyContent: "center" },
  galleryCloseText: { fontSize: 12, lineHeight: 15, fontWeight: "900" },
  galleryScrollContent: { paddingBottom: 28 },
  galleryMasonryRow: { flexDirection: "row", alignItems: "flex-start" },
  galleryMasonryColumn: {},
  galleryMomentCard: { position: "relative", borderRadius: 13, borderWidth: 1, overflow: "hidden" },
  galleryMomentImage: { overflow: "hidden" },
  galleryFloatingDayPill: { position: "absolute", left: 9, top: 9, zIndex: 2, minHeight: 20, borderRadius: 999, paddingHorizontal: 7, alignItems: "center", justifyContent: "center" },
  galleryMomentBody: { paddingHorizontal: 9, paddingVertical: 8 },
  galleryTextOnlyBody: { paddingTop: 34 },
  galleryMomentNote: { fontSize: 12, lineHeight: 17, fontWeight: "700" },
});
