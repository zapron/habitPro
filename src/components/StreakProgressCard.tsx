import React, { useEffect, useRef, useState } from 'react';
import { Text } from "./AppText";
import {
    Animated,
    Pressable,
    View,
    StyleSheet,
    Easing,
} from "react-native";
import { BookOpen, Check } from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import { GlassTopHighlight } from "./GlassTopHighlight";
import { useTheme } from '../context/ThemeContext';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { withAlpha } from '../styles/theme';
import type { ChapterStatus } from '../features/videoMoments/credit';

interface StreakProgressCardProps {
    streak: number;
    completedCount: number;
    totalDays: number;
    /** Override the progress bar's active color, e.g. for manual-finish missions. */
    ringColor?: string;
    /** Chapters (5-second clips): this week's row under the bar; null hides it. */
    chapter?: ChapterStatus | null;
    onPressChapter?: () => void;
}

type Intensity = 'none' | 'warm' | 'hot' | 'epic' | 'legendary';

function intensityFor(streak: number): Intensity {
    if (streak < 3) return 'none';
    if (streak >= 21) return 'legendary';
    if (streak >= 14) return 'epic';
    if (streak >= 7) return 'hot';
    return 'warm';
}

/**
 * Merges the streak-status banner and the campaign progress ring into one
 * compact card: a big glowing tier icon on the left, headline + horizontal
 * pill progress bar on the right, instead of a separate full-width alert
 * strip.
 */
function plural(n: number, word: string): string {
    return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/**
 * This week's chapter: the bar above shows the whole campaign, this row shows
 * only the seven days that earn the next chapter, so every check-in visibly
 * moves it. Turns amber (pulsing icon) once a chapter is ready to use.
 */
function ChapterRow({ status, onPress }: { status: ChapterStatus; onPress?: () => void }) {
    const { theme } = useTheme();
    const reduceMotion = useReducedMotion();
    const pulse = useRef(new Animated.Value(0)).current;
    const amber = theme.colors.amber[500];
    const green = theme.colors.green[500];
    const ready = status.kind === 'ready';

    useEffect(() => {
        if (!ready || reduceMotion) {
            pulse.setValue(0);
            return undefined;
        }
        const loop = Animated.loop(
            Animated.sequence([
                Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.out(Easing.quad), useNativeDriver: true }),
                Animated.timing(pulse, { toValue: 0, duration: 900, easing: Easing.in(Easing.quad), useNativeDriver: true }),
            ]),
        );
        loop.start();
        return () => loop.stop();
    }, [ready, reduceMotion, pulse]);

    let lead: string;
    let rest: string;
    let leadColor = theme.colors.textPrimary;
    if (status.kind === 'ready') {
        lead = `Chapter ${status.chapter} unlocked`;
        rest = status.daysLeft <= 1 ? ' · last day to use it' : ` · ${plural(status.daysLeft, 'day')} left to use it`;
        leadColor = amber;
    } else if (status.kind === 'kept') {
        lead = `Chapter ${status.chapter} kept`;
        rest = status.nextDay ? ` · next one on day ${status.nextDay}` : '';
        leadColor = green;
    } else if (status.kind === 'blocked') {
        lead =
            status.reason === 'repaired' ? 'Repaired day' : status.reason === 'missed' ? 'Missed a day' : 'Not enough posts';
        rest = ` · next chapter starts day ${status.nextDay}`;
        leadColor = theme.colors.textSecondary;
    } else {
        lead = `Chapter ${status.chapter}`;
        rest =
            (status.daysToGo > 0 ? ` · ${plural(status.daysToGo, 'day')} to go` : ' · finish today') +
            (status.postsNeeded > 0 ? ` · ${plural(status.postsNeeded, 'more post')}` : '');
    }

    const iconBg = ready ? amber : status.kind === 'kept' ? green : theme.colors.surfaceElevated;
    const iconColor = ready || status.kind === 'kept' ? '#ffffff' : theme.colors.textMuted;

    return (
        <Pressable
            onPress={onPress}
            disabled={!onPress}
            accessibilityRole={onPress ? 'button' : 'text'}
            accessibilityLabel={`${lead}${rest}`}
            style={[styles.chapterRow, { borderTopColor: theme.colors.border }]}
        >
            <View>
                {ready ? (
                    <Animated.View
                        pointerEvents="none"
                        style={[
                            styles.chapterHalo,
                            {
                                backgroundColor: withAlpha(amber, 30),
                                opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }),
                                transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.5] }) }],
                            },
                        ]}
                    />
                ) : null}
                <View style={[styles.chapterIcon, { backgroundColor: iconBg }]}>
                    {status.kind === 'kept' ? (
                        <Check size={13} color={iconColor} strokeWidth={3} />
                    ) : (
                        <BookOpen size={13} color={iconColor} strokeWidth={2.4} />
                    )}
                </View>
            </View>
            <Text style={[styles.chapterText, { color: theme.colors.textSecondary }]} numberOfLines={2}>
                <Text style={{ color: leadColor, fontWeight: '800' }}>{lead}</Text>
                {rest}
            </Text>
            {status.kind === 'charging' ? (
                <View style={styles.chapterDots}>
                    {status.dots.map((d, i) => (
                        <View
                            key={i}
                            style={[
                                styles.chapterDot,
                                d === 'done'
                                    ? { backgroundColor: amber }
                                    : d === 'today'
                                        ? { borderWidth: 1.5, borderColor: amber }
                                        : { backgroundColor: theme.colors.border },
                            ]}
                        />
                    ))}
                </View>
            ) : null}
        </Pressable>
    );
}

