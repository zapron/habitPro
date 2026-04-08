import { useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Modal,
  Image,
  ScrollView,
} from "react-native";
import { X } from "lucide-react-native";
import { useTheme } from "../context/ThemeContext";
import type { Habit, StreakMemory } from "../types/habit";
import { calendarDateForMissionDayIndex, getActiveMissionDaySlot } from "../utils/missionDaySlots";

type Props = {
  habit: Habit;
  /** Lowercase @handle when known */
  peerUsername: string | null;
  /** Cohort viewer: only http(s) images load */
  remotePeer?: boolean;
  /** When false, only mission-day dots + memory modal (header lives in parent card). */
  showIdentityRow?: boolean;
};

function uriLoadsForRemoteViewer(uri: string | undefined): boolean {
  if (!uri) return false;
  return uri.startsWith("http://") || uri.startsWith("https://");
}

export function CohortPeerStreakDots({
  habit,
  peerUsername,
  remotePeer = true,
  showIdentityRow = true,
}: Props) {
  const { theme, isDark } = useTheme();
  const total = Math.max(1, habit.totalDays ?? 21);
  const nowMs = Date.now();
  const activeSlot = getActiveMissionDaySlot(habit.startDate, nowMs, total);

  const days = useMemo(() => {
    const out: {
      dayNum: number;
      dateStr: string;
      completed: boolean;
      memory: StreakMemory | undefined;
    }[] = [];
    for (let i = 0; i < total; i++) {
      const dateStr = calendarDateForMissionDayIndex(habit.startDate, i);
      const completed = habit.completedDates.includes(dateStr);
      const memory = habit.streakMemories?.[dateStr];
      out.push({ dayNum: i + 1, dateStr, completed, memory });
    }
    return out;
  }, [habit.startDate, habit.completedDates, habit.streakMemories, total]);

  const [open, setOpen] = useState<{ dateStr: string; memory: StreakMemory } | null>(null);
  const viewerUri = open?.memory?.imageUrl || open?.memory?.imageUri;

  const handle = peerUsername ? `@${peerUsername}` : "Member";

  const dots = (
    <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dotsRow}>
        {days.map(({ dayNum, dateStr, completed, memory }) => {
          const isCurrentSlot = activeSlot === dayNum;
          const isPublic = (habit.visibility ?? "solo") === "public";
          const hasMemory = isPublic && Boolean(memory?.note || memory?.imageUrl || memory?.imageUri);
          const tappable = completed && hasMemory;
          /** Light mode: soft indigo wash instead of solid 600 (less blunt on white cards). */
          const completedFill = isDark ? theme.colors.indigo[600] : "rgba(99, 102, 241, 0.18)";
          const completedNum = isDark ? theme.colors.textPrimary : theme.colors.indigo[600];
          const completedBorder =
            isCurrentSlot
              ? theme.colors.amber[500]
              : isDark
                ? theme.colors.border
                : "rgba(99, 102, 241, 0.38)";
          return (
            <Pressable
              key={dateStr}
              onPress={() => {
                if (completed && memory && hasMemory) setOpen({ dateStr, memory });
              }}
              disabled={!tappable}
              style={[
                styles.dot,
                {
                  borderColor: completed ? completedBorder : isCurrentSlot ? theme.colors.amber[500] : theme.colors.border,
                  backgroundColor: completed ? completedFill : theme.colors.surfaceElevated,
                  opacity: tappable ? 1 : completed ? 0.95 : 0.45,
                },
              ]}
            >
              <Text
                style={[
                  styles.dotNum,
                  { color: completed ? completedNum : theme.colors.textMuted },
                ]}
              >
                {dayNum}
              </Text>
              {hasMemory && completed ? (
                <View style={[styles.memDot, { backgroundColor: theme.colors.amber[400] }]} />
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>

      <Modal visible={open !== null} transparent animationType="fade" onRequestClose={() => setOpen(null)}>
        <Pressable style={[styles.viewerBackdrop, { backgroundColor: "rgba(0,0,0,0.85)" }]} onPress={() => setOpen(null)}>
          <Pressable style={styles.viewerInner} onPress={(e) => e.stopPropagation()}>
            {viewerUri && (!remotePeer || uriLoadsForRemoteViewer(viewerUri)) ? (
              <Image source={{ uri: viewerUri }} style={styles.viewerImg} resizeMode="contain" />
            ) : null}
            <View style={[styles.viewerMeta, { backgroundColor: theme.colors.surfaceElevated, borderColor: theme.colors.border }]}>
              <Text style={[styles.viewerDate, { color: theme.colors.cyan[400] }]}>{open?.dateStr}</Text>
              {open?.memory.note ? (
                <Text style={[styles.viewerNote, { color: theme.colors.textPrimary }]}>{open.memory.note}</Text>
              ) : open?.memory?.imageUri && remotePeer && !open.memory.imageUrl && !uriLoadsForRemoteViewer(open.memory.imageUri) ? (
                <Text style={[styles.viewerNote, { color: theme.colors.textMuted, fontStyle: "italic" }]}>
                  Photo not synced to cloud yet.
                </Text>
              ) : null}
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
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 16 },
  wrapEmbedded: { marginTop: 4 },
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
  memDot: {
    position: "absolute",
    bottom: 2,
    width: 6,
    height: 6,
    borderRadius: 9999,
  },
  viewerBackdrop: { flex: 1, justifyContent: "center", padding: 20 },
  viewerInner: { borderRadius: 20, overflow: "hidden" },
  viewerImg: { width: "100%", height: 320, backgroundColor: "#000" },
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
});
