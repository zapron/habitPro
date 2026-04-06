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
  Switch,
  Image,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ArrowLeft,
  Clock3,
  Check,
  Trash2,
  CircleX,
  Trophy,
  Fuel,
  Flame,
  Globe,
  User,
  Sparkles,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { fireImmediateNotification } from "../../src/utils/notifications";
import { clearMiniMissionNotifications } from "../../src/utils/miniMissionNotifications";
import { Screen } from "../../src/components/Screen";
import { Button } from "../../src/components/Button";
import { StreakMemorySheet } from "../../src/components/StreakMemorySheet";
import { MiniMissionFireProgressBar } from "../../src/components/MiniMissionFireProgressBar";
import { useTheme } from "../../src/context/ThemeContext";
import { useHabitStore } from "../../src/store/habitStore";
import type { MissionVisibility, StreakMemory } from "../../src/types/habit";
import {
  subscribeSyncFailure,
  subscribeSyncSuccess,
} from "../../src/lib/syncQueue";
import { MAX_RESERVE_FUEL_MINUTES } from "../../src/constants/miniMission";

// Notification handler is configured globally in _layout.tsx via setupNotifications()

const QUOTES = [
  {
    text: "The secret of getting ahead is getting started.",
    author: "Mark Twain",
  },
  { text: "Focus on being productive instead of busy.", author: "Tim Ferriss" },
  { text: "Small steps every day lead to big results.", author: "Unknown" },
  {
    text: "You don't have to be great to start, but you have to start to be great.",
    author: "Zig Ziglar",
  },
  {
    text: "The only way to do great work is to love what you do.",
    author: "Steve Jobs",
  },
  { text: "Done is better than perfect.", author: "Sheryl Sandberg" },
  {
    text: "Discipline is choosing between what you want now and what you want most.",
    author: "Abraham Lincoln",
  },
  {
    text: "It always seems impossible until it's done.",
    author: "Nelson Mandela",
  },
  {
    text: "Action is the foundational key to all success.",
    author: "Pablo Picasso",
  },
  {
    text: "What we do today determines where we'll be tomorrow.",
    author: "Unknown",
  },
  { text: "Progress, not perfection.", author: "Unknown" },
  {
    text: "You are one decision away from a completely different life.",
    author: "Unknown",
  },
];

const formatDuration = (ms: number) => {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
};

/** Survives screen unmount so reopening the card does not re-fire "time's up" for the same timer window. */
const foregroundExpiryNotifiedEndMsByMissionId = new Map<string, number>();

function getPlannedEndMs(m: {
  startedAt?: string;
  estimatedMinutes: number;
  extendedMinutes?: number;
}): number {
  if (!m.startedAt) return 0;
  const totalMinutes = m.estimatedMinutes + (m.extendedMinutes ?? 0);
  return new Date(m.startedAt).getTime() + totalMinutes * 60 * 1000;
}

