import { Text } from "./AppText";
import { memo, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { ChevronDown, Flame, Heart, MessageSquare, Trophy, Flag, Users } from "lucide-react-native";
import type { AppTheme } from "../styles/theme";
import type {
  ChallengeActivityRow,
  ChallengeNudgeKind,
  ChallengeNudgeRow,
} from "../types/groupChallenge";
import type { ProfileLabel } from "../lib/groupChallengesApi";
import { formatDateTimeDisplay } from "../utils/dateDisplay";

/** Calm header: indigo “Squad” + neutral “activity”. */
function SquadActivityTitle({
  theme,
  isDark,
  compact = false,
}: {
  theme: AppTheme;
  isDark: boolean;
  compact?: boolean;
}) {
  return (
    <View style={styles.brandTitleOuter}>
      <View style={styles.brandTitleInner}>
        <View style={styles.brandTitleRow}>
          <Text style={[styles.heroBrandStrong, compact && styles.heroBrandStrongCompact, { color: theme.colors.indigo[400] }]}>Squad</Text>
          <Text style={[styles.heroBrandRest, compact && styles.heroBrandRestCompact, { color: theme.colors.textPrimary }]}> activity</Text>
        </View>
      </View>
    </View>
  );
}

function participantDisplayName(label: ProfileLabel | undefined): string {
  if (label?.displayName) return label.displayName;
  if (label?.username) {
    const u = label.username;
    return u.charAt(0).toUpperCase() + u.slice(1);
  }
  return "Member";
}

function formatActivityTimestamp(iso: string): string {
  return formatDateTimeDisplay(iso);
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
          <Text style={{ color: base }}>{from} nudged {to}: </Text>
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
    case "custom_note": {
      const m = row.message?.trim() ?? "";
      return (
        <Text style={[styles.nudgeLine, { color: base }]} {...textProps}>
          <Text style={{ color: base }}>{from} sent </Text>
          <Text style={{ color: theme.colors.indigo[400], fontWeight: accentWeight }}>a note</Text>
          <Text style={{ color: base }}> to {to}</Text>
          {m.length > 0 ? (
            <Text style={{ color: base }}>{`: “${m}”`}</Text>
          ) : null}
        </Text>
      );
    }
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
      return <Trophy {...common} color={theme.colors.indigo[400]} />;
    case "custom_note":
      return <MessageSquare {...common} color={theme.colors.indigo[400]} />;
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
  onCongrats: (actorUserId: string, activityId: string) => void;
  /** Activity ids the viewer already congratulated. */
  congratsSentActivityIds?: Set<string>;
  /** When false (e.g. viewer mission window ended), hide Congrats on milestones */
  allowNudgeActions?: boolean;
  loading?: boolean;
  loadingMore?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
  /** Small top placement used beside/under the cohort ranking summary. */
  compact?: boolean;
  /** Render the feed body directly without accordion controls. */
  alwaysExpanded?: boolean;
  /** Expand accordion and scroll parent ScrollView to this section (e.g. challenge screen). */
  onScrollToSection?: () => void;
};

export const SquadActivitySection = memo(function SquadActivitySection({
  theme,
  isDark,
  feedActivity,
  feedNudges,
  profileLabels,
  myUserId,
  nudgeBusyKey,
  onCongrats,
  congratsSentActivityIds,
  allowNudgeActions = true,
  loading = false,
  loadingMore = false,
  hasMore = false,
  onLoadMore,
  compact = false,
  alwaysExpanded = false,
  onScrollToSection,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [milestonesExpanded, setMilestonesExpanded] = useState(false);
  const isExpanded = alwaysExpanded || expanded;

  // Dedupe: when a check-in triggers both mission_day and streak_milestone at the same value
  // (common on 7/14/21), prefer showing the streak milestone to avoid repetitive rows.
  const effectiveActivity = useMemo(() => {
    const keepByKey = new Map<string, ChallengeActivityRow>();
    for (const row of feedActivity) {
      const k = `${row.actor_user_id}:${row.value}`;
      const prev = keepByKey.get(k);
      if (!prev) {
        keepByKey.set(k, row);
        continue;
      }
      const prevIsMission = prev.kind === "mission_day";
      const nextIsStreak = row.kind === "streak_milestone";
      if (prevIsMission && nextIsStreak) {
        keepByKey.set(k, row);
      }
    }
    // Preserve original order as much as possible.
    const keptIds = new Set([...keepByKey.values()].map((r) => r.id));
    return feedActivity.filter((r) => keptIds.has(r.id));
  }, [feedActivity]);

  if (feedActivity.length === 0 && feedNudges.length === 0 && !loading) return null;

  const cardBg = theme.colors.surfaceElevated;
  const border = theme.colors.border;

  const mCount = effectiveActivity.length;
  const nCount = feedNudges.length;
  const summaryParts: string[] = [];
  if (mCount > 0) summaryParts.push(`${mCount} milestone${mCount === 1 ? "" : "s"}`);
  if (nCount > 0) summaryParts.push(`${nCount} nudge${nCount === 1 ? "" : "s"}`);
  const summaryLine = summaryParts.length > 0 ? summaryParts.join(" · ") : loading ? "Loading activity" : "Activity";

  return (
    <View style={[styles.section, compact && styles.compactSection]}>
      <View
        style={[
          styles.accordionShell,
          compact && styles.compactShell,
          compact && isExpanded && styles.compactShellExpanded,
          {
            backgroundColor: cardBg,
            borderColor: border,
            ...theme.shadow.card,
          },
        ]}
      >
        <View
        style={[
          styles.accordionTrigger,
          compact && styles.compactTrigger,
          {
            borderBottomWidth: isExpanded ? StyleSheet.hairlineWidth : 0,
            borderBottomColor: border,
            },
          ]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: isExpanded }}
            disabled={alwaysExpanded}
            onPress={() => setExpanded((v) => !v)}
            style={({ pressed }) => [
              styles.accordionTriggerMain,
              compact && styles.compactTriggerMain,
              {
                backgroundColor: pressed ? (isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)") : "transparent",
              },
            ]}
          >
            <View style={[styles.headerIconWrap, compact && styles.compactHeaderIconWrap, { backgroundColor: isDark ? "rgba(129, 140, 248, 0.18)" : "rgba(99, 102, 241, 0.12)" }]}>
              <Users size={compact ? theme.icon.sm : theme.icon.md} color={theme.colors.indigo[400]} strokeWidth={2.2} />
            </View>
            <View style={styles.headerText}>
              {compact ? (
                <View style={styles.compactTitleRow}>
                  <SquadActivityTitle theme={theme} isDark={isDark} compact />
                  <View style={styles.compactInlineStats}>
                    {mCount > 0 ? (
                      <View style={[styles.compactStatPill, { borderColor: theme.colors.border }]}>
                        <Flag size={11} color={theme.colors.green[500]} strokeWidth={2.4} />
                        <Text style={[styles.compactStatText, { color: theme.colors.textSecondary }]}>
                          {mCount}
                        </Text>
                      </View>
                    ) : null}
                    {nCount > 0 ? (
                      <View style={[styles.compactStatPill, { borderColor: theme.colors.border }]}>
                        <MessageSquare size={11} color={theme.colors.amber[500]} strokeWidth={2.4} />
                        <Text style={[styles.compactStatText, { color: theme.colors.textSecondary }]}>
                          {nCount}
                        </Text>
                      </View>
                    ) : null}
                    {mCount === 0 && nCount === 0 ? (
                      <Text style={[styles.heroSub, styles.compactLoadingText, { color: theme.colors.textMuted }]} numberOfLines={1}>
                        {summaryLine}
                      </Text>
                    ) : null}
                  </View>
                </View>
              ) : (
                <>
                  <SquadActivityTitle theme={theme} isDark={isDark} />
                <View style={styles.heroSubColumn}>
                  <Text style={[styles.heroSub, { color: theme.colors.textMuted }]} numberOfLines={1}>
                    {summaryLine}
                  </Text>
                  <Text style={[styles.heroSubHint, { color: theme.colors.textMuted }]} numberOfLines={1}>
                    {isExpanded ? "Milestones and cheers from your group" : "Tap to expand"}
                  </Text>
                </View>
                </>
              )}
            </View>
          </Pressable>
          <View style={[styles.headerRightCluster, compact && styles.compactHeaderRightCluster]}>
            {!compact && onScrollToSection ? (
              <Pressable
                onPress={() => {
                  setExpanded(true);
                  onScrollToSection();
                }}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="View all squad activity"
                style={({ pressed }) => [{ opacity: pressed ? 0.75 : 1 }]}
              >
                <Text style={[styles.viewAllText, { color: theme.colors.indigo[400] }]}>View all</Text>
              </Pressable>
            ) : null}
            {!alwaysExpanded ? (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: isExpanded }}
                onPress={() => setExpanded((v) => !v)}
                hitSlop={8}
                accessibilityLabel={isExpanded ? "Collapse squad activity" : "Expand squad activity"}
                style={({ pressed }) => [
                  styles.expandIconButton,
                  compact && styles.compactExpandIconButton,
                  compact && {
                    borderColor: theme.colors.border,
                    backgroundColor: isDark ? "rgba(129, 140, 248, 0.12)" : "rgba(99, 102, 241, 0.08)",
                  },
                  { opacity: pressed ? 0.75 : 1 },
                ]}
              >
                <ChevronDown
                  size={compact ? theme.icon.md : theme.icon.lg}
                  color={compact ? theme.colors.indigo[400] : theme.colors.textMuted}
                  strokeWidth={2.2}
                  style={{
                    transform: compact
                      ? [{ rotate: isExpanded ? "180deg" : "0deg" }]
                      : [{ rotate: isExpanded ? "0deg" : "-90deg" }],
                  }}
                />
              </Pressable>
            ) : null}
          </View>
        </View>

        {isExpanded ? (
          <View style={styles.accordionBody}>
        {loading && effectiveActivity.length === 0 && feedNudges.length === 0 ? (
          <View style={styles.loadingState}>
            <ActivityIndicator size="small" color={theme.colors.indigo[400]} />
            <Text style={[styles.loadingStateText, { color: theme.colors.textMuted }]}>
              Loading squad activity
            </Text>
          </View>
        ) : null}

        {effectiveActivity.length > 0 ? (
          <View
            style={[
              styles.milestoneAccordion,
              {
                borderColor: border,
                backgroundColor: isDark ? "rgba(15, 23, 42, 0.16)" : "rgba(248, 250, 252, 0.8)",
              },
            ]}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: milestonesExpanded }}
              accessibilityLabel={milestonesExpanded ? "Collapse milestones" : "Expand milestones"}
              onPress={() => setMilestonesExpanded((v) => !v)}
              style={({ pressed }) => [
                styles.milestoneAccordionTrigger,
                {
                  backgroundColor: pressed
                    ? isDark
                      ? "rgba(255,255,255,0.04)"
                      : "rgba(15,23,42,0.03)"
                    : "transparent",
                },
              ]}
            >
              <View style={styles.milestoneAccordionTitle}>
                <View
                  style={[
                    styles.milestoneAccordionIcon,
                    {
                      backgroundColor: isDark
                        ? "rgba(34, 197, 94, 0.12)"
                        : "rgba(22, 163, 74, 0.1)",
                    },
                  ]}
                >
                  <Flag size={theme.icon.sm} color={theme.colors.green[500]} strokeWidth={2.2} />
                </View>
                <View style={styles.milestoneAccordionCopy}>
                  <Text style={[styles.subsectionTitle, { color: theme.colors.textMuted }]}>Milestones</Text>
                  <Text style={[styles.milestoneAccordionMeta, { color: theme.colors.textSecondary }]} numberOfLines={1}>
                    {mCount} achievement{mCount === 1 ? "" : "s"}
                  </Text>
                </View>
              </View>
              <View style={styles.milestoneAccordionHint}>
                <Text style={[styles.milestoneAccordionHintText, { color: theme.colors.textMuted }]}>
                  Click to view
                </Text>
                <ChevronDown
                  size={theme.icon.md}
                  color={theme.colors.textMuted}
                  strokeWidth={2.2}
                  style={{ transform: [{ rotate: milestonesExpanded ? "180deg" : "0deg" }] }}
                />
              </View>
            </Pressable>
            {milestonesExpanded ? (
              <View
                style={[
                  styles.milestoneAccordionBody,
                  { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: border },
                ]}
              >
                {effectiveActivity.map((row, index) => {
                  const { title, subtitle } = milestoneCopy(row, profileLabels);
                  const isMission = row.kind === "mission_day";
                  const isCongratsBusy = nudgeBusyKey === `congrats:${row.id}`;
                  const alreadyCongratulated = congratsSentActivityIds?.has(row.id) === true;
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
                        index > 0 && effectiveActivity.length > 1 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: border },
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
                      {allowNudgeActions && myUserId && row.actor_user_id !== myUserId ? (
                        <Pressable
                          disabled={nudgeBusyKey !== null || alreadyCongratulated}
                          onPress={() => onCongrats(row.actor_user_id, row.id)}
                          style={({ pressed }) => [
                            styles.congratsPill,
                            {
                              backgroundColor: isDark ? "rgba(129, 140, 248, 0.22)" : "rgba(99, 102, 241, 0.12)",
                              opacity:
                                pressed
                                  ? 0.85
                                  : alreadyCongratulated
                                    ? 0.55
                                    : nudgeBusyKey !== null
                                      ? 0.5
                                      : 1,
                            },
                          ]}
                        >
                          {isCongratsBusy ? (
                            <ActivityIndicator size="small" color={theme.colors.indigo[400]} />
                          ) : alreadyCongratulated ? (
                            <Text style={[styles.congratsPillText, { color: theme.colors.indigo[400] }]}>
                              Congratulated
                            </Text>
                          ) : (
                            <>
                              <Trophy size={theme.icon.xs} color={theme.colors.indigo[400]} strokeWidth={2.2} />
                              <Text style={[styles.congratsPillText, { color: theme.colors.indigo[400] }]}>Congrats</Text>
                            </>
                          )}
                        </Pressable>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            ) : null}
          </View>
        ) : null}

        {feedNudges.length > 0 ? (
          <View
            style={
              effectiveActivity.length > 0
                ? styles.nudgeBlockAfterMilestones
                : { paddingTop: 4 }
            }
          >
            <View style={styles.subsectionHeader}>
              <MessageSquare size={theme.icon.sm} color={theme.colors.amber[500]} strokeWidth={2.2} />
              <Text style={[styles.subsectionTitle, { color: theme.colors.textMuted }]}>Recent nudges</Text>
            </View>
            {feedNudges.map((row) => (
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
        {hasMore && onLoadMore ? (
          <Pressable
            accessibilityRole="button"
            onPress={onLoadMore}
            disabled={loadingMore}
            style={({ pressed }) => [
              styles.loadMoreBtn,
              {
                borderColor: border,
                backgroundColor: pressed
                  ? isDark
                    ? "rgba(255,255,255,0.06)"
                    : "rgba(0,0,0,0.04)"
                  : "transparent",
                opacity: loadingMore ? 0.72 : 1,
              },
            ]}
          >
            {loadingMore ? (
              <ActivityIndicator size="small" color={theme.colors.indigo[400]} />
            ) : (
              <Text style={[styles.loadMoreText, { color: theme.colors.textSecondary }]}>Load older activity</Text>
            )}
          </Pressable>
        ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
});

SquadActivitySection.displayName = "SquadActivitySection";

const styles = StyleSheet.create({
  section: { marginBottom: 22 },
  compactSection: {
    marginBottom: 14,
    alignItems: "stretch",
  },
  accordionShell: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: "hidden",
  },
  compactShell: {
    width: "100%",
    maxWidth: "100%",
    borderRadius: 16,
    alignSelf: "stretch",
  },
  compactShellExpanded: {
    alignSelf: "stretch",
    width: "100%",
  },
  accordionTrigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingRight: 10,
    paddingVertical: 6,
    paddingLeft: 14,
  },
  compactTrigger: {
    gap: 6,
    paddingLeft: 10,
    paddingRight: 8,
    paddingVertical: 4,
  },
  accordionTriggerMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 8,
    minWidth: 0,
    borderRadius: 12,
  },
  compactTriggerMain: {
    flex: 1,
    gap: 8,
    paddingVertical: 5,
  },
  accordionBody: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  loadingState: {
    minHeight: 72,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  loadingStateText: {
    fontSize: 12,
    fontWeight: "800",
  },
  headerIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  compactHeaderIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 10,
  },
  headerText: { flex: 1, minWidth: 0 },
  brandTitleOuter: {
    alignSelf: "flex-start",
    maxWidth: "100%",
  },
  brandTitleInner: {
    borderRadius: 10,
    paddingVertical: 3,
    paddingHorizontal: 2,
  },
  brandTitleRow: {
    flexDirection: "row",
    alignItems: "baseline",
    flexWrap: "nowrap",
  },
  heroBrandStrong: {
    fontSize: 17,
    fontWeight: "800",
    letterSpacing: -0.35,
  },
  heroBrandStrongCompact: {
    fontSize: 14,
    letterSpacing: 0,
  },
  heroBrandRest: {
    fontSize: 17,
    fontWeight: "600",
    letterSpacing: -0.2,
  },
  heroBrandRestCompact: {
    fontSize: 14,
    letterSpacing: 0,
  },
  heroSubColumn: {
    marginTop: 4,
    gap: 2,
  },
  heroSub: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.15,
  },
  heroSubHint: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.2,
    opacity: 0.92,
  },
  compactStatRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 3,
  },
  compactInlineStats: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 0,
    gap: 5,
    marginLeft: 4,
  },
  compactTitleRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minWidth: 0,
  },
  compactStatPill: {
    minHeight: 20,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  compactStatText: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0,
  },
  compactLoadingText: {
    fontSize: 11,
  },
  headerRightCluster: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  compactHeaderRightCluster: {
    minWidth: 34,
    justifyContent: "flex-end",
    gap: 0,
  },
  expandIconButton: {
    alignItems: "center",
    justifyContent: "center",
  },
  compactExpandIconButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
  },
  viewAllText: {
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  compactViewText: {
    fontSize: 12,
    letterSpacing: 0,
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
  milestoneAccordion: {
    borderWidth: 1,
    borderRadius: 14,
    marginHorizontal: 4,
    marginBottom: 8,
    overflow: "hidden",
  },
  milestoneAccordionTrigger: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  milestoneAccordionTitle: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  milestoneAccordionIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  milestoneAccordionCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  milestoneAccordionHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    flexShrink: 0,
  },
  milestoneAccordionHintText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.1,
  },
  milestoneAccordionMeta: {
    fontSize: 12,
    fontWeight: "700",
  },
  milestoneAccordionBody: {
    paddingHorizontal: 4,
    paddingVertical: 2,
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
  loadMoreBtn: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 4,
    marginTop: 8,
    marginBottom: 4,
  },
  loadMoreText: {
    fontSize: 12,
    fontWeight: "900",
  },
  nudgeBlockAfterMilestones: {
    marginTop: 6,
    paddingTop: 0,
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
