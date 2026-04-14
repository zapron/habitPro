import { Text } from "./AppText";
import { useEffect, useRef } from "react";
import { Animated, Easing, Platform, StyleSheet, View } from "react-native";
import { Trophy } from "lucide-react-native";
import { useReducedMotion } from "../hooks/useReducedMotion";
import type { AppTheme } from "../styles/theme";

/** Rich streak-board headline — copy matches `challenge/[id]` cohort logic. */
export type CohortMastheadModel =
  | { kind: "sync_prompt" }
  | { kind: "most_days"; leaderName: string; daysChecked: number }
  | { kind: "tie"; leadersCount: number; streakDays: number }
  | { kind: "leader"; leaderName: string; streakDays: number };

type Props = {
  theme: AppTheme;
  model: CohortMastheadModel;
  isDark?: boolean;
};

export function CohortMasthead({ theme, model, isDark = false }: Props) {
  const reduceMotion = useReducedMotion();
  const entranceScale = useRef(new Animated.Value(1)).current;
  const entranceY = useRef(new Animated.Value(0)).current;
  const trophyRock = useRef(new Animated.Value(0)).current;
  const haloOpacity = useRef(new Animated.Value(0.22)).current;

  const textProps = Platform.OS === "android" ? { includeFontPadding: false as const } : {};

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
  }, [model, reduceMotion, entranceScale, entranceY]);

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
          toValue: 0.32,
          duration: 2200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(haloOpacity, {
          toValue: 0.18,
          duration: 2200,
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
    outputRange: ["-8deg", "8deg"],
  });

  const iconBg = isDark ? "rgba(251, 191, 36, 0.1)" : "rgba(251, 191, 36, 0.16)";
  const iconBorder = isDark ? "rgba(251, 191, 36, 0.28)" : "rgba(217, 119, 6, 0.38)";

  const base = theme.colors.textSecondary;
  const nameColor = theme.colors.textPrimary;
  const streakAccent = theme.colors.cyan[400];

  const body = (() => {
    switch (model.kind) {
      case "sync_prompt":
        return (
          <Text style={[styles.body, { color: base }]} numberOfLines={4} {...textProps}>
            Squad loading… complete a day to appear on the streak board.
          </Text>
        );
      case "most_days":
        return (
          <Text style={[styles.body, { color: base }]} numberOfLines={4} {...textProps}>
            <Text style={{ color: nameColor, fontWeight: "700" }}>{model.leaderName}</Text>
            <Text>
              {" "}
              has checked the most days ({model.daysChecked}). Build the next streak!
            </Text>
          </Text>
        );
      case "tie":
        return (
          <Text style={[styles.body, { color: base }]} numberOfLines={4} {...textProps}>
            <Text style={{ color: nameColor, fontWeight: "700" }}>{model.leadersCount}</Text>
            <Text> tied with a </Text>
            <Text style={{ color: streakAccent, fontWeight: "800" }}>{model.streakDays}-day streak</Text>
            <Text> — who pulls ahead?</Text>
          </Text>
        );
      case "leader":
        return (
          <Text style={[styles.body, { color: base }]} numberOfLines={4} {...textProps}>
            <Text style={{ color: nameColor, fontWeight: "700" }}>{model.leaderName}</Text>
            <Text> is leading on a </Text>
            <Text style={{ color: streakAccent, fontWeight: "800" }}>{model.streakDays}-day streak</Text>
            <Text>.</Text>
          </Text>
        );
    }
  })();

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
                  opacity: reduceMotion ? 0.22 : haloOpacity,
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
                <Trophy size={20} color={theme.colors.amber[500]} strokeWidth={2.1} />
              </Animated.View>
              {body}
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
    paddingVertical: 12,
    paddingHorizontal: 18,
    overflow: "hidden",
    position: "relative",
  },
  halo: {
    ...StyleSheet.absoluteFillObject,
    margin: -1,
    borderRadius: 19,
    borderWidth: 1,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    zIndex: 1,
  },
  iconBadge: {
    width: 44,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  body: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "600",
  },
});
