import { Text } from "./AppText";
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Check, ChevronRight, MessageCircle, NotebookPen, Plus, Share2, X } from "lucide-react-native";
import { useTheme } from "../context/ThemeContext";
import { withAlpha } from "../styles/theme";
import type { StreakMemoryTaskEntry, TaskChecklistItem } from "../types/habit";

type Props = {
  visible: boolean;
  day: number;
  missionTitle: string;
  tasks: TaskChecklistItem[];
  loggedTasks: StreakMemoryTaskEntry[];
  /** Date already in habit.completedDates — tasks are locked view-only and Mark Day Complete is hidden. */
  dayCompleted: boolean;
  /** Already shared to Community at least once for this day (see habit.streakMemories[date].communityPosted). */
  alreadyShared: boolean;
  /** Permanently removed from Community for this day (see .communityFeedRevoked) — share/update is disabled. */
  revoked: boolean;
  sharing: boolean;
  onSelectTask: (task: TaskChecklistItem) => void;
  /** Toggle whether a logged task's photo is included the next time this day is shared/updated. */
  onToggleTaskInclusion: (taskId: string) => void;
  /** Explicit "Mark Day Complete" — advances the streak/XP and fires the squad notification. */
  onMarkComplete: () => void;
  onShare: () => void;
  onUnshare: () => void;
  /** Present only when alreadyShared && !revoked — opens the comments sheet for this day's win. */
  onOpenComments?: () => void;
  onClose: () => void;
};

/**
 * Phase 2/3 of docs/CATALOG_ARCHITECTURE.md — the day-level entry point for a
 * checklist mission. Lists today's tasks; tapping one opens the existing
 * StreakMemorySheet (reused as-is) scoped to that single task. The eye toggle on
 * each shareable task controls whether it's included the next time "Share/Update
 * catalog" is tapped — the same flag and the same button handle both picking
 * what to share the first time and editing what's already shared.
 *
 * Revised: logging tasks no longer completes the day by itself (they stay
 * editable — tapping a logged task reopens it pre-filled). "Mark Day Complete"
 * is the one explicit action that advances the streak/XP and fires the squad
 * notification; it works with zero, some, or all tasks logged. Once the day is
 * completed, tasks lock to view-only and this button is replaced by a
 * "Day complete" pill. Share catalog stays fully independent of this — it can
 * be used before or after the day is marked complete.
 */
