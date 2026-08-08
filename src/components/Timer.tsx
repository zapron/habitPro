import { Text } from "./AppText";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, TouchableOpacity, View } from "react-native";
import { ArrowDown, ArrowUp } from "lucide-react-native";
import { GlassTopHighlight } from "./GlassTopHighlight";
import { useTheme } from '../context/ThemeContext';
import { AnimatedFire } from './AnimatedFire';
import { FireLottie } from "./FireLottie";
import { SplitFlapTimeDisplay, type ProgressivePhase } from './SplitFlapTimeDisplay';
import { useReducedMotion } from '../hooks/useReducedMotion';
import type { HabitMode } from '../types/habit';

/** Minimalist-only mount animation: the fire icon holds briefly, then collapses
 * to width 0 so the timer's flex:1 content reflows to fill the freed space. */
const INTRO_HOLD_MS = 4000;
const INTRO_COLLAPSE_MS = 480;

const FIRE_LOTTIE_URI = "https://fonts.gstatic.com/s/e/notoemoji/latest/1f525/lottie.json";

interface TimerProps {
    startDate: string;
    mode?: HabitMode;
    endDate?: string;
    missionTimezone?: string | null;
    /** UTC ms of mission's final calendar-day midnight — enables the TIME LEFT toggle. */
    missionEndMs?: number;
}

const LEGEND_BY_PHASE: Record<ProgressivePhase, readonly string[]> = {
    ss: ['SEC'],
    mmss: ['MIN', 'SEC'],
    hhmmss: ['HRS', 'MIN', 'SEC'],
    ddhhmmss: ['DAYS', 'HRS', 'MIN', 'SEC'],
};

function fallbackDisplay(phase: ProgressivePhase): string {
    switch (phase) {
        case 'ss': return '00';
        case 'mmss': return '00:00';
        case 'hhmmss': return '00:00:00';
        case 'ddhhmmss':
        default: return '00:00:00:00';
    }
}

function msToParts(ms: number) {
    const totalSec = Math.floor(ms / 1000);
    const days = Math.floor(totalSec / 86400);
    const hours = Math.floor((totalSec % 86400) / 3600);
    const minutes = Math.floor((totalSec % 3600) / 60);
    const seconds = totalSec % 60;
    const pad = (n: number) => String(n).padStart(2, '0');
    return { days, hours, minutes, seconds, totalSec, pad };
}

