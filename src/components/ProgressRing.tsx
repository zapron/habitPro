import React, { useEffect, useRef } from 'react';
import { Animated, View, StyleSheet, Easing } from 'react-native';
import { theme } from '../styles/theme';

interface ProgressRingProps {
    progress: number; // 0 to 1
    size?: number;
    strokeWidth?: number;
    color?: string;
    glowOnNearComplete?: boolean;
    children?: React.ReactNode;
}

/**
 * Animated progress ring using pure RN border tricks.
 * Shows a circular progress indicator that fills clockwise.
 */
export function ProgressRing({
    progress,
    size = 52,
    strokeWidth = 3,
    color = theme.colors.indigo[500],
    glowOnNearComplete = true,
    children,
}: ProgressRingProps) {
    const animatedProgress = useRef(new Animated.Value(0)).current;
    const glowPulse = useRef(new Animated.Value(0)).current;
    const isNearComplete = progress >= 0.8;
    const isComplete = progress >= 1;

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

    // We use a "two halves" technique for the ring
    const halfSize = size / 2;
    const activeColor = isComplete ? theme.colors.green[500] : color;
    const bgColor = theme.colors.slate[700];

    // Calculate the rotation for each half
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
        <View
            style={[
                styles.container,
                {
                    width: size,
                    height: size,
                    borderRadius: halfSize,
                },
            ]}
        >
            {/* Background ring */}
            <View
                style={[
                    styles.ring,
                    {
                        width: size,
                        height: size,
                        borderRadius: halfSize,
                        borderWidth: strokeWidth,
                        borderColor: bgColor,
                    },
                ]}
            />

            {/* Right half */}
            <View
                style={[
                    styles.halfClip,
                    {
                        width: halfSize,
                        height: size,
                        left: halfSize,
                        overflow: 'hidden',
                    },
                ]}
            >
                <Animated.View
                    style={{
                        width: halfSize,
                        height: size,
                        borderTopRightRadius: halfSize,
                        borderBottomRightRadius: halfSize,
                        borderWidth: strokeWidth,
                        borderLeftWidth: 0,
                        borderColor: activeColor,
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

            {/* Left half */}
            <Animated.View
                style={[
                    styles.halfClip,
                    {
                        width: halfSize,
                        height: size,
                        left: 0,
                        overflow: 'hidden',
                        opacity: leftOpacity,
                    },
                ]}
            >
                <Animated.View
                    style={{
                        width: halfSize,
                        height: size,
                        borderTopLeftRadius: halfSize,
                        borderBottomLeftRadius: halfSize,
                        borderWidth: strokeWidth,
                        borderRightWidth: 0,
                        borderColor: activeColor,
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

            {/* Glow for near-complete */}
            {isNearComplete && glowOnNearComplete && !isComplete && (
                <Animated.View
                    style={[
                        styles.glow,
                        {
                            width: size + 8,
                            height: size + 8,
                            borderRadius: (size + 8) / 2,
                            borderWidth: 2,
                            borderColor: activeColor,
                            opacity: shadowOpacity,
                        },
                    ]}
                    pointerEvents="none"
                />
            )}

            {/* Center content */}
            <View
                style={[
                    styles.center,
                    {
                        width: size - strokeWidth * 2 - 4,
                        height: size - strokeWidth * 2 - 4,
                        borderRadius: (size - strokeWidth * 2 - 4) / 2,
                    },
                ]}
            >
                {children}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        position: 'relative',
        alignItems: 'center',
        justifyContent: 'center',
    },
    ring: {
        position: 'absolute',
    },
    halfClip: {
        position: 'absolute',
        top: 0,
    },
    glow: {
        position: 'absolute',
    },
    center: {
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.surfaceElevated,
    },
});
