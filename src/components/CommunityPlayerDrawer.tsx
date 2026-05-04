import { Text } from "./AppText";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { BlurView } from "expo-blur";
import { CalendarCheck, Clock3, Flame, ThumbsUp, Trophy, X, Zap } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme } from "../context/ThemeContext";
import {
  fetchCommunityPlayerProfile,
  type CommunityPlayerProfile,
} from "../lib/communityWinsApi";
import { formatRelativeTime } from "../lib/communityWinFeedFormat";
import { LevelXpRing } from "./LevelXpRing";
import { levelFromTotalXp, xpInCurrentLevel } from "../utils/xpLevel";
import { playerLeagueForLevel } from "../utils/playerLeague";

type Props = {
  visible: boolean;
  player: CommunityPlayerDrawerSeed | null;
  onClose: () => void;
};

export type CommunityPlayerDrawerSeed = {
  userId: string;
  username: string | null;
  displayName: string | null;
  xp: number;
  weekly?: {
    rankPosition: number;
    points: number;
    habitDays: number;
    miniCompletions: number;
    isMe?: boolean;
  };
};

function initialsFromName(name: string): string {
  const parts = name.replace(/^@/, "").replace(/_/g, " ").split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  const compact = parts[0] ?? name.replace(/^@/, "");
  if (compact.length >= 2) return compact.slice(0, 2).toUpperCase();
  return compact.slice(0, 1).toUpperCase() || "?";
}

function statLabel(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

function PlayerStat({
  label,
  value,
  accent,
  children,
}: {
  label: string;
  value: number | string;
  accent: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.stat}>
      <View style={styles.statIcon}>{children}</View>
      <Text style={[styles.statValue, { color: accent }]}>{value}</Text>
      <Text style={styles.statLabel} numberOfLines={1}>{label}</Text>
    </View>
  );
}

