import { useState, useEffect } from 'react';
import { Text, StyleSheet, View, Platform } from 'react-native';
import { theme } from '../styles/theme';
import { AnimatedFire } from './AnimatedFire';
import type { HabitMode } from '../types/habit';

interface TimerProps {
    startDate: string;
    mode?: HabitMode;
    endDate?: string;
}

export function Timer({ startDate, mode = 'autopilot', endDate }: TimerProps) {
    const [display, setDisplay] = useState('');
    const [isExpired, setIsExpired] = useState(false);

    useEffect(() => {
        const updateTimer = () => {
            const now = Date.now();

            if (mode === 'manual' && endDate) {
                // ── Countdown mode ──
                const end = new Date(endDate).getTime();
                const diff = end - now;

                if (diff <= 0) {
                    setDisplay('00:00:00:00');
                    setIsExpired(true);
                    return;
                }
                setIsExpired(false);

                const days = Math.floor(diff / (1000 * 60 * 60 * 24));
                const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                const seconds = Math.floor((diff % (1000 * 60)) / 1000);

                setDisplay(
                    `${days.toString().padStart(2, '0')}:${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`,
                );
            } else {
                // ── Count-up mode (autopilot) ──
                const start = new Date(startDate).getTime();
                const diff = now - start;

                if (diff < 0) {
                    setDisplay('00:00:00:00');
                    return;
                }

                const days = Math.floor(diff / (1000 * 60 * 60 * 24));
                const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                const seconds = Math.floor((diff % (1000 * 60)) / 1000);

                setDisplay(
                    `${days.toString().padStart(2, '0')}:${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`,
                );
            }
        };

        const interval = setInterval(updateTimer, 1000);
        updateTimer();

        return () => clearInterval(interval);
    }, [startDate, mode, endDate]);

    const isCountdown = mode === 'manual';

    return (
        <View style={[styles.container, isCountdown && styles.containerManual]}>
            <View style={[styles.iconContainer, isCountdown && styles.iconContainerManual]}>
                <AnimatedFire size={32} color={isCountdown ? theme.colors.amber[500] : theme.colors.amber[500]} />
            </View>
            <View style={styles.contentContainer}>
                <Text style={styles.label}>
                    {isExpired ? "TIME'S UP" : isCountdown ? 'COUNTDOWN' : 'MISSION ACTIVE'}
                </Text>
                <Text style={[styles.time, isExpired && styles.timeExpired]}>
                    {display}
                </Text>
                <View style={styles.legendContainer}>
                    <Text style={styles.legendText}>DAYS</Text>
                    <Text style={styles.legendText}>HRS</Text>
                    <Text style={styles.legendText}>MIN</Text>
                    <Text style={styles.legendText}>SEC</Text>
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: theme.colors.surface,
        padding: 20,
        borderRadius: theme.radius.lg,
        marginBottom: 32,
        borderWidth: 1,
        borderColor: theme.colors.border,
        ...theme.shadow.card,
    },
    containerManual: {
        borderColor: 'rgba(245, 158, 11, 0.35)',
    },
    iconContainer: {
        marginRight: 20,
        backgroundColor: 'rgba(245, 158, 11, 0.1)',
        padding: 10,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: 'rgba(245, 158, 11, 0.3)',
    },
    iconContainerManual: {
        backgroundColor: 'rgba(245, 158, 11, 0.15)',
        borderColor: 'rgba(245, 158, 11, 0.4)',
    },
    contentContainer: {
        flex: 1,
    },
    label: {
        color: theme.colors.textSecondary,
        fontSize: 12,
        fontWeight: 'bold',
        letterSpacing: 1.5,
        marginBottom: 4,
        textTransform: 'uppercase',
    },
    time: {
        color: theme.colors.textPrimary,
        fontWeight: 'bold',
        fontSize: 32,
        lineHeight: 34,
        letterSpacing: 2,
        fontVariant: ['tabular-nums'],
        textShadowColor: 'rgba(99, 102, 241, 0.5)',
        textShadowOffset: { width: 0, height: 2 },
        textShadowRadius: 8,
        ...(Platform.OS === 'android'
            ? {
                includeFontPadding: false,
                textAlignVertical: 'center',
            }
            : {}),
    },
    timeExpired: {
        color: theme.colors.red[500],
        textShadowColor: 'rgba(239, 68, 68, 0.5)',
    },
    legendContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        width: '100%',
        paddingRight: 10,
        marginTop: 4,
    },
    legendText: {
        color: theme.colors.textMuted,
        fontSize: 10,
        fontWeight: 'bold',
        width: '22%',
        textAlign: 'center',
    },
});