export function StreakProgressCard({ streak, completedCount, totalDays, ringColor, chapter, onPressChapter }: StreakProgressCardProps) {
    const { theme, isDark } = useTheme();
    const reduceMotion = useReducedMotion();
    const pctAnim = useRef(new Animated.Value(0)).current;
    const [displayPct, setDisplayPct] = useState(0);

    const intensity = intensityFor(streak);

    // Dulled-down versions of the same gold/terracotta/maroon hues used elsewhere for
    // this card — still readable as "this streak is notable" without the saturated
    // yellow/amber/red reading as an alert. Tuned per theme so it stays legible on
    // both a near-black and a near-white card background.
    const mutedGold = isDark ? '#C9A758' : '#8C7530';
    const mutedTerracotta = isDark ? '#B57C46' : '#8A5A2E';
    const mutedMaroon = isDark ? '#B25C5C' : '#8B4048';

    const tierColor =
        intensity === 'legendary'
            ? mutedGold
            : intensity === 'epic'
                ? mutedMaroon
                : mutedTerracotta;
    const tierColorSoft =
        intensity === 'legendary'
            ? mutedTerracotta
            : intensity === 'epic'
                ? mutedTerracotta
                : mutedGold;
    const tierBorder =
        intensity === 'legendary'
            ? 'rgba(251, 191, 36, 0.5)'
            : intensity === 'epic'
                ? 'rgba(239, 68, 68, 0.4)'
                : intensity === 'hot'
                    ? 'rgba(245, 158, 11, 0.4)'
                    : intensity === 'warm'
                        ? 'rgba(245, 158, 11, 0.22)'
                        : theme.colors.border;
    const label =
        intensity === 'legendary'
            ? `Legendary ${streak}-day streak!`
            : intensity === 'epic'
                ? `Epic ${streak}-day streak!`
                : intensity === 'hot'
                    ? `${streak}-day streak on fire!`
                    : `${streak}-day streak!`;

    const progress = totalDays > 0 ? completedCount / totalDays : 0;
    const pct = Math.round(Math.min(1, Math.max(0, progress)) * 100);
    const barColor = ringColor ?? tierColor;
    const barColorSoft = ringColor ?? tierColorSoft;

    useEffect(() => {
        const id = pctAnim.addListener(({ value }) => setDisplayPct(Math.round(value)));
        return () => pctAnim.removeListener(id);
    }, [pctAnim]);

    useEffect(() => {
        if (reduceMotion) {
            pctAnim.setValue(pct);
            return undefined;
        }
        const anim = Animated.timing(pctAnim, {
            toValue: pct,
            duration: 900,
            easing: Easing.out(Easing.cubic),
            // Only a transform (scaleX) is driven off this value below, so the
            // native driver can run the whole animation off the JS thread —
            // avoids the width-driven layout thrash that caused jitter.
            useNativeDriver: true,
        });
        anim.start();
        return () => anim.stop();
    }, [pct, reduceMotion, pctAnim]);

    const fillScale = pctAnim.interpolate({
        inputRange: [0, 100],
        outputRange: [0, 1],
        extrapolate: 'clamp',
    });

    return (
        <View style={styles.wrap}>
            <View
                style={[
                    styles.card,
                    {
                        backgroundColor: theme.colors.surface,
                        borderColor:
                            intensity === 'none'
                                ? isDark ? theme.colors.border : "transparent"
                                : theme.colors.border,
                        borderRadius: theme.radius.lg,
                        ...theme.shadow.card,
                    },
                ]}
            >
                <GlassTopHighlight radius={theme.radius.lg} />
                <View style={styles.row}>
                    <View style={styles.contentCol}>
                        {intensity !== 'none' ? (
                            <Text style={[styles.title, { color: tierColor }]} numberOfLines={1}>
                                {label}
                            </Text>
                        ) : (
                            <Text
                                style={[
                                    styles.eyebrow,
                                    { color: theme.colors.textSecondary, fontSize: theme.typography.micro },
                                ]}
                            >
                                Campaign Progress
                            </Text>
                        )}
                        <View style={styles.barRow}>
                            <View style={[styles.barTrack, { backgroundColor: theme.colors.slate[700] }]}>
                                <Animated.View
                                    pointerEvents="none"
                                    style={[styles.barFill, { transform: [{ scaleX: fillScale }] }]}
                                >
                                    <LinearGradient
                                        colors={[barColorSoft, barColor]}
                                        start={{ x: 0, y: 0 }}
                                        end={{ x: 1, y: 0 }}
                                        style={StyleSheet.absoluteFill}
                                    />
                                </Animated.View>
                                <Text style={styles.barPct} numberOfLines={1}>
                                    {displayPct}%
                                </Text>
                            </View>
                            <Text style={styles.dayCount} numberOfLines={1}>
                                <Text style={{ color: barColor, fontWeight: '800' }}>{completedCount}</Text>
                                <Text style={{ color: theme.colors.textMuted }}>/{totalDays} d</Text>
                            </Text>
                        </View>
                    </View>
                </View>
                {chapter ? <ChapterRow status={chapter} onPress={onPressChapter} /> : null}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: { marginBottom: 16, marginHorizontal: 0 },
    card: {
        paddingVertical: 16,
        paddingHorizontal: 18,
        borderWidth: 1,
    },
    topHighlight: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 18,
    },
    row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    contentCol: { flex: 1, minWidth: 0, gap: 8, justifyContent: 'center' },
    eyebrow: { fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
    title: { fontSize: 16, fontWeight: '800', letterSpacing: 0.2 },
    barRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    barTrack: { flex: 1, height: 13, borderRadius: 999, overflow: 'hidden', justifyContent: 'center' },
    barFill: {
        position: 'absolute',
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
        transformOrigin: 'left',
    },
    barPct: {
        textAlign: 'center',
        color: '#ffffff',
        fontSize: 9,
        fontWeight: '800',
        textShadowColor: 'rgba(0,0,0,0.45)',
        textShadowRadius: 2,
        textShadowOffset: { width: 0, height: 1 },
    },
    dayCount: { fontSize: 14, fontWeight: '700', flexShrink: 0, marginRight: 2 },
    chapterRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginTop: 12,
        paddingTop: 11,
        borderTopWidth: StyleSheet.hairlineWidth,
    },
    chapterIcon: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    chapterHalo: { position: 'absolute', top: 0, left: 0, width: 24, height: 24, borderRadius: 12 },
    chapterText: { flex: 1, minWidth: 0, fontSize: 12.5, lineHeight: 17, fontWeight: '600' },
    chapterDots: { flexDirection: 'row', gap: 3, flexShrink: 0 },
    chapterDot: { width: 7, height: 7, borderRadius: 4 },
});
