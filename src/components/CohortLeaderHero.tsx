import { Text } from "./AppText";
import { StyleSheet, View } from "react-native";
import { Eye, EyeOff } from "lucide-react-native";
import type { AppTheme } from "../styles/theme";
import type { Habit } from "../types/habit";
import type { ProfileLabel } from "../lib/groupChallengesApi";
import { levelFromTotalXp } from "../utils/xpLevel";
import { avatarIdentityFor } from "../utils/avatarIdentity";
import { CohortMastheadTrophyNarrative, type CohortMastheadModel } from "./CohortMasthead";
import { CohortStreakPill } from "./CohortStreakPill";
import { GlassTopHighlight } from "./GlassTopHighlight";
import { withAlpha } from "../styles/theme";

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

type RankedMember = { userId: string; habit: Habit; name: string };

function rankLabel(rank: number, name: string): string {
  const label = rank === 1 ? "1st" : rank === 2 ? "2nd" : rank === 3 ? "3rd" : `${rank}th`;
  return `${label} - ${shortNameForBar(name)}`;
}

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
  const initials = initialsFromLabel(leaderLabel, leaderName);
  const identity = avatarIdentityFor(leaderUserId ?? leaderName);
  const progressMembers =
    rankedMembers.length > 0
      ? rankedMembers.slice(0, 3)
      : leaderHabit
        ? [{ userId: "leader", habit: leaderHabit, name: leaderName }]
        : [];
  const runnerUp = progressMembers[1] ?? null;
  const pace =
    runnerUp && leaderHabit
      ? topTwoPaceLine(model, leaderHabit, runnerUp.habit, leaderName)
      : null;
  const total = Math.max(
    1,
    ...progressMembers.map((member) => member.habit.totalDays ?? 21),
  );
  const leaderLevel =
    leaderLabel?.xp != null && Number.isFinite(leaderLabel.xp) ? levelFromTotalXp(leaderLabel.xp) : null;
  const squadVisible = (leaderHabit?.visibility ?? "solo") === "public";
  const VisibilityIcon = squadVisible ? Eye : EyeOff;

  const progressColors = [theme.colors.indigo[500], theme.colors.cyan[500], theme.colors.amber[500]];

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
            <View style={styles.heroRow}>
              <View
                style={[
                  styles.avatar,
                  { backgroundColor: identity.background, borderColor: identity.border },
                ]}
              >
                <Text style={[styles.avatarText, { color: identity.foreground }]}>{initials}</Text>
              </View>
              <View style={styles.heroTextCol}>
                <View style={styles.nameLevelStreakRow}>
                  <View style={styles.nameLevelCluster}>
                    <Text style={[styles.leaderName, { color: theme.colors.textPrimary }]} numberOfLines={2}>
                      {leaderName}
                    </Text>
                    {leaderLevel != null ? (
                      <View
                        style={[
                          styles.levelPill,
                          {
                            borderColor: theme.colors.border,
                            backgroundColor: isDark ? withAlpha(theme.colors.yellow[400], 12) : withAlpha(theme.colors.yellow[400], 12),
                          },
                        ]}
                      >
                        <Text style={[styles.levelPillText, { color: theme.colors.yellow[400] }]}>
                          Lv {leaderLevel}
                        </Text>
                      </View>
                    ) : null}
                    {leaderHabit ? (
                      <View
                        style={[
                          styles.memoryVisibilityPill,
                          {
                            borderColor: squadVisible
                              ? isDark ? withAlpha(theme.colors.cyan[400], 36) : withAlpha(theme.colors.cyan[500], 28)
                              : theme.colors.border,
                            backgroundColor: squadVisible
                              ? isDark ? withAlpha(theme.colors.cyan[400], 12) : withAlpha(theme.colors.cyan[500], 8)
                              : isDark ? withAlpha(theme.colors.textSecondary, 10) : withAlpha(theme.colors.textMuted, 7),
                          },
                        ]}
                        accessibilityLabel={squadVisible ? "Memories visible to squad" : "Memories private"}
                      >
                        <VisibilityIcon
                          size={13}
                          color={squadVisible ? theme.colors.cyan[400] : theme.colors.textMuted}
                        />
                      </View>
                    ) : null}
                  </View>
                  <View style={styles.heroNameRowSpacer} />
                  <View style={styles.heroStreakWrap}>
                    <CohortStreakPill streak={leaderHabit.streak} isDark={isDark} />
                  </View>
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
              {progressMembers.map((member, index) => {
                const done = member.habit.completedDates.length;
                const pct = Math.min(100, Math.round((done / total) * 100));
                return (
                  <View key={member.userId} style={styles.progressRow}>
                    <Text style={[styles.progressLabel, { color: theme.colors.textMuted }]} numberOfLines={1}>
                      {rankLabel(index + 1, member.name)}
                    </Text>
                    <View style={[styles.track, { backgroundColor: isDark ? withAlpha(theme.colors.sheen, 8) : withAlpha(theme.colors.sheen, 6) }]}>
                      <View
                        style={[
                          styles.trackFill,
                          {
                            width: `${pct}%`,
                            backgroundColor: progressColors[index] ?? theme.colors.indigo[500],
                          },
                        ]}
                      />
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
    flexGrow: 0,
    flexShrink: 1,
    minWidth: 0,
  },
  nameLevelStreakRow: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "stretch",
    width: "100%",
  },
  nameLevelCluster: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 1,
    minWidth: 0,
    gap: 6,
  },
  heroNameRowSpacer: {
    flex: 1,
    minWidth: 8,
  },
  heroStreakWrap: {
    flexShrink: 0,
  },
  levelPill: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 9999,
    borderWidth: 1,
  },
  levelPillText: { fontSize: 11, fontWeight: "800", letterSpacing: 0.2 },
  memoryVisibilityPill: {
    width: 24,
    height: 24,
    borderRadius: 9999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
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
