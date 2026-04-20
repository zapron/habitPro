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
import { PlusBadge } from "./PlusBadge";

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
            activeOpacity={0.9}
            onPress={() => router.push(`/habit/${item.id}`)}
        >
            <View style={styles.cardContent}>
                <View style={styles.pillRow}>
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
                    {(item.visibility ?? 'solo') === 'public' && (
                        <View style={[styles.publicPill, { borderColor: theme.colors.cyan[400] + '44', backgroundColor: theme.colors.cyan[400] + '14' }]}>
                            <Globe size={10} color={theme.colors.cyan[400]} />
                            <Text style={[styles.publicPillText, { color: theme.colors.cyan[400] }]}>PUBLIC</Text>
                        </View>
                    )}
                    {Boolean(item.challengeGroupId) && (
                        <View
                            style={[
                                styles.challengePill,
                                {
                                    borderColor: theme.colors.indigo[400] + '55',
                                    backgroundColor: theme.colors.indigo[500] + '18',
                                },
                            ]}
                        >
                            <Swords size={10} color={theme.colors.indigo[400]} />
                            <Text style={[styles.challengePillText, { color: theme.colors.indigo[400] }]}>GROUP MISSION</Text>
                            <PlusBadge withFlame />
                        </View>
                    )}
                    {item.missionReport === 'accomplished' && (
                        <View
                            style={[
                                styles.reportPill,
                                {
                                    borderColor: theme.colors.green[500] + '55',
                                    backgroundColor: theme.colors.green[500] + '18',
                                },
                            ]}
                        >
                            <Text style={[styles.reportPillText, { color: theme.colors.green[500] }]}>ACCOMPLISHED</Text>
                        </View>
                    )}
                    {item.missionReport === 'failed' && (
                        <View
                            style={[
                                styles.reportPill,
                                {
                                    borderColor: theme.colors.red[500] + '55',
                                    backgroundColor: 'rgba(239, 68, 68, 0.14)',
                                },
                            ]}
                        >
                            <Text style={[styles.reportPillText, { color: theme.colors.red[500] }]}>FAILED</Text>
                        </View>
                    )}
                    {needsReport ? (
                        <View
                            style={[
                                styles.reportPill,
                                {
                                    borderColor: theme.colors.amber[500] + '55',
                                    backgroundColor: 'rgba(245, 158, 11, 0.14)',
                                },
                            ]}
                        >
                            <Text style={[styles.reportPillText, { color: theme.colors.amber[500] }]}>REVIEW DUE</Text>
                        </View>
                    ) : null}
                </View>

                <Text style={[styles.cardTitle, { color: theme.colors.textPrimary, fontSize: theme.typography.h3 }]}>{item.title}</Text>
                {item.description ? (
                    <Text style={[styles.cardDescription, { color: theme.colors.textSecondary }]} numberOfLines={1}>
                        {item.description}
                    </Text>
                ) : null}

                {!missionWon && (
                    <View style={styles.progressBarBg}>
                        <View
                            style={{
                                height: '100%',
                                width: `${campaignProgress * 100}%`,
                                minWidth: campaignProgress > 0 ? 4 : 0,
                                backgroundColor: isManual
                                    ? theme.colors.amber[500]
                                    : item.streak > 0
                                        ? theme.colors.amber[500]
                                        : theme.colors.cyan[500],
                                borderRadius: 2,
                            }}
                        />
                    </View>
                )}

                <View style={styles.cardStats}>
                    <View style={styles.statIcon}>
                        {missionWon ? (
                            <TreePine size={16} color={theme.colors.green[500]} />
                        ) : item.streak >= 14 ? (
                            <View style={styles.flameStack}>
                                <Flame size={14} color="#f59e0b" fill="#fde68a" />
                                <Flame size={10} color="#ef4444" fill="#fca5a5" style={{ position: 'absolute', left: 6, top: -2 }} />
                            </View>
                        ) : item.streak >= 7 ? (
                            <View style={styles.flameStack}>
                                <Flame size={14} color="#f59e0b" fill="#fde68a" />
                            </View>
                        ) : item.streak > 0 ? (
                            <Flame size={14} color="#f59e0b" fill="#fde68a" />
                        ) : (
                            <Flame size={14} color={theme.colors.textMuted} />
                        )}
                    </View>
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
                              : item.streak > 0
                                ? `${item.streak} day streak`
                                : 'Start a streak'}
                    </Text>
                    {!missionWon && (
                        <>
                            <Text style={[styles.cardProgress, { color: theme.colors.textMuted }]}>
                                {Math.round(campaignProgress * 100)}%
                            </Text>
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
                size={52}
                strokeWidth={3}
                color={isManual ? theme.colors.amber[500] : missionWon ? theme.colors.green[500] : theme.colors.indigo[500]}
            >
                {missionWon ? (
                    <Check size={20} color={theme.colors.green[500]} strokeWidth={3} />
                ) : (
                    <Text style={[styles.progressText, { color: theme.colors.textPrimary }]}>{item.streak}</Text>
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
    pillRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginBottom: 6 },
    modePill: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        gap: 4,
        paddingVertical: 2,
        paddingHorizontal: 8,
        borderRadius: 9999,
        backgroundColor: 'rgba(34, 211, 238, 0.1)',
    },
    modePillManual: { backgroundColor: 'rgba(245, 158, 11, 0.1)' },
    publicPill: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        gap: 4,
        paddingVertical: 2,
        paddingHorizontal: 8,
        borderRadius: 9999,
        borderWidth: 1,
    },
    publicPillText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.8 },
    challengePill: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        gap: 4,
        paddingVertical: 2,
        paddingHorizontal: 8,
        borderRadius: 9999,
        borderWidth: 1,
    },
    challengePillText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.8 },
    reportPill: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        gap: 4,
        paddingVertical: 2,
        paddingHorizontal: 8,
        borderRadius: 9999,
        borderWidth: 1,
    },
    reportPillText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.8 },
    modePillText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.8 },
    cardTitle: { fontWeight: '700', marginBottom: 4 },
    cardDescription: { fontSize: 14 },
    cardStats: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
    statIcon: { marginRight: 6 },
    cardStreak: { fontWeight: '700', fontSize: 12, marginRight: 12, flexShrink: 1 },
    cardProgress: { flexShrink: 0 },
    groupStreakPill: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'center',
        gap: 4,
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
