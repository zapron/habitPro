import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import { Trophy } from "lucide-react-native";
import { useReducedMotion } from "../hooks/useReducedMotion";
import type { AppTheme } from "../styles/theme";

type Props = {
  theme: AppTheme;
  /** One line, e.g. leading streak or tie message */
  message: string;
  isDark?: boolean;
};

export function CohortMasthead({ theme, message, isDark = false }: Props) {
  const reduceMotion = useReducedMotion();
  const entranceScale = useRef(new Animated.Value(1)).current;
  const entranceY = useRef(new Animated.Value(0)).current;
  const trophyRock = useRef(new Animated.Value(0)).current;
  const haloOpacity = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    if (reduceMotion) {
      entranceScale.setValue(1);
      entranceY.setValue(0);
      return;
    }
    entranceScale.setValue(0.92);
    entranceY.setValue(12);
    Animated.parallel([
      Animated.spring(entranceScale, {
        toValue: 1,
        friction: 6,
        tension: 88,
        useNativeDriver: true,
      }),
      Animated.timing(entranceY, {
        toValue: 0,
        duration: 420,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [message, reduceMotion, entranceScale, entranceY]);

  useEffect(() => {
    if (reduceMotion) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(trophyRock, {
          toValue: 1,
          duration: 2600,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(trophyRock, {
          toValue: -1,
          duration: 2600,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduceMotion, trophyRock]);

  useEffect(() => {
    if (reduceMotion) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(haloOpacity, {
          toValue: 0.85,
          duration: 1800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(haloOpacity, {
          toValue: 0.32,
          duration: 1800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduceMotion, haloOpacity]);

  const trophyRotate = trophyRock.interpolate({
    inputRange: [-1, 1],
    outputRange: ["-10deg", "10deg"],
  });

  const iconBg = isDark ? "rgba(251, 191, 36, 0.14)" : "rgba(251, 191, 36, 0.2)";
  const iconBorder = isDark ? "rgba(251, 191, 36, 0.35)" : "rgba(217, 119, 6, 0.45)";

  return (
    <View
      style={[
        styles.wrap,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          ...theme.shadow.card,
        },
      ]}
    >
      <Animated.View style={{ transform: [{ translateY: entranceY }] }}>
        <Animated.View style={{ transform: [{ scale: entranceScale }] }}>
          <View style={styles.inner}>
            <Animated.View
              pointerEvents="none"
              style={[
                styles.halo,
                {
                  borderColor: theme.colors.indigo[400],
                  opacity: reduceMotion ? 0.5 : haloOpacity,
                },
              ]}
            />
            <View style={styles.row}>
              <Animated.View
                style={[
                  styles.iconBadge,
                  {
                    backgroundColor: iconBg,
                    borderColor: iconBorder,
                    transform: [{ rotate: reduceMotion ? "0deg" : trophyRotate }],
                  },
                ]}
              >
                <Trophy size={26} color={theme.colors.amber[500]} strokeWidth={2.4} />
              </Animated.View>
              <Text style={[styles.text, { color: theme.colors.indigo[500] }]} numberOfLines={4}>
                {message}
              </Text>
            </View>
          </View>
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 16,
    overflow: "hidden",
  },
  inner: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    overflow: "hidden",
    position: "relative",
  },
  halo: {
    ...StyleSheet.absoluteFillObject,
    margin: -2,
    borderRadius: 20,
    borderWidth: 2,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    zIndex: 1,
  },
  iconBadge: {
    width: 52,
    height: 52,
    borderRadius: 16,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  text: {
    flex: 1,
    fontSize: 16,
    fontWeight: "900",
    lineHeight: 22,
    letterSpacing: -0.2,
  },
});
