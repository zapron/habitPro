import React, { memo } from "react";
import { Text } from "../AppText";
import {
  View,
  StyleSheet,
  useWindowDimensions,
} from "react-native";
import Svg, { Rect } from "react-native-svg";
import type { AppTheme } from "../../styles/theme";
import type { DayCheckInPoint } from "../../utils/profileStats";
import { BarChart3 } from "lucide-react-native";

const CHART_HEIGHT = 112;
const CHART_PAD = 6;
/** Screen horizontal padding + card padding + inset — keeps bars inside rounded card. */
const CHART_SIDE_RESERVE = 96;

type Props = {
  theme: AppTheme;
  isDark: boolean;
  points: DayCheckInPoint[];
  accessibilityLabel: string;
};

export const ProfileActivityChart = memo(function ProfileActivityChart({ theme, isDark, points, accessibilityLabel }: Props) {
  const { width: winW } = useWindowDimensions();
  const chartWidth = Math.max(200, Math.min(320, winW - CHART_SIDE_RESERVE));
  const maxCount = Math.max(1, ...points.map((p) => p.count));
  const hasAny = points.some((p) => p.count > 0);
  const barColor = theme.colors.indigo[500];
  const mutedBar = isDark ? "rgba(255,255,255,0.12)" : "rgba(15,23,42,0.1)";
  const n = points.length;
  const gap = 6;
  const barW = (chartWidth - gap * (n - 1) - CHART_PAD * 2) / n;

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
      accessible
      accessibilityLabel={accessibilityLabel}
    >
      <View style={styles.headRow}>
        <BarChart3 size={18} color={theme.colors.indigo[400]} />
        <Text style={[styles.title, { color: theme.colors.textPrimary }]}>Habit activity</Text>
      </View>
      <Text style={[styles.sub, { color: theme.colors.textSecondary }]}>Check-ins per day (last 7 days)</Text>

      {!hasAny ? (
        <View style={styles.emptyWrap}>
          <Svg width={chartWidth} height={CHART_HEIGHT}>
            {points.map((_, i) => {
              const x = CHART_PAD + i * (barW + gap);
              return <Rect key={i} x={x} y={CHART_HEIGHT - 28} width={barW} height={28} rx={6} fill={mutedBar} />;
            })}
          </Svg>
          <Text style={[styles.emptyText, { color: theme.colors.textMuted }]}>
            Log habits from Home to see your week.
          </Text>
        </View>
      ) : (
        <Svg width={chartWidth} height={CHART_HEIGHT}>
          {points.map((p, i) => {
            const h = maxCount > 0 ? (p.count / maxCount) * (CHART_HEIGHT - 36) : 0;
            const y = CHART_HEIGHT - h - 28;
            const x = CHART_PAD + i * (barW + gap);
            return (
              <Rect
                key={p.dateKey}
                x={x}
                y={y}
                width={barW}
                height={Math.max(h, 4)}
                rx={6}
                fill={p.count > 0 ? barColor : mutedBar}
              />
            );
          })}
        </Svg>
      )}

      <View style={styles.labelsRow}>
        {points.map((p) => (
          <Text key={p.dateKey} style={[styles.axisLbl, { color: theme.colors.textMuted }]}>
            {p.shortLabel}
          </Text>
        ))}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    borderWidth: 1,
    paddingVertical: 16,
    paddingHorizontal: 20,
    marginBottom: 14,
  },
  headRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  title: { fontSize: 16, fontWeight: "800" },
  sub: { fontSize: 12, marginBottom: 12 },
  emptyWrap: { alignItems: "center" },
  emptyText: { fontSize: 12, textAlign: "center", marginTop: 8, lineHeight: 18 },
  labelsRow: {
    flexDirection: "row",
    marginTop: 8,
    paddingHorizontal: CHART_PAD,
    gap: 6,
  },
  axisLbl: {
    flex: 1,
    fontSize: 10,
    fontWeight: "700",
    textAlign: "center",
  },
});
