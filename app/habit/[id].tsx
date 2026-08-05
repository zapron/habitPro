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
import { GlassTopHighlight } from '../../src/components/GlassTopHighlight';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Trash2, Lock, RotateCcw, Plane, Gamepad2, Globe, User, Users, Info, Bell, Hammer, Camera, MessageSquare } from 'lucide-react-native';
import Svg, { Path } from 'react-native-svg';
import { useHabitStore } from '../../src/store/habitStore';
import { useShallow } from 'zustand/react/shallow';
import { Button } from '../../src/components/Button';
import { Timer } from '../../src/components/Timer';
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
import { XpGainBadge } from '../../src/components/XpGainBadge';
import { StreakProgressCard } from '../../src/components/StreakProgressCard';
import {
  calendarDateForHabitMissionDayIndex,
  calendarDateKeyForTimestamp,
  calendarDayEndUtcMsForDateKey,
  getHabitActiveMissionDaySlot,
  getHabitActiveMissionDayEndMs,
  getHabitMissionTimeZone,
  isHabitCalendarDateToggleable,
  MS_PER_MISSION_DAY,
  missionDayNumberMapForHabit,
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
import { ChecklistDaySheet } from '../../src/components/ChecklistDaySheet';
import { LazyMount } from '../../src/components/LazyMount';
import type { StreakMemory, StreakMemoryTaskEntry, TaskChecklistItem } from '../../src/types/habit';
import {
    canUseStreakMemoryUpload,
    deleteHabitStreakMemoryImages,
    shouldUploadLocalStreakImage,
    uploadHabitStreakMemoryImage,
    uploadHabitStreakTaskMemoryImage,
} from '../../src/lib/streakMemoryStorage';
import { useAuth } from '../../src/context/AuthContext';
import { usePremium } from '../../src/context/PremiumContext';
import { usePlusUpsell } from '../../src/context/PlusUpsellContext';
import { useRefreshPremiumAccess } from "../../src/hooks/useRefreshPremiumAccess";
import { useRemoteStoreRefreshOnFocus } from "../../src/hooks/useRemoteStoreRefreshOnFocus";
import { useUsernameGate } from "../../src/context/UsernameGateContext";
import { useNotificationGate } from "../../src/context/NotificationGateContext";
import { getRemotePushPermissionDetails } from "../../src/lib/pushTokens";
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
import { withAlpha } from "../../src/styles/theme";

const LOCKED_CHECKIN_MSG =
    'You can only check in for the current mission day. Each day unlocks 24 hours after the mission started (day 2 after the first 24 hours, and so on).';

/** Muted indigo for the one surviving accent on the Reminder/Type card's toggle — same tone as the Home FAB's `FAB_ACCENT_MUTED`. */
const SWITCH_ACCENT_MUTED = '#4B4BB0';
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

/** Fixed regardless of theme — the completed-day circle's fill (`theme.colors.green[900]`)
 * doesn't change between light/dark, so its icon needs a color that reads consistently
 * against that one dark-green background rather than a theme-conditional gray. */
const COMPLETED_DAY_ICON_GRAY = '#8b93a1';

/**
 * Completed-day marker — one solid dull-green circle (no separate ring/border), with
 * the day number and, when applicable, a small icon stacked above it: camera for a
 * photo memory, message for a text-only memory, hammer for a day saved by a streak
 * repair with no memory attached. A plain completed day with none of the above shows
 * just the number.
 */
const CompletedDayDot = React.memo(function CompletedDayDot({
    day,
    hasPhoto,
    hasNoteOnly,
    isRepaired,
}: {
    day: number;
    hasPhoto: boolean;
    hasNoteOnly: boolean;
    isRepaired: boolean;
}) {
    const { theme } = useTheme();

    return (
        <View style={styles.completedDotContent}>
            {hasPhoto ? (
                <Camera size={10} color={COMPLETED_DAY_ICON_GRAY} strokeWidth={2.4} />
            ) : isRepaired ? (
                <Hammer size={10} color={COMPLETED_DAY_ICON_GRAY} strokeWidth={2.4} />
            ) : hasNoteOnly ? (
                <MessageSquare size={10} color={COMPLETED_DAY_ICON_GRAY} strokeWidth={2.4} />
            ) : null}
            <Text
                style={[
                    styles.brandRingDayText,
                    { color: theme.colors.white },
                    day >= 10 && styles.brandRingDayTextTwoDigit,
                ]}
            >
                {day}
            </Text>
        </View>
    );
});

/** Filled pie-wedge path (not a stroked ring) — starts at 12 o'clock, sweeps clockwise
 * by `progress` (0–1) of the full circle. */
function pieSlicePath(cx: number, cy: number, r: number, progress: number): string {
    const clamped = Math.min(0.9999, Math.max(0, progress));
    if (clamped <= 0) return '';
    const startAngle = -Math.PI / 2;
    const endAngle = startAngle + clamped * 2 * Math.PI;
    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);
    const largeArcFlag = clamped > 0.5 ? 1 : 0;
    return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArcFlag} 1 ${x2} ${y2} Z`;
}

/**
 * Overlay drawn inside today's dotted current-day circle once the user has logged at
 * least one (but not all) of a multi-task checklist day — a filled dull-green pie
 * wedge in ratio to tasks logged / total, growing clockwise from the top. Purely
 * additive: the circle keeps its dotted border, its day number, and its pulse
 * animation exactly as before; this just fills in behind them.
 */
const TaskProgressArc = React.memo(function TaskProgressArc({ progress }: { progress: number }) {
    const { theme } = useTheme();
    const d = pieSlicePath(21, 21, 17, progress);
    if (!d) return null;

    return (
        <Svg width="100%" height="100%" viewBox="0 0 42 42" style={StyleSheet.absoluteFill} pointerEvents="none">
            <Path d={d} fill={theme.colors.green[900]} />
        </Svg>
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
    hasPhoto,
    hasNoteOnly,
    isRepaired,
    checklistLogged,
    checklistTotal,
    onPress,
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
    hasPhoto: boolean;
    hasNoteOnly: boolean;
    isRepaired: boolean;
    /** Only set for the current mission day — tasks logged so far / total checklist tasks (0/0 for classic missions, or missions with a single task, where a ratio isn't meaningful). */
    checklistLogged?: number;
    checklistTotal?: number;
    onPress: (dayIndex: number, day: number) => void;
    optimizeForScroll: boolean;
}) {
    const { theme } = useTheme();
    const reduceMotion = useReducedMotion();
    const scale = useRef(new Animated.Value(1)).current;
    const shimmer = useRef(new Animated.Value(0)).current;

    // A multi-task (2+) checklist day only shows the ratio arc; 0 or 1 tasks stays
    // on the plain existing flow below, since there's no meaningful ratio to draw.
    const hasMultiTaskChecklist = typeof checklistTotal === 'number' && checklistTotal >= 2;
    const allTasksLogged = hasMultiTaskChecklist && (checklistLogged ?? 0) >= (checklistTotal ?? 0);
    // All tasks logged, but Mark Day Complete not pressed yet — previews the exact
    // same completed-marker look as a real completed day (step 3 of the flow).
    const showPreCompleteBadge = isCurrentMissionDay && !isCompleted && allTasksLogged;
    // Some (not all) tasks logged — draws the green ratio arc inside the dotted circle (step 2).
    const showProgressArc =
        isCurrentMissionDay && !isCompleted && hasMultiTaskChecklist && !allTasksLogged && (checklistLogged ?? 0) > 0;
    const visuallyDone = isCompleted || showPreCompleteBadge;

    useEffect(() => {
        if (reduceMotion || optimizeForScroll || !(isMilestone && isCompleted)) return;
        const loop = Animated.loop(
            Animated.sequence([
                Animated.timing(shimmer, { toValue: 1, duration: 2000, easing: Easing.inOut(Easing.ease), useNativeDriver: true, isInteraction: false }),
                Animated.timing(shimmer, { toValue: 0, duration: 2000, easing: Easing.inOut(Easing.ease), useNativeDriver: true, isInteraction: false }),
            ]),
        );
        loop.start();
        return () => loop.stop();
    }, [reduceMotion, optimizeForScroll, isMilestone, isCompleted, shimmer]);

    // ── Touch-down: instant scale shrink + haptic (fires the MOMENT finger touches) ──
    const handlePressIn = useCallback(() => {
        // Instant scale-down on touch
        Animated.spring(scale, { toValue: 0.82, tension: 250, friction: 6, useNativeDriver: true }).start();

        // Instantly play light touch haptic
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }, [scale]);

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
        visuallyDone
            ? [
                styles.dayButtonCompleted,
                {
                    backgroundColor: theme.colors.green[900],
                    borderColor: theme.colors.green[900],
                    borderWidth: 0,
                },
            ]
            : [styles.dayButtonIncomplete, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }],
        isCurrentMissionDay && !visuallyDone && { borderColor: theme.colors.red[900], borderWidth: 2, borderStyle: 'dashed' as const },
        locked && styles.dayButtonFuture,
    ];

    return (
        <Animated.View
            style={[
                styles.dayCellFrame,
                optimizeForScroll && isCompleted && ({ shouldRasterizeIOS: true } as any),
                { transform: [{ scale }] },
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
                {visuallyDone ? (
                    <Animated.View style={[styles.badgeWrap, isMilestone && { opacity: shimmerOpacity }]}>
                        <CompletedDayDot day={day} hasPhoto={hasPhoto} hasNoteOnly={hasNoteOnly} isRepaired={isRepaired} />
                    </Animated.View>
                ) : locked ? (
                    <Lock size={15} color={theme.colors.textMuted} />
                ) : isCurrentMissionDay ? (
                    <View style={styles.badgeWrap}>
                        {showProgressArc ? <TaskProgressArc progress={(checklistLogged ?? 0) / (checklistTotal ?? 1)} /> : null}
                        <Text style={[styles.dayText, styles.currentDayText, { color: theme.colors.white }]}>{day}</Text>
                    </View>
                ) : (
                    <Text style={[styles.dayText, isCurrentMissionDay ? { color: theme.colors.red[500] } : { color: theme.colors.textMuted }]}>{day}</Text>
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

    const {
        habit,
        toggleCompletion,
        repairHabitCompletedDatesFromMemories,
        setStreakMemory,
        patchStreakMemory,
        markChecklistDayComplete,
        resetHabit,
        deleteHabit,
        setHabitVisibility,
        setMissionReport,
    } = useHabitStore(
      useShallow((state) => ({
        habit: habitId ? state.getHabit(habitId) : undefined,
        toggleCompletion: state.toggleCompletion,
        repairHabitCompletedDatesFromMemories: state.repairHabitCompletedDatesFromMemories,
        setStreakMemory: state.setStreakMemory,
        patchStreakMemory: state.patchStreakMemory,
        markChecklistDayComplete: state.markChecklistDayComplete,
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

    useEffect(() => {
        if (!habit) return;
        const completedSet = new Set(habit.completedDates ?? []);
        // Mirrors habitStore's hasClassicCompletionEvidence: a checklist day's tasks-only
        // memory entry (logged, not yet Mark-Day-Complete'd) must not trip this repair —
        // only a classic note/photo/check-in/repair marker counts as proof the day should
        // have been completed. Getting this wrong force-completes the day the instant the
        // first task is logged, which is exactly what "Mark Day Complete" replaced.
        const hasMissingMemoryCompletion = Object.entries(habit.streakMemories ?? {}).some(
            ([dateStr, memory]) =>
                /^\d{4}-\d{2}-\d{2}$/.test(dateStr) &&
                !completedSet.has(dateStr) &&
                Boolean(memory.note || memory.imageUrl || memory.imageUri || memory.checkInOnly || memory.repairSource),
        );
        if (hasMissingMemoryCompletion) {
            repairHabitCompletedDatesFromMemories(habit.id);
        }
    }, [habit, repairHabitCompletedDatesFromMemories]);

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

    const [confetti, setConfetti] = useState<{ active: boolean; milestone: boolean; x: number; y: number; xp: number; day: number; align: "left" | "center" | "right" }>({ active: false, milestone: false, x: 0, y: 0, xp: 0, day: 0, align: "center" });
    const gridRef = useRef<View>(null);
    const [gridLayout, setGridLayout] = useState({ x: 0, y: 0 });
    const [now, setNow] = useState(() => Date.now());
    type MemoryUiState =
        | { kind: 'create'; dateStr: string; day: number; dayIndex: number }
        | { kind: 'view'; memory: StreakMemory; dateStr: string; day: number }
        | null;
    const [memoryUi, setMemoryUi] = useState<MemoryUiState>(null);
    // Checklist missions (docs/CATALOG_ARCHITECTURE.md Phase 2) — day tap opens this
    // instead of memoryUi when habit.taskChecklist is present and non-empty.
    const [checklistDayUi, setChecklistDayUi] = useState<{ dateStr: string; day: number; dayIndex: number } | null>(null);
    type TaskMemoryUiState =
        | {
              kind: 'create';
              dateStr: string;
              day: number;
              dayIndex: number;
              task: TaskChecklistItem;
              /** Re-opening an already-logged-but-unlocked task: seeds the sheet with its existing content. */
              prefill?: { note?: string; imageUri?: string };
          }
        | { kind: 'view'; dateStr: string; day: number; dayIndex: number; task: TaskChecklistItem; entry: StreakMemoryTaskEntry }
        | null;
    const [taskMemoryUi, setTaskMemoryUi] = useState<TaskMemoryUiState>(null);
    const [checklistShareBusy, setChecklistShareBusy] = useState(false);
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

    const memoryCompletionDates = useMemo(
        () =>
            Object.entries(habit?.streakMemories ?? {})
                // A checklist day's tasks-only memory (logged, not yet Mark-Day-Complete'd)
                // must not count as "completed" here — only real completion evidence does.
                // Same guard as the hasMissingMemoryCompletion check below; getting this
                // wrong force-completes a checklist day the instant its first task is
                // logged, which is exactly what the explicit Mark Day Complete action
                // replaced. Classic (non-checklist) memories always satisfy this anyway,
                // since saving one there is itself the completing action.
                .filter(
                    ([dateStr, memory]) =>
                        /^\d{4}-\d{2}-\d{2}$/.test(dateStr) &&
                        Boolean(memory.note || memory.imageUrl || memory.imageUri || memory.checkInOnly || memory.repairSource),
                )
                .map(([dateStr]) => dateStr)
                .sort((a, b) => a.localeCompare(b)),
        [habit?.streakMemories],
    );
    const effectiveCompletedDates = useMemo(() => {
        const out = new Set<string>(habit?.completedDates ?? []);
        for (const dateStr of memoryCompletionDates) out.add(dateStr);
        return [...out].sort((a, b) => a.localeCompare(b));
    }, [habit?.completedDates, memoryCompletionDates]);
    const effectiveCompletedCount = effectiveCompletedDates.length;
    const clockHabit = useMemo(
        () => (habit ? { ...habit, completedDates: effectiveCompletedDates } : undefined),
        [effectiveCompletedDates, habit],
    );
    const completedDateSet = useMemo(() => new Set(effectiveCompletedDates), [effectiveCompletedDates]);
    const milestoneSet = useMemo(() => new Set(milestones), [milestones]);
    const repairedDateSet = useMemo(() => new Set(habit?.repairedDates ?? []), [habit?.repairedDates]);
    const streakMemoryCount = useMemo(() => Object.keys(habit?.streakMemories ?? {}).length, [habit?.streakMemories]);
    const missionDayMapKey = useMemo(() => {
        if (!clockHabit) return "none";
        if (!usesCalendarDayMission(clockHabit)) return `${clockHabit.id}:${clockHabit.startDate}:${clockHabit.totalDays}`;
        return `${clockHabit.id}:${calendarDateKeyForTimestamp(now, getHabitMissionTimeZone(clockHabit))}:${effectiveCompletedDates.join("|")}`;
    }, [clockHabit, effectiveCompletedDates, now]);
    const missionDayByDate = useMemo(() => {
        return traceSync("habit.detail.missionDayByDate", () => {
            return clockHabit ? missionDayNumberMapForHabit(clockHabit, Date.now()) : new Map<string, number>();
        });
    }, [clockHabit, missionDayMapKey]);
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
        }, [initialGridDayCount, shouldDeferHeavyMissionContent]),
    );

    useEffect(() => {
        if (!detailHeavyContentReady || visibleGridDayCount >= totalDays) return undefined;
        const timer = setTimeout(() => {
            setVisibleGridDayCount((prev) => {
                const next = Math.min(totalDays, prev + GRID_RENDER_BATCH_DAYS);
                return next;
            });
        }, GRID_RENDER_BATCH_DELAY_MS);
        return () => clearTimeout(timer);
    }, [detailHeavyContentReady, totalDays, visibleGridDayCount]);

    const memoryGalleryEntries = useMemo(() => {
        return traceSync("habit.detail.memoryGalleryEntries", () => {
            if (!habit || !detailHeavyContentReady) return [];
            const raw = habit.streakMemories ?? {};
            const entries = Object.entries(raw)
                .filter(([, memory]) => {
                    if (memory.checkInOnly) {
                        return Boolean(memory.note?.trim() || memory.imageUrl || memory.imageUri);
                    }
                    return true;
                })
                .map(([dateStr, memory]) => ({
                    dateStr,
                    memory,
                    missionDay: missionDayByDate.get(dateStr) ?? null,
                }))
                .sort((a, b) => (a.dateStr < b.dateStr ? 1 : -1));
            return entries;
        });
    }, [detailHeavyContentReady, habit, missionDayByDate]);

    const showMissionReportInsteadOfTimer = useMemo(() => {
        if (!habit) return false;
        return !shouldShowMainMissionTimer(habit, now);
    }, [habit, now]);

    const isManual = mode === 'manual';
    const activeMissionDaySlot = clockHabit ? getHabitActiveMissionDaySlot(clockHabit, now) : null;
    const useActiveTrailGrid = isManual || totalDays > INITIAL_GRID_RENDER_DAYS;
    const activeTrailReachedDay = useMemo(() => {
        return traceSync("habit.detail.activeTrailReachedDay", () => {
            if (!clockHabit) return 1;
            let reached = activeMissionDaySlot ?? 0;
            const memoryDays = Object.keys(clockHabit.streakMemories ?? {})
                .map((dateStr) => missionDayByDate.get(dateStr) ?? null)
                .filter((day): day is number => typeof day === 'number');
            const completedDays = effectiveCompletedDates
                .map((dateStr) => missionDayByDate.get(dateStr) ?? null)
                .filter((day): day is number => typeof day === 'number');
            for (const day of [...memoryDays, ...completedDays]) {
                reached = Math.max(reached, day);
            }
            return Math.min(totalDays, Math.max(1, reached));
        });
    }, [activeMissionDaySlot, clockHabit, effectiveCompletedDates, missionDayByDate, totalDays]);
    const activeTrailDays = useMemo(
        () => Array.from({ length: activeTrailReachedDay }, (_, i) => activeTrailReachedDay - i),
        [activeTrailReachedDay],
    );
    const visibleActiveTrailDays = useMemo(
        () => activeTrailDays.slice(0, Math.min(activeTrailDays.length, visibleGridDayCount)),
        [activeTrailDays, visibleGridDayCount],
    );
    const activeTrailRemainingDays = Math.max(0, totalDays - activeTrailReachedDay);
    const activeMissionDayEndMs = clockHabit ? getHabitActiveMissionDayEndMs(clockHabit, now) : null;
    const activeMissionDate =
        clockHabit && activeMissionDaySlot != null
            ? calendarDateForHabitMissionDayIndex(clockHabit, activeMissionDaySlot - 1, now)
            : null;
    const activeMissionDayCompleted = activeMissionDate ? completedDateSet.has(activeMissionDate) : false;
    const activeTrailUnlockCopy = useMemo(() => {
        if (!useActiveTrailGrid) return null;
        if (activeMissionDaySlot == null) {
            return activeTrailRemainingDays === 0 ? 'Full journey complete.' : 'No marker is open right now.';
        }
        if (!activeMissionDayCompleted) {
            return `Day ${activeMissionDaySlot} is open now`;
        }
        if (activeMissionDaySlot >= totalDays) {
            return 'Final marker is saved.';
        }
        if (activeMissionDayEndMs && activeMissionDayEndMs > now) {
            return `Day ${activeMissionDaySlot + 1} opens in ${formatUnlockDuration(activeMissionDayEndMs - now)}`;
        }
        return `Day ${activeMissionDaySlot + 1} opens soon`;
    }, [
        activeMissionDayEndMs,
        activeMissionDayCompleted,
        activeMissionDaySlot,
        activeTrailRemainingDays,
        now,
        totalDays,
        useActiveTrailGrid,
    ]);

    const fireCompletionCelebration = useCallback(
        (dayIndex: number, day: number, isMilestone: boolean, xpGained: number = 0) => {
            const visualIndex = useActiveTrailGrid ? Math.max(0, activeTrailReachedDay - day) : dayIndex;
            const col = visualIndex % 7;
            const row = Math.floor(visualIndex / 7);
            const cellSize = 50;
            const x = col * cellSize + cellSize / 2;
            const y = row * cellSize + cellSize / 2;
            // The XP pill anchors itself relative to this cell's origin; a fixed
            // centering offset pushes it off-screen to the left for column 0 (and
            // would hang off the right edge for the last column), so bias inward
            // at both edges instead of always centering.
            const align = col === 0 ? "left" : col === 6 ? "right" : "center";
            setConfetti({ active: false, milestone: false, x: 0, y: 0, xp: 0, day: 0, align: "center" });
            setTimeout(() => {
                setConfetti({ active: true, milestone: isMilestone, x, y, xp: xpGained, day, align });
            }, 50);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        },
        [activeTrailReachedDay, useActiveTrailGrid],
    );

    const handleMemoryCommit = useCallback(
        async (memory: StreakMemory | null, meta?: { publishToCommunity?: boolean }) => {
            const ctx = pendingMemoryRef.current;
            if (!ctx || !habit) return;
            const commitNow = Date.now();

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
                        pendingMemoryRef.current = null;
                        setMemoryUi(null);
                        openUpsell('community_publish');
                        return;
                    }
                }
            }

            const xpBefore = useHabitStore.getState().xp;
            const changed = toggleCompletion(habit.id, ctx.dateStr, commitNow);
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
            const xpGained = useHabitStore.getState().xp - xpBefore;
            fireCompletionCelebration(ctx.dayIndex, ctx.day, isMilestone, xpGained);

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
                        pendingMemoryRef.current = null;
                        setMemoryUi(null);
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

    /**
     * Checklist missions only (docs/CATALOG_ARCHITECTURE.md Phase 2, revised). Saves
     * one task's note+photo into streak_memories[date].tasks. Logging a task no
     * longer completes the day itself — tasks stay editable (re-opening a logged
     * task pre-fills this same sheet) until the user explicitly taps "Mark Day
     * Complete" (handleMarkChecklistDayComplete below), which is what actually
     * advances the streak/XP and fires the squad notification.
     *
     * No community-publish path yet — that's Phase 3. Photo upload is attempted
     * immediately (task-scoped storage path, distinct from the per-day classic path
     * so same-day tasks can't overwrite each other); if it fails or isn't available,
     * the local device URI is kept so the photo isn't lost, but it stays local-only
     * (not synced across devices, not usable for community sharing) until re-saved
     * successfully or a later phase adds background upload support for tasks.
     */
    const handleTaskMemoryCommit = useCallback(
        async (memory: StreakMemory | null) => {
            const ctx = taskMemoryUi;
            if (!ctx || !habit) return;

            let proofUrl = memory?.imageUrl?.trim() || undefined;
            if (memory && !proofUrl && memory.imageUri) {
                if (canUseStreakMemoryUpload() && shouldUploadLocalStreakImage(memory.imageUri)) {
                    try {
                        proofUrl = await uploadHabitStreakTaskMemoryImage({
                            habitId: habit.id,
                            dateStr: ctx.dateStr,
                            taskId: ctx.task.id,
                            localUri: memory.imageUri,
                        });
                    } catch (e) {
                        const msg = e instanceof Error ? e.message : String(e);
                        showToast(msg, 'error');
                        proofUrl = memory.imageUri;
                    }
                } else {
                    proofUrl = memory.imageUri;
                }
            }

            const existingTasks = habit.streakMemories?.[ctx.dateStr]?.tasks ?? [];
            const priorEntry = existingTasks.find((t) => t.taskId === ctx.task.id);

            const taskEntry: StreakMemoryTaskEntry = {
                taskId: ctx.task.id,
                label: ctx.task.label,
                note: memory?.note,
                proofUrls: proofUrl ? [proofUrl] : [],
                loggedAt: new Date().toISOString(),
                // Re-saving an already-logged task (new photo/note) must not silently
                // reset a previous "exclude from share" choice back to included.
                includedInShare: priorEntry?.includedInShare,
            };

            const nextTasks = [...existingTasks.filter((t) => t.taskId !== ctx.task.id), taskEntry];

            if (habit.streakMemories?.[ctx.dateStr]) {
                patchStreakMemory(habit.id, ctx.dateStr, { tasks: nextTasks });
            } else {
                setStreakMemory(habit.id, ctx.dateStr, {
                    createdAt: new Date().toISOString(),
                    tasks: nextTasks,
                });
            }

            // Once every checklist task has a logged entry, there's nothing left to
            // decide — auto-fire the same action "Mark Day Complete" triggers (advances
            // the streak/XP, fires the squad completion notification), so the user
            // never has to tap a now-redundant button after their last task.
            // markChecklistDayComplete reads the store fresh, so it already sees the
            // patch/set above even though this function's own `habit` closure is stale.
            const currentTaskIds = new Set((habit.taskChecklist ?? []).map((t) => t.id));
            const loggedIds = new Set(nextTasks.filter((t) => currentTaskIds.has(t.taskId)).map((t) => t.taskId));
            const allTasksNowLogged = currentTaskIds.size > 0 && loggedIds.size >= currentTaskIds.size;
            if (allTasksNowLogged) {
                const xpBefore = useHabitStore.getState().xp;
                const changed = markChecklistDayComplete(habit.id, ctx.dateStr);
                if (changed) {
                    const isMilestone = milestones.includes(ctx.day);
                    const xpGained = useHabitStore.getState().xp - xpBefore;
                    fireCompletionCelebration(ctx.dayIndex, ctx.day, isMilestone, xpGained);
                }
            }

            // StreakMemorySheet calls onClose() itself right after onCommit resolves —
            // that handler closes taskMemoryUi and reopens the checklist, so this
            // function doesn't need to touch taskMemoryUi state.
        },
        [habit, taskMemoryUi, setStreakMemory, patchStreakMemory, markChecklistDayComplete, milestones, fireCompletionCelebration, showToast],
    );

    /**
     * Checklist missions only. The explicit "Mark Day Complete" action — the only
     * thing that now advances the streak/XP and fires the squad checklist
     * notification for a checklist day (see docs/CATALOG_ARCHITECTURE.md). Works
     * with zero, some, or all tasks logged: the store action backfills a bare
     * check-in memory if nothing was logged, so the day still has a moment.
     */
    const handleMarkChecklistDayComplete = useCallback(
        (dateStr: string, day: number, dayIndex: number) => {
            if (!habit) return;
            const xpBefore = useHabitStore.getState().xp;
            const changed = markChecklistDayComplete(habit.id, dateStr);
            if (!changed) {
                showToast(LOCKED_CHECKIN_MSG, 'info', 5000);
                return;
            }
            const isMilestone = milestones.includes(day);
            const xpGained = useHabitStore.getState().xp - xpBefore;
            fireCompletionCelebration(dayIndex, day, isMilestone, xpGained);
            setChecklistDayUi(null);
        },
        [habit, markChecklistDayComplete, milestones, fireCompletionCelebration, showToast],
    );

    /**
     * Checklist missions only (docs/CATALOG_ARCHITECTURE.md Phase 3+). Removes this
     * day's catalog from Community entirely — same one-way-door semantics as the
     * classic flow's revoke (handleHabitMemoryCommunityChange below): once removed,
     * communityFeedRevoked blocks ever re-sharing this day. Also reached
     * automatically from handleChecklistDayShare when unchecking every task leaves
     * nothing to publish, rather than erroring on an already-shared day.
     */
    const handleChecklistDayUnshare = useCallback(
        (dateStr: string) => {
            if (!habit) return;
            // Close this Modal before opening the confirm Modal — iOS can't reliably
            // present a second native Modal over an already-open one (same bug class
            // as the original paywall nested-modal fix, and the one just above in
            // handleHabitMemoryCommunityChange). Capture the day context so the
            // checklist can be reopened after Cancel, an error, or a successful removal.
            const dayCtx = checklistDayUi;
            setChecklistDayUi(null);
            const reopenChecklist = () => {
                if (dayCtx) setChecklistDayUi(dayCtx);
            };
            showAppAlert(
                'Remove from Community?',
                'This removes this day’s catalog from the feed. You won’t be able to share this day again.',
                [
                    { text: 'Cancel', style: 'cancel', onPress: reopenChecklist },
                    {
                        text: 'Remove',
                        style: 'destructive',
                        onPress: () => {
                            void (async () => {
                                setChecklistShareBusy(true);
                                try {
                                    const del = await deleteCommunityWin(habitStreakCommunityWinId(habit.id, dateStr));
                                    if (del.ok === false) {
                                        showAppAlert('Couldn’t remove', del.error, [{ text: 'OK', onPress: reopenChecklist }]);
                                        return;
                                    }
                                    patchStreakMemory(habit.id, dateStr, {
                                        communityPosted: false,
                                        communityFeedRevoked: true,
                                    });
                                    reopenChecklist();
                                } finally {
                                    setChecklistShareBusy(false);
                                }
                            })();
                        },
                    },
                ],
            );
        },
        [habit, patchStreakMemory, checklistDayUi],
    );

    /** Flips one task's "include in the next share/update" flag. Local-only — does not publish by itself. */
    const handleToggleTaskInclusion = useCallback(
        (dateStr: string, taskId: string) => {
            if (!habit) return;
            const tasks = habit.streakMemories?.[dateStr]?.tasks ?? [];
            const nextTasks = tasks.map((t) =>
                t.taskId === taskId ? { ...t, includedInShare: t.includedInShare === false } : t,
            );
            patchStreakMemory(habit.id, dateStr, { tasks: nextTasks });
        },
        [habit, patchStreakMemory],
    );

    /**
     * Shares (or updates) this day's catalog. Reuses postCommunityWin's existing
     * upsert-on-(user_id, mini_mission_id) behavior — a second share for the same
     * day updates the same feed post in place rather than creating a duplicate or
     * bumping it to the top of anyone's feed (created_at is never touched by the
     * upsert payload). Only tasks with includedInShare !== false AND an
     * already-uploaded (https) photo are included — unchecked tasks, and tasks
     * whose photo upload failed and is still local-only, are silently left out
     * rather than blocking the whole share.
     */
    const handleChecklistDayShare = useCallback(
        async (dateStr: string, day: number) => {
            if (!habit) return;
            // Every showAppAlert below must close checklistDayUi's Modal first —
            // iOS can't reliably present a second native Modal over an already-open
            // one. Capture the context once (without closing yet, since some paths
            // — e.g. delegating to handleChecklistDayUnshare — need the sheet to
            // still be open when they run) and reopen after a plain info alert is
            // dismissed. The two premium-required paths deliberately do NOT reopen,
            // matching the established "closing the sheet along with the paywall"
            // pattern used everywhere else openUpsell is called from inside a sheet.
            const dayCtx = checklistDayUi;
            const reopenChecklist = () => {
                if (dayCtx) setChecklistDayUi(dayCtx);
            };
            const mem = habit.streakMemories?.[dateStr];
            if (mem?.communityFeedRevoked) {
                setChecklistDayUi(null);
                showAppAlert(
                    'Can’t share',
                    'This day was removed from Community and can’t be shared again.',
                    [{ text: 'OK', onPress: reopenChecklist }],
                );
                return;
            }
            const tasks = mem?.tasks ?? [];
            const gallery = tasks
                .filter((t) => t.includedInShare !== false && t.proofUrls[0] && /^https?:\/\//.test(t.proofUrls[0]))
                .map((t) => ({
                    taskId: t.taskId,
                    label: t.label,
                    note: t.note ?? null,
                    imageUrl: t.proofUrls[0],
                }));

            if (gallery.length === 0) {
                if (mem?.communityPosted) {
                    // Every task got unchecked on an already-shared day — remove the
                    // whole post rather than leave an empty catalog published. Sheet
                    // is still open here; handleChecklistDayUnshare manages its own
                    // close/reopen around its own confirm Modal.
                    handleChecklistDayUnshare(dateStr);
                    return;
                }
                setChecklistDayUi(null);
                showAppAlert(
                    'Photo required',
                    'Log at least one task with a photo before sharing this day’s catalog.',
                    [{ text: 'OK', onPress: reopenChecklist }],
                );
                return;
            }
            if (!isSupabaseConfigured()) {
                setChecklistDayUi(null);
                showAppAlert('Can’t publish', 'Cloud sync isn’t configured.', [{ text: 'OK', onPress: reopenChecklist }]);
                return;
            }
            if (!session?.user) {
                setChecklistDayUi(null);
                showAppAlert('Sign in to publish', 'Sign in to share this catalog in Community.', [{ text: 'OK', onPress: reopenChecklist }]);
                return;
            }
            const freshPremium = await refreshPremiumAccess({ serverOnly: true, cachedAccessOk: true });
            if (freshPremium !== true) {
                setChecklistDayUi(null);
                openUpsell('community_publish');
                return;
            }

            setChecklistShareBusy(true);
            try {
                const ok = await requireUsername("community_post");
                if (!ok) {
                    setChecklistDayUi(null);
                    showAppAlert('Username required', 'Choose a username to publish to Community.', [{ text: 'OK', onPress: reopenChecklist }]);
                    return;
                }
                const res = await postCommunityWin({
                    miniMissionId: habitStreakCommunityWinId(habit.id, dateStr),
                    title: habit.title,
                    completedAt: habit.streakMemories?.[dateStr]?.createdAt ?? new Date().toISOString(),
                    memoryNote: gallery[0].note,
                    memoryImageUrl: gallery[0].imageUrl,
                    memoryGallery: gallery,
                    feedSource: "habit_streak",
                    streakMissionDay: day,
                    streakCountAtPost: habit.streak,
                });
                if (res.ok === true) {
                    patchStreakMemory(habit.id, dateStr, { communityPosted: true });
                    showToast(
                        `Shared ${gallery.length} photo${gallery.length === 1 ? '' : 's'} to Community.`,
                        'success',
                    );
                } else {
                    if (res.reason === "premium_required") {
                        await refreshPremiumAccess({ force: true, serverOnly: true });
                        setChecklistDayUi(null);
                        openUpsell('community_publish');
                        return;
                    }
                    setChecklistDayUi(null);
                    showAppAlert('Couldn’t publish', res.error, [{ text: 'OK', onPress: reopenChecklist }]);
                }
            } finally {
                setChecklistShareBusy(false);
            }
        },
        [
            habit,
            session?.user,
            refreshPremiumAccess,
            requireUsername,
            patchStreakMemory,
            showToast,
            openUpsell,
            handleChecklistDayUnshare,
            checklistDayUi,
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
                    pendingMemoryRef.current = null;
                    setMemoryUi(null);
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
                            pendingMemoryRef.current = null;
                            setMemoryUi(null);
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
            // Close this Modal before opening the confirm Modal — iOS can't reliably
            // present a second native Modal over an already-open one (same bug class
            // as the original paywall nested-modal fix). Capture the current view so
            // it can be restored after Cancel, an error, or a successful removal —
            // StreakMemorySheet's viewMemory prop reads live habit.streakMemories over
            // this snapshot anyway, so restoring the same reference is safe even after
            // the underlying memory changes.
            const viewToRestore = memoryUi;
            pendingMemoryRef.current = null;
            setMemoryUi(null);
            const reopenView = () => {
                if (viewToRestore) setMemoryUi(viewToRestore);
            };
            showAppAlert(
                'Remove from Community?',
                'This removes this moment from the feed. You won’t be able to share this check-in to Community again.',
                [
                    { text: 'Cancel', style: 'cancel', onPress: reopenView },
                    {
                        text: 'Remove',
                        style: 'destructive',
                        onPress: () => {
                            void (async () => {
                                setHabitCommunityBusy(true);
                                try {
                                    const del = await deleteCommunityWin(habitStreakCommunityWinId(habit.id, dateStr));
                                    if (del.ok === false) {
                                        showAppAlert('Couldn’t remove', del.error, [{ text: 'OK', onPress: reopenView }]);
                                        return;
                                    }
                                    patchStreakMemory(habit.id, dateStr, {
                                        communityPosted: false,
                                        communityFeedRevoked: true,
                                    });
                                    reopenView();
                                } finally {
                                    setHabitCommunityBusy(false);
                                }
                            })();
                        },
                    },
                ],
            );
        },
        [habit, habitId, session?.user, patchStreakMemory, showToast, openUpsell, refreshPremiumAccess, memoryUi],
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
                        pendingMemoryRef.current = null;
                        setMemoryUi(null);
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
    const displayedGridDays = useActiveTrailGrid ? visibleActiveTrailDays : visibleDays;
    const optimizeGridScrollForLongGrid = displayedGridDays.length > INITIAL_GRID_RENDER_DAYS;

    const getDayDate = useCallback((dayIndex: number) => {
        if (!clockHabit) return "";
        return calendarDateForHabitMissionDayIndex(clockHabit, dayIndex, now);
    }, [clockHabit, now]);

    const detailBottomPad = Math.max(insets.bottom, 24) + 16;

    const handleDayPress = useCallback((dayIndex: number, day: number) => {
        const currentHabit = habitId ? useHabitStore.getState().getHabit(habitId) : undefined;
        if (!currentHabit) return;

        const pressNow = Date.now();
        const dateStr = calendarDateForHabitMissionDayIndex(currentHabit, dayIndex, pressNow);
        const wasCompleted = currentHabit.completedDates.includes(dateStr);
        const activeSlot = getHabitActiveMissionDaySlot(currentHabit, pressNow);
        const canInteract = activeSlot !== null && day === activeSlot;
        const toggleable = isHabitCalendarDateToggleable(currentHabit, dateStr, pressNow);

        if (currentHabit.taskChecklist && currentHabit.taskChecklist.length > 0) {
            if (!wasCompleted && !toggleable) {
                showToast(LOCKED_CHECKIN_MSG, 'info', 5000);
                return;
            }
            setChecklistDayUi({ dateStr, day, dayIndex });
            return;
        }

        if (!wasCompleted) {
            if (!toggleable) {
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
                            <Users size={theme.icon.xl} color={theme.colors.textMuted} />
                        </TouchableOpacity>
                    ) : null}
                    {!isGroupMission ? (
                        <TouchableOpacity style={styles.resetButton} onPress={handleReset}>
                            <RotateCcw size={theme.icon.xl} color={theme.colors.amber[500]} />
                        </TouchableOpacity>
                    ) : null}
                    <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
                        <Trash2 size={theme.icon.xl} color={theme.colors.textMuted} />
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

            {habit.taskChecklist && habit.taskChecklist.length > 0 ? (
                <>
                    <ChecklistDaySheet
                        visible={checklistDayUi !== null}
                        day={checklistDayUi?.day ?? 1}
                        missionTitle={habit.title}
                        tasks={habit.taskChecklist}
                        loggedTasks={
                            checklistDayUi ? habit.streakMemories?.[checklistDayUi.dateStr]?.tasks ?? [] : []
                        }
                        dayCompleted={
                            checklistDayUi ? habit.completedDates.includes(checklistDayUi.dateStr) : false
                        }
                        alreadyShared={
                            checklistDayUi
                                ? habit.streakMemories?.[checklistDayUi.dateStr]?.communityPosted === true
                                : false
                        }
                        revoked={
                            checklistDayUi
                                ? habit.streakMemories?.[checklistDayUi.dateStr]?.communityFeedRevoked === true
                                : false
                        }
                        sharing={checklistShareBusy}
                        onShare={() => {
                            if (!checklistDayUi) return;
                            void handleChecklistDayShare(checklistDayUi.dateStr, checklistDayUi.day);
                        }}
                        onUnshare={() => {
                            if (!checklistDayUi) return;
                            handleChecklistDayUnshare(checklistDayUi.dateStr);
                        }}
                        onToggleTaskInclusion={(taskId) => {
                            if (!checklistDayUi) return;
                            handleToggleTaskInclusion(checklistDayUi.dateStr, taskId);
                        }}
                        onMarkComplete={() => {
                            if (!checklistDayUi) return;
                            handleMarkChecklistDayComplete(
                                checklistDayUi.dateStr,
                                checklistDayUi.day,
                                checklistDayUi.dayIndex,
                            );
                        }}
                        onSelectTask={(task) => {
                            if (!checklistDayUi) return;
                            const dayCtx = checklistDayUi;
                            const dayCompleted = habit.completedDates.includes(dayCtx.dateStr);
                            const existing = habit.streakMemories?.[dayCtx.dateStr]?.tasks?.find(
                                (t) => t.taskId === task.id,
                            );
                            // Close this Modal before opening the task's StreakMemorySheet Modal —
                            // iOS can't reliably present a second native Modal over an already-open
                            // one (same class of bug as the earlier paywall nested-modal fix).
                            setChecklistDayUi(null);
                            if (dayCompleted) {
                                // Locked: only already-logged tasks have anything to show.
                                if (existing) {
                                    setTaskMemoryUi({ kind: 'view', ...dayCtx, task, entry: existing });
                                } else {
                                    setChecklistDayUi(dayCtx);
                                }
                                return;
                            }
                            // Not yet locked — always editable, pre-filled if already logged.
                            setTaskMemoryUi({
                                kind: 'create',
                                ...dayCtx,
                                task,
                                prefill: existing
                                    ? { note: existing.note, imageUri: existing.proofUrls[0] }
                                    : undefined,
                            });
                        }}
                        onClose={() => setChecklistDayUi(null)}
                    />
                    <StreakMemorySheet
                        visible={taskMemoryUi !== null}
                        mode={taskMemoryUi?.kind === 'view' ? 'view' : 'create'}
                        noticeVariant="editable-until-complete"
                        hideCommunityPublish
                        prefill={taskMemoryUi?.kind === 'create' ? taskMemoryUi.prefill : undefined}
                        viewMemory={
                            taskMemoryUi?.kind === 'view'
                                ? {
                                      createdAt: taskMemoryUi.entry.loggedAt,
                                      note: taskMemoryUi.entry.note,
                                      imageUrl: taskMemoryUi.entry.proofUrls[0],
                                  }
                                : undefined
                        }
                        missionTitle={taskMemoryUi?.task.label ?? habit.title}
                        dayLabel={taskMemoryUi ? String(taskMemoryUi.day) : '1'}
                        onClose={() => {
                            // Called automatically after a successful onCommit too (see
                            // StreakMemorySheet's internal submit flow) — reopen the checklist
                            // so the user lands back on it to log the next task, instead of
                            // dropping back to the mission screen after every single task.
                            if (taskMemoryUi) {
                                setChecklistDayUi({
                                    dateStr: taskMemoryUi.dateStr,
                                    day: taskMemoryUi.day,
                                    dayIndex: taskMemoryUi.dayIndex,
                                });
                            }
                            setTaskMemoryUi(null);
                        }}
                        onCommit={
                            taskMemoryUi?.kind !== 'view'
                                ? (memory) => handleTaskMemoryCommit(memory)
                                : undefined
                        }
                    />
                </>
            ) : null}

            <ScrollView
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ paddingBottom: detailBottomPad }}
                removeClippedSubviews={optimizeGridScrollForLongGrid}
                {...({ delaysContentTouches: false } as any)}
            >
                <View style={styles.modeRow}>
                    <View style={[styles.modeBadge, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
                        {isManual ? <Gamepad2 size={13} color={theme.colors.amber[500]} /> : <Plane size={13} color={theme.colors.cyan[400]} />}
                        <Text style={[styles.modeBadgeText, { color: theme.colors.textSecondary }]}>
                            {isManual ? 'Manual control' : 'Autopilot'}
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
                        <Info size={theme.icon.md} color={theme.colors.textMuted} />
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
                                            : isDark ? theme.colors.border : "transparent",
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
                        },
                    ]}
                >
                    <GlassTopHighlight radius={theme.radius.lg} />
                    <TouchableOpacity
                        activeOpacity={reminderLockedTime ? 1 : 0.84}
                        onPress={reminderLockedTime ? undefined : openReminderEditor}
                        disabled={Boolean(reminderLockedTime)}
                        style={[styles.missionControlPane, Platform.OS === 'ios' && styles.missionControlPaneIos]}
                        accessibilityRole={reminderLockedTime ? undefined : "button"}
                        accessibilityLabel={reminderLockedTime ? "Daily reminder locked" : "Set reminder time"}
                    >
                        <View style={styles.missionControlIcon}>
                            <Bell size={15} color={theme.colors.textMuted} />
                        </View>
                        <View style={styles.missionControlTextCol}>
                            <Text style={[styles.missionControlLabel, { color: theme.colors.textMuted }]} numberOfLines={1}>
                                REMINDER
                            </Text>
                            <Text style={[styles.missionControlValue, { color: theme.colors.textPrimary }]} numberOfLines={1}>
                                {reminderLockedTime ?? "Set time"}
                            </Text>
                        </View>
                        <View style={styles.missionControlTinyPill}>
                            <Text
                                style={[
                                    styles.missionControlTinyPillText,
                                    { color: theme.colors.green[900] },
                                ]}
                                numberOfLines={1}
                            >
                                {reminderLockedTime ? "Locked" : "Set"}
                            </Text>
                        </View>
                    </TouchableOpacity>

                    <View style={[styles.missionControlsDivider, { backgroundColor: theme.colors.border }]} />

                    <View style={[styles.missionControlPane, Platform.OS === 'ios' && styles.missionControlPaneIos]}>
                        <View style={styles.missionControlIcon}>
                            {missionVisibilityIsPublic ? (
                                <Globe size={15} color={withAlpha(SWITCH_ACCENT_MUTED, 50)} />
                            ) : (
                                <User size={15} color={withAlpha(SWITCH_ACCENT_MUTED, 50)} />
                            )}
                        </View>
                        <View style={styles.missionControlTextCol}>
                            <Text style={[styles.missionControlLabel, { color: theme.colors.textMuted }]} numberOfLines={1}>
                                TYPE
                            </Text>
                            <Text style={[styles.missionControlValue, { color: theme.colors.textPrimary }]} numberOfLines={1}>
                                {missionVisibilityIsPublic ? "Public" : "Solo"}
                            </Text>
                        </View>
                        {Platform.OS === 'android' ? (
                            <TouchableOpacity
                                activeOpacity={0.84}
                                disabled={visibilityBusy}
                                onPress={() => handleMissionVisibilityChange(!missionVisibilityIsPublic)}
                                style={[
                                    styles.missionControlAndroidSwitch,
                                    {
                                        backgroundColor: missionVisibilityIsPublic
                                            ? SWITCH_ACCENT_MUTED
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
                            <View style={styles.missionControlSwitchWrapIos}>
                                <Switch
                                    value={missionVisibilityIsPublic}
                                    disabled={visibilityBusy}
                                    onValueChange={handleMissionVisibilityChange}
                                    trackColor={{ false: theme.colors.border, true: SWITCH_ACCENT_MUTED }}
                                    thumbColor={theme.colors.white}
                                    ios_backgroundColor={theme.colors.border}
                                />
                            </View>
                        )}
                    </View>
                </View>


                {eligibleRepair && repairStatus !== "applied" ? (
                  repairStatus === "pending" ? (
                    <View
                      style={[
                        styles.repairBanner,
                        {
                          borderColor: isDark ? withAlpha(theme.colors.amber[500], 35) : withAlpha(theme.colors.amber[500], 25),
                          backgroundColor: isDark ? withAlpha(theme.colors.amber[500], 10) : withAlpha(theme.colors.amber[500], 8),
                        },
                      ]}
                    >
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={[styles.repairTitle, { color: theme.colors.textPrimary }]}>
                          Repair pending
                        </Text>
                        <Text style={[styles.repairBody, { color: theme.colors.textSecondary }]}>
                          Your squad has been asked to approve. You’ll be notified when it’s applied.
                        </Text>
                        <Text style={[styles.repairCost, { color: theme.colors.amber[500] }]}>
                          Waiting for approvals…
                        </Text>
                      </View>
                      <View style={[styles.repairBtn, { backgroundColor: theme.colors.border }]}>
                        <Text style={[styles.repairBtnText, { color: "#111827" }]}>Pending</Text>
                      </View>
                    </View>
                  ) : (
                    <View
                      style={[
                        styles.repairPlainCard,
                        { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
                      ]}
                    >
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={[styles.repairTitle, { color: theme.colors.textPrimary }]}>
                          Streak broken
                        </Text>
                        <Text style={[styles.repairBody, { color: theme.colors.textSecondary }]}>
                          {`You missed day ${eligibleRepair.missionDayNumber}. Repair within 24h to keep your streak.`}
                        </Text>
                        <Text style={[styles.repairCost, { color: theme.colors.textMuted }]}>
                          {`Cost: ${eligibleRepair.xpCost} XP`}
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => void openRepair()}
                        activeOpacity={0.7}
                        style={[styles.repairPlainBtn, { borderColor: theme.colors.amber[900] }]}
                        accessibilityRole="button"
                        accessibilityLabel="Repair streak"
                      >
                        <Hammer size={13} color={theme.colors.amber[900]} strokeWidth={2.4} />
                        <Text style={[styles.repairBtnText, { color: theme.colors.amber[900] }]}>Repair</Text>
                      </TouchableOpacity>
                    </View>
                  )
                ) : null}
                <StreakProgressCard
                    streak={habit.streak}
                    completedCount={effectiveCompletedCount}
                    totalDays={totalDays}
                    ringColor={isManual ? (isDark ? '#B57C46' : '#8A5A2E') : undefined}
                />

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
                                { backgroundColor: isDark ? withAlpha(theme.colors.scrim, 55) : withAlpha(theme.colors.scrim, 28) },
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
                                Day {activeTrailReachedDay}/{totalDays} | {effectiveCompletedCount} done | {activeTrailRemainingDays} left
                            </Text>
                        ) : null}
                    </View>
                    {useActiveTrailGrid && activeTrailUnlockCopy ? (
                        <View
                            style={[
                                styles.unlockPill,
                                {
                                    borderColor: theme.colors.border,
                                    backgroundColor: isDark ? withAlpha(theme.colors.cyan[400], 10) : withAlpha(theme.colors.cyan[500], 8),
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
                    {confetti.active && confetti.xp > 0 && (
                        <XpGainBadge active={confetti.active} xp={confetti.xp} day={confetti.day} originX={confetti.x} originY={confetti.y} align={confetti.align} />
                    )}

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
                        const memoryTasks = streakMem?.tasks ?? [];
                        const hasPhoto = Boolean(
                            streakMem && (streakMem.imageUrl || streakMem.imageUri || memoryTasks.some((t) => t.proofUrls[0])),
                        );
                        const hasNoteOnly =
                            !hasPhoto &&
                            Boolean(streakMem && ((streakMem.note ?? '').trim().length > 0 || memoryTasks.some((t) => t.note?.trim())));
                        // A repaired day's "note" is typically just the auto-generated repair
                        // message, not a real memory — the hammer should win over the text icon
                        // whenever a day was repaired, not only when there's no note at all.
                        const isRepaired = !hasPhoto && repairedDateSet.has(dateStr);
                        const checklistTotal = isCurrentMissionDay ? (habit.taskChecklist?.length ?? 0) : 0;
                        // Count only entries matching a CURRENT checklist task id — same as
                        // ChecklistDaySheet's own "N/M logged" count. A raw `tasks.length` would
                        // over-count if any stale/orphaned entries exist (e.g. the checklist was
                        // edited after some tasks were logged against the old item ids), which
                        // could prematurely trigger the "all logged" completed-preview badge.
                        const checklistLogged = isCurrentMissionDay
                            ? (() => {
                                  const currentTaskIds = new Set((habit.taskChecklist ?? []).map((t) => t.id));
                                  return (streakMem?.tasks ?? []).filter((t) => currentTaskIds.has(t.taskId)).length;
                              })()
                            : 0;

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
                                hasPhoto={hasPhoto}
                                hasNoteOnly={hasNoteOnly}
                                isRepaired={isRepaired}
                                checklistLogged={checklistLogged}
                                checklistTotal={checklistTotal}
                                onPress={handleDayPress} // Stable callback reference
                                optimizeForScroll={optimizeGridScrollForLongGrid}
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
                                // Ask for notification permission as a courtesy (so the alert can actually
                                // fire when granted), but the lock-in itself — the user's one-time choice
                                // of reminder time — is a local habit-record change and must not be blocked
                                // by whether that permission was granted, denied, or unavailable (e.g. Expo
                                // Go, which can never grant it). Previously this whole action silently did
                                // nothing whenever `ok` was false.
                                const ok = await requireNotifications("daily_reminder");
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
                                if (ok) {
                                    showToast("Reminder locked", "success");
                                } else {
                                    const details = await getRemotePushPermissionDetails();
                                    showToast(
                                        details.status === "unavailable"
                                            ? "Reminder locked. Alerts need push notifications, not available in Expo Go."
                                            : "Reminder locked. Enable notifications to actually receive the alert.",
                                        "info",
                                    );
                                }
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
    deleteButton: { padding: 8, borderRadius: 9999 },
    modeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'nowrap',
        gap: 8,
        marginBottom: 10,
    },
    modeBadge: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, paddingVertical: 4, paddingHorizontal: 10, borderRadius: 9999, borderWidth: 1 },
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
        marginBottom: 10,
    },
    missionControlsCardIos: {
        minHeight: 78,
        paddingVertical: 10,
        paddingHorizontal: 12,
        gap: 10,
    },
    missionControlsTopHighlight: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 18,
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
    missionControlValue: { fontSize: 14, lineHeight: 17, fontWeight: '900', marginTop: 1, flexShrink: 1 },
    missionControlSwitchWrapIos: {
        alignItems: 'center',
        justifyContent: 'center',
        transform: [{ scale: 0.84 }],
        flexShrink: 0,
    },
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
        paddingHorizontal: 4,
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
    },
    missionControlTinyPillText: { fontSize: 11, lineHeight: 13, fontWeight: '900' },
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
    repairPlainCard: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderWidth: 1,
        borderRadius: 16,
        marginBottom: 14,
    },
    repairPlainBtn: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 14,
        borderWidth: 1,
    },
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
    dayButton: { width: '100%', height: '100%', borderRadius: 9999, alignItems: 'center', justifyContent: 'center' },
    dayButtonCompleted: { borderWidth: 1 },
    dayButtonMilestone: { shadowColor: '#fbbf24', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.45, shadowRadius: 14, elevation: 8 },
    dayButtonIncomplete: { borderWidth: 1 },
    dayButtonFuture: { opacity: 0.45 },
    dayText: { fontWeight: '700', fontSize: 16 },
    currentDayText: { fontSize: 18, fontWeight: '800' },
    badgeWrap: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
    completedDotContent: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', gap: 1 },
    brandRingDayText: { fontSize: 14, fontWeight: '300' },
    brandRingDayTextTwoDigit: { fontSize: 12 },
    dayButtonPlaceholder: { width: '13%', aspectRatio: 1, marginBottom: 14 },
    dayButtonWarmup: { borderWidth: 1, borderRadius: 9999, opacity: 0.56 },
    missionTimerSlot: {
        padding: 16,
        marginBottom: 10,
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
