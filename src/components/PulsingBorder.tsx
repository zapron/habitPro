import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, Easing } from 'react-native';
import { useTheme } from '../context/ThemeContext';

interface PulsingBorderProps {
    children: React.ReactNode;
    active: boolean;
    color?: string;
    /**
     * Explicit square diameter for compact circular badges (e.g. a tab-bar
     * unread dot). Gives the wrapper a fixed footprint so it doesn't collapse
     * when `children` is itself absolutely positioned, and makes the halo a
     * true circle instead of the card-radius default. Omit for the original
     * "wrap a bordered card" usage.
     */
    size?: number;
    /** Corner radius used when `size` is omitted (card mode). */
    radius?: number;
}

export function PulsingBorder({ children, active, color, size, radius = 14 }: PulsingBorderProps) {
    const { theme } = useTheme();
    const borderColor = color ?? theme.colors.cyan[400];
    const pulse = useRef(new Animated.Value(1)).current;
    const fixedSizeStyle = size ? { width: size, height: size } : undefined;

    const loopRef = useRef<Animated.CompositeAnimation | null>(null);
    useEffect(() => {
        if (!active) {
            pulse.setValue(1);
            if (loopRef.current) {
                loopRef.current.stop();
                loopRef.current = null;
            }
            return;
        }

        if (loopRef.current) {
            loopRef.current.stop();
        }
        const loop = Animated.loop(
            Animated.sequence([
                Animated.timing(pulse, {
                    toValue: 1.08,
                    duration: 1200,
                    easing: Easing.inOut(Easing.ease),
                    useNativeDriver: true,
                }),
                Animated.timing(pulse, {
                    toValue: 1,
                    duration: 1200,
                    easing: Easing.inOut(Easing.ease),
                    useNativeDriver: true,
                }),
            ]),
        );
        loopRef.current = loop;
        loop.start();
        return () => {
            if (loopRef.current) {
                loopRef.current.stop();
                loopRef.current = null;
            }
        };
    }, [active, pulse]);

    const opacity = pulse.interpolate({
        inputRange: [1, 1.08],
        outputRange: [0.5, 1],
    });

    if (!active) return <View style={fixedSizeStyle}>{children}</View>;

    const haloShape = size
        ? { width: size, height: size, borderRadius: size / 2 }
        : { ...StyleSheet.absoluteFillObject, borderRadius: radius };

    return (
        <View style={fixedSizeStyle}>
            <Animated.View
                style={[
                    styles.halo,
                    haloShape,
                    {
                        borderColor,
                        transform: [{ scale: pulse }],
                        opacity,
                    },
                ]}
                pointerEvents="none"
            />
            {children}
        </View>
    );
}

const styles = StyleSheet.create({
    halo: {
        position: "absolute",
        borderWidth: 2,
        zIndex: 1,
    },
});
