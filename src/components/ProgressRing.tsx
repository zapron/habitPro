import React, { useEffect, useId, useRef } from "react";
import { Animated, View, StyleSheet, Easing } from "react-native";
import Svg, { Circle, Defs, G, LinearGradient, Stop } from "react-native-svg";
import { useTheme } from "../context/ThemeContext";

interface ProgressRingProps {
  progress: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  /** Second gradient stop. Only used when `color` is not provided. Defaults to the brand cyan. */
  gradientEndColor?: string;
  glowOnNearComplete?: boolean;
  children?: React.ReactNode;
}

/**
 * Circular progress using SVG strokeDashoffset (accurate on all platforms).
 * The previous half-border + rotate approach relied on transformOrigin, which
 * React Native does not apply reliably, so small progress values looked identical.
 */
export function ProgressRing({
  progress,
  size = 52,
  strokeWidth = 3,
  color,
  gradientEndColor,
  glowOnNearComplete = true,
  children,
}: ProgressRingProps) {
  const { theme } = useTheme();
  const gradientId = useId();
  const glowPulse = useRef(new Animated.Value(0)).current;

  const clamped = Math.min(1, Math.max(0, progress));
  const isNearComplete = clamped >= 0.8;
  const isComplete = clamped >= 1;
  const useSolidColor = Boolean(color) || isComplete;
  const solidColor = isComplete ? theme.colors.green[500] : color;
  const gradientStart = color ?? theme.colors.indigo[500];
  const gradientEnd = gradientEndColor ?? theme.colors.cyan[400];
  const bgColor = theme.colors.slate[700];

  const cx = size / 2;
  const cy = size / 2;
  // Leave a 1px buffer so the stroke's outer edge never sits exactly on the
  // SVG canvas boundary — at zero margin it gets hard-clipped on some
  // platforms/pixel ratios, showing up as a truncated ring edge.
  const r = (size - strokeWidth) / 2 - 1;
  const circumference = 2 * Math.PI * r;
  const dashOffset = circumference * (1 - clamped);

  useEffect(() => {
    if (isNearComplete && glowOnNearComplete && !isComplete) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(glowPulse, {
            toValue: 1,
            duration: 1200,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(glowPulse, {
            toValue: 0,
            duration: 1200,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      );
      loop.start();
      return () => loop.stop();
    }
    glowPulse.setValue(0);
    return undefined;
  }, [isNearComplete, isComplete, glowOnNearComplete, glowPulse]);

  const shadowOpacity = glowPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.8],
  });
  const glowColor = isComplete ? theme.colors.green[500] : gradientStart;

  return (
    <View style={[styles.container, { width: size, height: size, borderRadius: size / 2 }]}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        {!useSolidColor ? (
          <Defs>
            <LinearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
              <Stop offset="0%" stopColor={gradientStart} />
              <Stop offset="100%" stopColor={gradientEnd} />
            </LinearGradient>
          </Defs>
        ) : null}
        <G transform={`rotate(-90 ${cx} ${cy})`}>
          <Circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={bgColor}
            strokeWidth={strokeWidth}
          />
          <Circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={useSolidColor ? solidColor : `url(#${gradientId})`}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
          />
        </G>
      </Svg>

      {isNearComplete && glowOnNearComplete && !isComplete && (
        <Animated.View
          style={[
            styles.glow,
            {
              width: size + 8,
              height: size + 8,
              borderRadius: (size + 8) / 2,
              borderWidth: 2,
              borderColor: glowColor,
              opacity: shadowOpacity,
            },
          ]}
          pointerEvents="none"
        />
      )}

      <View
        style={[
          styles.center,
          {
            width: size - strokeWidth * 2 - 4,
            height: size - strokeWidth * 2 - 4,
            borderRadius: (size - strokeWidth * 2 - 4) / 2,
            backgroundColor: theme.colors.surfaceElevated,
          },
        ]}
      >
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { position: "relative", alignItems: "center", justifyContent: "center" },
  glow: { position: "absolute" },
  center: { alignItems: "center", justifyContent: "center" },
});
