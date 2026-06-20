import { Text } from "./AppText";
import { memo } from "react";
import { StyleSheet, View } from "react-native";
import { useTheme } from "../context/ThemeContext";

const HOT_STREAK_MIN = 3;

type Props = {
  streak: number;
  isDark: boolean;
};

export const CohortStreakPill = memo(function CohortStreakPill({ streak, isDark }: Props) {
  const { theme } = useTheme();
  const hot = streak >= HOT_STREAK_MIN;
  const cyan = theme.colors.cyan[400];

  const chrome = hot
    ? {
        borderColor: isDark ? "rgba(251, 191, 36, 0.42)" : "rgba(249, 115, 22, 0.26)",
        backgroundColor: isDark ? "rgba(251, 191, 36, 0.09)" : "rgba(255, 247, 237, 0.88)",
      }
    : {
        borderColor: `${cyan}44`,
        backgroundColor: `${cyan}14`,
      };
  const textColor = hot ? (isDark ? "#fde68a" : "#ea580c") : cyan;

  return (
    <View style={[styles.pill, chrome]}>
      <Text style={[styles.label, { color: textColor }]}>{streak} day streak</Text>
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
  },
  label: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.15,
  },
});
