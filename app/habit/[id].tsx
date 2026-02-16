import { useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, StyleSheet, StatusBar } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { ArrowLeft, Trash2, Lock, RotateCcw, Sparkles, Star, Plane, Gamepad2 } from 'lucide-react-native';
import { useHabitStore } from '../../src/store/habitStore';
import { Button } from '../../src/components/Button';
import { Timer } from '../../src/components/Timer';
import { QuoteCard } from '../../src/components/QuoteCard';
import { Screen } from '../../src/components/Screen';
import { theme } from '../../src/styles/theme';

/** Calculate milestones dynamically based on totalDays and mode. */
function getMilestones(totalDays: number, mode: string): number[] {
    if (mode === 'autopilot') return [7, 14, 21];
    // Manual: ~33%, ~66%, 100%
    const m1 = Math.round(totalDays / 3);
    const m2 = Math.round((totalDays * 2) / 3);
    const m3 = totalDays;
    // Deduplicate in case of very short missions
    return [...new Set([m1, m2, m3])];
}

export default function HabitDetail() {
    const { id } = useLocalSearchParams<{ id?: string | string[] }>();
    const router = useRouter();
    const habitId = Array.isArray(id) ? id[0] : id;

    const habit = useHabitStore((state) => (habitId ? state.getHabit(habitId) : undefined));
    const toggleCompletion = useHabitStore((state) => state.toggleCompletion);
    const resetHabit = useHabitStore((state) => state.resetHabit);
    const deleteHabit = useHabitStore((state) => state.deleteHabit);

    const mode = habit?.mode ?? 'autopilot';
    const totalDays = habit?.totalDays ?? 21;
    const milestones = useMemo(() => getMilestones(totalDays, mode), [totalDays, mode]);

    if (!habit) {
        return (
            <Screen>
                <View style={styles.notFoundContainer}>
                    <Text style={styles.notFoundText}>Mission not found</Text>
                    <Button title='Go Back' onPress={() => router.back()} style={styles.notFoundButton} />
                </View>
            </Screen>
        );
    }

    const handleReset = () => {
        Alert.alert('Reset Mission', 'Restart this mission from day 1?', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Reset',
                style: 'destructive',
                onPress: () => {
                    resetHabit(habit.id);
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    router.back();
                },
            },
        ]);
    };

    const handleDelete = () => {
        Alert.alert('Delete Mission', 'Give up on this mission?', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Delete',
                style: 'destructive',
                onPress: () => {
                    deleteHabit(habit.id);
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    router.back();
                },
            },
        ]);
    };

    const days = Array.from({ length: totalDays }, (_, i) => i + 1);

    const getDayDate = (dayIndex: number) => {
        const start = new Date(habit.startDate);
        start.setDate(start.getDate() + dayIndex);
        return start.toISOString().split('T')[0];
    };

    const isManual = mode === 'manual';

    return (
        <Screen>
            <StatusBar barStyle='light-content' backgroundColor={theme.colors.background} />

            <View style={styles.header}>
                <TouchableOpacity style={styles.iconButton} onPress={() => router.back()}>
                    <ArrowLeft size={22} color={theme.colors.white} />
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
                {/* Mode Badge */}
                <View style={[styles.modeBadge, isManual && styles.modeBadgeManual]}>
                    {isManual ? (
                        <Gamepad2 size={13} color={theme.colors.amber[500]} />
                    ) : (
                        <Plane size={13} color={theme.colors.cyan[400]} />
                    )}
                    <Text style={[styles.modeBadgeText, isManual && styles.modeBadgeTextManual]}>
                        {isManual ? 'MANUAL CONTROL' : 'AUTOPILOT'}
                    </Text>
                </View>

                <Text style={styles.title}>{habit.title}</Text>
                <Text style={styles.description}>{habit.description || 'No brief added yet.'}</Text>

                <Timer startDate={habit.startDate} mode={mode} endDate={habit.endDate} />
                <QuoteCard />

                <View style={styles.progressCard}>
                    <View style={styles.progressHeader}>
                        <Text style={styles.progressLabel}>Campaign Progress</Text>
                        <Text style={styles.progressValue}>
                            {habit.completedDates.length}{' '}
                            <Text style={styles.progressTotal}>/ {totalDays}</Text>
                        </Text>
                    </View>
                    <View style={styles.progressBarBackground}>
                        <View
                            style={[
                                styles.progressBarFill,
                                isManual && styles.progressBarFillManual,
                                { width: `${(habit.completedDates.length / totalDays) * 100}%` },
                            ]}
                        />
                    </View>
                </View>

                <Text style={styles.gridTitle}>
                    {isManual ? `${totalDays}-Day Grid` : '21-Day Grid'}
                </Text>

                <View style={styles.grid}>
                    {(() => {
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);

                        const items = days.map((day, index) => {
                            const dateStr = getDayDate(index);
                            const isCompleted = habit.completedDates.includes(dateStr);
                            const isMilestone = milestones.includes(day);

                            const dayDate = new Date(dateStr);
                            dayDate.setHours(0, 0, 0, 0);

                            const isFuture = dayDate > today;
                            const isToday = dayDate.getTime() === today.getTime();
                            const yesterday = new Date(today);
                            yesterday.setDate(yesterday.getDate() - 1);
                            const isYesterday = dayDate.getTime() === yesterday.getTime();
                            const isEditable = isToday || isYesterday;

                            const dayButtonStyle = [
                                styles.dayButton,
                                isCompleted ? styles.dayButtonCompleted : styles.dayButtonIncomplete,
                                isCompleted && isMilestone ? styles.dayButtonMilestone : null,
                                isToday && !isCompleted ? styles.dayButtonToday : null,
                                (isFuture || !isEditable) ? styles.dayButtonFuture : null,
                            ];

                            return (
                                <TouchableOpacity
                                    key={day}
                                    onPress={() => {
                                        const changed = toggleCompletion(habit.id, dateStr);
                                        if (!changed) {
                                            Alert.alert(
                                                'Locked day',
                                                'You can only edit check-ins for today and yesterday.',
                                            );
                                            return;
                                        }
                                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                                    }}
                                    style={dayButtonStyle}
                                    activeOpacity={0.8}
                                    disabled={isFuture}
                                >
                                    {isCompleted ? (
                                        <View style={styles.badgeWrap}>
                                            {isMilestone ? <View style={styles.milestoneHalo} /> : null}
                                            <View
                                                style={[
                                                    styles.badgeCore,
                                                    isMilestone ? styles.badgeCoreMilestone : null,
                                                ]}
                                            >
                                                <Text
                                                    style={[
                                                        styles.completedDayText,
                                                        isMilestone ? styles.completedDayTextMilestone : null,
                                                    ]}
                                                >
                                                    {day}
                                                </Text>
                                            </View>
                                            {isMilestone ? (
                                                <Star
                                                    size={9}
                                                    color={theme.colors.yellow[400]}
                                                    fill={theme.colors.yellow[400]}
                                                    style={styles.badgeAccent}
                                                />
                                            ) : (
                                                <Sparkles
                                                    size={9}
                                                    color={theme.colors.cyan[400]}
                                                    style={styles.badgeAccent}
                                                />
                                            )}
                                        </View>
                                    ) : isFuture ? (
                                        <Lock size={15} color={theme.colors.textMuted} />
                                    ) : (
                                        <Text
                                            style={[
                                                styles.dayText,
                                                isToday ? styles.dayTextToday : styles.dayTextDefault,
                                            ]}
                                        >
                                            {day}
                                        </Text>
                                    )}
                                </TouchableOpacity>
                            );
                        });

                        // Add invisible placeholders to fill the last row (7 columns)
                        const cols = 7;
                        const remainder = totalDays % cols;
                        if (remainder !== 0) {
                            const placeholders = cols - remainder;
                            for (let i = 0; i < placeholders; i++) {
                                items.push(
                                    <View key={`placeholder-${i}`} style={styles.dayButtonPlaceholder} />,
                                );
                            }
                        }

                        return items;
                    })()}
                </View>
            </ScrollView>
        </Screen>
    );
}

