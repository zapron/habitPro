import { Text } from "./AppText";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Check, ChevronRight, Eye, EyeOff, Share2, X } from "lucide-react-native";
import { useTheme } from "../context/ThemeContext";
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
              <Text style={[styles.title, { color: theme.colors.textPrimary }]} numberOfLines={1}>
                Day {day}
              </Text>
              <Text style={[styles.sub, { color: theme.colors.textMuted }]} numberOfLines={1}>
                {missionTitle} · {loggedCount}/{tasks.length} logged
              </Text>
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
              const shareable = Boolean(entry && /^https?:\/\//.test(entry.proofUrls[0] ?? ""));
              const included = entry?.includedInShare !== false;
              return (
                <Pressable
                  key={task.id}
                  onPress={() => onSelectTask(task)}
                  style={({ pressed }) => [
                    styles.taskRow,
                    {
                      backgroundColor: theme.colors.surfaceElevated,
                      borderColor: logged ? theme.colors.green[500] : theme.colors.border,
                      opacity: pressed ? 0.85 : 1,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.taskCheck,
                      {
                        backgroundColor: logged ? theme.colors.green[500] : "transparent",
                        borderColor: logged ? theme.colors.green[500] : theme.colors.border,
                      },
                    ]}
                  >
                    {logged ? <Check size={13} color={theme.colors.white} strokeWidth={3} /> : null}
                  </View>
                  <Text
                    style={[
                      styles.taskLabel,
                      { color: theme.colors.textPrimary, textDecorationLine: logged ? "line-through" : "none" },
                    ]}
                    numberOfLines={1}
                  >
                    {task.label}
                  </Text>
                  {shareable ? (
                    <Pressable
                      onPress={(e) => {
                        e.stopPropagation();
                        onToggleTaskInclusion(task.id);
                      }}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={included ? "Included in shared catalog — tap to exclude" : "Excluded from shared catalog — tap to include"}
                      style={styles.includeToggle}
                    >
                      {included ? (
                        <Eye size={16} color={theme.colors.indigo[400]} />
                      ) : (
                        <EyeOff size={16} color={theme.colors.textMuted} />
                      )}
                    </Pressable>
                  ) : null}
                  <ChevronRight size={16} color={theme.colors.textMuted} />
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
                  borderColor: theme.colors.green[500],
                  backgroundColor: `${theme.colors.green[500]}14`,
                },
              ]}
            >
              <Check size={15} color={theme.colors.green[500]} strokeWidth={3} />
              <Text style={[styles.completeBtnText, { color: theme.colors.green[500] }]}>
                Mark Day Complete
              </Text>
            </Pressable>
          ) : (
            <View
              style={[
                styles.completedPill,
                { borderColor: theme.colors.green[500], backgroundColor: `${theme.colors.green[500]}14` },
              ]}
            >
              <Check size={13} color={theme.colors.green[500]} strokeWidth={3} />
              <Text style={[styles.completedPillText, { color: theme.colors.green[500] }]}>Day complete</Text>
            </View>
          )}

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
                    borderColor: theme.colors.indigo[500],
                    backgroundColor: `${theme.colors.indigo[500]}14`,
                    opacity: sharing ? 0.7 : 1,
                  },
                ]}
              >
                {sharing ? (
                  <ActivityIndicator size="small" color={theme.colors.indigo[400]} />
                ) : (
                  <Share2 size={15} color={theme.colors.indigo[400]} />
                )}
                <Text style={[styles.shareBtnText, { color: theme.colors.indigo[400] }]}>
                  {sharing
                    ? "Sharing…"
                    : alreadyShared
                      ? `Update shared catalog (${includedCount})`
                      : `Share catalog (${includedCount} photo${includedCount === 1 ? "" : "s"})`}
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
  title: { fontSize: 18, fontWeight: "800", letterSpacing: -0.2 },
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
  taskRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  taskCheck: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  taskLabel: { flex: 1, minWidth: 0, fontSize: 14, fontWeight: "700" },
  includeToggle: {
    width: 26,
    height: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  completeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 13,
    marginTop: 4,
  },
  completeBtnText: { fontSize: 14, fontWeight: "800" },
  completedPill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 9999,
    paddingVertical: 8,
    paddingHorizontal: 14,
    marginTop: 4,
  },
  completedPillText: { fontSize: 12, fontWeight: "800", letterSpacing: 0.3 },
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
  revokedNote: {
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
    marginTop: 8,
  },
});