export function CommunityPlayerDrawer({ visible, player, onClose }: Props) {
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<CommunityPlayerProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || !player) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setProfile(null);
    void (async () => {
      const res = await fetchCommunityPlayerProfile(player.userId);
      if (cancelled) return;
      if (res.ok === true) {
        setProfile(res.profile);
      } else {
        setError(res.error);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, player]);

  const seed = useMemo(() => {
    if (!player) return null;
    return {
      userId: player.userId,
      username: player.username,
      displayName: player.displayName,
      xp: player.xp,
      publicWins: 0,
      miniWins: 0,
      habitStreakWins: 0,
      cheersReceived: 0,
      recentWins: [],
    } satisfies CommunityPlayerProfile;
  }, [player]);

  const shown = profile ?? seed;
  const weekly = player?.weekly ?? null;
  const level = shown ? levelFromTotalXp(shown.xp) : 0;
  const xpInLevel = shown ? xpInCurrentLevel(shown.xp) : 0;
  const league = playerLeagueForLevel(level, theme, isDark);
  const handle = shown?.username ? `@${shown.username}` : "Someone";
  const displayName = shown?.displayName?.trim() || null;
  const normalizedDisplayName = displayName?.replace(/^@/, "").trim().toLowerCase();
  const normalizedHandle = shown?.username?.trim().toLowerCase() ?? null;
  const showHandle = Boolean(displayName && normalizedDisplayName !== normalizedHandle);
  const primaryName = displayName ?? handle;
  const sheetMaxHeight = Math.min(height * 0.88, 720);
  const bottomPad = Math.max(insets.bottom, theme.spacing.md);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <BlurView intensity={30} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFillObject} />
        <Pressable
          style={[
            StyleSheet.absoluteFillObject,
            { backgroundColor: isDark ? "rgba(0,0,0,0.46)" : "rgba(0,0,0,0.22)" },
          ]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Dismiss player card"
        />
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
              maxHeight: sheetMaxHeight,
              paddingBottom: bottomPad,
              ...theme.shadow.card,
            },
          ]}
        >
          <View style={styles.headerRow}>
            <View style={styles.headerSide} />
            <View style={[styles.grabber, { backgroundColor: theme.colors.slate[600] }]} />
            <Pressable
              onPress={onClose}
              hitSlop={12}
              style={[styles.closeBtn, { backgroundColor: theme.colors.surfaceElevated, borderColor: theme.colors.border }]}
              accessibilityRole="button"
              accessibilityLabel="Close player card"
            >
              <X size={theme.icon.lg} color={theme.colors.textSecondary} />
            </Pressable>
          </View>

          {shown ? (
            <ScrollView
              contentContainerStyle={styles.content}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.hero}>
                <LevelXpRing level={level} xpInLevel={xpInLevel} size={92} strokeWidth={5}>
                  <View style={[styles.heroAvatar, { backgroundColor: theme.colors.surfaceElevated, borderColor: theme.colors.border }]}>
                    <Text style={[styles.heroInitials, { color: theme.colors.textPrimary }]}>
                      {initialsFromName(primaryName)}
                    </Text>
                  </View>
                </LevelXpRing>
                <View style={styles.heroText}>
                  <Text style={[styles.name, { color: theme.colors.textPrimary }]} numberOfLines={1}>
                    {primaryName}
                  </Text>
                  {showHandle ? (
                    <Text style={[styles.handle, { color: theme.colors.cyan[400] }]} numberOfLines={1}>
                      {handle}
                    </Text>
                  ) : null}
                  <View style={[styles.leaguePill, { backgroundColor: league.backgroundColor, borderColor: league.color }]}>
                    <Text style={[styles.leaguePillText, { color: league.color }]}>{league.label}</Text>
                  </View>
                </View>
              </View>

              <View style={[styles.xpBand, { backgroundColor: theme.colors.surfaceElevated, borderColor: theme.colors.border }]}>
                <View>
                  <Text style={[styles.xpValue, { color: theme.colors.textPrimary }]}>{shown.xp}</Text>
                  <Text style={[styles.xpLabel, { color: theme.colors.textMuted }]}>lifetime XP</Text>
                </View>
                <View style={[styles.levelBadge, { backgroundColor: league.backgroundColor, borderColor: league.color }]}>
                  <Text style={[styles.levelBadgeValue, { color: theme.colors.textPrimary }]}>{level}</Text>
                  <Text style={[styles.levelBadgeLabel, { color: theme.colors.textMuted }]}>LVL</Text>
                </View>
              </View>

              {weekly ? (
                <View
                  style={[
                    styles.weekCard,
                    { backgroundColor: league.backgroundColor, borderColor: league.color },
                  ]}
                >
                  <View style={styles.weekHeader}>
                    <Text style={[styles.weekTitle, { color: theme.colors.textPrimary }]}>This week</Text>
                    {weekly.isMe ? (
                      <View style={[styles.youPill, { backgroundColor: theme.colors.indigo[600] }]}>
                        <Text style={styles.youPillText}>YOU</Text>
                      </View>
                    ) : null}
                  </View>
                  <View style={styles.statsGrid}>
                    <PlayerStat label="rank" value={`#${weekly.rankPosition}`} accent={theme.colors.amber[500]}>
                      <Trophy size={16} color={theme.colors.amber[500]} />
                    </PlayerStat>
                    <PlayerStat label="pts" value={weekly.points} accent={theme.colors.indigo[400]}>
                      <Zap size={16} color={theme.colors.indigo[400]} />
                    </PlayerStat>
                    <PlayerStat label="habit days" value={weekly.habitDays} accent={theme.colors.cyan[400]}>
                      <CalendarCheck size={16} color={theme.colors.cyan[400]} />
                    </PlayerStat>
                    <PlayerStat label="minis" value={weekly.miniCompletions} accent={theme.colors.yellow[400]}>
                      <Flame size={16} color={theme.colors.yellow[400]} />
                    </PlayerStat>
                  </View>
                </View>
              ) : null}

              <View style={styles.statsGrid}>
                <PlayerStat label={statLabel(shown.publicWins, "win", "wins")} value={shown.publicWins} accent={theme.colors.indigo[400]}>
                  <Trophy size={16} color={theme.colors.indigo[400]} />
                </PlayerStat>
                <PlayerStat label="cheers" value={shown.cheersReceived} accent={theme.colors.amber[500]}>
                  <ThumbsUp size={16} color={theme.colors.amber[500]} />
                </PlayerStat>
                <PlayerStat label="minis" value={shown.miniWins} accent={theme.colors.cyan[400]}>
                  <Zap size={16} color={theme.colors.cyan[400]} />
                </PlayerStat>
                <PlayerStat label="streaks" value={shown.habitStreakWins} accent={theme.colors.yellow[400]}>
                  <Flame size={16} color={theme.colors.yellow[400]} />
                </PlayerStat>
              </View>

              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary }]}>Recent wins</Text>
                {loading ? <ActivityIndicator size="small" color={theme.colors.indigo[400]} /> : null}
              </View>

              {error ? (
                <Text style={[styles.error, { color: theme.colors.textSecondary }]}>{error}</Text>
              ) : shown.recentWins.length === 0 && !loading ? (
                <Text style={[styles.empty, { color: theme.colors.textMuted }]}>No public wins yet.</Text>
              ) : (
                <View style={styles.recentList}>
                  {shown.recentWins.map((win) => {
                    const isHabit = win.feedSource === "habit_streak";
                    const meta = isHabit && win.streakCountAtPost
                      ? `${win.streakCountAtPost}-day streak`
                      : isHabit
                        ? "Habit streak"
                        : "Mini mission";
                    return (
                      <View
                        key={win.id}
                        style={[
                          styles.recentRow,
                          { backgroundColor: theme.colors.surfaceElevated, borderColor: theme.colors.border },
                        ]}
                      >
                        <View style={[styles.recentIcon, { backgroundColor: isHabit ? "rgba(245, 158, 11, 0.14)" : "rgba(99, 102, 241, 0.12)" }]}>
                          {isHabit ? (
                            <Flame size={16} color={theme.colors.amber[500]} />
                          ) : (
                            <Trophy size={16} color={theme.colors.indigo[400]} />
                          )}
                        </View>
                        <View style={styles.recentText}>
                          <Text style={[styles.recentTitle, { color: theme.colors.textPrimary }]} numberOfLines={1}>
                            {win.title}
                          </Text>
                          <View style={styles.recentMetaRow}>
                            <Text style={[styles.recentMeta, { color: theme.colors.textMuted }]} numberOfLines={1}>
                              {meta}
                            </Text>
                            <Clock3 size={11} color={theme.colors.textMuted} />
                            <Text style={[styles.recentMeta, { color: theme.colors.textMuted }]} numberOfLines={1}>
                              {formatRelativeTime(win.createdAt)}
                            </Text>
                          </View>
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            </ScrollView>
          ) : (
            <View style={styles.loadingOnly}>
              <ActivityIndicator size="small" color={theme.colors.indigo[400]} />
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end" },
  sheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingTop: 8,
  },
  headerRow: {
    height: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerSide: { width: 40 },
  grabber: { width: 42, height: 5, borderRadius: 9999 },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  content: { paddingTop: 10, paddingBottom: 8 },
  hero: { flexDirection: "row", alignItems: "center", gap: 16 },
  heroAvatar: {
    width: 68,
    height: 68,
    borderRadius: 9999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  heroInitials: { fontSize: 20, fontWeight: "900", letterSpacing: 0.4 },
  heroText: { flex: 1, minWidth: 0 },
  name: { fontSize: 24, lineHeight: 30, fontWeight: "900" },
  handle: { fontSize: 14, lineHeight: 19, fontWeight: "800", marginTop: 1 },
  leaguePill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 9999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 10,
  },
  leaguePillText: { fontSize: 11, fontWeight: "900" },
  xpBand: {
    marginTop: 18,
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  xpValue: { fontSize: 28, lineHeight: 32, fontWeight: "900", fontVariant: ["tabular-nums"] },
  xpLabel: { fontSize: 11, lineHeight: 15, fontWeight: "900", letterSpacing: 0.7 },
  levelBadge: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  levelBadgeValue: { fontSize: 18, lineHeight: 21, fontWeight: "900", fontVariant: ["tabular-nums"] },
  levelBadgeLabel: { fontSize: 7, lineHeight: 9, fontWeight: "900", letterSpacing: 0.8 },
  statsGrid: { flexDirection: "row", gap: 8, marginTop: 10 },
  stat: { flex: 1, minWidth: 0, alignItems: "center", gap: 2 },
  statIcon: { height: 18, alignItems: "center", justifyContent: "center" },
  statValue: { fontSize: 18, lineHeight: 22, fontWeight: "900", fontVariant: ["tabular-nums"] },
  statLabel: { fontSize: 9, lineHeight: 12, fontWeight: "900", color: "#94a3b8", letterSpacing: 0.4 },
  weekCard: {
    marginTop: 12,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 10,
  },
  weekHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 2,
  },
  weekTitle: { fontSize: 13, lineHeight: 18, fontWeight: "900" },
  youPill: { borderRadius: 9999, paddingHorizontal: 7, paddingVertical: 3 },
  youPillText: { color: "#fff", fontSize: 8, fontWeight: "900", letterSpacing: 0.8 },
  sectionHeader: {
    marginTop: 20,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: { fontSize: 16, lineHeight: 21, fontWeight: "900" },
  recentList: { gap: 8 },
  recentRow: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  recentIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  recentText: { flex: 1, minWidth: 0 },
  recentTitle: { fontSize: 13, lineHeight: 18, fontWeight: "900" },
  recentMetaRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2, minWidth: 0 },
  recentMeta: { fontSize: 11, lineHeight: 15, fontWeight: "700" },
  error: { fontSize: 13, lineHeight: 19, fontWeight: "700", textAlign: "center", paddingVertical: 18 },
  empty: { fontSize: 13, lineHeight: 19, fontWeight: "700", textAlign: "center", paddingVertical: 18 },
  loadingOnly: { minHeight: 220, alignItems: "center", justifyContent: "center" },
});
