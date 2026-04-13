import { Text } from "./AppText";
import {
  Modal,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Gamepad2, Plane, X } from "lucide-react-native";
import type { Habit } from "../types/habit";
import { useTheme } from "../context/ThemeContext";

type Props = {
  visible: boolean;
  onClose: () => void;
  habit: Habit;
};

function formatShortDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return iso;
  }
}

export function MissionDetailsSheet({ visible, onClose, habit }: Props) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const isManual = habit.mode === "manual";

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
              paddingBottom: Math.max(insets.bottom, 20),
              maxHeight: "88%",
            },
          ]}
        >
          <View style={styles.sheetHead}>
            <Text style={[styles.sheetTitle, { color: theme.colors.textPrimary }]}>Mission</Text>
            <TouchableOpacity
              onPress={onClose}
              style={[styles.closeBtn, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceElevated }]}
              hitSlop={12}
              accessibilityLabel="Close"
            >
              <X size={20} color={theme.colors.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.scrollContent}
          >
            <Text style={[styles.missionTitle, { color: theme.colors.textPrimary }]}>{habit.title}</Text>

            <View style={[styles.modePill, isManual ? styles.modePillManual : null]}>
              {isManual ? (
                <Gamepad2 size={14} color={theme.colors.amber[500]} />
              ) : (
                <Plane size={14} color={theme.colors.cyan[400]} />
              )}
              <Text style={[styles.modePillText, { color: isManual ? theme.colors.amber[500] : theme.colors.cyan[400] }]}>
                {isManual ? "Manual control" : "Autopilot"}
              </Text>
            </View>

            <Text style={[styles.sectionLabel, { color: theme.colors.textMuted }]}>Brief</Text>
            <Text style={[styles.body, { color: theme.colors.textSecondary }]}>
              {habit.description?.trim() ? habit.description.trim() : "No brief added yet."}
            </Text>

            <Text style={[styles.sectionLabel, { color: theme.colors.textMuted }]}>Campaign</Text>
            <Text style={[styles.metaLine, { color: theme.colors.textPrimary }]}>
              {habit.totalDays} day{habit.totalDays === 1 ? "" : "s"}
            </Text>

            <Text style={[styles.sectionLabel, { color: theme.colors.textMuted }]}>Started</Text>
            <Text style={[styles.metaLine, { color: theme.colors.textPrimary }]}>{formatShortDate(habit.startDate)}</Text>

            {isManual && habit.endDate ? (
              <>
                <Text style={[styles.sectionLabel, { color: theme.colors.textMuted }]}>Ends</Text>
                <Text style={[styles.metaLine, { color: theme.colors.textPrimary }]}>{formatShortDate(habit.endDate)}</Text>
              </>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  sheetHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  sheetTitle: { fontSize: 18, fontWeight: "800" },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  scrollContent: {
    paddingBottom: 8,
  },
  missionTitle: {
    fontSize: 22,
    fontWeight: "800",
    lineHeight: 28,
    marginBottom: 12,
  },
  modePill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: "rgba(34, 211, 238, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(34, 211, 238, 0.25)",
    marginBottom: 20,
  },
  modePillManual: {
    backgroundColor: "rgba(245, 158, 11, 0.1)",
    borderColor: "rgba(245, 158, 11, 0.28)",
  },
  modePillText: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: 6,
    marginTop: 4,
  },
  body: {
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 8,
  },
  metaLine: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
});
