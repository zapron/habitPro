import { useState, useEffect } from 'react';
import { Text, StyleSheet, View, Platform } from 'react-native';
import { theme } from '../styles/theme';
import { AnimatedFire } from './AnimatedFire';

interface TimerProps {
    startDate: string;
}

export function Timer({ startDate }: TimerProps) {
    const [timeElapsed, setTimeElapsed] = useState('');

    useEffect(() => {
        const updateTimer = () => {
            const start = new Date(startDate).getTime();
            const now = new Date().getTime();
            const diff = now - start;

            if (diff < 0) {
                setTimeElapsed('00:00:00:00');
                return;
            }

            const days = Math.floor(diff / (1000 * 60 * 60 * 24));
            const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((diff % (1000 * 60)) / 1000);

            const d = days.toString().padStart(2, '0');
            const h = hours.toString().padStart(2, '0');
            const m = minutes.toString().padStart(2, '0');
            const s = seconds.toString().padStart(2, '0');

            setTimeElapsed(`${d}:${h}:${m}:${s}`);
        };

        const interval = setInterval(updateTimer, 1000);
        updateTimer();

        return () => clearInterval(interval);
    }, [startDate]);

    return (
        <View style={styles.container}>
            <View style={styles.iconContainer}>
                <AnimatedFire size={32} color={theme.colors.amber[500]} />
            </View>
            <View style={styles.contentContainer}>
                <Text style={styles.label}>MISSION ACTIVE</Text>
                <Text style={styles.time}>{timeElapsed}</Text>
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
    iconContainer: {
        marginRight: 20,
        backgroundColor: 'rgba(245, 158, 11, 0.1)', // Amber with opacity
        padding: 10,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: 'rgba(245, 158, 11, 0.3)',
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
        textShadowColor: 'rgba(99, 102, 241, 0.5)', // Indigo glow
        textShadowOffset: { width: 0, height: 2 },
        textShadowRadius: 8,
        ...(Platform.OS === 'android'
            ? {
                includeFontPadding: false,
                textAlignVertical: 'center',
            }
            : {}),
    },
    legendContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        width: '100%',
        paddingRight: 10, // Adjust logic for spacing if needed, but this is simple
        marginTop: 4,
    },
    legendText: {
        color: theme.colors.textMuted,
        fontSize: 10,
        fontWeight: 'bold',
        width: '22%', // Roughly distribute
        textAlign: 'center',
    }
});