export function Timer({ startDate, mode = 'autopilot', endDate, missionTimezone, missionEndMs }: TimerProps) {
    const { theme, themePack } = useTheme();
    const isManual = mode === 'manual';
    const reduceMotion = useReducedMotion();
    const introEnabled = themePack === 'minimalist' && !reduceMotion;

    const [iconBoxWidth, setIconBoxWidth] = useState<number | null>(null);
    const introWidthAnim = useRef(new Animated.Value(0)).current;
    const introMarginAnim = useRef(new Animated.Value(16)).current;
    const introOpacityAnim = useRef(new Animated.Value(1)).current;
    /** Digits pop slightly larger once the fire icon has cleared out of the way — the
     * emphasis beat that says "this is the time you have right now." Starts partway
     * through the icon's collapse so it reads as cause-and-effect, not simultaneous. */
    const introDigitScale = useRef(new Animated.Value(1)).current;
    const introPlayedRef = useRef(false);

    const handleIconLayout = useCallback((e: { nativeEvent: { layout: { width: number } } }) => {
        if (iconBoxWidth !== null) return;
        const width = e.nativeEvent.layout.width;
        introWidthAnim.setValue(width);
        setIconBoxWidth(width);
    }, [iconBoxWidth, introWidthAnim]);

    useEffect(() => {
        if (!introEnabled || iconBoxWidth === null || introPlayedRef.current) return;
        introPlayedRef.current = true;
        const timer = setTimeout(() => {
            Animated.parallel([
                Animated.timing(introWidthAnim, { toValue: 0, duration: INTRO_COLLAPSE_MS, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
                Animated.timing(introMarginAnim, { toValue: 0, duration: INTRO_COLLAPSE_MS, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
                Animated.timing(introOpacityAnim, { toValue: 0, duration: INTRO_COLLAPSE_MS * 0.7, easing: Easing.out(Easing.quad), useNativeDriver: false }),
                Animated.spring(introDigitScale, {
                    toValue: 1.08,
                    delay: INTRO_COLLAPSE_MS * 0.55,
                    friction: 5,
                    tension: 90,
                    useNativeDriver: true,
                }),
            ]).start();
        }, INTRO_HOLD_MS);
        return () => clearTimeout(timer);
    }, [introEnabled, iconBoxWidth, introWidthAnim, introMarginAnim, introOpacityAnim, introDigitScale]);

    // Effective end timestamp — manual uses endDate, others use missionEndMs
    const effectiveEndMs = isManual && endDate
        ? new Date(endDate).getTime()
        : (missionEndMs ?? null);

    const canToggle = effectiveEndMs !== null;
    const [showRemaining, setShowRemaining] = useState(false);
    const fadeAnim = useRef(new Animated.Value(1)).current;

    // Elapsed display
    const [elapsedDisplay, setElapsedDisplay] = useState('00');
    const [elapsedPhase, setElapsedPhase] = useState<ProgressivePhase>('ss');

    // Remaining display
    const [remainingDisplay, setRemainingDisplay] = useState('00:00:00:00');
    const [remainingPhase] = useState<ProgressivePhase>('ddhhmmss');
    const [isExpired, setIsExpired] = useState(false);

    useEffect(() => {
        const start = new Date(startDate).getTime();
        const update = () => {
            const now = Date.now();

            // --- Elapsed (count-up) ---
            const elapsed = Math.max(0, now - start);
            const { days, hours, minutes, seconds, totalSec, pad } = msToParts(elapsed);

            if (totalSec < 60) {
                setElapsedPhase('ss');
                setElapsedDisplay(pad(seconds));
            } else if (totalSec < 3600) {
                setElapsedPhase('mmss');
                setElapsedDisplay(`${pad(minutes)}:${pad(seconds)}`);
            } else if (totalSec < 86400) {
                setElapsedPhase('hhmmss');
                setElapsedDisplay(`${pad(hours)}:${pad(minutes)}:${pad(seconds)}`);
            } else {
                setElapsedPhase('ddhhmmss');
                setElapsedDisplay(`${pad(days)}:${pad(hours)}:${pad(minutes)}:${pad(seconds)}`);
            }

            // --- Remaining (countdown) ---
            if (effectiveEndMs) {
                const diff = effectiveEndMs - now;
                if (diff <= 0) {
                    setIsExpired(true);
                    setRemainingDisplay('00:00:00:00');
                    return;
                }
                setIsExpired(false);
                const r = msToParts(diff);
                setRemainingDisplay(`${r.pad(r.days)}:${r.pad(r.hours)}:${r.pad(r.minutes)}:${r.pad(r.seconds)}`);
            }
        };

        const interval = setInterval(update, 1000);
        update();
        return () => clearInterval(interval);
    }, [startDate, effectiveEndMs]);

    const handleToggle = useCallback(() => {
        Animated.sequence([
            Animated.timing(fadeAnim, { toValue: 0, duration: 110, useNativeDriver: true }),
            Animated.timing(fadeAnim, { toValue: 1, duration: 110, useNativeDriver: true }),
        ]).start();
        setTimeout(() => setShowRemaining((prev) => !prev), 110);
    }, [fadeAnim]);

    const activeDisplay = showRemaining ? remainingDisplay : elapsedDisplay;
    const activePhase = showRemaining ? remainingPhase : elapsedPhase;

    return (
        <View
            style={[
                styles.container,
                {
                    backgroundColor: theme.colors.surface,
                    borderRadius: theme.radius.lg,
                    borderColor: theme.colors.border,
                    ...theme.shadow.card,
                },
            ]}
        >
            <GlassTopHighlight radius={theme.radius.lg} />
            {canToggle ? (
                <View style={styles.cornerArrow} pointerEvents="none">
                    {showRemaining ? (
                        <ArrowDown size={13} color={theme.colors.textMuted} strokeWidth={2.4} />
                    ) : (
                        <ArrowUp size={13} color={theme.colors.textMuted} strokeWidth={2.4} />
                    )}
                </View>
            ) : null}
            {introEnabled ? (
                <Animated.View
                    onLayout={handleIconLayout}
                    style={
                        iconBoxWidth !== null
                            ? { width: introWidthAnim, marginRight: introMarginAnim, opacity: introOpacityAnim, overflow: 'hidden' }
                            : { marginRight: 16 }
                    }
                >
                    <View style={[styles.iconContainer, { marginRight: 0 }]}>
                        <FireLottie source={{ uri: FIRE_LOTTIE_URI }} size={56} />
                    </View>
                </Animated.View>
            ) : (
                <View style={styles.iconContainer}>
                    <FireLottie source={{ uri: FIRE_LOTTIE_URI }} size={56} />
                </View>
            )}
            <View style={styles.contentContainer}>
                <TouchableOpacity
                    onPress={canToggle ? handleToggle : undefined}
                    disabled={!canToggle}
                    activeOpacity={0.7}
                    accessibilityRole={canToggle ? "button" : undefined}
                    accessibilityLabel={canToggle ? (showRemaining ? "Show time elapsed" : "Show time left") : undefined}
                >
                    <Animated.View style={{ opacity: fadeAnim, transform: [{ scale: introDigitScale }] }}>
                        <SplitFlapTimeDisplay
                            display={activeDisplay || fallbackDisplay(activePhase)}
                            phase={activePhase}
                            size="large"
                            timeColor={isExpired ? theme.colors.red[500] : theme.colors.textPrimary}
                            digitTextShadow={
                                isExpired
                                    ? { textShadowColor: 'rgba(239, 68, 68, 0.45)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6 }
                                    : { textShadowColor: 'rgba(99, 102, 241, 0.45)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6 }
                            }
                        />
                        <View style={styles.legendContainer}>
                            {LEGEND_BY_PHASE[activePhase].map((legendLabel, i) => (
                                <Fragment key={legendLabel}>
                                    {i > 0 ? <View style={styles.legendGap} /> : null}
                                    <View style={styles.legendCol}>
                                        <Text style={[styles.legendText, { color: theme.colors.textMuted }]}>{legendLabel}</Text>
                                    </View>
                                </Fragment>
                            ))}
                        </View>
                    </Animated.View>
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        paddingTop: 24,
        marginBottom: 10,
        borderWidth: 1,
    },
    topHighlight: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 18,
    },
    iconContainer: {
        marginRight: 16,
        // Nudges the flame's optical center up to match the big digits' center,
        // not the digits+legend combined block's center (the legend row below
        // adds height only on that side, which used to be negligible back when
        // the digits were tiny — now that they're large, the mismatch is visible).
        marginBottom: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    contentContainer: {
        flex: 1,
    },
    cornerArrow: {
        position: 'absolute',
        top: 8,
        right: 8,
        opacity: 0.55,
    },
    legendContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        width: '100%',
        marginTop: 6,
        alignSelf: 'stretch',
        minWidth: 0,
    },
    legendGap: {
        width: 11,
        flexShrink: 0,
    },
    legendCol: {
        flex: 1,
        minWidth: 0,
        alignItems: 'center',
    },
    legendText: {
        fontSize: 9,
        fontWeight: '700',
        letterSpacing: 0.4,
        textAlign: 'center',
    },
});
