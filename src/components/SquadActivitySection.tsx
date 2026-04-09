import { useState } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronDown, Flame, Heart, Sparkles, Flag, Users } from "lucide-react-native";
import type { AppTheme } from "../styles/theme";
import type {
  ChallengeActivityRow,
  ChallengeNudgeKind,
  ChallengeNudgeRow,
} from "../types/groupChallenge";
import type { ProfileLabel } from "../lib/groupChallengesApi";

function participantDisplayName(label: ProfileLabel | undefined): string {
  if (label?.displayName) return label.displayName;
  if (label?.username) {
    const u = label.username;
    return u.charAt(0).toUpperCase() + u.slice(1);
  }
  return "Member";
}

/** Locale-aware date + time from ISO string (Supabase `timestamptz`). */
function formatActivityTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(d);
  } catch {
    return d.toLocaleString();
  }
}

function milestoneCopy(row: ChallengeActivityRow, labels: Record<string, ProfileLabel>): { title: string; subtitle: string } {
  const name = participantDisplayName(labels[row.actor_user_id]);
  if (row.kind === "mission_day") {
    return { title: name, subtitle: `Completed day ${row.value} of the mission` };
  }
  return { title: name, subtitle: `${row.value}-day streak` };
}

function NudgeActivityLine({
  row,
  labels,
  theme,
}: {
  row: ChallengeNudgeRow;
  labels: Record<string, ProfileLabel>;
  theme: AppTheme;
}) {
  const from = participantDisplayName(labels[row.from_user_id]);
  const to = participantDisplayName(labels[row.to_user_id]);
  const base = theme.colors.textSecondary;
  const accentWeight: "700" | "800" = "800";
  const textProps = Platform.OS === "android" ? { includeFontPadding: false as const } : {};

  switch (row.kind) {
    case "cheer":
      return (
        <Text style={[styles.nudgeLine, { color: base }]} numberOfLines={3} {...textProps}>
          <Text style={{ color: base }}>{from} </Text>
          <Text style={{ color: theme.colors.indigo[400], fontWeight: accentWeight }}>cheered</Text>
          <Text style={{ color: base }}> {to}</Text>
        </Text>
      );
    case "ping":
      return (
        <Text style={[styles.nudgeLine, { color: base }]} numberOfLines={3} {...textProps}>
          <Text style={{ color: base }}>{from} nudged {to} — </Text>
          <Text style={{ color: theme.colors.cyan[400], fontWeight: accentWeight }}>where are you?</Text>
        </Text>
      );
    case "fire":
      return (
        <Text style={[styles.nudgeLine, { color: base }]} numberOfLines={3} {...textProps}>
          <Text style={{ color: base }}>{from} sent </Text>
          <Text style={{ color: theme.colors.amber[500], fontWeight: accentWeight }}>fire</Text>
          <Text style={{ color: base }}> to {to}</Text>
        </Text>
      );
    case "congrats":
      return (
        <Text style={[styles.nudgeLine, { color: base }]} numberOfLines={3} {...textProps}>
          <Text style={{ color: base }}>{from} </Text>
          <Text style={{ color: theme.colors.indigo[400], fontWeight: accentWeight }}>congratulated</Text>
          <Text style={{ color: base }}> {to}</Text>
        </Text>
      );
  }
}

function NudgeKindIcon({ kind, theme }: { kind: ChallengeNudgeKind; theme: AppTheme }) {
  const size = theme.icon.sm;
  const common = { size, strokeWidth: 2.2 as const };
  switch (kind) {
    case "cheer":
      return <Heart {...common} color={theme.colors.indigo[400]} />;
    case "ping":
      return (
        <Text style={{ fontSize: size * 0.95, fontWeight: "900", color: theme.colors.cyan[400] }}>
          ?!
        </Text>
      );
    case "fire":
      return <Flame {...common} color={theme.colors.amber[500]} />;
    case "congrats":
      return <Sparkles {...common} color={theme.colors.indigo[400]} />;
  }
}

type Props = {
  theme: AppTheme;
  isDark: boolean;
  feedActivity: ChallengeActivityRow[];
  feedNudges: ChallengeNudgeRow[];
  profileLabels: Record<string, ProfileLabel>;
  myUserId: string | null;
  nudgeBusyKey: string | null;
  onCongrats: (actorUserId: string) => void;
};

