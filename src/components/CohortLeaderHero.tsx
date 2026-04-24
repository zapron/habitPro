import { Text } from "./AppText";
import { StyleSheet, View } from "react-native";
import type { AppTheme } from "../styles/theme";
import type { Habit } from "../types/habit";
import type { ProfileLabel } from "../lib/groupChallengesApi";
import { CohortMastheadTrophyNarrative, type CohortMastheadModel } from "./CohortMasthead";
import { CohortStreakPill } from "./CohortStreakPill";

function initialsFromLabel(label: ProfileLabel | undefined, fallbackName: string): string {
  const dn = label?.displayName?.trim();
  if (dn) {
    const parts = dn.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return dn.slice(0, 2).toUpperCase();
  }
  const u = label?.username?.trim();
  if (u) return u.slice(0, 2).toUpperCase();
  const n = fallbackName.trim();
  if (n.length >= 2) return n.slice(0, 2).toUpperCase();
  return "?";
}

function shortNameForBar(fullName: string, maxLen = 11): string {
  const t = fullName.trim();
  if (t.length <= maxLen) return t;
  const first = t.split(/\s+/)[0] ?? t;
  if (first.length <= maxLen) return first;
  return `${first.slice(0, maxLen - 1)}…`;
}

/** Gap between 1st and 2nd on check-in count (not vs viewer). */
function topTwoPaceLine(
  model: CohortMastheadModel,
  firstHabit: Habit | undefined,
  secondHabit: Habit | undefined,
  firstName: string,
): string | null {
  if (model.kind === "sync_prompt") return null;
  if (!firstHabit || !secondHabit) return null;
  const a = firstHabit.completedDates.length;
  const b = secondHabit.completedDates.length;
  const d = a - b;
  if (d === 0) return "1st and 2nd are tied on check-ins";
  const leaderShort = shortNameForBar(firstName, 18);
  return `${leaderShort} leads 2nd place by ${d} day${d === 1 ? "" : "s"} on check-ins`;
}

type RunnerUp = { userId: string; habit: Habit; name: string };

type Props = {
  theme: AppTheme;
  isDark: boolean;
  model: CohortMastheadModel;
  leaderName: string;
  leaderLabel: ProfileLabel | undefined;
  leaderHabit: Habit | undefined;
  runnerUp: RunnerUp | null;
};

export function CohortLeaderHero({
  theme,
  isDark,
  model,
  leaderName,
  leaderLabel,
  leaderHabit,
  runnerUp,
}: Props) {
  const initials = initialsFromLabel(leaderLabel, leaderName);
  const pace =
    runnerUp && leaderHabit
      ? topTwoPaceLine(model, leaderHabit, runnerUp.habit, leaderName)
      : null;
  const total = Math.max(
    1,
    leaderHabit?.totalDays ?? runnerUp?.habit.totalDays ?? 21,
  );
  const firstDone = leaderHabit ? leaderHabit.completedDates.length : 0;
  const secondDone = runnerUp ? runnerUp.habit.completedDates.length : 0;
  const firstPct = Math.min(100, Math.round((firstDone / total) * 100));
  const secondPct = Math.min(100, Math.round((secondDone / total) * 100));

  const avatarBg = isDark ? "rgba(129, 140, 248, 0.22)" : "rgba(99, 102, 241, 0.14)";
  const avatarBorder = isDark ? "rgba(129, 140, 248, 0.35)" : "rgba(99, 102, 241, 0.28)";

  const firstBarLabel = runnerUp ? `1st · ${shortNameForBar(leaderName)}` : shortNameForBar(leaderName);
  const secondBarLabel = runnerUp ? `2nd · ${shortNameForBar(runnerUp.name)}` : null;

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
        {model.kind !== "sync_prompt" && leaderHabit ? (
          <>
            <View style={styles.heroRow}>
              <View
                style={[
                  styles.avatar,
                  { backgroundColor: avatarBg, borderColor: avatarBorder },
                ]}
              >
                <Text style={[styles.avatarText, { color: theme.colors.indigo[400] }]}>{initials}</Text>
              </View>
              <View style={styles.heroTextCol}>
                <Text style={[styles.leaderName, { color: theme.colors.textPrimary }]} numberOfLines={1}>
                  {leaderName}
                </Text>
                <View style={styles.streakRow}>
                  <CohortStreakPill streak={leaderHabit.streak} isDark={isDark} />
                </View>
                {pace ? (
                  <Text style={[styles.paceLine, { color: theme.colors.textMuted }]} numberOfLines={2}>
                    {pace}
                  </Text>
                ) : runnerUp == null ? (
                  <Text style={[styles.paceLine, { color: theme.colors.textMuted }]} numberOfLines={2}>
                    Second place appears when another member syncs progress.
                  </Text>
                ) : null}
              </View>
            </View>

            <View style={styles.progressBlock}>
              <View style={styles.progressRow}>
                <Text style={[styles.progressLabel, { color: theme.colors.textMuted }]} numberOfLines={1}>
                  {firstBarLabel}
                </Text>
                <View style={[styles.track, { backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)" }]}>
                  <View
                    style={[
                      styles.trackFill,
                      {
                        width: `${firstPct}%`,
                        backgroundColor: theme.colors.indigo[500],
                      },
                    ]}
                  />
                </View>
                <Text style={[styles.progressPct, { color: theme.colors.textSecondary }]}>
                  {firstDone}/{total}
                </Text>
              </View>
              {runnerUp ? (
                <View style={styles.progressRow}>
                  <Text style={[styles.progressLabel, { color: theme.colors.textMuted }]} numberOfLines={1}>
                    {secondBarLabel}
                  </Text>
                  <View style={[styles.track, { backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)" }]}>
                    <View
                      style={[
                        styles.trackFill,
                        {
                          width: `${secondPct}%`,
                          backgroundColor: theme.colors.cyan[500],
                        },
                      ]}
                    />
                  </View>
                  <Text style={[styles.progressPct, { color: theme.colors.textSecondary }]}>
                    {secondDone}/{total}
                  </Text>
                </View>
              ) : null}
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
  heroRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 9999,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: -0.5,
  },
  heroTextCol: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  leaderName: {
    fontSize: 17,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  streakRow: {
    alignSelf: "flex-start",
  },
  paceLine: {
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 16,
  },
  progressBlock: {
    gap: 8,
  },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  progressLabel: {
    flexBasis: 88,
    flexGrow: 0,
    flexShrink: 0,
    fontSize: 10,
    fontWeight: "800",
  },
  track: {
    flex: 1,
    height: 8,
    borderRadius: 9999,
    overflow: "hidden",
  },
  trackFill: {
    height: "100%",
    borderRadius: 9999,
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
