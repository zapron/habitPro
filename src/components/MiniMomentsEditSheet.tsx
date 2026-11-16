import { Text } from "./AppText";
import { useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X } from "lucide-react-native";
import { useTheme } from "../context/ThemeContext";
import { TaskProofRow } from "./TaskProofRow";
import type { StreakMemoryTaskEntry } from "../types/habit";
import { coverFirst, toggleCover } from "../utils/momentCover";

type Props = {
  visible: boolean;
  missionTitle: string;
  /** The finished mission's moments (completionMemory.tasks). */
  entries: StreakMemoryTaskEntry[];
  /** Where the changes show up, for the hint line. */
  postedToCommunity: boolean;
  inSquad: boolean;
  saving: boolean;
  onSave: (entries: StreakMemoryTaskEntry[]) => void;
  onClose: () => void;
};

const isUploaded = (e: StreakMemoryTaskEntry) => /^https?:\/\//.test(e.proofUrls[0] ?? "");

/**
 * Edit a finished mini mission's moments: hide photos from the post and star
 * the cover. Works on a local copy; nothing changes until Save.
 */
export function MiniMomentsEditSheet({
  visible,
  missionTitle,
  entries,
  postedToCommunity,
  inSquad,
  saving,
  onSave,
  onClose,
}: Props) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState<StreakMemoryTaskEntry[]>(entries);

  useEffect(() => {
    if (visible) setDraft(entries);
    // Reset only when the sheet opens, not on every parent render.
  }, [visible]);

  const ordered = coverFirst(draft);
  const photoCount = draft.filter(isUploaded).length;
  const shownCount = draft.filter((e) => isUploaded(e) && e.includedInShare !== false).length;
  const where = [postedToCommunity ? "your Community post" : null, inSquad ? "your squad board" : null]
    .filter(Boolean)
    .join(" and ");
  const hint = where
    ? `Saving updates ${where}.`
    : "Hidden photos stay out of the post if you publish later.";

  const toggleInclusion = (taskId: string) =>
    setDraft((prev) =>
      prev.map((e) => (e.taskId === taskId ? { ...e, includedInShare: e.includedInShare === false } : e)),
    );

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
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel="Dismiss" />
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
                Edit moments
              </Text>
              <Text style={[styles.sub, { color: theme.colors.textMuted }]} numberOfLines={1}>
                {missionTitle} · {shownCount} of {photoCount} {photoCount === 1 ? "photo" : "photos"} shown
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
            {ordered.map((entry) => {
              const photoUri = entry.proofUrls[0];
              const uploaded = isUploaded(entry);
              return (
                <TaskProofRow
                  key={entry.taskId}
                  label={entry.label}
                  state={photoUri ? "photo" : "note"}
                  photoUri={photoUri}
                  meta={entry.isCover ? "Cover" : entry.note || (photoUri ? "Photo" : "Note")}
                  inclusion={uploaded ? { included: entry.includedInShare !== false, onToggle: () => toggleInclusion(entry.taskId) } : undefined}
                  cover={
                    uploaded && photoCount > 1
                      ? { isCover: entry.isCover === true, onToggle: () => setDraft((prev) => toggleCover(prev, entry.taskId)) }
                      : undefined
                  }
                  onPress={() => {
                    if (uploaded) toggleInclusion(entry.taskId);
                  }}
                />
              );
            })}
          </ScrollView>

          <Text style={[styles.hint, { color: theme.colors.textMuted }]}>
            ★ puts a photo first · HIDDEN keeps it off the post. {hint}
          </Text>

          <Pressable
            onPress={() => onSave(coverFirst(draft))}
            disabled={saving}
            accessibilityRole="button"
            style={[styles.saveBtn, { backgroundColor: theme.colors.green[500], opacity: saving ? 0.7 : 1 }]}
          >
            {saving ? <ActivityIndicator size="small" color={theme.colors.white} /> : null}
            <Text style={[styles.saveBtnText, { color: theme.colors.white }]}>{saving ? "Saving…" : "Save"}</Text>
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
  hint: { fontSize: 11, lineHeight: 15, fontWeight: "600", marginTop: 10 },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 12,
  },
  saveBtnText: { fontSize: 14, fontWeight: "800" },
});
