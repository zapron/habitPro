import { Text } from "../../src/components/AppText";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState } from "react";
import type { ComponentType } from "react";
import {
  View,
  Animated,
  Easing,
  Modal,
  ScrollView,
  Pressable,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Alert,
  Image,
} from "react-native";
import type { ImageStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import {
  Activity,
  BarChart3,
  ChevronRight,
  Flame,
  Gauge,
  Globe,
  Info,
  LogOut,
  Settings,
  ShieldCheck,
  Target,
  TrendingUp,
  User,
  X,
  Zap,
  Crown,
} from "lucide-react-native";
import { Screen } from "../../src/components/Screen";
import { useTheme } from "../../src/context/ThemeContext";
import { useAuth } from "../../src/context/AuthContext";
import { usePremium } from "../../src/context/PremiumContext";
import { usePlusUpsell } from "../../src/context/PlusUpsellContext";
import { useToast } from "../../src/context/ToastContext";
import { useHabitStore } from "../../src/store/habitStore";
import { useShallow } from "zustand/react/shallow";
import { isSupabaseConfigured } from "../../src/lib/env";
import {
  listAccountDeletedMissionIds,
  listAccountSnapshotBackups,
  type AccountBackupSnapshot,
  type AccountDeletedMissionIds,
} from "../../src/lib/accountBackup";
import { requestRemoteSync } from "../../src/lib/syncQueue";
import { useAppVersion } from "../../src/context/AppVersionContext";
import { useRouter } from "expo-router";
import { SettingsModal } from "../../src/components/SettingsModal";
import { UsernameSetupFields } from "../../src/components/UsernameSetupFields";
import { HubListModal } from "../../src/components/HubListModal";
import { LazyMount } from "../../src/components/LazyMount";
import { LevelXpRing } from "../../src/components/LevelXpRing";
import type { AppTheme } from "../../src/styles/theme";
import type { Habit, MissionVisibility, MiniMission, StreakMemory } from "../../src/types/habit";
import { getDerivedState } from "../../src/utils/habitDerived";
import { mergeRepairIntoStreakMemory } from "../../src/utils/repairStreakMemoryMerge";
import {
  lastNDaysHabitCheckInsPerDay,
  buildActivityChartA11ySummary,
} from "../../src/utils/profileStats";
import { buildProfileIntelligence } from "../../src/utils/profileIntelligence";
import { isMiniMissionOpen, isMiniMissionRunning } from "../../src/utils/miniMissionTime";
import { PlusBadge } from "../../src/components/PlusBadge";
import { useRefreshPremiumAccess } from "../../src/hooks/useRefreshPremiumAccess";
import { XP_PER_LEVEL, levelFromTotalXp, xpInCurrentLevel } from "../../src/utils/xpLevel";

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

function formatBackupSavedAt(savedAt: string): string {
  const d = new Date(savedAt);
  if (Number.isNaN(d.getTime())) return "Recent snapshot";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function backupReasonLabel(reason: string): string {
  switch (reason) {
    case "auth-hydrate":
      return "After cloud load";
    case "pre-remote-push":
      return "Before cloud save";
    case "pre-focus-refresh":
      return "Before refresh";
    case "focus-refresh":
      return "After refresh";
    default:
      return "Safety snapshot";
  }
}

function backupSummary(backup: AccountBackupSnapshot): string {
  const level = levelFromTotalXp(backup.xp);
  return `${backup.habits.length} habits, ${backup.miniMissions.length} minis, Level ${level}`;
}

function countHabitCheckIns(habits: readonly Habit[]): number {
  return habits.reduce((total, habit) => total + new Set(habit.completedDates ?? []).size, 0);
}

function countHabitMemoryEntries(habits: readonly Habit[]): number {
  return habits.reduce((total, habit) => total + Object.keys(habit.streakMemories ?? {}).length, 0);
}

function countCompletedMinis(minis: readonly MiniMission[]): number {
  return minis.reduce((total, mini) => total + (mini.status === "completed" ? 1 : 0), 0);
}

function formatOneDecimal(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return value % 1 === 0 ? String(value) : value.toFixed(1);
}

function clampDashboardScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

type ProfileInfoKey =
  | "growth"
  | "level"
  | "reliability"
  | "consistency"
  | "follow"
  | "momentum"
  | "velocity"
  | "recovery"
  | "reflection"
  | "focus"
  | "social"
  | "raw";

type ProfileInfoItem = {
  title: string;
  formula: string;
  body: string;
  improves: string[];
};

type ProfileModelInfoKey = Extract<
  ProfileInfoKey,
  "consistency" | "follow" | "momentum" | "velocity" | "recovery" | "reflection" | "focus" | "social"
>;

type ProfileModelCardConfig = {
  key: ProfileModelInfoKey;
  title: string;
  value: number;
  weight: string;
  color: string;
  detail: string;
};

const PROFILE_INFO: Record<ProfileInfoKey, ProfileInfoItem> = {
  growth: {
    title: "Growth index",
    formula: "25% Consistency + 20% Follow through + 15% Momentum + 12% Velocity + 10% Recovery + 8% Reflection + 5% Focus + 5% Social",
    body: "A blended score for how stable, active, recoverable, and reflective your habit system is right now.",
    improves: ["Mark active habits consistently.", "Finish stale minis.", "Add notes or proofs to meaningful wins."],
  },
  level: {
    title: "Level forecast",
    formula: "XP left / current weekly point pace",
    body: "This estimates how close you are to the next level using your current pace. When weekly pace is zero, the estimate waits for more activity.",
    improves: ["Complete one habit check in.", "Finish a mini mission.", "Keep small points flowing through the week."],
  },
  reliability: {
    title: "Reliability",
    formula: "Active days and check ins over the last 7 days",
    body: "Reliability shows whether your habit system is showing up across the week, not only how many total actions you completed.",
    improves: ["Spread progress across more days.", "Protect today's highest streak.", "Keep one daily action essential."],
  },
  consistency: {
    title: "Consistency",
    formula: "Active days in the last 7 days",
    body: "This measures how often you showed up, not how many things you stacked into one day.",
    improves: ["Check in once today.", "Protect the same time window tomorrow.", "Avoid bunching all progress into one day."],
  },
  follow: {
    title: "Follow through",
    formula: "Completed habit slots / expected habit slots",
    body: "This compares your actual habit marks against what your active missions expected by now.",
    improves: ["Prioritize due habits before starting new ones.", "Keep active commitment count manageable."],
  },
  momentum: {
    title: "Momentum",
    formula: "Weekly pace plus trend against last week",
    body: "Momentum rewards current weekly points and whether this week is moving up or down from the previous week.",
    improves: ["Recover one action when the trend is negative.", "Keep small daily points flowing."],
  },
  velocity: {
    title: "Velocity",
    formula: "Habit points + minis + completed mini minutes",
    body: "Velocity is your execution output. It catches both daily discipline and focused mini work.",
    improves: ["Finish one mini.", "Complete one habit slot.", "Choose a slightly deeper mini when you have time."],
  },
  recovery: {
    title: "Recovery",
    formula: "Squad saves help, repeated solo repairs reduce confidence",
    body: "Recovery is about how well the system survives misses without becoming dependent on repairs.",
    improves: ["Use squad saves when genuinely needed.", "Rebuild clean days after a repair.", "Reduce repeated solo repairs."],
  },
  reflection: {
    title: "Reflection",
    formula: "Proof logs / completed actions, boosted by public wins",
    body: "Reflection measures whether your journey has context you can learn from later.",
    improves: ["Add a short note after meaningful check ins.", "Save proof when the moment matters."],
  },
  focus: {
    title: "Focus load",
    formula: "Active habits + open minis near an ideal load",
    body: "Too little load becomes idle. Too much load becomes noisy. This score rewards a focused middle zone.",
    improves: ["Clear open minis.", "Avoid starting too many missions at once.", "Keep the next action obvious."],
  },
  social: {
    title: "Social energy",
    formula: "Public ratio and public wins",
    body: "This is a small part of the score. It recognizes accountability without turning profile health into popularity.",
    improves: ["Share only the wins you want public.", "Keep private work private when that helps you focus."],
  },
  raw: {
    title: "Raw inputs",
    formula: "The visible counters feeding the model",
    body: "These are the direct values behind the dashboard. They make the model auditable instead of mysterious.",
    improves: ["Use these to spot which exact input is holding the score back."],
  },
};

function getProfileInfoForMode(key: ProfileInfoKey, socialIncluded: boolean): ProfileInfoItem {
  if (key === "growth" && !socialIncluded) {
    return {
      ...PROFILE_INFO.growth,
      formula: "26% Consistency + 21% Follow through + 16% Momentum + 13% Velocity + 11% Recovery + 8% Reflection + 5% Focus",
      body: "Solo analytics use personal behavior only. Community social stats are not counted against your growth index.",
      improves: [
        "Mark active habits consistently.",
        "Finish stale minis.",
        "Add notes or proofs to meaningful wins.",
      ],
    };
  }
  return PROFILE_INFO[key];
}

function hasRecoverableMissionData(
  backup: AccountBackupSnapshot,
  currentHabits: readonly Habit[],
  currentMinis: readonly MiniMission[],
  deletedMissionIds: AccountDeletedMissionIds,
): boolean {
  const deletedHabitIds = new Set(deletedMissionIds.habitIds);
  const deletedMiniIds = new Set(deletedMissionIds.miniMissionIds);
  const backupHabits = backup.habits.filter((habit) => !deletedHabitIds.has(habit.id));
  const backupMinis = backup.miniMissions.filter((mini) => !deletedMiniIds.has(mini.id));
  return (
    countHabitCheckIns(backupHabits) > countHabitCheckIns(currentHabits) ||
    countHabitMemoryEntries(backupHabits) > countHabitMemoryEntries(currentHabits) ||
    countCompletedMinis(backupMinis) > countCompletedMinis(currentMinis)
  );
}

function userContentScore(memory: StreakMemory | undefined): number {
  if (!memory) return 0;
  return [
    memory.note?.trim(),
    memory.imageUri?.trim(),
    memory.imageUrl?.trim(),
    memory.checkInOnly === true ? "check in" : "",
  ].filter(Boolean).length;
}

function mergeCurrentRepairStateIntoBackupHabit(backupHabit: Habit, currentHabit: Habit | undefined): Habit {
  if (!currentHabit) return backupHabit;

  const repairDates = new Set<string>(currentHabit.repairedDates ?? []);
  for (const [dateStr, memory] of Object.entries(currentHabit.streakMemories ?? {})) {
    if (memory.repairSource) repairDates.add(dateStr);
  }
  if (repairDates.size === 0) return backupHabit;

  const completedDates = new Set(backupHabit.completedDates ?? []);
  const repairedDates = new Set(backupHabit.repairedDates ?? []);
  const streakMemories: Record<string, StreakMemory> = { ...(backupHabit.streakMemories ?? {}) };

  for (const dateStr of repairDates) {
    const currentMemory = currentHabit.streakMemories?.[dateStr];
    const source = currentMemory?.repairSource ?? streakMemories[dateStr]?.repairSource ?? "squad";

    if (currentHabit.completedDates.includes(dateStr) || currentMemory?.repairSource) {
      completedDates.add(dateStr);
    }
    repairedDates.add(dateStr);

    const backupMemory = streakMemories[dateStr];
    if (currentMemory?.repairSource && userContentScore(currentMemory) >= userContentScore(backupMemory)) {
      streakMemories[dateStr] = currentMemory;
    } else if (!backupMemory) {
      streakMemories[dateStr] = mergeRepairIntoStreakMemory(undefined, source);
    } else if (!backupMemory.repairSource) {
      streakMemories[dateStr] = { ...backupMemory, repairSource: source };
    }
  }

  const derived = getDerivedState(
    Array.from(completedDates),
    backupHabit.totalDays,
    backupHabit.missionReport,
  );

  return {
    ...backupHabit,
    completedDates: derived.normalized,
    repairedDates: Array.from(repairedDates).sort((a, b) => a.localeCompare(b)),
    streakMemories,
    totalDays: derived.totalDays,
    streak: derived.streak,
    isCompleted: derived.isCompleted,
    status: derived.status,
  };
}

function mergeCurrentRepairStateIntoBackup(
  backupHabits: readonly Habit[],
  currentHabits: readonly Habit[],
): { habits: Habit[]; preservedRepairCount: number } {
  const currentById = new Map(currentHabits.map((habit) => [habit.id, habit]));
  let preservedRepairCount = 0;
  const habits = backupHabits.map((backupHabit) => {
    const currentHabit = currentById.get(backupHabit.id);
    const before = new Set(backupHabit.repairedDates ?? []);
    for (const [dateStr, memory] of Object.entries(backupHabit.streakMemories ?? {})) {
      if (memory.repairSource) before.add(dateStr);
    }
    const merged = mergeCurrentRepairStateIntoBackupHabit(backupHabit, currentHabit);
    const after = new Set(merged.repairedDates ?? []);
    for (const [dateStr, memory] of Object.entries(merged.streakMemories ?? {})) {
      if (memory.repairSource) after.add(dateStr);
    }
    if (after.size > before.size) preservedRepairCount += after.size - before.size;
    return merged;
  });
  return { habits, preservedRepairCount };
}

const VisibilityHabitColumn = memo(function VisibilityHabitColumn({
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
      <View style={colStyle}>
        <Pressable onPress={onPressColumn} style={hubVisStyles.visColHead} accessibilityRole="button">
          <Icon size={14} color={accent} />
          <Text style={[hubVisStyles.visColTitle, { color: accent }]}>{title}</Text>
        </Pressable>
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
      </View>
    );
  }
  return <View style={colStyle}>{inner}</View>;
});

const VisibilityMiniColumn = memo(function VisibilityMiniColumn({
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
      <View style={colStyle}>
        <Pressable onPress={onPressColumn} style={hubVisStyles.visColHead} accessibilityRole="button">
          <Icon size={14} color={accent} />
          <Text style={[hubVisStyles.visColTitle, { color: accent }]}>{title}</Text>
        </Pressable>
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
      </View>
    );
  }
  return <View style={colStyle}>{inner}</View>;
});

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

