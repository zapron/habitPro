import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import { Zap } from "lucide-react-native";
import { Text } from "./AppText";
import { useTheme } from "../context/ThemeContext";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { AnimatedCountText } from "./AnimatedCountText";

interface XpGainBadgeProps {
  active: boolean;
  xp: number;
  day: number;
  originX?: number;
  originY?: number;
  /**
   * Horizontal anchoring relative to `originX`. Defaults to roughly centering
   * the pill over the tapped cell, but the leftmost/rightmost grid columns
   * need to bias inward instead — a fixed center offset pushes the pill's
   * left edge into negative x (off-screen, clipped) for column 0.
   */
  align?: "left" | "center" | "right";
}

/**
 * Floating "+XP" readout anchored at the same grid-cell origin ConfettiBurst
 * uses, so the daily completion moment carries a number, not just confetti +
 * a haptic. Self-contained like ConfettiBurst: plays once per `active` flip,
 * then settles at opacity 0 rather than unmounting.
 */
export function XpGainBadge({ active, xp, day, originX = 0, originY = 0, align = "center" }: XpGainBadgeProps) {
  const { theme } = useTheme();
  const reduceMotion = useReducedMotion();
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const horizontalOffset = align === "left" ? 0 : align === "right" ? -68 : -34;

  useEffect(() => {
    if (!active || xp <= 0) return;

    if (reduceMotion) {
      opacity.setValue(1);
      translateY.setValue(-28);
      const holdTimer = setTimeout(() => opacity.setValue(0), 1400);
      return () => clearTimeout(holdTimer);
    }

    opacity.setValue(0);
    translateY.setValue(0);
    Animated.sequence([
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 180, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.spring(translateY, { toValue: -28, useNativeDriver: true, speed: 14, bounciness: 6 }),
      ]),
      Animated.delay(700),
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 420, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
        Animated.timing(translateY, { toValue: -52, duration: 420, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
      ]),
    ]).start();
  }, [active, xp, day, opacity, translateY, reduceMotion]);

  if (!active || xp <= 0) return null;

  return (
    <View style={[styles.anchor, { left: originX, top: originY }]} pointerEvents="none">
      <Animated.View
        style={[
          styles.pill,
          theme.shadow.glow,
          {
            backgroundColor: theme.colors.indigo[600],
            borderColor: theme.colors.indigo[400],
            opacity,
            transform: [{ translateY }, { translateX: horizontalOffset }],
          },
        ]}
      >
        <Zap size={12} color={theme.colors.yellow[400]} fill={theme.colors.yellow[400]} />
        <View style={styles.textRow}>
          <Text style={[styles.xpText, { color: theme.colors.white }]}>+</Text>
          <AnimatedCountText value={xp} style={[styles.xpText, { color: theme.colors.white }]} durationMs={360} />
          <Text style={[styles.xpText, { color: theme.colors.white }]}> XP · Day {day}</Text>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  anchor: {
    position: "absolute",
    zIndex: 1000,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 9999,
    borderWidth: 1,
  },
  textRow: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  xpText: {
    fontSize: 11,
    fontWeight: "800",
  },
});
