import { Text } from "./AppText";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Animated,
  Easing,
  View,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Modal,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { FlashList } from "@shopify/flash-list";
import { Bookmark, ShieldCheck, X } from "lucide-react-native";
import Svg, { ClipPath, Defs, Image as SvgImage, Path } from "react-native-svg";
import { useTheme } from "../context/ThemeContext";
import { useReducedMotion } from "../hooks/useReducedMotion";
import type { StreakMemory, StreakMemoryTaskEntry } from "../types/habit";
import {
  REPAIR_MEMORY_NOTE_SOLO,
  REPAIR_MEMORY_NOTE_SQUAD,
} from "../utils/repairStreakMemoryMerge";
import { formatDateDisplay } from "../utils/dateDisplay";
import { playMemoryFormationHaptics, triggerHexSpringHaptic } from "../utils/hapticFeedback";
import { storageThumbnailUri } from "../utils/imageThumbnail";
import { traceSync } from "../lib/jsThreadProbe";

type Entry = { dateStr: string; memory: StreakMemory; missionDay?: number | null };
type HoneycombColumn = {
  key: string;
  items: Array<{ entry: Entry; index: number; row: number }>;
};

type StreakMemoryGalleryProps = {
  entries: Entry[];
  /** Defaults to "Your moments" on own habit detail. */
  sectionTitle?: string;
  sectionHint?: string;
  /**
   * Cohort / remote viewer: local file URIs from another device will not load.
   * Only http(s) images render; otherwise a note-only or placeholder card is shown.
   */
  remotePeer?: boolean;
};

const HONEYCOMB_ROWS = 2;
const HONEYCOMB_BUILD_STAGGER_MS = 58;
const HONEYCOMB_BUILD_STAGGER_CAP_MS = 580;
const HONEYCOMB_BUILD_DURATION_MS = 420;

function uriLoadsForRemoteViewer(uri: string | undefined): boolean {
  if (!uri) return false;
  return uri.startsWith("http://") || uri.startsWith("https://");
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function roundedHexPath(width: number, height: number, radius: number): string {
  const points = [
    { x: width * 0.5, y: 0 },
    { x: width, y: height * 0.25 },
    { x: width, y: height * 0.75 },
    { x: width * 0.5, y: height },
    { x: 0, y: height * 0.75 },
    { x: 0, y: height * 0.25 },
  ];
  const distance = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.hypot(a.x - b.x, a.y - b.y);
  const insetPoint = (
    from: { x: number; y: number },
    to: { x: number; y: number },
    amount: number,
  ) => {
    const len = distance(from, to);
    const t = len > 0 ? Math.min(amount / len, 0.45) : 0;
    return {
      x: from.x + (to.x - from.x) * t,
      y: from.y + (to.y - from.y) * t,
    };
  };

  return points
    .map((point, index) => {
      const prev = points[(index - 1 + points.length) % points.length];
      const next = points[(index + 1) % points.length];
      const start = insetPoint(point, prev, radius);
      const end = insetPoint(point, next, radius);
      const prefix = index === 0 ? `M ${start.x} ${start.y}` : `L ${start.x} ${start.y}`;
      return `${prefix} Q ${point.x} ${point.y} ${end.x} ${end.y}`;
    })
    .join(" ")
    .concat(" Z");
}

function clipIdForDate(dateStr: string, index: number): string {
  return `memory_hex_${dateStr.replace(/[^a-zA-Z0-9]/g, "_")}_${index}`;
}

function HoneycombBuildTile({
  children,
  delay,
  reduceMotion,
  style,
}: {
  children: ReactNode;
  delay: number;
  reduceMotion: boolean;
  style: StyleProp<ViewStyle>;
}) {
  const progress = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;

  useEffect(() => {
    progress.stopAnimation();
    if (reduceMotion) {
      progress.setValue(1);
      return undefined;
    }

    progress.setValue(0);
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: HONEYCOMB_BUILD_DURATION_MS,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
      isInteraction: false,
    });
    animation.start();
    return () => {
      animation.stop();
    };
  }, [delay, progress, reduceMotion]);

  const scale = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.82, 1],
  });
  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [8, 0],
  });
  const animatedStyle: Animated.WithAnimatedValue<ViewStyle> | null = reduceMotion
    ? null
    : {
        opacity: progress,
        transform: [{ scale }, { translateY }],
      };

  return <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>;
}

