import React, { memo } from 'react';
import { Text } from "./AppText";
import {
  View,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { useRouter } from 'expo-router';
import { TreePine, Flame, Check, Plane, Gamepad2, Globe, Swords, Users } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { Habit } from '../types/habit';
import { needsMainMissionOutcome } from '../utils/mainMissionUi';
import { ProgressRing } from './ProgressRing';
import * as Haptics from 'expo-haptics';

interface HabitCardProps {
    item: Habit;
}

export const HabitCard = memo(({ item }: HabitCardProps) => {
    const router = useRouter();
    const { theme } = useTheme();
    const totalDays = Math.max(1, item.totalDays ?? 21);
    const needsReport = needsMainMissionOutcome(item, Date.now());
    const missionWon = item.missionReport === 'accomplished';
    const isManual = (item.mode ?? 'autopilot') === 'manual';
    /** Mission completion: distinct days checked / campaign length */
    const campaignProgress = Math.min(item.completedDates.length / totalDays, 1);
    /** Current consecutive streak as a share of the mission (ring + center number) */
    const streakProgress = Math.min(item.streak / totalDays, 1);

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
            activeOpacity={0.7}
            onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push(`/habit/${item.id}`);
            }}
        >
            <View style={styles.cardContent}>
                <View style={styles.pillRow}>
                    {isManual ? (
                        <Gamepad2 size={14} color={theme.colors.amber[500]} />
                    ) : (
                        <Plane size={14} color={theme.colors.cyan[400]} />
                    )}
                    {(item.visibility ?? 'solo') === 'public' && (
                        <Globe size={14} color={theme.colors.cyan[400]} />
                    )}
                    {Boolean(item.challengeGroupId) && (
                        <Swords size={14} color={theme.colors.indigo[400]} />
                    )}
                    {item.missionReport === 'accomplished' && (
                        <Text style={[styles.reportPillText, { color: theme.colors.green[500] }]}>ACCOMPLISHED</Text>
                    )}
                    {item.missionReport === 'failed' && (
                        <Text style={[styles.reportPillText, { color: theme.colors.red[500] }]}>FAILED</Text>
                    )}
                    {needsReport && (
                        <Text style={[styles.reportPillText, { color: theme.colors.amber[500] }]}>REVIEW DUE</Text>
                    )}
                </View>

                <Text style={[styles.cardTitle, { color: theme.colors.textPrimary, fontSize: theme.typography.h3 }]}>{item.title}</Text>
                {item.description ? (
                    <Text style={[styles.cardDescription, { color: theme.colors.textSecondary }]} numberOfLines={1}>
                        {item.description}
                    </Text>
                ) : null}

                <View style={styles.cardStats}>
                    <Text
                        style={[
                            styles.cardStreak,
                            missionWon
                                ? { color: theme.colors.green[500] }
                                : needsReport
                                    ? { color: theme.colors.amber[500] }
                                : item.streak >= 14
                                    ? { color: '#fbbf24' }
                                    : item.streak >= 7
                                        ? { color: '#f59e0b' }
                                        : item.streak > 0
                                            ? { color: theme.colors.amber[500] }
                                            : { color: theme.colors.textMuted },
                        ]}
                    >
                        {missionWon
                            ? 'Completed!'
                            : needsReport
                              ? 'Confirm mission outcome'
                              : `${Math.round(campaignProgress * 100)}% Complete`}
                    </Text>
                    {!missionWon && (
                        <>
                            {item.challengeGroupId ? (
                                <TouchableOpacity
                                    onPress={() => router.push(`/challenge/${item.challengeGroupId}`)}
                                    activeOpacity={0.85}
                                    style={[
                                        styles.groupStreakPill,
                                        {
                                            borderColor: 'rgba(245, 158, 11, 0.45)',
                                            backgroundColor: 'rgba(245, 158, 11, 0.14)',
                                        },
                                    ]}
                                    accessibilityRole="button"
                                    accessibilityLabel="View group streaks"
                                >
                                    <Users size={10} color={theme.colors.amber[500]} />
                                    <Text style={[styles.groupStreakPillText, { color: theme.colors.amber[500] }]}>
                                        View group streaks
                                    </Text>
                                </TouchableOpacity>
                            ) : null}
                        </>
                    )}
                </View>
            </View>

            <ProgressRing
                progress={missionWon ? 1 : streakProgress}
                size={56}
                strokeWidth={3}
                color={isManual ? theme.colors.amber[500] : missionWon ? theme.colors.green[500] : theme.colors.indigo[500]}
            >
                {missionWon ? (
                    <Check size={20} color={theme.colors.green[500]} strokeWidth={3} />
                ) : (
                    <View style={styles.ringInner}>
                        {item.streak > 0 ? (
                           <Flame size={14} color="#f59e0b" fill="#fde68a" style={{ marginBottom: -2 }} />
                        ) : (
                           <Flame size={14} color={theme.colors.textMuted} style={{ marginBottom: -2 }} />
                        )}
                        <Text style={[styles.progressText, { color: theme.colors.textPrimary, fontSize: 13 }]}>{item.streak}</Text>
                    </View>
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
    pillRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginBottom: 8 },
    reportPillText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
    ringInner: { alignItems: 'center', justifyContent: 'center', paddingTop: 2 },
    cardTitle: { fontWeight: '800', marginBottom: 4, flexShrink: 1 },
    cardDescription: { fontSize: 14 },
    cardStats: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
    cardStreak: { fontWeight: '600', fontSize: 12 },
    cardProgress: { flexShrink: 0 },
    groupStreakPill: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'center',
        paddingVertical: 4,
        paddingHorizontal: 8,
        borderRadius: 9999,
        borderWidth: 1,
        marginLeft: 8,
        flexShrink: 0,
    },
    groupStreakPillText: { fontSize: 8, fontWeight: '800', letterSpacing: 0.25 },
    progressText: { fontWeight: '700', fontSize: 18 },
    flameStack: { position: 'relative', width: 20, height: 18 },
    progressBarBg: {
        height: 4,
        backgroundColor: 'rgba(100, 116, 139, 0.3)',
        borderRadius: 2,
        marginTop: 8,
        overflow: 'hidden',
        width: '90%',
    },
});
