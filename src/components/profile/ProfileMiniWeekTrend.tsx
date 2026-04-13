import { Text } from "../AppText";
import {
  View,
  StyleSheet,
  useWindowDimensions,
} from "react-native";
import Svg, { Rect } from "react-native-svg";
import type { AppTheme } from "../../styles/theme";
import type { MiniWeekBucket } from "../../utils/profileStats";
import { Flame } from "lucide-react-native";

const CHART_HEIGHT = 96;
/** Screen horizontal padding (theme.spacing.lg×2) + card padding + small inset so SVG never clips card edges. */
const CHART_SIDE_RESERVE = 96;

type Props = {
  theme: AppTheme;
  isDark: boolean;
  buckets: MiniWeekBucket[];
  accessibilityLabel: string;
};

export function ProfileMiniWeekTrend({ theme, isDark, buckets, accessibilityLabel }: Props) {
  const { width: winW } = useWindowDimensions();
  const chartWidth = Math.max(200, Math.min(320, winW - CHART_SIDE_RESERVE));
  const maxCount = Math.max(1, ...buckets.map((b) => b.count));
  const hasAny = buckets.some((b) => b.count > 0);
  const barColor = theme.colors.amber[500];
  const mutedBar = isDark ? "rgba(255,255,255,0.12)" : "rgba(15,23,42,0.1)";
  const n = buckets.length;
  const gap = 8;
  const pad = 4;
  const barW = (chartWidth - gap * (n - 1) - pad * 2) / n;

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
        <Flame size={18} color={theme.colors.amber[500]} />
        <Text style={[styles.title, { color: theme.colors.textPrimary }]}>Mini missions</Text>
      </View>
      <Text style={[styles.sub, { color: theme.colors.textSecondary }]}>Completed per week (last 4 weeks)</Text>

      {!hasAny ? (
        <View style={styles.emptyWrap}>
          <Svg width={chartWidth} height={CHART_HEIGHT}>
            {buckets.map((b, i) => {
              const x = pad + i * (barW + gap);
              return <Rect key={b.weekStartKey} x={x} y={CHART_HEIGHT - 24} width={barW} height={24} rx={6} fill={mutedBar} />;
            })}
          </Svg>
          <Text style={[styles.emptyText, { color: theme.colors.textMuted }]}>
            Complete mini missions to see your trend.
          </Text>
        </View>
      ) : (
        <Svg width={chartWidth} height={CHART_HEIGHT}>
          {buckets.map((b, i) => {
            const h = maxCount > 0 ? (b.count / maxCount) * (CHART_HEIGHT - 32) : 0;
            const y = CHART_HEIGHT - h - 28;
            const x = pad + i * (barW + gap);
            return (
              <Rect
                key={b.weekStartKey}
                x={x}
                y={y}
                width={barW}
                height={Math.max(h, 4)}
                rx={6}
                fill={b.count > 0 ? barColor : mutedBar}
              />
            );
          })}
        </Svg>
      )}

      <View style={styles.labelsRow}>
        {buckets.map((b) => (
          <Text key={b.weekStartKey} style={[styles.axisLbl, { color: theme.colors.textMuted }]}>
            {b.label}
          </Text>
        ))}
      </View>
    </View>
  );
}

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
    paddingHorizontal: 8,
    gap: 8,
  },
  axisLbl: {
    flex: 1,
    fontSize: 10,
    fontWeight: "700",
    textAlign: "center",
  },
});
