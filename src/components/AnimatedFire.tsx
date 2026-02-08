import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Easing } from 'react-native';
import { Flame } from 'lucide-react-native';
import { theme } from '../styles/theme';

interface AnimatedFireProps {
    size?: number;
    color?: string;
}

export function AnimatedFire({ size = 24, color = theme.colors.amber[500] }: AnimatedFireProps) {
    const scaleAnim = useRef(new Animated.Value(1)).current;
    const opacityAnim = useRef(new Animated.Value(0.5)).current;

    useEffect(() => {
        const pulse = Animated.loop(
            Animated.parallel([
                Animated.sequence([
                    Animated.timing(scaleAnim, {
                        toValue: 1.2,
                        duration: 1000,
                        easing: Easing.inOut(Easing.ease),
                        useNativeDriver: true,
                    }),
                    Animated.timing(scaleAnim, {
                        toValue: 1,
                        duration: 1000,
                        easing: Easing.inOut(Easing.ease),
                        useNativeDriver: true,
                    }),
                ]),
                Animated.sequence([
                    Animated.timing(opacityAnim, {
                        toValue: 0.8,
                        duration: 1000,
                        easing: Easing.inOut(Easing.ease),
                        useNativeDriver: true,
                    }),
                    Animated.timing(opacityAnim, {
                        toValue: 0.5,
                        duration: 1000,
                        easing: Easing.inOut(Easing.ease),
                        useNativeDriver: true,
                    }),
                ]),
            ])
        );

        pulse.start();

        return () => pulse.stop();
    }, [scaleAnim, opacityAnim]);

    return (
        <View style={styles.container}>
            {/* Core Flame */}
            <View style={styles.coreContainer}>
                <Flame size={size} color={color} fill={color} />
            </View>

            {/* Outer Glow */}
            <Animated.View
                style={[
                    StyleSheet.absoluteFill,
                    styles.glowContainer,
                    {
                        transform: [{ scale: scaleAnim }],
                        opacity: opacityAnim
                    }
                ]}
            >
                <Flame size={size} color={color} style={{ opacity: 0.5 }} />
            </Animated.View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        alignItems: 'center',
        justifyContent: 'center',
        width: 30,
        height: 30,
    },
    coreContainer: {
        zIndex: 1,
    },
    glowContainer: {
        alignItems: 'center',
        justifyContent: 'center',
    }
});
