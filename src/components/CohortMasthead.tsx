import { Text } from "./AppText";
import { Animated, Easing, Platform, StyleSheet, View } from "react-native";
import { Sun } from "lucide-react-native";
import { useEffect, useMemo, useRef } from "react";
import type { AppTheme } from "../styles/theme";

/** Rich streak-board headline. Copy matches `challenge/[id]` cohort logic. */
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

/** Trophy + narrative row (no outer card). Composed by CohortLeaderHero. */
export function CohortMastheadTrophyNarrative({ theme, model, isDark = false }: Props) {
  const textProps = Platform.OS === "android" ? { includeFontPadding: false as const } : {};

  const base = theme.colors.textSecondary;
  const nameColor = theme.colors.textPrimary;
  const streakAccent = theme.colors.indigo[400];

  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1100, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1100, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ]),
      { resetBeforeIteration: false },
    );
    loop.start();
    return () => {
      loop.stop();
    };
  }, [pulse]);

  const sunGlowStyle = useMemo(() => {
    const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.16, 0.34] });
    const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] });
    return { opacity, transform: [{ scale }] } as const;
  }, [pulse]);

  const sunPulseStyle = useMemo(() => {
    const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] });
    return { transform: [{ scale }] } as const;
  }, [pulse]);

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
            <Text>, who pulls ahead?</Text>
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
    <View style={styles.row}>
      <View style={styles.iconBadge}>
        <Animated.View
          style={[
            styles.sunGlow,
            { backgroundColor: isDark ? "rgba(251, 191, 36, 0.65)" : "rgba(251, 191, 36, 0.55)" },
            sunGlowStyle,
          ]}
        />
        <Animated.View style={sunPulseStyle}>
          <Sun size={22} color={theme.colors.amber[500]} strokeWidth={2.1} />
        </Animated.View>
      </View>

      <View style={styles.textColumn}>
        {body}
      </View>
    </View>
  );
}

export function CohortMasthead({ theme, model, isDark = false }: Props) {
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
      <View style={styles.inner}>
        <CohortMastheadTrophyNarrative theme={theme} model={model} isDark={isDark} />
      </View>
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
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  textColumn: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },
  iconBadge: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  sunGlow: {
    position: "absolute",
    width: 22,
    height: 22,
    borderRadius: 9999,
  },
  body: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "600",
  },
});
