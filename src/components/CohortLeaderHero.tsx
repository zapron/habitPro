import { Text } from "./AppText";
import { StyleSheet, View } from "react-native";
import type { AppTheme } from "../styles/theme";
import type { Habit } from "../types/habit";
import type { ProfileLabel } from "../lib/groupChallengesApi";
import { CohortMastheadTrophyNarrative, type CohortMastheadModel } from "./CohortMasthead";
import { GlassTopHighlight } from "./GlassTopHighlight";
import { withAlpha } from "../styles/theme";

function shortNameForBar(fullName: string, maxLen = 11): string {
  const t = fullName.trim();
  if (t.length <= maxLen) return t;
  const first = t.split(/\s+/)[0] ?? t;
  if (first.length <= maxLen) return first;
  return `${first.slice(0, maxLen - 1)}…`;
}

type RankedMember = { userId: string; habit: Habit; name: string };

const PROGRESS_SQUARE_COUNT = 14;
/** Muted indigo, same value already used app-wide (FAB, toggles, reminder icons) —
 * reads fine against both a near-black and a white card. */
const RANK2_SQUARE_COLOR = "#4B4BB0";

type Props = {
  theme: AppTheme;
  isDark: boolean;
  model: CohortMastheadModel;
  leaderName: string;
  leaderUserId?: string;
  leaderLabel: ProfileLabel | undefined;
  leaderHabit: Habit | undefined;
  rankedMembers: RankedMember[];
};

export function CohortLeaderHero({
  theme,
  isDark,
  model,
  leaderName,
  leaderUserId,
  leaderLabel,
  leaderHabit,
  rankedMembers,
}: Props) {
  const progressMembers =
    rankedMembers.length > 0
      ? rankedMembers.slice(0, 3)
      : leaderHabit
        ? [{ userId: "leader", habit: leaderHabit, name: leaderName }]
        : [];
  const total = Math.max(
    1,
    ...progressMembers.map((member) => member.habit.totalDays ?? 21),
  );
  const rankSquareColors = [theme.colors.amber[900], RANK2_SQUARE_COLOR, theme.colors.green[900]];

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
      <GlassTopHighlight radius={18} />
      <View style={styles.inner}>
        {model.kind !== "sync_prompt" && leaderHabit ? (
          <>
            <Text style={[styles.rankingsLabel, { color: theme.colors.textMuted }]}>Rankings</Text>

            <View style={styles.progressBlock}>
              {progressMembers.map((member, index) => {
                const done = member.habit.completedDates.length;
                const pct = Math.min(100, Math.round((done / total) * 100));
                const squareColor = rankSquareColors[index] ?? rankSquareColors[rankSquareColors.length - 1];
                return (
                  <View key={member.userId} style={styles.progressRow}>
                    <View style={styles.rankLabelRow}>
                      <View style={[styles.rankCircle, { borderColor: theme.colors.border }]}>
                        <Text style={[styles.rankCircleText, { color: theme.colors.textMuted }]}>{index + 1}</Text>
                      </View>
                      <Text style={[styles.progressLabel, { color: theme.colors.textMuted }]} numberOfLines={1}>
                        {shortNameForBar(member.name)}
                      </Text>
                    </View>
                    <View style={styles.squareGrid}>
                      {Array.from({ length: PROGRESS_SQUARE_COUNT }, (_, i) => {
                        const filled = i < Math.round((pct / 100) * PROGRESS_SQUARE_COUNT);
                        return (
                          <View
                            key={i}
                            style={[
                              styles.progressSquare,
                              {
                                backgroundColor: filled
                                  ? squareColor
                                  : isDark ? withAlpha(theme.colors.sheen, 8) : withAlpha(theme.colors.sheen, 6),
                              },
                            ]}
                          />
                        );
                      })}
                    </View>
                    <Text style={[styles.progressPct, { color: theme.colors.textSecondary }]}>
                      {done}/{total}
                    </Text>
                  </View>
                );
              })}
            </View>

            <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />
          </>
        ) : null}

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
    gap: 12,
  },
  rankingsLabel: {
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  progressBlock: {
    gap: 8,
  },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  rankLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    flexBasis: 88,
    flexGrow: 0,
    flexShrink: 0,
    minWidth: 0,
  },
  rankCircle: {
    width: 16,
    height: 16,
    borderRadius: 9999,
    borderWidth: 1.4,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  rankCircleText: {
    fontSize: 9,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  progressLabel: {
    flexShrink: 1,
    minWidth: 0,
    fontSize: 10,
    fontWeight: "800",
  },
  squareGrid: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  progressSquare: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 2,
    minWidth: 0,
  },
  progressPct: {
    fontSize: 11,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
    minWidth: 36,
    textAlign: "right",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 2,
  },
});
