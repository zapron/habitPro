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
import { VIDEO_MOMENT_MIN_POSTS, type ChapterStatus } from '../features/videoMoments/credit';

interface StreakProgressCardProps {
    streak: number;
    completedCount: number;
    totalDays: number;
    /** Override the progress bar's active color, e.g. for manual-finish missions. */
    ringColor?: string;
    /** Chapters (7-second clips): this week's row under the bar; null hides it. */
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
 * The next chapter: the bar above shows the whole campaign, this row shows
 * only the seven days that earn the next chapter, so every check-in visibly
 * moves it. Charging: a header, a strip of the seven days and two small
 * tiles (days, Community posts). Turns into an amber tile (pulsing icon) once
 * a chapter is ready to use.
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

    const rowProps = {
        onPress,
        disabled: !onPress,
        accessibilityRole: onPress ? ('button' as const) : ('text' as const),
    };

    if (status.kind === 'ready') {
        const left = status.daysLeft <= 1 ? 'Last day to use it' : `${plural(status.daysLeft, 'day')} left`;
        return (
            <View style={[styles.chapterSection, { borderTopColor: theme.colors.border }]}>
                <Pressable
                    {...rowProps}
                    accessibilityLabel={`Chapter ${status.chapter} unlocked. Record up to 7 seconds. ${left}.`}
                    style={[
                        styles.readyTile,
                        { backgroundColor: withAlpha(amber, 16), borderColor: withAlpha(amber, 45) },
                    ]}
                >
                    <View>
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
                        <View style={[styles.chapterIcon, { backgroundColor: amber }]}>
                            <BookOpen size={14} color="#ffffff" strokeWidth={2.4} />
                        </View>
                    </View>
                    <View style={styles.flexText}>
                        <Text style={[styles.chapterTitle, { color: amber }]} numberOfLines={1}>
                            Chapter {status.chapter} unlocked
                        </Text>
                        <Text style={[styles.chapterSub, { color: theme.colors.textSecondary }]} numberOfLines={1}>
                            Record up to 7 s · {left}
                        </Text>
                    </View>
                    {onPress ? (
                        <View style={[styles.recordPill, { backgroundColor: amber }]}>
                            <Text style={styles.recordPillText}>Record</Text>
                        </View>
                    ) : null}
                </Pressable>
            </View>
        );
    }

    if (status.kind === 'kept') {
        const sub = status.nextDay ? `Next one can unlock on day ${status.nextDay}` : 'Saved in your moments';
        return (
            <Pressable
                {...rowProps}
                accessibilityLabel={`Chapter ${status.chapter} kept. ${sub}.`}
                style={[styles.chapterSection, styles.keptRow, { borderTopColor: theme.colors.border }]}
            >
                <View style={[styles.chapterIcon, { backgroundColor: green }]}>
                    <Check size={14} color="#ffffff" strokeWidth={3} />
                </View>
                <View style={styles.flexText}>
                    <Text style={[styles.chapterTitle, { color: green }]} numberOfLines={1}>
                        Chapter {status.chapter} kept
                    </Text>
                    <Text style={[styles.chapterSub, { color: theme.colors.textSecondary }]} numberOfLines={1}>
                        {sub}
                    </Text>
                </View>
            </Pressable>
        );
    }

    const daysDone = status.dots.filter((d) => d === 'done').length;
    const firstDay = status.endDay - status.dots.length + 1;
    const todayIndex = status.dots.length - 1 - status.daysToGo;
    const chip = status.restarted ? 'Restarted' : status.daysToGo === 0 ? 'Finish today' : `Unlocks day ${status.endDay}`;
    const toGo = status.daysToGo === 0 ? 'today' : `${status.daysToGo} to go`;
    const postsDone = status.postsNeeded === 0;
    const tileBg = theme.colors.surfaceElevated;