function DashboardInfoButton({ color, onPress }: { color: string; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.78}
      style={[styles.infoButton, { borderColor: color + "55", backgroundColor: color + "12" }]}
      accessibilityRole="button"
      accessibilityLabel="Explain this stat"
    >
      <Info size={13} color={color} strokeWidth={2.5} />
    </TouchableOpacity>
  );
}

function AnimatedScoreBar({ value, color, trackColor }: { value: number; color: string; trackColor: string }) {
  const animated = useRef(new Animated.Value(0)).current;
  const safeValue = clampDashboardScore(value);

  useEffect(() => {
    Animated.timing(animated, {
      toValue: safeValue,
      duration: 720,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [animated, safeValue]);

  const width = animated.interpolate({
    inputRange: [0, 100],
    outputRange: ["0%", "100%"],
  });

  return (
    <View style={[styles.animatedTrack, { backgroundColor: trackColor }]}>
      <Animated.View style={[styles.animatedFill, { backgroundColor: color, width }]} />
    </View>
  );
}

function ModelScoreCard({
  title,
  value,
  weight,
  color,
  detail,
  theme,
  isDark,
  onInfo,
}: {
  title: string;
  value: number;
  weight: string;
  color: string;
  detail: string;
  theme: AppTheme;
  isDark: boolean;
  onInfo: () => void;
}) {
  return (
    <View
      style={[
        styles.modelScoreCard,
        {
          backgroundColor: isDark ? color + "12" : color + "0F",
          borderColor: color + "42",
        },
      ]}
    >
      <View style={styles.modelScoreHeader}>
        <View style={styles.modelScoreTitleWrap}>
          <Text style={[styles.modelScoreTitle, { color: theme.colors.textPrimary }]} numberOfLines={1}>
            {title}
          </Text>
          <Text style={[styles.modelScoreWeight, { color }]}>{weight}</Text>
        </View>
        <DashboardInfoButton color={color} onPress={onInfo} />
      </View>
      <View style={styles.modelScoreValueRow}>
        <Text style={[styles.modelScoreValue, { color }]}>{value}</Text>
        <Text style={[styles.modelScoreUnit, { color: theme.colors.textMuted }]}>/100</Text>
      </View>
      <AnimatedScoreBar
        value={value}
        color={color}
        trackColor={isDark ? "rgba(255,255,255,0.09)" : "rgba(15,23,42,0.08)"}
      />
      <Text style={[styles.modelScoreDetail, { color: theme.colors.textSecondary }]} numberOfLines={2}>
        {detail}
      </Text>
    </View>
  );
}

function RawStatTile({
  value,
  label,
  detail,
  color,
  theme,
  isDark,
}: {
  value: string | number;
  label: string;
  detail: string;
  color: string;
  theme: AppTheme;
  isDark: boolean;
}) {
  return (
    <View
      style={[
        styles.rawStatTile,
        {
          backgroundColor: isDark ? "rgba(255,255,255,0.035)" : "rgba(15,23,42,0.035)",
          borderColor: color + "3D",
        },
      ]}
    >
      <Text style={[styles.rawStatValue, { color }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.68}>
        {value}
      </Text>
      <Text style={[styles.rawStatLabel, { color: theme.colors.textPrimary }]} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[styles.rawStatDetail, { color: theme.colors.textMuted }]} numberOfLines={2}>
        {detail}
      </Text>
    </View>
  );
}

function InsightSignalCard({
  title,
  value,
  detail,
  color,
  theme,
  isDark,
  onInfo,
}: {
  title: string;
  value: string;
  detail: string;
  color: string;
  theme: AppTheme;
  isDark: boolean;
  onInfo: () => void;
}) {
  return (
    <View
      style={[
        styles.signalCard,
        {
          backgroundColor: isDark ? color + "12" : color + "0F",
          borderColor: color + "40",
        },
      ]}
    >
      <View style={styles.signalHeader}>
        <Text style={[styles.signalTitle, { color }]} numberOfLines={1}>
          {title}
        </Text>
        <DashboardInfoButton color={color} onPress={onInfo} />
      </View>
      <Text style={[styles.signalValue, { color: theme.colors.textPrimary }]} numberOfLines={1}>
        {value}
      </Text>
      <Text style={[styles.signalDetail, { color: theme.colors.textMuted }]} numberOfLines={2}>
        {detail}
      </Text>
    </View>
  );
}

function ProfileInfoSheet({
  info,
  theme,
  isDark,
  onClose,
}: {
  info: ProfileInfoItem | null;
  theme: AppTheme;
  isDark: boolean;
  onClose: () => void;
}) {
  return (
    <Modal visible={info !== null} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.infoSheetBackdrop} onPress={onClose}>
        <Pressable
          style={[
            styles.infoSheet,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <View style={styles.infoSheetHeader}>
            <View style={styles.infoSheetTitleBlock}>
              <Text style={[styles.infoSheetKicker, { color: theme.colors.indigo[400] }]}>STAT GUIDE</Text>
              <Text style={[styles.infoSheetTitle, { color: theme.colors.textPrimary }]}>{info?.title ?? ""}</Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              activeOpacity={0.78}
              style={[
                styles.infoSheetClose,
                { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceElevated },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Close stat guide"
            >
              <X size={18} color={theme.colors.textPrimary} strokeWidth={2.5} />
            </TouchableOpacity>
          </View>
          <View
            style={[
              styles.infoFormulaBox,
              {
                backgroundColor: isDark ? "rgba(99,102,241,0.13)" : "rgba(79,70,229,0.08)",
                borderColor: theme.colors.border,
              },
            ]}
          >
            <Text style={[styles.infoFormulaLabel, { color: theme.colors.textMuted }]}>Formula</Text>
            <Text style={[styles.infoFormulaText, { color: theme.colors.textPrimary }]}>{info?.formula ?? ""}</Text>
          </View>
          <Text style={[styles.infoSheetBody, { color: theme.colors.textSecondary }]}>{info?.body ?? ""}</Text>
          <View style={styles.infoImproveList}>
            {(info?.improves ?? []).map((item, index) => (
              <View key={`${item}-${index}`} style={styles.infoImproveRow}>
                <View style={[styles.infoImproveDot, { backgroundColor: theme.colors.cyan[400] }]} />
                <Text style={[styles.infoImproveText, { color: theme.colors.textPrimary }]}>{item}</Text>
              </View>
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default function ProfileScreen() {
  const { theme, isDark } = useTheme();
  const { showToast } = useToast();
  const insets = useSafeAreaInsets();
  const { session, signOut, syncReady, syncError, retryHydrate } = useAuth();
  const { isPremium } = usePremium();
  const { openUpsell } = usePlusUpsell();
  const refreshPremiumAccess = useRefreshPremiumAccess();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [hubSheet, setHubSheet] = useState<HubSheetState>(null);
  const [infoSheet, setInfoSheet] = useState<ProfileInfoKey | null>(null);
  const [miniClockNow, setMiniClockNow] = useState(() => Date.now());
  const [backups, setBackups] = useState<AccountBackupSnapshot[]>([]);
  const [deletedMissionIds, setDeletedMissionIds] = useState<AccountDeletedMissionIds>({
    habitIds: [],
    miniMissionIds: [],
  });
  const [restoringBackupAt, setRestoringBackupAt] = useState<string | null>(null);
  const { rawXp, rawUsername, rawHabits, rawMiniMissions } = useHabitStore(
    useShallow((s) => ({
      rawXp: s.xp,
      rawUsername: s.username,
      rawHabits: s.habits,
      rawMiniMissions: s.miniMissions,
    })),
  );
  const showAccount = isSupabaseConfigured();
  const accountHydrating = Boolean(showAccount && session?.user && !syncReady && !syncError);
  const cloudSyncBlocked = Boolean(showAccount && session?.user && syncError);
  const xp = accountHydrating ? 0 : rawXp;
  const username = accountHydrating ? null : rawUsername;
  const habits = useMemo(() => (accountHydrating ? [] : rawHabits), [accountHydrating, rawHabits]);
  const miniMissions = useMemo(
    () => (accountHydrating ? [] : rawMiniMissions),
    [accountHydrating, rawMiniMissions],
  );
  const profileIsPremium = !accountHydrating && isPremium;

  const loadBackups = useCallback(async () => {
    const userId = session?.user?.id ?? null;
    if (!userId) {
      setBackups([]);
      setDeletedMissionIds({ habitIds: [], miniMissionIds: [] });
      return;
    }
    const [nextBackups, nextDeletedIds] = await Promise.all([
      listAccountSnapshotBackups(userId),
      listAccountDeletedMissionIds(userId),
    ]);
    setBackups(nextBackups);
    setDeletedMissionIds(nextDeletedIds);
  }, [session?.user?.id]);

  useFocusEffect(
    useCallback(() => {
      setMiniClockNow(Date.now());
      void refreshPremiumAccess({ serverOnly: true, cachedAccessOk: true, background: true });
      void loadBackups();
    }, [loadBackups, refreshPremiumAccess]),
  );

  useEffect(() => {
    if (!miniMissions.some((mini) => isMiniMissionRunning(mini, miniClockNow))) return;
    const timer = setInterval(() => setMiniClockNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, [miniClockNow, miniMissions]);

  const level = levelFromTotalXp(xp);
  const xpInLevel = xpInCurrentLevel(xp);
  const recoveryBackups = useMemo(() => {
    if (cloudSyncBlocked) return backups.slice(0, 3);
    return backups
      .filter((backup) => hasRecoverableMissionData(backup, rawHabits, rawMiniMissions, deletedMissionIds))
      .slice(0, 3);
  }, [backups, cloudSyncBlocked, deletedMissionIds, rawHabits, rawMiniMissions]);
  const showRecoveryBackups = Boolean(showAccount && session?.user && recoveryBackups.length > 0);

  const restoreBackup = useCallback(
    async (backup: AccountBackupSnapshot) => {
      const userId = session?.user?.id;
      if (!userId) return;
      setRestoringBackupAt(backup.savedAt);
      try {
        const deletedHabitIds = new Set(deletedMissionIds.habitIds);
        const deletedMiniIds = new Set(deletedMissionIds.miniMissionIds);
        const backupHabitsToRestore = backup.habits.filter((habit) => !deletedHabitIds.has(habit.id));
        const backupMinisToRestore = backup.miniMissions.filter((mini) => !deletedMiniIds.has(mini.id));
        const { habits: restoredHabits, preservedRepairCount } = mergeCurrentRepairStateIntoBackup(
          backupHabitsToRestore,
          rawHabits,
        );
        useHabitStore.setState({
          habits: restoredHabits,
          miniMissions: backupMinisToRestore,
          xp: preservedRepairCount > 0 && backup.xp > rawXp ? rawXp : backup.xp,
          username: backup.username,
          cohortPeerHabits: [],
        });
        if (syncReady && !syncError) {
          requestRemoteSync({ immediate: true });
          showToast("Backup restored and queued for cloud save.", "success");
        } else {
          showToast("Backup restored locally. Retry Sync when your connection is stable.", "info");
        }
        await loadBackups();
      } finally {
        setRestoringBackupAt(null);
      }
    },
    [deletedMissionIds, loadBackups, rawHabits, rawXp, session?.user?.id, showToast, syncError, syncReady],
  );

  const confirmRestoreBackup = useCallback(
    (backup: AccountBackupSnapshot) => {
      Alert.alert(
        "Restore this backup?",
        `${backupSummary(backup)}\n${formatBackupSavedAt(backup.savedAt)}\n\nThis replaces the account data currently on this device.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Restore",
            onPress: () => void restoreBackup(backup),
          },
        ],
      );
    },
    [restoreBackup],
  );

  const missionStats = useMemo(() => {
    const visibilityBucket = (v: string | undefined): "public" | "solo" =>
      v === "public" ? "public" : "solo";

    const habitDone = (h: (typeof habits)[0]) => h.isCompleted;
    const habitActive = (h: (typeof habits)[0]) => !h.isCompleted;
    const miniDone = (m: (typeof miniMissions)[0]) => m.status === "completed";
    const miniOpen = (m: (typeof miniMissions)[0]) => isMiniMissionOpen(m, miniClockNow);

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
    let pubMiniTotal = 0;
    let soloMiniDone = 0;
    let soloMiniLive = 0;
    let soloMiniTotal = 0;
    for (const m of miniMissions) {
      const bucket = visibilityBucket(m.visibility);
      if (bucket === "public") pubMiniTotal += 1;
      else soloMiniTotal += 1;
      if (miniDone(m)) {
        if (bucket === "public") pubMiniDone += 1;
        else soloMiniDone += 1;
      } else if (miniOpen(m)) {
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
        miniTotal: pubMiniTotal,
      },
      solo: {
        habitsDone: soloHabitsDone,
        habitsActive: soloHabitsActive,
        miniDone: soloMiniDone,
        miniLive: soloMiniLive,
        miniTotal: soloMiniTotal,
      },
    };
  }, [habits, miniClockNow, miniMissions]);

  const insights = useMemo(() => {
    const activityPoints = lastNDaysHabitCheckInsPerDay(habits, 7);
    return {
      activityPoints,
      activityA11y: buildActivityChartA11ySummary(activityPoints),
    };
  }, [habits]);

  const profileMath = useMemo(() => {
    return buildProfileIntelligence({
      habits,
      miniMissions,
      xpInLevel,
      level,
      missionStats,
      communityEnabled: profileIsPremium,
    });
  }, [habits, level, miniMissions, missionStats, profileIsPremium, xpInLevel]);

  const modelCards = useMemo(() => {
    const weights = profileMath.socialIncluded
      ? {
          consistency: "25%",
          follow: "20%",
          momentum: "15%",
          velocity: "12%",
          recovery: "10%",
          reflection: "8%",
          focus: "5%",
        }
      : {
          consistency: "26%",
          follow: "21%",
          momentum: "16%",
          velocity: "13%",
          recovery: "11%",
          reflection: "8%",
          focus: "5%",
        };
    const cards: ProfileModelCardConfig[] = [
      {
        key: "consistency" as const,
        title: "Consistency",
        value: profileMath.consistencyScore,
        weight: weights.consistency,
        color: theme.colors.cyan[400],
        detail: `${profileMath.activeDays}/7 active days. Best ${profileMath.bestDayLabel}.`,
      },
      {
        key: "follow" as const,
        title: "Follow through",
        value: profileMath.followThroughScore,
        weight: weights.follow,
        color: theme.colors.green[500],
        detail: `${profileMath.cleanCheckIns} clean check ins, ${profileMath.repairedCheckIns} repaired.`,
      },
      {
        key: "momentum" as const,
        title: "Momentum",
        value: profileMath.momentumScore,
        weight: weights.momentum,
        color: theme.colors.indigo[400],
        detail: `${profileMath.weeklyDelta >= 0 ? "+" : ""}${profileMath.weeklyDelta} points vs last week.`,
      },
      {
        key: "velocity" as const,
        title: "Velocity",
        value: profileMath.executionVelocityScore,
        weight: weights.velocity,
        color: theme.colors.amber[500],
        detail: `${profileMath.habitPoints} habit pts, ${profileMath.miniPoints} mini pts.`,
      },
      {
        key: "recovery" as const,
        title: "Recovery",
        value: profileMath.recoveryScore,
        weight: weights.recovery,
        color: profileMath.recoveryScore >= 70 ? theme.colors.green[500] : theme.colors.amber[500],
        detail: `${profileMath.squadSaves} squad saves, ${profileMath.soloRepairs} solo repairs.`,
      },
      {
        key: "reflection" as const,
        title: "Reflection",
        value: profileMath.reflectionScore,
        weight: weights.reflection,
        color: theme.colors.cyan[500],
        detail: `${profileMath.memoryProofs} proof logs, ${profileMath.reflectionRate}% memory density.`,
      },
      {
        key: "focus" as const,
        title: "Focus load",
        value: profileMath.focusLoadScore,
        weight: weights.focus,
        color: theme.colors.indigo[500],
        detail: `${profileMath.loadLabel} load with ${profileMath.miniLiveTotal} open minis.`,
      },
    ];
    if (profileMath.socialIncluded) {
      cards.push({
        key: "social" as const,
        title: "Social energy",
        value: profileMath.socialEnergyScore,
        weight: "5%",
        color: theme.colors.amber[500],
        detail: `${profileMath.publicMoments} public wins, ${profileMath.publicRatio}% public ratio.`,
      });
    }
    return cards;
  }, [profileMath, theme.colors.amber, theme.colors.cyan, theme.colors.green, theme.colors.indigo]);

  const rawStatTiles = useMemo(
    () => [
      {
        value: profileMath.weeklyScore,
        label: "Week pts",
        detail: `${profileMath.habitPoints} habit + ${profileMath.miniPoints} mini`,
        color: theme.colors.indigo[400],
      },
      {
        value: `${profileMath.activeDays}/7`,
        label: "Active days",
        detail: `${profileMath.consistency}% weekly consistency`,
        color: theme.colors.cyan[400],
      },
      {
        value: profileMath.maxStreak,
        label: "Best streak",
        detail: "Longest active run",
        color: theme.colors.amber[500],
      },
      {
        value: profileMath.lifetimeCheckIns,
        label: "Check-ins",
        detail: `${profileMath.cleanCheckIns} clean, ${profileMath.repairedCheckIns} repaired`,
        color: theme.colors.green[500],
      },
      {
        value: profileMath.memoryProofs,
        label: "Proof logs",
        detail: `${profileMath.reflectionRate}% of completed actions`,
        color: theme.colors.cyan[500],
      },
      {
        value: profileMath.socialIncluded ? profileMath.publicMoments : "Solo",
        label: profileMath.socialIncluded ? "Public wins" : "Community",
        detail: profileMath.socialIncluded ? `${profileMath.publicRatio}% shared commitments` : "Social score not counted",
        color: theme.colors.indigo[500],
      },
      {
        value: profileMath.miniCompletedMinutes,
        label: "Mini mins",
        detail: `${formatOneDecimal(profileMath.miniWeeklyAverage)}/wk average`,
        color: theme.colors.amber[500],
      },
      {
        value: profileMath.projectedWeekPoints,
        label: "Projection",
        detail: `${formatOneDecimal(profileMath.pointPacePerDay)} pts/day pace`,
        color: theme.colors.green[500],
      },
    ],
    [profileMath, theme.colors.amber, theme.colors.cyan, theme.colors.green, theme.colors.indigo],
  );

  const insightSignals = useMemo(
    () => [
      {
        title: profileMath.weeklyDelta >= 0 ? "Improving" : "Watch",
        value: `${profileMath.weeklyDelta >= 0 ? "+" : ""}${profileMath.weeklyDelta} pts`,
        detail: profileMath.weeklyDelta >= 0 ? "Weekly pace is ahead of last week." : "This week is behind last week's output.",
        color: profileMath.weeklyDelta >= 0 ? theme.colors.green[500] : theme.colors.amber[500],
        infoKey: "momentum" as const,
      },
      {
        title: "Risk",
        value: profileMath.missRisk,
        detail: profileMath.missRisk === "Low" ? "Your recent active day pattern is stable." : "A single check in today can reduce risk.",
        color: profileMath.missRisk === "Low" ? theme.colors.green[500] : theme.colors.amber[500],
        infoKey: "consistency" as const,
      },
      {
        title: "Focus",
        value: profileMath.loadLabel,
        detail: profileMath.loadLabel === "Heavy" ? "Clear open work before starting more." : "Your current load is manageable.",
        color: profileMath.loadLabel === "Heavy" ? theme.colors.amber[500] : theme.colors.cyan[400],
        infoKey: "focus" as const,
      },
    ],
    [profileMath, theme.colors.amber, theme.colors.cyan, theme.colors.green],
  );

  const hubModalContent = useMemo(() => {
    if (!hubSheet) return null;
    const visOf = (v: string | undefined): MissionVisibility => (v === "public" ? "public" : "solo");
    const miniLiveFn = (m: MiniMission) => isMiniMissionOpen(m, miniClockNow);

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
  }, [hubSheet, habits, miniClockNow, miniMissions]);

  const onHabitsPublicPress = useCallback(() => setHubSheet({ mode: "habits-filter", visibility: "public" }), []);
  const onHabitsSoloPress = useCallback(() => setHubSheet({ mode: "habits-filter", visibility: "solo" }), []);
  const onMinisSoloPress = useCallback(() => setHubSheet({ mode: "minis-filter", visibility: "solo" }), []);

  const bottomPad = Math.max(insets.bottom, 16) + 8;
  const appVersion = useAppVersion();
  const router = useRouter();

  return (
    <Screen>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={theme.colors.background} />

      <View style={styles.headerRow}>
        <View>
          <View style={styles.profileTitleRow}>
            <Text style={[styles.title, { color: theme.colors.textPrimary, fontSize: theme.typography.h1 }]}>Profile</Text>
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

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: bottomPad }} keyboardShouldPersistTaps="handled">
        {cloudSyncBlocked ? (
          <View
            style={[
              styles.syncErrorCard,
              { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, ...theme.shadow.card },
            ]}
          >
            <Text style={[styles.syncErrorTitle, { color: theme.colors.textPrimary }]}>Cloud sync paused</Text>
            <Text style={[styles.syncErrorBody, { color: theme.colors.textSecondary }]}>
              We could not safely load your account data. Remote writes are blocked until retry succeeds.
            </Text>
            <TouchableOpacity
              onPress={retryHydrate}
              activeOpacity={0.88}
              style={[styles.syncRetryButton, { backgroundColor: theme.colors.indigo[600] }]}
              accessibilityRole="button"
              accessibilityLabel="Retry cloud sync"
            >
              <Text style={styles.syncRetryText}>Retry Sync</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {showRecoveryBackups ? (
          <View
            style={[
              styles.recoveryCard,
              { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, ...theme.shadow.card },
            ]}
          >
            <View style={styles.recoveryHeader}>
              <View
                style={[
                  styles.recoveryIcon,
                  {
                    backgroundColor: isDark ? "rgba(34,197,94,0.14)" : "rgba(22,163,74,0.1)",
                    borderColor: isDark ? "rgba(34,197,94,0.28)" : "rgba(22,163,74,0.18)",
                  },
                ]}
              >
                <ShieldCheck size={18} color={theme.colors.green[500]} />
              </View>
              <View style={styles.recoveryTitleBlock}>
                <Text style={[styles.recoveryTitle, { color: theme.colors.textPrimary }]}>Recovery snapshots</Text>
                <Text style={[styles.recoveryBody, { color: theme.colors.textSecondary }]}>
                  Recent safety backups from this account are available on this device.
                </Text>
              </View>
            </View>
            <View style={styles.recoveryList}>
              {recoveryBackups.map((backup) => {
                const busy = restoringBackupAt === backup.savedAt;
                return (
                  <View
                    key={`${backup.savedAt}-${backup.reason}`}
                    style={[
                      styles.recoveryRow,
                      { backgroundColor: theme.colors.surfaceElevated, borderColor: theme.colors.border },
                    ]}
                  >
                    <View style={styles.recoveryRowText}>
                      <Text style={[styles.recoveryReason, { color: theme.colors.textPrimary }]} numberOfLines={1}>
                        {backupReasonLabel(backup.reason)}
                      </Text>
                      <Text style={[styles.recoveryMeta, { color: theme.colors.textMuted }]} numberOfLines={1}>
                        {formatBackupSavedAt(backup.savedAt)}, {backupSummary(backup)}
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => confirmRestoreBackup(backup)}
                      disabled={busy}
                      activeOpacity={0.88}
                      style={[
                        styles.recoveryRestoreButton,
                        { backgroundColor: theme.colors.indigo[600], opacity: busy ? 0.65 : 1 },
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel="Restore account backup"
                    >
                      <Text style={styles.recoveryRestoreText}>{busy ? "..." : "Restore"}</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          </View>
        ) : null}

        <LinearGradient
          colors={
            isDark
              ? ["rgba(15,23,42,0.98)", "rgba(17,24,39,0.94)", "rgba(30,41,59,0.88)"]
              : ["#FFFFFF", "#F8FAFC", "#EEF6FF"]
          }
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.hero, { borderColor: theme.colors.border, ...theme.shadow.card }]}
        >
          <View style={styles.heroRingColumn}>
            <LevelXpRing level={level} xpInLevel={xpInLevel} size={94} strokeWidth={3}>
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
          </View>
          <View style={styles.heroText}>
            <View style={styles.heroStatusRow}>
              <View
                style={[
                  styles.heroLevelPill,
                  {
                    backgroundColor: isDark ? "rgba(99,102,241,0.14)" : "rgba(79,70,229,0.08)",
                    borderColor: isDark ? "rgba(129,140,248,0.35)" : "rgba(99,102,241,0.24)",
                  },
                ]}
              >
                <Text style={[styles.heroLevelPillText, { color: theme.colors.indigo[400] }]}>Level {level}</Text>
              </View>
              {accountHydrating ? null : profileIsPremium ? (
                <View
                  style={[
                    styles.heroActivePill,
                    {
                      backgroundColor: isDark ? "rgba(34,197,94,0.12)" : "rgba(22,163,74,0.08)",
                      borderColor: isDark ? "rgba(34,197,94,0.28)" : "rgba(22,163,74,0.2)",
                    },
                  ]}
                >
                  <PlusBadge withFlame label="Community" />
                  <Text style={[styles.heroActiveText, { color: theme.colors.green[500] }]}>Premium</Text>
                </View>
              ) : (
                <View
                  style={[
                    styles.heroActivePill,
                    {
                      backgroundColor: isDark ? "rgba(99,102,241,0.12)" : "rgba(79,70,229,0.08)",
                      borderColor: isDark ? "rgba(129,140,248,0.28)" : "rgba(99,102,241,0.2)",
                    },
                  ]}
                >
                  <User size={13} color={theme.colors.indigo[400]} strokeWidth={2.4} />
                  <Text style={[styles.heroActiveText, { color: theme.colors.textSecondary }]}>Solo analytics</Text>
                </View>
              )}
            </View>
            <View style={styles.xpLine}>
              <Zap size={16} color={theme.colors.yellow[400]} fill={theme.colors.yellow[400]} />
              <Text style={[styles.xpBig, { color: theme.colors.textPrimary }]}>
                {xpInLevel} / {XP_PER_LEVEL} <Text style={{ color: theme.colors.textMuted, fontWeight: "600" }}>XP this level</Text>
              </Text>
            </View>
            <View style={[styles.heroXpTrack, { backgroundColor: isDark ? "rgba(255,255,255,0.09)" : "rgba(15,23,42,0.08)" }]}>
              <View
                style={[
                  styles.heroXpFill,
                  {
                    width: `${Math.max(3, Math.min(100, Math.round((xpInLevel / XP_PER_LEVEL) * 100)))}%`,
                    backgroundColor: theme.colors.green[500],
                  },
                ]}
              />
            </View>
            <Text style={[styles.totalXp, { color: theme.colors.textSecondary }]}>Total XP: {xp}</Text>
            {showAccount && username ? (
              <Text style={[styles.handle, { color: theme.colors.cyan[400] }]} numberOfLines={1}>
                @{username}
              </Text>
            ) : showAccount && session?.user && !accountHydrating && !cloudSyncBlocked ? (
              <UsernameSetupFields compact />
            ) : null}
            <Pressable
              onPress={() => router.push("/my-journey")}
              accessibilityRole="button"
              accessibilityLabel="View my journey"
              style={({ pressed }) => [styles.journeyCtaPressable, pressed ? styles.journeyCtaPressed : null]}
            >
              <LinearGradient
                colors={
                  isDark
                    ? ["#4F46E5", "#0891B2", "#F59E0B"]
                    : ["#4F46E5", "#06B6D4", "#F59E0B"]
                }
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.journeyCta}
              >
                <BarChart3 size={15} color="#FFFFFF" strokeWidth={2.4} />
                <Text style={styles.journeyCtaText}>View My Journey</Text>
                <ChevronRight size={15} color="#FFFFFF" strokeWidth={2.6} />
              </LinearGradient>
            </Pressable>
          </View>
        </LinearGradient>

        {!accountHydrating && !profileIsPremium ? (
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

        <Text style={[styles.sectionLabel, { color: theme.colors.textMuted }]}>GROWTH ENGINE</Text>

        <View
          style={[
            styles.momentumCard,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
              ...theme.shadow.card,
            },
          ]}
        >
          <View style={styles.momentumHead}>
            <View style={styles.momentumTitleBlock}>
              <View style={styles.cardTitleRow}>
                <Gauge size={18} color={theme.colors.indigo[400]} />
                <Text style={[styles.cardHeaderTitle, { color: theme.colors.textPrimary }]}>Growth index</Text>
                <DashboardInfoButton color={theme.colors.indigo[400]} onPress={() => setInfoSheet("growth")} />
              </View>
              <Text style={[styles.cardCaption, { color: theme.colors.textSecondary }]}>
                {profileMath.tier.label}. {profileMath.tier.detail}
              </Text>
            </View>
            <View style={[styles.scoreDial, { borderColor: theme.colors.border, backgroundColor: isDark ? "rgba(99,102,241,0.14)" : "rgba(79,70,229,0.08)" }]}>
              <Text style={[styles.scoreDialNumber, { color: theme.colors.textPrimary }]}>{profileMath.growthScore}</Text>
              <Text style={[styles.scoreDialUnit, { color: theme.colors.textMuted }]}>/100</Text>
            </View>
          </View>
          <View style={[styles.progressTrack, { backgroundColor: isDark ? "rgba(255,255,255,0.09)" : "rgba(15,23,42,0.08)" }]}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${profileMath.growthScore}%`,
                  backgroundColor: theme.colors.indigo[500],
                },
              ]}
            />
          </View>
          <Text style={[styles.formulaLine, { color: theme.colors.textMuted }]}>
            {profileMath.socialIncluded
              ? "Built from consistency, follow through, momentum, recovery, reflection, focus, and social activity."
              : "Built from consistency, follow through, momentum, recovery, reflection, and focus."}
          </Text>
          <View style={[styles.nextActionStrip, { backgroundColor: isDark ? "rgba(79,70,229,0.14)" : "rgba(79,70,229,0.08)", borderColor: theme.colors.border }]}>
            <View style={styles.nextActionCopy}>
              <Text style={[styles.nextActionKicker, { color: theme.colors.indigo[400] }]}>TODAY'S BEST MOVE</Text>
              <Text style={[styles.nextActionTitle, { color: theme.colors.textPrimary }]} numberOfLines={1}>
                {profileMath.nextAction.title}
              </Text>
              <Text style={[styles.nextActionDetail, { color: theme.colors.textSecondary }]} numberOfLines={2}>
                {profileMath.nextAction.detail}
              </Text>
            </View>
            <View style={[styles.nextActionMetric, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
              <Text style={[styles.nextActionMetricText, { color: theme.colors.textPrimary }]} numberOfLines={1}>
                {profileMath.nextAction.metric}
              </Text>
            </View>
          </View>
          <View style={styles.signalGrid}>
            {insightSignals.map((signal) => (
              <InsightSignalCard
                key={signal.title}
                title={signal.title}
                value={signal.value}
                detail={signal.detail}
                color={signal.color}
                theme={theme}
                isDark={isDark}
                onInfo={() => setInfoSheet(signal.infoKey)}
              />
            ))}
          </View>
          <View style={styles.momentumMiniGrid}>
            <View style={styles.momentumMiniCell}>
              <Text style={[styles.metricValue, { color: theme.colors.cyan[400] }]}>{profileMath.weeklyScore}</Text>
              <Text style={[styles.metricLabel, { color: theme.colors.textMuted }]}>weekly pts</Text>
            </View>
            <View style={styles.momentumMiniCell}>
              <Text style={[styles.metricValue, { color: theme.colors.green[500] }]}>{profileMath.weeklyDelta >= 0 ? "+" : ""}{profileMath.weeklyDelta}</Text>
              <Text style={[styles.metricLabel, { color: theme.colors.textMuted }]}>vs last week</Text>
            </View>
            <View style={styles.momentumMiniCell}>
              <Text style={[styles.metricValue, { color: theme.colors.amber[500] }]}>{profileMath.missRisk}</Text>
              <Text style={[styles.metricLabel, { color: theme.colors.textMuted }]}>miss risk</Text>
            </View>
          </View>
        </View>

        <View style={styles.mathCardRow}>
          <View
            style={[
              styles.mathCard,
              { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, ...theme.shadow.card },
            ]}
          >
            <View style={styles.cardTitleRow}>
              <TrendingUp size={16} color={theme.colors.green[500]} />
              <Text style={[styles.mathCardTitle, { color: theme.colors.textPrimary }]}>Level forecast</Text>
              <DashboardInfoButton color={theme.colors.green[500]} onPress={() => setInfoSheet("level")} />
            </View>
            <Text style={[styles.bigMathValue, { color: theme.colors.textPrimary }]}>{profileMath.xpToNextLevel}</Text>
            <Text style={[styles.metricLabel, { color: theme.colors.textMuted }]}>XP to Level {level + 1}</Text>
            <View style={[styles.compactDivider, { backgroundColor: theme.colors.border }]} />
            <Text style={[styles.mathLine, { color: theme.colors.textSecondary }]}>
              Pace {formatOneDecimal(profileMath.pointPacePerDay)} pts/day
            </Text>
            <Text style={[styles.mathLineStrong, { color: theme.colors.indigo[400] }]}>
              {profileMath.projectedLevelDays ? `${profileMath.projectedLevelDays}d estimate` : "Needs points"}
            </Text>
          </View>

          <View
            style={[
              styles.mathCard,
              { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, ...theme.shadow.card },
            ]}
          >
            <View style={styles.cardTitleRow}>
              <Activity size={16} color={theme.colors.cyan[400]} />
              <Text style={[styles.mathCardTitle, { color: theme.colors.textPrimary }]}>Reliability</Text>
              <DashboardInfoButton color={theme.colors.cyan[400]} onPress={() => setInfoSheet("reliability")} />
            </View>
            <Text style={[styles.bigMathValue, { color: theme.colors.textPrimary }]}>{profileMath.activeDays}/7</Text>
            <Text style={[styles.metricLabel, { color: theme.colors.textMuted }]}>{profileMath.last7CheckIns} check ins</Text>
            <View style={styles.microBarRow} accessibilityLabel={insights.activityA11y}>
              {insights.activityPoints.map((point) => (
                <View
                  key={point.dateKey}
                  style={[
                    styles.microBar,
                    {
                      height: 8 + Math.min(point.count, 5) * 6,
                      backgroundColor: point.count > 0 ? theme.colors.cyan[500] : (isDark ? "rgba(255,255,255,0.1)" : "rgba(15,23,42,0.1)"),
                    },
                  ]}
                />
              ))}
            </View>
            <Text style={[styles.mathLineStrong, { color: theme.colors.cyan[400] }]}>
              {profileMath.consistency}% consistency · best {profileMath.bestDayLabel}
            </Text>
          </View>
        </View>

        <View
          style={[
            styles.statsBoard,
            { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, ...theme.shadow.card },
          ]}
        >
          <View style={styles.statsBoardHeader}>
            <View style={styles.cardTitleRow}>
              <BarChart3 size={17} color={theme.colors.indigo[400]} />
              <Text style={[styles.cardHeaderTitle, { color: theme.colors.textPrimary }]}>Model components</Text>
            </View>
            <Text style={[styles.statsBoardHint, { color: theme.colors.textMuted }]}>weighted</Text>
          </View>
          <View style={styles.modelCardGrid}>
            {modelCards.map((card) => (
              <ModelScoreCard
                key={card.key}
                title={card.title}
                value={card.value}
                weight={card.weight}
                color={card.color}
                detail={card.detail}
                theme={theme}
                isDark={isDark}
                onInfo={() => setInfoSheet(card.key)}
              />
            ))}
          </View>
        </View>

        <View
          style={[
            styles.statsBoard,
            { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, ...theme.shadow.card },
          ]}
        >
          <View style={styles.statsBoardHeader}>
            <View style={styles.cardTitleRow}>
              <BarChart3 size={17} color={theme.colors.cyan[400]} />
              <Text style={[styles.cardHeaderTitle, { color: theme.colors.textPrimary }]}>Raw inputs</Text>
            </View>
            <Text style={[styles.statsBoardHint, { color: theme.colors.textMuted }]}>visible data</Text>
          </View>
          <View style={styles.rawStatGrid}>
            {rawStatTiles.map((tile) => (
              <RawStatTile
                key={tile.label}
                value={tile.value}
                label={tile.label}
                detail={tile.detail}
                color={tile.color}
                theme={theme}
                isDark={isDark}
              />
            ))}
          </View>
        </View>

        <Text style={[styles.sectionLabel, { color: theme.colors.textMuted }]}>COMMITMENT LOAD</Text>

        <View
          style={[
            styles.commitmentCard,
            { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, ...theme.shadow.card },
          ]}
        >
          <TouchableOpacity
            style={styles.commitmentRow}
            onPress={() => setHubSheet({ mode: "habits-all" })}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="View all habits"
          >
            <View style={styles.commitmentMain}>
              <View style={[styles.commitmentIcon, { backgroundColor: isDark ? "rgba(34,211,238,0.12)" : "rgba(8,145,178,0.1)" }]}>
                <Target size={16} color={theme.colors.cyan[400]} />
              </View>
              <View style={styles.commitmentCopy}>
                <Text style={[styles.commitmentTitle, { color: theme.colors.textPrimary }]}>Habits</Text>
                <Text style={[styles.commitmentMeta, { color: theme.colors.textMuted }]}>
                  {profileMath.cleanCheckIns} clean · {profileMath.repairedCheckIns} repaired
                </Text>
              </View>
            </View>
            <View style={styles.commitmentRight}>
              <Text style={[styles.commitmentTotal, { color: theme.colors.textPrimary }]}>{missionStats.habitsTotal}</Text>
              <Text style={[styles.metricLabel, { color: theme.colors.textMuted }]}>{profileMath.followThroughScore}% follow</Text>
            </View>
          </TouchableOpacity>

          <View style={[styles.commitmentSeparator, { backgroundColor: theme.colors.border }]} />

          <TouchableOpacity
            style={styles.commitmentRow}
            onPress={() => setHubSheet({ mode: "minis-all" })}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="View all mini missions"
          >
            <View style={styles.commitmentMain}>
              <View style={[styles.commitmentIcon, { backgroundColor: isDark ? "rgba(245,158,11,0.13)" : "rgba(245,158,11,0.1)" }]}>
                <Flame size={16} color={theme.colors.amber[500]} />
              </View>
              <View style={styles.commitmentCopy}>
                <Text style={[styles.commitmentTitle, { color: theme.colors.textPrimary }]}>Mini missions</Text>
                <Text style={[styles.commitmentMeta, { color: theme.colors.textMuted }]}>
                  {profileMath.miniCompletedMinutes} min done · {formatOneDecimal(profileMath.miniWeeklyAverage)}/wk
                </Text>
              </View>
            </View>
            <View style={styles.commitmentRight}>
              <Text style={[styles.commitmentTotal, { color: theme.colors.textPrimary }]}>{missionStats.minisTotal}</Text>
              <Text style={[styles.metricLabel, { color: theme.colors.textMuted }]}>{profileMath.miniCompletionRate}% done</Text>
            </View>
          </TouchableOpacity>

          <View style={styles.commitmentChipRow}>
            <TouchableOpacity
              style={[styles.commitmentChip, { borderColor: theme.colors.border, backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(15,23,42,0.04)" }]}
              onPress={profileIsPremium ? onHabitsPublicPress : onHabitsSoloPress}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={profileIsPremium ? "View public habits" : "View solo habits"}
            >
              {profileIsPremium ? (
                <Globe size={13} color={theme.colors.cyan[400]} />
              ) : (
                <User size={13} color={theme.colors.indigo[400]} />
              )}
              <Text style={[styles.commitmentChipText, { color: theme.colors.textSecondary }]}>
                {profileIsPremium
                  ? `Public habits ${missionStats.pub.habitsActive + missionStats.pub.habitsDone}`
                  : `Solo habits ${missionStats.solo.habitsActive + missionStats.solo.habitsDone}`}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.commitmentChip, { borderColor: theme.colors.border, backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(15,23,42,0.04)" }]}
              onPress={onMinisSoloPress}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="View solo mini missions"
            >
              <User size={13} color={theme.colors.indigo[400]} />
              <Text style={[styles.commitmentChipText, { color: theme.colors.textSecondary }]}>
                Solo minis {missionStats.solo.miniTotal}
              </Text>
            </TouchableOpacity>
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

      <LazyMount visible={hubSheet !== null} unmountOnExit>
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
      </LazyMount>

      <LazyMount visible={infoSheet !== null} unmountOnExit>
        <ProfileInfoSheet
          info={infoSheet ? getProfileInfoForMode(infoSheet, profileMath.socialIncluded) : null}
          theme={theme}
          isDark={isDark}
          onClose={() => setInfoSheet(null)}
        />
      </LazyMount>

      <LazyMount visible={settingsOpen} unmountOnExit>
        <SettingsModal visible={settingsOpen} onClose={() => setSettingsOpen(false)} />
      </LazyMount>
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
    borderRadius: 20,
    borderWidth: 1,
    padding: 14,
    marginBottom: 22,
    gap: 12,
    alignItems: "flex-start",
    overflow: "hidden",
  },
  heroRingColumn: {
    width: 94,
    alignItems: "flex-start",
    justifyContent: "flex-start",
    paddingTop: 10,
  },
  levelOrb: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  heroLogo: { width: 88, height: 88 },
  levelHuge: { fontSize: 32, fontWeight: "900" },
  levelTag: { fontSize: 9, fontWeight: "800", letterSpacing: 1 },
  heroText: { flex: 1, gap: 6, minWidth: 0, paddingTop: 2 },
  heroStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
    marginBottom: 1,
    marginLeft: -2,
  },
  heroLevelPill: {
    minHeight: 25,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  heroLevelPillText: { fontSize: 11.5, lineHeight: 14, fontWeight: "900", letterSpacing: 0.25 },
  heroActivePill: {
    minHeight: 25,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    flexShrink: 1,
  },
  heroActiveText: { fontSize: 10.5, lineHeight: 13, fontWeight: "900" },
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
  levelBadgeText: { fontSize: 13, fontWeight: "900", fontVariant: ["tabular-nums"] },
  xpLine: { flexDirection: "row", alignItems: "center", gap: 8, minWidth: 0 },
  xpBig: { fontSize: 16, lineHeight: 20, fontWeight: "800" },
  heroXpTrack: {
    height: 7,
    borderRadius: 999,
    overflow: "hidden",
    width: "100%",
  },
  heroXpFill: { height: "100%", borderRadius: 999 },
  totalXp: { fontSize: 12.5, lineHeight: 16, fontWeight: "700" },
  handle: { fontSize: 15, lineHeight: 19, fontWeight: "900", marginTop: 0 },
  plusActiveRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 },
  plusActiveText: { fontSize: 12, fontWeight: "800", letterSpacing: 0.1 },
  journeyCtaPressable: { alignSelf: "stretch", marginTop: 2 },
  journeyCtaPressed: { opacity: 0.86, transform: [{ scale: 0.99 }] },
  journeyCta: {
    minHeight: 39,
    borderRadius: 999,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  journeyCtaText: { color: "#FFFFFF", fontSize: 12.5, lineHeight: 16, fontWeight: "900" },
  plusCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    marginBottom: 22,
  },
  plusCardTitle: { fontSize: 16, fontWeight: "900", letterSpacing: -0.2, marginTop: 10 },
  plusCardBody: { fontSize: 13, lineHeight: 19, fontWeight: "600", marginBottom: 10 },
  plusCardCta: { fontSize: 13, fontWeight: "900" },
  syncErrorCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    marginBottom: 18,
  },
  syncErrorTitle: { fontSize: 16, fontWeight: "900", marginBottom: 6 },
  syncErrorBody: { fontSize: 13, lineHeight: 19, fontWeight: "600" },
  syncRetryButton: {
    alignSelf: "flex-start",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 12,
  },
  syncRetryText: { color: "#fff", fontSize: 13, fontWeight: "900" },
  recoveryCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    marginBottom: 18,
    gap: 14,
  },
  recoveryHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  recoveryIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  recoveryTitleBlock: { flex: 1, minWidth: 0 },
  recoveryTitle: { fontSize: 16, fontWeight: "900", marginBottom: 4 },
  recoveryBody: { fontSize: 13, lineHeight: 18, fontWeight: "600" },
  recoveryList: { gap: 10 },
  recoveryRow: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  recoveryRowText: { flex: 1, minWidth: 0 },
  recoveryReason: { fontSize: 13, fontWeight: "900" },
  recoveryMeta: { fontSize: 11, lineHeight: 15, fontWeight: "700", marginTop: 2 },
  recoveryRestoreButton: {
    borderRadius: 11,
    paddingHorizontal: 12,
    paddingVertical: 9,
    minWidth: 74,
    alignItems: "center",
  },
  recoveryRestoreText: { color: "#fff", fontSize: 12, fontWeight: "900" },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
    marginBottom: 10,
  },
  momentumCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    marginBottom: 12,
  },
  momentumHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 12,
  },
  momentumTitleBlock: { flex: 1, minWidth: 0 },
  cardTitleRow: { flexDirection: "row", alignItems: "center", gap: 8, minWidth: 0 },
  cardCaption: { fontSize: 12, lineHeight: 17, fontWeight: "700", marginTop: 3 },
  scoreDial: {
    width: 76,
    minHeight: 58,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 7,
  },
  scoreDialNumber: { fontSize: 24, lineHeight: 28, fontWeight: "900", fontVariant: ["tabular-nums"] },
  scoreDialUnit: { fontSize: 10, lineHeight: 12, fontWeight: "900" },
  progressTrack: { height: 8, borderRadius: 999, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 999 },
  formulaLine: { fontSize: 10, lineHeight: 14, fontWeight: "900", marginTop: 8 },
  infoButton: {
    width: 24,
    height: 24,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  nextActionStrip: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 11,
    marginTop: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  nextActionCopy: { flex: 1, minWidth: 0 },
  nextActionKicker: { fontSize: 9, lineHeight: 12, fontWeight: "900", letterSpacing: 1 },
  nextActionTitle: { fontSize: 14, lineHeight: 18, fontWeight: "900", marginTop: 2 },
  nextActionDetail: { fontSize: 11, lineHeight: 15, fontWeight: "700", marginTop: 2 },
  nextActionMetric: {
    minWidth: 72,
    maxWidth: 104,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 7,
    alignItems: "center",
  },
  nextActionMetricText: { fontSize: 10, lineHeight: 13, fontWeight: "900" },
  signalGrid: {
    flexDirection: "row",
    gap: 8,
    marginTop: 11,
  },
  signalCard: {
    flex: 1,
    minWidth: 0,
    borderRadius: 14,
    borderWidth: 1,
    padding: 9,
  },
  signalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 5 },
  signalTitle: { fontSize: 9, lineHeight: 12, fontWeight: "900", letterSpacing: 0.8, textTransform: "uppercase" },
  signalValue: { fontSize: 15, lineHeight: 19, fontWeight: "900", marginTop: 2 },
  signalDetail: { fontSize: 10, lineHeight: 14, fontWeight: "700", marginTop: 2 },
  momentumMiniGrid: {
    flexDirection: "row",
    alignItems: "stretch",
    justifyContent: "space-between",
    gap: 8,
    marginTop: 12,
  },
  momentumMiniCell: { flex: 1, minWidth: 0 },
  metricValue: { fontSize: 18, lineHeight: 22, fontWeight: "900", fontVariant: ["tabular-nums"] },
  metricLabel: { fontSize: 10, lineHeight: 13, fontWeight: "900" },
  mathCardRow: { flexDirection: "row", gap: 10, marginBottom: 12 },
  mathCard: {
    flex: 1,
    minWidth: 0,
    borderRadius: 16,
    borderWidth: 1,
    padding: 13,
  },
  mathCardTitle: { fontSize: 13, lineHeight: 17, fontWeight: "900" },
  bigMathValue: { fontSize: 28, lineHeight: 33, fontWeight: "900", fontVariant: ["tabular-nums"], marginTop: 8 },
  compactDivider: { height: 1, opacity: 0.72, marginVertical: 9 },
  mathLine: { fontSize: 11, lineHeight: 15, fontWeight: "800" },
  mathLineStrong: { fontSize: 11, lineHeight: 15, fontWeight: "900", marginTop: 2 },
  microBarRow: { height: 44, flexDirection: "row", alignItems: "flex-end", gap: 4, marginTop: 8 },
  microBar: { flex: 1, borderRadius: 999, minHeight: 7 },
  statsBoard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    marginBottom: 20,
  },
  statsBoardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 12,
  },
  statsBoardHint: { fontSize: 10, lineHeight: 13, fontWeight: "900", textTransform: "uppercase" },
  modelCardGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 9,
  },
  modelScoreCard: {
    width: "47.8%",
    minHeight: 146,
    borderRadius: 16,
    borderWidth: 1,
    padding: 11,
  },
  modelScoreHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8 },
  modelScoreTitleWrap: { flex: 1, minWidth: 0 },
  modelScoreTitle: { fontSize: 13, lineHeight: 16, fontWeight: "900" },
  modelScoreWeight: { fontSize: 10, lineHeight: 13, fontWeight: "900", marginTop: 1 },
  modelScoreValueRow: { flexDirection: "row", alignItems: "flex-end", gap: 3, marginTop: 8 },
  modelScoreValue: { fontSize: 27, lineHeight: 31, fontWeight: "900", fontVariant: ["tabular-nums"] },
  modelScoreUnit: { fontSize: 11, lineHeight: 15, fontWeight: "900", marginBottom: 3 },
  animatedTrack: { height: 7, borderRadius: 999, overflow: "hidden", marginTop: 8 },
  animatedFill: { height: "100%", borderRadius: 999 },
  modelScoreDetail: { fontSize: 10, lineHeight: 14, fontWeight: "700", marginTop: 8 },
  rawStatGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 9,
  },
  rawStatTile: {
    width: "31%",
    minHeight: 86,
    borderRadius: 15,
    borderWidth: 1,
    padding: 10,
    justifyContent: "center",
  },
  rawStatValue: { fontSize: 21, lineHeight: 25, fontWeight: "900", fontVariant: ["tabular-nums"] },
  rawStatLabel: { fontSize: 11, lineHeight: 14, fontWeight: "900", marginTop: 2 },
  rawStatDetail: { fontSize: 9, lineHeight: 12, fontWeight: "700", marginTop: 3 },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    borderRadius: 14,
    overflow: "hidden",
  },
  modelGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    borderRadius: 14,
    overflow: "hidden",
  },
  modelCell: {
    width: "25%",
    minHeight: 54,
    justifyContent: "center",
    paddingVertical: 7,
    paddingHorizontal: 4,
  },
  modelNumber: { fontSize: 19, lineHeight: 23, fontWeight: "900", fontVariant: ["tabular-nums"] },
  statsCell: {
    width: "33.333%",
    minHeight: 58,
    justifyContent: "center",
    paddingVertical: 8,
    paddingHorizontal: 6,
  },
  statsNumber: { fontSize: 21, lineHeight: 25, fontWeight: "900", fontVariant: ["tabular-nums"] },
  infoSheetBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(2,6,23,0.54)",
  },
  infoSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    padding: 18,
    gap: 14,
  },
  infoSheetHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  infoSheetTitleBlock: { flex: 1, minWidth: 0 },
  infoSheetKicker: { fontSize: 10, lineHeight: 13, fontWeight: "900", letterSpacing: 1.1 },
  infoSheetTitle: { fontSize: 22, lineHeight: 27, fontWeight: "900", marginTop: 2 },
  infoSheetClose: {
    width: 38,
    height: 38,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  infoFormulaBox: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
  },
  infoFormulaLabel: { fontSize: 10, lineHeight: 13, fontWeight: "900", textTransform: "uppercase" },
  infoFormulaText: { fontSize: 13, lineHeight: 18, fontWeight: "900", marginTop: 3 },
  infoSheetBody: { fontSize: 13, lineHeight: 20, fontWeight: "700" },
  infoImproveList: { gap: 9 },
  infoImproveRow: { flexDirection: "row", alignItems: "flex-start", gap: 9 },
  infoImproveDot: { width: 7, height: 7, borderRadius: 999, marginTop: 6 },
  infoImproveText: { flex: 1, minWidth: 0, fontSize: 13, lineHeight: 18, fontWeight: "800" },
  commitmentCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 12,
    marginBottom: 20,
  },
  commitmentRow: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  commitmentMain: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 10 },
  commitmentIcon: { width: 34, height: 34, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  commitmentCopy: { flex: 1, minWidth: 0 },
  commitmentTitle: { fontSize: 16, lineHeight: 20, fontWeight: "900" },
  commitmentMeta: { fontSize: 11, lineHeight: 15, fontWeight: "800", marginTop: 2 },
  commitmentRight: { alignItems: "flex-end", minWidth: 64 },
  commitmentTotal: { fontSize: 25, lineHeight: 29, fontWeight: "900", fontVariant: ["tabular-nums"] },
  commitmentSeparator: { height: 1, opacity: 0.72, marginVertical: 4 },
  commitmentChipRow: { flexDirection: "row", gap: 8, marginTop: 8 },
  commitmentChip: {
    flex: 1,
    minHeight: 34,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 9,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  commitmentChipText: { fontSize: 11, lineHeight: 14, fontWeight: "900" },
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
