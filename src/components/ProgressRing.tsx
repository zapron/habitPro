import React, { useEffect, useRef } from 'react';
import { Animated, View, StyleSheet, Easing } from 'react-native';
import { useTheme } from '../context/ThemeContext';

interface ProgressRingProps {
    progress: number;
    size?: number;
    strokeWidth?: number;
    color?: string;
    glowOnNearComplete?: boolean;
    children?: React.ReactNode;
}

export function ProgressRing({
    progress,
    size = 52,
    strokeWidth = 3,
    color,
    glowOnNearComplete = true,
    children,
}: ProgressRingProps) {
    const { theme } = useTheme();
    const activeColor = color ?? theme.colors.indigo[500];
    const animatedProgress = useRef(new Animated.Value(0)).current;
    const glowPulse = useRef(new Animated.Value(0)).current;
    const isNearComplete = progress >= 0.8;
    const isComplete = progress >= 1;
    const ringColor = isComplete ? theme.colors.green[500] : activeColor;
    const bgColor = theme.colors.slate[700];

    useEffect(() => {
        Animated.spring(animatedProgress, {
            toValue: progress,
            tension: 40,
            friction: 8,
            useNativeDriver: false,
        }).start();
    }, [progress, animatedProgress]);

    useEffect(() => {
        if (isNearComplete && glowOnNearComplete && !isComplete) {
            Animated.loop(
                Animated.sequence([
                    Animated.timing(glowPulse, {
                        toValue: 1,
                        duration: 1200,
                        easing: Easing.inOut(Easing.ease),
                        useNativeDriver: false,
                    }),
                    Animated.timing(glowPulse, {
                        toValue: 0,
                        duration: 1200,
                        easing: Easing.inOut(Easing.ease),
                        useNativeDriver: false,
                    }),
                ]),
            ).start();
        }
    }, [isNearComplete, isComplete, glowOnNearComplete, glowPulse]);

    const halfSize = size / 2;

    const rightRotation = animatedProgress.interpolate({
        inputRange: [0, 0.5, 1],
        outputRange: ['0deg', '180deg', '180deg'],
        extrapolate: 'clamp',
    });

    const leftRotation = animatedProgress.interpolate({
        inputRange: [0, 0.5, 1],
        outputRange: ['0deg', '0deg', '180deg'],
        extrapolate: 'clamp',
    });

    const leftOpacity = animatedProgress.interpolate({
        inputRange: [0, 0.499, 0.5, 1],
        outputRange: [0, 0, 1, 1],
        extrapolate: 'clamp',
    });

    const shadowOpacity = glowPulse.interpolate({
        inputRange: [0, 1],
        outputRange: [0.3, 0.8],
    });

    return (
        <View style={[styles.container, { width: size, height: size, borderRadius: halfSize }]}>
            <View style={[styles.ring, { width: size, height: size, borderRadius: halfSize, borderWidth: strokeWidth, borderColor: bgColor }]} />

            <View style={[styles.halfClip, { width: halfSize, height: size, left: halfSize, overflow: 'hidden' }]}>
                <Animated.View
                    style={{
                        width: halfSize,
                        height: size,
                        borderTopRightRadius: halfSize,
                        borderBottomRightRadius: halfSize,
                        borderWidth: strokeWidth,
                        borderLeftWidth: 0,
                        borderColor: ringColor,
                        position: 'absolute',
                        left: 0,
                        transform: [
                            { translateX: -halfSize / 2 },
                            { rotate: rightRotation },
                            { translateX: halfSize / 2 },
                        ],
                        transformOrigin: 'left center' as any,
                    }}
                />
            </View>

            <Animated.View style={[styles.halfClip, { width: halfSize, height: size, left: 0, overflow: 'hidden', opacity: leftOpacity }]}>
                <Animated.View
                    style={{
                        width: halfSize,
                        height: size,
                        borderTopLeftRadius: halfSize,
                        borderBottomLeftRadius: halfSize,
                        borderWidth: strokeWidth,
                        borderRightWidth: 0,
                        borderColor: ringColor,
                        position: 'absolute',
                        right: 0,
                        transform: [
                            { translateX: halfSize / 2 },
                            { rotate: leftRotation },
                            { translateX: -halfSize / 2 },
                        ],
                        transformOrigin: 'right center' as any,
                    }}
                />
            </Animated.View>

            {isNearComplete && glowOnNearComplete && !isComplete && (
                <Animated.View
                    style={[styles.glow, { width: size + 8, height: size + 8, borderRadius: (size + 8) / 2, borderWidth: 2, borderColor: ringColor, opacity: shadowOpacity }]}
                    pointerEvents="none"
                />
            )}

            <View style={[styles.center, { width: size - strokeWidth * 2 - 4, height: size - strokeWidth * 2 - 4, borderRadius: (size - strokeWidth * 2 - 4) / 2, backgroundColor: theme.colors.surfaceElevated }]}>
                {children}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { position: 'relative', alignItems: 'center', justifyContent: 'center' },
    ring: { position: 'absolute' },
    halfClip: { position: 'absolute', top: 0 },
    glow: { position: 'absolute' },
    center: { alignItems: 'center', justifyContent: 'center' },
});
