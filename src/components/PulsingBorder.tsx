import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, Easing } from 'react-native';
import { useTheme } from '../context/ThemeContext';

interface PulsingBorderProps {
    children: React.ReactNode;
    active: boolean;
    color?: string;
}

export function PulsingBorder({ children, active, color }: PulsingBorderProps) {
    const { theme } = useTheme();
    const borderColor = color ?? theme.colors.cyan[400];
    const pulse = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        if (!active) {
            pulse.setValue(1);
            return;
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
        loop.start();
        return () => loop.stop();
    }, [active, pulse]);

    const opacity = pulse.interpolate({
        inputRange: [1, 1.08],
        outputRange: [0.5, 1],
    });

    if (!active) return <View>{children}</View>;

    return (
        <View>
            <Animated.View
                style={[
                    styles.halo,
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
        ...StyleSheet.absoluteFillObject,
        borderRadius: 14,
        borderWidth: 2,
        zIndex: 1,
    },
});
