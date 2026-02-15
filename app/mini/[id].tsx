import { useEffect, useMemo, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, StatusBar, Alert } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, Clock3, Play, Check, Trash2, CircleX } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { Screen } from "../../src/components/Screen";
import { Button } from "../../src/components/Button";
import { theme } from "../../src/styles/theme";
import { useHabitStore } from "../../src/store/habitStore";

const formatDuration = (ms: number) => {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
};

export default function MiniMissionDetail() {
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const router = useRouter();
  const missionId = Array.isArray(id) ? id[0] : id;

  const mission = useHabitStore((state) =>
    missionId ? state.getMiniMission(missionId) : undefined,
  );
  const startMiniMission = useHabitStore((state) => state.startMiniMission);
  const completeMiniMission = useHabitStore((state) => state.completeMiniMission);
  const cancelMiniMission = useHabitStore((state) => state.cancelMiniMission);
  const deleteMiniMission = useHabitStore((state) => state.deleteMiniMission);

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const countdown = useMemo(() => {
    if (!mission?.startedAt) return mission ? mission.estimatedMinutes * 60 * 1000 : 0;
    const startMs = new Date(mission.startedAt).getTime();
    const endMs = startMs + mission.estimatedMinutes * 60 * 1000;
    return Math.max(0, endMs - now);
  }, [mission, now]);

  if (!mission) {
    return (
      <Screen>
        <View style={styles.centered}>
          <Text style={styles.notFound}>Mini mission not found</Text>
          <Button title="Go Back" onPress={() => router.back()} />
        </View>
      </Screen>
    );
  }

  const handleStart = () => {
    startMiniMission(mission.id);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const handleComplete = () => {
    completeMiniMission(mission.id);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handleCancel = () => {
    cancelMiniMission(mission.id);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  };

  const handleDelete = () => {
    Alert.alert("Delete Mini Mission", "Delete this mini mission permanently?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          deleteMiniMission(mission.id);
          router.replace("/mini");
        },
      },
    ]);
  };

  return (
    <Screen>
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.background} />
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconButton} onPress={() => router.back()}>
          <ArrowLeft size={20} color={theme.colors.white} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.iconButton} onPress={handleDelete}>
          <Trash2 size={18} color={theme.colors.red[500]} />
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        <Text style={styles.title}>{mission.title}</Text>
        {!!mission.objective && <Text style={styles.objective}>{mission.objective}</Text>}

        <View style={styles.timerCard}>
          <Text style={styles.timerLabel}>Estimated Sprint</Text>
          <Text style={styles.timerValue}>{formatDuration(countdown)}</Text>
          <Text style={styles.timerHint}>
            {mission.status === "completed"
              ? "Completed"
              : mission.status === "in_progress"
                ? countdown === 0
                  ? "Target time reached. Wrap up and mark complete."
                  : "Stay focused and finish this sprint."
                : "Ready when you are."}
          </Text>
        </View>

        <View style={styles.metaRow}>
          <View style={styles.metaPill}>
            <Clock3 size={14} color={theme.colors.cyan[400]} />
            <Text style={styles.metaText}>{mission.estimatedMinutes} minutes planned</Text>
          </View>
        </View>

        <View style={styles.actions}>
          {mission.status !== "in_progress" && mission.status !== "completed" && (
            <Button title="Start Now" onPress={handleStart} />
          )}
          {mission.status === "in_progress" && (
            <>
              <Button title="Mark Complete" onPress={handleComplete} />
              <Button title="Cancel Mission" variant="secondary" onPress={handleCancel} />
            </>
          )}
          {mission.status === "completed" && (
            <View style={styles.completedRow}>
              <Check size={18} color={theme.colors.green[500]} />
              <Text style={styles.completedText}>Mini mission completed</Text>
            </View>
          )}
          {mission.status === "cancelled" && (
            <View style={styles.cancelledRow}>
              <CircleX size={18} color={theme.colors.red[500]} />
              <Text style={styles.cancelledText}>This mini mission is cancelled</Text>
            </View>
          )}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  notFound: {
    color: theme.colors.textPrimary,
    marginBottom: 12,
  },
  content: {
    flex: 1,
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.h1,
    fontWeight: "800",
    marginBottom: 8,
  },
  objective: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.body,
    marginBottom: 20,
    lineHeight: 23,
  },
  timerCard: {
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    alignItems: "center",
    paddingVertical: 24,
    paddingHorizontal: 16,
    ...theme.shadow.card,
  },
  timerLabel: {
    color: theme.colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
    fontWeight: "700",
    fontSize: 11,
  },
  timerValue: {
    color: theme.colors.textPrimary,
    fontSize: 52,
    fontWeight: "800",
    marginTop: 6,
    marginBottom: 6,
  },
  timerHint: {
    color: theme.colors.textSecondary,
    textAlign: "center",
  },
  metaRow: {
    marginTop: 16,
    marginBottom: 20,
  },
  metaPill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceElevated,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  metaText: {
    color: theme.colors.textPrimary,
    fontWeight: "700",
  },
  actions: {
    gap: 10,
  },
  completedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
  },
  completedText: {
    color: theme.colors.green[500],
    fontWeight: "700",
  },
  cancelledRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
  },
  cancelledText: {
    color: theme.colors.red[500],
    fontWeight: "700",
  },
});
