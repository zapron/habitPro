import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Easing } from 'react-native';
import { Flame } from 'lucide-react-native';
import { theme } from '../styles/theme';

interface AnimatedFireProps {
    size?: number;
    color?: string;
}

type Ember = {
    progress: Animated.Value;
    driftX: Animated.Value;
    tint: string;
    dotSize: number;
};

const EMBER_COUNT = 7;

export function AnimatedFire({ size = 24, color = theme.colors.amber[500] }: AnimatedFireProps) {
    const scale1 = useRef(new Animated.Value(1)).current;
    const opacity1 = useRef(new Animated.Value(0.9)).current;
    const scale2 = useRef(new Animated.Value(0.9)).current;
    const opacity2 = useRef(new Animated.Value(0.7)).current;
    const translateY2 = useRef(new Animated.Value(0)).current;
    const scale3 = useRef(new Animated.Value(1.1)).current;
    const opacity3 = useRef(new Animated.Value(0.4)).current;

    const embers = useRef<Ember[]>(
        Array.from({ length: EMBER_COUNT }, (_, i) => ({
            progress: new Animated.Value(0),
            driftX: new Animated.Value((Math.random() - 0.5) * size * 0.35),
            tint: i % 3 === 0 ? theme.colors.yellow[400] : i % 2 === 0 ? color : '#ff6b35',
            dotSize: Math.max(2, Math.round(size * (0.1 + Math.random() * 0.08))),
        })),
    ).current;

    useEffect(() => {
        const ease = Easing.inOut(Easing.quad);
        const runningAnimations: Animated.CompositeAnimation[] = [];
        const timers: ReturnType<typeof setTimeout>[] = [];
        let stopped = false;

        const coreScaleLoop = Animated.loop(
            Animated.sequence([
                Animated.timing(scale1, {
                    toValue: 1.12,
                    duration: 960,
                    easing: ease,
                    useNativeDriver: true,
                }),
                Animated.timing(scale1, {
                    toValue: 1,
                    duration: 1200,
                    easing: ease,
                    useNativeDriver: true,
                }),
            ]),
        );

        const coreOpacityLoop = Animated.loop(
            Animated.sequence([
                Animated.timing(opacity1, {
                    toValue: 0.95,
                    duration: 600,
                    useNativeDriver: true,
                }),
                Animated.timing(opacity1, {
                    toValue: 1,
                    duration: 840,
                    useNativeDriver: true,
                }),
            ]),
        );

        const innerScaleLoop = Animated.loop(
            Animated.sequence([
                Animated.timing(scale2, {
                    toValue: 1.03,
                    duration: 640,
                    easing: ease,
                    useNativeDriver: true,
                }),
                Animated.timing(scale2, {
                    toValue: 0.9,
                    duration: 800,
                    easing: ease,
                    useNativeDriver: true,
                }),
            ]),
        );

        const innerOpacityLoop = Animated.loop(
            Animated.sequence([
                Animated.timing(opacity2, {
                    toValue: 0.86,
                    duration: 420,
                    useNativeDriver: true,
                }),
                Animated.timing(opacity2, {
                    toValue: 0.62,
                    duration: 560,
                    useNativeDriver: true,
                }),
            ]),
        );

        const innerTranslateLoop = Animated.loop(
            Animated.sequence([
                Animated.timing(translateY2, {
                    toValue: -2,
                    duration: 460,
                    useNativeDriver: true,
                }),
                Animated.timing(translateY2, {
                    toValue: 1,
                    duration: 320,
                    useNativeDriver: true,
                }),
            ]),
        );

        const outerScaleLoop = Animated.loop(
            Animated.sequence([
                Animated.timing(scale3, {
                    toValue: 1.24,
                    duration: 1600,
                    easing: ease,
                    useNativeDriver: true,
                }),
                Animated.timing(scale3, {
                    toValue: 1.1,
                    duration: 2000,
                    easing: ease,
                    useNativeDriver: true,
                }),
            ]),
        );

        const outerOpacityLoop = Animated.loop(
            Animated.sequence([
                Animated.timing(opacity3, {
                    toValue: 0.66,
                    duration: 1000,
                    useNativeDriver: true,
                }),
                Animated.timing(opacity3, {
                    toValue: 0.4,
                    duration: 1400,
                    useNativeDriver: true,
                }),
            ]),
        );

        const runEmber = (ember: Ember) => {
            if (stopped) return;

            ember.progress.setValue(0);
            ember.driftX.setValue((Math.random() - 0.5) * size * 0.35);

            const driftTarget = (Math.random() - 0.5) * size * 0.85;
            const duration = 850 + Math.random() * 650;

            const emberAnim = Animated.parallel([
                Animated.timing(ember.progress, {
                    toValue: 1,
                    duration,
                    easing: Easing.out(Easing.cubic),
                    useNativeDriver: true,
                }),
                Animated.timing(ember.driftX, {
                    toValue: driftTarget,
                    duration,
                    easing: Easing.inOut(Easing.quad),
                    useNativeDriver: true,
                }),
            ]);

            runningAnimations.push(emberAnim);
            emberAnim.start(({ finished }) => {
                if (!finished || stopped) return;
                const wait = 120 + Math.random() * 460;
                const timer = setTimeout(() => runEmber(ember), wait);
                timers.push(timer);
            });
        };

        coreScaleLoop.start();
        coreOpacityLoop.start();
        innerScaleLoop.start();
        innerOpacityLoop.start();
        innerTranslateLoop.start();
        outerScaleLoop.start();
        outerOpacityLoop.start();

        embers.forEach((ember, index) => {
            const timer = setTimeout(() => runEmber(ember), index * 120);
            timers.push(timer);
        });

        return () => {
            stopped = true;
            coreScaleLoop.stop();
            coreOpacityLoop.stop();
            innerScaleLoop.stop();
            innerOpacityLoop.stop();
            innerTranslateLoop.stop();
            outerScaleLoop.stop();
            outerOpacityLoop.stop();
            runningAnimations.forEach((anim) => anim.stop());
            timers.forEach((timer) => clearTimeout(timer));
        };
    }, [color, embers, opacity1, opacity2, opacity3, scale1, scale2, scale3, size, translateY2]);

    return (
        <View style={[styles.container, { width: size * 1.8, height: size * 1.8 }]}>
            <Animated.View
                style={[
                    styles.glow,
                    {
                        width: size * 1.5,
                        height: size * 1.5,
                        borderRadius: size,
                        backgroundColor: 'rgba(239, 68, 68, 0.18)',
                        transform: [{ scale: scale3 }],
                        opacity: opacity3,
                    },
                ]}
            />

            {embers.map((ember, index) => {
                const translateY = ember.progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [size * 0.2, -size * 1.05],
                });

                const opacity = ember.progress.interpolate({
                    inputRange: [0, 0.2, 1],
                    outputRange: [0, 0.95, 0],
                });

                const scale = ember.progress.interpolate({
                    inputRange: [0, 0.4, 1],
                    outputRange: [0.4, 1.1, 0.7],
                });

                return (
                    <Animated.View
                        key={index}
                        style={[
                            styles.ember,
                            {
                                width: ember.dotSize,
                                height: ember.dotSize,
                                borderRadius: ember.dotSize,
                                backgroundColor: ember.tint,
                                opacity,
                                transform: [{ translateX: ember.driftX }, { translateY }, { scale }],
                            },
                        ]}
                    />
                );
            })}

            <Animated.View
                style={[
                    StyleSheet.absoluteFill,
                    styles.center,
                    { transform: [{ scale: scale2 }, { translateY: translateY2 }], opacity: opacity2 },
                ]}
            >
                <Flame size={size * 1.18} color={color} fill={color} />
            </Animated.View>

            <Animated.View
                style={[
                    StyleSheet.absoluteFill,
                    styles.center,
                    { transform: [{ scale: scale1 }], opacity: opacity1 },
                ]}
            >
                <Flame size={size} color={theme.colors.yellow[400]} fill={theme.colors.yellow[400]} />
            </Animated.View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'visible',
    },
    center: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    glow: {
        position: 'absolute',
    },
    ember: {
        position: 'absolute',
        bottom: 0,
    },
});