export function SquadActivitySection({
  theme,
  isDark,
  feedActivity,
  feedNudges,
  profileLabels,
  myUserId,
  nudgeBusyKey,
  onCongrats,
}: Props) {
  const [expanded, setExpanded] = useState(false);

  if (feedActivity.length === 0 && feedNudges.length === 0) return null;

  const cardBg = theme.colors.surfaceElevated;
  const border = theme.colors.border;

  const mCount = feedActivity.length;
  const nCount = feedNudges.length;
  const summaryParts: string[] = [];
  if (mCount > 0) summaryParts.push(`${mCount} milestone${mCount === 1 ? "" : "s"}`);
  if (nCount > 0) summaryParts.push(`${nCount} nudge${nCount === 1 ? "" : "s"}`);
  const summaryLine = summaryParts.length > 0 ? summaryParts.join(" · ") : "Activity";

  return (
    <View style={styles.section}>
      <View
        style={[
          styles.accordionShell,
          {
            backgroundColor: cardBg,
            borderColor: border,
            ...theme.shadow.card,
          },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          onPress={() => setExpanded((v) => !v)}
          style={({ pressed }) => [
            styles.accordionTrigger,
            {
              borderBottomWidth: expanded ? StyleSheet.hairlineWidth : 0,
              borderBottomColor: border,
              backgroundColor: pressed ? (isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)") : "transparent",
            },
          ]}
        >
          <View style={[styles.headerIconWrap, { backgroundColor: isDark ? "rgba(129, 140, 248, 0.18)" : "rgba(99, 102, 241, 0.12)" }]}>
            <Users size={theme.icon.md} color={theme.colors.indigo[400]} strokeWidth={2.2} />
          </View>
          <View style={styles.headerText}>
            <Text style={[styles.heroLabel, { color: theme.colors.textPrimary }]}>Squad activity</Text>
            <Text style={[styles.heroSub, { color: theme.colors.textMuted }]} numberOfLines={expanded ? 2 : 1}>
              {expanded ? "Milestones and cheers from your group" : `${summaryLine} · Tap to expand`}
            </Text>
          </View>
          <ChevronDown
            size={theme.icon.lg}
            color={theme.colors.textMuted}
            strokeWidth={2.2}
            style={{
              transform: [{ rotate: expanded ? "0deg" : "-90deg" }],
            }}
          />
        </Pressable>

        {expanded ? (
          <View style={styles.accordionBody}>
        {feedActivity.length > 0 ? (
          <>
            <View style={styles.subsectionHeader}>
              <Flag size={theme.icon.sm} color={theme.colors.green[500]} strokeWidth={2.2} />
              <Text style={[styles.subsectionTitle, { color: theme.colors.textMuted }]}>Milestones</Text>
            </View>
            {feedActivity.map((row, index) => {
              const { title, subtitle } = milestoneCopy(row, profileLabels);
              const isMission = row.kind === "mission_day";
              const accent = isMission ? theme.colors.green[500] : theme.colors.cyan[400];
              const tintBg = isMission
                ? isDark
                  ? "rgba(34, 197, 94, 0.12)"
                  : "rgba(22, 163, 74, 0.1)"
                : isDark
                  ? "rgba(34, 211, 238, 0.12)"
                  : "rgba(8, 145, 178, 0.1)";

              return (
                <View
                  key={row.id}
                  style={[
                    styles.milestoneRow,
                    index > 0 && feedActivity.length > 1 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: border },
                  ]}
                >
                  <View style={[styles.accentBar, { backgroundColor: accent }]} />
                  <View style={[styles.milestoneIconCircle, { backgroundColor: tintBg }]}>
                    {isMission ? (
                      <Flag size={theme.icon.sm} color={accent} strokeWidth={2.4} />
                    ) : (
                      <Flame size={theme.icon.sm} color={accent} strokeWidth={2.4} />
                    )}
                  </View>
                  <View style={styles.milestoneBody}>
                    <Text style={[styles.milestoneTitle, { color: theme.colors.textPrimary }]} numberOfLines={1}>
                      {title}
                    </Text>
                    <Text style={[styles.milestoneSub, { color: theme.colors.textSecondary }]} numberOfLines={2}>
                      {subtitle}
                    </Text>
                    {row.created_at ? (
                      <Text style={[styles.rowTimestamp, { color: theme.colors.textMuted }]}>
                        {formatActivityTimestamp(row.created_at)}
                      </Text>
                    ) : null}
                  </View>
                  {myUserId && row.actor_user_id !== myUserId ? (
                    <Pressable
                      disabled={nudgeBusyKey !== null}
                      onPress={() => onCongrats(row.actor_user_id)}
                      style={({ pressed }) => [
                        styles.congratsPill,
                        {
                          backgroundColor: isDark ? "rgba(129, 140, 248, 0.22)" : "rgba(99, 102, 241, 0.12)",
                          opacity: pressed ? 0.85 : nudgeBusyKey !== null ? 0.5 : 1,
                        },
                      ]}
                    >
                      {nudgeBusyKey === `${row.actor_user_id}-congrats` ? (
                        <ActivityIndicator size="small" color={theme.colors.indigo[400]} />
                      ) : (
                        <>
                          <Sparkles size={theme.icon.xs} color={theme.colors.indigo[400]} strokeWidth={2.2} />
                          <Text style={[styles.congratsPillText, { color: theme.colors.indigo[400] }]}>Congrats</Text>
                        </>
                      )}
                    </Pressable>
                  ) : null}
                </View>
              );
            })}
          </>
        ) : null}

        {feedNudges.length > 0 ? (
          <View
            style={
              feedActivity.length > 0
                ? [styles.nudgeBlock, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: border }]
                : { paddingTop: 4 }
            }
          >
            <View style={styles.subsectionHeader}>
              <Sparkles size={theme.icon.sm} color={theme.colors.amber[500]} strokeWidth={2.2} />
              <Text style={[styles.subsectionTitle, { color: theme.colors.textMuted }]}>Recent nudges</Text>
            </View>
            {feedNudges.slice(0, 12).map((row) => (
              <View key={row.id} style={styles.nudgeRow}>
                <View
                  style={[
                    styles.nudgeIconWrap,
                    {
                      backgroundColor: isDark ? "rgba(148, 163, 184, 0.12)" : "rgba(148, 163, 184, 0.12)",
                    },
                  ]}
                >
                  <NudgeKindIcon kind={row.kind} theme={theme} />
                </View>
                <View style={styles.nudgeTextWrap}>
                  <NudgeActivityLine row={row} labels={profileLabels} theme={theme} />
                  {row.created_at ? (
                    <Text style={[styles.rowTimestamp, { color: theme.colors.textMuted }]}>
                      {formatActivityTimestamp(row.created_at)}
                    </Text>
                  ) : null}
                </View>
              </View>
            ))}
          </View>
        ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: 22 },
  accordionShell: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: "hidden",
  },
  accordionTrigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  accordionBody: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  headerIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: { flex: 1, minWidth: 0 },
  heroLabel: {
    fontSize: 17,
    fontWeight: "900",
    letterSpacing: -0.3,
  },
  heroSub: {
    fontSize: 12,
    fontWeight: "600",
    marginTop: 2,
    letterSpacing: 0.2,
  },
  subsectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 4,
    paddingVertical: 8,
    marginBottom: 4,
  },
  subsectionTitle: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  milestoneRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  accentBar: {
    width: 4,
    alignSelf: "stretch",
    minHeight: 44,
    borderRadius: 4,
  },
  milestoneIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  milestoneBody: { flex: 1, minWidth: 0 },
  milestoneTitle: {
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  milestoneSub: {
    fontSize: 13,
    fontWeight: "600",
    marginTop: 2,
    lineHeight: 18,
  },
  rowTimestamp: {
    fontSize: 11,
    fontWeight: "600",
    marginTop: 4,
    letterSpacing: 0.15,
  },
  congratsPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 9999,
    minWidth: 100,
    justifyContent: "center",
  },
  congratsPillText: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  nudgeBlock: {
    marginTop: 4,
    paddingTop: 8,
  },
  nudgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  nudgeIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  nudgeTextWrap: {
    flex: 1,
    justifyContent: "center",
    minHeight: 32,
  },
  nudgeLine: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "600",
  },
});
