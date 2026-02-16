import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, Dimensions } from 'react-native';

const PARTICLE_COUNT = 24;
const COLORS = [
    '#6366f1', '#818cf8', '#22d3ee', '#06b6d4',
    '#f59e0b', '#fbbf24', '#22c55e', '#f472b6',
    '#a78bfa', '#fb923c',
];

interface ConfettiBurstProps {
    active: boolean;
    isMilestone?: boolean;
    originX?: number;
    originY?: number;
}

interface Particle {
    x: Animated.Value;
    y: Animated.Value;
    rotate: Animated.Value;
    opacity: Animated.Value;
    scale: Animated.Value;
    color: string;
    size: number;
    shape: 'square' | 'circle' | 'strip';
}

export function ConfettiBurst({ active, isMilestone = false, originX = 0, originY = 0 }: ConfettiBurstProps) {
    const count = isMilestone ? PARTICLE_COUNT * 2 : PARTICLE_COUNT;

    const particles = useRef<Particle[]>(
        Array.from({ length: count }, () => ({
            x: new Animated.Value(0),
            y: new Animated.Value(0),
            rotate: new Animated.Value(0),
            opacity: new Animated.Value(0),
            scale: new Animated.Value(0),
            color: COLORS[Math.floor(Math.random() * COLORS.length)],
            size: 4 + Math.random() * 6,
            shape: (['square', 'circle', 'strip'] as const)[Math.floor(Math.random() * 3)],
        })),
    ).current;

    useEffect(() => {
        if (!active) return;

        const animations = particles.map((p) => {
            // Reset
            p.x.setValue(0);
            p.y.setValue(0);
            p.rotate.setValue(0);
            p.opacity.setValue(1);
            p.scale.setValue(0);

            const angle = Math.random() * Math.PI * 2;
            const distance = 60 + Math.random() * (isMilestone ? 140 : 90);
            const targetX = Math.cos(angle) * distance;
            const targetY = Math.sin(angle) * distance - 30; // bias upward
            const duration = 600 + Math.random() * 400;

            return Animated.parallel([
                Animated.timing(p.x, {
                    toValue: targetX,
                    duration,
                    useNativeDriver: true,
                }),
                Animated.timing(p.y, {
                    toValue: targetY + 40, // gravity pull
                    duration,
                    useNativeDriver: true,
                }),
                Animated.sequence([
                    Animated.timing(p.scale, {
                        toValue: 1,
                        duration: 100,
                        useNativeDriver: true,
                    }),
                    Animated.timing(p.scale, {
                        toValue: 0.3,
                        duration: duration - 100,
                        useNativeDriver: true,
                    }),
                ]),
                Animated.timing(p.rotate, {
                    toValue: 2 + Math.random() * 4,
                    duration,
                    useNativeDriver: true,
                }),
                Animated.sequence([
                    Animated.delay(duration * 0.5),
                    Animated.timing(p.opacity, {
                        toValue: 0,
                        duration: duration * 0.5,
                        useNativeDriver: true,
                    }),
                ]),
            ]);
        });

        Animated.parallel(animations).start();
    }, [active, isMilestone, particles]);

    if (!active) return null;

    return (
        <View style={[styles.container, { left: originX, top: originY }]} pointerEvents="none">
            {particles.map((p, i) => {
                const rotate = p.rotate.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0deg', '360deg'],
                });
                const borderRadius = p.shape === 'circle' ? p.size / 2 : p.shape === 'strip' ? 1 : 2;
                const width = p.shape === 'strip' ? 3 : p.size;
                const height = p.shape === 'strip' ? p.size * 2 : p.size;

                return (
                    <Animated.View
                        key={i}
                        style={[
                            styles.particle,
                            {
                                width,
                                height,
                                borderRadius,
                                backgroundColor: p.color,
                                transform: [
                                    { translateX: p.x },
                                    { translateY: p.y },
                                    { rotate },
                                    { scale: p.scale },
                                ],
                                opacity: p.opacity,
                            },
                        ]}
                    />
                );
            })}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        zIndex: 999,
    },
    particle: {
        position: 'absolute',
    },
});
