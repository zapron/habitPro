import { Text } from "../../src/components/AppText";
import {
  memo,
  useCallback,
  useMemo,
  useState } from "react";
import type { ComponentType } from "react";
import {
  View,
  ScrollView,
  Pressable,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Alert,
  Image,
} from "react-native";
import type { ImageStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { Settings, Zap, Globe, User, Target, Flame, LogOut, Crown, ShieldCheck } from "lucide-react-native";
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
  weeklyCompeteScore,
  weeklyTierLabel,
  countHabitCheckInsThisWeek,
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
  return `${backup.habits.length} habits - ${backup.miniMissions.length} minis - Level ${level}`;
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
    memory.checkInOnly === true ? "check-in" : "",
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
      void refreshPremiumAccess();
      void loadBackups();
    }, [loadBackups, refreshPremiumAccess]),
  );

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
    const habitCheckInsThisWeek = countHabitCheckInsThisWeek(habits);
    const miniCompletionsThisWeek = countMiniCompletionsThisWeek(miniMissions);
    const activityPoints = lastNDaysHabitCheckInsPerDay(habits, 7);
    const miniWeekBuckets = miniCompletionsByWeekBuckets(miniMissions, 4);
    return {
      weeklyScore,
      tier,
      habitCheckInsThisWeek,
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

  const onHabitsPublicPress = useCallback(() => setHubSheet({ mode: "habits-filter", visibility: "public" }), []);
  const onHabitsPublicActivePress = useCallback(() => setHubSheet({ mode: "habits-filter", visibility: "public", status: "active" }), []);
  const onHabitsPublicDonePress = useCallback(() => setHubSheet({ mode: "habits-filter", visibility: "public", status: "done" }), []);
  const onHabitsSoloPress = useCallback(() => setHubSheet({ mode: "habits-filter", visibility: "solo" }), []);
  const onHabitsSoloActivePress = useCallback(() => setHubSheet({ mode: "habits-filter", visibility: "solo", status: "active" }), []);
  const onHabitsSoloDonePress = useCallback(() => setHubSheet({ mode: "habits-filter", visibility: "solo", status: "done" }), []);
  const onMinisPublicPress = useCallback(() => setHubSheet({ mode: "minis-filter", visibility: "public" }), []);
  const onMinisPublicActivePress = useCallback(() => setHubSheet({ mode: "minis-filter", visibility: "public", status: "live" }), []);
  const onMinisPublicDonePress = useCallback(() => setHubSheet({ mode: "minis-filter", visibility: "public", status: "done" }), []);
  const onMinisSoloPress = useCallback(() => setHubSheet({ mode: "minis-filter", visibility: "solo" }), []);
  const onMinisSoloActivePress = useCallback(() => setHubSheet({ mode: "minis-filter", visibility: "solo", status: "live" }), []);
  const onMinisSoloDonePress = useCallback(() => setHubSheet({ mode: "minis-filter", visibility: "solo", status: "done" }), []);

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
                        {formatBackupSavedAt(backup.savedAt)} - {backupSummary(backup)}
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

        <View style={[styles.hero, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, ...theme.shadow.card }]}>
          <LevelXpRing level={level} xpInLevel={xpInLevel}>
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
                {xpInLevel} / {XP_PER_LEVEL} <Text style={{ color: theme.colors.textMuted, fontWeight: "600" }}>XP this level</Text>
              </Text>
            </View>
            <Text style={[styles.totalXp, { color: theme.colors.textSecondary }]}>Total XP: {xp}</Text>
            {showAccount && username ? (
              <Text style={[styles.handle, { color: theme.colors.cyan[400] }]} numberOfLines={1}>
                @{username}
              </Text>
            ) : showAccount && session?.user && !accountHydrating && !cloudSyncBlocked ? (
              <UsernameSetupFields compact />
            ) : null}
            {profileIsPremium ? (
              <View style={styles.plusActiveRow}>
                <PlusBadge withFlame />
                <Text style={[styles.plusActiveText, { color: theme.colors.textMuted }]}>Active</Text>
              </View>
            ) : null}
          </View>
        </View>

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

        <Text style={[styles.sectionLabel, { color: theme.colors.textMuted }]}>INSIGHTS</Text>

        <ProfileWeeklyPulse
          theme={theme}
          isDark={isDark}
          weeklyScore={insights.weeklyScore}
          tierLabel={insights.tier.label}
          tierDetail={insights.tier.detail}
          habitCheckInsThisWeek={insights.habitCheckInsThisWeek}
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
                onPressColumn={onHabitsPublicPress}
                onPressActive={onHabitsPublicActivePress}
                onPressDone={onHabitsPublicDonePress}
              />
              <VisibilityHabitColumn
                theme={theme}
                isDark={isDark}
                title="Solo"
                Icon={User}
                accent={theme.colors.indigo[400]}
                active={missionStats.solo.habitsActive}
                done={missionStats.solo.habitsDone}
                onPressColumn={onHabitsSoloPress}
                onPressActive={onHabitsSoloActivePress}
                onPressDone={onHabitsSoloDonePress}
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
                onPressColumn={onMinisPublicPress}
                onPressActive={onMinisPublicActivePress}
                onPressDone={onMinisPublicDonePress}
              />
              <VisibilityMiniColumn
                theme={theme}
                isDark={isDark}
                title="Solo"
                Icon={User}
                accent={theme.colors.indigo[400]}
                live={missionStats.solo.miniLive}
                completed={missionStats.solo.miniDone}
                onPressColumn={onMinisSoloPress}
                onPressActive={onMinisSoloActivePress}
                onPressDone={onMinisSoloDonePress}
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