    return (
        <Pressable
            {...rowProps}
            accessibilityLabel={
                `Chapter ${status.chapter}${status.restarted ? ', restarted' : ''}. ` +
                `${daysDone} of 7 days, ${toGo}. ` +
                (postsDone
                    ? `${status.posts} Community posts, enough.`
                    : `${status.posts} of ${VIDEO_MOMENT_MIN_POSTS} Community posts.`)
            }
            style={[styles.chapterSection, { borderTopColor: theme.colors.border }]}
        >
            <View style={styles.chapterHead}>
                <View style={[styles.chapterIcon, { backgroundColor: tileBg }]}>
                    <BookOpen size={14} color={theme.colors.textMuted} strokeWidth={2.4} />
                </View>
                <Text style={[styles.chapterTitle, styles.flexText, { color: theme.colors.textPrimary }]} numberOfLines={1}>
                    Chapter {status.chapter}
                </Text>
                <View
                    style={[
                        styles.chip,
                        { backgroundColor: status.restarted ? withAlpha(amber, 16) : tileBg },
                    ]}
                >
                    <Text
                        style={[styles.chipText, { color: status.restarted ? amber : theme.colors.textSecondary }]}
                        numberOfLines={1}
                    >
                        {chip}
                    </Text>
                </View>
            </View>

            <View style={styles.weekStrip}>
                {status.dots.map((d, i) => (
                    <View key={i} style={styles.weekCell}>
                        <View
                            style={[
                                styles.weekSeg,
                                d === 'done'
                                    ? { backgroundColor: amber }
                                    : d === 'today'
                                        ? { borderWidth: 1.5, borderColor: amber }
                                        : { backgroundColor: theme.colors.border },
                            ]}
                        />
                        <Text
                            style={[
                                styles.weekNum,
                                i === todayIndex
                                    ? { color: amber, fontWeight: '800' }
                                    : { color: theme.colors.textMuted },
                            ]}
                        >
                            {firstDay + i}
                        </Text>
                    </View>
                ))}
            </View>

            <View style={styles.statRow}>
                <View style={[styles.statTile, { backgroundColor: tileBg }]}>
                    <Text style={[styles.statKey, { color: theme.colors.textMuted }]} numberOfLines={1}>
                        DAYS
                    </Text>
                    <Text style={[styles.statValue, { color: theme.colors.textPrimary }]} numberOfLines={1}>
                        {daysDone} of 7
                        <Text style={[styles.statAside, { color: theme.colors.textSecondary }]}> · {toGo}</Text>
                    </Text>
                </View>
                <View style={[styles.statTile, { backgroundColor: tileBg }]}>
                    <Text style={[styles.statKey, { color: theme.colors.textMuted }]} numberOfLines={1}>
                        COMMUNITY POSTS
                    </Text>
                    {postsDone ? (
                        <View style={styles.statInline}>
                            <Text style={[styles.statValue, { color: green }]} numberOfLines={1}>
                                {status.posts} posted
                            </Text>
                            <Check size={13} color={green} strokeWidth={3} />
                        </View>
                    ) : (
                        <View style={styles.statInline}>
                            <Text style={[styles.statValue, { color: theme.colors.textPrimary }]} numberOfLines={1}>
                                {status.posts} of {VIDEO_MOMENT_MIN_POSTS}
                            </Text>
                            <View style={styles.pips}>
                                {Array.from({ length: VIDEO_MOMENT_MIN_POSTS }, (_, i) => (
                                    <View
                                        key={i}
                                        style={[
                                            styles.pip,
                                            { backgroundColor: i < status.posts ? amber : theme.colors.border },
                                        ]}
                                    />
                                ))}
                            </View>
                        </View>
                    )}
                </View>
            </View>
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
    chapterSection: {
        marginTop: 12,
        paddingTop: 12,
        borderTopWidth: StyleSheet.hairlineWidth,
    },
    chapterHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
    chapterIcon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    chapterHalo: { position: 'absolute', top: 0, left: 0, width: 28, height: 28, borderRadius: 14 },
    flexText: { flex: 1, minWidth: 0 },
    chapterTitle: { fontSize: 15, fontWeight: '800' },
    chapterSub: { fontSize: 12.5, fontWeight: '600', marginTop: 1 },
    chip: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, flexShrink: 0 },
    chipText: { fontSize: 11, fontWeight: '700' },
    weekStrip: { flexDirection: 'row', gap: 5 },
    weekCell: { flex: 1, alignItems: 'center', gap: 5 },
    weekSeg: { alignSelf: 'stretch', height: 8, borderRadius: 4 },
    weekNum: { fontSize: 10.5, fontWeight: '600' },
    statRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
    statTile: { flex: 1, minWidth: 0, borderRadius: 12, paddingVertical: 9, paddingHorizontal: 11, gap: 2 },
    statKey: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
    statValue: { fontSize: 15, fontWeight: '800' },
    statAside: { fontSize: 12.5, fontWeight: '600' },
    statInline: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    pips: { flexDirection: 'row', gap: 3 },
    pip: { width: 7, height: 7, borderRadius: 4 },
    readyTile: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        borderRadius: 14,
        borderWidth: 1,
        padding: 12,
    },
    recordPill: { borderRadius: 10, paddingHorizontal: 13, paddingVertical: 8, flexShrink: 0 },
    recordPillText: { color: '#1a1205', fontSize: 13, fontWeight: '800' },
    keptRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
