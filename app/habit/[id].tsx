import { Text } from "../../src/components/AppText";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { View,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Animated,
  Easing,
  LayoutChangeEvent,
  Switch,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { ArrowLeft, Trash2, Lock, RotateCcw, Sparkles, Star, Plane, Gamepad2, Globe, User, Users, Info } from 'lucide-react-native';
import { useHabitStore } from '../../src/store/habitStore';
import { Button } from '../../src/components/Button';
import { Timer } from '../../src/components/Timer';
import { QuoteCard } from '../../src/components/QuoteCard';
import { Screen } from '../../src/components/Screen';
import { ConfirmDialog } from '../../src/components/ConfirmDialog';
import { useTheme } from '../../src/context/ThemeContext';
import { useToast } from '../../src/context/ToastContext';
import { useReducedMotion } from '../../src/hooks/useReducedMotion';
import { subscribeSyncFailure, subscribeSyncSuccess } from '../../src/lib/syncQueue';
import type { MissionVisibility } from '../../src/types/habit';
import { ConfettiBurst } from '../../src/components/ConfettiBurst';
import { StreakBanner } from '../../src/components/StreakBanner';
import {
  calendarDateForMissionDayIndex,
  getActiveMissionDaySlot,
  isHabitCalendarDateToggleable,
} from '../../src/utils/missionDaySlots';
import { isMissionGridFull } from '../../src/utils/habitDerived';
import { shouldShowMainMissionTimer } from '../../src/utils/mainMissionUi';
import { StreakMemorySheet } from '../../src/components/StreakMemorySheet';
import { StreakMemoryGallery } from '../../src/components/StreakMemoryGallery';
import { GroupChallengeSheet } from '../../src/components/GroupChallengeSheet';
import { MissionDetailsSheet } from '../../src/components/MissionDetailsSheet';
import { PlusBadge } from "../../src/components/PlusBadge";
import type { StreakMemory } from '../../src/types/habit';
import {
    canUseStreakMemoryUpload,
    shouldUploadLocalStreakImage,
    uploadHabitStreakMemoryImage,
} from '../../src/lib/streakMemoryStorage';
import { useAuth } from '../../src/context/AuthContext';
import { usePremium } from '../../src/context/PremiumContext';
import { usePlusUpsell } from '../../src/context/PlusUpsellContext';
import { isSupabaseConfigured } from '../../src/lib/env';
import {
  leaveChallengeGroup,
  listChallengeInviteeStatusesForChallenge,
  refreshCohortPeerHabits,
} from '../../src/lib/groupChallengesApi';
import {
  postCommunityWin,
  deleteCommunityWin,
  deleteAllCommunityWinsForHabit,
  habitStreakCommunityWinId,
} from '../../src/lib/communityWinsApi';

const LOCKED_CHECKIN_MSG =
    'You can only check in for the current mission day. Each day unlocks 24 hours after the mission started (day 2 after the first 24 hours, and so on).';

type MissionDialogState =
    | { kind: 'none' }
    | { kind: 'reset' }
    | { kind: 'delete' }
    | { kind: 'leaveGroup' }
    | { kind: 'blockedReset' }
    | { kind: 'signInRequired' };

function getMilestones(totalDays: number, mode: string): number[] {
    if (mode === 'autopilot') return [7, 14, 21];
    const m1 = Math.round(totalDays / 3);
    const m2 = Math.round((totalDays * 2) / 3);
    const m3 = totalDays;
    return [...new Set([m1, m2, m3])];
}

function AnimatedDayCell({
    day,
    isCompleted,
    isMilestone,
    isCurrentMissionDay,
    locked,
    canInteract,
    hasStreakRecord,
    hasMomentMedia,
    onPress,
}: {
    day: number;
    isCompleted: boolean;
    isMilestone: boolean;
    /** Current 24h mission slot — highlight + pulse when not yet completed */
    isCurrentMissionDay: boolean;
    /** Not yet unlocked, missed, or mission ended — show lock when incomplete */
    locked: boolean;
    canInteract: boolean;
    /** Any streak memory row (rich moment or check-in-only lock). */
    hasStreakRecord: boolean;
    /** Photo or note saved for this day (amber dot). */
    hasMomentMedia: boolean;
    onPress: () => void;
}) {
    const { theme } = useTheme();
    const reduceMotion = useReducedMotion();
    const scale = useRef(new Animated.Value(1)).current;
    const shimmer = useRef(new Animated.Value(0)).current;
    const todayPulse = useRef(new Animated.Value(1)).current;

    useMemo(() => {
        if (reduceMotion) return;
        if (isCurrentMissionDay && !isCompleted) {
            Animated.loop(Animated.sequence([
                Animated.timing(todayPulse, { toValue: 1.06, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
                Animated.timing(todayPulse, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
            ])).start();
        }
    }, [reduceMotion, isCurrentMissionDay, isCompleted, todayPulse]);

    useMemo(() => {
        if (reduceMotion) return;
        if (isMilestone && isCompleted) {
            Animated.loop(Animated.sequence([
                Animated.timing(shimmer, { toValue: 1, duration: 2000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
                Animated.timing(shimmer, { toValue: 0, duration: 2000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
            ])).start();
        }
    }, [reduceMotion, isMilestone, isCompleted, shimmer]);

    const handlePress = useCallback(() => {
        Animated.sequence([
            Animated.spring(scale, { toValue: 0.82, tension: 250, friction: 6, useNativeDriver: true }),
            Animated.spring(scale, { toValue: 1, tension: 200, friction: 5, useNativeDriver: true }),
        ]).start();
        onPress();
    }, [onPress, scale]);

    const shimmerOpacity = shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] });

    const dayButtonStyle = [
        styles.dayButton,
        isCompleted
            ? [styles.dayButtonCompleted, { backgroundColor: theme.colors.indigo[600], ...theme.shadow.glow }]
            : [styles.dayButtonIncomplete, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }],
        isCompleted && isMilestone && styles.dayButtonMilestone,
        isCurrentMissionDay && !isCompleted && { borderColor: theme.colors.cyan[400], borderWidth: 2 },
        locked && styles.dayButtonFuture,
    ];

    const animatedScale = isCurrentMissionDay && !isCompleted ? Animated.multiply(scale, todayPulse) : scale;

    return (
        <Animated.View style={{ width: '13%', aspectRatio: 1, marginBottom: 14, transform: [{ scale: animatedScale as any }] }}>
            <TouchableOpacity
                onPress={handlePress}
                style={dayButtonStyle}
                activeOpacity={0.8}
                disabled={!(canInteract || (isCompleted && hasStreakRecord))}
            >
                {isCompleted ? (
                    <Animated.View style={[styles.badgeWrap, isMilestone && { opacity: shimmerOpacity }]}>
                        {isMilestone ? <View style={styles.milestoneHalo} /> : null}
                        <View style={[styles.badgeCore, isMilestone ? styles.badgeCoreMilestone : null]}>
                            <Text style={[styles.completedDayText, isMilestone ? styles.completedDayTextMilestone : null]}>{day}</Text>
                        </View>
                        {isMilestone ? (
                            <Star size={9} color={theme.colors.yellow[400]} fill={theme.colors.yellow[400]} style={styles.badgeAccent} />
                        ) : (
                            <Sparkles size={9} color={theme.colors.cyan[400]} style={styles.badgeAccent} />
                        )}
                        {hasMomentMedia ? (
                            <View style={[styles.memoryDot, { backgroundColor: theme.colors.amber[500], borderColor: theme.colors.surface }]} />
                        ) : null}
                    </Animated.View>
                ) : locked ? (
                    <Lock size={15} color={theme.colors.textMuted} />
                ) : (
                    <Text style={[styles.dayText, isCurrentMissionDay ? { color: theme.colors.cyan[400] } : { color: theme.colors.textMuted }]}>{day}</Text>
                )}
            </TouchableOpacity>
        </Animated.View>
    );
}

export default function HabitDetail() {
    const { id } = useLocalSearchParams<{ id?: string | string[] }>();
    const router = useRouter();
    const { theme, isDark } = useTheme();
    const { showToast } = useToast();
    const { session } = useAuth();
    const { isPremium, loading: premiumLoading } = usePremium();
    const { openUpsell } = usePlusUpsell();
    const socialLocked = !isPremium || premiumLoading;
    const habitId = Array.isArray(id) ? id[0] : id;

    const habit = useHabitStore((state) => (habitId ? state.getHabit(habitId) : undefined));
    const toggleCompletion = useHabitStore((state) => state.toggleCompletion);
    const setStreakMemory = useHabitStore((state) => state.setStreakMemory);
    const patchStreakMemory = useHabitStore((state) => state.patchStreakMemory);
    const resetHabit = useHabitStore((state) => state.resetHabit);
    const deleteHabit = useHabitStore((state) => state.deleteHabit);
    const setHabitVisibility = useHabitStore((state) => state.setHabitVisibility);
    const setMissionReport = useHabitStore((state) => state.setMissionReport);

    const lastVisibilityRef = useRef<{ id: string; prev: MissionVisibility } | null>(null);

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

    const mode = habit?.mode ?? 'autopilot';
    const totalDays = habit?.totalDays ?? 21;
    const milestones = useMemo(() => getMilestones(totalDays, mode), [totalDays, mode]);

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
    const [habitCommunityBusy, setHabitCommunityBusy] = useState(false);
    /** Keeps the Community Switch visually ON while publish is in flight (controlled `posted` is still false). */
    const [habitCommunityPublishPending, setHabitCommunityPublishPending] = useState(false);
    /** Avoid Mission not found flash after delete/leave; store clears before navigation finishes. */
    const [pendingExitAfterRemove, setPendingExitAfterRemove] = useState(false);
    const pendingMemoryRef = useRef<{ dateStr: string; day: number; dayIndex: number } | null>(null);

    useEffect(() => {
        const tick = habit && !habit.isCompleted ? 30_000 : 60_000;
        const t = setInterval(() => setNow(Date.now()), tick);
        return () => clearInterval(t);
    }, [habit?.id, habit?.isCompleted]);

    useFocusEffect(
        useCallback(() => {
            setNow(Date.now());
        }, []),
    );

    const memoryGalleryEntries = useMemo(() => {
        const raw = habit?.streakMemories ?? {};
        return Object.entries(raw)
            .filter(([, memory]) => {
                if (memory.checkInOnly) {
                    return Boolean(memory.note?.trim() || memory.imageUrl || memory.imageUri);
                }
                return true;
            })
            .map(([dateStr, memory]) => ({ dateStr, memory }))
            .sort((a, b) => (a.dateStr < b.dateStr ? 1 : -1));
    }, [habit?.streakMemories]);

    const showMissionReportInsteadOfTimer = useMemo(() => {
        if (!habit) return false;
        return !shouldShowMainMissionTimer(habit, now);
    }, [habit, now]);

    const fireCompletionCelebration = useCallback(
        (dayIndex: number, day: number, isMilestone: boolean) => {
            const col = dayIndex % 7;
            const row = Math.floor(dayIndex / 7);
            const cellSize = 50;
            const x = col * cellSize + cellSize / 2;
            const y = row * cellSize + cellSize / 2;
            setConfetti({ active: false, milestone: false, x: 0, y: 0 });
            setTimeout(() => {
                setConfetti({ active: true, milestone: isMilestone, x, y });
            }, 50);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        },
        [],
    );

    const handleMemoryCommit = useCallback(
        async (memory: StreakMemory | null, meta?: { publishToCommunity?: boolean }) => {
            const ctx = pendingMemoryRef.current;
            if (!ctx || !habit) return;

            let memoryToSave = memory;
            if (
                memory &&
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
                    Alert.alert('Photo required', 'Community posts need a photo. Add a photo and save again to publish.', [
                        { text: 'OK' },
                    ]);
                    return;
                }
                if (socialLocked) {
                    openUpsell('community_publish');
                    return;
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
                    Alert.alert(
                        'Can’t publish',
                        'Cloud sync isn’t configured. Your moment is saved; Community wasn’t updated.',
                        [{ text: 'OK' }],
                    );
                    return;
                }
                if (!session?.user) {
                    Alert.alert(
                        'Sign in to publish',
                        'Sign in to share this moment in Community. Your check-in is saved.',
                        [{ text: 'OK' }],
                    );
                    return;
                }
                const winId = habitStreakCommunityWinId(habit.id, ctx.dateStr);
                const streakAfter = useHabitStore.getState().getHabit(habit.id)?.streak ?? 1;
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
                    Alert.alert('Couldn’t publish', res.error, [{ text: 'OK' }]);
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
            socialLocked,
            openUpsell,
        ],
    );

    const handleHabitMemoryCommunityChange = useCallback(
        async (next: boolean, dateStr: string, day: number) => {
            if (!habitId || !habit) return;
            const mem = habit.streakMemories?.[dateStr];
            if (!mem || mem.communityFeedRevoked) return;

            if (next) {
                if (socialLocked) {
                    openUpsell('community_publish');
                    return;
                }
                if (mem.communityPosted) return;
                const hasMemoryImage = Boolean(mem.imageUrl || mem.imageUri);
                if (!hasMemoryImage) {
                    Alert.alert(
                        'Photo required',
                        'Community posts need a photo. This moment only has text, so it can’t be shared to the feed.',
                        [{ text: 'OK' }],
                    );
                    return;
                }
                if (!isSupabaseConfigured()) {
                    Alert.alert('Can’t publish', 'Cloud sync isn’t configured.', [{ text: 'OK' }]);
                    return;
                }
                if (!session?.user) {
                    Alert.alert('Sign in to publish', 'Sign in to share this moment in Community.', [{ text: 'OK' }]);
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
                        Alert.alert('Couldn’t publish', res.error, [{ text: 'OK' }]);
                    }
                } finally {
                    setHabitCommunityBusy(false);
                    setHabitCommunityPublishPending(false);
                }
                return;
            }

            if (!mem.communityPosted) return;
            Alert.alert(
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
                                        Alert.alert('Couldn’t remove', del.error, [{ text: 'OK' }]);
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
        [habit, habitId, session?.user, patchStreakMemory, showToast, socialLocked, openUpsell],
    );

    const configured = isSupabaseConfigured();
    const signedIn = Boolean(session?.user);

    useEffect(() => {
        if (!habit?.challengeGroupId || !configured || !signedIn) {
            setAcceptedGroupMemberCount(0);
            return;
        }
        if (!memoryUi || memoryUi.kind !== 'create') {
            setAcceptedGroupMemberCount(0);
            return;
        }
        let cancelled = false;
        void listChallengeInviteeStatusesForChallenge(habit.challengeGroupId)
            .then((m) => {
                if (cancelled) return;
                const acceptedInvites = Object.values(m ?? {}).filter((s) => s === 'accepted').length;
                // Count includes the creator/owner + accepted invitees.
                setAcceptedGroupMemberCount(1 + acceptedInvites);
            })
            .catch(() => {
                if (!cancelled) setAcceptedGroupMemberCount(0);
            });
        return () => {
            cancelled = true;
        };
    }, [habit?.challengeGroupId, configured, signedIn, memoryUi]);

    if (!habit) {
        return (
            <Screen>
                {pendingExitAfterRemove ? (
                    <View style={styles.notFoundContainer}>
                        <ActivityIndicator size="large" color={theme.colors.cyan[400]} />
                    </View>
                ) : (
                    <View style={styles.notFoundContainer}>
                        <Text style={[styles.notFoundText, { color: theme.colors.textPrimary, fontSize: theme.typography.body }]}>Mission not found</Text>
                        <Button title='Go Back' onPress={() => router.back()} style={styles.notFoundButton} />
                    </View>
                )}
            </Screen>
        );
    }

    const isGroupMission = Boolean(habit.challengeGroupId);
    const showSquadShare = isGroupMission && acceptedGroupMemberCount >= 2 && configured && signedIn;

    const handleReset = () => {
        if (isGroupMission) {
            setMissionDialog({ kind: 'blockedReset' });
            return;
        }
        setMissionDialog({ kind: 'reset' });
    };

    const handleDelete = () => {
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

    const days = Array.from({ length: totalDays }, (_, i) => i + 1);

    const getDayDate = (dayIndex: number) => calendarDateForMissionDayIndex(habit.startDate, dayIndex);

    const isManual = mode === 'manual';
    const activeMissionDaySlot = getActiveMissionDaySlot(habit.startDate, now, totalDays);

    const handleDayPress = (dayIndex: number, day: number) => {
        const dateStr = getDayDate(dayIndex);
        const wasCompleted = habit.completedDates.includes(dateStr);
        const canInteract = activeMissionDaySlot !== null && day === activeMissionDaySlot;

        if (!wasCompleted) {
            if (!isHabitCalendarDateToggleable(habit, dateStr, Date.now())) {
                showToast(LOCKED_CHECKIN_MSG, 'info', 5000);
                return;
            }
            pendingMemoryRef.current = { dateStr, day, dayIndex };
            setMemoryUi({ kind: 'create', dateStr, day, dayIndex });
            return;
        }

        const mem = habit.streakMemories?.[dateStr];
        if (mem) {
            setMemoryUi({ kind: 'view', memory: mem, dateStr, day });
            return;
        }

        if (!canInteract) {
            showToast(LOCKED_CHECKIN_MSG, 'info', 5000);
            return;
        }

        const changed = toggleCompletion(habit.id, dateStr);
        if (!changed) {
            showToast(LOCKED_CHECKIN_MSG, 'info', 5000);
            return;
        }
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    };

    return (
        <Screen>
            <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={theme.colors.background} />

            <View style={styles.header}>
                <TouchableOpacity style={[styles.iconButton, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]} onPress={() => router.back()}>
                    <ArrowLeft size={theme.icon.xl} color={theme.colors.textPrimary} />
                </TouchableOpacity>
                <View style={styles.headerActions}>
                    <TouchableOpacity
                        style={[styles.iconButton, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
                        onPress={() => setGroupSheetOpen(true)}
                        accessibilityLabel="Group mission"
                    >
                        <Users size={theme.icon.xl} color={theme.colors.cyan[400]} />
                    </TouchableOpacity>
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

            <GroupChallengeSheet visible={groupSheetOpen} onClose={() => setGroupSheetOpen(false)} habit={habit} />
            <MissionDetailsSheet visible={missionDetailsOpen} onClose={() => setMissionDetailsOpen(false)} habit={habit} />

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
                squadShare={{
                    show: showSquadShare,
                    visibility: habit.visibility ?? 'solo',
                    onToggle: (nextPublic) => {
                        const next = nextPublic ? 'public' : 'solo';
                        const prev = habit.visibility ?? 'solo';
                        if (prev === next) return;
                        if (next === 'public' && socialLocked) {
                            openUpsell('visibility');
                            return;
                        }
                        lastVisibilityRef.current = { id: habit.id, prev };
                        setHabitVisibility(habit.id, next);
                    },
                }}
                habitViewCommunity={
                    memoryUi?.kind === 'view'
                        ? (() => {
                              const viewMem =
                                  habit.streakMemories?.[memoryUi.dateStr] ?? memoryUi.memory;
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
                                  onChange: (v) =>
                                      void handleHabitMemoryCommunityChange(v, memoryUi.dateStr, memoryUi.day),
                              };
                          })()
                        : undefined
                }
                onClose={() => {
                    pendingMemoryRef.current = null;
                    setMemoryUi(null);
                }}
                onCommit={memoryUi?.kind !== 'view' ? handleMemoryCommit : undefined}
            />

            <ScrollView showsVerticalScrollIndicator={false}>
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
                    <Timer startDate={habit.startDate} mode={mode} endDate={habit.endDate} />
                )}

                <View style={[styles.visibilityRow, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderRadius: theme.radius.md }]}>
                    {(habit.visibility ?? 'solo') === 'public' ? (
                        <Globe size={theme.icon.md} color={theme.colors.cyan[400]} />
                    ) : (
                        <User size={theme.icon.md} color={theme.colors.indigo[400]} />
                    )}
                    <View style={styles.visibilityTextCol}>
                        {(habit.visibility ?? 'solo') === 'public' ? (
                            <>
                                <View style={styles.visibilityTitleRow}>
                                    <Text style={[styles.visibilityTitle, { color: theme.colors.textPrimary }]}>Public</Text>
                                    <PlusBadge withFlame />
                                </View>
                                <Text style={[styles.visibilityHint, { color: theme.colors.textMuted }]}>
                                    Visible to your squad on this mission.
                                </Text>
                            </>
                        ) : (
                            <>
                                <Text style={[styles.visibilityTitle, { color: theme.colors.textPrimary }]}>Solo</Text>
                                <Text style={[styles.visibilityHint, { color: theme.colors.textMuted }]}>
                                    Private to you on this mission.
                                </Text>
                            </>
                        )}
                    </View>
                    <Switch
                        value={(habit.visibility ?? 'solo') === 'public'}
                        onValueChange={(v) => {
                            const next = v ? 'public' : 'solo';
                            const prev = habit.visibility ?? 'solo';
                            if (prev === next) return;
                            if (next === 'public' && socialLocked) {
                                openUpsell('visibility');
                                return;
                            }
                            lastVisibilityRef.current = { id: habit.id, prev };
                            setHabitVisibility(habit.id, next);
                        }}
                        trackColor={{ false: theme.colors.border, true: theme.colors.indigo[600] }}
                        thumbColor={theme.colors.white}
                        ios_backgroundColor={theme.colors.border}
                    />
                </View>

                <StreakBanner streak={habit.streak} />

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

                <Text style={[styles.gridTitle, { color: theme.colors.textPrimary, fontSize: theme.typography.h3 }]}>
                    {isManual ? `${totalDays}-Day Grid` : '21-Day Grid'}
                </Text>

                <View style={styles.grid} ref={gridRef} onLayout={(e: LayoutChangeEvent) => { setGridLayout({ x: e.nativeEvent.layout.x, y: e.nativeEvent.layout.y }); }}>
                    {confetti.active && <ConfettiBurst active={confetti.active} isMilestone={confetti.milestone} originX={confetti.x} originY={confetti.y} />}

                    {days.map((day, index) => {
                        const dateStr = getDayDate(index);
                        const isCompleted = habit.completedDates.includes(dateStr);
                        const isMilestone = milestones.includes(day);
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

                        return (
                            <AnimatedDayCell
                                key={day}
                                day={day}
                                isCompleted={isCompleted}
                                isMilestone={isMilestone}
                                isCurrentMissionDay={isCurrentMissionDay}
                                locked={locked}
                                canInteract={canInteract}
                                hasStreakRecord={hasStreakRecord}
                                hasMomentMedia={hasMomentMedia}
                                onPress={() => handleDayPress(index, day)}
                            />
                        );
                    })}

                    {(() => {
                        const remainder = totalDays % 7;
                        if (remainder === 0) return null;
                        return Array.from({ length: 7 - remainder }, (_, i) => <View key={`ph-${i}`} style={styles.dayButtonPlaceholder} />);
                    })()}
                </View>

                <StreakMemoryGallery entries={memoryGalleryEntries} />
            </ScrollView>

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
                                        setMissionDialog({ kind: 'none' });
                                        if (resetHabit(habit.id)) {
                                            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                                            showToast('Mission reset', 'success');
                                            router.back();
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
                                          setMissionDialog({ kind: 'none' });
                                          setPendingExitAfterRemove(true);
                                          void (async () => {
                                              await deleteAllCommunityWinsForHabit(habit);
                                              deleteHabit(habit.id);
                                              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                                              showToast('Mission deleted', 'success');
                                              router.back();
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
                                            setMissionDialog({ kind: 'none' });
                                            if (!challengeId) return;
                                            void (async () => {
                                                const { error } = await leaveChallengeGroup(challengeId);
                                                if (error) {
                                                    showToast(error.message, 'error');
                                                    return;
                                                }
                                                await deleteAllCommunityWinsForHabit(habit);
                                                setPendingExitAfterRemove(true);
                                                deleteHabit(habit.id);
                                                await refreshCohortPeerHabits().catch(() => {});
                                                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                                                showToast('Left group mission', 'success');
                                                router.back();
                                            })();
                                        },
                                    },
                                ]
                              : [{ label: 'OK', onPress: () => setMissionDialog({ kind: 'none' }) }]
                }
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
    visibilityRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderWidth: 1, marginBottom: 20 },
    visibilityTextCol: { flex: 1 },
    visibilityTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    visibilityTitle: { fontWeight: '700', fontSize: 14 },
    visibilityHint: { fontSize: 11, marginTop: 3, lineHeight: 15 },
    progressCard: { padding: 20, marginBottom: 28, borderWidth: 1 },
    progressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 14 },
    progressLabel: { fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
    progressValue: { fontSize: 24, fontWeight: '800' },
    progressTotal: { fontSize: 16 },
    progressBarBackground: { height: 12, borderRadius: 9999, overflow: 'hidden' },
    progressBarFill: { height: '100%', borderRadius: 9999 },
    gridTitle: { fontWeight: '700', marginBottom: 14 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', paddingBottom: 24, position: 'relative' },
    dayButton: { width: '100%', height: '100%', borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    dayButtonCompleted: {},
    dayButtonMilestone: { backgroundColor: '#4b3dc2', shadowColor: '#fbbf24', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.45, shadowRadius: 14, elevation: 8 },
    dayButtonIncomplete: { borderWidth: 1 },
    dayButtonFuture: { opacity: 0.45 },
    dayText: { fontWeight: '700', fontSize: 16 },
    badgeWrap: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
    milestoneHalo: { position: 'absolute', width: '90%', height: '90%', borderRadius: 10, backgroundColor: 'rgba(251, 191, 36, 0.16)' },
    badgeCore: { width: '72%', height: '72%', borderRadius: 9999, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255, 255, 255, 0.16)', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.26)' },
    badgeCoreMilestone: { backgroundColor: 'rgba(251, 191, 36, 0.24)', borderColor: 'rgba(251, 191, 36, 0.58)' },
    completedDayText: { color: '#ffffff', fontSize: 14, fontWeight: '800' },
    completedDayTextMilestone: { color: '#fff7dc' },
    badgeAccent: { position: 'absolute', top: 6, right: 6 },
    memoryDot: { position: 'absolute', bottom: 5, width: 7, height: 7, borderRadius: 4, borderWidth: 1.5 },
    dayButtonPlaceholder: { width: '13%', aspectRatio: 1, marginBottom: 14 },
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
