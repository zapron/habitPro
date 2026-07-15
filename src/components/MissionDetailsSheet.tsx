import { Text } from "./AppText";
import {
  Modal,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Clock3, Gamepad2, Plane, X } from "lucide-react-native";
import { MAX_RESERVE_FUEL_MINUTES } from "../constants/miniMission";
import type { Habit, MiniMission } from "../types/habit";
import { useTheme } from "../context/ThemeContext";
import { formatDateDisplay, formatDateTimeDisplay } from "../utils/dateDisplay";
import { getMiniMissionDisplayStatus } from "../utils/miniMissionTime";

export type MissionDetailsSheetProps =
  | {
      visible: boolean;
      onClose: () => void;
      variant: "habit";
      habit: Habit;
    }
  | {
      visible: boolean;
      onClose: () => void;
      variant: "group";
      title: string;
      description?: string | null;
      mode: "manual" | "autopilot";
      totalDays: number;
      startDate: string;
      endDate?: string | null;
    }
  | {
      visible: boolean;
      onClose: () => void;
      variant: "mini";
      mission: MiniMission;
    };

function formatShortDate(iso: string): string {
  return formatDateDisplay(iso, iso);
}

function formatShortDateTime(iso?: string | null): string {
  if (!iso) return "Not set";
  return formatDateTimeDisplay(iso, iso);
}

function getMiniStatusLabel(mission: MiniMission): string {
  switch (getMiniMissionDisplayStatus(mission, Date.now())) {
    case "done":
      return "Completed";
    case "cancelled":
      return "Cancelled";
    case "queued":
      return mission.status === "scheduled" ? "Scheduled" : "Waiting";
    case "review":
      return "Check In";
    case "failed":
      return "Failed";
    case "active":
    default:
      return "In progress";
  }
}

