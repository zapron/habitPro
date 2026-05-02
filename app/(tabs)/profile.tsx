import { Text } from "../../src/components/AppText";
import {
  useCallback,
  useMemo,
  useState } from "react";
import type { ComponentType,
  ReactNode } from "react";
import {
  View,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Alert,
  Image,
} from "react-native";
import type { ImageStyle } from "react-native";
import Svg, { Circle, G } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { Settings, Zap, Globe, User, Target, Flame, LogOut, Crown } from "lucide-react-native";
import { Screen } from "../../src/components/Screen";
import { useTheme } from "../../src/context/ThemeContext";
import { useAuth } from "../../src/context/AuthContext";
import { usePremium } from "../../src/context/PremiumContext";
import { usePlusUpsell } from "../../src/context/PlusUpsellContext";
import { useHabitStore } from "../../src/store/habitStore";
import { isSupabaseConfigured } from "../../src/lib/env";
import { useAppVersion } from "../../src/context/AppVersionContext";
import { useRouter } from "expo-router";
import { SettingsModal } from "../../src/components/SettingsModal";
import { UsernameSetupFields } from "../../src/components/UsernameSetupFields";
import { HubListModal } from "../../src/components/HubListModal";
import type { AppTheme } from "../../src/styles/theme";
import type { MissionVisibility, MiniMission } from "../../src/types/habit";
import {
  weeklyCompeteScore,
  weeklyTierLabel,
  countDistinctHabitDaysThisWeek,
  countMiniCompletionsThisWeek,
} from "../../src/utils/weekStats";
import {
  lastNDaysHabitCheckInsPerDay,
  miniCompletionsByWeekBuckets,
  maxHabitStreak,
  totalLifetimeCheckIns,
  countActiveHabits,
  buildActivityChartA11ySummary,
  buildMiniWeekA11ySummary,
} from "../../src/utils/profileStats";
import { ProfileWeeklyPulse } from "../../src/components/profile/ProfileWeeklyPulse";
import { ProfileActivityChart } from "../../src/components/profile/ProfileActivityChart";
import { ProfileMiniWeekTrend } from "../../src/components/profile/ProfileMiniWeekTrend";
import { ProfileStatChips } from "../../src/components/profile/ProfileStatChips";
import { PlusBadge } from "../../src/components/PlusBadge";
import { useRefreshPremiumAccess } from "../../src/hooks/useRefreshPremiumAccess";

type HubSheetState =
  | null
  | { mode: "habits-all" }
  | { mode: "minis-all" }
  | { mode: "habits-filter"; visibility: MissionVisibility; status?: "active" | "done" }
  | { mode: "minis-filter"; visibility: MissionVisibility; status?: "live" | "done" };

type LucideIcon = ComponentType<{ size?: number; color?: string }>;

/** Single-line label that scales down on narrow tiles instead of wrapping. */
function FigureLabel({ color, children }: { color: string; children: string }) {
  return (
    <Text
      style={[hubVisStyles.figureLbl, { color }]}
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.62}
      maxFontSizeMultiplier={1.1}
    >
      {children}
    </Text>
  );
}

function VisibilityHabitColumn({
  theme,
  isDark,
  title,
  Icon,
  accent,
  active,
  done,
  onPressColumn,
  onPressActive,
  onPressDone,
}: {
  theme: AppTheme;
  isDark: boolean;
  title: string;
  Icon: LucideIcon;
  accent: string;
  active: number;
  done: number;
  onPressColumn?: () => void;
  onPressActive?: () => void;
  onPressDone?: () => void;
}) {
  const colStyle = [
    hubVisStyles.visCol,
    {
      borderColor: accent + "55",
      backgroundColor: isDark ? accent + "14" : accent + "10",
    },
  ];

  const inner = (
    <>
      <View style={hubVisStyles.visColHead}>
        <Icon size={14} color={accent} />
        <Text style={[hubVisStyles.visColTitle, { color: accent }]}>{title}</Text>
      </View>
      <View style={hubVisStyles.figureRow}>
        <TouchableOpacity
          style={[
            hubVisStyles.figureTile,
            { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceElevated },
          ]}
          onPress={onPressActive}
          activeOpacity={0.85}
          disabled={!onPressActive}
        >
          <FigureLabel color={theme.colors.textMuted}>ACTIVE</FigureLabel>
          <Text style={[hubVisStyles.figureNum, { color: theme.colors.textPrimary }]}>{active}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            hubVisStyles.figureTile,
            { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceElevated },
          ]}
          onPress={onPressDone}
          activeOpacity={0.85}
          disabled={!onPressDone}
        >
          <FigureLabel color={theme.colors.textMuted}>DONE</FigureLabel>
          <Text style={[hubVisStyles.figureNum, { color: theme.colors.textPrimary }]}>{done}</Text>
        </TouchableOpacity>
      </View>
    </>
  );

  if (onPressColumn) {
    return (
      <TouchableOpacity activeOpacity={0.92} onPress={onPressColumn} style={colStyle}>
        {inner}
      </TouchableOpacity>
    );
  }
  return <View style={colStyle}>{inner}</View>;
}

