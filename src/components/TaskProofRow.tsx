import { Text } from "./AppText";
import { Image, Pressable, StyleSheet, View } from "react-native";
import { Check, ChevronRight, NotebookPen, Plus, X } from "lucide-react-native";
import { useTheme } from "../context/ThemeContext";
import { withAlpha } from "../styles/theme";

type Props = {
  label: string;
  /** Second line under the label — "Photo", "Note", "Tap to log", a note's text, etc. */
  meta: string;
  /** Logged with a photo (thumbnail), logged without one (note icon), not logged yet, or the "add" row. */
  state: "photo" | "note" | "empty" | "add";
  photoUri?: string;
  /** Present only for a shareable (uploaded-photo) entry — renders the IN POST / HIDDEN pill. */
  inclusion?: { included: boolean; onToggle: () => void };
  /** Free-form entries can be removed; renders a muted ✕ instead of the chevron. */
  onRemove?: () => void;
  onPress: () => void;
  accessibilityLabel?: string;
};

/**
 * One row of a task/moment list in ChecklistDaySheet, MiniChecklistSheet and
 * MiniFreeformSheet. Shows what was logged (the photo, or a note icon) instead
 * of striking the task out, so all three sheets look and read the same.
 */
export function TaskProofRow({ label, meta, state, photoUri, inclusion, onRemove, onPress, accessibilityLabel }: Props) {
  const { theme } = useTheme();
  const logged = state === "photo" || state === "note";
  const checkBadge = (
    <View style={[styles.thumbCheck, { backgroundColor: theme.colors.green[500], borderColor: theme.colors.surface }]}>
      <Check size={9} color={theme.colors.white} strokeWidth={4} />
    </View>
  );

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      style={({ pressed }) => [styles.row, { borderBottomColor: theme.colors.border, opacity: pressed ? 0.7 : 1 }]}
    >
      {state === "photo" && photoUri ? (
        <View>
          <Image source={{ uri: photoUri }} style={[styles.thumb, { backgroundColor: theme.colors.surfaceElevated }]} />
          {checkBadge}
        </View>
      ) : logged ? (
        <View>
          <View style={[styles.thumb, styles.thumbCenter, { backgroundColor: theme.colors.surfaceElevated }]}>
            <NotebookPen size={16} color={theme.colors.textSecondary} />
          </View>
          {checkBadge}
        </View>
      ) : (
        <View style={[styles.thumb, styles.thumbCenter, styles.thumbEmpty, { borderColor: theme.colors.border }]}>
          <Plus
            size={16}
            color={state === "add" ? theme.colors.green[500] : theme.colors.textMuted}
            strokeWidth={2.4}
          />
        </View>
      )}
      <View style={styles.text}>
        <Text
          style={[styles.label, { color: state === "empty" ? theme.colors.textSecondary : theme.colors.textPrimary }]}
          numberOfLines={1}
        >
          {label}
        </Text>
        <Text style={[styles.meta, { color: theme.colors.textMuted }]} numberOfLines={1}>
          {meta}
        </Text>
      </View>
      {inclusion ? (
        <Pressable
          onPress={(e) => {
            e.stopPropagation();
            inclusion.onToggle();
          }}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={inclusion.included ? "Included in Community — tap to exclude" : "Excluded from Community — tap to include"}
          style={[
            styles.includePill,
            {
              backgroundColor: inclusion.included
                ? withAlpha(theme.colors.green[500], 12)
                : theme.colors.surfaceElevated,
            },
          ]}
        >
          <Text style={[styles.includePillText, { color: inclusion.included ? theme.colors.green[500] : theme.colors.textMuted }]}>
            {inclusion.included ? "IN POST" : "HIDDEN"}
          </Text>
        </Pressable>
      ) : null}
      {onRemove ? (
        <Pressable
          onPress={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${label}`}
          style={styles.removeBtn}
        >
          <X size={15} color={theme.colors.textMuted} />
        </Pressable>
      ) : !inclusion && state !== "add" ? (
        <ChevronRight size={16} color={theme.colors.textMuted} />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
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
  text: { flex: 1, minWidth: 0 },
  label: { fontSize: 14, fontWeight: "700" },
  meta: { fontSize: 11, fontWeight: "600", marginTop: 1 },
  includePill: { borderRadius: 9999, paddingVertical: 5, paddingHorizontal: 9 },
  includePillText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.6 },
  removeBtn: { width: 24, height: 24, alignItems: "center", justifyContent: "center" },
});