export function MissionDetailsSheet(props: MissionDetailsSheetProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  if (props.variant === "mini") {
    const { mission } = props;
    const showReserveFuel = mission.completionMode !== "timer_check_in";
    const reserveMinutes = mission.extendedMinutes ?? 0;
    const totalMinutes = mission.estimatedMinutes + reserveMinutes;
    const brief =
      typeof mission.objective === "string" && mission.objective.trim().length > 0
        ? mission.objective.trim()
        : "No objective added yet.";
    const visibility = mission.visibility === "public" ? "Community" : "Solo";
    const completionNote =
      typeof mission.completionMemory?.note === "string" &&
      mission.completionMemory.note.trim().length > 0
        ? mission.completionMemory.note.trim()
        : null;

    return (
      <Modal visible={props.visible} animationType="slide" transparent onRequestClose={props.onClose}>
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
              <Text style={[styles.sheetTitle, { color: theme.colors.textPrimary }]}>Mini mission</Text>
              <TouchableOpacity
                onPress={props.onClose}
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
              <Text style={[styles.missionTitle, { color: theme.colors.textPrimary }]}>{mission.title}</Text>

              <View style={[styles.modePill, styles.modePillMini]}>
                <Clock3 size={14} color={theme.colors.indigo[400]} />
                <Text style={[styles.modePillText, { color: theme.colors.indigo[400] }]}>
                  Focus sprint
                </Text>
              </View>

              <Text style={[styles.sectionLabel, { color: theme.colors.textMuted }]}>Objective</Text>
              <Text style={[styles.body, { color: theme.colors.textSecondary }]}>{brief}</Text>

              <Text style={[styles.sectionLabel, { color: theme.colors.textMuted }]}>Status</Text>
              <Text style={[styles.metaLine, { color: theme.colors.textPrimary }]}>{getMiniStatusLabel(mission)}</Text>

              <Text style={[styles.sectionLabel, { color: theme.colors.textMuted }]}>Time box</Text>
              <Text style={[styles.metaLine, { color: theme.colors.textPrimary }]}>
                {mission.estimatedMinutes} min planned
              </Text>
              {showReserveFuel ? (
                <Text style={[styles.metaSubLine, { color: theme.colors.textSecondary }]}>
                  Reserve used: {reserveMinutes}/{MAX_RESERVE_FUEL_MINUTES} min
                </Text>
              ) : null}
              <Text style={[styles.metaSubLine, { color: theme.colors.textSecondary }]}>
                Total: {totalMinutes} min
              </Text>

              <Text style={[styles.sectionLabel, { color: theme.colors.textMuted }]}>Visibility</Text>
              <Text style={[styles.metaLine, { color: theme.colors.textPrimary }]}>{visibility}</Text>

              <Text style={[styles.sectionLabel, { color: theme.colors.textMuted }]}>Created</Text>
              <Text style={[styles.metaLine, { color: theme.colors.textPrimary }]}>{formatShortDateTime(mission.createdAt)}</Text>

              {mission.scheduledStartAt ? (
                <>
                  <Text style={[styles.sectionLabel, { color: theme.colors.textMuted }]}>Scheduled</Text>
                  <Text style={[styles.metaLine, { color: theme.colors.textPrimary }]}>{formatShortDateTime(mission.scheduledStartAt)}</Text>
                </>
              ) : null}

              {mission.startedAt ? (
                <>
                  <Text style={[styles.sectionLabel, { color: theme.colors.textMuted }]}>Started</Text>
                  <Text style={[styles.metaLine, { color: theme.colors.textPrimary }]}>{formatShortDateTime(mission.startedAt)}</Text>
                </>
              ) : null}

              {mission.completedAt ? (
                <>
                  <Text style={[styles.sectionLabel, { color: theme.colors.textMuted }]}>Completed</Text>
                  <Text style={[styles.metaLine, { color: theme.colors.textPrimary }]}>{formatShortDateTime(mission.completedAt)}</Text>
                </>
              ) : null}

              {completionNote ? (
                <>
                  <Text style={[styles.sectionLabel, { color: theme.colors.textMuted }]}>Completion note</Text>
                  <Text style={[styles.body, { color: theme.colors.textSecondary }]}>{completionNote}</Text>
                </>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>
    );
  }

  const payload =
    props.variant === "group"
      ? {
          isManual: props.mode === "manual",
          title: props.title,
          description: props.description,
          totalDays: props.totalDays,
          startDate: props.startDate,
          endDate: props.endDate ?? null,
        }
      : {
          isManual: props.habit.mode === "manual",
          title: props.habit.title,
          description: props.habit.description,
          totalDays: props.habit.totalDays,
          startDate: props.habit.startDate,
          endDate: props.habit.endDate ?? null,
        };

  const { isManual, title, description, totalDays, startDate, endDate } = payload;
  const brief =
    typeof description === "string" && description.trim().length > 0
      ? description.trim()
      : "No brief added yet.";

  return (
    <Modal visible={props.visible} animationType="slide" transparent onRequestClose={props.onClose}>
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
              onPress={props.onClose}
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
            <Text style={[styles.missionTitle, { color: theme.colors.textPrimary }]}>{title}</Text>

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
            <Text style={[styles.body, { color: theme.colors.textSecondary }]}>{brief}</Text>

            <Text style={[styles.sectionLabel, { color: theme.colors.textMuted }]}>Campaign</Text>
            <Text style={[styles.metaLine, { color: theme.colors.textPrimary }]}>
              {totalDays} day{totalDays === 1 ? "" : "s"}
            </Text>

            <Text style={[styles.sectionLabel, { color: theme.colors.textMuted }]}>Started</Text>
            <Text style={[styles.metaLine, { color: theme.colors.textPrimary }]}>{formatShortDate(startDate)}</Text>

            {isManual && endDate ? (
              <>
                <Text style={[styles.sectionLabel, { color: theme.colors.textMuted }]}>Ends</Text>
                <Text style={[styles.metaLine, { color: theme.colors.textPrimary }]}>{formatShortDate(endDate)}</Text>
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
  modePillMini: {
    backgroundColor: "rgba(99, 102, 241, 0.1)",
    borderColor: "rgba(99, 102, 241, 0.28)",
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
  metaSubLine: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
    marginBottom: 2,
  },
});
