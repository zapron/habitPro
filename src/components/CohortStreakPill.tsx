import { Text } from "./AppText";
import { memo } from "react";
import { StyleSheet, View } from "react-native";
import { useTheme } from "../context/ThemeContext";

const HOT_STREAK_MIN = 3;

type Props = {
  streak: number;
  isDark: boolean;
};

/**
 * Cohort participant streak: subtle cyan pill; streak ≥ 3 adds warm text +
 * static glow (same pill shell).
 */
export const CohortStreakPill = memo(function CohortStreakPill({ streak, isDark }: Props) {
  const { theme } = useTheme();

  const hot = streak >= HOT_STREAK_MIN;
  const cyan = theme.colors.cyan[400];
  const pillChrome = {
    borderColor: `${cyan}44`,
    backgroundColor: `${cyan}14`,
  };

  if (!hot) {
    return (
      <View style={[styles.pill, pillChrome]}>
        <Text style={[styles.label, { color: cyan }]}>{streak} day streak</Text>
      </View>
    );
  }

  const textColor = isDark ? "#fde68a" : "#ea580c";
  const glowColor = isDark ? "rgba(251, 191, 36, 0.72)" : "rgba(234, 88, 12, 0.38)";

  return (
    <View style={[styles.pill, pillChrome]}>
      <Text
        style={[
          styles.label,
          styles.hotLabel,
          {
            color: textColor,
            textShadowColor: glowColor,
          },
        ]}
      >
        {streak} day streak
      </Text>
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
  label: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.15,
  },
  hotLabel: {
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 7,
  },
});
