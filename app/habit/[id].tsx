import { useCallback, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, StyleSheet, StatusBar, Animated, Easing, LayoutChangeEvent } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { ArrowLeft, Trash2, Lock, RotateCcw, Sparkles, Star, Plane, Gamepad2 } from 'lucide-react-native';
import { useHabitStore } from '../../src/store/habitStore';
import { Button } from '../../src/components/Button';
import { Timer } from '../../src/components/Timer';
import { QuoteCard } from '../../src/components/QuoteCard';
import { Screen } from '../../src/components/Screen';
import { useTheme } from '../../src/context/ThemeContext';
import { ConfettiBurst } from '../../src/components/ConfettiBurst';
import { StreakBanner } from '../../src/components/StreakBanner';

function getMilestones(totalDays: number, mode: string): number[] {
    if (mode === 'autopilot') return [7, 14, 21];
    const m1 = Math.round(totalDays / 3);
    const m2 = Math.round((totalDays * 2) / 3);
    const m3 = totalDays;
    return [...new Set([m1, m2, m3])];
}

function AnimatedDayCell({
    day, isCompleted, isMilestone, isToday, isYesterday, isFuture, onPress,
}: {
    day: number; isCompleted: boolean; isMilestone: boolean; isToday: boolean; isYesterday: boolean; isFuture: boolean; onPress: () => void;
}) {
    const { theme, isDark } = useTheme();
    const scale = useRef(new Animated.Value(1)).current;
    const shimmer = useRef(new Animated.Value(0)).current;
    const todayPulse = useRef(new Animated.Value(1)).current;
    const isEditable = isToday || isYesterday;

    useMemo(() => {
        if (isToday && !isCompleted) {
            Animated.loop(Animated.sequence([
                Animated.timing(todayPulse, { toValue: 1.06, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
                Animated.timing(todayPulse, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
            ])).start();
        }
    }, [isToday, isCompleted, todayPulse]);

    useMemo(() => {
        if (isMilestone && isCompleted) {
            Animated.loop(Animated.sequence([
                Animated.timing(shimmer, { toValue: 1, duration: 2000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
                Animated.timing(shimmer, { toValue: 0, duration: 2000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
            ])).start();
        }
    }, [isMilestone, isCompleted, shimmer]);

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
        isToday && !isCompleted && { borderColor: theme.colors.cyan[400], borderWidth: 2 },
        (isFuture || !isEditable) && styles.dayButtonFuture,
    ];

    const animatedScale = isToday && !isCompleted ? Animated.multiply(scale, todayPulse) : scale;

    return (
        <Animated.View style={{ width: '13%', aspectRatio: 1, marginBottom: 14, transform: [{ scale: animatedScale as any }] }}>
            <TouchableOpacity onPress={handlePress} style={dayButtonStyle} activeOpacity={0.8} disabled={isFuture}>
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
                    </Animated.View>
                ) : isFuture ? (
                    <Lock size={15} color={theme.colors.textMuted} />
                ) : (
                    <Text style={[styles.dayText, isToday ? { color: theme.colors.cyan[400] } : { color: theme.colors.textMuted }]}>{day}</Text>
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
    const resetHabit = useHabitStore((state) => state.resetHabit);
    const deleteHabit = useHabitStore((state) => state.deleteHabit);

    const mode = habit?.mode ?? 'autopilot';
    const totalDays = habit?.totalDays ?? 21;
    const milestones = useMemo(() => getMilestones(totalDays, mode), [totalDays, mode]);

    const [confetti, setConfetti] = useState<{ active: boolean; milestone: boolean; x: number; y: number }>({ active: false, milestone: false, x: 0, y: 0 });
    const gridRef = useRef<View>(null);
    const [gridLayout, setGridLayout] = useState({ x: 0, y: 0 });

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

    const handleDayPress = (dayIndex: number, day: number) => {
        const dateStr = getDayDate(dayIndex);
        const wasCompleted = habit.completedDates.includes(dateStr);
        const changed = toggleCompletion(habit.id, dateStr);
        if (!changed) { Alert.alert('Locked day', 'You can only edit check-ins for today and yesterday.'); return; }

        if (!wasCompleted) {
            const isMilestone = milestones.includes(day);
            const col = dayIndex % 7;
            const row = Math.floor(dayIndex / 7);
            const cellSize = 50;
            const x = col * cellSize + cellSize / 2;
            const y = row * cellSize + cellSize / 2;
            setConfetti({ active: false, milestone: false, x: 0, y: 0 });
            setTimeout(() => { setConfetti({ active: true, milestone: isMilestone, x, y }); }, 50);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } else {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
    };

    const isManual = mode === 'manual';
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return (
        <Screen>
            <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={theme.colors.background} />

            <View style={styles.header}>
                <TouchableOpacity style={[styles.iconButton, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]} onPress={() => router.back()}>
                    <ArrowLeft size={22} color={theme.colors.textPrimary} />
                </TouchableOpacity>
                <View style={styles.headerActions}>
                    <TouchableOpacity style={styles.resetButton} onPress={handleReset}>
                        <RotateCcw size={22} color={theme.colors.amber[500]} />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
                        <Trash2 size={22} color={theme.colors.red[500]} />
                    </TouchableOpacity>
                </View>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
                <View style={[styles.modeBadge, isManual && styles.modeBadgeManual]}>
                    {isManual ? <Gamepad2 size={13} color={theme.colors.amber[500]} /> : <Plane size={13} color={theme.colors.cyan[400]} />}
                    <Text style={[styles.modeBadgeText, { color: theme.colors.cyan[400] }, isManual && { color: theme.colors.amber[500] }]}>
                        {isManual ? 'MANUAL CONTROL' : 'AUTOPILOT'}
                    </Text>
                </View>

                <Text style={[styles.title, { color: theme.colors.textPrimary, fontSize: theme.typography.h1 }]}>{habit.title}</Text>
                <Text style={[styles.description, { color: theme.colors.textSecondary, fontSize: theme.typography.body }]}>{habit.description || 'No brief added yet.'}</Text>

                <StreakBanner streak={habit.streak} />
                <Timer startDate={habit.startDate} mode={mode} endDate={habit.endDate} />
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
                        const dayDate = new Date(dateStr);
                        dayDate.setHours(0, 0, 0, 0);
                        const isFuture = dayDate > today;
                        const isTodayCell = dayDate.getTime() === today.getTime();
                        const yesterday = new Date(today);
                        yesterday.setDate(yesterday.getDate() - 1);
                        const isYesterday = dayDate.getTime() === yesterday.getTime();

                        return (
                            <AnimatedDayCell
                                key={day} day={day} isCompleted={isCompleted} isMilestone={isMilestone}
                                isToday={isTodayCell} isYesterday={isYesterday} isFuture={isFuture}
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
    title: { fontWeight: '800', marginBottom: 8 },
    description: { marginBottom: 20 },
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
    dayButtonPlaceholder: { width: '13%', aspectRatio: 1, marginBottom: 14 },
});
