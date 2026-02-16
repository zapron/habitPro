import React, { memo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { TreePine, Flame, Check, Plane, Gamepad2 } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { Habit } from '../types/habit';
import { AnimatedFire } from './AnimatedFire';
import { ProgressRing } from './ProgressRing';

interface HabitCardProps {
    item: Habit;
}

export const HabitCard = memo(({ item }: HabitCardProps) => {
    const router = useRouter();
    const { theme } = useTheme();
    const totalDays = item.totalDays ?? 21;
    const isFinished = item.completedDates.length >= totalDays;
    const isActive = item.streak > 0 && !isFinished;
    const isManual = (item.mode ?? 'autopilot') === 'manual';
    const progress = Math.min(item.completedDates.length / totalDays, 1);

    return (
        <TouchableOpacity
            style={[
                styles.card,
                {
                    backgroundColor: theme.colors.surface,
                    borderRadius: theme.radius.lg,
                    borderColor: theme.colors.border,
                    ...theme.shadow.card,
                },
            ]}
            activeOpacity={0.9}
            onPress={() => router.push(`/habit/${item.id}`)}
        >
            <View style={styles.cardContent}>
                <View style={[styles.modePill, isManual && styles.modePillManual]}>
                    {isManual ? (
                        <Gamepad2 size={10} color={theme.colors.amber[500]} />
                    ) : (
                        <Plane size={10} color={theme.colors.cyan[400]} />
                    )}
                    <Text style={[styles.modePillText, { color: theme.colors.cyan[400] }, isManual && { color: theme.colors.amber[500] }]}>
                        {isManual ? `MANUAL · ${totalDays}D` : 'AUTOPILOT'}
                    </Text>
                </View>

                <Text style={[styles.cardTitle, { color: theme.colors.textPrimary, fontSize: theme.typography.h3 }]}>{item.title}</Text>
                {item.description ? (
                    <Text style={[styles.cardDescription, { color: theme.colors.textSecondary }]} numberOfLines={1}>
                        {item.description}
                    </Text>
                ) : null}

                {!isFinished && (
                    <View style={styles.progressBarBg}>
                        <View
                            style={{
                                height: '100%',
                                width: `${progress * 100}%`,
                                backgroundColor: isManual
                                    ? theme.colors.amber[500]
                                    : isActive
                                        ? theme.colors.amber[500]
                                        : theme.colors.cyan[500],
                                borderRadius: 2,
                            }}
                        />
                    </View>
                )}

                <View style={styles.cardStats}>
                    <View style={styles.statIcon}>
                        {isFinished ? (
                            <TreePine size={20} color={theme.colors.green[500]} />
                        ) : isActive ? (
                            <AnimatedFire size={20} />
                        ) : (
                            <Flame size={20} color={theme.colors.textMuted} />
                        )}
                    </View>
                    <Text
                        style={[
                            styles.cardStreak,
                            isFinished
                                ? { color: theme.colors.green[500] }
                                : isActive
                                    ? { color: theme.colors.amber[500] }
                                    : { color: theme.colors.textMuted },
                        ]}
                    >
                        {isFinished ? 'Completed!' : `${item.streak} day streak`}
                    </Text>
                    {!isFinished && (
                        <Text style={[styles.cardProgress, { color: theme.colors.textMuted }]}>
                            {Math.round(progress * 100)}%
                        </Text>
                    )}
                </View>
            </View>

            <ProgressRing
                progress={progress}
                size={52}
                strokeWidth={3}
                color={isManual ? theme.colors.amber[500] : isFinished ? theme.colors.green[500] : theme.colors.indigo[500]}
            >
                {isFinished ? (
                    <Check size={20} color={theme.colors.green[500]} strokeWidth={3} />
                ) : (
                    <Text style={[styles.progressText, { color: theme.colors.textPrimary }]}>{item.completedDates.length}</Text>
                )}
            </ProgressRing>
        </TouchableOpacity>
    );
});

const styles = StyleSheet.create({
    card: {
        padding: 20,
        marginBottom: 16,
        borderWidth: 1,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    cardContent: { flex: 1 },
    modePill: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        gap: 4,
        paddingVertical: 2,
        paddingHorizontal: 8,
        borderRadius: 9999,
        backgroundColor: 'rgba(34, 211, 238, 0.1)',
        marginBottom: 6,
    },
    modePillManual: { backgroundColor: 'rgba(245, 158, 11, 0.1)' },
    modePillText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.8 },
    cardTitle: { fontWeight: '700', marginBottom: 4 },
    cardDescription: { fontSize: 14 },
    cardStats: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
    statIcon: { marginRight: 8 },
    cardStreak: { fontWeight: '700', marginRight: 16 },
    cardProgress: {},
    progressText: { fontWeight: '700', fontSize: 18 },
    progressBarBg: {
        height: 4,
        backgroundColor: 'rgba(100, 116, 139, 0.3)',
        borderRadius: 2,
        marginTop: 8,
        overflow: 'hidden',
        width: '90%',
    },
});
