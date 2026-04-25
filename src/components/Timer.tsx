import { Text } from "./AppText";
import { Fragment, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
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
}

const LEGEND_BY_PHASE: Record<ProgressivePhase, readonly string[]> = {
    ss: ['SEC'],
    mmss: ['MIN', 'SEC'],
    hhmmss: ['HRS', 'MIN', 'SEC'],
    ddhhmmss: ['DAYS', 'HRS', 'MIN', 'SEC'],
};

function fallbackDisplay(phase: ProgressivePhase): string {
    switch (phase) {
        case 'ss':
            return '00';
        case 'mmss':
            return '00:00';
        case 'hhmmss':
            return '00:00:00';
        case 'ddhhmmss':
        default:
            return '00:00:00:00';
    }
}

export function Timer({ startDate, mode = 'autopilot', endDate }: TimerProps) {
    const { theme } = useTheme();
    const isCountdown = mode === 'manual';

    const [display, setDisplay] = useState(() => (isCountdown ? '00:00:00:00' : '00'));
    const [phase, setPhase] = useState<ProgressivePhase>(() => (isCountdown ? 'ddhhmmss' : 'ss'));
    const [isExpired, setIsExpired] = useState(false);

    useEffect(() => {
        const updateTimer = () => {
            const now = Date.now();

            if (mode === 'manual' && endDate) {
                const end = new Date(endDate).getTime();
                const diff = end - now;

                if (diff <= 0) {
                    setDisplay('00:00:00:00');
                    setPhase('ddhhmmss');
                    setIsExpired(true);
                    return;
                }
                setIsExpired(false);
                setPhase('ddhhmmss');

                const days = Math.floor(diff / (1000 * 60 * 60 * 24));
                const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                const seconds = Math.floor((diff % (1000 * 60)) / 1000);

                setDisplay(
                    `${days.toString().padStart(2, '0')}:${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`,
                );
                return;
            }

            // Autopilot: count up from start — progressive units (sec → min → hr → days)
            const start = new Date(startDate).getTime();
            const diff = now - start;

            if (diff < 0) {
                setPhase('ss');
                setDisplay('00');
                return;
            }

            const totalSec = Math.floor(diff / 1000);

            if (totalSec < 60) {
                setPhase('ss');
                setDisplay(String(totalSec % 60).padStart(2, '0'));
                return;
            }

            if (totalSec < 3600) {
                setPhase('mmss');
                const m = Math.floor(totalSec / 60);
                const s = totalSec % 60;
                setDisplay(`${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
                return;
            }

            if (totalSec < 86400) {
                setPhase('hhmmss');
                const h = Math.floor(totalSec / 3600);
                const m = Math.floor((totalSec % 3600) / 60);
                const s = totalSec % 60;
                setDisplay(
                    `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`,
                );
                return;
            }

            setPhase('ddhhmmss');
            const days = Math.floor(totalSec / 86400);
            const hours = Math.floor((totalSec % 86400) / 3600);
            const minutes = Math.floor((totalSec % 3600) / 60);
            const seconds = totalSec % 60;
            setDisplay(
                `${days.toString().padStart(2, '0')}:${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`,
            );
        };

        const interval = setInterval(updateTimer, 1000);
        updateTimer();

        return () => clearInterval(interval);
    }, [startDate, mode, endDate]);

    const safeDisplay = display || fallbackDisplay(phase);
    const legendLabels = LEGEND_BY_PHASE[phase];

    return (
        <View
            style={[
                styles.container,
                {
                    backgroundColor: theme.colors.surface,
                    borderRadius: theme.radius.lg,
                    borderColor: isCountdown ? 'rgba(245, 158, 11, 0.35)' : theme.colors.border,
                    ...theme.shadow.card,
                },
            ]}
        >
            <View
                style={[
                    styles.iconContainer,
                    isCountdown && { backgroundColor: 'rgba(245, 158, 11, 0.15)', borderColor: 'rgba(245, 158, 11, 0.4)' },
                ]}
            >
                <FireLottie source={{ uri: FIRE_LOTTIE_URI }} size={56} />
            </View>
            <View style={styles.contentContainer}>
                <Text style={[styles.label, { color: theme.colors.textSecondary }]}>
                    {isExpired ? "TIME'S UP" : isCountdown ? 'COUNTDOWN' : 'MISSION ACTIVE'}
                </Text>
                <SplitFlapTimeDisplay
                    display={safeDisplay}
                    phase={phase}
                    timeColor={isExpired ? theme.colors.red[500] : theme.colors.textPrimary}
                    digitTextShadow={
                        isExpired
                            ? {
                                  textShadowColor: 'rgba(239, 68, 68, 0.45)',
                                  textShadowOffset: { width: 0, height: 1 },
                                  textShadowRadius: 6,
                              }
                            : {
                                  textShadowColor: 'rgba(99, 102, 241, 0.45)',
                                  textShadowOffset: { width: 0, height: 1 },
                                  textShadowRadius: 6,
                              }
                    }
                />
                <View style={styles.legendContainer}>
                    {legendLabels.map((label, i) => (
                        <Fragment key={label}>
                            {i > 0 ? <View style={styles.legendGap} /> : null}
                            <View style={styles.legendCol}>
                                <Text style={[styles.legendText, { color: theme.colors.textMuted }]}>{label}</Text>
                            </View>
                        </Fragment>
                    ))}
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 20,
        marginBottom: 32,
        borderWidth: 1,
    },
    iconContainer: {
        marginRight: 20,
        backgroundColor: 'rgba(245, 158, 11, 0.1)',
        padding: 10,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: 'rgba(245, 158, 11, 0.3)',
    },
    contentContainer: {
        flex: 1,
    },
    label: {
        fontSize: 12,
        fontWeight: 'bold',
        letterSpacing: 1.5,
        marginBottom: 4,
        textTransform: 'uppercase',
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