function VisibilityMiniColumn({
  theme,
  isDark,
  title,
  Icon,
  accent,
  live,
  completed,
  onPressColumn,
  onPressActive,
  onPressDone,
}: {
  theme: AppTheme;
  isDark: boolean;
  title: string;
  Icon: LucideIcon;
  accent: string;
  live: number;
  completed: number;
  onPressColumn?: () => void;
  onPressActive?: () => void;
  onPressDone?: () => void;
}) {
  const colStyle = [
    hubVisStyles.visCol,
    {
      borderColor: accent + "55",
      backgroundColor: isDark ? accent + "14" : accent + "10",
    },
  ];

  const inner = (
    <>
      <View style={hubVisStyles.visColHead}>
        <Icon size={14} color={accent} />
        <Text style={[hubVisStyles.visColTitle, { color: accent }]}>{title}</Text>
      </View>
      <View style={hubVisStyles.figureRow}>
        <TouchableOpacity
          style={[
            hubVisStyles.figureTile,
            { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceElevated },
          ]}
          onPress={onPressActive}
          activeOpacity={0.85}
          disabled={!onPressActive}
        >
          <FigureLabel color={theme.colors.textMuted}>LIVE</FigureLabel>
          <Text style={[hubVisStyles.figureNum, { color: theme.colors.amber[500] }]}>{live}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            hubVisStyles.figureTile,
            { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceElevated },
          ]}
          onPress={onPressDone}
          activeOpacity={0.85}
          disabled={!onPressDone}
        >
          <FigureLabel color={theme.colors.textMuted}>DONE</FigureLabel>
          <Text style={[hubVisStyles.figureNum, { color: theme.colors.textPrimary }]}>{completed}</Text>
        </TouchableOpacity>
      </View>
    </>
  );

  if (onPressColumn) {
    return (
      <TouchableOpacity activeOpacity={0.92} onPress={onPressColumn} style={colStyle}>
        {inner}
      </TouchableOpacity>
    );
  }
  return <View style={colStyle}>{inner}</View>;
}

const hubVisStyles = StyleSheet.create({
  visCol: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    padding: 10,
    gap: 10,
  },
  visColHead: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 },
  visColTitle: { fontSize: 11, fontWeight: "900", letterSpacing: 0.8 },
  figureRow: { flexDirection: "row", gap: 6 },
  figureTile: {
    flex: 1,
    minWidth: 0,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 5,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  figureLbl: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.12,
    textAlign: "center",
    width: "100%",
  },
  figureNum: { fontSize: 20, fontWeight: "900", fontVariant: ["tabular-nums"] },
});

const RING_SIZE = 102;
const RING_STROKE = 4;

