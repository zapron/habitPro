import { Text } from "../../src/components/AppText";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { View,
  ScrollView,
  TouchableOpacity,
  Pressable,
  Modal,
  TextInput,
  StyleSheet,
  StatusBar,
  Animated,
  Easing,
  LayoutChangeEvent,
  Switch,
  ActivityIndicator,
  InteractionManager,
  Platform,
} from "react-native";
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Trash2, Lock, RotateCcw, Star, Plane, Gamepad2, Globe, User, Users, Info, Bell } from 'lucide-react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { useHabitStore } from '../../src/store/habitStore';
import { useShallow } from 'zustand/react/shallow';
import { Button } from '../../src/components/Button';
import { Timer } from '../../src/components/Timer';
import { QuoteCard } from '../../src/components/QuoteCard';
import { Screen } from '../../src/components/Screen';
import { ConfirmDialog } from '../../src/components/ConfirmDialog';
import {
    OperationProgressDialog,
    type OperationProgressStep,
} from '../../src/components/OperationProgressDialog';
import { useTheme } from '../../src/context/ThemeContext';
import { useToast } from '../../src/context/ToastContext';
import { useReducedMotion } from '../../src/hooks/useReducedMotion';
import { subscribeSyncFailure, subscribeSyncSuccess } from '../../src/lib/syncQueue';
import { backOrReplace } from '../../src/lib/navigation';
import type { MissionVisibility } from '../../src/types/habit';
import { ConfettiBurst } from '../../src/components/ConfettiBurst';
import { StreakBanner } from '../../src/components/StreakBanner';
import {
  calendarDateForHabitMissionDayIndex,
  calendarDayEndUtcMsForDateKey,
  getHabitActiveMissionDaySlot,
  getHabitActiveMissionDayEndMs,
  getHabitMissionTimeZone,
  isHabitCalendarDateToggleable,
  MS_PER_MISSION_DAY,
  missionDayNumberForCalendarDate,
  usesCalendarDayMission,
} from '../../src/utils/missionDaySlots';
import { isMissionGridFull } from '../../src/utils/habitDerived';
import { shouldShowMainMissionTimer } from '../../src/utils/mainMissionUi';
import { getEligibleStreakRepair } from "../../src/utils/streakRepairEligibility";
import { StreakMemorySheet } from '../../src/components/StreakMemorySheet';
import { StreakMemoryGallery } from '../../src/components/StreakMemoryGallery';
import { GroupChallengeSheet } from '../../src/components/GroupChallengeSheet';
import { MissionDetailsSheet } from '../../src/components/MissionDetailsSheet';
import { StreakRepairSheet } from "../../src/components/StreakRepairSheet";
import { LazyMount } from '../../src/components/LazyMount';
import type { StreakMemory } from '../../src/types/habit';
import {
    canUseStreakMemoryUpload,
    deleteHabitStreakMemoryImages,
    shouldUploadLocalStreakImage,
    uploadHabitStreakMemoryImage,
} from '../../src/lib/streakMemoryStorage';
import { useAuth } from '../../src/context/AuthContext';
import { usePremium } from '../../src/context/PremiumContext';
import { usePlusUpsell } from '../../src/context/PlusUpsellContext';
import { useRefreshPremiumAccess } from "../../src/hooks/useRefreshPremiumAccess";
import { useRemoteStoreRefreshOnFocus } from "../../src/hooks/useRemoteStoreRefreshOnFocus";
import { useUsernameGate } from "../../src/context/UsernameGateContext";
import { useNotificationGate } from "../../src/context/NotificationGateContext";
import { showAppAlert } from "../../src/context/AppDialogContext";
import { isSupabaseConfigured } from '../../src/lib/env';
import {
  leaveChallengeGroup,
  listChallengeMembers,
} from '../../src/lib/groupChallengesApi';
import {
  postCommunityWin,
  deleteCommunityWin,
  deleteAllCommunityWinsForHabit,
  habitStreakCommunityWinId,
} from '../../src/lib/communityWinsApi';
import { getMyStreakRepairStatusForDay } from "../../src/lib/streakRepairApi";
import { requestRemoteSync } from "../../src/lib/syncQueue";
import { startJsStallProbe, traceSync } from "../../src/lib/jsThreadProbe";
import { waitForHabitPersistIdle } from "../../src/lib/chunkedHabitPersistStorage";

const LOCKED_CHECKIN_MSG =
    'You can only check in for the current mission day. Each day unlocks 24 hours after the mission started (day 2 after the first 24 hours, and so on).';

const OPERATION_STEP_DELAY_MS = 360;
const OPERATION_FINAL_DELAY_MS = 220;
const POST_OPERATION_BACKGROUND_DELAY_MS = 1600;
const INITIAL_GRID_RENDER_DAYS = 49;
const GRID_RENDER_BATCH_DAYS = 35;
const GRID_RENDER_BATCH_DELAY_MS = 70;

function habitMemoryDateKeysForCleanup(habit: {
    completedDates?: string[];
    repairedDates?: string[];
    streakMemories?: Record<string, unknown>;
}): string[] {
    return [
        ...new Set([
            ...Object.keys(habit.streakMemories ?? {}),
            ...(habit.completedDates ?? []),
            ...(habit.repairedDates ?? []),
        ]),
    ];
}
const HEAVY_MOMENTS_THRESHOLD = 12;

function runAfterSettledInteractions(task: () => void, delayMs = POST_OPERATION_BACKGROUND_DELAY_MS) {
    setTimeout(() => {
        InteractionManager.runAfterInteractions(() => {
            setTimeout(task, 0);
        });
    }, delayMs);
}

function waitForOperationStep(ms = OPERATION_STEP_DELAY_MS): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatUnlockDuration(ms: number): string {
    const totalMinutes = Math.max(0, Math.ceil(ms / 60000));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours <= 0) return `${minutes}m`;
    if (minutes === 0) return `${hours}h`;
    return `${hours}h ${minutes}m`;
}

type MissionDialogState =
    | { kind: 'none' }
    | { kind: 'reset' }
    | { kind: 'delete' }
    | { kind: 'leaveGroup' }
    | { kind: 'blockedReset' }
    | { kind: 'signInRequired' };

type OperationProgressState = {
    title: string;
    message?: string;
    steps: OperationProgressStep[];
    activeStep: number;
    error?: string | null;
};

const MISSION_DELETE_STEPS: OperationProgressStep[] = [
    { label: 'Removing mission', description: 'Taking it out of your active list.' },
    { label: 'Saving changes', description: 'Updating this device safely.' },
    { label: 'Syncing cloud', description: 'Queueing backend cleanup.' },
    { label: 'Finalizing', description: 'Returning you to Home.' },
];

const GROUP_LEAVE_STEPS: OperationProgressStep[] = [
    { label: 'Leaving squad', description: 'Removing you from the group mission.' },
    { label: 'Removing mission', description: 'Taking it out of your active list.' },
    { label: 'Syncing cloud', description: 'Queueing related cleanup.' },
    { label: 'Finalizing', description: 'Returning you to Home.' },
];

function getMilestones(totalDays: number, _mode: string): number[] {
    const days = Math.max(1, Math.floor(totalDays));
    const markers: number[] = [];
    for (let day = 7; day <= days; day += 7) markers.push(day);
    return markers;
}

const HabitGridBrandRing = React.memo(function HabitGridBrandRing({
    day,
    variant,
    isMilestone,
    hasMomentMedia = false,
    repaired = false,
    repairSource,
}: {
    day: number;
    variant: 'completed' | 'current';
    isMilestone: boolean;
    hasMomentMedia?: boolean;
    repaired?: boolean;
    repairSource?: 'squad' | 'solo';
}) {
    const { theme, isDark } = useTheme();
    const c = 21;
    const outerR = 17.5;
    const innerR = 14.1;
    const outerCirc = 2 * Math.PI * outerR;
    const innerCirc = 2 * Math.PI * innerR;
    const current = variant === 'current';
    const strokeOpacity = current ? 0.72 : 1;
    const track = isDark ? 'rgba(148, 163, 184, 0.24)' : 'rgba(100, 116, 139, 0.18)';

    return (
        <View style={styles.brandRingWrap}>
            <Svg width="100%" height="100%" viewBox="0 0 42 42" style={StyleSheet.absoluteFill}>
                <G transform={`rotate(-92 ${c} ${c})`}>
                    <Circle cx={c} cy={c} r={outerR} stroke={track} strokeWidth={3.6} fill="none" />
                    <Circle
                        cx={c}
                        cy={c}
                        r={outerR}
                        stroke={theme.colors.cyan[400]}
                        strokeWidth={3.8}
                        fill="none"
                        strokeLinecap="round"
                        strokeOpacity={strokeOpacity}
                        strokeDasharray={`${outerCirc * 0.58} ${outerCirc}`}
                        strokeDashoffset={outerCirc * 0.02}
                    />
                    <Circle
                        cx={c}
                        cy={c}
                        r={innerR}
                        stroke={theme.colors.indigo[500]}
                        strokeWidth={3.8}
                        fill="none"
                        strokeLinecap="round"
                        strokeOpacity={strokeOpacity}
                        strokeDasharray={`${innerCirc * 0.62} ${innerCirc}`}
                        strokeDashoffset={-innerCirc * 0.24}
                    />
                    <Circle
                        cx={c}
                        cy={c}
                        r={outerR}
                        stroke={isMilestone ? theme.colors.yellow[400] : theme.colors.amber[500]}
                        strokeWidth={3.8}
                        fill="none"
                        strokeLinecap="round"
                        strokeOpacity={current ? 0.68 : 1}
                        strokeDasharray={`${outerCirc * 0.16} ${outerCirc}`}
                        strokeDashoffset={-outerCirc * 0.72}
                    />
                </G>
            </Svg>
            <View
                style={[
                    styles.brandRingCore,
                    {
                        backgroundColor: isDark ? '#0b1020' : '#ffffff',
                        borderColor: current ? theme.colors.cyan[400] : theme.colors.border,
                    },
                ]}
            >
                <Text
                    style={[
                        styles.brandRingDayText,
                        { color: current ? theme.colors.cyan[400] : theme.colors.textPrimary },
                        day >= 10 && styles.brandRingDayTextTwoDigit,
                    ]}
                >
                    {day}
                </Text>
            </View>
            {isMilestone ? (
                <Star size={8} color={theme.colors.yellow[400]} fill={theme.colors.yellow[400]} style={styles.brandRingAccent} />
            ) : current ? (
                <Star size={8} color={theme.colors.cyan[400]} style={styles.brandRingAccent} />
            ) : null}
            {hasMomentMedia ? (
                <View style={[styles.memoryDot, { backgroundColor: theme.colors.amber[500], borderColor: theme.colors.surface }]} />
            ) : null}
            {repaired ? (
                <View
                    style={[
                        styles.repairDot,
                        {
                            backgroundColor: repairSource === 'solo' ? theme.colors.amber[500] : theme.colors.cyan[400],
                            borderColor: theme.colors.surface,
                        },
                    ]}
                />
            ) : null}
        </View>
    );
});

