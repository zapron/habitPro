import React, { useEffect, useRef, useState } from 'react';
import { Text } from "./AppText";
import {
    Animated,
    View,
    StyleSheet,
    Easing,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Crown } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { AnimatedFire } from './AnimatedFire';

interface StreakProgressCardProps {
    streak: number;
    completedCount: number;
    totalDays: number;
    /** Override the progress bar's active color, e.g. for manual-finish missions. */
    ringColor?: string;
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
export function StreakProgressCard({ streak, completedCount, totalDays, ringColor }: StreakProgressCardProps) {
    const { theme } = useTheme();
    const reduceMotion = useReducedMotion();
    const glow = useRef(new Animated.Value(0)).current;
    const lastStreakRef = useRef<number | null>(null);
    const pctAnim = useRef(new Animated.Value(0)).current;
    const [displayPct, setDisplayPct] = useState(0);

    const intensity = intensityFor(streak);
    const pulses = intensity === 'hot' || intensity === 'epic' || intensity === 'legendary';

    useEffect(() => {
        if (!pulses || reduceMotion) {
            glow.setValue(reduceMotion ? 1 : 0);
            return undefined;
        }
        if (lastStreakRef.current === streak) return undefined;
        lastStreakRef.current = streak;
        const loop = Animated.loop(
            Animated.sequence([
                Animated.timing(glow, {
                    toValue: 1,
                    duration: 1500,
                    easing: Easing.inOut(Easing.ease),
                    useNativeDriver: true,
                    isInteraction: false,
                }),
                Animated.timing(glow, {
                    toValue: 0,
                    duration: 1500,
                    easing: Easing.inOut(Easing.ease),
                    useNativeDriver: true,
                    isInteraction: false,
                }),
            ]),
        );
        loop.start();
        return () => loop.stop();
    }, [pulses, reduceMotion, streak, glow]);

    const tierColor =
        intensity === 'legendary'
            ? theme.colors.yellow[400]
            : intensity === 'epic'
                ? theme.colors.red[500]
                : theme.colors.amber[500];
    const tierColorSoft =
        intensity === 'legendary'
            ? theme.colors.amber[500]
            : intensity === 'epic'
                ? theme.colors.amber[500]
                : theme.colors.yellow[400];
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

    const iconGlowOpacity = glow.interpolate({ inputRange: [0, 1], outputRange: [0.16, 0.4] });
    const iconScale = glow.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] });
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
                        borderColor: intensity === 'none' ? theme.colors.border : tierBorder,
                        borderRadius: theme.radius.lg,
                        ...theme.shadow.card,
                    },
                ]}
            >
                <LinearGradient
                    pointerEvents="none"
                    colors={["rgba(255,255,255,0.10)", "rgba(255,255,255,0)"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={[styles.topHighlight, { borderTopLeftRadius: theme.radius.lg, borderTopRightRadius: theme.radius.lg }]}
                />
                <View style={styles.row}>
                    {intensity !== 'none' ? (
                        <View style={styles.iconCol}>
                            {pulses ? (
                                <Animated.View
                                    pointerEvents="none"
                                    style={[styles.iconGlow, { backgroundColor: tierColor, opacity: iconGlowOpacity }]}
                                />
                            ) : null}
                            <Animated.View style={{ transform: [{ scale: pulses ? iconScale : 1 }] }}>
                                {intensity === 'legendary' ? (
                                    <Crown size={30} color={tierColor} fill={tierColor} />
                                ) : (
                                    <AnimatedFire size={24} color={tierColor} />
                                )}
                            </Animated.View>
                        </View>
                    ) : null}
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
                                <Text style={{ color: theme.colors.textMuted }}>/{totalDays}d</Text>
                            </Text>
                        </View>
                    </View>
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: { marginBottom: 16, marginHorizontal: 3 },
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
    iconCol: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center' },
    iconGlow: { position: 'absolute', width: 46, height: 46, borderRadius: 23 },
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
});
