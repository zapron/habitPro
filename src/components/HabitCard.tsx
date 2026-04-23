import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Text } from "./AppText";
import {
  View,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Easing,
} from "react-native";
import { useRouter } from 'expo-router';
import { Flame, Check, Plane, Gamepad2, Globe, Swords, Users } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { Habit } from '../types/habit';
import { needsMainMissionOutcome } from '../utils/mainMissionUi';
import { ProgressRing } from './ProgressRing';
import * as Haptics from 'expo-haptics';
import { getEligibleStreakRepair } from "../utils/streakRepairEligibility";
import { calendarDateForMissionDayIndex, getActiveMissionDaySlot } from "../utils/missionDaySlots";
import { useReducedMotion } from "../hooks/useReducedMotion";

interface HabitCardProps {
    item: Habit;
}

export const HabitCard = memo(({ item }: HabitCardProps) => {
    const router = useRouter();
    const { theme } = useTheme();
    const reduceMotion = useReducedMotion();
    const [nowMs, setNowMs] = useState(() => Date.now());
    const totalDays = Math.max(1, item.totalDays ?? 21);
    const needsReport = needsMainMissionOutcome(item, nowMs);
    const missionWon = item.missionReport === 'accomplished';
    const isManual = (item.mode ?? 'autopilot') === 'manual';

    useEffect(() => {
      if (item.status !== "active" || item.isCompleted || missionWon) return;
      const t = setInterval(() => setNowMs(Date.now()), 30_000);
      return () => clearInterval(t);
    }, [item.status, item.isCompleted, missionWon, item.id]);
    /** Mission completion: distinct days checked / campaign length */
    const campaignProgress = Math.min(item.completedDates.length / totalDays, 1);
    /** Current consecutive streak as a share of the mission (ring + center number) */
    const streakProgress = Math.min(item.streak / totalDays, 1);
    const repair = useMemo(() => getEligibleStreakRepair(item, nowMs), [item, nowMs]);

    const streakCheckinAvailable = useMemo(() => {
      if (missionWon || needsReport) return false;
      if (item.status !== "active" || item.isCompleted) return false;
      if (isManual && item.endDate && nowMs >= new Date(item.endDate).getTime()) return false;
      const slot = getActiveMissionDaySlot(item.startDate, nowMs, totalDays);
      if (slot == null) return false;
      const dateStr = calendarDateForMissionDayIndex(item.startDate, slot - 1);
      if (!dateStr) return false;
      return !item.completedDates.includes(dateStr);
    }, [missionWon, needsReport, item, nowMs, totalDays, isManual]);

    const pulse = useRef(new Animated.Value(0)).current;
    useEffect(() => {
      if (!streakCheckinAvailable || reduceMotion) {
        pulse.stopAnimation();
        pulse.setValue(0);
        return;
      }
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, {
            toValue: 1,
            duration: 900,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(pulse, {
            toValue: 0,
            duration: 900,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      );
      loop.start();
      return () => {
        loop.stop();
        pulse.setValue(0);
      };
    }, [streakCheckinAvailable, reduceMotion, pulse]);

    const pulseScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.22] });
    const pulseOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.22, 0.62] });

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
                    {streakCheckinAvailable && !missionWon ? (
                        <View
                            style={styles.pulseGlyphWrap}
                            accessibilityLabel="Streak check-in available"
                            accessibilityRole="image"
                        >
                            <Animated.View
                                pointerEvents="none"
                                style={[
                                    styles.pulseGlyphHalo,
                                    {
                                        borderColor: theme.colors.cyan[400],
                                        backgroundColor: "rgba(34, 211, 238, 0.10)",
                                        transform: [{ scale: reduceMotion ? 1 : pulseScale }],
                                        opacity: reduceMotion ? 0.5 : pulseOpacity,
                                    },
                                ]}
                            />
                        </View>
                    ) : null}
                    {item.missionReport === 'accomplished' && (
                        <Text style={[styles.reportPillText, { color: theme.colors.green[500] }]}>ACCOMPLISHED</Text>
                    )}
                    {item.missionReport === 'failed' && (
                        <Text style={[styles.reportPillText, { color: theme.colors.red[500] }]}>FAILED</Text>
                    )}
                    {needsReport && (
                        <Text style={[styles.reportPillText, { color: theme.colors.amber[500] }]}>REVIEW DUE</Text>
                    )}
                    {repair && !missionWon && !needsReport ? (
                      <TouchableOpacity
                        onPress={() => {
                          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          router.push({
                            pathname: `/habit/${item.id}`,
                            params: { repair: "1", repairDate: repair.dateStr },
                          });
                        }}
                        activeOpacity={0.85}
                        accessibilityRole="button"
                        accessibilityLabel="Repair streak"
                      >
                        <Text style={[styles.repairCta, { color: theme.colors.amber[500] }]}>REPAIR</Text>
                      </TouchableOpacity>
                    ) : null}
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
    repairCta: { fontSize: 10, fontWeight: "900", letterSpacing: 0.9 },
    pulseGlyphWrap: {
        width: 16,
        height: 16,
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
    },
    pulseGlyphHalo: {
        position: "absolute",
        left: 2,
        top: 2,
        width: 12,
        height: 12,
        borderRadius: 3,
        borderWidth: 1,
        zIndex: 0,
    },
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
