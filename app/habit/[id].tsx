import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { View, Text, ScrollView, TouchableOpacity, Alert, StyleSheet, StatusBar, Animated, Easing, LayoutChangeEvent, Switch } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { ArrowLeft, Trash2, Lock, RotateCcw, Sparkles, Star, Plane, Gamepad2, Globe, User, Users, Info } from 'lucide-react-native';
import { useHabitStore } from '../../src/store/habitStore';
import { Button } from '../../src/components/Button';
import { Timer } from '../../src/components/Timer';
import { QuoteCard } from '../../src/components/QuoteCard';
import { Screen } from '../../src/components/Screen';
import { useTheme } from '../../src/context/ThemeContext';
import { useReducedMotion } from '../../src/hooks/useReducedMotion';
import { subscribeSyncFailure, subscribeSyncSuccess } from '../../src/lib/syncQueue';
import type { MissionVisibility } from '../../src/types/habit';
import { ConfettiBurst } from '../../src/components/ConfettiBurst';
import { StreakBanner } from '../../src/components/StreakBanner';
import { getActiveMissionDaySlot, isHabitCalendarDateToggleable } from '../../src/utils/missionDaySlots';
import { StreakMemorySheet } from '../../src/components/StreakMemorySheet';
import { StreakMemoryGallery } from '../../src/components/StreakMemoryGallery';
import { GroupChallengeSheet } from '../../src/components/GroupChallengeSheet';
import { MissionDetailsSheet } from '../../src/components/MissionDetailsSheet';
import type { StreakMemory } from '../../src/types/habit';
import {
    canUseStreakMemoryUpload,
    shouldUploadLocalStreakImage,
    uploadHabitStreakMemoryImage,
} from '../../src/lib/streakMemoryStorage';

function getMilestones(totalDays: number, mode: string): number[] {
    if (mode === 'autopilot') return [7, 14, 21];
    const m1 = Math.round(totalDays / 3);
    const m2 = Math.round((totalDays * 2) / 3);
    const m3 = totalDays;
    return [...new Set([m1, m2, m3])];
}

