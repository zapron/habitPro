import { Text } from "./AppText";
import {
  memo,
  useMemo,
  useState,
  useCallback,
  useEffect,
  useRef } from "react";
import {
  View,
  Pressable,
  StyleSheet,
  Modal,
  Image,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
  ScrollView,
  useWindowDimensions,
} from "react-native";
import type { NativeScrollEvent, NativeSyntheticEvent } from "react-native";
import { X, Camera, MessageSquare, Lock, Check, ListChecks } from "lucide-react-native";
import { useTheme } from "../context/ThemeContext";
import { fetchChallengeMemoryDetail, type PhotoSyncState } from "../lib/challengeMemoryDetail";
import type { AppTheme } from "../styles/theme";
import type { Habit, StreakMemory, StreakMemoryTaskEntry } from "../types/habit";
import { formatDateDisplay } from "../utils/dateDisplay";
import { calendarDateForHabitMissionDayIndex, getHabitActiveMissionDaySlot } from "../utils/missionDaySlots";

const DOT_SIZE = 36;
const DOT_GAP = 8;

/** Dot timeline key: memory / check-in / current day. Use once beside the cohort participants heading. */
export function CohortParticipantTimelineLegend({
  theme,
  isDark,
}: {
  theme: AppTheme;
  isDark: boolean;
}) {
  const richLegendFill = isDark ? "#23274e" : "#eef2ff";
  const richLegendBorder = theme.colors.indigo[500];
  const todayLegendBorder = theme.colors.amber[500];

  return (
    <View
      style={styles.legendRow}
      accessibilityLabel="Timeline legend: with memory, check-in only, current day"
    >
      <View style={styles.legendItem}>
        <View
          style={[
            styles.legendSwatch,
            {
              backgroundColor: richLegendFill,
              borderColor: richLegendBorder,
              borderWidth: 1.5,
              shadowColor: theme.colors.indigo[500],
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: 0.2,
              shadowRadius: 1,
            },
          ]}
        />
        <Text style={[styles.legendLabel, { color: theme.colors.textMuted }]}>With Memory</Text>
      </View>
      <View style={styles.legendItem}>
        <View
          style={[
            styles.legendSwatch,
            {
              backgroundColor: richLegendFill,
              borderColor: richLegendBorder,
              borderWidth: 1.5,
            },
          ]}
        />
        <Text style={[styles.legendLabel, { color: theme.colors.textMuted }]}>Check-in Only</Text>
      </View>
      <View style={styles.legendItem}>
        <View
          style={[
            styles.legendSwatch,
            { backgroundColor: theme.colors.surfaceElevated, borderColor: todayLegendBorder, borderWidth: 1.8 },
          ]}
        />
        <Text style={[styles.legendLabel, { color: theme.colors.textMuted }]}>Current</Text>
      </View>
    </View>
  );
}

type Props = {
  habit: Habit;
  /** Challenge route id from the current group screen; preferred over habit metadata for detail fetches. */
  challengeId?: string | null;
  /** Lowercase @handle when known */
  peerUsername: string | null;
  /** Cohort viewer: only http(s) images load */
  remotePeer?: boolean;
  /**
   * This row belongs to the viewer's own mission. Does NOT bypass the visibility
   * gate — a "solo" mission stays hidden even from its own owner in this
   * squad-cohort view, matching the classic single-memory flow exactly. Only
   * changes what happens once that gate has already passed (i.e. `visibility` is
   * "public"): memory content is read straight from local `habit.streakMemories`
   * instead of the remote detail RPC (matches the mission detail screen exactly,
   * including anything not yet synced), and local file:// photos load directly.
   */
  isSelf?: boolean;
  /** When false, only mission-day dots + memory modal (header lives in parent card). */
  showIdentityRow?: boolean;
  /** Stable render clock from the parent screen; avoids Date.now() churn per row. */
  nowMs?: number;
};

function uriLoadsForRemoteViewer(uri: string | undefined): boolean {
  if (!uri) return false;
  return uri.startsWith("http://") || uri.startsWith("https://");
}

