import { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Alert,
  Vibration,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ArrowLeft,
  Clock3,
  Check,
  Trash2,
  CircleX,
  Trophy,
  TimerReset,
  CheckCircle2,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import * as Notifications from "expo-notifications";
import { Audio } from "expo-av";
import { Screen } from "../../src/components/Screen";
import { Button } from "../../src/components/Button";
import { theme } from "../../src/styles/theme";
import { useHabitStore } from "../../src/store/habitStore";
import { AnimatedFire } from "../../src/components/AnimatedFire";

// Configure notification handler (works in prod/dev builds, no-op in Expo Go)
try {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
} catch {
  // Expo Go — notifications unavailable
}

/** Play a short beep via expo-av as fallback sound */
async function playAlarmSound() {
  try {
    await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
    const { sound } = await Audio.Sound.createAsync(
      { uri: "https://actions.google.com/sounds/v1/alarms/alarm_clock.ogg" },
      { shouldPlay: true, volume: 1.0 },
    );
    sound.setOnPlaybackStatusUpdate((status) => {
      if (status.isLoaded && status.didJustFinish) {
        sound.unloadAsync();
      }
    });
  } catch {
    // Sound unavailable — vibration still works
  }
}

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
  const extendMiniMission = useHabitStore((state) => state.extendMiniMission);
  const cancelMiniMission = useHabitStore((state) => state.cancelMiniMission);
  const deleteMiniMission = useHabitStore((state) => state.deleteMiniMission);

  const [now, setNow] = useState(Date.now());
  const hasVibrated = useRef(false);
  const notificationId = useRef<string | null>(null);

  useEffect(() => {
    if (mission?.status !== "in_progress") return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [mission?.status]);

  // Total time = estimated + any extended minutes
  const totalMinutes = mission
    ? mission.estimatedMinutes + (mission.extendedMinutes ?? 0)
    : 0;

  const countdown = useMemo(() => {
    if (!mission?.startedAt) return totalMinutes * 60 * 1000;
    const startMs = new Date(mission.startedAt).getTime();
    const endMs = startMs + totalMinutes * 60 * 1000;
    const nowAnchor =
      mission.status === "completed" && mission.completedAt
        ? new Date(mission.completedAt).getTime()
        : now;
    return Math.max(0, endMs - nowAnchor);
  }, [mission, now, totalMinutes]);

  const isTimerUp = mission?.status === "in_progress" && countdown === 0;

  // Vibrate + haptic + sound when timer first hits zero
  useEffect(() => {
    if (isTimerUp && !hasVibrated.current) {
      hasVibrated.current = true;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Vibration.vibrate([0, 400, 200, 400, 200, 400]);
      // Play alarm sound via expo-av
      playAlarmSound();
      // Also fire an immediate notification (works in prod, silent fail in Expo Go)
      Notifications.scheduleNotificationAsync({
        content: {
          title: "⏰ Time's Up!",
          body: `"${mission?.title}" timer has finished. Did you complete it?`,
          sound: true,
        },
        trigger: null,
      }).catch(() => { });
    }
  }, [isTimerUp, mission?.title]);

  // Reset vibration flag when timer gets extended
  useEffect(() => {
    if (!isTimerUp) {
      hasVibrated.current = false;
    }
  }, [isTimerUp]);

  // Schedule notification when mission starts or gets extended (prod/dev build)
  useEffect(() => {
    if (!mission || mission.status !== "in_progress" || !mission.startedAt) return;

    const scheduleNotification = async () => {
      try {
        if (notificationId.current) {
          await Notifications.cancelScheduledNotificationAsync(notificationId.current);
        }

        const startMs = new Date(mission.startedAt!).getTime();
        const endMs = startMs + totalMinutes * 60 * 1000;
        const secondsUntilEnd = Math.max(1, Math.floor((endMs - Date.now()) / 1000));

        if (secondsUntilEnd > 1) {
          const nId = await Notifications.scheduleNotificationAsync({
            content: {
              title: "⏰ Time's Up!",
              body: `Mini mission "${mission.title}" timer has finished!`,
              sound: true,
            },
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
              seconds: secondsUntilEnd,
            },
          });
          notificationId.current = nId;
        }
      } catch {
        // Notifications unavailable (Expo Go)
      }
    };

    scheduleNotification();

    return () => {
      if (notificationId.current) {
        Notifications.cancelScheduledNotificationAsync(notificationId.current).catch(() => { });
      }
    };
  }, [mission?.status, mission?.startedAt, totalMinutes, mission?.title, mission]);

  const earlyFinishMs = useMemo(() => {
    if (!mission || mission.status !== "completed") return 0;
    if (!mission.startedAt || !mission.completedAt) return 0;
    const plannedMs = totalMinutes * 60 * 1000;
    const actualMs =
      new Date(mission.completedAt).getTime() - new Date(mission.startedAt).getTime();
    return Math.max(0, plannedMs - actualMs);
  }, [mission, totalMinutes]);

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

  const handleStart = async () => {
    // Request notification permissions (silent fail in Expo Go)
    try {
      await Notifications.requestPermissionsAsync();
    } catch { }
    startMiniMission(mission.id);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const handleComplete = () => {
    completeMiniMission(mission.id);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (notificationId.current) {
      Notifications.cancelScheduledNotificationAsync(notificationId.current).catch(() => { });
    }
  };

  const handleExtend = () => {
    extendMiniMission(mission.id, 5);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const handleCancel = () => {
    cancelMiniMission(mission.id);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    if (notificationId.current) {
      Notifications.cancelScheduledNotificationAsync(notificationId.current).catch(() => { });
    }
  };

  const handleDelete = () => {
    Alert.alert("Delete Mini Mission", "Delete this mini mission permanently?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          if (notificationId.current) {
            Notifications.cancelScheduledNotificationAsync(notificationId.current).catch(() => { });
          }
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

        <View style={[styles.timerCard, isTimerUp && styles.timerCardExpired]}>
          <Text style={styles.timerLabel}>
            {isTimerUp ? "TIME'S UP!" : "Estimated Sprint"}
          </Text>
          <Text style={[styles.timerValue, isTimerUp && styles.timerValueExpired]}>
            {formatDuration(countdown)}
          </Text>
          <Text style={styles.timerHint}>
            {mission.status === "completed"
              ? "Completed"
              : isTimerUp
                ? "Did you finish? Or need a bit more time?"
                : mission.status === "in_progress"
                  ? "Stay focused and finish this sprint."
                  : "Ready when you are."}
          </Text>
        </View>

        <View style={styles.metaRow}>
          <View style={styles.metaPill}>
            <Clock3 size={14} color={theme.colors.cyan[400]} />
            <Text style={styles.metaText}>
              {totalMinutes} minutes {mission.extendedMinutes > 0 ? `(+${mission.extendedMinutes})` : "planned"}
            </Text>
          </View>
        </View>

        <View style={styles.actions}>
          {/* Not started yet */}
          {mission.status !== "in_progress" &&
            mission.status !== "completed" &&
            mission.status !== "cancelled" && (
              <Button title="Start Now" onPress={handleStart} />
            )}

          {/* In progress but timer still running */}
          {mission.status === "in_progress" && !isTimerUp && (
            <>
              <Button title="Mark Complete" onPress={handleComplete} />
              <Button title="Cancel Mission" variant="secondary" onPress={handleCancel} />
            </>
          )}

          {/* Timer expired — show "I Did It" / "5 More Minutes" */}
          {isTimerUp && (
            <>
              <TouchableOpacity style={styles.doneButton} onPress={handleComplete} activeOpacity={0.85}>
                <CheckCircle2 size={20} color={theme.colors.white} />
                <Text style={styles.doneButtonText}>I Did It!</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.extendButton} onPress={handleExtend} activeOpacity={0.85}>
                <TimerReset size={20} color={theme.colors.amber[500]} />
                <Text style={styles.extendButtonText}>5 More Minutes</Text>
              </TouchableOpacity>
              <Button title="Cancel Mission" variant="secondary" onPress={handleCancel} />
            </>
          )}

          {/* Completed */}
          {mission.status === "completed" && (
            <>
              <View style={styles.completedRow}>
                <Check size={18} color={theme.colors.green[500]} />
                <Text style={styles.completedText}>Mini mission completed</Text>
              </View>
              {earlyFinishMs > 0 && (
                <View style={styles.rewardCard}>
                  <View style={styles.rewardHeader}>
                    <AnimatedFire size={18} />
                    <Text style={styles.rewardTitle}>Early Finish Reward</Text>
                  </View>
                  <View style={styles.rewardRow}>
                    <Trophy size={16} color={theme.colors.yellow[400]} />
                    <Text style={styles.rewardText}>
                      You beat your estimate by {formatDuration(earlyFinishMs)}.
                    </Text>
                  </View>
                </View>
              )}
            </>
          )}

          {/* Cancelled */}
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
  timerCardExpired: {
    borderColor: "rgba(239, 68, 68, 0.5)",
    backgroundColor: "rgba(239, 68, 68, 0.08)",
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
  timerValueExpired: {
    color: theme.colors.red[500],
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
  doneButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: theme.colors.green[500],
    borderRadius: theme.radius.md,
    paddingVertical: 14,
    ...theme.shadow.glow,
  },
  doneButtonText: {
    color: theme.colors.white,
    fontWeight: "800",
    fontSize: 16,
  },
  extendButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "rgba(245, 158, 11, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.35)",
    borderRadius: theme.radius.md,
    paddingVertical: 14,
  },
  extendButtonText: {
    color: theme.colors.amber[500],
    fontWeight: "700",
    fontSize: 15,
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
  rewardCard: {
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: "rgba(251, 191, 36, 0.45)",
    backgroundColor: "rgba(245, 158, 11, 0.12)",
    padding: 12,
    marginTop: 2,
  },
  rewardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    gap: 6,
  },
  rewardTitle: {
    color: theme.colors.yellow[400],
    fontWeight: "800",
    fontSize: 13,
    letterSpacing: 0.4,
  },
  rewardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  rewardText: {
    color: "#fde68a",
    fontWeight: "600",
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
