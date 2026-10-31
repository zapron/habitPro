import { Text } from "./AppText";
import { useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Switch, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Flag, X } from "lucide-react-native";
import { useTheme } from "../context/ThemeContext";
import { TaskProofRow } from "./TaskProofRow";
import type { StreakMemoryTaskEntry } from "../types/habit";

type Props = {
  visible: boolean;
  missionTitle: string;
  entries: StreakMemoryTaskEntry[];
  completing: boolean;
  /** Signed in + cloud sync configured + HabitPro Community access. */
  canPublishCommunity: boolean;
  onAddMoment: () => void;
  onSelectEntry: (entry: StreakMemoryTaskEntry) => void;
  onRemoveEntry: (entryId: string) => void;
  /** Toggle whether a logged moment's photo is included when this mission publishes to Community. */
  onToggleEntryInclusion: (entryId: string) => void;
  onComplete: (opts: { publishToCommunity: boolean }) => void;
  onClose: () => void;
};

/**
 * Freeform capture's completion-time entry point — sibling to MiniChecklistSheet,
 * not a variant of it. Where checklist missions review a fixed, predefined list of
 * tasks, freeform missions have no predefined anything: the list here is exactly
 * whatever the user chose to lock during the run, and "Add a moment" (not tapping
 * a pre-listed row) is how a new entry gets created. No count limit by design — see
 * the architecture note this was scoped from.
 */
export function MiniFreeformSheet({
  visible,
  missionTitle,
  entries,
  completing,
  canPublishCommunity,
  onAddMoment,
  onSelectEntry,
  onRemoveEntry,
  onToggleEntryInclusion,
  onComplete,
  onClose,
}: Props) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [publishToCommunity, setPublishToCommunity] = useState(false);
  const shareableEntries = entries.filter((e) => /^https?:\/\//.test(e.proofUrls[0] ?? ""));
  const hasShareablePhoto = shareableEntries.length > 0;
  const includedCount = shareableEntries.filter((e) => e.includedInShare !== false).length;
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
                {missionTitle} · {entries.length} {entries.length === 1 ? "moment" : "moments"} locked
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
            {entries.map((entry) => {
              const photoUri = entry.proofUrls[0];
              const shareable = /^https?:\/\//.test(photoUri ?? "");
              return (
                <TaskProofRow
                  key={entry.taskId}
                  label={entry.label}
                  state={photoUri ? "photo" : "note"}
                  photoUri={photoUri}
                  meta={entry.note || (photoUri ? "Photo" : "Note")}
                  inclusion={
                    shareable
                      ? { included: entry.includedInShare !== false, onToggle: () => onToggleEntryInclusion(entry.taskId) }
                      : undefined
                  }
                  onRemove={() => onRemoveEntry(entry.taskId)}
                  onPress={() => onSelectEntry(entry)}
                />
              );
            })}
            <TaskProofRow
              label="Add a moment"
              state="add"
              meta={entries.length === 0 ? "Nothing locked yet — add whatever's worth keeping" : "Photo or note"}
              onPress={onAddMoment}
            />
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
                  ? "Lock at least one moment with a photo to publish."
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
  list: { flexGrow: 0, marginBottom: 4 },
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
