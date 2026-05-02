import { Text } from "../../src/components/AppText";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState } from "react";
import {
  View,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Alert,
  Vibration,
  Animated,
  Image,
  Modal,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
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
  Sparkles,
  Info,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { fireImmediateNotification } from "../../src/utils/notifications";
import { clearMiniMissionNotifications } from "../../src/utils/miniMissionNotifications";
import { Screen } from "../../src/components/Screen";
import { ConfirmDialog } from "../../src/components/ConfirmDialog";
import { Button } from "../../src/components/Button";
import { MissionDetailsSheet } from "../../src/components/MissionDetailsSheet";
import { StreakMemorySheet } from "../../src/components/StreakMemorySheet";
import { MiniMissionFireProgressBar } from "../../src/components/MiniMissionFireProgressBar";
import { MiniMissionFlightCountdown } from "../../src/components/MiniMissionFlightCountdown";
import { remainingMsToProgressiveCountdown } from "../../src/utils/flightCountdownDisplay";
import { useTheme } from "../../src/context/ThemeContext";
import { useHabitStore } from "../../src/store/habitStore";
import type { MissionVisibility, StreakMemory } from "../../src/types/habit";
import {
  subscribeSyncFailure,
  subscribeSyncSuccess,
} from "../../src/lib/syncQueue";
import { useAuth } from "../../src/context/AuthContext";
import { usePremium } from "../../src/context/PremiumContext";
import { usePlusUpsell } from "../../src/context/PlusUpsellContext";
import { useRefreshPremiumAccess } from "../../src/hooks/useRefreshPremiumAccess";
import { useUsernameGate } from "../../src/context/UsernameGateContext";
import { useNotificationGate } from "../../src/context/NotificationGateContext";
import { isSupabaseConfigured } from "../../src/lib/env";
import { MiniVisibilityRow } from "../../src/components/MiniVisibilityRow";
import {
  deleteCommunityWin,
  postCommunityWin,
} from "../../src/lib/communityWinsApi";
import { MAX_RESERVE_FUEL_MINUTES } from "../../src/constants/miniMission";
import {
  canUseStreakMemoryUpload,
  shouldUploadLocalStreakImage,
  uploadMiniStreakMemoryImage,
} from "../../src/lib/streakMemoryStorage";

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
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { isPremium, loading: premiumLoading } = usePremium();
  const { openUpsell } = usePlusUpsell();
  const refreshPremiumAccess = useRefreshPremiumAccess();
  const { requireUsername } = useUsernameGate();
  const socialLocked = !isPremium || premiumLoading;
  const missionId = Array.isArray(id) ? id[0] : id;
  const scrollBottomPad = Math.max(insets.bottom, 16) + 16;

  const mission = useHabitStore((state) =>
    missionId ? state.getMiniMission(missionId) : undefined,
  );
  const startMiniMission = useHabitStore((state) => state.startMiniMission);
  const { requireNotifications } = useNotificationGate();
  const completeMiniMission = useHabitStore(
    (state) => state.completeMiniMission,
  );
  const extendMiniMission = useHabitStore((state) => state.extendMiniMission);
  const cancelMiniMission = useHabitStore((state) => state.cancelMiniMission);
  const retryFailedMiniMission = useHabitStore(
    (state) => state.retryFailedMiniMission,
  );
  const deleteMiniMission = useHabitStore((state) => state.deleteMiniMission);
  const setMiniMissionVisibility = useHabitStore(
    (state) => state.setMiniMissionVisibility,
  );
  const setMiniMissionCommunityFeedRevoked = useHabitStore(
    (state) => state.setMiniMissionCommunityFeedRevoked,
  );

  const lastVisibilityRef = useRef<{
    id: string;
    prev: MissionVisibility;
  } | null>(null);
  const [completeSheetOpen, setCompleteSheetOpen] = useState(false);
  /** Wall time when user tapped Mark Complete — freezes countdown until sheet closes or mission completes. */
  const [timerFrozenAtMs, setTimerFrozenAtMs] = useState<number | null>(null);
  /** Avoid not-found flash after delete; mission is removed before navigation finishes. */
  const [pendingExitAfterRemove, setPendingExitAfterRemove] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [missionDetailsOpen, setMissionDetailsOpen] = useState(false);
  const [completionImageAspect, setCompletionImageAspect] = useState<number | null>(null);
  const [completionImageOpen, setCompletionImageOpen] = useState(false);

  const completionImageUri = useMemo(() => {
    return mission?.completionMemory?.imageUrl ?? mission?.completionMemory?.imageUri ?? null;
  }, [mission?.completionMemory?.imageUrl, mission?.completionMemory?.imageUri]);

  useEffect(() => {
    // Reset when switching missions / images so we don't reuse an old aspect ratio.
    setCompletionImageAspect(null);
    setCompletionImageOpen(false);
  }, [completionImageUri]);

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

  useFocusEffect(
    useCallback(() => {
      void refreshPremiumAccess();
    }, [refreshPremiumAccess]),
  );

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

  // Auto-rotate quotes every 5s when in progress (pause while memory sheet is open)
  useEffect(() => {
    if (mission?.status !== "in_progress" || completeSheetOpen) return;
    const interval = setInterval(() => {
      const next = (quoteIdxRef.current + 1) % QUOTES.length;
      animateQuoteChange(next);
    }, 5000);
    return () => clearInterval(interval);
  }, [mission?.status, completeSheetOpen, animateQuoteChange]);

  useEffect(() => {
    if (mission?.status !== "in_progress" || completeSheetOpen) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [mission?.status, completeSheetOpen]);

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
        : completeSheetOpen && timerFrozenAtMs !== null
          ? timerFrozenAtMs
          : now;
    return Math.max(0, endMs - nowAnchor);
  }, [mission, now, totalMinutes, completeSheetOpen, timerFrozenAtMs]);

  const isTimerUp = mission?.status === "in_progress" && countdown === 0;

  const flightProgressive = useMemo(
    () => remainingMsToProgressiveCountdown(countdown),
    [countdown],
  );

  const flightTone = useMemo(() => {
    if (!mission) {
      return "muted" as const;
    }
    if (completeSheetOpen) {
      return "countdown" as const;
    }
    if (isTimerUp) {
      return "danger" as const;
    }
    if (mission.status === "completed") {
      return "muted" as const;
    }
    if (mission.status === "cancelled") {
      return "muted" as const;
    }
    if (mission.status === "in_progress") {
      return "countdown" as const;
    }
    return "countdown" as const;
  }, [mission, completeSheetOpen, isTimerUp]);

  const missionFuelProgress = useMemo(() => {
    if (!mission || mission.status !== "in_progress" || !mission.startedAt)
      return 0;
    const totalMs = totalMinutes * 60 * 1000;
    const tick =
      completeSheetOpen && timerFrozenAtMs !== null ? timerFrozenAtMs : now;
    const elapsedMs = tick - new Date(mission.startedAt).getTime();
    return Math.min(1, Math.max(0, elapsedMs / totalMs));
  }, [mission, now, totalMinutes, completeSheetOpen, timerFrozenAtMs]);

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
        `"${mission.title}" timer hit zero. Open the app to dismiss or cancel.`,
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

  const confirmDeleteMiniMission = useCallback(() => {
    if (!mission) return;
    setDeleteDialogOpen(false);
    const id = mission.id;
    setPendingExitAfterRemove(true);
    void (async () => {
      await deleteCommunityWin(id);
      deleteMiniMission(id);
      router.replace("/mini");
    })();
  }, [mission, router, deleteMiniMission]);

  if (!mission) {
    return (
      <Screen>
        {pendingExitAfterRemove ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={theme.colors.cyan[400]} />
          </View>
        ) : (
          <View style={styles.centered}>
            <Text style={[styles.notFound, { color: theme.colors.textPrimary }]}>
              Mini mission not found
            </Text>
            <Button title="Go Back" onPress={() => router.back()} />
          </View>
        )}
      </Screen>
    );
  }

  const handleStart = async () => {
    const ok = await requireNotifications("mini_timer");
    if (!ok) return;
    startMiniMission(mission.id);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const handleCompleteCommit = async (
    memory: StreakMemory | null,
    meta?: { publishToCommunity?: boolean },
  ) => {
    let memoryToSave = memory;
    if (
      memory &&
      canUseStreakMemoryUpload() &&
      shouldUploadLocalStreakImage(memory.imageUri)
    ) {
      try {
        const imageUrl = await uploadMiniStreakMemoryImage({
          miniMissionId: mission.id,
          localUri: memory.imageUri!,
        });
        memoryToSave = { ...memory, imageUrl, imageUri: undefined };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        Alert.alert("Photo upload failed", msg, [{ text: "OK" }]);
        throw e;
      }
    }

    const completedAt = new Date(timerFrozenAtMs ?? Date.now()).toISOString();
    const wantsPublish = meta?.publishToCommunity === true;
    const publishCloudReady = wantsPublish && isSupabaseConfigured() && session?.user != null;
    const freshPremium = publishCloudReady
      ? await refreshPremiumAccess({ force: true })
      : null;
    let canPublish = publishCloudReady && freshPremium === true;
    if (publishCloudReady && freshPremium !== true) {
      openUpsell("community_publish");
    }
    if (canPublish) {
      const hasImage = Boolean(memoryToSave?.imageUrl || memoryToSave?.imageUri);
      if (!hasImage) {
        Alert.alert(
          "Photo required",
          "Community posts need a photo. Add a photo and tap Complete with Memory again.",
          [{ text: "OK" }],
        );
        canPublish = false;
      }
    }

    if (wantsPublish && !isSupabaseConfigured()) {
      Alert.alert(
        "Can’t publish",
        "Cloud sync isn’t configured. Your mission is saved as private.",
        [{ text: "OK" }],
      );
    } else if (wantsPublish && !session?.user) {
      Alert.alert(
        "Sign in to publish",
        "Sign in to share this win in Community. Your mission is saved as private.",
        [{ text: "OK" }],
      );
    }

    /** Solo at completion (or can’t publish) locks Community; successful publish sets public afterward. */
    const lockCommunity = !canPublish;

    completeMiniMission(mission.id, memoryToSave, {
      visibility: "solo",
      communityFeedRevoked: lockCommunity,
      completedAt,
    });

    if (canPublish) {
      const ok = await requireUsername("community_post");
      if (!ok) {
        Alert.alert("Username required", "Choose a username to publish to Community.", [{ text: "OK" }]);
        return;
      }
      const res = await postCommunityWin({
        miniMissionId: mission.id,
        title: mission.title,
        completedAt,
        memoryNote: memoryToSave?.note ?? null,
        memoryImageUrl: memoryToSave?.imageUrl ?? null,
      });
      if (res.ok === true) {
        setMiniMissionVisibility(mission.id, "public");
        setMiniMissionCommunityFeedRevoked(mission.id, false);
      } else {
        Alert.alert("Couldn’t publish", res.error, [{ text: "OK" }]);
      }
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handleVisibilityChange = (next: MissionVisibility) => {
    if (!mission) return;
    const prev = mission.visibility ?? "solo";
    if (prev === next) return;

    if (prev === "public" && next === "solo") {
      Alert.alert(
        "Remove from Community?",
        "This removes your win from the feed. You won’t be able to publish this mission to Community again.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Remove",
            style: "destructive",
            onPress: () => {
              void (async () => {
                const del = await deleteCommunityWin(mission.id);
                if (del.ok === false) {
                  Alert.alert("Couldn’t remove", del.error, [{ text: "OK" }]);
                  return;
                }
                setMiniMissionVisibility(mission.id, "solo");
                setMiniMissionCommunityFeedRevoked(mission.id, true);
              })();
            },
          },
        ],
      );
      return;
    }

    if (prev === "solo" && next === "public") {
      if (mission.communityFeedRevoked) {
        Alert.alert(
          "Can’t publish to Community",
          "This mission stays private. Community sharing was turned off when you completed it, or you removed it from the feed.",
          [{ text: "OK" }],
        );
        return;
      }
      if (!isSupabaseConfigured() || !session?.user) {
        Alert.alert(
          "Sign in required",
          "Sign in to publish to Community wins.",
          [{ text: "OK" }],
        );
        return;
      }
      const completionMem = mission.completionMemory;
      const hasCompletionPhoto = Boolean(completionMem?.imageUrl || completionMem?.imageUri);
      if (!hasCompletionPhoto) {
        Alert.alert(
          "Photo required",
          "Community posts need a photo. Add one to your completion memory first.",
          [{ text: "OK" }],
        );
        return;
      }
      void (async () => {
        const freshPremium = await refreshPremiumAccess({ force: true });
        if (freshPremium !== true) {
          openUpsell("community_publish");
          return;
        }
        lastVisibilityRef.current = { id: mission.id, prev };
        const ok = await requireUsername("community_post");
        if (!ok) {
          Alert.alert("Username required", "Choose a username to publish to Community.", [{ text: "OK" }]);
          lastVisibilityRef.current = null;
          return;
        }
        const res = await postCommunityWin({
          miniMissionId: mission.id,
          title: mission.title,
          completedAt: mission.completedAt ?? new Date().toISOString(),
          memoryNote: mission.completionMemory?.note ?? null,
          memoryImageUrl: mission.completionMemory?.imageUrl ?? null,
        });
        if (res.ok === false) {
          Alert.alert("Couldn’t publish", res.error, [{ text: "OK" }]);
          lastVisibilityRef.current = null;
          return;
        }
        setMiniMissionVisibility(mission.id, "public");
        lastVisibilityRef.current = null;
      })();
    }
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

  const handleRetryFailed = () => {
    retryFailedMiniMission(mission.id);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  return (
    <Screen>
      <ConfirmDialog
        visible={deleteDialogOpen}
        onRequestClose={() => setDeleteDialogOpen(false)}
        title="Delete Mini Mission"
        message="Delete this mini mission permanently?"
        actions={[
          { label: "Cancel", variant: "secondary", onPress: () => setDeleteDialogOpen(false) },
          { label: "Delete", variant: "danger", onPress: confirmDeleteMiniMission },
        ]}
      />
      <MissionDetailsSheet
        variant="mini"
        visible={missionDetailsOpen}
        onClose={() => setMissionDetailsOpen(false)}
        mission={mission}
      />
      <StreakMemorySheet
        visible={completeSheetOpen}
        variant="mini"
        mode="create"
        missionTitle={mission.title}
        dayLabel="1"
        onClose={() => {
          setCompleteSheetOpen(false);
          setTimerFrozenAtMs(null);
        }}
        onCommit={handleCompleteCommit}
        miniPublishAvailable={isSupabaseConfigured() && !!session?.user}
        plusCommunityOk={!socialLocked}
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
          onPress={() => setDeleteDialogOpen(true)}
        >
          <Trash2 size={theme.icon.md} color={theme.colors.red[500]} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: scrollBottomPad }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.titleRow}>
          <Text
            style={[
              styles.title,
              {
                color: theme.colors.textPrimary,
                fontSize: theme.typography.h1,
                lineHeight: Math.round(theme.typography.h1 * 1.12),
              },
            ]}
            numberOfLines={2}
          >
            {mission.title}
          </Text>
          <TouchableOpacity
            style={styles.infoButton}
            onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setMissionDetailsOpen(true);
            }}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel="Mini mission details"
          >
            <Info size={theme.icon.md} color={theme.colors.indigo[400]} />
          </TouchableOpacity>
        </View>

        {mission.status === "in_progress" && !isTimerUp ? (
          <MiniMissionFlightCountdown
            display={flightProgressive.display}
            phase={flightProgressive.phase}
            tone={flightTone}
          />
        ) : null}
        <View style={styles.topPillsRow}>
          {mission.status === "completed" ? (
            <View
              style={[
                styles.completedPill,
                {
                  backgroundColor: isDark ? "rgba(34, 197, 94, 0.14)" : "rgba(22, 163, 74, 0.12)",
                  borderColor: isDark ? "rgba(34, 197, 94, 0.28)" : "rgba(22, 163, 74, 0.22)",
                },
              ]}
            >
              <Check size={16} color={theme.colors.green[500]} />
              <Text style={[styles.completedPillText, { color: theme.colors.green[500] }]}>
                Completed
              </Text>
            </View>
          ) : null}

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
            <Text style={[styles.metaText, { color: theme.colors.textPrimary }]}>
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

        {mission.status !== "completed" ? (
          <Text style={[styles.timerHint, { color: theme.colors.textSecondary }]}>
            {isTimerUp
              ? "Timer depleted. No reserve fuel after zero. Cancel this mission or go back."
              : mission.status === "in_progress"
                ? completeSheetOpen
                  ? "Timer paused while you save your moment."
                  : `Stay with it until done. Reserve fuel is capped at ${MAX_RESERVE_FUEL_MINUTES} min total.`
                : "Ready when you are."}
          </Text>
        ) : null}

        {mission.status === "in_progress" && (
          <View style={styles.progressBarWrap}>
            <MiniMissionFireProgressBar
              progress={isTimerUp ? 1 : missionFuelProgress}
              isDark={isDark}
              showCompleteEffect={isTimerUp}
            />
          </View>
        )}

        {mission.status === "completed" ? (
          <MiniVisibilityRow
            theme={theme}
            visibility={mission.visibility ?? "solo"}
            onChange={handleVisibilityChange}
            showToggle={
              !(
                (mission.visibility ?? "solo") === "solo" &&
                mission.communityFeedRevoked
              )
            }
          />
        ) : null}

        <View style={styles.actions}>
          {mission.status !== "in_progress" &&
            mission.status !== "completed" &&
            mission.status !== "cancelled" && (
              <Button title="Start Now" onPress={handleStart} />
            )}

          {mission.status === "in_progress" && !isTimerUp && (
            <>
              <Button
                title="Mark Complete"
                onPress={() => {
                  setTimerFrozenAtMs(Date.now());
                  setCompleteSheetOpen(true);
                }}
              />
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
              <Button title="Retry mission" onPress={handleRetryFailed} />
            </>
          )}

          {mission.status === "completed" && (
            <>
              {/* Achievement stats */}
              <View style={styles.completedRow}>
                <Check size={18} color={theme.colors.green[500]} />
                <Text style={[styles.completedText, { color: theme.colors.green[500] }]}>
                  Mini mission completed
                </Text>
              </View>

              {earlyFinishMs > 0 && (
                <View style={[styles.rewardCard, { borderRadius: theme.radius.md }]}>
                  <View style={styles.rewardHeader}>
                    <Flame size={18} color="#f59e0b" fill="#fde68a" />
                    <Text style={[styles.rewardTitle, { color: theme.colors.yellow[400] }]}>
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

              {/* Moment captured */}
              {(mission.completionMemory?.imageUrl ||
                mission.completionMemory?.imageUri ||
                mission.completionMemory?.note) && (
                <View style={styles.completionMomentSection}>
                  <View style={styles.completionMomentHead}>
                    <Sparkles size={16} color={theme.colors.amber[500]} />
                    <Text style={[styles.completionMomentTitle, { color: theme.colors.textPrimary }]}>
                      Your moment
                    </Text>
                  </View>
                  {completionImageUri ? (
                    <Pressable
                      onPress={() => setCompletionImageOpen(true)}
                      accessibilityRole="button"
                      accessibilityLabel="View moment photo"
                      style={({ pressed }) => [{ opacity: pressed ? 0.92 : 1 }]}
                    >
                      <View
                        style={[
                          styles.completionImageWrap,
                          {
                            borderColor: theme.colors.border,
                            backgroundColor: theme.colors.surfaceElevated,
                          },
                          completionImageAspect != null ? { aspectRatio: completionImageAspect } : null,
                        ]}
                      >
                        <Image
                          source={{ uri: completionImageUri }}
                          style={styles.completionImage}
                          resizeMode="cover"
                          onLoad={(e) => {
                            const w = e.nativeEvent.source?.width;
                            const h = e.nativeEvent.source?.height;
                            if (typeof w === "number" && typeof h === "number" && w > 0 && h > 0) {
                              setCompletionImageAspect(w / h);
                            }
                          }}
                        />
                      </View>
                    </Pressable>
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
                      <Text style={[styles.completionNoteText, { color: theme.colors.textPrimary }]}>
                        {mission.completionMemory.note}
                      </Text>
                    </View>
                  ) : null}
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
        {mission.status === "in_progress" && !isTimerUp && !completeSheetOpen && (
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
                {" · "}
                {QUOTES[quoteIdx].author}
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
      </ScrollView>

      {completionImageUri ? (
        <Modal
          visible={completionImageOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setCompletionImageOpen(false)}
        >
          <Pressable style={styles.viewerBackdrop} onPress={() => setCompletionImageOpen(false)}>
            <Pressable style={styles.viewerInner} onPress={(e) => e.stopPropagation()}>
              <Image source={{ uri: completionImageUri }} style={styles.viewerImg} resizeMode="contain" />
              <Pressable
                onPress={() => setCompletionImageOpen(false)}
                style={[styles.viewerClose, { backgroundColor: theme.colors.surface }]}
                accessibilityRole="button"
                accessibilityLabel="Close photo"
              >
                <CircleX size={22} color={theme.colors.textPrimary} />
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}
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
  scroll: { flex: 1 },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    maxWidth: "100%",
    gap: 8,
    marginBottom: 12,
  },
  title: { flexShrink: 1, fontWeight: "800" },
  infoButton: {
    width: 24,
    height: 24,
    justifyContent: "center",
    alignItems: "center",
    transform: [{ translateY: 3 }],
  },
  timerHint: { textAlign: "center", marginTop: 4, marginBottom: 4, paddingHorizontal: 4 },
  topPillsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginTop: 12,
    marginBottom: 10,
  },
  completedPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 9999,
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  completedPillText: { fontWeight: "800", fontSize: 13, letterSpacing: 0.2 },
  metaPill: {
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
  progressBarWrap: { marginBottom: 24 },
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
    width: "92%",
    alignSelf: "center",
    maxWidth: 380,
    maxHeight: 260,
  },
  completionImage: { ...StyleSheet.absoluteFillObject },
  completionNoteBox: { borderRadius: 14, borderWidth: 1, padding: 14 },
  completionNoteText: { fontSize: 15, lineHeight: 22 },
  viewerBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.85)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 18,
  },
  viewerInner: {
    width: "100%",
    maxWidth: 520,
    alignItems: "center",
    justifyContent: "center",
  },
  viewerImg: { width: "100%", height: 420 },
  viewerClose: {
    position: "absolute",
    top: 12,
    right: 12,
    width: 42,
    height: 42,
    borderRadius: 9999,
    alignItems: "center",
    justifyContent: "center",
  },
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
