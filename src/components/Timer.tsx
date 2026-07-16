import { Text } from "./AppText";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, TouchableOpacity, View } from "react-native";
import { useTheme } from '../context/ThemeContext';
import { AnimatedFire } from './AnimatedFire';
import { FireLottie } from "./FireLottie";
import { SplitFlapTimeDisplay, type ProgressivePhase } from './SplitFlapTimeDisplay';
import type { HabitMode } from '../types/habit';

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
    const { theme } = useTheme();
    const isManual = mode === 'manual';

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
    const label = isExpired ? "TIME'S UP" : showRemaining ? 'TIME LEFT' : 'MISSION ACTIVE';

    return (
        <View
            style={[
                styles.container,
                {
                    backgroundColor: theme.colors.surface,
                    borderRadius: theme.radius.lg,
                    borderColor: isManual ? 'rgba(245, 158, 11, 0.35)' : theme.colors.border,
                    ...theme.shadow.card,
                },
            ]}
        >
            <View
                style={[
                    styles.iconContainer,
                    isManual && { backgroundColor: 'rgba(245, 158, 11, 0.15)', borderColor: 'rgba(245, 158, 11, 0.4)' },
                ]}
            >
                <FireLottie source={{ uri: FIRE_LOTTIE_URI }} size={56} />
            </View>
            <View style={styles.contentContainer}>
                <View style={styles.labelRow}>
                    <Text style={[styles.label, { color: theme.colors.textSecondary }]}>{label}</Text>
                    {canToggle ? (
                        <TouchableOpacity
                            onPress={handleToggle}
                            hitSlop={10}
                            style={[
                                styles.togglePill,
                                {
                                    borderColor: theme.colors.indigo[500],
                                    backgroundColor: `${theme.colors.indigo[500]}22`,
                                },
                            ]}
                        >
                            <Text style={[styles.toggleText, { color: theme.colors.indigo[400] }]}>
                                {showRemaining ? '↑ elapsed' : '↓ left'}
                            </Text>
                        </TouchableOpacity>
                    ) : null}
                </View>
                <Animated.View style={{ opacity: fadeAnim }}>
                    <SplitFlapTimeDisplay
                        display={activeDisplay || fallbackDisplay(activePhase)}
                        phase={activePhase}
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
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        marginBottom: 10,
        borderWidth: 1,
    },
    iconContainer: {
        marginRight: 16,
        backgroundColor: 'rgba(245, 158, 11, 0.1)',
        padding: 9,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: 'rgba(245, 158, 11, 0.3)',
    },
    contentContainer: {
        flex: 1,
    },
    labelRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 4,
    },
    label: {
        fontSize: 12,
        fontWeight: 'bold',
        letterSpacing: 1.5,
        textTransform: 'uppercase',
    },
    togglePill: {
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 999,
        borderWidth: 1,
    },
    toggleText: {
        fontSize: 10,
        fontWeight: '700',
        letterSpacing: 0.5,
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
        fontSize: 10,
        fontWeight: 'bold',
        textAlign: 'center',
    },
});
