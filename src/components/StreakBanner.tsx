import React, { useEffect, useRef } from 'react';
import { Animated, View, Text, StyleSheet, Easing } from 'react-native';
import { Flame, Zap, Crown } from 'lucide-react-native';
import { theme } from '../styles/theme';

interface StreakBannerProps {
    streak: number;
}

export function StreakBanner({ streak }: StreakBannerProps) {
    const slideIn = useRef(new Animated.Value(-60)).current;
    const opacity = useRef(new Animated.Value(0)).current;
    const glow = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (streak < 3) return;
        Animated.parallel([
            Animated.spring(slideIn, {
                toValue: 0,
                tension: 60,
                friction: 8,
                useNativeDriver: true,
            }),
            Animated.timing(opacity, {
                toValue: 1,
                duration: 400,
                useNativeDriver: true,
            }),
        ]).start();

        // Pulse glow
        Animated.loop(
            Animated.sequence([
                Animated.timing(glow, {
                    toValue: 1,
                    duration: 1500,
                    easing: Easing.inOut(Easing.ease),
                    useNativeDriver: true,
                }),
                Animated.timing(glow, {
                    toValue: 0,
                    duration: 1500,
                    easing: Easing.inOut(Easing.ease),
                    useNativeDriver: true,
                }),
            ]),
        ).start();
    }, [streak, slideIn, opacity, glow]);

    if (streak < 3) return null;

    const intensity = streak >= 21 ? 'legendary' : streak >= 14 ? 'epic' : streak >= 7 ? 'hot' : 'warm';
    const bgColor =
        intensity === 'legendary'
            ? 'rgba(251, 191, 36, 0.18)'
            : intensity === 'epic'
                ? 'rgba(239, 68, 68, 0.14)'
                : intensity === 'hot'
                    ? 'rgba(245, 158, 11, 0.14)'
                    : 'rgba(245, 158, 11, 0.08)';
    const borderColor =
        intensity === 'legendary'
            ? 'rgba(251, 191, 36, 0.5)'
            : intensity === 'epic'
                ? 'rgba(239, 68, 68, 0.4)'
                : intensity === 'hot'
                    ? 'rgba(245, 158, 11, 0.4)'
                    : 'rgba(245, 158, 11, 0.25)';
    const textColor =
        intensity === 'legendary'
            ? theme.colors.yellow[400]
            : intensity === 'epic'
                ? theme.colors.red[500]
                : theme.colors.amber[500];

    const Icon = intensity === 'legendary' ? Crown : intensity === 'epic' ? Zap : Flame;
    const label =
        intensity === 'legendary'
            ? `🏆 LEGENDARY ${streak}-day streak!`
            : intensity === 'epic'
                ? `⚡ EPIC ${streak}-day streak!`
                : intensity === 'hot'
                    ? `🔥 ${streak}-day streak on fire!`
                    : `🔥 ${streak}-day streak!`;

    const glowOpacity = glow.interpolate({
        inputRange: [0, 1],
        outputRange: [0.6, 1],
    });

    return (
        <Animated.View
            style={[
                styles.container,
                {
                    backgroundColor: bgColor,
                    borderColor,
                    transform: [{ translateY: slideIn }],
                    opacity: Animated.multiply(opacity, glowOpacity),
                },
            ]}
        >
            <Icon size={18} color={textColor} />
            <Text style={[styles.text, { color: textColor }]}>{label}</Text>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingVertical: 10,
        paddingHorizontal: 14,
        borderRadius: theme.radius.md,
        borderWidth: 1,
        marginBottom: 16,
    },
    text: {
        fontWeight: '800',
        fontSize: 14,
        letterSpacing: 0.3,
    },
});