function AnimatedDayCell({
    day, isCompleted, isMilestone, isCurrentMissionDay, locked, canInteract, hasMemory, onPress, onLongPress,
}: {
    day: number;
    isCompleted: boolean;
    isMilestone: boolean;
    /** Current 24h mission slot — highlight + pulse when not yet completed */
    isCurrentMissionDay: boolean;
    /** Not yet unlocked, missed, or mission ended — show lock when incomplete */
    locked: boolean;
    canInteract: boolean;
    /** Saved photo/note for this check-in */
    hasMemory: boolean;
    onPress: () => void;
    /** e.g. remove check-in when a saved moment exists */
    onLongPress?: () => void;
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
                onLongPress={onLongPress}
                delayLongPress={380}
                style={dayButtonStyle}
                activeOpacity={0.8}
                disabled={!canInteract}
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
                        {hasMemory ? (
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
    const habitId = Array.isArray(id) ? id[0] : id;

    const habit = useHabitStore((state) => (habitId ? state.getHabit(habitId) : undefined));
    const toggleCompletion = useHabitStore((state) => state.toggleCompletion);
    const setStreakMemory = useHabitStore((state) => state.setStreakMemory);
    const resetHabit = useHabitStore((state) => state.resetHabit);
    const deleteHabit = useHabitStore((state) => state.deleteHabit);
    const setHabitVisibility = useHabitStore((state) => state.setHabitVisibility);

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
    const [groupSheetOpen, setGroupSheetOpen] = useState(false);
    const [missionDetailsOpen, setMissionDetailsOpen] = useState(false);
    const pendingMemoryRef = useRef<{ dateStr: string; day: number; dayIndex: number } | null>(null);

    useEffect(() => {
        const t = setInterval(() => setNow(Date.now()), 60_000);
        return () => clearInterval(t);
    }, []);

    useFocusEffect(
        useCallback(() => {
            setNow(Date.now());
        }, []),
    );

    const memoryGalleryEntries = useMemo(() => {
        const raw = habit?.streakMemories ?? {};
        return Object.entries(raw)
            .map(([dateStr, memory]) => ({ dateStr, memory }))
            .sort((a, b) => (a.dateStr < b.dateStr ? 1 : -1));
    }, [habit?.streakMemories]);

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
        async (memory: StreakMemory | null) => {
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
                    Alert.alert('Photo upload failed', msg);
                    throw e;
                }
            }

            const changed = toggleCompletion(habit.id, ctx.dateStr);
            if (!changed) {
                Alert.alert(
                    'Locked',
                    'You can only check in for the current mission day. Each day unlocks 24 hours after the mission started (day 2 after the first 24 hours, and so on).',
                );
                return;
            }
            if (memoryToSave) {
                setStreakMemory(habit.id, ctx.dateStr, memoryToSave);
            }
            const isMilestone = milestones.includes(ctx.day);
            fireCompletionCelebration(ctx.dayIndex, ctx.day, isMilestone);
        },
        [habit, toggleCompletion, setStreakMemory, milestones, fireCompletionCelebration],
    );

    if (!habit) {
        return (
            <Screen>
                <View style={styles.notFoundContainer}>
                    <Text style={[styles.notFoundText, { color: theme.colors.textPrimary, fontSize: theme.typography.body }]}>Mission not found</Text>
                    <Button title='Go Back' onPress={() => router.back()} style={styles.notFoundButton} />
                </View>
            </Screen>
        );
    }

    const handleReset = () => {
        Alert.alert('Reset Mission', 'Restart this mission from day 1?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Reset', style: 'destructive', onPress: () => { resetHabit(habit.id); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); router.back(); } },
        ]);
    };

    const handleDelete = () => {
        Alert.alert('Delete Mission', 'Give up on this mission?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: () => { deleteHabit(habit.id); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); router.back(); } },
        ]);
    };

    const days = Array.from({ length: totalDays }, (_, i) => i + 1);

    const getDayDate = (dayIndex: number) => {
        const start = new Date(habit.startDate);
        start.setDate(start.getDate() + dayIndex);
        return start.toISOString().split('T')[0];
    };

    const isManual = mode === 'manual';
    const activeMissionDaySlot = getActiveMissionDaySlot(habit.startDate, now, totalDays);

    const handleDayLongPress = (dayIndex: number, day: number) => {
        const dateStr = getDayDate(dayIndex);
        const mem = habit.streakMemories?.[dateStr];
        const canInteract = activeMissionDaySlot !== null && day === activeMissionDaySlot;
        if (!mem || !canInteract) return;
        Alert.alert('Remove check-in?', 'This deletes your saved moment for this day.', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Remove',
                style: 'destructive',
                onPress: () => {
                    toggleCompletion(habit.id, dateStr);
                },
            },
        ]);
    };

    const handleDayPress = (dayIndex: number, day: number) => {
        const dateStr = getDayDate(dayIndex);
        const wasCompleted = habit.completedDates.includes(dateStr);
        const canInteract = activeMissionDaySlot !== null && day === activeMissionDaySlot;

        if (!wasCompleted) {
            if (!isHabitCalendarDateToggleable(habit, dateStr, Date.now())) {
                Alert.alert(
                    'Locked',
                    'You can only check in for the current mission day. Each day unlocks 24 hours after the mission started (day 2 after the first 24 hours, and so on).',
                );
                return;
            }
            pendingMemoryRef.current = { dateStr, day, dayIndex };
            setMemoryUi({ kind: 'create', dateStr, day, dayIndex });
            return;
        }

        if (canInteract && habit.streakMemories?.[dateStr]) {
            setMemoryUi({ kind: 'view', memory: habit.streakMemories[dateStr], dateStr, day });
            return;
        }

        const changed = toggleCompletion(habit.id, dateStr);
        if (!changed) {
            Alert.alert(
                'Locked',
                'You can only check in for the current mission day. Each day unlocks 24 hours after the mission started (day 2 after the first 24 hours, and so on).',
            );
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
                    <TouchableOpacity style={styles.resetButton} onPress={handleReset}>
                        <RotateCcw size={theme.icon.xl} color={theme.colors.amber[500]} />
                    </TouchableOpacity>
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
                viewMemory={memoryUi?.kind === 'view' ? memoryUi.memory : undefined}
                missionTitle={habit.title}
                dayLabel={memoryUi ? String(memoryUi.day) : '1'}
                onClose={() => {
                    pendingMemoryRef.current = null;
                    setMemoryUi(null);
                }}
                onCommit={memoryUi?.kind !== 'view' ? handleMemoryCommit : undefined}
            />

            <ScrollView showsVerticalScrollIndicator={false}>
                <View style={[styles.modeBadge, isManual && styles.modeBadgeManual]}>
                    {isManual ? <Gamepad2 size={13} color={theme.colors.amber[500]} /> : <Plane size={13} color={theme.colors.cyan[400]} />}
                    <Text style={[styles.modeBadgeText, { color: theme.colors.cyan[400] }, isManual && { color: theme.colors.amber[500] }]}>
                        {isManual ? 'MANUAL CONTROL' : 'AUTOPILOT'}
                    </Text>
                </View>

                <View style={styles.titleRow}>
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
                    <TouchableOpacity
                        style={styles.titleInfoBtn}
                        onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            setMissionDetailsOpen(true);
                        }}
                        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                        accessibilityRole="button"
                        accessibilityLabel="Mission details and brief"
                    >
                        <Info size={theme.icon.lg} color={theme.colors.indigo[400]} />
                    </TouchableOpacity>
                </View>

                <View style={[styles.visibilityRow, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderRadius: theme.radius.md }]}>
                    {(habit.visibility ?? 'solo') === 'public' ? (
                        <Globe size={theme.icon.md} color={theme.colors.cyan[400]} />
                    ) : (
                        <User size={theme.icon.md} color={theme.colors.indigo[400]} />
                    )}
                    <View style={styles.visibilityTextCol}>
                        {(habit.visibility ?? 'solo') === 'public' ? (
                            <>
                                <Text style={[styles.visibilityTitle, { color: theme.colors.textPrimary }]}>Public</Text>
                                <Text style={[styles.visibilityHint, { color: theme.colors.textMuted }]}>Others can see this later. Turn off to keep it solo.</Text>
                            </>
                        ) : (
                            <>
                                <Text style={[styles.visibilityTitle, { color: theme.colors.textPrimary }]}>Solo</Text>
                                <Text style={[styles.visibilityHint, { color: theme.colors.textMuted }]}>Only you can see this. Turn on to share with others later.</Text>
                            </>
                        )}
                    </View>
                    <Switch
                        value={(habit.visibility ?? 'solo') === 'public'}
                        onValueChange={(v) => {
                            const next = v ? 'public' : 'solo';
                            const prev = habit.visibility ?? 'solo';
                            if (prev === next) return;
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

                <Timer startDate={habit.startDate} mode={mode} endDate={habit.endDate} />

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
                        const hasMemory = Boolean(habit.streakMemories?.[dateStr]);

                        return (
                            <AnimatedDayCell
                                key={day}
                                day={day}
                                isCompleted={isCompleted}
                                isMilestone={isMilestone}
                                isCurrentMissionDay={isCurrentMissionDay}
                                locked={locked}
                                canInteract={canInteract}
                                hasMemory={hasMemory}
                                onPress={() => handleDayPress(index, day)}
                                onLongPress={
                                    isCompleted && hasMemory && canInteract
                                        ? () => handleDayLongPress(index, day)
                                        : undefined
                                }
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
    modeBadge: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, paddingVertical: 4, paddingHorizontal: 10, borderRadius: 9999, backgroundColor: 'rgba(34, 211, 238, 0.1)', borderWidth: 1, borderColor: 'rgba(34, 211, 238, 0.3)', marginBottom: 10 },
    modeBadgeManual: { backgroundColor: 'rgba(245, 158, 11, 0.1)', borderColor: 'rgba(245, 158, 11, 0.3)' },
    modeBadgeText: { fontSize: 11, fontWeight: '800', letterSpacing: 1 },
    titleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        marginBottom: 12,
    },
    title: { fontWeight: '800', flex: 1, minWidth: 0, paddingRight: 4 },
    titleInfoBtn: {
        flexShrink: 0,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 6,
    },
    visibilityRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderWidth: 1, marginBottom: 20 },
    visibilityTextCol: { flex: 1 },
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
});
