import { Text } from "./AppText";
import {
  memo,
  useMemo,
  useState,
  useCallback } from "react";
import {
  View,
  Pressable,
  StyleSheet,
  Modal,
  Image,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import { X, Camera, MessageSquare, Lock, Check } from "lucide-react-native";
import { useTheme } from "../context/ThemeContext";
import type { AppTheme } from "../styles/theme";
import type { Habit, StreakMemory } from "../types/habit";
import { calendarDateForHabitMissionDayIndex, getHabitActiveMissionDaySlot } from "../utils/missionDaySlots";

/** Dot timeline key: Completed / Today / Upcoming. Use once beside the cohort participants heading. */
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
  const upcomingLegendBorder = theme.colors.slate[500];

  return (
    <View
      style={styles.legendRow}
      accessibilityLabel="Timeline legend: with memory, check-in only, today, upcoming days"
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
        <Text style={[styles.legendLabel, { color: theme.colors.textMuted }]}>Today</Text>
      </View>
      <View style={styles.legendItem}>
        <View
          style={[
            styles.legendSwatch,
            {
              backgroundColor: theme.colors.surfaceElevated,
              borderColor: upcomingLegendBorder,
              borderWidth: 1.8,
            },
          ]}
        />
        <Text style={[styles.legendLabel, { color: theme.colors.textMuted }]}>Upcoming</Text>
      </View>
    </View>
  );
}

type Props = {
  habit: Habit;
  /** Lowercase @handle when known */
  peerUsername: string | null;
  /** Cohort viewer: only http(s) images load */
  remotePeer?: boolean;
  /** When false, only mission-day dots + memory modal (header lives in parent card). */
  showIdentityRow?: boolean;
  /** Stable render clock from the parent screen; avoids Date.now() churn per row. */
  nowMs?: number;
};

function uriLoadsForRemoteViewer(uri: string | undefined): boolean {
  if (!uri) return false;
  return uri.startsWith("http://") || uri.startsWith("https://");
}

export const CohortPeerStreakDots = memo(function CohortPeerStreakDots({
  habit,
  peerUsername,
  remotePeer = true,
  showIdentityRow = true,
  nowMs: nowMsProp,
}: Props) {
  const { theme, isDark } = useTheme();
  const total = Math.max(1, habit.totalDays ?? 21);
  const nowMs = nowMsProp ?? Date.now();
  const activeSlot = getHabitActiveMissionDaySlot(habit, nowMs);

  const days = useMemo(() => {
    const out: {
      dayNum: number;
      dateStr: string;
      completed: boolean;
      memory: StreakMemory | undefined;
    }[] = [];
    for (let i = 0; i < total; i++) {
      const dateStr = calendarDateForHabitMissionDayIndex(habit, i, nowMs);
      const completed = habit.completedDates.includes(dateStr);
      const memory = habit.streakMemories?.[dateStr];
      out.push({ dayNum: i + 1, dateStr, completed, memory });
    }
    return out;
  }, [habit, nowMs, total]);

  const [open, setOpen] = useState<{
    dateStr: string;
    memory?: StreakMemory;
    isPrivate?: boolean;
    isCheckInOnly?: boolean;
  } | null>(null);
  const [imgLoading, setImgLoading] = useState(false);
  const viewerUri = open?.memory?.imageUrl || open?.memory?.imageUri;

  const handleClose = useCallback(() => {
    setOpen(null);
    setImgLoading(false);
  }, []);

  const handle = peerUsername ? `@${peerUsername}` : "Member";

  const dots = (
    <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dotsRow}>
        {days.map(({ dayNum, dateStr, completed, memory }) => {
          const isCurrentSlot = activeSlot === dayNum;
          const isPublic = (habit.visibility ?? "solo") === "public";
          const hasPhoto = completed && isPublic && Boolean(memory?.imageUrl || memory?.imageUri);
          const hasNoteOnly = completed && isPublic && !hasPhoto && Boolean(memory?.note?.trim());
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

          return (
            <Pressable
              key={dateStr}
              onPress={() => {
                if (!completed) return;
                if (!isPublic) {
                  setOpen({ dateStr, isPrivate: true });
                } else if (memory && hasMemory) {
                  const hasImg = Boolean(memory.imageUrl || memory.imageUri);
                  setImgLoading(hasImg);
                  setOpen({ dateStr, memory });
                } else if (isCheckInOnly) {
                  setOpen({ dateStr, isCheckInOnly: true });
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
              <Text
                style={[
                  styles.dotNum,
                  { color: dotText },
                ]}
              >
                {dayNum}
              </Text>
              
              {/* Option A Micro-badges (Only rendered for public streaks with memory) */}
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
        })}
      </ScrollView>

      <Modal visible={open !== null} transparent animationType="fade" onRequestClose={handleClose}>
        <Pressable style={[styles.viewerBackdrop, { backgroundColor: "rgba(0,0,0,0.85)" }]} onPress={handleClose}>
          <Pressable style={styles.viewerInner} onPress={(e) => e.stopPropagation()}>
            {open?.isPrivate ? (
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
                {viewerUri && (!remotePeer || uriLoadsForRemoteViewer(viewerUri)) ? (
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
                <View style={[styles.viewerMeta, { backgroundColor: theme.colors.surfaceElevated, borderColor: theme.colors.border }]}>
                  <Text style={[styles.viewerDate, { color: theme.colors.cyan[400] }]}>{open?.dateStr}</Text>
                  {open?.memory?.note ? (
                    <Text style={[styles.viewerNote, { color: theme.colors.textPrimary }]}>{open.memory.note}</Text>
                  ) : open?.memory?.imageUri && remotePeer && !open.memory.imageUrl && !uriLoadsForRemoteViewer(open.memory.imageUri) ? (
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
          </Pressable>
        </Pressable>
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
  dotsRow: { flexDirection: "row", gap: 8, paddingVertical: 4, paddingRight: 12 },
  dot: {
    width: 36,
    height: 36,
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
  viewerInner: { borderRadius: 20, overflow: "hidden" },
  imgContainer: {
    width: "100%",
    height: 320,
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
  viewerMeta: { padding: 16, borderTopWidth: 1 },
  viewerDate: { fontSize: 12, fontWeight: "800", letterSpacing: 0.8, marginBottom: 8 },
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
