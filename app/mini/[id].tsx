import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Alert,
  Vibration,
  Animated,
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
  Flame,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import {
  scheduleTimerNotification,
  fireImmediateNotification,
  cancelNotification,
  showOngoingMissionNotification,
  dismissOngoingNotification,
} from "../../src/utils/notifications";
import { Screen } from "../../src/components/Screen";
import { Button } from "../../src/components/Button";
import { useTheme } from "../../src/context/ThemeContext";
import { useHabitStore } from "../../src/store/habitStore";

// Notification handler is configured globally in _layout.tsx via setupNotifications()

const QUOTES = [
  { text: "The secret of getting ahead is getting started.", author: "Mark Twain" },
  { text: "Focus on being productive instead of busy.", author: "Tim Ferriss" },
  { text: "Small steps every day lead to big results.", author: "Unknown" },
  { text: "You don't have to be great to start, but you have to start to be great.", author: "Zig Ziglar" },
  { text: "The only way to do great work is to love what you do.", author: "Steve Jobs" },
  { text: "Done is better than perfect.", author: "Sheryl Sandberg" },
  { text: "Discipline is choosing between what you want now and what you want most.", author: "Abraham Lincoln" },
  { text: "It always seems impossible until it's done.", author: "Nelson Mandela" },
  { text: "Action is the foundational key to all success.", author: "Pablo Picasso" },
  { text: "What we do today determines where we'll be tomorrow.", author: "Unknown" },
  { text: "Progress, not perfection.", author: "Unknown" },
  { text: "You are one decision away from a completely different life.", author: "Unknown" },
];

const formatDuration = (ms: number) => {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
};

