import { Text } from "./AppText";
import { memo } from "react";
import { StyleSheet, View } from "react-native";
import { Flame } from "lucide-react-native";
import { useTheme } from "../context/ThemeContext";

type Props = {
  streak: number;
  isDark: boolean;
};

/** Dulled on dark surfaces (a saturated red would glow), brighter on light ones where it needs to hold its own against white. */
const FIRE_COLOR_DARK = "#B4555C";
const FIRE_COLOR_LIGHT = "#DC2626";

export const CohortStreakPill = memo(function CohortStreakPill({ streak, isDark }: Props) {
  const { theme } = useTheme();
  const fireColor = isDark ? FIRE_COLOR_DARK : FIRE_COLOR_LIGHT;

  return (
    <View style={styles.pill}>
      <Flame size={14} color={fireColor} fill={fireColor} strokeWidth={2.2} />
      <Text style={[styles.label, { color: theme.colors.textSecondary }]}>{streak}d</Text>
    </View>
  );
});

CohortStreakPill.displayName = "CohortStreakPill";

const styles = StyleSheet.create({
  pill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 0,
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 9999,
  },
  label: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.15,
  },
});