export default function MiniMissionDetail() {
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const router = useRouter();
  const { theme, isDark } = useTheme();
  const missionId = Array.isArray(id) ? id[0] : id;

  const mission = useHabitStore((state) =>
    missionId ? state.getMiniMission(missionId) : undefined,
  );
  const startMiniMission = useHabitStore((state) => state.startMiniMission);
  const completeMiniMission = useHabitStore(
    (state) => state.completeMiniMission,
  );
  const extendMiniMission = useHabitStore((state) => state.extendMiniMission);
  const cancelMiniMission = useHabitStore((state) => state.cancelMiniMission);
  const deleteMiniMission = useHabitStore((state) => state.deleteMiniMission);
  const setMiniMissionVisibility = useHabitStore(
    (state) => state.setMiniMissionVisibility,
  );

  const lastVisibilityRef = useRef<{
    id: string;
    prev: MissionVisibility;
  } | null>(null);
  const [completeSheetOpen, setCompleteSheetOpen] = useState(false);

  useEffect(() => {
    const unsubFail = subscribeSyncFailure(() => {
      const p = lastVisibilityRef.current;
      if (!p || !missionId || p.id !== missionId) return;
      setMiniMissionVisibility(p.id, p.prev);
      lastVisibilityRef.current = null;
    });
    const unsubOk = subscribeSyncSuccess(() => {
      lastVisibilityRef.current = null;
    });
    return () => {
      unsubFail();
      unsubOk();
    };
  }, [missionId, setMiniMissionVisibility]);

  useEffect(() => {
    return () => {
      lastVisibilityRef.current = null;
    };
  }, []);

  const [now, setNow] = useState(Date.now());

  // Motivational quotes
  const [quoteIdx, setQuoteIdx] = useState(() =>
    Math.floor(Math.random() * QUOTES.length),
  );
  const quoteIdxRef = useRef(quoteIdx);
  quoteIdxRef.current = quoteIdx;
  const quoteFade = useRef(new Animated.Value(1)).current;

  const animateQuoteChange = useCallback(
    (nextIdx: number) => {
      Animated.timing(quoteFade, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start(() => {
        setQuoteIdx(nextIdx);
        Animated.timing(quoteFade, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }).start();
      });
    },
    [quoteFade],
  );

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

  const missionFuelProgress = useMemo(() => {
    if (!mission || mission.status !== "in_progress" || !mission.startedAt)
      return 0;
    const totalMs = totalMinutes * 60 * 1000;
    const elapsedMs = now - new Date(mission.startedAt).getTime();
    return Math.min(1, Math.max(0, elapsedMs / totalMs));
  }, [mission, now, totalMinutes]);

  // Timer expiry while this screen is open: haptics + cancel OS schedule (avoid duplicate) + in-app banner.
  // Dedupe by mission id + planned end (module map) so leaving and reopening the card does not spam.
  useEffect(() => {
    if (!isTimerUp || !mission?.startedAt) return;
    const endMs = getPlannedEndMs(mission);
    if (foregroundExpiryNotifiedEndMsByMissionId.get(mission.id) === endMs)
      return;
    foregroundExpiryNotifiedEndMsByMissionId.set(mission.id, endMs);

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    Vibration.vibrate([0, 400, 200, 400, 200, 400]);
    void (async () => {
      await clearMiniMissionNotifications(mission.id);
      await fireImmediateNotification(
        "⏰ Mission failed",
        `"${mission.title}" — timer hit zero. Open the app to dismiss or cancel.`,
      );
    })();
  }, [isTimerUp, mission]);

  const earlyFinishMs = useMemo(() => {
    if (!mission || mission.status !== "completed") return 0;
    if (!mission.startedAt || !mission.completedAt) return 0;
    const plannedMs = totalMinutes * 60 * 1000;
    const actualMs =
      new Date(mission.completedAt).getTime() -
      new Date(mission.startedAt).getTime();
    return Math.max(0, plannedMs - actualMs);
  }, [mission, totalMinutes]);

  if (!mission) {
    return (
      <Screen>
        <View style={styles.centered}>
          <Text style={[styles.notFound, { color: theme.colors.textPrimary }]}>
            Mini mission not found
          </Text>
          <Button title="Go Back" onPress={() => router.back()} />
        </View>
      </Screen>
    );
  }

  const handleStart = async () => {
    startMiniMission(mission.id);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const handleCompleteCommit = (memory: StreakMemory | null) => {
    completeMiniMission(mission.id, memory);
    setCompleteSheetOpen(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const reserveUsed = mission.extendedMinutes ?? 0;
  const reserveFull = reserveUsed >= MAX_RESERVE_FUEL_MINUTES;

  const handleReserveFuel = () => {
    if (reserveFull) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      Alert.alert(
        "Reserve fuel maxed",
        `You can add at most ${MAX_RESERVE_FUEL_MINUTES} minutes of reserve fuel for this mission. Mark complete or risk running out of time.`,
      );
      return;
    }
    extendMiniMission(mission.id, 1);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const handleCancel = () => {
    cancelMiniMission(mission.id);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  };

  const handleDelete = () => {
    Alert.alert(
      "Delete Mini Mission",
      "Delete this mini mission permanently?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            deleteMiniMission(mission.id);
            router.replace("/mini");
          },
        },
      ],
    );
  };

  return (
    <Screen>
      <StreakMemorySheet
        visible={completeSheetOpen}
        variant="mini"
        mode="create"
        missionTitle={mission.title}
        dayLabel="1"
        onClose={() => setCompleteSheetOpen(false)}
        onCommit={handleCompleteCommit}
      />
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor={theme.colors.background}
      />
      <View style={styles.header}>
        <TouchableOpacity
          style={[
            styles.iconButton,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
            },
          ]}
          onPress={() => router.back()}
        >
          <ArrowLeft size={theme.icon.lg} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.iconButton,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
            },
          ]}
          onPress={handleDelete}
        >
          <Trash2 size={theme.icon.md} color={theme.colors.red[500]} />
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        <Text
          style={[
            styles.title,
            { color: theme.colors.textPrimary, fontSize: theme.typography.h1 },
          ]}
        >
          {mission.title}
        </Text>
        {!!mission.objective && (
          <Text
            style={[
              styles.objective,
              {
                color: theme.colors.textSecondary,
                fontSize: theme.typography.body,
              },
            ]}
          >
            {mission.objective}
          </Text>
        )}

        <View
          style={[
            styles.timerCard,
            {
              borderRadius: theme.radius.lg,
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.surface,
              ...(isTimerUp ? {} : theme.shadow.card),
            },
            isTimerUp && styles.timerCardExpired,
          ]}
        >
          <Text style={[styles.timerLabel, { color: theme.colors.textMuted }]}>
            {isTimerUp ? "MISSION FAILED" : "Fuel on board"}
          </Text>
          <Text
            style={[
              styles.timerValue,
              { color: theme.colors.textPrimary },
              isTimerUp && { color: theme.colors.red[500] },
            ]}
          >
            {formatDuration(countdown)}
          </Text>
          <Text
            style={[styles.timerHint, { color: theme.colors.textSecondary }]}
          >
            {mission.status === "completed"
              ? "Completed"
              : isTimerUp
                ? "Timer depleted — no reserve fuel after zero. Cancel this mission or go back."
                : mission.status === "in_progress"
                  ? `Stay with it until done. Reserve fuel is capped at ${MAX_RESERVE_FUEL_MINUTES} min total.`
                  : "Ready when you are."}
          </Text>
        </View>

        {mission.status === "in_progress" && !isTimerUp && (
          <MiniMissionFireProgressBar
            progress={missionFuelProgress}
            isDark={isDark}
          />
        )}

        <View style={styles.metaRow}>
          <View
            style={[
              styles.metaPill,
              {
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surfaceElevated,
              },
            ]}
          >
            <Clock3 size={14} color={theme.colors.cyan[400]} />
            <Text
              style={[styles.metaText, { color: theme.colors.textPrimary }]}
            >
              {mission.status === "in_progress" && !isTimerUp
                ? `${totalMinutes} min total · reserve ${reserveUsed}/${MAX_RESERVE_FUEL_MINUTES} min`
                : `${totalMinutes} minutes ${
                    (mission.extendedMinutes ?? 0) > 0
                      ? `(+${mission.extendedMinutes ?? 0} reserve)`
                      : "planned"
                  }`}
            </Text>
          </View>
        </View>

        <View
          style={[
            styles.visibilityRow,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
              borderRadius: theme.radius.md,
            },
          ]}
        >
          {(mission.visibility ?? "solo") === "public" ? (
            <Globe size={theme.icon.md} color={theme.colors.cyan[400]} />
          ) : (
            <User size={theme.icon.md} color={theme.colors.indigo[400]} />
          )}
          <View style={styles.visibilityTextCol}>
            {(mission.visibility ?? "solo") === "public" ? (
              <>
                <Text
                  style={[
                    styles.visibilityTitle,
                    { color: theme.colors.textPrimary },
                  ]}
                >
                  Public
                </Text>
                <Text
                  style={[
                    styles.visibilityHint,
                    { color: theme.colors.textMuted },
                  ]}
                >
                  Others can see this later. Turn off to keep it solo.
                </Text>
              </>
            ) : (
              <>
                <Text
                  style={[
                    styles.visibilityTitle,
                    { color: theme.colors.textPrimary },
                  ]}
                >
                  Solo
                </Text>
                <Text
                  style={[
                    styles.visibilityHint,
                    { color: theme.colors.textMuted },
                  ]}
                >
                  Only you can see this. Turn on to share with others later.
                </Text>
              </>
            )}
          </View>
          <Switch
            value={(mission.visibility ?? "solo") === "public"}
            onValueChange={(v) => {
              const next = v ? "public" : "solo";
              const prev = mission.visibility ?? "solo";
              if (prev === next) return;
              lastVisibilityRef.current = { id: mission.id, prev };
              setMiniMissionVisibility(mission.id, next);
            }}
            trackColor={{
              false: theme.colors.border,
              true: theme.colors.indigo[600],
            }}
            thumbColor={theme.colors.white}
            ios_backgroundColor={theme.colors.border}
          />
        </View>

        <View style={styles.actions}>
          {mission.status !== "in_progress" &&
            mission.status !== "completed" &&
            mission.status !== "cancelled" && (
              <Button title="Start Now" onPress={handleStart} />
            )}

          {mission.status === "in_progress" && !isTimerUp && (
            <>
              <Button title="Mark Complete" onPress={() => setCompleteSheetOpen(true)} />
              {reserveFull ? (
                <View
                  style={[
                    styles.extendButton,
                    styles.extendButtonDisabled,
                    { borderRadius: theme.radius.md },
                  ]}
                >
                  <Fuel size={20} color={theme.colors.textMuted} />
                  <Text
                    style={[styles.extendButtonText, { color: theme.colors.textMuted }]}
                    numberOfLines={1}
                  >
                    Reserve fuel max ({MAX_RESERVE_FUEL_MINUTES} min)
                  </Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={[styles.extendButton, { borderRadius: theme.radius.md }]}
                  onPress={handleReserveFuel}
                  activeOpacity={0.85}
                >
                  <Fuel size={20} color={theme.colors.amber[500]} />
                  <Text
                    style={[
                      styles.extendButtonText,
                      { color: theme.colors.amber[500] },
                    ]}
                    numberOfLines={1}
                  >
                    Need reserve fuel · +1 min · {reserveUsed}/{MAX_RESERVE_FUEL_MINUTES}
                  </Text>
                </TouchableOpacity>
              )}
              <Button
                title="Cancel Mission"
                variant="secondary"
                onPress={handleCancel}
              />
            </>
          )}

          {isTimerUp && (
            <>
              <View style={styles.failedRow}>
                <CircleX size={22} color={theme.colors.red[500]} />
                <View style={styles.failedTextCol}>
                  <Text
                    style={[
                      styles.failedTitle,
                      { color: theme.colors.red[500] },
                    ]}
                  >
                    Mission failed
                  </Text>
                  <Text
                    style={[
                      styles.failedHint,
                      { color: theme.colors.textSecondary },
                    ]}
                  >
                    The timer hit zero before you marked complete.
                  </Text>
                </View>
              </View>
              <Button
                title="Cancel Mission"
                variant="secondary"
                onPress={handleCancel}
              />
            </>
          )}

          {mission.status === "completed" && (
            <>
              <View style={styles.completedRow}>
                <Check size={18} color={theme.colors.green[500]} />
                <Text
                  style={[
                    styles.completedText,
                    { color: theme.colors.green[500] },
                  ]}
                >
                  Mini mission completed
                </Text>
              </View>
              {(mission.completionMemory?.imageUri || mission.completionMemory?.note) && (
                <View style={styles.completionMomentSection}>
                  <View style={styles.completionMomentHead}>
                    <Sparkles size={16} color={theme.colors.amber[500]} />
                    <Text
                      style={[
                        styles.completionMomentTitle,
                        { color: theme.colors.textPrimary },
                      ]}
                    >
                      Your moment
                    </Text>
                  </View>
                  {mission.completionMemory?.imageUri ? (
                    <View
                      style={[
                        styles.completionImageWrap,
                        { borderColor: theme.colors.border },
                      ]}
                    >
                      <Image
                        source={{ uri: mission.completionMemory.imageUri }}
                        style={styles.completionImage}
                        resizeMode="cover"
                      />
                    </View>
                  ) : null}
                  {mission.completionMemory?.note ? (
                    <View
                      style={[
                        styles.completionNoteBox,
                        {
                          borderColor: theme.colors.border,
                          backgroundColor: theme.colors.surface,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.completionNoteText,
                          { color: theme.colors.textPrimary },
                        ]}
                      >
                        {mission.completionMemory.note}
                      </Text>
                    </View>
                  ) : null}
                </View>
              )}
              {earlyFinishMs > 0 && (
                <View
                  style={[styles.rewardCard, { borderRadius: theme.radius.md }]}
                >
                  <View style={styles.rewardHeader}>
                    <Flame size={18} color="#f59e0b" fill="#fde68a" />
                    <Text
                      style={[
                        styles.rewardTitle,
                        { color: theme.colors.yellow[400] },
                      ]}
                    >
                      Early Finish Reward
                    </Text>
                  </View>
                  <View style={styles.rewardRow}>
                    <Trophy size={16} color={theme.colors.yellow[400]} />
                    <Text
                      style={[
                        styles.rewardText,
                        { color: isDark ? "#fde68a" : theme.colors.amber[500] },
                      ]}
                    >
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
              <Text
                style={[styles.cancelledText, { color: theme.colors.red[500] }]}
              >
                This mini mission is cancelled
              </Text>
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
                backgroundColor: isDark
                  ? "rgba(255,255,255,0.04)"
                  : "rgba(255,255,255,0.5)",
                borderColor: isDark
                  ? "rgba(255,255,255,0.08)"
                  : "rgba(0,0,0,0.06)",
                borderRadius: theme.radius.lg,
              },
            ]}
          >
            <Animated.View
              style={[quoteStyles.textWrap, { opacity: quoteFade }]}
            >
              <Text
                style={[
                  quoteStyles.quoteText,
                  {
                    color: isDark
                      ? "rgba(255,255,255,0.7)"
                      : "rgba(0,0,0,0.55)",
                  },
                ]}
              >
                “{QUOTES[quoteIdx].text}”
              </Text>
              <Text
                style={[
                  quoteStyles.quoteAuthor,
                  {
                    color: isDark
                      ? "rgba(255,255,255,0.35)"
                      : "rgba(0,0,0,0.35)",
                  },
                ]}
              >
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
                          ? isDark
                            ? "rgba(255,255,255,0.5)"
                            : "rgba(0,0,0,0.35)"
                          : isDark
                            ? "rgba(255,255,255,0.12)"
                            : "rgba(0,0,0,0.1)",
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
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 9999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  notFound: { marginBottom: 12 },
  content: { flex: 1 },
  title: { fontWeight: "800", marginBottom: 8 },
  objective: { marginBottom: 20, lineHeight: 23 },
  timerCard: {
    borderWidth: 1,
    alignItems: "center",
    paddingVertical: 20,
    paddingHorizontal: 16,
  },
  timerCardExpired: {
    borderColor: "rgba(239, 68, 68, 0.5)",
    backgroundColor: "rgba(239, 68, 68, 0.08)",
  },
  timerLabel: {
    textTransform: "uppercase",
    letterSpacing: 1,
    fontWeight: "700",
    fontSize: 11,
  },
  timerValue: {
    fontSize: 52,
    fontWeight: "800",
    marginVertical: 2,
    includeFontPadding: false,
  },
  timerHint: { textAlign: "center", marginTop: 2 },
  metaRow: { marginTop: 16, marginBottom: 12 },
  visibilityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    marginBottom: 16,
  },
  visibilityTextCol: { flex: 1 },
  visibilityTitle: { fontWeight: "700", fontSize: 14 },
  visibilityHint: { fontSize: 11, marginTop: 3, lineHeight: 15 },
  metaPill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 9999,
    borderWidth: 1,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  metaText: { fontWeight: "700" },
  actions: { gap: 10 },
  failedRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.35)",
    backgroundColor: "rgba(239, 68, 68, 0.08)",
  },
  failedTextCol: { flex: 1 },
  failedTitle: { fontWeight: "800", fontSize: 16, marginBottom: 4 },
  failedHint: { fontSize: 13, lineHeight: 18 },
  extendButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "rgba(245, 158, 11, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.35)",
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  extendButtonText: { fontWeight: "700", fontSize: 15, flexShrink: 1 },
  extendButtonDisabled: { opacity: 0.72, backgroundColor: "rgba(148, 163, 184, 0.12)", borderColor: "rgba(148, 163, 184, 0.35)" },
  completedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
  },
  completedText: { fontWeight: "700" },
  completionMomentSection: { marginTop: 4, marginBottom: 4, gap: 10 },
  completionMomentHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  completionMomentTitle: { fontWeight: "800", fontSize: 14 },
  completionImageWrap: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
    maxHeight: 220,
    width: "100%",
  },
  completionImage: { width: "100%", aspectRatio: 4 / 5, maxHeight: 220 },
  completionNoteBox: { borderRadius: 14, borderWidth: 1, padding: 14 },
  completionNoteText: { fontSize: 15, lineHeight: 22 },
  rewardCard: {
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
  rewardTitle: { fontWeight: "800", fontSize: 13, letterSpacing: 0.4 },
  rewardRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  rewardText: { fontWeight: "600" },
  cancelledRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
  },
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