export function ChecklistDaySheet({
  visible,
  day,
  missionTitle,
  tasks,
  loggedTasks,
  dayCompleted,
  alreadyShared,
  revoked,
  sharing,
  onSelectTask,
  onToggleTaskInclusion,
  onMarkComplete,
  onShare,
  onUnshare,
  onOpenComments,
  onClose,
}: Props) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const loggedByTaskId = new Map(loggedTasks.map((t) => [t.taskId, t]));
  const loggedCount = tasks.filter((t) => loggedByTaskId.has(t.id)).length;
  const shareableTasks = loggedTasks.filter((t) => /^https?:\/\//.test(t.proofUrls[0] ?? ""));
  const includedCount = shareableTasks.filter((t) => t.includedInShare !== false).length;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
      accessibilityViewIsModal
    >
      <View style={styles.root}>
        <Pressable
          style={styles.backdrop}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
        />
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
              borderRadius: theme.radius.lg,
              ...theme.shadow.card,
              marginBottom: Math.max(insets.bottom, 16),
            },
          ]}
        >
          <View style={styles.header}>
            <View style={styles.headerText}>
              <View style={styles.titleRow}>
                <Text style={[styles.title, { color: theme.colors.textPrimary }]} numberOfLines={1}>
                  Day {day}
                </Text>
                {dayCompleted ? (
                  <View
                    style={[
                      styles.completedBadge,
                      { borderColor: theme.colors.green[500], backgroundColor: `${theme.colors.green[500]}14` },
                    ]}
                  >
                    <Check size={10} color={theme.colors.green[500]} strokeWidth={3} />
                    <Text style={[styles.completedBadgeText, { color: theme.colors.green[500] }]} numberOfLines={1}>
                      Day complete
                    </Text>
                  </View>
                ) : null}
              </View>
              <Text style={[styles.sub, { color: theme.colors.textMuted }]} numberOfLines={1}>
                {missionTitle} · {loggedCount}/{tasks.length} logged
              </Text>
              <View style={styles.progressRow}>
                {tasks.map((task, i) => (
                  <View
                    key={task.id}
                    style={[
                      styles.progressSeg,
                      { backgroundColor: i < loggedCount ? theme.colors.green[500] : theme.colors.surfaceElevated },
                    ]}
                  />
                ))}
              </View>
            </View>
            <Pressable
              onPress={onClose}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Close"
              style={[styles.closeBtn, { backgroundColor: theme.colors.surfaceElevated, borderColor: theme.colors.border }]}
            >
              <X size={16} color={theme.colors.textSecondary} />
            </Pressable>
          </View>

          <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
            {tasks.map((task) => {
              const entry = loggedByTaskId.get(task.id);
              const logged = Boolean(entry);
              const photoUri = entry?.proofUrls[0];
              const shareable = Boolean(entry && /^https?:\/\//.test(photoUri ?? ""));
              const included = entry?.includedInShare !== false;
              return (
                <Pressable
                  key={task.id}
                  onPress={() => onSelectTask(task)}
                  accessibilityRole="button"
                  accessibilityLabel={logged ? `${task.label}, logged` : `${task.label}, not logged yet`}
                  style={({ pressed }) => [
                    styles.taskRow,
                    { borderBottomColor: theme.colors.border, opacity: pressed ? 0.7 : 1 },
                  ]}
                >
                  {/* What you logged is the proof — show it, instead of striking the task out. */}
                  {photoUri ? (
                    <View>
                      <Image source={{ uri: photoUri }} style={[styles.thumb, { backgroundColor: theme.colors.surfaceElevated }]} />
                      <View style={[styles.thumbCheck, { backgroundColor: theme.colors.green[500], borderColor: theme.colors.surface }]}>
                        <Check size={9} color={theme.colors.white} strokeWidth={4} />
                      </View>
                    </View>
                  ) : logged ? (
                    <View>
                      <View style={[styles.thumb, styles.thumbCenter, { backgroundColor: theme.colors.surfaceElevated }]}>
                        <NotebookPen size={16} color={theme.colors.textSecondary} />
                      </View>
                      <View style={[styles.thumbCheck, { backgroundColor: theme.colors.green[500], borderColor: theme.colors.surface }]}>
                        <Check size={9} color={theme.colors.white} strokeWidth={4} />
                      </View>
                    </View>
                  ) : (
                    <View style={[styles.thumb, styles.thumbCenter, styles.thumbEmpty, { borderColor: theme.colors.border }]}>
                      <Plus size={16} color={theme.colors.textMuted} strokeWidth={2.4} />
                    </View>
                  )}
                  <View style={styles.taskText}>
                    <Text
                      style={[styles.taskLabel, { color: logged ? theme.colors.textPrimary : theme.colors.textSecondary }]}
                      numberOfLines={1}
                    >
                      {task.label}
                    </Text>
                    <Text style={[styles.taskMeta, { color: theme.colors.textMuted }]} numberOfLines={1}>
                      {!logged ? (dayCompleted ? "Not logged" : "Tap to log") : photoUri ? "Photo" : "Note"}
                    </Text>
                  </View>
                  {shareable ? (
                    <Pressable
                      onPress={(e) => {
                        e.stopPropagation();
                        onToggleTaskInclusion(task.id);
                      }}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={included ? "Included in Community — tap to exclude" : "Excluded from Community — tap to include"}
                      style={[
                        styles.includePill,
                        {
                          backgroundColor: included ? withAlpha(theme.colors.green[500], 12) : theme.colors.surfaceElevated,
                        },
                      ]}
                    >
                      <Text style={[styles.includePillText, { color: included ? theme.colors.green[500] : theme.colors.textMuted }]}>
                        {included ? "IN POST" : "HIDDEN"}
                      </Text>
                    </Pressable>
                  ) : (
                    <ChevronRight size={16} color={theme.colors.textMuted} />
                  )}
                </Pressable>
              );
            })}
          </ScrollView>

          {!dayCompleted ? (
            <Pressable
              onPress={onMarkComplete}
              style={[
                styles.completeBtn,
                {
                  backgroundColor: theme.colors.green[500],
                },
              ]}
            >
              <Check size={16} color={theme.colors.white} strokeWidth={3} />
              <Text style={[styles.completeBtnText, { color: theme.colors.white }]}>
                Mark Day Complete
              </Text>
            </Pressable>
          ) : null}

          {revoked ? (
            <Text style={[styles.revokedNote, { color: theme.colors.textMuted }]}>
              Removed from Community — this day can’t be shared again.
            </Text>
          ) : includedCount > 0 ? (
            <>
              <Pressable
                onPress={onShare}
                disabled={sharing}
                style={[
                  styles.shareBtn,
                  {
                    borderColor: theme.colors.border,
                    backgroundColor: "transparent",
                    opacity: sharing ? 0.7 : 1,
                  },
                ]}
              >
                {sharing ? (
                  <ActivityIndicator size="small" color={theme.colors.indigo[400]} />
                ) : (
                  <Share2 size={15} color={theme.colors.indigo[400]} />
                )}
                <Text style={[styles.shareBtnText, { color: theme.colors.textPrimary }]}>
                  {sharing
                    ? "Publishing…"
                    : alreadyShared
                      ? `Update on Community (${includedCount})`
                      : `Publish to Community (${includedCount} photo${includedCount === 1 ? "" : "s"})`}
                </Text>
              </Pressable>
              {alreadyShared ? (
                <Pressable onPress={onUnshare} disabled={sharing} style={styles.unshareLink}>
                  <Text style={[styles.unshareLinkText, { color: theme.colors.red[500] }]}>
                    Remove from Community
                  </Text>
                </Pressable>
              ) : null}
            </>
          ) : alreadyShared ? (
            <Pressable
              onPress={onUnshare}
              disabled={sharing}
              style={[
                styles.shareBtn,
                { borderColor: theme.colors.red[500], backgroundColor: `${theme.colors.red[500]}14`, opacity: sharing ? 0.7 : 1 },
              ]}
            >
              {sharing ? <ActivityIndicator size="small" color={theme.colors.red[500]} /> : null}
              <Text style={[styles.shareBtnText, { color: theme.colors.red[500] }]}>
                {sharing ? "Removing…" : "Remove from Community (0 selected)"}
              </Text>
            </Pressable>
          ) : null}

          {alreadyShared && !revoked && onOpenComments ? (
            <Pressable
              style={[styles.commentsRow, { borderColor: theme.colors.border }]}
              onPress={onOpenComments}
              accessibilityRole="button"
              accessibilityLabel="View comments"
            >
              <MessageCircle size={16} color={theme.colors.textMuted} />
              <Text style={[styles.commentsRowText, { color: theme.colors.textMuted }]}>Comments</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end", paddingHorizontal: 20 },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.5)" },
  sheet: {
    padding: 18,
    borderWidth: 1,
    maxHeight: "80%",
    maxWidth: 420,
    width: "100%",
    alignSelf: "center",
  },
  header: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 14 },
  headerText: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { fontSize: 18, fontWeight: "800", letterSpacing: -0.2, flexShrink: 1 },
  completedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderRadius: 9999,
    paddingVertical: 3,
    paddingHorizontal: 8,
    flexShrink: 0,
  },
  completedBadgeText: { fontSize: 11, fontWeight: "800", letterSpacing: 0.2 },
  sub: { fontSize: 12, fontWeight: "600", marginTop: 2 },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  list: { flexGrow: 0 },
  progressRow: { flexDirection: "row", gap: 3, marginTop: 8 },
  progressSeg: { flex: 1, height: 4, borderRadius: 2 },
  taskRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  thumb: { width: 40, height: 40, borderRadius: 10 },
  thumbCenter: { alignItems: "center", justifyContent: "center" },
  thumbEmpty: { borderWidth: 1.5, borderStyle: "dashed" },
  thumbCheck: {
    position: "absolute",
    right: -4,
    bottom: -4,
    width: 17,
    height: 17,
    borderRadius: 9,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  taskText: { flex: 1, minWidth: 0 },
  taskLabel: { fontSize: 14, fontWeight: "700" },
  taskMeta: { fontSize: 11, fontWeight: "600", marginTop: 1 },
  includePill: { borderRadius: 9999, paddingVertical: 5, paddingHorizontal: 9 },
  includePillText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.6 },
  completeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 12,
  },
  completeBtnText: { fontSize: 14, fontWeight: "800" },
  shareBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    marginTop: 6,
  },
  shareBtnText: { fontSize: 13, fontWeight: "700" },
  unshareLink: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
  },
  unshareLinkText: { fontSize: 12, fontWeight: "700" },
  commentsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    marginTop: 8,
  },
  commentsRowText: { fontSize: 13, fontWeight: "700" },
  revokedNote: {
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
    marginTop: 8,
  },
});