/** Time between shuffles; each tile picks a random offset within this so nearby hexes don't flip in sync. */
/** Full repeat length of the wave — kept the same cycle-to-cycle so each tile's phase offset stays stable, instead of drifting into a fresh random gap every time. */
const HEX_SPRING_WAVE_PERIOD_MS = 3600;
/** How far behind the previous stacked tile (by grid order) each next one fires — small on purpose, so a spring visibly "hands off" to the next tile in quick succession. */
const HEX_SPRING_WAVE_STAGGER_MS = 180;
/** Small per-cycle jitter so the wave still feels organic, not a metronome. */
const HEX_SPRING_WAVE_JITTER_MS = 150;
/** Per-tick chance a due hex actually springs — a little randomness so it's not every single tile every single pass. */
const HEX_SPRING_TRIGGER_PROBABILITY = 0.85;
const HEX_SPRING_SHRINK_DURATION_MS = 170;
const HEX_SPRING_SHRINK_SCALE = 0.55;
const HEX_SPRING_FADE_MIN_OPACITY = 0.85;

function hexSpringJitter(): number {
  return (Math.random() * 2 - 1) * HEX_SPRING_WAVE_JITTER_MS;
}

/**
 * The "living memory" idea, v2 — replaces the earlier fanned-stack shuffle. A day
 * with 2+ logged task photos renders as a perfectly normal single hex (no visible
 * stacking at rest); on a shared, repeating wave it does a quick spring "squish" —
 * scales down, swaps to the next photo in the stack at the smallest point, springs
 * back up, with a throttled light haptic timed to the swap.
 *
 * Each tile's phase is derived from its position in the grid (`waveIndex`) modulo
 * a fixed period, staggered a little behind the previous stacked tile — so instead
 * of every hex rolling an independent random delay (scattered, no visible
 * relationship), tiles spring in a short rolling succession that reads as one
 * continuous wave sweeping the grid, repeating every `HEX_SPRING_WAVE_PERIOD_MS`.
 * A small per-cycle jitter plus a per-tick trigger probability keep it from
 * looking perfectly mechanical.
 *
 * Cheaper than the fan it replaces: only one photo is ever mounted at a time (one
 * Animated.Value for scale, one for opacity — no per-photo array, so the whole
 * "stale ref array" crash class from the fan version doesn't apply here at all).
 * The only extra cost is prefetching the other stack photos into the native image
 * cache up front, so the swap at the bottom of the squish is instant instead of
 * showing a load flash. Skipped entirely when reduceMotion is on.
 */