function hexToRgba(hex: string | undefined | null, a: number): string {
  const raw = typeof hex === "string" ? hex : "#6366f1";
  const h = raw.replace("#", "").trim();
  if (h.length !== 6) return `rgba(99,102,241,${a})`;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

function LevelXpRing({
  level,
  xpInLevel,
  theme,
  isDark,
  children,
}: {
  level: number;
  xpInLevel: number;
  theme: AppTheme;
  isDark: boolean;
  children: ReactNode;
}) {
  const c = RING_SIZE / 2;
  const r = (RING_SIZE - RING_STROKE) / 2 - 1;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(1, Math.max(0, xpInLevel / 100));

  const levelPalette = [
    theme.colors.indigo[500],
    theme.colors.cyan[400],
    theme.colors.amber[500],
    theme.colors.green[500],
    theme.colors.red[500],
    theme.colors.yellow[400],
  ] as const;
  const levelColor =
    levelPalette[Math.abs(level) % levelPalette.length] ?? theme.colors.indigo[500];
  const track = hexToRgba(levelColor, isDark ? 0.22 : 0.16);
  return (
    <View style={{ width: RING_SIZE, height: RING_SIZE, alignItems: "center", justifyContent: "center" }}>
      <Svg width={RING_SIZE} height={RING_SIZE} style={StyleSheet.absoluteFill}>
        <G transform={`rotate(-90 ${c} ${c})`}>
          <Circle cx={c} cy={c} r={r} stroke={track} strokeWidth={RING_STROKE} fill="none" />
          <Circle
            cx={c}
            cy={c}
            r={r}
            stroke={levelColor}
            strokeWidth={RING_STROKE}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${circ} ${circ}`}
            strokeDashoffset={circ * (1 - pct)}
          />
        </G>
      </Svg>
      {children}
    </View>
  );
}

export default function ProfileScreen() {
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { session, signOut } = useAuth();
  const { isPremium } = usePremium();
  const { openUpsell } = usePlusUpsell();
  const refreshPremiumAccess = useRefreshPremiumAccess();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [hubSheet, setHubSheet] = useState<HubSheetState>(null);
  const xp = useHabitStore((s) => s.xp);
  const username = useHabitStore((s) => s.username);
  const habits = useHabitStore((s) => s.habits);
  const miniMissions = useHabitStore((s) => s.miniMissions);

  useFocusEffect(
    useCallback(() => {
      void refreshPremiumAccess();
    }, [refreshPremiumAccess]),
  );

  const level = Math.floor(xp / 100);
  const xpInLevel = xp % 100;

  const missionStats = useMemo(() => {
    const visibilityBucket = (v: string | undefined): "public" | "solo" =>
      v === "public" ? "public" : "solo";

    const habitDone = (h: (typeof habits)[0]) => h.isCompleted;
    const habitActive = (h: (typeof habits)[0]) => !h.isCompleted;
    const miniDone = (m: (typeof miniMissions)[0]) => m.status === "completed";
    const miniLive = (m: (typeof miniMissions)[0]) =>
      m.status === "in_progress" || m.status === "pending" || m.status === "scheduled";

    let pubHabitsDone = 0;
    let pubHabitsActive = 0;
    let soloHabitsDone = 0;
    let soloHabitsActive = 0;
    for (const h of habits) {
      const bucket = visibilityBucket(h.visibility);
      if (habitDone(h)) {
        if (bucket === "public") pubHabitsDone += 1;
        else soloHabitsDone += 1;
      } else if (habitActive(h)) {
        if (bucket === "public") pubHabitsActive += 1;
        else soloHabitsActive += 1;
      }
    }

    let pubMiniDone = 0;
    let pubMiniLive = 0;
    let soloMiniDone = 0;
    let soloMiniLive = 0;
    for (const m of miniMissions) {
      const bucket = visibilityBucket(m.visibility);
      if (miniDone(m)) {
        if (bucket === "public") pubMiniDone += 1;
        else soloMiniDone += 1;
      } else if (miniLive(m)) {
        if (bucket === "public") pubMiniLive += 1;
        else soloMiniLive += 1;
      }
    }

    return {
      habitsTotal: habits.length,
      minisTotal: miniMissions.length,
      pub: {
        habitsDone: pubHabitsDone,
        habitsActive: pubHabitsActive,
        miniDone: pubMiniDone,
        miniLive: pubMiniLive,
      },
      solo: {
        habitsDone: soloHabitsDone,
        habitsActive: soloHabitsActive,
        miniDone: soloMiniDone,
        miniLive: soloMiniLive,
      },
    };
  }, [habits, miniMissions]);

  const insights = useMemo(() => {
    const weeklyScore = weeklyCompeteScore(habits, miniMissions, level);
    const tier = weeklyTierLabel(weeklyScore);
    const habitDaysThisWeek = countDistinctHabitDaysThisWeek(habits);
    const miniCompletionsThisWeek = countMiniCompletionsThisWeek(miniMissions);
    const activityPoints = lastNDaysHabitCheckInsPerDay(habits, 7);
    const miniWeekBuckets = miniCompletionsByWeekBuckets(miniMissions, 4);
    return {
      weeklyScore,
      tier,
      habitDaysThisWeek,
      miniCompletionsThisWeek,
      activityPoints,
      miniWeekBuckets,
      maxStreak: maxHabitStreak(habits),
      activeHabits: countActiveHabits(habits),
      lifetimeCheckIns: totalLifetimeCheckIns(habits),
      activityA11y: buildActivityChartA11ySummary(activityPoints),
      miniA11y: buildMiniWeekA11ySummary(miniWeekBuckets),
    };
  }, [habits, miniMissions, level]);

  const hubModalContent = useMemo(() => {
    if (!hubSheet) return null;
    const visOf = (v: string | undefined): MissionVisibility => (v === "public" ? "public" : "solo");
    const miniLiveFn = (m: MiniMission) =>
      m.status === "in_progress" || m.status === "pending" || m.status === "scheduled";

    if (hubSheet.mode === "habits-all") {
      return {
        title: "All habits",
        variant: "habits" as const,
        items: habits,
        emptyHint: "No habits yet. Start one from the home tab.",
      };
    }
    if (hubSheet.mode === "minis-all") {
      return {
        title: "All mini missions",
        variant: "minis" as const,
        items: miniMissions,
        emptyHint: "No mini missions yet. Open Mini Missions from home.",
      };
    }
    if (hubSheet.mode === "habits-filter") {
      const { visibility, status } = hubSheet;
      const filtered = habits.filter((h) => {
        if (visOf(h.visibility) !== visibility) return false;
        if (status === "active") return !h.isCompleted;
        if (status === "done") return h.isCompleted;
        return true;
      });
      const visLabel = visibility === "public" ? "Public" : "Solo";
      let title = `Habits · ${visLabel}`;
      if (status === "active") title += " · Active";
      if (status === "done") title += " · Done";
      const emptyHint =
        status === "active"
          ? `No active habits in ${visLabel.toLowerCase()}.`
          : status === "done"
            ? `No completed habits in ${visLabel.toLowerCase()}.`
            : `No habits in ${visLabel.toLowerCase()}.`;
      return { title, variant: "habits" as const, items: filtered, emptyHint };
    }
    if (hubSheet.mode === "minis-filter") {
      const { visibility, status } = hubSheet;
      const filtered = miniMissions.filter((m) => {
        if (visOf(m.visibility) !== visibility) return false;
        if (status === "live") return miniLiveFn(m);
        if (status === "done") return m.status === "completed";
        return true;
      });
      const visLabel = visibility === "public" ? "Public" : "Solo";
      let title = `Mini missions · ${visLabel}`;
      if (status === "live") title += " · Active";
      if (status === "done") title += " · Done";
      const emptyHint =
        status === "live"
          ? `No active mini missions in ${visLabel.toLowerCase()}.`
          : status === "done"
            ? `No completed mini missions in ${visLabel.toLowerCase()}.`
            : `No mini missions in ${visLabel.toLowerCase()}.`;
      return { title, variant: "minis" as const, items: filtered, emptyHint };
    }
    return null;
  }, [hubSheet, habits, miniMissions]);

  const bottomPad = Math.max(insets.bottom, 16) + 8;
  const showAccount = isSupabaseConfigured();
  const appVersion = useAppVersion();
  const router = useRouter();

  return (
    <Screen>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={theme.colors.background} />

      <View style={styles.headerRow}>
        <View>
          <View style={styles.profileTitleRow}>
            <Text style={[styles.title, { color: theme.colors.textPrimary, fontSize: theme.typography.h1 }]}>Profile</Text>
            {!isPremium ? <PlusBadge withFlame /> : null}
          </View>
          <Text style={[styles.subtitle, { color: theme.colors.textSecondary, fontSize: theme.typography.caption }]}>
            Your progress at a glance
          </Text>
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {showAccount && session?.user ? (
            <TouchableOpacity
              onPress={() => {
                Alert.alert("Sign out", "You will need to sign in again to continue.", [
                  { text: "Cancel", style: "cancel" },
                  { text: "Sign out", style: "destructive", onPress: () => void signOut() },
                ]);
              }}
              style={[styles.gearBtn, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
              activeOpacity={0.85}
              accessibilityLabel="Sign out"
            >
              <LogOut size={20} color={theme.colors.red[500]} />
            </TouchableOpacity>
          ) : null}
          {showAccount && session?.user ? (
            <TouchableOpacity
              onPress={() => router.push("/membership")}
              style={[styles.gearBtn, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
              activeOpacity={0.85}
              accessibilityLabel="Membership"
            >
              <Crown size={20} color={theme.colors.indigo[400]} />
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            onPress={() => setSettingsOpen(true)}
            style={[styles.gearBtn, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
            activeOpacity={0.85}
          >
            <Settings size={20} color={theme.colors.textPrimary} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: bottomPad }}>
        <View style={[styles.hero, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, ...theme.shadow.card }]}>
          <LevelXpRing level={level} xpInLevel={xpInLevel} theme={theme} isDark={isDark}>
            <View
              style={[
                styles.levelOrb,
                {
                  borderColor: theme.colors.border,
                  ...theme.shadow.glow,
                },
              ]}
            >
              <Image
                source={require("../../assets/habitpro-logo-transparent-v3.png")}
                style={styles.heroLogo as ImageStyle}
                resizeMode="contain"
                accessibilityLabel="HabitPro logo"
              />
              <View
                style={[
                  styles.levelBadge,
                  {
                    backgroundColor: theme.colors.surface,
                    borderColor: theme.colors.border,
                  },
                ]}
              >
                <Text style={[styles.levelBadgeText, { color: theme.colors.textPrimary }]}>
                  {level}
                </Text>
              </View>
            </View>
          </LevelXpRing>
          <View style={styles.heroText}>
            <Text style={[styles.levelInline, { color: theme.colors.textMuted }]}>Level {level}</Text>
            <View style={styles.xpLine}>
              <Zap size={16} color={theme.colors.yellow[400]} fill={theme.colors.yellow[400]} />
              <Text style={[styles.xpBig, { color: theme.colors.textPrimary }]}>
                {xpInLevel} / 100 <Text style={{ color: theme.colors.textMuted, fontWeight: "600" }}>XP this level</Text>
              </Text>
            </View>
            <Text style={[styles.totalXp, { color: theme.colors.textSecondary }]}>Total XP: {xp}</Text>
            {showAccount && username ? (
              <Text style={[styles.handle, { color: theme.colors.cyan[400] }]} numberOfLines={1}>
                @{username}
              </Text>
            ) : showAccount && session?.user ? (
              <UsernameSetupFields compact />
            ) : null}
            {isPremium ? (
              <View style={styles.plusActiveRow}>
                <PlusBadge withFlame />
                <Text style={[styles.plusActiveText, { color: theme.colors.textMuted }]}>Active</Text>
              </View>
            ) : null}
          </View>
        </View>

        {!isPremium ? (
          <TouchableOpacity
            style={[
              styles.plusCard,
              { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, ...theme.shadow.card },
            ]}
            activeOpacity={0.88}
            onPress={() => openUpsell("profile")}
            accessibilityRole="button"
            accessibilityLabel="View HabitPro Community"
          >
            <PlusBadge withFlame size="md" />
            <Text style={[styles.plusCardTitle, { color: theme.colors.textPrimary }]}>Unlock social features</Text>
            <Text style={[styles.plusCardBody, { color: theme.colors.textSecondary }]}>
              Group missions, invites, squad nudges, and Community posting are part of HabitPro Community.
            </Text>
            <Text style={[styles.plusCardCta, { color: theme.colors.indigo[400] }]}>View HabitPro Community</Text>
          </TouchableOpacity>
        ) : null}

        <Text style={[styles.sectionLabel, { color: theme.colors.textMuted }]}>INSIGHTS</Text>

        <ProfileWeeklyPulse
          theme={theme}
          isDark={isDark}
          weeklyScore={insights.weeklyScore}
          tierLabel={insights.tier.label}
          tierDetail={insights.tier.detail}
          habitDaysThisWeek={insights.habitDaysThisWeek}
          miniCompletionsThisWeek={insights.miniCompletionsThisWeek}
        />

        <ProfileActivityChart
          theme={theme}
          isDark={isDark}
          points={insights.activityPoints}
          accessibilityLabel={insights.activityA11y}
        />

        <ProfileMiniWeekTrend
          theme={theme}
          isDark={isDark}
          buckets={insights.miniWeekBuckets}
          accessibilityLabel={insights.miniA11y}
        />

        <ProfileStatChips
          theme={theme}
          isDark={isDark}
          maxStreak={insights.maxStreak}
          activeHabits={insights.activeHabits}
          lifetimeCheckIns={insights.lifetimeCheckIns}
        />

        <Text style={[styles.sectionLabel, { color: theme.colors.textMuted }]}>YOUR HABITS</Text>

        <View
          style={[
            styles.missionCard,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
              ...theme.shadow.card,
            },
          ]}
        >
          <TouchableOpacity
            style={styles.cardHeaderRow}
            onPress={() => setHubSheet({ mode: "habits-all" })}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="View all habits"
          >
            <View style={styles.cardHeaderMain}>
              <Target size={18} color={theme.colors.cyan[400]} />
              <Text style={[styles.cardHeaderTitle, { color: theme.colors.textPrimary }]}>Habits</Text>
            </View>
            <Text style={[styles.cardHeaderTotal, { color: theme.colors.textPrimary }]}>{missionStats.habitsTotal}</Text>
          </TouchableOpacity>
          <View
            style={[
              styles.cardInner,
              {
                backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(15, 23, 42, 0.04)",
              },
            ]}
          >
            <View style={[styles.hubVisRow, { gap: 10 }]}>
              <VisibilityHabitColumn
                theme={theme}
                isDark={isDark}
                title="Public"
                Icon={Globe}
                accent={theme.colors.cyan[400]}
                active={missionStats.pub.habitsActive}
                done={missionStats.pub.habitsDone}
                onPressColumn={() => setHubSheet({ mode: "habits-filter", visibility: "public" })}
                onPressActive={() => setHubSheet({ mode: "habits-filter", visibility: "public", status: "active" })}
                onPressDone={() => setHubSheet({ mode: "habits-filter", visibility: "public", status: "done" })}
              />
              <VisibilityHabitColumn
                theme={theme}
                isDark={isDark}
                title="Solo"
                Icon={User}
                accent={theme.colors.indigo[400]}
                active={missionStats.solo.habitsActive}
                done={missionStats.solo.habitsDone}
                onPressColumn={() => setHubSheet({ mode: "habits-filter", visibility: "solo" })}
                onPressActive={() => setHubSheet({ mode: "habits-filter", visibility: "solo", status: "active" })}
                onPressDone={() => setHubSheet({ mode: "habits-filter", visibility: "solo", status: "done" })}
              />
            </View>
          </View>
        </View>

        <Text style={[styles.sectionLabel, { color: theme.colors.textMuted }]}>MINI MISSIONS</Text>

        <View
          style={[
            styles.missionCard,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
              ...theme.shadow.card,
            },
          ]}
        >
          <TouchableOpacity
            style={styles.cardHeaderRow}
            onPress={() => setHubSheet({ mode: "minis-all" })}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="View all mini missions"
          >
            <View style={styles.cardHeaderMain}>
              <Flame size={18} color={theme.colors.amber[500]} />
              <Text style={[styles.cardHeaderTitle, { color: theme.colors.textPrimary }]}>Mini missions</Text>
            </View>
            <Text style={[styles.cardHeaderTotal, { color: theme.colors.textPrimary }]}>{missionStats.minisTotal}</Text>
          </TouchableOpacity>
          <View
            style={[
              styles.cardInner,
              {
                backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(15, 23, 42, 0.04)",
              },
            ]}
          >
            <View style={[styles.hubVisRow, { gap: 10 }]}>
              <VisibilityMiniColumn
                theme={theme}
                isDark={isDark}
                title="Public"
                Icon={Globe}
                accent={theme.colors.cyan[400]}
                live={missionStats.pub.miniLive}
                completed={missionStats.pub.miniDone}
                onPressColumn={() => setHubSheet({ mode: "minis-filter", visibility: "public" })}
                onPressActive={() => setHubSheet({ mode: "minis-filter", visibility: "public", status: "live" })}
                onPressDone={() => setHubSheet({ mode: "minis-filter", visibility: "public", status: "done" })}
              />
              <VisibilityMiniColumn
                theme={theme}
                isDark={isDark}
                title="Solo"
                Icon={User}
                accent={theme.colors.indigo[400]}
                live={missionStats.solo.miniLive}
                completed={missionStats.solo.miniDone}
                onPressColumn={() => setHubSheet({ mode: "minis-filter", visibility: "solo" })}
                onPressActive={() => setHubSheet({ mode: "minis-filter", visibility: "solo", status: "live" })}
                onPressDone={() => setHubSheet({ mode: "minis-filter", visibility: "solo", status: "done" })}
              />
            </View>
          </View>
        </View>

        <Text style={[styles.sectionLabel, { color: theme.colors.textMuted, marginTop: 4, opacity: 0.85 }]}>APP VERSION</Text>
        <View
          style={[
            styles.versionCard,
            { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, ...theme.shadow.card },
          ]}
        >
          <Text style={[styles.versionPrimary, { color: theme.colors.textPrimary }]}>
            v{appVersion.currentVersion}
            {appVersion.nativeBuildLabel ? ` (${appVersion.nativeBuildLabel})` : ""}
          </Text>
        </View>
      </ScrollView>

      {hubModalContent && hubModalContent.variant === "habits" ? (
        <HubListModal
          visible={hubSheet !== null}
          onClose={() => setHubSheet(null)}
          title={hubModalContent.title}
          emptyHint={hubModalContent.emptyHint}
          variant="habits"
          items={hubModalContent.items}
        />
      ) : hubModalContent && hubModalContent.variant === "minis" ? (
        <HubListModal
          visible={hubSheet !== null}
          onClose={() => setHubSheet(null)}
          title={hubModalContent.title}
          emptyHint={hubModalContent.emptyHint}
          variant="minis"
          items={hubModalContent.items}
        />
      ) : null}

      <SettingsModal visible={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 20,
  },
  profileTitleRow: { flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" },
  title: { fontWeight: "800", marginBottom: 4 },
  subtitle: {},
  gearBtn: {
    width: 44,
    height: 44,
    borderRadius: 9999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  hero: {
    flexDirection: "row",
    borderRadius: 18,
    borderWidth: 1,
    padding: 18,
    marginBottom: 22,
    gap: 16,
    alignItems: "center",
  },
  levelOrb: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 3,
    alignItems: "center",
    justifyContent: "center",
  },
  heroLogo: { width: 86, height: 86 },
  levelHuge: { fontSize: 32, fontWeight: "900" },
  levelTag: { fontSize: 9, fontWeight: "800", letterSpacing: 1 },
  heroText: { flex: 1, gap: 6 },
  levelInline: { fontSize: 12, fontWeight: "900", letterSpacing: 0.6, marginBottom: 2 },
  levelBadge: {
    position: "absolute",
    left: "50%",
    top: "50%",
    minWidth: 34,
    height: 34,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 9,
    transform: [{ translateX: -17 }, { translateY: -17 }],
  },
  levelBadgeText: { fontSize: 14, fontWeight: "900", fontVariant: ["tabular-nums"] },
  xpLine: { flexDirection: "row", alignItems: "center", gap: 8 },
  xpBig: { fontSize: 17, fontWeight: "800" },
  totalXp: { fontSize: 13 },
  handle: { fontSize: 15, fontWeight: "800", marginTop: 4 },
  plusActiveRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 },
  plusActiveText: { fontSize: 12, fontWeight: "800", letterSpacing: 0.1 },
  plusCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    marginBottom: 22,
  },
  plusCardTitle: { fontSize: 16, fontWeight: "900", letterSpacing: -0.2, marginTop: 10 },
  plusCardBody: { fontSize: 13, lineHeight: 19, fontWeight: "600", marginBottom: 10 },
  plusCardCta: { fontSize: 13, fontWeight: "900" },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
    marginBottom: 10,
  },
  missionCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    marginBottom: 20,
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
    gap: 12,
  },
  cardHeaderMain: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1, minWidth: 0 },
  cardHeaderTitle: { fontSize: 17, fontWeight: "800" },
  cardHeaderTotal: {
    fontSize: 34,
    fontWeight: "900",
    fontVariant: ["tabular-nums"],
    lineHeight: 38,
  },
  cardInner: {
    borderRadius: 14,
    padding: 14,
  },
  hubVisRow: { flexDirection: "row" },
  versionCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    marginBottom: 8,
  },
  versionPrimary: { fontSize: 13, fontWeight: "700", opacity: 0.92 },
});
