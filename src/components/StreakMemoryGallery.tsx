import { Text } from "./AppText";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Animated,
  Easing,
  View,
  Image,
  Pressable,
  StyleSheet,
  Modal,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { FlashList } from "@shopify/flash-list";
import { Bookmark, ShieldCheck, X } from "lucide-react-native";
import Svg, { ClipPath, Defs, Image as SvgImage, Path } from "react-native-svg";
import { useTheme } from "../context/ThemeContext";
import { useReducedMotion } from "../hooks/useReducedMotion";
import type { StreakMemory } from "../types/habit";
import {
  REPAIR_MEMORY_NOTE_SOLO,
  REPAIR_MEMORY_NOTE_SQUAD,
} from "../utils/repairStreakMemoryMerge";
import { formatDateDisplay } from "../utils/dateDisplay";
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

export function StreakMemoryGallery({
  entries,
  sectionTitle = "Your moments",
  sectionHint = "Tap a hex to revisit. Moments are view-only after you save them.",
  remotePeer = false,
}: StreakMemoryGalleryProps) {
  const { theme, isDark } = useTheme();
  const reduceMotion = useReducedMotion();
  const [open, setOpen] = useState<Entry | null>(null);
  const [viewerImageAspect, setViewerImageAspect] = useState<number | null>(null);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const mountedAtRef = useRef(Date.now());
  const firstCommitLoggedRef = useRef(false);

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

  useEffect(() => {
    if (!__DEV__ || firstCommitLoggedRef.current) return;
    firstCommitLoggedRef.current = true;
    console.info(
      `[habitPro:perf] memory.gallery.firstCommit ${Date.now() - mountedAtRef.current}ms ${JSON.stringify({
        entries: entries.length,
        columns: honeycombColumnData.length,
        tileW: Math.round(tileW),
        tileH: Math.round(tileH),
      })}`,
    );
  }, [entries.length, honeycombColumnData.length, tileH, tileW]);

  const viewerUri = open?.memory?.imageUrl || open?.memory?.imageUri;
  const modalHasRenderableImage = Boolean(
    viewerUri && (!remotePeer || uriLoadsForRemoteViewer(viewerUri)),
  );
  const modalNoteTrim = open?.memory?.note?.trim() ?? "";
  const modalTextOnlyHero = Boolean(modalNoteTrim && !modalHasRenderableImage);
  const openDayLabel =
    open && typeof open.missionDay === "number" && open.missionDay > 0
      ? `Day ${open.missionDay}`
      : null;

  const modalRepairKicker =
    open?.memory?.repairSource === "squad"
      ? "SQUAD REPAIR"
      : open?.memory?.repairSource === "solo"
        ? "STREAK REPAIR"
        : modalNoteTrim === REPAIR_MEMORY_NOTE_SQUAD || modalNoteTrim === REPAIR_MEMORY_NOTE_SOLO
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
  const viewerAspect = viewerImageAspect ?? 4 / 5;
  const naturalPhotoHeight = photoMaxWidth / viewerAspect;
  const viewerPhotoHeight = Math.min(naturalPhotoHeight, photoMaxHeight);
  const viewerPhotoWidth = Math.min(photoMaxWidth, viewerPhotoHeight * viewerAspect);
  const viewerCardWidth = modalHasRenderableImage ? viewerPhotoWidth + 20 : maxViewerCardWidth;

  useEffect(() => {
    if (!modalHasRenderableImage || !viewerUri) {
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
  }, [modalHasRenderableImage, viewerUri]);

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
              const displayUri = memory.imageUrl || memory.imageUri;
              const showImage = Boolean(displayUri) && (!remotePeer || uriLoadsForRemoteViewer(displayUri));
              const thumbUri =
                showImage && displayUri
                  ? storageThumbnailUri(displayUri, Math.round(tileW * 2.4), Math.round(tileH * 2.4))
                  : null;
              const hasLocalOnlyPhoto =
                remotePeer &&
                Boolean(memory.imageUri) &&
                !memory.imageUrl &&
                !uriLoadsForRemoteViewer(memory.imageUri);
              const noteTrim = memory.note?.trim() ?? "";
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
                    onPress={() => setOpen({ dateStr, memory, missionDay })}
                    style={styles.hexPressable}
                  >
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
                          {hasLocalOnlyPhoto ? "PHOTO" : repairKicker ?? "NOTE"}
                        </Text>
                        {hasLocalOnlyPhoto ? (
                          <Text style={[styles.hexNotePreview, { color: theme.colors.textMuted }]} numberOfLines={2}>
                            On their device
                          </Text>
                        ) : textOnlyThumb ? (
                          <Text style={[styles.hexNotePreview, { color: memoryTextColor }]} numberOfLines={2}>
                            {noteTrim}
                          </Text>
                        ) : null}
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
        <Pressable style={styles.viewerBackdrop} onPress={() => setOpen(null)}>
          <Pressable
            style={[
              styles.viewerInner,
              { backgroundColor: memoryShellBg, borderColor: memoryBorder, width: viewerCardWidth },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            {modalHasRenderableImage ? (
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
              {modalHasRenderableImage && modalNoteTrim ? (
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
          </Pressable>
        </Pressable>
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
  },
  hexOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
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