function HexSpringStack({
  photos,
  tileW,
  tileH,
  hexPath,
  clipIdBase,
  reduceMotion,
  frontStrokeColor,
  waveIndex,
}: {
  photos: string[];
  tileW: number;
  tileH: number;
  hexPath: string;
  clipIdBase: string;
  reduceMotion: boolean;
  frontStrokeColor: string;
  /** This tile's position in the grid — derives its wave phase so stacked tiles spring in a short rolling succession instead of independently at random. */
  waveIndex: number;
}) {
  const n = photos.length;
  const [activeIndex, setActiveIndex] = useState(0);
  const shownIndex = Math.min(activeIndex, Math.max(0, n - 1));
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  const thumbUris = useMemo(
    () => photos.map((uri) => storageThumbnailUri(uri, Math.round(tileW * 2.4), Math.round(tileH * 2.4)) ?? uri),
    [photos, tileW, tileH],
  );
  const thumbUrisKey = thumbUris.join("|");

  useEffect(() => {
    // Warm the native image cache for every stacked photo up front — only one is
    // ever rendered at a time, but the swap needs to be instant, not a fetch.
    thumbUris.forEach((uri) => {
      Image.prefetch(uri).catch(() => {});
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thumbUrisKey]);

  useEffect(() => {
    if (reduceMotion || n < 2) return undefined;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    // This tile's slot in the repeating wave — a fixed stagger behind the previous
    // stacked tile in grid order, not a fresh random gap. Keeping the base delay
    // between cycles constant (only the jitter varies) is what keeps the wave
    // reading as one continuous sweep instead of drifting into unrelated timing.
    const phase = (waveIndex * HEX_SPRING_WAVE_STAGGER_MS) % HEX_SPRING_WAVE_PERIOD_MS;

    const tick = () => {
      if (cancelled) return;
      if (Math.random() < HEX_SPRING_TRIGGER_PROBABILITY) {
        Animated.timing(scale, {
          toValue: HEX_SPRING_SHRINK_SCALE,
          duration: HEX_SPRING_SHRINK_DURATION_MS,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
          isInteraction: false,
        }).start(() => {
          if (cancelled) return;
          setActiveIndex((prev) => (prev + 1) % n);
          triggerHexSpringHaptic();
          Animated.spring(scale, {
            toValue: 1,
            friction: 5,
            tension: 140,
            useNativeDriver: true,
            isInteraction: false,
          }).start();
        });
        Animated.timing(opacity, {
          toValue: HEX_SPRING_FADE_MIN_OPACITY,
          duration: HEX_SPRING_SHRINK_DURATION_MS,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
          isInteraction: false,
        }).start(() => {
          if (cancelled) return;
          Animated.timing(opacity, {
            toValue: 1,
            duration: 260,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
            isInteraction: false,
          }).start();
        });
      }
      timer = setTimeout(tick, Math.max(200, HEX_SPRING_WAVE_PERIOD_MS + hexSpringJitter()));
    };

    timer = setTimeout(tick, Math.max(0, phase + hexSpringJitter()));
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [n, reduceMotion, scale, opacity, waveIndex]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.hexSvg, reduceMotion ? null : { opacity, transform: [{ scale }] }]}
    >
      <Svg width={tileW} height={tileH} viewBox={`0 0 ${tileW} ${tileH}`}>
        <Defs>
          <ClipPath id={clipIdBase}>
            <Path d={hexPath} />
          </ClipPath>
        </Defs>
        <SvgImage
          href={{ uri: thumbUris[shownIndex] }}
          width={tileW}
          height={tileH}
          preserveAspectRatio="xMidYMid slice"
          clipPath={`url(#${clipIdBase})`}
        />
        <Path d={hexPath} fill="transparent" stroke={frontStrokeColor} strokeWidth={1.8} />
      </Svg>
    </Animated.View>
  );
}

export function StreakMemoryGallery({
  entries,
  sectionTitle = "Your moments",
  sectionHint = "Tap a hex to revisit. Moments are view-only after you save them.",
  remotePeer = false,
}: StreakMemoryGalleryProps) {
  const { theme, isDark } = useTheme();
  const reduceMotion = useReducedMotion();
  const [open, setOpen] = useState<Entry | null>(null);
  /** Checklist missions only — which logged task the swipeable viewer is currently showing. */
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [viewerImageAspect, setViewerImageAspect] = useState<number | null>(null);
  const formationHapticKeyRef = useRef<string | null>(null);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  const tileW = clamp((windowWidth - 42) / 3.06, 94, 122);
  const tileH = tileW * 1.12;
  const combGap = 2;
  const tileXStep = tileW + combGap;
  const tileYStep = tileH * 0.75 + combGap;
  const middleRowOffset = tileW * 0.5 + combGap * 0.5;
  const honeycombColumns = Math.max(1, Math.ceil(entries.length / HONEYCOMB_ROWS));
  const honeycombStageHeight = 4 + tileH + tileYStep * (HONEYCOMB_ROWS - 1);
  const honeycombFootprintWidth = tileW + middleRowOffset;
  const honeycombColumnMarginRight = tileXStep - honeycombFootprintWidth;
  const hexPath = roundedHexPath(tileW, tileH, 6);
  const honeycombColumnData = useMemo<HoneycombColumn[]>(() => {
    return traceSync("memory.gallery.columns", () =>
      Array.from({ length: honeycombColumns }, (_, columnIndex) => {
        const items = Array.from({ length: HONEYCOMB_ROWS }, (_, row) => {
          const index = columnIndex * HONEYCOMB_ROWS + row;
          const entry = entries[index];
          return entry ? { entry, index, row } : null;
        }).filter((item): item is { entry: Entry; index: number; row: number } => item !== null);

        return {
          key: items.map(({ entry, index }) => `${entry.dateStr}:${index}`).join("|") || String(columnIndex),
          items,
        };
      }),
    );
  }, [entries, honeycombColumns]);

  /**
   * Checklist missions only — swipeable multi-task viewer instead of the single memory
   * below. Every logged task shows up, even ones logged with neither a photo nor a
   * note ("just mark done") — matching the "own private view shows everything"
   * convention already used for minis' MiniMomentCarousel, not the Community-share
   * convention of dropping content-less entries.
   */
  const openTasks = useMemo(() => open?.memory?.tasks ?? [], [open?.memory?.tasks]);
  const isGalleryOpen = openTasks.length > 0;
  const clampedGalleryIndex = Math.min(galleryIndex, Math.max(0, openTasks.length - 1));
  const activeTask: StreakMemoryTaskEntry | null = isGalleryOpen ? openTasks[clampedGalleryIndex] : null;
  const activeTaskUri = activeTask?.proofUrls[0];
  const activeTaskHasImage = Boolean(activeTaskUri && (!remotePeer || uriLoadsForRemoteViewer(activeTaskUri)));

  const viewerUri = open?.memory?.imageUrl || open?.memory?.imageUri;
  const modalHasRenderableImage = isGalleryOpen
    ? activeTaskHasImage
    : Boolean(viewerUri && (!remotePeer || uriLoadsForRemoteViewer(viewerUri)));
  const modalNoteTrim = isGalleryOpen ? activeTask?.note?.trim() ?? "" : open?.memory?.note?.trim() ?? "";
  const modalTextOnlyHero = Boolean(modalNoteTrim && !modalHasRenderableImage);
  const openDayLabel =
    open && typeof open.missionDay === "number" && open.missionDay > 0
      ? `Day ${open.missionDay}`
      : null;
  const formationHapticKey = `${remotePeer ? "remote" : "own"}:${sectionTitle}:${entries[0]?.dateStr ?? "none"}:${entries.length}`;

  const modalRepairKicker =
    !isGalleryOpen && open?.memory?.repairSource === "squad"
      ? "SQUAD REPAIR"
      : !isGalleryOpen && open?.memory?.repairSource === "solo"
        ? "STREAK REPAIR"
        : !isGalleryOpen && (modalNoteTrim === REPAIR_MEMORY_NOTE_SQUAD || modalNoteTrim === REPAIR_MEMORY_NOTE_SOLO)
          ? "STREAK REPAIR"
          : null;
  const memoryCardBg = theme.colors.surface;
  const memoryTextBg = isDark ? "#141126" : theme.colors.surface;
  const memoryShellBg = theme.colors.surface;
  const memoryMetaBg = theme.colors.surfaceElevated;
  const memoryBorder = isDark ? "rgba(129, 140, 248, 0.32)" : theme.colors.border;
  const memoryTextColor = theme.colors.textPrimary;
  const memoryKickerColor = isDark ? theme.colors.cyan[400] : theme.colors.cyan[500];
  const maxViewerCardWidth = Math.min(windowWidth - 40, 420);
  const photoMaxWidth = maxViewerCardWidth - 20;
  const photoMaxHeight = Math.max(230, Math.min(windowHeight * 0.58, 500));
  /**
   * Gallery mode uses a fixed 4:5 mat for every slide instead of measuring each task
   * photo's real aspect ratio — keeps slide size constant while swiping (no layout
   * jank mid-gesture) and avoids an Image.getSize call per task.
   */
  const viewerAspect = isGalleryOpen ? 4 / 5 : viewerImageAspect ?? 4 / 5;
  const naturalPhotoHeight = photoMaxWidth / viewerAspect;
  const viewerPhotoHeight = Math.min(naturalPhotoHeight, photoMaxHeight);
  const viewerPhotoWidth = Math.min(photoMaxWidth, viewerPhotoHeight * viewerAspect);
  const viewerCardWidth = modalHasRenderableImage || isGalleryOpen ? viewerPhotoWidth + 20 : maxViewerCardWidth;

  useEffect(() => {
    if (isGalleryOpen || !modalHasRenderableImage || !viewerUri) {
      setViewerImageAspect(null);
      return undefined;
    }

    let cancelled = false;
    setViewerImageAspect(null);
    Image.getSize(
      viewerUri,
      (width, height) => {
        if (cancelled || width <= 0 || height <= 0) return;
        setViewerImageAspect(clamp(width / height, 0.45, 2.2));
      },
      () => {
        if (!cancelled) setViewerImageAspect(null);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [isGalleryOpen, modalHasRenderableImage, viewerUri]);

  useEffect(() => {
    if (entries.length === 0 || formationHapticKeyRef.current === formationHapticKey) {
      return undefined;
    }
    formationHapticKeyRef.current = formationHapticKey;
    return playMemoryFormationHaptics({
      itemCount: entries.length,
      reduceMotion,
    });
  }, [entries.length, formationHapticKey, reduceMotion]);

  if (entries.length === 0) return null;

  return (
    <>
      <View style={styles.section}>
        <View style={styles.sectionHead}>
          <Bookmark size={16} color={theme.colors.amber[500]} fill={theme.colors.amber[500]} />
          <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary }]}>{sectionTitle}</Text>
        </View>
        <Text style={[styles.sectionHint, { color: theme.colors.textMuted }]}>{sectionHint}</Text>

        <FlashList
          horizontal
          data={honeycombColumnData}
          drawDistance={tileXStep * 4}
          keyExtractor={(column) => column.key}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingLeft: 8, paddingRight: middleRowOffset + 16 }}
          style={{ height: honeycombStageHeight, overflow: "visible" }}
          renderItem={({ item: column }) => (
            <View
              style={[
                styles.honeycombColumn,
                {
                  width: honeycombFootprintWidth,
                  height: honeycombStageHeight,
                  marginRight: honeycombColumnMarginRight,
                },
              ]}
            >
              {column.items.map(({ entry: item, index, row }) => {
              const { dateStr, memory, missionDay } = item;
              /**
               * Checklist missions only: a day's memory logs into memory.tasks, never the
               * classic memory.imageUrl/imageUri/note — those stay undefined forever for a
               * checklist day (see handleTaskMemoryCommit in app/habit/[id].tsx). Before this,
               * a checklist day's hex fell through every branch below to a blank fill, since
               * nothing here ever looked at .tasks. Derive a cover photo/note from the first
               * task that has one, and cap how many extra photos stack behind it (2, so render
               * cost never scales with how many tasks a day actually has).
               */
              const taskEntries = memory.tasks ?? [];
              const hasTasks = taskEntries.length > 0;
              const taskPhotoUris = hasTasks
                ? taskEntries
                    .map((t) => t.proofUrls[0])
                    .filter((u): u is string => Boolean(u) && (!remotePeer || uriLoadsForRemoteViewer(u)))
                : [];
              const taskCoverNote = hasTasks ? taskEntries.find((t) => t.note?.trim())?.note?.trim() : undefined;
              const stackPhotos = taskPhotoUris.slice(0, 3);
              const isStacked = stackPhotos.length > 1;

              const displayUri = hasTasks ? stackPhotos[0] : memory.imageUrl || memory.imageUri;
              const showImage = Boolean(displayUri) && (!remotePeer || uriLoadsForRemoteViewer(displayUri));
              const thumbUri =
                showImage && displayUri
                  ? storageThumbnailUri(displayUri, Math.round(tileW * 2.4), Math.round(tileH * 2.4))
                  : null;
              const hasLocalOnlyPhoto =
                !hasTasks &&
                remotePeer &&
                Boolean(memory.imageUri) &&
                !memory.imageUrl &&
                !uriLoadsForRemoteViewer(memory.imageUri);
              const noteTrim = hasTasks ? taskCoverNote ?? "" : memory.note?.trim() ?? "";
              const textOnlyThumb = !showImage && !hasLocalOnlyPhoto && noteTrim.length > 0;
              const isSquadRepair = memory.repairSource === "squad";
              const repairKicker =
                isSquadRepair
                  ? "SQUAD REPAIR"
                  : memory.repairSource === "solo"
                    ? "STREAK REPAIR"
                    : noteTrim === REPAIR_MEMORY_NOTE_SQUAD || noteTrim === REPAIR_MEMORY_NOTE_SOLO
                      ? "STREAK REPAIR"
                      : null;

              const dayLabel =
                typeof missionDay === "number" && missionDay > 0 ? `D${missionDay}` : null;
              const left = row === 1 ? middleRowOffset : 0;
              const top = 2 + row * tileYStep;
              const clipId = clipIdForDate(dateStr, index);
              const buildDelay = Math.min(index * HONEYCOMB_BUILD_STAGGER_MS, HONEYCOMB_BUILD_STAGGER_CAP_MS);

              return (
                <HoneycombBuildTile
                  key={`${dateStr}-${index}`}
                  delay={buildDelay}
                  reduceMotion={reduceMotion}
                  style={[styles.hexTile, { width: tileW, height: tileH, left, top }]}
                >
                  <Pressable
                    onPress={() => {
                      setGalleryIndex(0);
                      setOpen({ dateStr, memory, missionDay });
                    }}
                    style={styles.hexPressable}
                  >
                    {isStacked ? (
                      <HexSpringStack
                        photos={stackPhotos}
                        tileW={tileW}
                        tileH={tileH}
                        hexPath={hexPath}
                        clipIdBase={clipId}
                        reduceMotion={reduceMotion}
                        waveIndex={index}
                        frontStrokeColor={
                          isSquadRepair
                            ? isDark
                              ? "rgba(34, 211, 238, 0.58)"
                              : "rgba(6, 182, 212, 0.42)"
                            : isDark
                              ? "rgba(255, 255, 255, 0.22)"
                              : "rgba(255, 255, 255, 0.72)"
                        }
                      />
                    ) : (
                      <Svg width={tileW} height={tileH} viewBox={`0 0 ${tileW} ${tileH}`} style={styles.hexSvg}>
                        <Defs>
                          <ClipPath id={clipId}>
                            <Path d={hexPath} />
                          </ClipPath>
                        </Defs>
                        {showImage ? (
                          <SvgImage
                            href={{ uri: thumbUri ?? displayUri! }}
                            width={tileW}
                            height={tileH}
                            preserveAspectRatio="xMidYMid slice"
                            clipPath={`url(#${clipId})`}
                          />
                        ) : (
                          <Path
                            d={hexPath}
                            fill={
                              isSquadRepair
                                ? isDark
                                  ? "#082f49"
                                  : "#ecfeff"
                                : textOnlyThumb
                                  ? isDark
                                    ? "#21194a"
                                    : "#eef2ff"
                                  : memoryCardBg
                            }
                          />
                        )}
                        <Path
                          d={hexPath}
                          fill="transparent"
                          stroke={
                            isSquadRepair
                              ? isDark
                                ? "rgba(34, 211, 238, 0.58)"
                                : "rgba(6, 182, 212, 0.42)"
                              : showImage
                                ? isDark
                                  ? "rgba(255, 255, 255, 0.22)"
                                  : "rgba(255, 255, 255, 0.72)"
                                : memoryBorder
                          }
                          strokeWidth={1.8}
                        />
                      </Svg>
                    )}

                    {isSquadRepair ? (
                      <View
                        style={[styles.hexOverlay, { paddingHorizontal: tileW * 0.2 }]}
                        pointerEvents="none"
                      >
                        <View
                          style={[
                            styles.hexIconShell,
                            {
                              backgroundColor: isDark ? "rgba(34, 211, 238, 0.16)" : "rgba(6, 182, 212, 0.13)",
                              borderColor: isDark ? "rgba(125, 211, 252, 0.42)" : "rgba(6, 182, 212, 0.34)",
                            },
                          ]}
                        >
                          <ShieldCheck size={18} color={theme.colors.cyan[400]} strokeWidth={2.4} />
                        </View>
                        <Text style={[styles.hexKicker, { color: theme.colors.cyan[400] }]} numberOfLines={1}>
                          SAVE
                        </Text>
                      </View>
                    ) : textOnlyThumb || hasLocalOnlyPhoto || !showImage ? (
                      <View
                        style={[styles.hexOverlay, { paddingHorizontal: tileW * 0.18 }]}
                        pointerEvents="none"
                      >
                        <Text style={[styles.hexQuote, { color: theme.colors.indigo[400] }]}>{'\u201C'}</Text>
                        <Text style={[styles.hexKicker, { color: memoryKickerColor }]} numberOfLines={1}>
                          {hasLocalOnlyPhoto ? "PHOTO" : repairKicker ?? (hasTasks && !textOnlyThumb ? "LOGGED" : "NOTE")}
                        </Text>
                        {hasLocalOnlyPhoto ? (
                          <Text style={[styles.hexNotePreview, { color: theme.colors.textMuted }]} numberOfLines={2}>
                            On their device
                          </Text>
                        ) : textOnlyThumb ? (
                          <Text style={[styles.hexNotePreview, { color: memoryTextColor }]} numberOfLines={2}>
                            {noteTrim}
                          </Text>
                        ) : hasTasks ? (
                          <Text style={[styles.hexNotePreview, { color: theme.colors.textMuted }]} numberOfLines={1}>
                            {taskEntries.length} task{taskEntries.length === 1 ? "" : "s"}
                          </Text>
                        ) : null}
                      </View>
                    ) : null}

                    {taskEntries.length > 1 ? (
                      <View
                        pointerEvents="none"
                        style={[
                          styles.hexCountChip,
                          { backgroundColor: theme.colors.amber[500], borderColor: memoryCardBg },
                        ]}
                      >
                        <Text style={styles.hexCountChipText}>{taskEntries.length}</Text>
                      </View>
                    ) : null}

                    {dayLabel ? (
                      <View
                        pointerEvents="none"
                        style={[
                          styles.hexDayPill,
                          {
                            backgroundColor: showImage
                              ? "rgba(15, 23, 42, 0.78)"
                              : isDark
                                ? "rgba(15, 23, 42, 0.84)"
                                : "rgba(255, 255, 255, 0.88)",
                            borderColor: showImage ? "rgba(255, 255, 255, 0.42)" : memoryBorder,
                          },
                        ]}
                      >
                        <Text style={[styles.hexDayText, { color: showImage ? "#ffffff" : theme.colors.textSecondary }]}>
                          {dayLabel}
                        </Text>
                      </View>
                    ) : null}
                  </Pressable>
                </HoneycombBuildTile>
              );
              })}
            </View>
          )}
        />
        <View style={[styles.combRail, { backgroundColor: memoryBorder }]} />
      </View>

      <Modal visible={open !== null} transparent animationType="fade" onRequestClose={() => setOpen(null)}>
        {/*
          Backdrop and inner wrapper are plain Views, not Pressable — an ancestor
          Pressable steals the touch responder from a nested scrollable carousel on
          iOS (the carousel renders but never slides). Already found and fixed once
          before in CohortPeerStreakDots.tsx's DotViewerCarousel; see
          app-architecture.md Known Caution Points. Closing now relies entirely on
          the explicit X button below plus the Modal's own onRequestClose (Android
          back gesture) instead of tap-to-close-on-backdrop.
        */}
        <View style={styles.viewerBackdrop}>
          <View
            style={[
              styles.viewerInner,
              { backgroundColor: memoryShellBg, borderColor: memoryBorder, width: viewerCardWidth },
            ]}
          >
            {isGalleryOpen ? (
              <View style={{ width: viewerPhotoWidth, height: viewerPhotoHeight }}>
                <ScrollView
                  horizontal
                  pagingEnabled
                  showsHorizontalScrollIndicator={false}
                  style={{ width: viewerPhotoWidth, height: viewerPhotoHeight }}
                  contentContainerStyle={{ width: viewerPhotoWidth * openTasks.length }}
                  onMomentumScrollEnd={(e: NativeSyntheticEvent<NativeScrollEvent>) => {
                    if (viewerPhotoWidth <= 0) return;
                    const idx = Math.round(e.nativeEvent.contentOffset.x / viewerPhotoWidth);
                    setGalleryIndex(Math.max(0, Math.min(openTasks.length - 1, idx)));
                  }}
                >
                  {openTasks.map((task) => {
                    const taskUri = task.proofUrls[0];
                    const taskUriLoads = Boolean(taskUri && (!remotePeer || uriLoadsForRemoteViewer(taskUri)));
                    return (
                    <View key={task.taskId} style={{ width: viewerPhotoWidth, height: viewerPhotoHeight }}>
                      {taskUriLoads ? (
                        <View
                          style={[
                            styles.viewerPhotoMat,
                            { width: viewerPhotoWidth, height: viewerPhotoHeight, backgroundColor: isDark ? "#070b16" : "#f8fafc" },
                          ]}
                        >
                          <Image source={{ uri: taskUri! }} style={styles.viewerImg} resizeMode="cover" />
                        </View>
                      ) : (
                        <View
                          style={[
                            styles.viewerTextOnlyHero,
                            {
                              width: viewerPhotoWidth,
                              height: viewerPhotoHeight,
                              borderColor: memoryBorder,
                              borderLeftColor: theme.colors.indigo[500],
                              backgroundColor: memoryTextBg,
                            },
                          ]}
                        >
                          <Text style={[styles.viewerTextOnlyKicker, { color: memoryKickerColor }]}>
                            {task.label.toUpperCase()}
                          </Text>
                          <Text style={[styles.viewerTextOnlyBody, { color: memoryTextColor }]}>
                            {task.note?.trim() || "Marked complete — no note added."}
                          </Text>
                        </View>
                      )}
                    </View>
                    );
                  })}
                </ScrollView>
                {openTasks.length > 1 ? (
                  <View pointerEvents="none" style={styles.viewerDotsRow}>
                    {openTasks.map((task, i) => (
                      <View
                        key={task.taskId}
                        style={[
                          styles.viewerDot,
                          { backgroundColor: i === clampedGalleryIndex ? "#fff" : "rgba(255,255,255,0.4)" },
                        ]}
                      />
                    ))}
                  </View>
                ) : null}
              </View>
            ) : modalHasRenderableImage ? (
              <View
                style={[
                  styles.viewerPhotoMat,
                  {
                    width: viewerPhotoWidth,
                    height: viewerPhotoHeight,
                    backgroundColor: isDark ? "#070b16" : "#f8fafc",
                  },
                ]}
              >
                <Image
                  source={{ uri: viewerUri! }}
                  style={styles.viewerImg}
                  resizeMode="cover"
                  onLoad={(event) => {
                    const source = event.nativeEvent.source;
                    if (source.width > 0 && source.height > 0) {
                      setViewerImageAspect(clamp(source.width / source.height, 0.45, 2.2));
                    }
                  }}
                />
              </View>
            ) : modalNoteTrim ? (
              <View
                style={[
                  styles.viewerTextOnlyHero,
                  {
                    borderColor: memoryBorder,
                    borderLeftColor: theme.colors.indigo[500],
                    backgroundColor: memoryTextBg,
                  },
                ]}
              >
                <Text style={[styles.viewerTextOnlyKicker, { color: memoryKickerColor }]}>
                  {modalRepairKicker ?? "FIELD NOTE"}
                </Text>
                <Text style={[styles.viewerTextOnlyBody, { color: memoryTextColor }]}>{modalNoteTrim}</Text>
              </View>
            ) : null}
            <View
              style={[
                styles.viewerMeta,
                {
                  backgroundColor: modalHasRenderableImage ? memoryShellBg : memoryMetaBg,
                  borderColor: memoryBorder,
                },
              ]}
            >
              <View style={styles.viewerMetaTop}>
                <Text style={[styles.viewerDate, { color: memoryKickerColor }]}>
                  {formatDateDisplay(open?.dateStr, open?.dateStr ?? "")}
                </Text>
                {openDayLabel ? (
                  <Text style={[styles.viewerDay, { color: theme.colors.indigo[400] }]}>{openDayLabel}</Text>
                ) : null}
              </View>
              {isGalleryOpen ? (
                <View style={styles.viewerMetaTop}>
                  <Text style={[styles.viewerTaskLabel, { color: theme.colors.textPrimary }]} numberOfLines={1}>
                    {activeTask?.label}
                  </Text>
                  {openTasks.length > 1 ? (
                    <Text style={[styles.viewerTaskCount, { color: theme.colors.textMuted }]}>
                      {clampedGalleryIndex + 1} / {openTasks.length}
                    </Text>
                  ) : null}
                </View>
              ) : null}
              {isGalleryOpen ? (
                activeTaskHasImage && modalNoteTrim ? (
                  <Text style={[styles.viewerNote, { color: theme.colors.textPrimary }]}>{modalNoteTrim}</Text>
                ) : null
              ) : modalHasRenderableImage && modalNoteTrim ? (
                <Text style={[styles.viewerNote, { color: theme.colors.textPrimary }]}>{modalNoteTrim}</Text>
              ) : modalTextOnlyHero ? null : open?.memory.imageUri &&
                remotePeer &&
                !open.memory.imageUrl &&
                !uriLoadsForRemoteViewer(open.memory.imageUri) ? (
                <Text style={[styles.viewerNote, { color: theme.colors.textMuted, fontStyle: "italic" }]}>
                  Photo is only on their device until cloud photos ship.
                </Text>
              ) : (
                <Text style={[styles.viewerNote, { color: theme.colors.textMuted, fontStyle: "italic" }]}>Photo only</Text>
              )}
            </View>
            <Pressable
              onPress={() => setOpen(null)}
              style={[styles.viewerClose, { backgroundColor: theme.colors.surface }]}
            >
              <X size={22} color={theme.colors.textPrimary} />
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: 28 },
  sectionHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  sectionTitle: { fontSize: 17, fontWeight: "800" },
  sectionHint: { fontSize: 12, marginBottom: 10, lineHeight: 17 },
  honeycombColumn: {
    position: "relative",
    overflow: "visible",
  },
  hexTile: {
    position: "absolute",
  },
  hexPressable: {
    width: "100%",
    height: "100%",
  },
  hexSvg: {
    position: "absolute",
    left: 0,
    top: 0,
    zIndex: 2,
  },
  hexCountChip: {
    position: "absolute",
    top: 4,
    right: 4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 5,
  },
  hexCountChipText: {
    fontSize: 9,
    fontWeight: "900",
    color: "#1a1200",
  },
  hexOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 3,
  },
  hexIconShell: {
    width: 30,
    height: 30,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  hexQuote: {
    fontSize: 24,
    lineHeight: 23,
    fontWeight: "900",
    marginBottom: -2,
    opacity: 0.82,
  },
  hexKicker: {
    fontSize: 7,
    lineHeight: 9,
    fontWeight: "900",
    letterSpacing: 1.1,
    textAlign: "center",
  },
  hexNotePreview: {
    marginTop: 3,
    fontSize: 8,
    lineHeight: 11,
    fontWeight: "800",
    textAlign: "center",
  },
  hexDayPill: {
    position: "absolute",
    left: "50%",
    bottom: 14,
    minWidth: 30,
    transform: [{ translateX: -15 }],
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    zIndex: 3,
  },
  hexDayText: {
    fontSize: 9,
    lineHeight: 11,
    fontWeight: "900",
  },
  combRail: {
    height: StyleSheet.hairlineWidth,
    opacity: 0.7,
    marginTop: 10,
  },
  viewerBackdrop: {
    flex: 1,
    justifyContent: "center",
    padding: 20,
    backgroundColor: "rgba(0,0,0,0.85)",
  },
  viewerInner: {
    alignSelf: "center",
    borderRadius: 24,
    borderWidth: 1,
    overflow: "hidden",
    padding: 10,
  },
  viewerPhotoMat: {
    alignSelf: "center",
    borderRadius: 18,
    overflow: "hidden",
  },
  viewerImg: { width: "100%", height: "100%" },
  viewerDotsRow: {
    position: "absolute",
    bottom: 10,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
  },
  viewerDot: { width: 6, height: 6, borderRadius: 3 },
  viewerTaskLabel: { fontSize: 14, fontWeight: "800", flex: 1 },
  viewerTaskCount: { fontSize: 11, fontWeight: "700", fontVariant: ["tabular-nums"] },
  viewerTextOnlyHero: {
    width: "100%",
    minHeight: 280,
    paddingHorizontal: 22,
    paddingVertical: 28,
    borderLeftWidth: 5,
    borderTopWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    justifyContent: "center",
  },
  viewerTextOnlyKicker: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 2.2,
    marginBottom: 14,
  },
  viewerTextOnlyBody: { fontSize: 18, lineHeight: 28, fontWeight: "600" },
  viewerMeta: { paddingHorizontal: 6, paddingTop: 12, paddingBottom: 8 },
  viewerMetaTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 8,
  },
  viewerDate: { fontSize: 12, fontWeight: "800", letterSpacing: 0.8, flex: 1 },
  viewerDay: { fontSize: 12, fontWeight: "900", letterSpacing: 0.6 },
  viewerNote: { fontSize: 16, lineHeight: 24 },
  viewerClose: {
    position: "absolute",
    top: 12,
    right: 12,
    width: 40,
    height: 40,
    borderRadius: 9999,
    alignItems: "center",
    justifyContent: "center",
  },
});
