import { Text } from "./AppText";
import { useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Switch, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Check, ChevronRight, Flag, Globe, X } from "lucide-react-native";
import { useTheme } from "../context/ThemeContext";
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
 * single-photo mini's toggle), not a separate repeatable share action, and there is
 * no per-task include/exclude here (deferred — see the architecture doc's Phase 4
 * note on reassessing that once this phase is stable). Tapping a task opens the
 * existing StreakMemorySheet reused as-is, scoped to that single task, exactly like
 * the habit-side pattern.
 */
export function MiniChecklistSheet({
  visible,
  missionTitle,
  tasks,
  loggedTasks,
  completing,
  canPublishCommunity,
  onSelectTask,
  onComplete,
  onClose,
}: Props) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [publishToCommunity, setPublishToCommunity] = useState(false);
  const loggedByTaskId = new Map(loggedTasks.map((t) => [t.taskId, t]));
  const loggedCount = tasks.filter((t) => loggedByTaskId.has(t.id)).length;
  const hasShareablePhoto = loggedTasks.some((t) => /^https?:\/\//.test(t.proofUrls[0] ?? ""));
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
                  <ChevronRight size={16} color={theme.colors.textMuted} />
                </Pressable>
              );
            })}
          </ScrollView>

          <View
            style={[
              styles.publishRow,
              { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceElevated },
            ]}
          >
            <Globe size={18} color={theme.colors.cyan[400]} />
            <View style={styles.publishTextCol}>
              <Text style={[styles.publishTitle, { color: theme.colors.textPrimary }]}>
                Publish to Community
              </Text>
              <Text style={[styles.publishHint, { color: theme.colors.textMuted }]}>
                {!hasShareablePhoto
                  ? "Log at least one task with a photo to publish."
                  : !canPublishCommunity
                    ? "Sign in with HabitPro Community to publish."
                    : "Shares logged task photos. Leaving this off keeps the mission private."}
              </Text>
            </View>
            <Switch
              value={publishToCommunity && canTogglePublish}
              onValueChange={setPublishToCommunity}
              disabled={completing || !canTogglePublish}
              trackColor={{ false: theme.colors.border, true: theme.colors.indigo[600] }}
              thumbColor={theme.colors.white}
              ios_backgroundColor={theme.colors.border}
            />
          </View>

          <Pressable
            onPress={() => onComplete({ publishToCommunity: publishToCommunity && canTogglePublish })}
            disabled={completing}
            style={[
              styles.completeBtn,
              {
                borderColor: theme.colors.green[500],
                backgroundColor: `${theme.colors.green[500]}14`,
                opacity: completing ? 0.7 : 1,
              },
            ]}
          >
            {completing ? (
              <ActivityIndicator size="small" color={theme.colors.green[500]} />
            ) : (
              <Flag size={15} color={theme.colors.green[500]} />
            )}
            <Text style={[styles.completeBtnText, { color: theme.colors.green[500] }]}>
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
  publishRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: 4,
  },
  publishTextCol: { flex: 1, minWidth: 0 },
  publishTitle: { fontSize: 13, fontWeight: "800" },
  publishHint: { fontSize: 11, lineHeight: 15, fontWeight: "600", marginTop: 2 },
  completeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    marginTop: 6,
  },
  completeBtnText: { fontSize: 13, fontWeight: "700" },
});
