import { Text } from "./AppText";
import { useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Switch, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Flag, X } from "lucide-react-native";
import { useTheme } from "../context/ThemeContext";
import { TaskProofRow } from "./TaskProofRow";
import type { StreakMemoryTaskEntry, TaskChecklistItem } from "../types/habit";

type Props = {
  visible: boolean;
  missionTitle: string;
  tasks: TaskChecklistItem[];
  loggedTasks: StreakMemoryTaskEntry[];
  completing: boolean;
  /** Signed in + cloud sync configured + HabitPro Community access. */
  canPublishCommunity: boolean;
  onSelectTask: (task: TaskChecklistItem) => void;
  /** Toggle whether a logged task's photo is included when this mission publishes to Community. */
  onToggleTaskInclusion: (taskId: string) => void;
  onComplete: (opts: { publishToCommunity: boolean }) => void;
  onClose: () => void;
};

/**
 * Phases 2 and 4 of docs/MINI_MISSION_CATALOG_ARCHITECTURE.md — the completion-time
 * entry point for a checklist mini mission. Ported from ChecklistDaySheet's pattern
 * (docs/CATALOG_ARCHITECTURE.md) but adapted for a mini mission's single-session
 * shape: no calendar day, no per-task share/unshare step. Unlike a main mission's
 * any-time re-editable daily entry, a mini mission completes once — so publishing to
 * Community is a single toggle bundled with "Complete Mission" (mirrors the classic
 * single-photo mini's toggle), not a separate repeatable share action. Each
 * shareable (photo-bearing) task does still get its own IN POST / HIDDEN pill,
 * matching ChecklistDaySheet — the per-task photo choice just gets bundled into this
 * one publish action instead of being a separately repeatable share/update step.
 * Tapping a task opens the existing StreakMemorySheet reused as-is, scoped to that
 * single task, exactly like the habit-side pattern.
 */
export function MiniChecklistSheet({
  visible,
  missionTitle,
  tasks,
  loggedTasks,
  completing,
  canPublishCommunity,
  onSelectTask,
  onToggleTaskInclusion,
  onComplete,
  onClose,
}: Props) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [publishToCommunity, setPublishToCommunity] = useState(false);
  const loggedByTaskId = new Map(loggedTasks.map((t) => [t.taskId, t]));
  const loggedCount = tasks.filter((t) => loggedByTaskId.has(t.id)).length;
  const shareableTasks = loggedTasks.filter((t) => /^https?:\/\//.test(t.proofUrls[0] ?? ""));
  const hasShareablePhoto = shareableTasks.length > 0;
  const includedCount = shareableTasks.filter((t) => t.includedInShare !== false).length;
  const canTogglePublish = canPublishCommunity && hasShareablePhoto;

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
                Complete Mission
              </Text>
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
              const photoUri = entry?.proofUrls[0];
              const shareable = Boolean(entry && /^https?:\/\//.test(photoUri ?? ""));
              return (
                <TaskProofRow
                  key={task.id}
                  label={task.label}
                  state={!entry ? "empty" : photoUri ? "photo" : "note"}
                  photoUri={photoUri}
                  meta={!entry ? "Tap to log" : photoUri ? "Photo" : "Note"}
                  inclusion={
                    shareable
                      ? { included: entry?.includedInShare !== false, onToggle: () => onToggleTaskInclusion(task.id) }
                      : undefined
                  }
                  onPress={() => onSelectTask(task)}
                  accessibilityLabel={entry ? `${task.label}, logged` : `${task.label}, not logged yet`}
                />
              );
            })}
          </ScrollView>

          <View
            style={[styles.publishRow, { borderTopColor: theme.colors.border }]}
          >
            <View style={styles.publishTextCol}>
              <Text style={[styles.publishTitle, { color: theme.colors.textPrimary }]}>
                Share to Community
              </Text>
              <Text style={[styles.publishHint, { color: theme.colors.textMuted }]}>
                {!hasShareablePhoto
                  ? "Log at least one task with a photo to publish."
                  : !canPublishCommunity
                    ? "Sign in with HabitPro Community to publish."
                    : includedCount === 0
                      ? "No photos marked IN POST yet."
                      : `${includedCount} photo${includedCount === 1 ? "" : "s"} in the post · off keeps it private`}
              </Text>
            </View>
            <Switch
              value={publishToCommunity && canTogglePublish}
              onValueChange={setPublishToCommunity}
              disabled={completing || !canTogglePublish}
              trackColor={{ false: theme.colors.border, true: theme.colors.green[500] }}
              thumbColor={theme.colors.white}
              ios_backgroundColor={theme.colors.border}
            />
          </View>

          <Pressable
            onPress={() => onComplete({ publishToCommunity: publishToCommunity && canTogglePublish })}
            disabled={completing}
            style={[
              styles.completeBtn,
              { backgroundColor: theme.colors.green[500], opacity: completing ? 0.7 : 1 },
            ]}
          >
            {completing ? (
              <ActivityIndicator size="small" color={theme.colors.white} />
            ) : (
              <Flag size={15} color={theme.colors.white} />
            )}
            <Text style={[styles.completeBtnText, { color: theme.colors.white }]}>
              {completing ? "Completing…" : "Complete Mission"}
            </Text>
          </Pressable>
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
  progressRow: { flexDirection: "row", gap: 3, marginTop: 8 },
  progressSeg: { flex: 1, height: 4, borderRadius: 2 },
  publishRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 12,
    marginTop: 10,
  },
  publishTextCol: { flex: 1, minWidth: 0 },
  publishTitle: { fontSize: 13, fontWeight: "800" },
  publishHint: { fontSize: 11, lineHeight: 15, fontWeight: "600", marginTop: 2 },
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
});
