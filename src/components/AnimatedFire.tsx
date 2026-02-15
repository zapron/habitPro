import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Easing } from 'react-native';
import { Flame } from 'lucide-react-native';
import { theme } from '../styles/theme';

interface AnimatedFireProps {
    size?: number;
    color?: string;
}

export function AnimatedFire({ size = 24, color = theme.colors.amber[500] }: AnimatedFireProps) {
    const scale1 = useRef(new Animated.Value(1)).current;
    const opacity1 = useRef(new Animated.Value(0.9)).current;
    const scale2 = useRef(new Animated.Value(0.9)).current;
    const opacity2 = useRef(new Animated.Value(0.7)).current;
    const translateY2 = useRef(new Animated.Value(0)).current;
    const scale3 = useRef(new Animated.Value(1.1)).current;
    const opacity3 = useRef(new Animated.Value(0.4)).current;

    useEffect(() => {
        const ease = Easing.inOut(Easing.quad);

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
                    toValue: 1.02,
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
                    toValue: 0.85,
                    duration: 400,
                    useNativeDriver: true,
                }),
                Animated.timing(opacity2, {
                    toValue: 0.6,
                    duration: 560,
                    useNativeDriver: true,
                }),
            ]),
        );
        const innerTranslateLoop = Animated.loop(
            Animated.sequence([
                Animated.timing(translateY2, {
                    toValue: -2,
                    duration: 480,
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
                    toValue: 1.22,
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
                    toValue: 0.65,
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

        coreScaleLoop.start();
        coreOpacityLoop.start();
        innerScaleLoop.start();
        innerOpacityLoop.start();
        innerTranslateLoop.start();
        outerScaleLoop.start();
        outerOpacityLoop.start();

        return () => {
            coreScaleLoop.stop();
            coreOpacityLoop.stop();
            innerScaleLoop.stop();
            innerOpacityLoop.stop();
            innerTranslateLoop.stop();
            outerScaleLoop.stop();
            outerOpacityLoop.stop();
        };
    }, [opacity1, opacity2, opacity3, scale1, scale2, scale3, translateY2]);

    return (
        <View style={styles.container}>
            <Animated.View
                style={[
                    StyleSheet.absoluteFill,
                    styles.center,
                    { transform: [{ scale: scale3 }], opacity: opacity3 },
                ]}
            >
                <Flame size={size * 1.4} color={theme.colors.red[500]} fill={theme.colors.red[500]} />
            </Animated.View>

            <Animated.View
                style={[
                    StyleSheet.absoluteFill,
                    styles.center,
                    { transform: [{ scale: scale2 }, { translateY: translateY2 }], opacity: opacity2 },
                ]}
            >
                <Flame size={size * 1.1} color={color} fill={color} />
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
        width: 40,
        height: 40,
    },
    center: {
        alignItems: 'center',
        justifyContent: 'center',
    }
});
