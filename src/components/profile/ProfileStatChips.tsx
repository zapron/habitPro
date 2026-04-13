import { Text } from "../AppText";
import {
  View,
  StyleSheet,
} from "react-native";
import type { AppTheme } from "../../styles/theme";
import { TrendingUp, Layers, Hash } from "lucide-react-native";

type Props = {
  theme: AppTheme;
  isDark: boolean;
  maxStreak: number;
  activeHabits: number;
  lifetimeCheckIns: number;
};

export function ProfileStatChips({ theme, isDark, maxStreak, activeHabits, lifetimeCheckIns }: Props) {
  const chipBg = isDark ? "rgba(255,255,255,0.05)" : "rgba(15,23,42,0.04)";
  const border = theme.colors.border;

  const items = [
    {
      Icon: TrendingUp,
      value: maxStreak,
      label: "Best streak",
      color: theme.colors.green[500],
    },
    {
      Icon: Layers,
      value: activeHabits,
      label: "Active habits",
      color: theme.colors.cyan[400],
    },
    {
      Icon: Hash,
      value: lifetimeCheckIns,
      label: "Total check-ins",
      color: theme.colors.indigo[400],
    },
  ] as const;

  return (
    <View style={styles.row}>
      {items.map(({ Icon, value, label, color }) => (
        <View
          key={label}
          style={[styles.chip, { backgroundColor: chipBg, borderColor: border }]}
          accessible
          accessibilityLabel={`${label}: ${value}`}
        >
          <Icon size={16} color={color} />
          <Text style={[styles.val, { color: theme.colors.textPrimary }]}>{value}</Text>
          <Text style={[styles.lbl, { color: theme.colors.textMuted }]} numberOfLines={2}>
            {label}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 18,
  },
  chip: {
    flex: 1,
    minWidth: 0,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: "center",
    gap: 6,
  },
  val: { fontSize: 20, fontWeight: "900", fontVariant: ["tabular-nums"] },
  lbl: { fontSize: 10, fontWeight: "700", textAlign: "center", letterSpacing: 0.2 },
});
