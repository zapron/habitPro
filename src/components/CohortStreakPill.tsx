import { Text } from "./AppText";
import { memo, useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import { useTheme } from "../context/ThemeContext";
import { useReducedMotion } from "../hooks/useReducedMotion";

const HOT_STREAK_MIN = 3;

type Props = {
  streak: number;
  isDark: boolean;
};

/**
 * Cohort participant streak: subtle cyan pill; streak ≥ 3 adds warm text +
 * horizontal shimmer (same pill shell).
 */
export const CohortStreakPill = memo(function CohortStreakPill({ streak, isDark }: Props) {
  const { theme } = useTheme();
  const reduceMotion = useReducedMotion();
  const shimmer = useRef(new Animated.Value(0)).current;

  const hot = streak >= HOT_STREAK_MIN;
  const cyan = theme.colors.cyan[400];
  const pillChrome = {
    borderColor: `${cyan}44`,
    backgroundColor: `${cyan}14`,
  };

  useEffect(() => {
    if (!hot || reduceMotion) return;
    const loop = Animated.loop(
      Animated.timing(shimmer, {
        toValue: 1,
        duration: 2200,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [hot, reduceMotion, shimmer]);

  const shimmerTranslate = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [-36, 120],
  });

  if (!hot) {
    return (
      <View style={[styles.pill, pillChrome]}>
        <Text style={[styles.label, { color: cyan }]}>{streak} day streak</Text>
      </View>
    );
  }

  const textColor = isDark ? "#fde68a" : "#ea580c";

  return (
    <View style={[styles.pill, pillChrome]}>
      <View style={styles.shimmerWrap}>
        <Text style={[styles.label, { color: textColor }]}>{streak} day streak</Text>
        {!reduceMotion ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.shimmerBand,
              {
                transform: [{ translateX: shimmerTranslate }],
              },
            ]}
          />
        ) : null}
      </View>
    </View>
  );
});

CohortStreakPill.displayName = "CohortStreakPill";

const styles = StyleSheet.create({
  pill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 9999,
    borderWidth: 1,
    overflow: "hidden",
  },
  shimmerWrap: {
    position: "relative",
    alignSelf: "flex-start",
    overflow: "hidden",
    paddingVertical: 1,
  },
  shimmerBand: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 22,
    left: 0,
    borderRadius: 6,
    backgroundColor: "rgba(255, 255, 255, 0.38)",
    opacity: 0.75,
  },
  label: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.15,
  },
});