/**
 * Task photo/text catalog inside the streak-dot viewer modal. `imgContainer`'s width
 * resolves from a "100%" layout, so it isn't known synchronously — but starting the
 * measurement at 0 and gating the whole `FlatList` behind it (`slideWidth > 0 ? ... :
 * null`) meant that on the rare occasion `onLayout` fired late, fired with a stale 0,
 * or didn't fire again inside this Modal, the carousel silently rendered nothing at
 * all — a persistent blank/black card, for both photo *and* text slides alike, since
 * both sat behind the same gate. Seeding `slideWidth` with a computed fallback (screen
 * width minus this card's own known insets) means something always renders from the
 * first frame; `onLayout` still refines it if the real measurement differs.
 */
function DotViewerCarousel({
  slides,
  activeIndex,
  onIndexChange,
}: {
  slides: StreakMemoryTaskEntry[];
  activeIndex: number;
  onIndexChange: (index: number) => void;
}) {
  const { width: screenWidth } = useWindowDimensions();
  // viewerBackdrop padding (20 each side) + viewerInner padding (10 each side).
  const [slideWidth, setSlideWidth] = useState(() => Math.max(1, screenWidth - 60));
  const [failedUris, setFailedUris] = useState<ReadonlySet<string>>(() => new Set());

  const onMomentumScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (slideWidth <= 0) return;
    const idx = Math.round(e.nativeEvent.contentOffset.x / slideWidth);
    onIndexChange(Math.max(0, Math.min(slides.length - 1, idx)));
  };

  return (
    <View
      style={StyleSheet.absoluteFillObject}
      onLayout={(e) => {
        const w = e.nativeEvent.layout.width;
        if (w > 0 && Math.abs(w - slideWidth) > 1) setSlideWidth(w);
      }}
    >
      <FlatList
        data={slides}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        initialScrollIndex={activeIndex}
        keyExtractor={(item, index) => `${index}-${item.taskId}`}
        getItemLayout={(_, index) => ({ length: slideWidth, offset: slideWidth * index, index })}
        onMomentumScrollEnd={onMomentumScrollEnd}
        renderItem={({ item }) => {
          const uri = item.proofUrls[0];
          const failed = uri ? failedUris.has(uri) : false;
          if (uri && !failed) {
            return (
              <Image
                source={{ uri }}
                style={{ width: slideWidth, height: "100%" }}
                resizeMode="contain"
                onError={() => setFailedUris((prev) => (prev.has(uri) ? prev : new Set(prev).add(uri)))}
              />
            );
          }
          return (
            <View style={[styles.textSlide, { width: slideWidth }]}>
              {failed ? (
                <>
                  <Camera size={24} color="rgba(255,255,255,0.6)" strokeWidth={2} />
                  <Text style={[styles.textSlideNote, { color: "rgba(255,255,255,0.6)" }]}>Photo unavailable</Text>
                </>
              ) : (
                <Text style={styles.textSlideNote} numberOfLines={10}>
                  {item.note ?? item.label}
                </Text>
              )}
            </View>
          );
        }}
      />
      {slides.length > 1 ? (
        <View pointerEvents="none" style={styles.carouselDotsRow}>
          {slides.map((_, i) => (
            <View
              key={i}
              style={[styles.carouselDot, { backgroundColor: i === activeIndex ? "#fff" : "rgba(255,255,255,0.4)" }]}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

export const CohortPeerStreakDots = memo(function CohortPeerStreakDots({
  habit,
  challengeId: challengeIdOverride,
  peerUsername,
  remotePeer = true,
  isSelf = false,
  showIdentityRow = true,
  nowMs: nowMsProp,
}: Props) {
  const { theme, isDark } = useTheme();
  const effectiveRemotePeer = isSelf ? false : remotePeer;
  const total = Math.max(1, habit.totalDays ?? 21);
  const nowMs = nowMsProp ?? Date.now();
  const activeSlot = getHabitActiveMissionDaySlot(habit, nowMs);
  const visibleThroughDay = activeSlot ?? total;
  const completedDateSet = useMemo(() => new Set(habit.completedDates), [habit.completedDates]);

  const days = useMemo(() => {
    const out: {
      dayNum: number;
      dateStr: string;
      completed: boolean;
      memory: StreakMemory | undefined;
    }[] = [];
    const cappedVisibleDay = Math.min(total, Math.max(1, visibleThroughDay));
    for (let i = cappedVisibleDay - 1; i >= 0; i--) {
      const dateStr = calendarDateForHabitMissionDayIndex(habit, i, nowMs);
      const completed = completedDateSet.has(dateStr);
      const memory = habit.streakMemories?.[dateStr];
      out.push({ dayNum: i + 1, dateStr, completed, memory });
    }
    return out;
  }, [completedDateSet, habit, nowMs, total, visibleThroughDay]);

  const [open, setOpen] = useState<{
    dateStr: string;
    dayNum: number;
    memory?: StreakMemory;
    isPrivate?: boolean;
    isCheckInOnly?: boolean;
    error?: string;
    photoSyncState?: PhotoSyncState;
  } | null>(null);
  // A peer's memory needs an async RPC round-trip before there's anything to show.
  // The Modal itself is never opened until that call resolves — the loading state
  // is shown as a small spinner on the tapped dot instead. Two attempted fixes for
  // this were tried and reverted: first, opening the Modal early in a "Loading
  // moment…" state and swapping in content once ready silently failed to render
  // on Android (content mounted into an already-presented native Modal can fail
  // there). Then, forcing a Modal remount via a changing `key` to work around
  // that broke *both* platforms — rapidly tearing down and re-presenting a native
  // Modal in the same instant is its own source of glitches, since presentation/
  // dismissal takes real time natively and isn't synchronized with React's
  // reconciliation. Never opening the Modal until data is ready sidesteps the
  // whole category of problem — it's exactly the pattern the `isSelf` path
  // already uses (resolves synchronously, Modal opens with final content already
  // in place), which has never had any of these issues on either platform.
  const [pendingTap, setPendingTap] = useState<{ dateStr: string; dayNum: number } | null>(null);
  const [imgLoading, setImgLoading] = useState(false);
  const [activeTaskIndex, setActiveTaskIndex] = useState(0);
  const detailRequestRef = useRef(0);
  const viewerUri = open?.memory?.imageUrl || open?.memory?.imageUri;
  const taskGallery = open?.memory?.tasks ?? [];
  const activeTask = taskGallery.length > 0 ? (taskGallery[activeTaskIndex] ?? taskGallery[0] ?? null) : null;

  useEffect(() => {
    setActiveTaskIndex(0);
  }, [open?.dateStr]);

  const handleClose = useCallback(() => {
    detailRequestRef.current += 1;
    setOpen(null);
    setImgLoading(false);
  }, []);

  const handle = peerUsername ? `@${peerUsername}` : "Member";

  const openRemoteMemory = useCallback(
    async (dateStr: string, dayNum: number, fallbackMemory?: StreakMemory, expectedMemory?: "photo" | "text") => {
      if (isSelf) {
        // Own row: read local state directly instead of the remote detail RPC, so
        // this always matches the mission detail screen exactly, including
        // anything logged but not yet synced.
        if (fallbackMemory) {
          const hasImg =
            Boolean(fallbackMemory.imageUrl || fallbackMemory.imageUri) &&
            !(fallbackMemory.tasks && fallbackMemory.tasks.length > 0);
          setImgLoading(hasImg);
          setOpen({ dateStr, dayNum, memory: fallbackMemory });
        } else {
          setOpen({ dateStr, dayNum, isCheckInOnly: true });
        }
        return;
      }

      const challengeId = challengeIdOverride || habit.challengeGroupId;
      const actorUserId = habit.ownerUserId;
      if (!challengeId || !actorUserId) {
        if (fallbackMemory) {
          const hasImg = Boolean(fallbackMemory.imageUrl || fallbackMemory.imageUri);
          setImgLoading(hasImg);
          setOpen({ dateStr, dayNum, memory: fallbackMemory });
        } else {
          setOpen({ dateStr, dayNum, isCheckInOnly: true });
        }
        return;
      }

      const requestId = detailRequestRef.current + 1;
      detailRequestRef.current = requestId;
      setImgLoading(false);
      setPendingTap({ dateStr, dayNum });
      const result = await fetchChallengeMemoryDetail({
        challengeId,
        actorUserId,
        dateStr,
        habitId: habit.id,
      });
      if (detailRequestRef.current !== requestId) return;
      setPendingTap(null);

      if (result.ok === false) {
        setOpen({ dateStr, dayNum, memory: fallbackMemory, error: result.error });
        return;
      }

      const detail = result.detail;
      if (detail.status === "private") {
        setOpen({ dateStr, dayNum, isPrivate: true });
        return;
      }
      if (detail.status === "not_found" || (detail.status === "check_in_only" && expectedMemory)) {
        setOpen({
          dateStr,
          dayNum,
          memory: fallbackMemory,
          error: "This memory could not be loaded. Please try again.",
        });
        return;
      }
      if (detail.status === "check_in_only") {
        setOpen({ dateStr, dayNum, isCheckInOnly: true });
        return;
      }

      const memory: StreakMemory = {
        createdAt: detail.createdAt ?? new Date().toISOString(),
      };
      if (detail.note) memory.note = detail.note;
      if (detail.imageUrl) memory.imageUrl = detail.imageUrl;
      if (detail.tasks.length > 0) {
        memory.tasks = detail.tasks.map((t) => ({
          taskId: t.taskId,
          label: t.label,
          note: t.note ?? undefined,
          proofUrls: t.imageUrl ? [t.imageUrl] : [],
          loggedAt: t.loggedAt ?? memory.createdAt,
        }));
      }
      const hasImg = Boolean(memory.imageUrl) || memory.tasks !== undefined;
      setImgLoading(hasImg && memory.tasks === undefined);
      setOpen({ dateStr, dayNum, memory, photoSyncState: detail.photoSyncState });
    },
    [challengeIdOverride, habit.challengeGroupId, habit.id, habit.ownerUserId, isSelf],
  );

  const renderDot = useCallback(
    ({ item }: { item: (typeof days)[number] }) => {
      const { dayNum, dateStr, completed, memory } = item;
      const isCurrentSlot = activeSlot === dayNum;
      // Visibility gates squad-facing memory content uniformly — being your own
      // row doesn't bypass it. A "solo" mission's daily content stays hidden even
      // from the owner in this squad-cohort view, matching how the classic
      // single-memory flow already behaves; only `openRemoteMemory` below (reached
      // only once this gate has already passed) treats isSelf specially, by
      // reading local state instead of the remote RPC.
      const isPublic = (habit.visibility ?? "solo") === "public";
      const marker = habit.streakMemoryMarkers?.[dateStr];
      const memoryTasks = memory?.tasks ?? [];
      const hasPhoto =
        completed &&
        isPublic &&
        Boolean(marker?.hasPhoto || memory?.imageUrl || memory?.imageUri || memoryTasks.some((t) => t.proofUrls[0]));
      const hasNoteOnly =
        completed &&
        isPublic &&
        !hasPhoto &&
        Boolean(marker?.hasNote || memory?.note?.trim() || memoryTasks.some((t) => t.note?.trim()));
      const hasMemory = hasPhoto || hasNoteOnly;
      const isCheckInOnly = completed && isPublic && !hasMemory;
      const tappable = completed;

      // Completed days share the same indigo circle; memory days add camera/text badges.
      let dotBg = theme.colors.surfaceElevated;
      let dotBorder = isCurrentSlot ? theme.colors.amber[500] : theme.colors.border;
      let dotText = theme.colors.textMuted;
      let extraStyle = {};

      if (completed) {
        dotBg = isDark ? "#23274e" : "#eef2ff";
        dotBorder = isCurrentSlot
          ? isDark ? "rgba(245, 158, 11, 0.72)" : "rgba(217, 119, 6, 0.58)"
          : isDark ? "rgba(99, 102, 241, 0.62)" : "rgba(79, 70, 229, 0.42)";
        dotText = isDark ? theme.colors.white : theme.colors.indigo[600];
        extraStyle = {
          shadowColor: theme.colors.indigo[500],
          shadowOffset: { width: 0, height: 1.2 },
          shadowOpacity: 0.22,
          shadowRadius: 2.2,
          elevation: 2,
        };
      }

      const isPending = pendingTap?.dateStr === dateStr;

      return (
        <Pressable
          onPress={() => {
            if (!completed || isPending) return;
            if (!isPublic) {
              setOpen({ dateStr, dayNum, isPrivate: true });
            } else if (hasMemory) {
              void openRemoteMemory(dateStr, dayNum, memory, hasPhoto ? "photo" : "text");
            } else if (isCheckInOnly) {
              setOpen({ dateStr, dayNum, isCheckInOnly: true });
            }
          }}
          disabled={!tappable}
          style={[
            styles.dot,
            {
              borderColor: dotBorder,
              backgroundColor: dotBg,
              opacity: tappable ? 1 : completed ? 0.95 : 0.45,
              ...extraStyle,
            },
          ]}
        >
          {isPending ? (
            <ActivityIndicator size="small" color={dotText} />
          ) : (
            <Text
              style={[
                styles.dotNum,
                { color: dotText },
              ]}
            >
              {dayNum}
            </Text>
          )}

          {isPublic && hasPhoto ? (
            <View style={[styles.floatingBadge, { backgroundColor: theme.colors.amber[500], borderColor: theme.colors.surfaceElevated }]}>
              <Camera size={7.5} color="#111827" strokeWidth={2.5} />
            </View>
          ) : isPublic && hasNoteOnly ? (
            <View style={[styles.floatingBadge, { backgroundColor: theme.colors.indigo[500], borderColor: theme.colors.surfaceElevated }]}>
              <MessageSquare size={7.5} color="#ffffff" strokeWidth={2.5} />
            </View>
          ) : null}
        </Pressable>
      );
    },
    [activeSlot, habit.streakMemoryMarkers, habit.visibility, isDark, openRemoteMemory, pendingTap, theme],
  );

  const dots = (
    <>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        directionalLockEnabled
        canCancelContentTouches
        style={styles.dotsList}
        contentContainerStyle={styles.dotsRow}
        scrollEventThrottle={16}
      >
        {days.map((item, index) => (
          <View key={item.dateStr} style={index === 0 ? null : styles.dotWithSeparator}>
            {renderDot({ item })}
          </View>
        ))}
      </ScrollView>

      <Modal visible={open !== null} transparent animationType="fade" onRequestClose={handleClose}>
        <View style={[styles.viewerBackdrop, { backgroundColor: "rgba(0,0,0,0.85)" }]}>
          <View
            style={[
              styles.viewerInner,
              {
                backgroundColor: theme.colors.surface,
                borderColor: isDark ? "rgba(129, 140, 248, 0.32)" : theme.colors.border,
              },
            ]}
          >
            {open?.error ? (
              <View style={[styles.privateContainer, { backgroundColor: theme.colors.surfaceElevated, borderColor: theme.colors.border }]}>
                <Text style={[styles.privateTitle, { color: theme.colors.textPrimary }]}>
                  Memory unavailable
                </Text>
                <Text style={[styles.privateBody, { color: theme.colors.textSecondary }]}>
                  {open.error}
                </Text>
                <TouchableOpacity
                  activeOpacity={0.86}
                  onPress={handleClose}
                  style={[styles.privateCloseBtn, { backgroundColor: theme.colors.indigo[600] }]}
                >
                  <Text style={styles.privateCloseText}>Got it</Text>
                </TouchableOpacity>
              </View>
            ) : open?.isPrivate ? (
              <View style={[styles.privateContainer, { backgroundColor: theme.colors.surfaceElevated, borderColor: theme.colors.border }]}>
                <View style={[styles.privateIconOrb, { backgroundColor: isDark ? "rgba(99, 102, 241, 0.16)" : "rgba(99, 102, 241, 0.08)", borderColor: theme.colors.indigo[500] }]}>
                  <Lock size={28} color={theme.colors.indigo[500]} />
                </View>
                <Text style={[styles.privateTitle, { color: theme.colors.textPrimary }]}>
                  Private Streak
                </Text>
                <Text style={[styles.privateBody, { color: theme.colors.textSecondary }]}>
                  {handle} has made their streaks private. Ask them to make it public in order to view them.
                </Text>
                <TouchableOpacity
                  activeOpacity={0.86}
                  onPress={handleClose}
                  style={[styles.privateCloseBtn, { backgroundColor: theme.colors.indigo[600] }]}
                >
                  <Text style={styles.privateCloseText}>Got it</Text>
                </TouchableOpacity>
              </View>
            ) : open?.isCheckInOnly ? (
              <View style={[styles.privateContainer, { backgroundColor: theme.colors.surfaceElevated, borderColor: theme.colors.border }]}>
                <View style={[styles.privateIconOrb, { backgroundColor: isDark ? "rgba(99, 102, 241, 0.16)" : "rgba(99, 102, 241, 0.08)", borderColor: theme.colors.indigo[500] }]}>
                  <Check size={28} color={theme.colors.indigo[500]} strokeWidth={2.5} />
                </View>
                <Text style={[styles.privateTitle, { color: theme.colors.textPrimary }]}>
                  Check-in only
                </Text>
                <Text style={[styles.privateBody, { color: theme.colors.textSecondary }]}>
                  This day is simply marked as complete. No photo or note was shared.
                </Text>
                <TouchableOpacity
                  activeOpacity={0.86}
                  onPress={handleClose}
                  style={[styles.privateCloseBtn, { backgroundColor: theme.colors.indigo[600] }]}
                >
                  <Text style={styles.privateCloseText}>Got it</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                {taskGallery.length > 0 ? (
                  <View style={styles.imgContainer}>
                    <DotViewerCarousel
                      slides={taskGallery}
                      activeIndex={activeTaskIndex}
                      onIndexChange={setActiveTaskIndex}
                    />
                  </View>
                ) : viewerUri && (!effectiveRemotePeer || uriLoadsForRemoteViewer(viewerUri)) ? (
                  <View style={styles.imgContainer}>
                    <Image
                      source={{ uri: viewerUri }}
                      style={styles.viewerImg}
                      resizeMode="contain"
                      onLoadStart={() => setImgLoading(true)}
                      onLoadEnd={() => setImgLoading(false)}
                    />
                    {imgLoading && (
                      <View style={[StyleSheet.absoluteFillObject, styles.imgSkeleton, { backgroundColor: isDark ? "#111827" : "#eef2ff" }]}>
                        <ActivityIndicator size="small" color={theme.colors.indigo[500]} />
                        <Text style={[styles.skeletonText, { color: theme.colors.textSecondary }]}>Loading moment…</Text>
                      </View>
                    )}
                  </View>
                ) : null}
                <View style={styles.viewerMeta}>
                  <View style={styles.viewerMetaTop}>
                    <Text style={[styles.viewerDate, { color: theme.colors.cyan[400] }]}>
                      {formatDateDisplay(open?.dateStr, open?.dateStr ?? "")}
                    </Text>
                    {open && open.dayNum > 0 ? (
                      <Text style={[styles.viewerDay, { color: theme.colors.indigo[400] }]}>Day {open.dayNum}</Text>
                    ) : null}
                  </View>
                  {activeTask ? (
                    <View style={styles.viewerTaskRow}>
                      <ListChecks size={13} color={theme.colors.indigo[400]} strokeWidth={2.4} />
                      <Text style={[styles.viewerTaskLabel, { color: theme.colors.textPrimary }]} numberOfLines={1}>
                        {activeTask.label}
                      </Text>
                    </View>
                  ) : null}
                  {(activeTask?.note ?? open?.memory?.note) ? (
                    <Text style={[styles.viewerNote, { color: theme.colors.textPrimary }]}>
                      {activeTask?.note ?? open?.memory?.note}
                    </Text>
                  ) : (open?.photoSyncState === "local_only" || (open?.memory?.imageUri && effectiveRemotePeer && !open.memory.imageUrl && !uriLoadsForRemoteViewer(open.memory.imageUri))) ? (
                    <Text style={[styles.viewerNote, { color: theme.colors.textMuted, fontStyle: "italic" }]}>
                      Photo not synced to cloud yet.
                    </Text>
                  ) : null}
                </View>
                <Pressable
                  onPress={handleClose}
                  style={[styles.viewerClose, { backgroundColor: theme.colors.surface }]}
                >
                  <X size={22} color={theme.colors.textPrimary} />
                </Pressable>
              </>
            )}
          </View>
        </View>
      </Modal>
    </>
  );

  if (!showIdentityRow) {
    return <View style={styles.wrapEmbedded}>{dots}</View>;
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.headRow}>
        <Text style={[styles.handle, { color: theme.colors.cyan[400] }]} numberOfLines={1}>
          {handle}
        </Text>
        <Text style={[styles.meta, { color: theme.colors.textMuted }]}>
          Streak {habit.streak} · {habit.completedDates.length}/{total}
          {(habit.visibility ?? "solo") === "public" ? (
            <Text style={{ color: theme.colors.cyan[500] }}> · Public</Text>
          ) : null}
        </Text>
      </View>

      {dots}
    </View>
  );
});

CohortPeerStreakDots.displayName = "CohortPeerStreakDots";
const styles = StyleSheet.create({
  wrap: { marginBottom: 16 },
  wrapEmbedded: { marginTop: 4 },
  legendRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 10,
    justifyContent: "flex-end",
    flexShrink: 1,
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendSwatch: {
    width: 10,
    height: 10,
    borderRadius: 9999,
    borderWidth: 1,
  },
  legendLabel: { fontSize: 10, fontWeight: "700", letterSpacing: 0.2 },
  headRow: { marginBottom: 10 },
  handle: { fontWeight: "800", fontSize: 15 },
  meta: { fontSize: 13, marginTop: 4 },
  dotsList: { height: DOT_SIZE + 8 },
  dotsRow: { paddingVertical: 4, paddingRight: 12 },
  dotWithSeparator: { marginLeft: DOT_GAP },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: 9999,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  dotNum: { fontSize: 12, fontWeight: "800" },
  floatingBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1.2,
    alignItems: "center",
    justifyContent: "center",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.18,
    shadowRadius: 1,
  },
  viewerBackdrop: { flex: 1, justifyContent: "center", padding: 20 },
  viewerInner: { borderRadius: 24, borderWidth: 1, overflow: "hidden", padding: 10 },
  imgContainer: {
    width: "100%",
    height: 320,
    borderRadius: 18,
    backgroundColor: "#000",
    position: "relative",
    overflow: "hidden",
  },
  viewerImg: { width: "100%", height: "100%" },
  imgSkeleton: {
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  skeletonText: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.5,
    marginTop: 4,
  },
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
  viewerTaskRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  viewerTaskLabel: {
    fontSize: 13,
    fontWeight: "800",
    flexShrink: 1,
  },
  carouselDotsRow: {
    position: "absolute",
    bottom: 12,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 5,
  },
  carouselDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  textSlide: {
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 10,
  },
  textSlideNote: {
    fontSize: 17,
    lineHeight: 25,
    fontWeight: "700",
    textAlign: "center",
    color: "#fff",
  },
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
  privateContainer: {
    padding: 24,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    width: "100%",
  },
  privateIconOrb: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  privateTitle: {
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 8,
    textAlign: "center",
  },
  privateBody: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 20,
    paddingHorizontal: 8,
  },
  privateCloseBtn: {
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
  },
  privateCloseText: {
    color: "#ffffff",
    fontWeight: "800",
    fontSize: 14,
  },
});
