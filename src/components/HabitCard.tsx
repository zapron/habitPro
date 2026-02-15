import React, { memo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { TreePine, Flame, Check } from 'lucide-react-native';
import { theme } from '../styles/theme';
import { Habit } from '../types/habit';
import { AnimatedFire } from './AnimatedFire';

interface HabitCardProps {
    item: Habit;
}

export const HabitCard = memo(({ item }: HabitCardProps) => {
    const router = useRouter();
    const isFinished = item.completedDates.length >= item.totalDays;
    const isActive = item.streak > 0 && !isFinished;

    return (
        <TouchableOpacity
            style={styles.card}
            activeOpacity={0.9}
            onPress={() => router.push(`/habit/${item.id}`)}
        >
            <View style={styles.cardContent}>
                <Text style={styles.cardTitle}>{item.title}</Text>
                {item.description ? (
                    <Text style={styles.cardDescription} numberOfLines={1}>
                        {item.description}
                    </Text>
                ) : null}

                {!isFinished && (
                    <View style={styles.progressBarBg}>
                        <View
                            style={{
                                height: '100%',
                                width: `${(item.completedDates.length / item.totalDays) * 100}%`,
                                backgroundColor: isActive ? theme.colors.amber[500] : theme.colors.cyan[500],
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
                        <Text style={styles.cardProgress}>
                            {Math.round((item.completedDates.length / item.totalDays) * 100)}%
                        </Text>
                    )}
                </View>
            </View>

            <View style={[styles.progressCircle, isFinished && styles.progressCircleCompleted]}>
                {isFinished ? (
                    <Check size={22} color={theme.colors.white} strokeWidth={3} />
                ) : (
                    <Text style={styles.progressText}>{item.completedDates.length}</Text>
                )}
            </View>
        </TouchableOpacity>
    );
});

const styles = StyleSheet.create({
    card: {
        backgroundColor: theme.colors.surface,
        padding: 20,
        borderRadius: theme.radius.lg,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: theme.colors.border,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        ...theme.shadow.card,
    },
    cardContent: {
        flex: 1,
    },
    cardTitle: {
        fontSize: theme.typography.h3,
        fontWeight: '700',
        color: theme.colors.textPrimary,
        marginBottom: 4,
    },
    cardDescription: {
        color: theme.colors.textSecondary,
        fontSize: 14,
    },
    cardStats: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 12,
    },
    statIcon: {
        marginRight: 8,
    },
    cardStreak: {
        fontWeight: '700',
        marginRight: 16,
    },
    cardProgress: {
        color: theme.colors.textMuted,
    },
    progressCircle: {
        height: 48,
        width: 48,
        borderRadius: 24,
        backgroundColor: theme.colors.surfaceElevated,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: theme.colors.border,
        marginLeft: 12,
    },
    progressCircleCompleted: {
        backgroundColor: theme.colors.green[500],
        borderColor: theme.colors.green[600],
    },
    progressText: {
        color: theme.colors.white,
        fontWeight: '700',
        fontSize: 18,
    },
    progressBarBg: {
        height: 4,
        backgroundColor: theme.colors.slate[700],
        borderRadius: 2,
        marginTop: 8,
        overflow: 'hidden',
        width: '90%',
    },
});