export default function MiniMissionDetail() {
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const router = useRouter();
  const { theme, isDark } = useTheme();
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
  const hasTriggered = useRef(false);
  const notificationId = useRef<string | null>(null);
  const ongoingNotifId = useRef<string | null>(null);

  // Motivational quotes
  const [quoteIdx, setQuoteIdx] = useState(() => Math.floor(Math.random() * QUOTES.length));
  const quoteIdxRef = useRef(quoteIdx);
  quoteIdxRef.current = quoteIdx;
  const quoteFade = useRef(new Animated.Value(1)).current;

  const animateQuoteChange = useCallback((nextIdx: number) => {
    Animated.timing(quoteFade, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
      setQuoteIdx(nextIdx);
      Animated.timing(quoteFade, { toValue: 1, duration: 300, useNativeDriver: true }).start();
    });
  }, [quoteFade]);

  // Auto-rotate quotes every 5s when in progress
  useEffect(() => {
    if (mission?.status !== "in_progress") return;
    const interval = setInterval(() => {
      const next = (quoteIdxRef.current + 1) % QUOTES.length;
      animateQuoteChange(next);
    }, 5000);
    return () => clearInterval(interval);
  }, [mission?.status, animateQuoteChange]);

  useEffect(() => {
    if (mission?.status !== "in_progress") return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [mission?.status]);

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

  // Timer expiry: vibrate + notify
  useEffect(() => {
    if (isTimerUp && !hasTriggered.current) {
      hasTriggered.current = true;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Vibration.vibrate([0, 400, 200, 400, 200, 400]);
      // Dismiss the ongoing notification and fire the alert
      dismissOngoingNotification(ongoingNotifId.current);
      ongoingNotifId.current = null;
      fireImmediateNotification(
        "⏰ Time's Up!",
        `"${mission?.title}" timer has finished. Did you complete it?`,
      );
    }
  }, [isTimerUp, mission?.title]);

  useEffect(() => {
    if (!isTimerUp) hasTriggered.current = false;
  }, [isTimerUp]);

  useEffect(() => {
    if (!mission || mission.status !== "in_progress" || !mission.startedAt) return;

    const schedule = async () => {
      await cancelNotification(notificationId.current);
      await dismissOngoingNotification(ongoingNotifId.current);

      const startMs = new Date(mission.startedAt!).getTime();
      const endMs = startMs + totalMinutes * 60 * 1000;
      const secondsUntilEnd = Math.floor((endMs - Date.now()) / 1000);

      // Show persistent "in progress" notification
      const oId = await showOngoingMissionNotification(mission.title, endMs);
      ongoingNotifId.current = oId;

      // Schedule the timer expiry notification
      if (secondsUntilEnd > 1) {
        const nId = await scheduleTimerNotification(
          "⏰ Time's Up!",
          `Mini mission "${mission.title}" timer has finished!`,
          secondsUntilEnd,
        );
        notificationId.current = nId;
      }
    };

    schedule();

    return () => {
      cancelNotification(notificationId.current);
      dismissOngoingNotification(ongoingNotifId.current);
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
          <Text style={[styles.notFound, { color: theme.colors.textPrimary }]}>Mini mission not found</Text>
          <Button title="Go Back" onPress={() => router.back()} />
        </View>
      </Screen>
    );
  }

  const handleStart = async () => {
    startMiniMission(mission.id);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const handleComplete = () => {
    completeMiniMission(mission.id);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    cancelNotification(notificationId.current);
    dismissOngoingNotification(ongoingNotifId.current);
    ongoingNotifId.current = null;
  };

  const handleExtend = () => {
    extendMiniMission(mission.id, 5);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const handleCancel = () => {
    cancelMiniMission(mission.id);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    cancelNotification(notificationId.current);
    dismissOngoingNotification(ongoingNotifId.current);
    ongoingNotifId.current = null;
  };

  const handleDelete = () => {
    Alert.alert("Delete Mini Mission", "Delete this mini mission permanently?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          cancelNotification(notificationId.current);
          dismissOngoingNotification(ongoingNotifId.current);
          ongoingNotifId.current = null;
          deleteMiniMission(mission.id);
          router.replace("/mini");
        },
      },
    ]);
  };

  return (
    <Screen>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={theme.colors.background} />
      <View style={styles.header}>
        <TouchableOpacity style={[styles.iconButton, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]} onPress={() => router.back()}>
          <ArrowLeft size={20} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <TouchableOpacity style={[styles.iconButton, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]} onPress={handleDelete}>
          <Trash2 size={18} color={theme.colors.red[500]} />
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        <Text style={[styles.title, { color: theme.colors.textPrimary, fontSize: theme.typography.h1 }]}>{mission.title}</Text>
        {!!mission.objective && <Text style={[styles.objective, { color: theme.colors.textSecondary, fontSize: theme.typography.body }]}>{mission.objective}</Text>}

        <View style={[styles.timerCard, { borderRadius: theme.radius.lg, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, ...(isTimerUp ? {} : theme.shadow.card) }, isTimerUp && styles.timerCardExpired]}>
          <Text style={[styles.timerLabel, { color: theme.colors.textMuted }]}>
            {isTimerUp ? "TIME'S UP!" : "Estimated Sprint"}
          </Text>
          <Text style={[styles.timerValue, { color: theme.colors.textPrimary }, isTimerUp && { color: theme.colors.red[500] }]}>
            {formatDuration(countdown)}
          </Text>
          <Text style={[styles.timerHint, { color: theme.colors.textSecondary }]}>
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
          <View style={[styles.metaPill, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceElevated }]}>
            <Clock3 size={14} color={theme.colors.cyan[400]} />
            <Text style={[styles.metaText, { color: theme.colors.textPrimary }]}>
              {totalMinutes} minutes {mission.extendedMinutes > 0 ? `(+${mission.extendedMinutes})` : "planned"}
            </Text>
          </View>
        </View>

        <View style={styles.actions}>
          {mission.status !== "in_progress" && mission.status !== "completed" && mission.status !== "cancelled" && (
            <Button title="Start Now" onPress={handleStart} />
          )}

          {mission.status === "in_progress" && !isTimerUp && (
            <>
              <Button title="Mark Complete" onPress={handleComplete} />
              <Button title="Cancel Mission" variant="secondary" onPress={handleCancel} />
            </>
          )}

          {isTimerUp && (
            <>
              <TouchableOpacity style={[styles.doneButton, { backgroundColor: theme.colors.green[500], borderRadius: theme.radius.md, ...theme.shadow.glow }]} onPress={handleComplete} activeOpacity={0.85}>
                <CheckCircle2 size={20} color={theme.colors.white} />
                <Text style={[styles.doneButtonText, { color: theme.colors.white }]}>I Did It!</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.extendButton, { borderRadius: theme.radius.md }]} onPress={handleExtend} activeOpacity={0.85}>
                <TimerReset size={20} color={theme.colors.amber[500]} />
                <Text style={[styles.extendButtonText, { color: theme.colors.amber[500] }]}>5 More Minutes</Text>
              </TouchableOpacity>
              <Button title="Cancel Mission" variant="secondary" onPress={handleCancel} />
            </>
          )}

          {mission.status === "completed" && (
            <>
              <View style={styles.completedRow}>
                <Check size={18} color={theme.colors.green[500]} />
                <Text style={[styles.completedText, { color: theme.colors.green[500] }]}>Mini mission completed</Text>
              </View>
              {earlyFinishMs > 0 && (
                <View style={[styles.rewardCard, { borderRadius: theme.radius.md }]}>
                  <View style={styles.rewardHeader}>
                    <Flame size={18} color="#f59e0b" fill="#fde68a" />
                    <Text style={[styles.rewardTitle, { color: theme.colors.yellow[400] }]}>Early Finish Reward</Text>
                  </View>
                  <View style={styles.rewardRow}>
                    <Trophy size={16} color={theme.colors.yellow[400]} />
                    <Text style={[styles.rewardText, { color: isDark ? '#fde68a' : theme.colors.amber[500] }]}>
                      You beat your estimate by {formatDuration(earlyFinishMs)}.
                    </Text>
                  </View>
                </View>
              )}
            </>
          )}

          {mission.status === "cancelled" && (
            <View style={styles.cancelledRow}>
              <CircleX size={18} color={theme.colors.red[500]} />
              <Text style={[styles.cancelledText, { color: theme.colors.red[500] }]}>This mini mission is cancelled</Text>
            </View>
          )}
        </View>

        {/* Motivational quotes — glass card at the bottom, only while timer is running */}
        {mission.status === "in_progress" && !isTimerUp && (
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => animateQuoteChange((quoteIdx + 1) % QUOTES.length)}
            style={[
              quoteStyles.glassCard,
              {
                backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.5)",
                borderColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
                borderRadius: theme.radius.lg,
              },
            ]}
          >
            <Animated.View style={[quoteStyles.textWrap, { opacity: quoteFade }]}>
              <Text style={[quoteStyles.quoteText, { color: isDark ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.55)" }]}>
                “{QUOTES[quoteIdx].text}”
              </Text>
              <Text style={[quoteStyles.quoteAuthor, { color: isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.35)" }]}>
                — {QUOTES[quoteIdx].author}
              </Text>
            </Animated.View>
            {/* Pagination dots */}
            <View style={quoteStyles.dotsRow}>
              {[0, 1, 2].map((dotIdx) => (
                <View
                  key={dotIdx}
                  style={[
                    quoteStyles.dot,
                    {
                      backgroundColor:
                        quoteIdx % 3 === dotIdx
                          ? isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.35)"
                          : isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.1)",
                    },
                  ]}
                />
              ))}
            </View>
          </TouchableOpacity>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  iconButton: { width: 40, height: 40, borderRadius: 9999, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  notFound: { marginBottom: 12 },
  content: { flex: 1 },
  title: { fontWeight: "800", marginBottom: 8 },
  objective: { marginBottom: 20, lineHeight: 23 },
  timerCard: { borderWidth: 1, alignItems: "center", paddingVertical: 20, paddingHorizontal: 16 },
  timerCardExpired: { borderColor: "rgba(239, 68, 68, 0.5)", backgroundColor: "rgba(239, 68, 68, 0.08)" },
  timerLabel: { textTransform: "uppercase", letterSpacing: 1, fontWeight: "700", fontSize: 11 },
  timerValue: { fontSize: 52, fontWeight: "800", marginVertical: 2, includeFontPadding: false },
  timerHint: { textAlign: "center", marginTop: 2 },
  metaRow: { marginTop: 16, marginBottom: 20 },
  metaPill: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 9999, borderWidth: 1, paddingVertical: 7, paddingHorizontal: 12 },
  metaText: { fontWeight: "700" },
  actions: { gap: 10 },
  doneButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 14 },
  doneButtonText: { fontWeight: "800", fontSize: 16 },
  extendButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: "rgba(245, 158, 11, 0.12)", borderWidth: 1, borderColor: "rgba(245, 158, 11, 0.35)", paddingVertical: 14 },
  extendButtonText: { fontWeight: "700", fontSize: 15 },
  completedRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10 },
  completedText: { fontWeight: "700" },
  rewardCard: { borderWidth: 1, borderColor: "rgba(251, 191, 36, 0.45)", backgroundColor: "rgba(245, 158, 11, 0.12)", padding: 12, marginTop: 2 },
  rewardHeader: { flexDirection: "row", alignItems: "center", marginBottom: 8, gap: 6 },
  rewardTitle: { fontWeight: "800", fontSize: 13, letterSpacing: 0.4 },
  rewardRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  rewardText: { fontWeight: "600" },
  cancelledRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10 },
  cancelledText: { fontWeight: "700" },
});

const quoteStyles = StyleSheet.create({
  glassCard: {
    marginTop: 20,
    padding: 20,
    borderWidth: 1,
    alignItems: "center",
  },
  textWrap: { alignItems: "center", paddingHorizontal: 8 },
  quoteText: {
    fontSize: 14,
    fontStyle: "italic",
    textAlign: "center",
    lineHeight: 22,
    letterSpacing: 0.3,
  },
  quoteAuthor: {
    fontSize: 11,
    fontWeight: "700",
    marginTop: 8,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  dotsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 12,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
});