const styles = StyleSheet.create({
    notFoundContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    notFoundText: {
        color: theme.colors.textPrimary,
        fontSize: theme.typography.body,
    },
    notFoundButton: {
        marginTop: 16,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 24,
    },
    headerActions: {
        flexDirection: 'row',
        gap: 8,
    },
    iconButton: {
        padding: 8,
        borderRadius: theme.radius.pill,
        backgroundColor: theme.colors.surface,
        borderWidth: 1,
        borderColor: theme.colors.border,
    },
    resetButton: {
        padding: 8,
        borderRadius: theme.radius.pill,
        backgroundColor: 'rgba(245, 158, 11, 0.12)',
    },
    deleteButton: {
        padding: 8,
        borderRadius: theme.radius.pill,
        backgroundColor: 'rgba(239, 68, 68, 0.14)',
    },
    /* ── Mode badge ── */
    modeBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        gap: 6,
        paddingVertical: 4,
        paddingHorizontal: 10,
        borderRadius: theme.radius.pill,
        backgroundColor: 'rgba(34, 211, 238, 0.1)',
        borderWidth: 1,
        borderColor: 'rgba(34, 211, 238, 0.3)',
        marginBottom: 10,
    },
    modeBadgeManual: {
        backgroundColor: 'rgba(245, 158, 11, 0.1)',
        borderColor: 'rgba(245, 158, 11, 0.3)',
    },
    modeBadgeText: {
        color: theme.colors.cyan[400],
        fontSize: 11,
        fontWeight: '800',
        letterSpacing: 1,
    },
    modeBadgeTextManual: {
        color: theme.colors.amber[500],
    },
    /* ── Content ── */
    title: {
        fontSize: theme.typography.h1,
        fontWeight: '800',
        color: theme.colors.textPrimary,
        marginBottom: 8,
    },
    description: {
        color: theme.colors.textSecondary,
        marginBottom: 28,
        fontSize: theme.typography.body,
    },
    progressCard: {
        backgroundColor: theme.colors.surface,
        padding: 20,
        borderRadius: theme.radius.lg,
        marginBottom: 28,
        borderWidth: 1,
        borderColor: theme.colors.border,
        ...theme.shadow.card,
    },
    progressHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        marginBottom: 14,
    },
    progressLabel: {
        color: theme.colors.textSecondary,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 1,
        fontSize: theme.typography.micro,
    },
    progressValue: {
        fontSize: 24,
        fontWeight: '800',
        color: theme.colors.indigo[400],
    },
    progressTotal: {
        fontSize: 16,
        color: theme.colors.textMuted,
    },
    progressBarBackground: {
        height: 12,
        backgroundColor: theme.colors.slate[700],
        borderRadius: theme.radius.pill,
        overflow: 'hidden',
    },
    progressBarFill: {
        height: '100%',
        backgroundColor: theme.colors.indigo[500],
        borderRadius: theme.radius.pill,
    },
    progressBarFillManual: {
        backgroundColor: theme.colors.amber[500],
    },
    gridTitle: {
        fontSize: theme.typography.h3,
        fontWeight: '700',
        color: theme.colors.textPrimary,
        marginBottom: 14,
    },
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        paddingBottom: 24,
    },
    dayButton: {
        width: '13%',
        aspectRatio: 1,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 14,
    },
    dayButtonCompleted: {
        backgroundColor: theme.colors.indigo[600],
        ...theme.shadow.glow,
    },
    dayButtonMilestone: {
        backgroundColor: '#4b3dc2',
        shadowColor: theme.colors.yellow[400],
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.45,
        shadowRadius: 14,
        elevation: 8,
    },
    dayButtonIncomplete: {
        backgroundColor: theme.colors.surface,
        borderWidth: 1,
        borderColor: theme.colors.border,
    },
    dayButtonToday: {
        borderColor: theme.colors.cyan[400],
        borderWidth: 2,
    },
    dayButtonFuture: {
        opacity: 0.45,
    },
    dayText: {
        fontWeight: '700',
        fontSize: 16,
    },
    dayTextToday: {
        color: theme.colors.cyan[400],
    },
    dayTextDefault: {
        color: theme.colors.textMuted,
    },
    badgeWrap: {
        width: '100%',
        height: '100%',
        alignItems: 'center',
        justifyContent: 'center',
    },
    milestoneHalo: {
        position: 'absolute',
        width: '90%',
        height: '90%',
        borderRadius: 10,
        backgroundColor: 'rgba(251, 191, 36, 0.16)',
    },
    badgeCore: {
        width: '72%',
        height: '72%',
        borderRadius: 9999,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.16)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.26)',
    },
    badgeCoreMilestone: {
        backgroundColor: 'rgba(251, 191, 36, 0.24)',
        borderColor: 'rgba(251, 191, 36, 0.58)',
    },
    completedDayText: {
        color: theme.colors.white,
        fontSize: 14,
        fontWeight: '800',
    },
    completedDayTextMilestone: {
        color: '#fff7dc',
    },
    badgeAccent: {
        position: 'absolute',
        top: 6,
        right: 6,
    },
    dayButtonPlaceholder: {
        width: '13%',
        aspectRatio: 1,
        marginBottom: 14,
    },
});
