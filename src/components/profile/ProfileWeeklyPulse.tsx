import React, { memo } from "react";
import { Text } from "../AppText";
import {
  View,
  StyleSheet,
} from "react-native";
import type { AppTheme } from "../../styles/theme";
import { weeklyTierProgressFraction } from "../../utils/profileStats";
import { Flame } from "lucide-react-native";
import { withAlpha } from "../../styles/theme";

type Props = {
  theme: AppTheme;
  isDark: boolean;
  weeklyScore: number;
  tierLabel: string;
  tierDetail: string;
  habitCheckInsThisWeek: number;
  miniCompletionsThisWeek: number;
};

export const ProfileWeeklyPulse = memo(function ProfileWeeklyPulse({
  theme,
  isDark,
  weeklyScore,
  tierLabel,
  tierDetail,
  habitCheckInsThisWeek,
  miniCompletionsThisWeek,
}: Props) {
  const { fraction, nextTierName } = weeklyTierProgressFraction(weeklyScore);
  const track = isDark ? withAlpha(theme.colors.sheen, 8) : withAlpha(theme.colors.sheen, 8);
  const fill = theme.colors.indigo[500];

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          ...theme.shadow.card,
        },
      ]}
    >
      <View style={styles.headRow}>
        <View style={styles.headLeft}>
          <Flame size={20} color={theme.colors.amber[500]} />
          <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary }]}>This week</Text>
        </View>
        <Text style={[styles.scorePill, { color: theme.colors.indigo[400], backgroundColor: isDark ? withAlpha(theme.colors.indigo[500], 15) : withAlpha(theme.colors.indigo[600], 10) }]}>
          {weeklyScore} pts
        </Text>
      </View>

      <View style={styles.tierBlock}>
        <Text style={[styles.tierName, { color: theme.colors.textPrimary }]}>{tierLabel}</Text>
        <Text style={[styles.tierDetail, { color: theme.colors.textSecondary }]}>{tierDetail}</Text>
      </View>

      <View style={[styles.meterTrack, { backgroundColor: track }]}>
        <View style={[styles.meterFill, { width: `${Math.round(fraction * 100)}%`, backgroundColor: fill }]} />
      </View>
      <Text style={[styles.nextHint, { color: theme.colors.textMuted }]}>
        {weeklyScore >= 120 ? "Top tier. Stay consistent." : `Next: ${nextTierName}`}
      </Text>

      <View style={[styles.statsRow, { borderTopColor: theme.colors.border }]}>
        <View style={styles.statCell}>
          <Text style={[styles.statNum, { color: theme.colors.cyan[400] }]}>{habitCheckInsThisWeek}</Text>
          <Text style={[styles.statLbl, { color: theme.colors.textMuted }]}>Check-ins</Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: theme.colors.border }]} />
        <View style={styles.statCell}>
          <Text style={[styles.statNum, { color: theme.colors.amber[500] }]}>{miniCompletionsThisWeek}</Text>
          <Text style={[styles.statLbl, { color: theme.colors.textMuted }]}>Minis done</Text>
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    marginBottom: 14,
  },
  headRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  headLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  sectionTitle: { fontSize: 16, fontWeight: "800" },
  scorePill: {
    fontSize: 12,
    fontWeight: "800",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: "hidden",
  },
  tierBlock: { marginBottom: 12 },
  tierName: { fontSize: 26, fontWeight: "900", letterSpacing: -0.5 },
  tierDetail: { fontSize: 14, marginTop: 4, lineHeight: 20 },
  meterTrack: {
    height: 8,
    borderRadius: 999,
    overflow: "hidden",
  },
  meterFill: {
    height: "100%",
    borderRadius: 999,
  },
  nextHint: { fontSize: 11, fontWeight: "600", marginTop: 8, marginBottom: 4 },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  statCell: { flex: 1, alignItems: "center" },
  statDivider: { width: StyleSheet.hairlineWidth, alignSelf: "stretch", opacity: 0.6 },
  statNum: { fontSize: 22, fontWeight: "900", fontVariant: ["tabular-nums"] },
  statLbl: { fontSize: 11, fontWeight: "700", marginTop: 4, letterSpacing: 0.3 },
});