const AnimatedDayCell = React.memo(function AnimatedDayCell({
    day,
    dayIndex,
    isCompleted,
    isMilestone,
    isCurrentMissionDay,
    locked,
    canInteract,
    hasStreakRecord,
    hasMomentMedia,
    repaired,
    repairSource,
    onPress,
    isSheetOpen,
    optimizeForScroll,
}: {
    day: number;
    dayIndex: number;
    isCompleted: boolean;
    isMilestone: boolean;
    isCurrentMissionDay: boolean;
    locked: boolean;
    canInteract: boolean;
    hasStreakRecord: boolean;
    hasMomentMedia: boolean;
    repaired: boolean;
    repairSource?: "squad" | "solo";
    onPress: (dayIndex: number, day: number) => void;
    isSheetOpen: boolean;
    optimizeForScroll: boolean;
}) {
    const { theme, isDark } = useTheme();
    const reduceMotion = useReducedMotion();
    const scale = useRef(new Animated.Value(1)).current;
    const shimmer = useRef(new Animated.Value(0)).current;
    const todayPulse = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        if (reduceMotion || !(isCurrentMissionDay && !isCompleted) || isSheetOpen) {
            todayPulse.stopAnimation();
            todayPulse.setValue(1);
            return undefined;
        }
        const loop = Animated.loop(
            Animated.sequence([
                Animated.timing(todayPulse, { toValue: 1.06, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
                Animated.timing(todayPulse, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
            ]),
        );
        loop.start();
        return () => loop.stop();
    }, [reduceMotion, isCurrentMissionDay, isCompleted, todayPulse, isSheetOpen]);

    useEffect(() => {
        if (reduceMotion || optimizeForScroll || !(isMilestone && isCompleted)) return;
        const loop = Animated.loop(
            Animated.sequence([
                Animated.timing(shimmer, { toValue: 1, duration: 2000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
                Animated.timing(shimmer, { toValue: 0, duration: 2000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
            ]),
        );
        loop.start();
        return () => loop.stop();
    }, [reduceMotion, optimizeForScroll, isMilestone, isCompleted, shimmer]);

    // ── Touch-down: instant scale shrink + haptic (fires the MOMENT finger touches) ──
    const handlePressIn = useCallback(() => {
        // Stop pulse animation instantly to free up CPU thread for render frame
        todayPulse.stopAnimation();
        todayPulse.setValue(1);

        // Instant scale-down on touch
        Animated.spring(scale, { toValue: 0.82, tension: 250, friction: 6, useNativeDriver: true }).start();

        // Instantly play light touch haptic
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }, [scale, todayPulse]);

    // ── Touch-up: bounce back to normal scale ──
    const handlePressOut = useCallback(() => {
        Animated.spring(scale, { toValue: 1, tension: 200, friction: 5, useNativeDriver: true }).start();
    }, [scale]);

  const handlePress = useCallback(() => {
    onPress(dayIndex, day);
  }, [onPress, dayIndex, day]);

    const shimmerOpacity = shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] });

    const dayButtonStyle = [
        styles.dayButton,
        isCompleted
            ? [
                styles.dayButtonCompleted,
                {
                    backgroundColor: isDark ? 'rgba(79, 70, 229, 0.12)' : 'rgba(99, 102, 241, 0.08)',
                    borderColor: isMilestone ? theme.colors.amber[500] : theme.colors.indigo[500],
                    ...(optimizeForScroll ? {} : theme.shadow.glow),
                },
            ]
            : [styles.dayButtonIncomplete, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }],
        isCompleted && isMilestone && !optimizeForScroll && styles.dayButtonMilestone,
        isCurrentMissionDay && !isCompleted && { borderColor: theme.colors.cyan[400], borderWidth: 2 },
        locked && styles.dayButtonFuture,
    ];

    const animatedScale = isCurrentMissionDay && !isCompleted ? Animated.multiply(scale, todayPulse) : scale;

    return (
        <Animated.View
            style={[
                styles.dayCellFrame,
                optimizeForScroll && isCompleted && ({ shouldRasterizeIOS: true } as any),
                { transform: [{ scale: animatedScale as any }] },
            ]}
        >
            <TouchableOpacity
                onPressIn={handlePressIn}
                onPressOut={handlePressOut}
                onPress={handlePress}
                style={dayButtonStyle}
                activeOpacity={0.8}
                delayPressIn={0}
                disabled={!(canInteract || (isCompleted && hasStreakRecord))}
            >
                {isCompleted ? (
                    <Animated.View style={[styles.badgeWrap, isMilestone && { opacity: shimmerOpacity }]}>
                        <HabitGridBrandRing
                            day={day}
                            variant="completed"
                            isMilestone={isMilestone}
                            hasMomentMedia={hasMomentMedia}
                            repaired={repaired}
                            repairSource={repairSource}
                        />
                    </Animated.View>
                ) : locked ? (
                    <Lock size={15} color={theme.colors.textMuted} />
                ) : isCurrentMissionDay ? (
                    <Text style={[styles.dayText, styles.currentDayText, { color: theme.colors.cyan[400] }]}>{day}</Text>
                ) : (
                    <Text style={[styles.dayText, isCurrentMissionDay ? { color: theme.colors.cyan[400] } : { color: theme.colors.textMuted }]}>{day}</Text>
                )}
            </TouchableOpacity>
        </Animated.View>
    );
});

function isValidHHMM(v: string): boolean {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(v.trim());
}

export default function HabitDetail() {
    const { id } = useLocalSearchParams<{ id?: string | string[] }>();
    const { repair, repairDate } = useLocalSearchParams<{ repair?: string; repairDate?: string }>();
    const router = useRouter();
    const { theme, isDark } = useTheme();
    const insets = useSafeAreaInsets();
    const { showToast } = useToast();
    const { session } = useAuth();
    useRemoteStoreRefreshOnFocus();
    const { isPremium, loading: premiumLoading } = usePremium();
    const { openUpsell } = usePlusUpsell();
    const refreshPremiumAccess = useRefreshPremiumAccess();
    const { requireUsername } = useUsernameGate();
    const { requireNotifications } = useNotificationGate();
    const socialLocked = !isPremium || premiumLoading;
    const habitId = Array.isArray(id) ? id[0] : id;

    const { habit, toggleCompletion, setStreakMemory, patchStreakMemory, resetHabit, deleteHabit, setHabitVisibility, setMissionReport } = useHabitStore(
      useShallow((state) => ({
        habit: habitId ? state.getHabit(habitId) : undefined,
        toggleCompletion: state.toggleCompletion,
        setStreakMemory: state.setStreakMemory,
        patchStreakMemory: state.patchStreakMemory,
        resetHabit: state.resetHabit,
        deleteHabit: state.deleteHabit,
        setHabitVisibility: state.setHabitVisibility,
        setMissionReport: state.setMissionReport,
      })),
    );

    const lastVisibilityRef = useRef<{ id: string; prev: MissionVisibility } | null>(null);
    const [visibilityBusy, setVisibilityBusy] = useState(false);
    const [optimisticMissionVisibility, setOptimisticMissionVisibility] = useState<MissionVisibility | null>(null);

    useEffect(() => {
        const unsubFail = subscribeSyncFailure(() => {
            const p = lastVisibilityRef.current;
            if (!p || !habitId || p.id !== habitId) return;
            setHabitVisibility(p.id, p.prev);
            lastVisibilityRef.current = null;
        });
        const unsubOk = subscribeSyncSuccess(() => {
            lastVisibilityRef.current = null;
        });
        return () => {
            unsubFail();
            unsubOk();
        };
    }, [habitId, setHabitVisibility]);

    useEffect(() => {
        return () => {
            lastVisibilityRef.current = null;
        };
    }, []);

    useEffect(() => {
        setOptimisticMissionVisibility(null);
    }, [habit?.id, habit?.visibility]);

    const mode = habit?.mode ?? 'autopilot';
    const totalDays = habit?.totalDays ?? 21;
    const milestones = useMemo(() => getMilestones(totalDays, mode), [totalDays, mode]);

    const missionEndMs = useMemo(() => {
        if (!habit) return undefined;
        if (mode === 'manual' && habit.endDate) return undefined; // Timer handles endDate itself
        if (usesCalendarDayMission(habit)) {
            const tz = getHabitMissionTimeZone(habit);
            const lastDayKey = calendarDateForHabitMissionDayIndex(habit, totalDays - 1, Date.now());
            return calendarDayEndUtcMsForDateKey(lastDayKey, tz);
        }
        // autopilot: fixed-length from startDate
        return new Date(habit.startDate).getTime() + totalDays * MS_PER_MISSION_DAY;
    }, [habit, mode, totalDays]);

    const [confetti, setConfetti] = useState<{ active: boolean; milestone: boolean; x: number; y: number }>({ active: false, milestone: false, x: 0, y: 0 });
    const gridRef = useRef<View>(null);
    const [gridLayout, setGridLayout] = useState({ x: 0, y: 0 });
    const [now, setNow] = useState(() => Date.now());
    type MemoryUiState =
        | { kind: 'create'; dateStr: string; day: number; dayIndex: number }
        | { kind: 'view'; memory: StreakMemory; dateStr: string; day: number }
        | null;
    const [memoryUi, setMemoryUi] = useState<MemoryUiState>(null);
    const [acceptedGroupMemberCount, setAcceptedGroupMemberCount] = useState<number>(0);
    const [groupSheetOpen, setGroupSheetOpen] = useState(false);
    const [missionDetailsOpen, setMissionDetailsOpen] = useState(false);
    const [missionDialog, setMissionDialog] = useState<MissionDialogState>({ kind: 'none' });
    const [operationProgress, setOperationProgress] = useState<OperationProgressState | null>(null);
    const [habitCommunityBusy, setHabitCommunityBusy] = useState(false);
    /** Keeps the Community Switch visually ON while publish is in flight (controlled `posted` is still false). */
    const [habitCommunityPublishPending, setHabitCommunityPublishPending] = useState(false);
    /** Avoid Mission not found flash after delete/leave; store clears before navigation finishes. */
    const [pendingExitAfterRemove, setPendingExitAfterRemove] = useState(false);
    const [detailHeavyContentReady, setDetailHeavyContentReady] = useState(false);
    const [visibleGridDayCount, setVisibleGridDayCount] = useState(INITIAL_GRID_RENDER_DAYS);

    const [reminderEditorOpen, setReminderEditorOpen] = useState(false);
    const [reminderDraft, setReminderDraft] = useState("21:00");
    const [reminderLockPending, setReminderLockPending] = useState<string | null>(null);

    const eligibleRepair = useMemo(() => {
      if (!habit) return null;
      return getEligibleStreakRepair(habit, now);
    }, [habit, now]);
    const [repairSheetOpen, setRepairSheetOpen] = useState(false);
    const [repairStatus, setRepairStatus] = useState<"pending" | "approved" | "declined" | "applied" | null>(null);
    const isLoneGroupMission = Boolean(habit?.challengeGroupId && acceptedGroupMemberCount === 1);
    const pendingRepairCanFinalize = Boolean(repairStatus === "pending" && isLoneGroupMission);

    const [isPreMounted, setIsPreMounted] = useState(false);
    useEffect(() => {
        const timer = setTimeout(() => setIsPreMounted(true), 300);
        return () => clearTimeout(timer);
    }, []);

    const openRepair = useCallback(async () => {
        if (!eligibleRepair || (repairStatus === "pending" && !pendingRepairCanFinalize)) return;
        const isGroupRepair = Boolean(habit?.challengeGroupId);
        if (isGroupRepair) {
          const freshPremium = await refreshPremiumAccess({ serverOnly: true, cachedAccessOk: true });
          if (freshPremium !== true) {
            openUpsell("streak_repair");
            return;
          }
        }
        setRepairSheetOpen(true);
    }, [eligibleRepair, repairStatus, pendingRepairCanFinalize, habit?.challengeGroupId, openUpsell, refreshPremiumAccess]);

    useEffect(() => {
      if (repair !== "1") return;
      if (!eligibleRepair) return;
      if (repairStatus === "applied") return;
      if (typeof repairDate === "string" && repairDate.length > 0 && repairDate !== eligibleRepair.dateStr) {
        return;
      }
      void openRepair();
    }, [repair, repairDate, eligibleRepair, repairStatus, openRepair]);

    useEffect(() => {
      if (!eligibleRepair || !habit) {
        setRepairStatus(null);
        return;
      }
      let cancelled = false;
      void getMyStreakRepairStatusForDay({ habitId: habit.id, dateStr: eligibleRepair.dateStr })
        .then((res) => {
          if (cancelled) return;
          if (res.ok) setRepairStatus(res.status);
        })
        .catch(() => {
          if (!cancelled) setRepairStatus(null);
        });
      return () => {
        cancelled = true;
      };
    }, [eligibleRepair?.dateStr, habit?.id]);

    useEffect(() => {
      if (repairStatus === "pending" && isLoneGroupMission) {
        setRepairStatus(null);
      }
    }, [repairStatus, isLoneGroupMission]);

    useEffect(() => {
      if (!habit) return;
      const current = typeof habit.reminderTimeLocal === "string" ? habit.reminderTimeLocal : "21:00";
      setReminderDraft(current);
    }, [habit?.id, habit?.reminderTimeLocal]);

    const reminderIsLocked = Boolean(habit?.reminderLocked);
    const pendingMemoryRef = useRef<{ dateStr: string; day: number; dayIndex: number } | null>(null);

    useEffect(() => {
        const tick = habit && !habit.isCompleted ? 30_000 : 60_000;
        const t = setInterval(() => setNow(Date.now()), tick);
        return () => clearInterval(t);
    }, [habit?.id, habit?.isCompleted]);

    useFocusEffect(
        useCallback(() => {
            setNow(Date.now());
            let timer: ReturnType<typeof setTimeout> | null = null;
            const task = InteractionManager.runAfterInteractions(() => {
                timer = setTimeout(() => {
                    void refreshPremiumAccess({ serverOnly: true, cachedAccessOk: true, background: true });
                }, 300);
            });
            return () => {
                if (timer) clearTimeout(timer);
                task.cancel?.();
            };
        }, [refreshPremiumAccess]),
    );

    const completedDateSet = useMemo(() => new Set(habit?.completedDates ?? []), [habit?.completedDates]);
    const milestoneSet = useMemo(() => new Set(milestones), [milestones]);
    const repairedDateSet = useMemo(() => new Set(habit?.repairedDates ?? []), [habit?.repairedDates]);
    const streakMemoryCount = useMemo(() => Object.keys(habit?.streakMemories ?? {}).length, [habit?.streakMemories]);
    const shouldDeferHeavyMissionContent =
        totalDays > INITIAL_GRID_RENDER_DAYS || streakMemoryCount > HEAVY_MOMENTS_THRESHOLD;
    const initialGridDayCount = Math.min(totalDays, shouldDeferHeavyMissionContent ? INITIAL_GRID_RENDER_DAYS : totalDays);

    useFocusEffect(
        useCallback(() => {
            let cancelled = false;
            let task: { cancel?: () => void } | null = null;

            setVisibleGridDayCount(initialGridDayCount);

            if (!shouldDeferHeavyMissionContent) {
                setDetailHeavyContentReady(true);
                return () => {
                    cancelled = true;
                };
            }

            setDetailHeavyContentReady(false);
            task = InteractionManager.runAfterInteractions(() => {
                if (cancelled) return;
                setVisibleGridDayCount(initialGridDayCount);
                setDetailHeavyContentReady(true);
            });

            return () => {
                cancelled = true;
                task?.cancel?.();
            };
        }, [habitId, initialGridDayCount, shouldDeferHeavyMissionContent]),
    );

    useEffect(() => {
        if (!detailHeavyContentReady || visibleGridDayCount >= totalDays) return undefined;
        const timer = setTimeout(() => {
            setVisibleGridDayCount((prev) => Math.min(totalDays, prev + GRID_RENDER_BATCH_DAYS));
        }, GRID_RENDER_BATCH_DELAY_MS);
        return () => clearTimeout(timer);
    }, [detailHeavyContentReady, totalDays, visibleGridDayCount]);

    const memoryGalleryEntries = useMemo(() => {
        if (!habit || !detailHeavyContentReady || visibleGridDayCount < totalDays) return [];
        const raw = habit.streakMemories ?? {};
        return Object.entries(raw)
            .filter(([, memory]) => {
                if (memory.checkInOnly) {
                    return Boolean(memory.note?.trim() || memory.imageUrl || memory.imageUri);
                }
                return true;
            })
            .map(([dateStr, memory]) => ({
                dateStr,
                memory,
                missionDay: missionDayNumberForCalendarDate(habit, dateStr),
            }))
            .sort((a, b) => (a.dateStr < b.dateStr ? 1 : -1));
    }, [detailHeavyContentReady, habit, totalDays, visibleGridDayCount]);

    const showMissionReportInsteadOfTimer = useMemo(() => {
        if (!habit) return false;
        return !shouldShowMainMissionTimer(habit, now);
    }, [habit, now]);

    const isManual = mode === 'manual';
    const activeMissionDaySlot = habit ? getHabitActiveMissionDaySlot(habit, now) : null;
    const useActiveTrailGrid = totalDays > INITIAL_GRID_RENDER_DAYS;
    const activeTrailReachedDay = useMemo(() => {
        if (!habit) return 1;
        let reached = activeMissionDaySlot ?? 0;
        const memoryDays = Object.keys(habit.streakMemories ?? {})
            .map((dateStr) => missionDayNumberForCalendarDate(habit, dateStr, now))
            .filter((day): day is number => typeof day === 'number');
        const completedDays = (habit.completedDates ?? [])
            .map((dateStr) => missionDayNumberForCalendarDate(habit, dateStr, now))
            .filter((day): day is number => typeof day === 'number');
        for (const day of [...memoryDays, ...completedDays]) {
            reached = Math.max(reached, day);
        }
        return Math.min(totalDays, Math.max(1, reached));
    }, [activeMissionDaySlot, habit, now, totalDays]);
    const activeTrailDays = useMemo(
        () => Array.from({ length: activeTrailReachedDay }, (_, i) => activeTrailReachedDay - i),
        [activeTrailReachedDay],
    );
    const activeTrailRemainingDays = Math.max(0, totalDays - activeTrailReachedDay);
    const activeMissionDayEndMs = habit ? getHabitActiveMissionDayEndMs(habit, now) : null;
    const activeTrailUnlockCopy = useMemo(() => {
        if (!useActiveTrailGrid) return null;
        if (activeMissionDaySlot == null) {
            return activeTrailRemainingDays === 0 ? 'Full journey complete.' : 'No marker is open right now.';
        }
        if (activeMissionDaySlot >= totalDays) {
            return 'Final marker is open now.';
        }
        if (activeMissionDayEndMs && activeMissionDayEndMs > now) {
            return `Day ${activeMissionDaySlot + 1} opens in ${formatUnlockDuration(activeMissionDayEndMs - now)}`;
        }
        return `Day ${activeMissionDaySlot + 1} opens soon`;
    }, [
        activeMissionDayEndMs,
        activeMissionDaySlot,
        activeTrailRemainingDays,
        now,
        totalDays,
        useActiveTrailGrid,
    ]);

    const fireCompletionCelebration = useCallback(
        (dayIndex: number, day: number, isMilestone: boolean) => {
            const visualIndex = useActiveTrailGrid ? Math.max(0, activeTrailReachedDay - day) : dayIndex;
            const col = visualIndex % 7;
            const row = Math.floor(visualIndex / 7);
            const cellSize = 50;
            const x = col * cellSize + cellSize / 2;
            const y = row * cellSize + cellSize / 2;
            setConfetti({ active: false, milestone: false, x: 0, y: 0 });
            setTimeout(() => {
                setConfetti({ active: true, milestone: isMilestone, x, y });
            }, 50);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        },
        [activeTrailReachedDay, useActiveTrailGrid],
    );

    const handleMemoryCommit = useCallback(
        async (memory: StreakMemory | null, meta?: { publishToCommunity?: boolean }) => {
            const ctx = pendingMemoryRef.current;
            if (!ctx || !habit) return;

            // Only block on the image upload when publishing to Community (which needs
            // the remote URL). For private check-ins we save the local imageUri and let
            // the background sync upload it (scheduleHabitMemoryUpload), so the
            // celebration fires instantly instead of waiting on the network.
            const wantsUploadNow = meta?.publishToCommunity === true;
            let memoryToSave = memory;
            if (
                memory &&
                wantsUploadNow &&
                canUseStreakMemoryUpload() &&
                shouldUploadLocalStreakImage(memory.imageUri)
            ) {
                try {
                    const imageUrl = await uploadHabitStreakMemoryImage({
                        habitId: habit.id,
                        dateStr: ctx.dateStr,
                        localUri: memory.imageUri!,
                    });
                    memoryToSave = { ...memory, imageUrl, imageUri: undefined };
                } catch (e) {
                    const msg = e instanceof Error ? e.message : String(e);
                    showToast(msg, 'error');
                    throw e;
                }
            }

            const wantsPublish = meta?.publishToCommunity === true && Boolean(memoryToSave);
            if (wantsPublish && memoryToSave) {
                const hasImage = Boolean(memoryToSave.imageUrl || memoryToSave.imageUri);
                if (!hasImage) {
                    showAppAlert('Photo required', 'Community posts need a photo. Add a photo and save again to publish.', [
                        { text: 'OK' },
                    ]);
                    return;
                }
                if (isSupabaseConfigured() && session?.user) {
                    const freshPremium = await refreshPremiumAccess({ serverOnly: true, cachedAccessOk: true });
                    if (freshPremium !== true) {
                        openUpsell('community_publish');
                        return;
                    }
                }
            }

            const changed = toggleCompletion(habit.id, ctx.dateStr);
            if (!changed) {
                showToast(LOCKED_CHECKIN_MSG, 'info', 5000);
                return;
            }
            if (memoryToSave) {
                setStreakMemory(habit.id, ctx.dateStr, memoryToSave);
            } else {
                setStreakMemory(habit.id, ctx.dateStr, {
                    createdAt: new Date().toISOString(),
                    checkInOnly: true,
                });
            }
            const isMilestone = milestones.includes(ctx.day);
            fireCompletionCelebration(ctx.dayIndex, ctx.day, isMilestone);

            const wantsPublishAfterSave = meta?.publishToCommunity === true && Boolean(memoryToSave);
            if (wantsPublishAfterSave && memoryToSave) {
                if (!isSupabaseConfigured()) {
                    showAppAlert(
                        'Can’t publish',
                        'Cloud sync isn’t configured. Your moment is saved; Community wasn’t updated.',
                        [{ text: 'OK' }],
                    );
                    return;
                }
                if (!session?.user) {
                    showAppAlert(
                        'Sign in to publish',
                        'Sign in to share this moment in Community. Your check-in is saved.',
                        [{ text: 'OK' }],
                    );
                    return;
                }
                const winId = habitStreakCommunityWinId(habit.id, ctx.dateStr);
                const streakAfter = useHabitStore.getState().getHabit(habit.id)?.streak ?? 1;
                const ok = await requireUsername("community_post");
                if (!ok) {
                    showAppAlert('Username required', 'Choose a username to publish to Community.', [{ text: 'OK' }]);
                    return;
                }
                const res = await postCommunityWin({
                    miniMissionId: winId,
                    title: habit.title,
                    completedAt: memoryToSave.createdAt,
                    memoryNote: memoryToSave.note ?? null,
                    memoryImageUrl: memoryToSave.imageUrl ?? null,
                    feedSource: "habit_streak",
                    streakMissionDay: ctx.day,
                    streakCountAtPost: streakAfter,
                });
                if (res.ok === true) {
                    patchStreakMemory(habit.id, ctx.dateStr, { communityPosted: true });
                } else {
                    if (res.reason === "premium_required") {
                        await refreshPremiumAccess({ force: true, serverOnly: true });
                        openUpsell('community_publish');
                        return;
                    }
                    showAppAlert('Couldn’t publish', res.error, [{ text: 'OK' }]);
                }
            }
        },
        [
            habit,
            session?.user,
            toggleCompletion,
            setStreakMemory,
            patchStreakMemory,
            milestones,
            fireCompletionCelebration,
            showToast,
            openUpsell,
            refreshPremiumAccess,
        ],
    );

    const handleHabitMemoryCommunityChange = useCallback(
        async (next: boolean, dateStr: string, day: number) => {
            if (!habitId || !habit) return;
            const mem = habit.streakMemories?.[dateStr];
            if (!mem || mem.communityFeedRevoked) return;

            if (next) {
                const freshPremium = await refreshPremiumAccess({ serverOnly: true, cachedAccessOk: true });
                if (freshPremium !== true) {
                    openUpsell('community_publish');
                    return;
                }
                if (mem.communityPosted) return;
                const hasMemoryImage = Boolean(mem.imageUrl || mem.imageUri);
                if (!hasMemoryImage) {
                    showAppAlert(
                        'Photo required',
                        'Community posts need a photo. This moment only has text, so it can’t be shared to the feed.',
                        [{ text: 'OK' }],
                    );
                    return;
                }
                if (!isSupabaseConfigured()) {
                    showAppAlert('Can’t publish', 'Cloud sync isn’t configured.', [{ text: 'OK' }]);
                    return;
                }
                if (!session?.user) {
                    showAppAlert('Sign in to publish', 'Sign in to share this moment in Community.', [{ text: 'OK' }]);
                    return;
                }
                setHabitCommunityPublishPending(true);
                setHabitCommunityBusy(true);
                try {
                    let memForPost = mem;
                    if (canUseStreakMemoryUpload() && shouldUploadLocalStreakImage(mem.imageUri)) {
                        try {
                            const imageUrl = await uploadHabitStreakMemoryImage({
                                habitId: habit.id,
                                dateStr,
                                localUri: mem.imageUri!,
                            });
                            memForPost = { ...mem, imageUrl, imageUri: undefined };
                            patchStreakMemory(habit.id, dateStr, { imageUrl, imageUri: undefined });
                        } catch (e) {
                            const msg = e instanceof Error ? e.message : String(e);
                            showToast(msg, 'error');
                            return;
                        }
                    }
                    const ok = await requireUsername("community_post");
                    if (!ok) {
                        showAppAlert('Username required', 'Choose a username to publish to Community.', [{ text: 'OK' }]);
                        return;
                    }
                    const res = await postCommunityWin({
                        miniMissionId: habitStreakCommunityWinId(habit.id, dateStr),
                        title: habit.title,
                        completedAt: memForPost.createdAt,
                        memoryNote: memForPost.note ?? null,
                        memoryImageUrl: memForPost.imageUrl ?? null,
                        feedSource: "habit_streak",
                        streakMissionDay: day,
                        streakCountAtPost: habit.streak,
                    });
                    if (res.ok === true) {
                        patchStreakMemory(habit.id, dateStr, { communityPosted: true });
                    } else {
                        if (res.reason === "premium_required") {
                            await refreshPremiumAccess({ force: true, serverOnly: true });
                            openUpsell('community_publish');
                            return;
                        }
                        showAppAlert('Couldn’t publish', res.error, [{ text: 'OK' }]);
                    }
                } finally {
                    setHabitCommunityBusy(false);
                    setHabitCommunityPublishPending(false);
                }
                return;
            }

            if (!mem.communityPosted) return;
            showAppAlert(
                'Remove from Community?',
                'This removes this moment from the feed. You won’t be able to share this check-in to Community again.',
                [
                    { text: 'Cancel', style: 'cancel' },
                    {
                        text: 'Remove',
                        style: 'destructive',
                        onPress: () => {
                            void (async () => {
                                setHabitCommunityBusy(true);
                                try {
                                    const del = await deleteCommunityWin(habitStreakCommunityWinId(habit.id, dateStr));
                                    if (del.ok === false) {
                                        showAppAlert('Couldn’t remove', del.error, [{ text: 'OK' }]);
                                        return;
                                    }
                                    patchStreakMemory(habit.id, dateStr, {
                                        communityPosted: false,
                                        communityFeedRevoked: true,
                                    });
                                } finally {
                                    setHabitCommunityBusy(false);
                                }
                            })();
                        },
                    },
                ],
            );
        },
        [habit, habitId, session?.user, patchStreakMemory, showToast, openUpsell, refreshPremiumAccess],
    );

    const configured = isSupabaseConfigured();
    const signedIn = Boolean(session?.user);

    useEffect(() => {
        if (!habit?.challengeGroupId || !configured || !signedIn) {
            setAcceptedGroupMemberCount(0);
            return;
        }
        let cancelled = false;
        void listChallengeMembers(habit.challengeGroupId)
            .then((members) => {
                if (cancelled) return;
                setAcceptedGroupMemberCount(members.length);
            })
            .catch(() => {
                if (!cancelled) setAcceptedGroupMemberCount(0);
            });
        return () => {
            cancelled = true;
        };
    }, [habit?.challengeGroupId, configured, signedIn]);

    const isGroupMission = Boolean(habit?.challengeGroupId);
    const showSquadShare = isGroupMission && acceptedGroupMemberCount >= 2 && configured && signedIn;
    const canOpenGroupMissionSheet = !showMissionReportInsteadOfTimer;

    useEffect(() => {
        if (!canOpenGroupMissionSheet && groupSheetOpen) {
            setGroupSheetOpen(false);
        }
    }, [canOpenGroupMissionSheet, groupSheetOpen]);

    const handleMissionVisibilityChange = useCallback(
        (v: boolean) => {
            if (!habit || visibilityBusy) return;
            void (async () => {
                const next: MissionVisibility = v ? 'public' : 'solo';
                const prev = habit.visibility ?? 'solo';
                if (prev === next) return;
                setOptimisticMissionVisibility(next);
                setVisibilityBusy(true);
                try {
                    if (next === 'public') {
                        const freshPremium = await refreshPremiumAccess({ serverOnly: true, cachedAccessOk: true });
                        if (freshPremium !== true) {
                            setOptimisticMissionVisibility(null);
                            openUpsell('visibility');
                            return;
                        }
                    }
                    lastVisibilityRef.current = { id: habit.id, prev };
                    setHabitVisibility(habit.id, next);
                } catch (e) {
                    setOptimisticMissionVisibility(null);
                    throw e;
                } finally {
                    setVisibilityBusy(false);
                }
            })();
        },
        [habit, visibilityBusy, refreshPremiumAccess, openUpsell, setHabitVisibility],
    );

    const openReminderEditor = useCallback(() => {
        if (!habit) return;
        const seed =
            typeof habit.reminderTimeLocal === "string" && habit.reminderTimeLocal.length > 0
                ? habit.reminderTimeLocal
                : "21:00";
        setReminderDraft(seed);
        setReminderEditorOpen(true);
    }, [habit]);

    const squadShareProp = useMemo(() => {
        if (!habit) return undefined;
        return {
            show: showSquadShare,
            visibility: habit.visibility ?? 'solo',
            onToggle: async (nextPublic: boolean) => {
                const next = nextPublic ? 'public' : 'solo';
                const prev = habit.visibility ?? 'solo';
                if (prev === next) return;
                if (next === 'public' && socialLocked) {
                    const freshPremium = await refreshPremiumAccess({ serverOnly: true, cachedAccessOk: true });
                    if (freshPremium !== true) {
                        openUpsell('visibility');
                        throw new Error('HabitPro Community is required for squad visibility.');
                    }
                }
                lastVisibilityRef.current = { id: habit.id, prev };
                setHabitVisibility(habit.id, next);
            },
        };
    }, [habit, showSquadShare, socialLocked, refreshPremiumAccess, openUpsell, setHabitVisibility]);

    const habitViewCommunityProp = useMemo(() => {
        if (!habit || !memoryUi || memoryUi.kind !== 'view') return undefined;
        const viewMem = habit.streakMemories?.[memoryUi.dateStr] ?? memoryUi.memory;
        const hasMemoryImage = Boolean(viewMem?.imageUrl || viewMem?.imageUri);
        const cloudOk = configured && session?.user != null;
        const plusOk = !socialLocked;
        return {
            posted:
                (habit.streakMemories?.[memoryUi.dateStr]?.communityPosted ??
                    memoryUi.memory.communityPosted) === true,
            revoked:
                (habit.streakMemories?.[memoryUi.dateStr]?.communityFeedRevoked ??
                    memoryUi.memory.communityFeedRevoked) === true,
            available: cloudOk && hasMemoryImage && plusOk,
            needsPhotoForCommunity: cloudOk && !hasMemoryImage,
            plusRequired: cloudOk && hasMemoryImage && !plusOk,
            busy: habitCommunityBusy,
            pendingPublish: habitCommunityPublishPending,
            onChange: (v: boolean) =>
                void handleHabitMemoryCommunityChange(v, memoryUi.dateStr, memoryUi.day),
        };
    }, [
        habit,
        memoryUi,
        configured,
        session?.user,
        socialLocked,
        habitCommunityBusy,
        habitCommunityPublishPending,
        handleHabitMemoryCommunityChange,
    ]);

    const handleReset = () => {
        if (isGroupMission) {
            setMissionDialog({ kind: 'blockedReset' });
            return;
        }
        setMissionDialog({ kind: 'reset' });
    };

    const handleDelete = () => {
        if (!habit) return;
        if (isGroupMission) {
            const challengeId = habit.challengeGroupId;
            if (!challengeId) return;
            if (!isSupabaseConfigured() || !session) {
                setMissionDialog({ kind: 'signInRequired' });
                return;
            }
            setMissionDialog({ kind: 'leaveGroup' });
            return;
        }
        setMissionDialog({ kind: 'delete' });
    };

    const days = useMemo(() => Array.from({ length: totalDays }, (_, i) => i + 1), [totalDays]);
    const visibleDays = useMemo(
        () => days.slice(0, detailHeavyContentReady ? Math.min(visibleGridDayCount, totalDays) : 0),
        [days, detailHeavyContentReady, totalDays, visibleGridDayCount],
    );
    const displayedGridDays = useActiveTrailGrid ? activeTrailDays : visibleDays;
    const optimizeGridScrollForIos = Platform.OS === 'ios' && displayedGridDays.length > INITIAL_GRID_RENDER_DAYS;

    const getDayDate = useCallback((dayIndex: number) => {
        if (!habit) return "";
        return calendarDateForHabitMissionDayIndex(habit, dayIndex, now);
    }, [habit, now]);

    const detailBottomPad = Math.max(insets.bottom, 24) + 16;

    const handleDayPress = useCallback((dayIndex: number, day: number) => {
        const currentHabit = habitId ? useHabitStore.getState().getHabit(habitId) : undefined;
        if (!currentHabit) return;

        const dateStr = calendarDateForHabitMissionDayIndex(currentHabit, dayIndex, Date.now());
        const wasCompleted = currentHabit.completedDates.includes(dateStr);
        const activeSlot = getHabitActiveMissionDaySlot(currentHabit, Date.now());
        const canInteract = activeSlot !== null && day === activeSlot;

        if (!wasCompleted) {
            if (!isHabitCalendarDateToggleable(currentHabit, dateStr, Date.now())) {
                showToast(LOCKED_CHECKIN_MSG, 'info', 5000);
                return;
            }
            pendingMemoryRef.current = { dateStr, day, dayIndex };
            setMemoryUi({ kind: 'create', dateStr, day, dayIndex });
            return;
        }

        const mem = currentHabit.streakMemories?.[dateStr];
        if (mem) {
            setMemoryUi({ kind: 'view', memory: mem, dateStr, day });
            return;
        }

        // Instead of uncompleting, open view-sheet showing "Check-in only"
        setMemoryUi({
            kind: 'view',
            memory: { createdAt: new Date().toISOString(), checkInOnly: true },
            dateStr,
            day
        });
    }, [habitId, toggleCompletion, showToast]);

    const displayedMissionVisibility = optimisticMissionVisibility ?? habit?.visibility ?? 'solo';
    const missionVisibilityIsPublic = displayedMissionVisibility === 'public';
    const reminderLockedTime =
        reminderIsLocked && habit?.reminderEnabled && typeof habit.reminderTimeLocal === "string"
            ? habit.reminderTimeLocal
            : null;
    if (!habit) {
        return (
            <Screen>
                <OperationProgressDialog
                    visible={operationProgress !== null}
                    title={operationProgress?.title ?? ""}
                    message={operationProgress?.message}
                    steps={operationProgress?.steps ?? []}
                    activeStep={operationProgress?.activeStep ?? 0}
                    error={operationProgress?.error}
                />

                <View style={styles.header}>
                    <TouchableOpacity
                        style={[styles.iconButton, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
                        onPress={() => backOrReplace(router, "/")}
                        delayPressIn={0}
                        accessibilityRole="button"
                        accessibilityLabel="Go back"
                    >
                        <ArrowLeft size={theme.icon.xl} color={theme.colors.textPrimary} />
                    </TouchableOpacity>
                </View>
                {pendingExitAfterRemove ? (
                    <View style={styles.notFoundContainer}>
                        <ActivityIndicator size="large" color={theme.colors.cyan[400]} />
                    </View>
                ) : (
                    <View style={styles.notFoundContainer}>
                        <Text style={[styles.notFoundText, { color: theme.colors.textPrimary, fontSize: theme.typography.body }]}>Mission not found</Text>
                        <Button
                            title='Go Back'
                            onPress={() => {
                                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                backOrReplace(router, "/");
                            }}
                            style={styles.notFoundButton}
                        />
                    </View>
                )}
            </Screen>
        );
    }

    return (
        <Screen>
            <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={theme.colors.background} />

            <View style={styles.header}>
                <TouchableOpacity
                    style={[styles.iconButton, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
                    onPressIn={() => {
                        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }}
                    onPress={() => {
                        backOrReplace(router, "/");
                    }}
                    delayPressIn={0}
                >
                    <ArrowLeft size={theme.icon.xl} color={theme.colors.textPrimary} />
                </TouchableOpacity>
                <View style={styles.headerActions}>
                    {canOpenGroupMissionSheet ? (
                        <TouchableOpacity
                            style={[styles.iconButton, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
                            onPress={() => setGroupSheetOpen(true)}
                            accessibilityLabel="Group mission"
                        >
                            <Users size={theme.icon.xl} color={theme.colors.cyan[400]} />
                        </TouchableOpacity>
                    ) : null}
                    {!isGroupMission ? (
                        <TouchableOpacity style={styles.resetButton} onPress={handleReset}>
                            <RotateCcw size={theme.icon.xl} color={theme.colors.amber[500]} />
                        </TouchableOpacity>
                    ) : null}
                    <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
                        <Trash2 size={theme.icon.xl} color={theme.colors.red[500]} />
                    </TouchableOpacity>
                </View>
            </View>

            <LazyMount visible={groupSheetOpen && canOpenGroupMissionSheet} unmountOnExit>
                <GroupChallengeSheet visible={groupSheetOpen && canOpenGroupMissionSheet} onClose={() => setGroupSheetOpen(false)} habit={habit} />
            </LazyMount>

            <LazyMount visible={missionDetailsOpen} unmountOnExit>
                <MissionDetailsSheet
                    variant="habit"
                    visible={missionDetailsOpen}
                    onClose={() => setMissionDetailsOpen(false)}
                    habit={habit}
                />
            </LazyMount>

            <LazyMount visible={isPreMounted} unmountOnExit={false}>
                <StreakMemorySheet
                    visible={memoryUi !== null}
                    mode={memoryUi?.kind === 'view' ? 'view' : 'create'}
                    viewMemory={
                        memoryUi?.kind === 'view'
                            ? (habit.streakMemories?.[memoryUi.dateStr] ?? memoryUi.memory)
                            : undefined
                    }
                    missionTitle={habit.title}
                    dayLabel={memoryUi ? String(memoryUi.day) : '1'}
                    habitPublishAvailable={configured && session?.user != null}
                    plusCommunityOk={!socialLocked}
                    squadShare={squadShareProp}
                    habitViewCommunity={habitViewCommunityProp}
                    onClose={() => {
                        pendingMemoryRef.current = null;
                        setMemoryUi(null);
                    }}
                    onCommit={memoryUi?.kind !== 'view' ? handleMemoryCommit : undefined}
                />
            </LazyMount>

            <ScrollView
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ paddingBottom: detailBottomPad }}
                removeClippedSubviews={optimizeGridScrollForIos}
                {...({ delaysContentTouches: false } as any)}
            >
                <View style={styles.modeRow}>
                    <View style={[styles.modeBadge, isManual && styles.modeBadgeManual]}>
                        {isManual ? <Gamepad2 size={13} color={theme.colors.amber[500]} /> : <Plane size={13} color={theme.colors.cyan[400]} />}
                        <Text style={[styles.modeBadgeText, { color: theme.colors.cyan[400] }, isManual && { color: theme.colors.amber[500] }]}>
                            {isManual ? 'MANUAL CONTROL' : 'AUTOPILOT'}
                        </Text>
                    </View>
                    <TouchableOpacity
                        style={styles.modeInfoBtn}
                        onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            setMissionDetailsOpen(true);
                        }}
                        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                        accessibilityRole="button"
                        accessibilityLabel="Mission details and brief"
                    >
                        <Info size={theme.icon.md} color={theme.colors.indigo[400]} />
                    </TouchableOpacity>
                </View>

                <Text
                    style={[
                        styles.title,
                        {
                            color: theme.colors.textPrimary,
                            fontSize: theme.typography.h1,
                            lineHeight: Math.round(theme.typography.h1 * 1.2),
                        },
                    ]}
                >
                    {habit.title}
                </Text>

                {showMissionReportInsteadOfTimer ? (
                    <View
                        style={[
                            styles.missionTimerSlot,
                            {
                                backgroundColor: theme.colors.surface,
                                borderColor:
                                    habit.missionReport === 'accomplished'
                                        ? theme.colors.green[500] + '44'
                                        : habit.missionReport === 'failed'
                                            ? theme.colors.red[500] + '44'
                                            : theme.colors.border,
                                borderRadius: theme.radius.lg,
                                ...theme.shadow.card,
                            },
                        ]}
                    >
                        <View
                            style={[
                                styles.missionLengthField,
                                { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceElevated },
                            ]}
                        >
                            <Text style={[styles.missionLengthLabel, { color: theme.colors.textSecondary }]}>Mission length</Text>
                            <Text style={[styles.missionLengthValue, { color: theme.colors.textPrimary }]}>
                                {totalDays} {totalDays === 1 ? 'day' : 'days'}
                            </Text>
                        </View>

                        {habit.missionReport === 'accomplished' ? (
                            <>
                                <Text style={[styles.missionReportTitle, { color: theme.colors.textPrimary }]}>Accomplished</Text>
                                <Text style={[styles.missionReportHint, { color: theme.colors.textSecondary }]}>
                                    You marked this mission complete after the window ended.
                                </Text>
                            </>
                        ) : habit.missionReport === 'failed' ? (
                            <>
                                <Text style={[styles.missionReportTitle, { color: theme.colors.textPrimary }]}>Failed</Text>
                                <Text style={[styles.missionReportHint, { color: theme.colors.textSecondary }]}>
                                    You marked this mission as not completed.
                                </Text>
                            </>
                        ) : (
                            <>
                                <Text style={[styles.missionReportTitle, { color: theme.colors.textPrimary }]}>Mission review</Text>
                                <Text style={[styles.missionReportHint, { color: theme.colors.textSecondary, marginBottom: 14 }]}>
                                    {isMissionGridFull(habit)
                                        ? 'Every check-in day is marked. That does not have to mean success for you. Do you consider this mission complete?'
                                        : 'The mission window has ended with at least one day unchecked. Do you still consider this mission complete for you?'}
                                </Text>
                                <View style={styles.missionReportActions}>
                                    <Button
                                        title="Yes"
                                        onPress={() => {
                                            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                                            setMissionReport(habit.id, 'accomplished');
                                        }}
                                        style={{ flex: 1, marginRight: 8 }}
                                    />
                                    <Button
                                        title="No"
                                        variant="danger"
                                        onPress={() => {
                                            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                                            setMissionReport(habit.id, 'failed');
                                        }}
                                        style={{ flex: 1, marginLeft: 8 }}
                                    />
                                </View>
                            </>
                        )}
                    </View>
                ) : (
                    <Timer
                        startDate={habit.startDate}
                        mode={mode}
                        endDate={habit.endDate}
                        missionTimezone={habit.missionTimezone ?? null}
                        missionEndMs={missionEndMs}
                    />
                )}

                <View
                    style={[
                        styles.missionControlsCard,
                        Platform.OS === 'ios' && styles.missionControlsCardIos,
                        {
                            backgroundColor: theme.colors.surface,
                            borderColor: theme.colors.border,
                            borderRadius: theme.radius.lg,
                            ...theme.shadow.card,
                        },
                    ]}
                >
                    <TouchableOpacity
                        activeOpacity={reminderLockedTime ? 1 : 0.84}
                        onPress={reminderLockedTime ? undefined : openReminderEditor}
                        disabled={Boolean(reminderLockedTime)}
                        style={[styles.missionControlPane, Platform.OS === 'ios' && styles.missionControlPaneIos]}
                        accessibilityRole={reminderLockedTime ? undefined : "button"}
                        accessibilityLabel={reminderLockedTime ? "Daily reminder locked" : "Set reminder time"}
                    >
                        <View
                            style={[
                                styles.missionControlIcon,
                                {
                                    backgroundColor: reminderLockedTime
                                        ? isDark ? "rgba(99, 102, 241, 0.14)" : "rgba(99, 102, 241, 0.10)"
                                        : isDark ? "rgba(245, 158, 11, 0.14)" : "rgba(245, 158, 11, 0.12)",
                                },
                            ]}
                        >
                            <Bell
                                size={15}
                                color={reminderLockedTime ? theme.colors.indigo[400] : theme.colors.amber[500]}
                            />
                        </View>
                        <View style={styles.missionControlTextCol}>
                            <Text style={[styles.missionControlLabel, { color: theme.colors.textMuted }]} numberOfLines={1}>
                                REMINDER
                            </Text>
                            <Text style={[styles.missionControlValue, { color: theme.colors.textPrimary }]} numberOfLines={1}>
                                {reminderLockedTime ?? "Set time"}
                            </Text>
                        </View>
                        <View
                            style={[
                                styles.missionControlTinyPill,
                                {
                                    borderColor: theme.colors.border,
                                    backgroundColor: theme.colors.surfaceElevated,
                                },
                            ]}
                        >
                            <Text
                                style={[
                                    styles.missionControlTinyPillText,
                                    { color: reminderLockedTime ? theme.colors.indigo[400] : theme.colors.amber[500] },
                                ]}
                                numberOfLines={1}
                            >
                                {reminderLockedTime ? "Locked" : "Set"}
                            </Text>
                        </View>
                    </TouchableOpacity>

                    <View style={[styles.missionControlsDivider, { backgroundColor: theme.colors.border }]} />

                    <View style={[styles.missionControlPane, Platform.OS === 'ios' && styles.missionControlPaneIos]}>
                        <View
                            style={[
                                styles.missionControlIcon,
                                {
                                    backgroundColor: missionVisibilityIsPublic
                                        ? isDark ? "rgba(34, 211, 238, 0.12)" : "rgba(6, 182, 212, 0.10)"
                                        : isDark ? "rgba(99, 102, 241, 0.14)" : "rgba(99, 102, 241, 0.10)",
                                },
                            ]}
                        >
                            {missionVisibilityIsPublic ? (
                                <Globe size={15} color={theme.colors.cyan[400]} />
                            ) : (
                                <User size={15} color={theme.colors.indigo[400]} />
                            )}
                        </View>
                        <View style={styles.missionControlTextCol}>
                            <Text style={[styles.missionControlLabel, { color: theme.colors.textMuted }]} numberOfLines={1}>
                                TYPE
                            </Text>
                            <View style={styles.missionControlValueRow}>
                                <Text style={[styles.missionControlValue, { color: theme.colors.textPrimary }]} numberOfLines={1}>
                                    {missionVisibilityIsPublic ? "Public" : "Solo"}
                                </Text>
                                {Platform.OS === 'android' ? (
                                    <TouchableOpacity
                                        activeOpacity={0.84}
                                        disabled={visibilityBusy}
                                        onPress={() => handleMissionVisibilityChange(!missionVisibilityIsPublic)}
                                        style={[
                                            styles.missionControlAndroidSwitch,
                                            {
                                                backgroundColor: missionVisibilityIsPublic
                                                    ? theme.colors.indigo[600]
                                                    : theme.colors.border,
                                            },
                                            visibilityBusy && styles.missionControlSwitchBusy,
                                        ]}
                                        accessibilityRole="switch"
                                        accessibilityState={{ checked: missionVisibilityIsPublic, disabled: visibilityBusy }}
                                        accessibilityLabel="Mission visibility"
                                    >
                                        <View
                                            style={[
                                                styles.missionControlAndroidSwitchThumb,
                                                missionVisibilityIsPublic
                                                    ? styles.missionControlAndroidSwitchThumbOn
                                                    : styles.missionControlAndroidSwitchThumbOff,
                                            ]}
                                        />
                                    </TouchableOpacity>
                                ) : (
                                    <Switch
                                        style={[styles.missionControlSwitch, styles.missionControlSwitchIos]}
                                        value={missionVisibilityIsPublic}
                                        disabled={visibilityBusy}
                                        onValueChange={handleMissionVisibilityChange}
                                        trackColor={{ false: theme.colors.border, true: theme.colors.indigo[600] }}
                                        thumbColor={theme.colors.white}
                                        ios_backgroundColor={theme.colors.border}
                                    />
                                )}
                            </View>
                        </View>
                    </View>
                </View>

                <StreakBanner streak={habit.streak} />

                {eligibleRepair && repairStatus !== "applied" ? (
                  <View
                    style={[
                      styles.repairBanner,
                      {
                        borderColor: isDark
                          ? "rgba(245, 158, 11, 0.35)"
                          : "rgba(217, 119, 6, 0.25)",
                        backgroundColor: isDark
                          ? "rgba(245, 158, 11, 0.10)"
                          : "rgba(245, 158, 11, 0.08)",
                      },
                    ]}
                  >
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[styles.repairTitle, { color: theme.colors.textPrimary }]}>
                        {repairStatus === "pending" ? "Repair pending" : "Streak broken"}
                      </Text>
                      <Text style={[styles.repairBody, { color: theme.colors.textSecondary }]}>
                        {repairStatus === "pending"
                          ? "Your squad has been asked to approve. You’ll be notified when it’s applied."
                          : `You missed day ${eligibleRepair.missionDayNumber}. Repair within 24h to keep your streak.`}
                      </Text>
                      <Text style={[styles.repairCost, { color: theme.colors.amber[500] }]}>
                        {repairStatus === "pending" ? "Waiting for approvals…" : `Cost: ${eligibleRepair.xpCost} XP`}
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => void openRepair()}
                      activeOpacity={0.86}
                      disabled={repairStatus === "pending"}
                      style={[
                        styles.repairBtn,
                        { backgroundColor: repairStatus === "pending" ? theme.colors.border : theme.colors.amber[500] },
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel="Repair streak"
                    >
                      <Text style={[styles.repairBtnText, { color: "#111827" }]}>
                        {repairStatus === "pending" ? "Pending" : "Repair"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                ) : null}

                <QuoteCard />

                <View style={[styles.progressCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderRadius: theme.radius.lg, ...theme.shadow.card }]}>
                    <View style={styles.progressHeader}>
                        <Text style={[styles.progressLabel, { color: theme.colors.textSecondary, fontSize: theme.typography.micro }]}>Campaign Progress</Text>
                        <Text style={[styles.progressValue, { color: theme.colors.indigo[400] }]}>
                            {habit.completedDates.length} <Text style={[styles.progressTotal, { color: theme.colors.textMuted }]}>/ {totalDays}</Text>
                        </Text>
                    </View>
                    <View style={[styles.progressBarBackground, { backgroundColor: theme.colors.slate[700] }]}>
                        <View style={[styles.progressBarFill, isManual && { backgroundColor: theme.colors.amber[500] }, { backgroundColor: theme.colors.indigo[500], width: `${(habit.completedDates.length / totalDays) * 100}%` }]} />
                    </View>
                </View>

                {eligibleRepair && habit ? (
                  <StreakRepairSheet
                    visible={repairSheetOpen}
                    onClose={() => setRepairSheetOpen(false)}
                    habit={habit}
                    eligible={eligibleRepair}
                    onRequested={(info) => {
                      setRepairStatus(info.status);
                    }}
                  />
                ) : null}

                {!reminderIsLocked ? (
                    <Modal
                        visible={reminderEditorOpen}
                        animationType="fade"
                        transparent
                        onRequestClose={() => setReminderEditorOpen(false)}
                    >
                        <Pressable
                            style={[
                                styles.backdrop,
                                { backgroundColor: isDark ? "rgba(0,0,0,0.55)" : "rgba(0,0,0,0.28)" },
                            ]}
                            onPress={() => setReminderEditorOpen(false)}
                        >
                            <Pressable
                                onPress={(e) => e.stopPropagation()}
                                style={[
                                    styles.reminderModal,
                                    { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
                                ]}
                            >
                                <Text style={[styles.reminderTitle, { color: theme.colors.textPrimary }]}>
                                    Daily reminder time
                                </Text>
                                <Text style={[styles.reminderHint, { color: theme.colors.textSecondary }]}>
                                    24h time (HH:MM). You’ll get this ping if today isn’t marked, plus the last-hour safety reminder. This choice is final.
                                </Text>

                                <View style={styles.reminderChipsRow}>
                                    {["08:00", "12:00", "18:00", "21:00"].map((t) => (
                                        <TouchableOpacity
                                            key={t}
                                            activeOpacity={0.85}
                                            onPress={() => setReminderDraft(t)}
                                            style={[
                                                styles.reminderChip,
                                                {
                                                    borderColor: theme.colors.border,
                                                    backgroundColor:
                                                        reminderDraft === t ? theme.colors.indigo[600] : theme.colors.surfaceElevated,
                                                },
                                            ]}
                                        >
                                            <Text style={{ color: reminderDraft === t ? "#fff" : theme.colors.textSecondary, fontWeight: "800" }}>
                                                {t}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>

                                <TextInput
                                    value={reminderDraft}
                                    onChangeText={setReminderDraft}
                                    placeholder="21:00"
                                    placeholderTextColor={theme.colors.textMuted}
                                    autoCapitalize="none"
                                    autoCorrect={false}
                                    keyboardType="numbers-and-punctuation"
                                    style={[
                                        styles.reminderInput,
                                        { color: theme.colors.textPrimary, borderColor: theme.colors.border, backgroundColor: theme.colors.background },
                                    ]}
                                />

                                <View style={styles.reminderActionsRow}>
                                    <TouchableOpacity
                                        onPress={() => setReminderEditorOpen(false)}
                                        activeOpacity={0.86}
                                        style={[styles.reminderActionBtn, { backgroundColor: theme.colors.surfaceElevated, borderColor: theme.colors.border }]}
                                    >
                                        <Text style={{ color: theme.colors.textPrimary, fontWeight: "800" }}>Cancel</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        onPress={() => {
                                            if (!habit) return;
                                            const next = reminderDraft.trim();
                                            if (!isValidHHMM(next)) {
                                                showToast("Enter time like 21:00", "info");
                                                return;
                                            }
                                            setReminderLockPending(next);
                                            setReminderEditorOpen(false);
                                        }}
                                        activeOpacity={0.86}
                                        style={[styles.reminderActionBtn, { backgroundColor: theme.colors.indigo[600], borderColor: theme.colors.indigo[600] }]}
                                    >
                                        <Text style={{ color: "#fff", fontWeight: "900" }}>Continue</Text>
                                    </TouchableOpacity>
                                </View>
                            </Pressable>
                        </Pressable>
                    </Modal>
                ) : null}

                {memoryGalleryEntries.length > 0 ? <StreakMemoryGallery entries={memoryGalleryEntries} /> : null}

                <View style={styles.gridHeaderRow}>
                    <View style={styles.gridHeaderTextCol}>
                        <Text style={[styles.gridTitle, { color: theme.colors.textPrimary, fontSize: theme.typography.h3 }]}>
                            {useActiveTrailGrid ? 'Active Trail' : isManual ? `${totalDays}-Day Grid` : '21-Day Grid'}
                        </Text>
                        {useActiveTrailGrid ? (
                            <Text style={[styles.gridSubtitle, { color: theme.colors.textMuted }]}>
                                Day {activeTrailReachedDay}/{totalDays} | {habit.completedDates.length} done | {activeTrailRemainingDays} left
                            </Text>
                        ) : null}
                    </View>
                    {useActiveTrailGrid && activeTrailUnlockCopy ? (
                        <View
                            style={[
                                styles.unlockPill,
                                {
                                    borderColor: theme.colors.border,
                                    backgroundColor: isDark ? 'rgba(34, 211, 238, 0.10)' : 'rgba(6, 182, 212, 0.08)',
                                },
                            ]}
                        >
                            <Text style={[styles.unlockPillText, { color: theme.colors.cyan[400] }]} numberOfLines={2}>
                                {activeTrailUnlockCopy}
                            </Text>
                        </View>
                    ) : null}
                </View>

                <View style={styles.grid} ref={gridRef} onLayout={(e: LayoutChangeEvent) => { setGridLayout({ x: e.nativeEvent.layout.x, y: e.nativeEvent.layout.y }); }}>
                    {confetti.active && <ConfettiBurst active={confetti.active} isMilestone={confetti.milestone} originX={confetti.x} originY={confetti.y} />}

                    {!detailHeavyContentReady && !useActiveTrailGrid
                        ? Array.from({ length: Math.min(14, totalDays) }, (_, i) => (
                            <View
                                key={`grid-warmup-${i}`}
                                style={[
                                    styles.dayButtonPlaceholder,
                                    styles.dayButtonWarmup,
                                    { backgroundColor: theme.colors.surfaceElevated, borderColor: theme.colors.border },
                                ]}
                            />
                        ))
                        : null}

                    {displayedGridDays.map((day) => {
                        const dayIndex = day - 1;
                        const dateStr = getDayDate(dayIndex);
                        const isCompleted = completedDateSet.has(dateStr);
                        const isMilestone = milestoneSet.has(day);
                        const canInteract = activeMissionDaySlot !== null && day === activeMissionDaySlot;
                        const locked = !isCompleted && !canInteract;
                        const isCurrentMissionDay = canInteract && !isCompleted;
                        const streakMem = habit.streakMemories?.[dateStr];
                        const hasStreakRecord = Boolean(streakMem);
                        const hasMomentMedia = Boolean(
                            streakMem &&
                                ((streakMem.note ?? '').trim().length > 0 ||
                                    streakMem.imageUrl ||
                                    streakMem.imageUri),
                        );
                        const repaired = repairedDateSet.has(dateStr);
                        const repairSource = streakMem?.repairSource;

                        return (
                            <AnimatedDayCell
                                key={day}
                                day={day}
                                dayIndex={dayIndex}
                                isCompleted={isCompleted}
                                isMilestone={isMilestone}
                                isCurrentMissionDay={isCurrentMissionDay}
                                locked={locked}
                                canInteract={canInteract}
                                hasStreakRecord={hasStreakRecord}
                                hasMomentMedia={hasMomentMedia}
                                repaired={repaired}
                                repairSource={repairSource}
                                onPress={handleDayPress} // Stable callback reference
                                isSheetOpen={memoryUi !== null}
                                optimizeForScroll={optimizeGridScrollForIos}
                            />
                        );
                    })}

                    {(() => {
                        const renderedDayCount =
                            useActiveTrailGrid
                                ? displayedGridDays.length
                                : detailHeavyContentReady
                                    ? visibleDays.length
                                    : Math.min(14, totalDays);
                        const remainder = renderedDayCount % 7;
                        if (remainder === 0) return null;
                        return Array.from({ length: 7 - remainder }, (_, i) => <View key={`ph-${i}`} style={styles.dayButtonPlaceholder} />);
                    })()}
                </View>

            </ScrollView>

            <OperationProgressDialog
                visible={operationProgress !== null}
                title={operationProgress?.title ?? ''}
                message={operationProgress?.message}
                steps={operationProgress?.steps ?? []}
                activeStep={operationProgress?.activeStep ?? 0}
                error={operationProgress?.error}
            />

            <ConfirmDialog
                visible={missionDialog.kind !== 'none'}
                onRequestClose={() => setMissionDialog({ kind: 'none' })}
                title={
                    missionDialog.kind === 'reset'
                        ? 'Reset Mission'
                        : missionDialog.kind === 'delete'
                          ? 'Delete Mission'
                          : missionDialog.kind === 'leaveGroup'
                            ? 'Leave group mission?'
                            : missionDialog.kind === 'blockedReset'
                              ? 'Cannot reset'
                              : missionDialog.kind === 'signInRequired'
                                ? 'Sign in required'
                                : ''
                }
                message={
                    missionDialog.kind === 'blockedReset'
                        ? 'Group missions use one shared timeline for the squad. Restarting your run here would break the challenge. Finish this mission or work with your group.'
                        : missionDialog.kind === 'signInRequired'
                          ? 'To leave the squad and remove this group mission, sign in with your account.'
                          : missionDialog.kind === 'leaveGroup'
                            ? 'You’ll be removed from the squad and this mission will disappear from your list. This can’t be undone.'
                            : missionDialog.kind === 'reset'
                              ? 'Restart this mission from day 1?'
                              : missionDialog.kind === 'delete'
                                ? 'Give up on this mission?'
                                : undefined
                }
                actions={
                    missionDialog.kind === 'blockedReset' || missionDialog.kind === 'signInRequired'
                        ? [{ label: 'OK', onPress: () => setMissionDialog({ kind: 'none' }) }]
                        : missionDialog.kind === 'reset'
                          ? [
                                { label: 'Cancel', variant: 'secondary', onPress: () => setMissionDialog({ kind: 'none' }) },
                                {
                                    label: 'Reset',
                                    variant: 'danger',
                                    onPress: () => {
                                        const habitSnapshot = habit;
                                        setMissionDialog({ kind: 'none' });
                                        if (resetHabit(habit.id)) {
                                            void deleteHabitStreakMemoryImages(
                                                habitSnapshot.id,
                                                habitMemoryDateKeysForCleanup(habitSnapshot),
                                            );
                                            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                                            showToast('Mission reset', 'success');
                                            backOrReplace(router, "/");
                                        }
                                    },
                                },
                            ]
                          : missionDialog.kind === 'delete'
                            ? [
                                  { label: 'Cancel', variant: 'secondary', onPress: () => setMissionDialog({ kind: 'none' }) },
                                  {
                                      label: 'Delete',
                                      variant: 'danger',
                                      onPress: () => {
                                          const habitSnapshot = habit;
                                          setMissionDialog({ kind: 'none' });
                                          setOperationProgress({
                                              title: 'Deleting mission',
                                              message: 'Keep this open while HabitPro safely removes this mission.',
                                              steps: MISSION_DELETE_STEPS,
                                              activeStep: 0,
                                          });
                                          startJsStallProbe(`habit.delete.${habitSnapshot.id}`);
                                          void (async () => {
                                              await waitForOperationStep();
                                              setPendingExitAfterRemove(true);
                                              traceSync("habit.delete.deleteHabit", () => deleteHabit(habitSnapshot.id));
                                              await waitForHabitPersistIdle();
                                              setOperationProgress((prev) => (prev ? { ...prev, activeStep: 1 } : prev));
                                              void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                                              await waitForOperationStep();
                                              setOperationProgress((prev) => (prev ? { ...prev, activeStep: 2 } : prev));
                                              await waitForOperationStep();
                                              setOperationProgress((prev) => (prev ? { ...prev, activeStep: 3 } : prev));
                                              await waitForOperationStep(OPERATION_FINAL_DELAY_MS);
                                              setOperationProgress((prev) => (prev ? { ...prev, activeStep: MISSION_DELETE_STEPS.length } : prev));
                                              await waitForOperationStep(120);
                                              backOrReplace(router, "/");
                                              runAfterSettledInteractions(() => {
                                                  void deleteAllCommunityWinsForHabit(habitSnapshot);
                                                  void deleteHabitStreakMemoryImages(
                                                      habitSnapshot.id,
                                                      habitMemoryDateKeysForCleanup(habitSnapshot),
                                                  );
                                              }, 9000);
                                          })();
                                      },
                                  },
                              ]
                            : missionDialog.kind === 'leaveGroup'
                              ? [
                                    { label: 'Cancel', variant: 'secondary', onPress: () => setMissionDialog({ kind: 'none' }) },
                                    {
                                        label: 'Leave',
                                        variant: 'danger',
                                        onPress: () => {
                                            const challengeId = habit.challengeGroupId;
                                            const habitSnapshot = habit;
                                            setMissionDialog({ kind: 'none' });
                                            if (!challengeId) return;
                                            setOperationProgress({
                                                title: 'Leaving group mission',
                                                message: 'Keep this open while HabitPro updates your squad membership.',
                                                steps: GROUP_LEAVE_STEPS,
                                                activeStep: 0,
                                            });
                                            startJsStallProbe(`habit.leaveGroup.${habitSnapshot.id}`);
                                            void (async () => {
                                                const { error } = await leaveChallengeGroup(challengeId);
                                                if (error) {
                                                    setOperationProgress(null);
                                                    showToast(error.message, 'error');
                                                    return;
                                                }
                                                await waitForOperationStep();
                                                setOperationProgress((prev) => (prev ? { ...prev, activeStep: 1 } : prev));
                                                setPendingExitAfterRemove(true);
                                                traceSync("habit.leaveGroup.deleteHabit", () => deleteHabit(habitSnapshot.id));
                                                await waitForHabitPersistIdle();
                                                void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                                                await waitForOperationStep();
                                                setOperationProgress((prev) => (prev ? { ...prev, activeStep: 2 } : prev));
                                                await waitForOperationStep();
                                                setOperationProgress((prev) => (prev ? { ...prev, activeStep: 3 } : prev));
                                                await waitForOperationStep(OPERATION_FINAL_DELAY_MS);
                                                setOperationProgress((prev) => (prev ? { ...prev, activeStep: GROUP_LEAVE_STEPS.length } : prev));
                                                await waitForOperationStep(120);
                                                backOrReplace(router, "/");
                                                runAfterSettledInteractions(() => {
                                                    void deleteAllCommunityWinsForHabit(habitSnapshot);
                                                    void deleteHabitStreakMemoryImages(
                                                        habitSnapshot.id,
                                                        habitMemoryDateKeysForCleanup(habitSnapshot),
                                                    );
                                                }, 9000);
                                            })();
                                        },
                                    },
                                ]
                              : [{ label: 'OK', onPress: () => setMissionDialog({ kind: 'none' }) }]
                }
            />

            <ConfirmDialog
                visible={reminderLockPending !== null}
                onRequestClose={() => setReminderLockPending(null)}
                title="Lock reminder time?"
                message={
                    reminderLockPending
                        ? `You chose ${reminderLockPending}. This time can’t be changed later for this mission.`
                        : undefined
                }
                actions={[
                    { label: "Cancel", variant: "secondary", onPress: () => setReminderLockPending(null) },
                    {
                        label: "Lock time",
                        onPress: () => {
                            const next = reminderLockPending;
                            if (!habit || !next) return;
                            void (async () => {
                                const ok = await requireNotifications("daily_reminder");
                                if (!ok) return;
                                setReminderLockPending(null);
                                useHabitStore.setState((state) => ({
                                    habits: state.habits.map((h) =>
                                        h.id === habit.id
                                            ? {
                                                  ...h,
                                                  reminderEnabled: true,
                                                  reminderTimeLocal: next,
                                                  reminderLocked: true,
                                              }
                                            : h,
                                    ),
                                }));
                                requestRemoteSync({ immediate: false });
                                void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                                showToast("Reminder locked", "success");
                            })();
                        },
                    },
                ]}
            />
        </Screen>
    );
}

const styles = StyleSheet.create({
    notFoundContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    notFoundText: {},
    notFoundButton: { marginTop: 16 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 },
    headerActions: { flexDirection: 'row', gap: 8 },
    iconButton: { padding: 8, borderRadius: 9999, borderWidth: 1 },
    resetButton: { padding: 8, borderRadius: 9999, backgroundColor: 'rgba(245, 158, 11, 0.12)' },
    deleteButton: { padding: 8, borderRadius: 9999, backgroundColor: 'rgba(239, 68, 68, 0.14)' },
    modeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'nowrap',
        gap: 8,
        marginBottom: 10,
    },
    modeBadge: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, paddingVertical: 4, paddingHorizontal: 10, borderRadius: 9999, backgroundColor: 'rgba(34, 211, 238, 0.1)', borderWidth: 1, borderColor: 'rgba(34, 211, 238, 0.3)' },
    modeBadgeManual: { backgroundColor: 'rgba(245, 158, 11, 0.1)', borderColor: 'rgba(245, 158, 11, 0.3)' },
    modeBadgeText: { fontSize: 11, fontWeight: '800', letterSpacing: 1 },
    modeInfoBtn: {
        justifyContent: 'center',
        alignItems: 'center',
        padding: 4,
    },
    title: { fontWeight: '800', marginBottom: 12 },
    missionControlsCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        minHeight: 62,
        paddingVertical: 8,
        paddingHorizontal: 10,
        borderWidth: 1,
        marginBottom: 14,
    },
    missionControlsCardIos: {
        minHeight: 78,
        paddingVertical: 10,
        paddingHorizontal: 12,
        gap: 10,
    },
    missionControlPane: {
        flex: 1,
        minWidth: 0,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 7,
        minHeight: 44,
    },
    missionControlPaneIos: {
        minHeight: 56,
        gap: 8,
    },
    missionControlIcon: {
        width: 28,
        height: 28,
        borderRadius: 999,
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
    },
    missionControlsDivider: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', opacity: 0.9 },
    missionControlTextCol: { flex: 1, minWidth: 0 },
    missionControlLabel: { fontSize: 8, lineHeight: 10, fontWeight: '900', letterSpacing: 0.8 },
    missionControlValueRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginTop: 2, minWidth: 0 },
    missionControlValue: { fontSize: 14, lineHeight: 17, fontWeight: '900', marginTop: 1, flexShrink: 1 },
    missionControlSwitch: { transform: [{ scale: 0.76 }], marginLeft: 4, marginRight: -9, flexShrink: 0 },
    missionControlSwitchIos: { transform: [{ scale: 0.84 }], marginLeft: 6, marginRight: -4, width: 54 },
    missionControlSwitchBusy: { opacity: 0.64 },
    missionControlAndroidSwitch: {
        width: 38,
        height: 22,
        borderRadius: 999,
        padding: 2,
        justifyContent: 'center',
        flexShrink: 0,
        marginLeft: 6,
    },
    missionControlAndroidSwitchThumb: {
        width: 18,
        height: 18,
        borderRadius: 999,
        backgroundColor: '#FFFFFF',
    },
    missionControlAndroidSwitchThumbOn: { alignSelf: 'flex-end' },
    missionControlAndroidSwitchThumbOff: { alignSelf: 'flex-start' },
    missionControlTinyPill: {
        minHeight: 22,
        borderRadius: 999,
        borderWidth: 1,
        paddingHorizontal: 7,
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
    },
    missionControlTinyPillText: { fontSize: 9, lineHeight: 11, fontWeight: '900' },
    visibilityRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderWidth: 1, marginBottom: 20 },
    visibilityTextCol: { flex: 1 },
    visibilityTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    visibilityTitle: { fontWeight: '700', fontSize: 14 },
    visibilityHint: { fontSize: 11, marginTop: 3, lineHeight: 15 },
    backdrop: { flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 18 },
    reminderModal: { borderWidth: 1, borderRadius: 18, padding: 16, marginHorizontal: 18, width: "100%", maxWidth: 420 },
    reminderTitle: { fontSize: 16, fontWeight: "900" },
    reminderHint: { fontSize: 12, lineHeight: 17, fontWeight: "600", marginTop: 6 },
    reminderChipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 14 },
    reminderChip: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 9999, borderWidth: 1 },
    reminderInput: { marginTop: 14, borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, fontWeight: "800" },
    reminderActionsRow: { flexDirection: "row", gap: 10, marginTop: 16 },
    reminderActionBtn: { flex: 1, paddingVertical: 12, borderRadius: 14, alignItems: "center", borderWidth: 1 },
    reminderLockedRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderWidth: 1,
        borderRadius: 14,
        marginBottom: 20,
        overflow: "hidden",
    },
    reminderLockedAccent: { width: 3, alignSelf: "stretch", borderRadius: 9999 },
    reminderLockedLabel: { fontSize: 10, fontWeight: "900", letterSpacing: 1.1 },
    reminderLockedTime: { fontSize: 20, fontWeight: "900", marginTop: 2, fontVariant: ["tabular-nums"] },
    reminderSetBtn: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12, borderWidth: 1 },
    reminderSetBtnText: { fontSize: 12, fontWeight: "900" },
    repairBanner: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderWidth: 1,
        borderRadius: 16,
        marginBottom: 14,
    },
    repairTitle: { fontSize: 14, fontWeight: "900", marginBottom: 2 },
    repairBody: { fontSize: 12, lineHeight: 17, fontWeight: "600" },
    repairCost: { fontSize: 12, fontWeight: "900", marginTop: 6 },
    repairBtn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14 },
    repairBtnText: { fontSize: 12, fontWeight: "900" },
    progressCard: { padding: 20, marginBottom: 28, borderWidth: 1 },
    progressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 14 },
    progressLabel: { fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
    progressValue: { fontSize: 24, fontWeight: '800' },
    progressTotal: { fontSize: 16 },
    progressBarBackground: { height: 12, borderRadius: 9999, overflow: 'hidden' },
    progressBarFill: { height: '100%', borderRadius: 9999 },
    gridHeaderRow: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        gap: 12,
        marginBottom: 14,
    },
    gridHeaderTextCol: { flex: 1, minWidth: 0 },
    gridTitle: { fontWeight: '700', marginBottom: 0 },
    gridSubtitle: { fontSize: 12, lineHeight: 17, fontWeight: '700', marginTop: 4 },
    unlockPill: {
        maxWidth: 142,
        minHeight: 34,
        borderRadius: 9999,
        borderWidth: 1,
        paddingHorizontal: 10,
        paddingVertical: 7,
        alignItems: 'center',
        justifyContent: 'center',
    },
    unlockPillText: { fontSize: 11, lineHeight: 14, fontWeight: '900', textAlign: 'center' },
    grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', paddingBottom: 24, position: 'relative' },
    dayCellFrame: { width: '13%', aspectRatio: 1, marginBottom: 14 },
    dayButton: { width: '100%', height: '100%', borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    dayButtonCompleted: { borderWidth: 1 },
    dayButtonMilestone: { shadowColor: '#fbbf24', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.45, shadowRadius: 14, elevation: 8 },
    dayButtonIncomplete: { borderWidth: 1 },
    dayButtonFuture: { opacity: 0.45 },
    dayText: { fontWeight: '700', fontSize: 16 },
    currentDayText: { fontSize: 18, fontWeight: '800' },
    badgeWrap: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
    milestoneHalo: { position: 'absolute', width: '90%', height: '90%', borderRadius: 10, backgroundColor: 'rgba(251, 191, 36, 0.16)' },
    badgeCore: { width: '72%', height: '72%', borderRadius: 9999, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255, 255, 255, 0.16)', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.26)' },
    badgeCoreMilestone: { backgroundColor: 'rgba(251, 191, 36, 0.24)', borderColor: 'rgba(251, 191, 36, 0.58)' },
    completedDayText: { color: '#ffffff', fontSize: 14, fontWeight: '800' },
    completedDayTextMilestone: { color: '#fff7dc' },
    badgeAccent: { position: 'absolute', top: 6, right: 6 },
    memoryDot: { position: 'absolute', bottom: 5, width: 7, height: 7, borderRadius: 4, borderWidth: 1.5 },
    repairDot: { position: 'absolute', bottom: 5, right: 5, width: 7, height: 7, borderRadius: 4, borderWidth: 1.5 },
    brandRingWrap: { width: '82%', height: '82%', alignItems: 'center', justifyContent: 'center' },
    brandRingCore: { width: 24, height: 24, borderRadius: 9999, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
    brandRingDayText: { fontSize: 14, fontWeight: '900' },
    brandRingDayTextTwoDigit: { fontSize: 12 },
    brandRingAccent: { position: 'absolute', top: 2, right: 2 },
    dayButtonPlaceholder: { width: '13%', aspectRatio: 1, marginBottom: 14 },
    dayButtonWarmup: { borderWidth: 1, borderRadius: 12, opacity: 0.56 },
    missionTimerSlot: {
        padding: 20,
        marginBottom: 32,
        borderWidth: 1,
    },
    missionLengthField: {
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderRadius: 12,
        borderWidth: 1,
        marginBottom: 16,
    },
    missionLengthLabel: {
        fontSize: 11,
        fontWeight: '800',
        letterSpacing: 1,
        textTransform: 'uppercase',
        marginBottom: 4,
    },
    missionLengthValue: { fontSize: 22, fontWeight: '800' },
    missionReportTitle: { fontWeight: '800', fontSize: 16, marginBottom: 6 },
    missionReportHint: { fontSize: 13, lineHeight: 19 },
    missionReportActions: { flexDirection: 'row', alignItems: 'stretch' },
});
