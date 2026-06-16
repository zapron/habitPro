import type { Habit, MiniMission } from "../types/habit";
import {
  WEEKLY_HABIT_CHECKIN_POINTS,
  WEEKLY_MINI_COMPLETION_POINTS,
  countHabitCheckInsThisWeek,
  countMiniCompletionsThisWeek,
  startOfWeekMonday,
  weeklyCompeteScore,
  weeklyTierLabel,
} from "./weekStats";
import {
  countActiveHabits,
  formatLocalDateKey,
  lastNDaysHabitCheckInsPerDay,
  maxHabitStreak,
  miniCompletionsByWeekBuckets,
  totalLifetimeCheckIns,
} from "./profileStats";
import { XP_PER_LEVEL } from "./xpLevel";

export type ProfileNextAction = {
  title: string;
  detail: string;
  metric: string;
};

export type ProfileIntelligence = {
  growthScore: number;
  consistencyScore: number;
  followThroughScore: number;
  momentumScore: number;
  executionVelocityScore: number;
  recoveryScore: number;
  reflectionScore: number;
  focusLoadScore: number;
  socialEnergyScore: number;
  socialIncluded: boolean;
  weeklyScore: number;
  previousWeekScore: number;
  weeklyDelta: number;
  projectedWeekPoints: number;
  pointPacePerDay: number;
  tier: ReturnType<typeof weeklyTierLabel>;
  habitCheckInsThisWeek: number;
  miniCompletionsThisWeek: number;
  habitPoints: number;
  miniPoints: number;
  pointsToNextTier: number;
  activeDays: number;
  consistency: number;
  last7CheckIns: number;
  bestDayLabel: string;
  activeHabits: number;
  lifetimeCheckIns: number;
  maxStreak: number;
  cleanCheckIns: number;
  repairedCheckIns: number;
  squadSaves: number;
  soloRepairs: number;
  memoryProofs: number;
  reflectionRate: number;
  publicRatio: number;
  publicMoments: number;
  habitDoneTotal: number;
  miniDoneTotal: number;
  miniLiveTotal: number;
  habitCompletionRate: number;
  miniCompletionRate: number;
  miniWeeklyAverage: number;
  miniCompletedMinutes: number;
  xpToNextLevel: number;
  projectedLevelDays: number | null;
  missRisk: "Idle" | "Low" | "Medium" | "High";
  loadLabel: "Idle" | "Light" | "Focused" | "Heavy";
  nextAction: ProfileNextAction;
};

type MissionStats = {
  habitsTotal: number;
  minisTotal: number;
  pub: {
    habitsDone: number;
    habitsActive: number;
    miniDone: number;
    miniLive: number;
  };
  solo: {
    habitsDone: number;
    habitsActive: number;
    miniDone: number;
    miniLive: number;
  };
};

type BuildProfileIntelligenceInput = {
  habits: readonly Habit[];
  miniMissions: readonly MiniMission[];
  xpInLevel: number;
  level: number;
  missionStats: MissionStats;
  communityEnabled?: boolean;
  now?: Date;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function score(value: number): number {
  return Math.round(clamp(value, 0, 100));
}

function percent(part: number, total: number): number {
  return total <= 0 ? 0 : score((part / total) * 100);
}

function localNoonMsFromKey(key: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  const d = new Date(`${key}T12:00:00`);
  const ms = d.getTime();
  return Number.isNaN(ms) ? null : ms;
}

function weekIndex(now: Date): number {
  const day = now.getDay();
  return day === 0 ? 7 : day;
}

function countHabitCheckInsInRange(habits: readonly Habit[], startMs: number, endMs: number): number {
  let count = 0;
  for (const habit of habits) {
    const seenForHabit = new Set<string>();
    for (const raw of habit.completedDates ?? []) {
      const day = raw.slice(0, 10);
      if (seenForHabit.has(day)) continue;
      const ms = localNoonMsFromKey(day);
      if (ms !== null && ms >= startMs && ms <= endMs) {
        seenForHabit.add(day);
        count += 1;
      }
    }
  }
  return count;
}

function countMiniCompletionsInRange(miniMissions: readonly MiniMission[], startMs: number, endMs: number): number {
  let count = 0;
  for (const mini of miniMissions) {
    if (mini.status !== "completed" || !mini.completedAt) continue;
    const ms = new Date(mini.completedAt).getTime();
    if (Number.isFinite(ms) && ms >= startMs && ms <= endMs) count += 1;
  }
  return count;
}

function weeklyScoreForRange(habits: readonly Habit[], miniMissions: readonly MiniMission[], startMs: number, endMs: number): number {
  return (
    countHabitCheckInsInRange(habits, startMs, endMs) * WEEKLY_HABIT_CHECKIN_POINTS +
    countMiniCompletionsInRange(miniMissions, startMs, endMs) * WEEKLY_MINI_COMPLETION_POINTS
  );
}

function habitExpectedSlots(habit: Habit, now: Date): number {
  const start = new Date(habit.startDate);
  if (Number.isNaN(start.getTime())) return Math.max(1, habit.totalDays ?? 1);
  const end = habit.endDate ? new Date(habit.endDate) : now;
  const cappedEnd = end.getTime() < now.getTime() ? end : now;
  const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 12).getTime();
  const endDay = new Date(cappedEnd.getFullYear(), cappedEnd.getMonth(), cappedEnd.getDate(), 12).getTime();
  const elapsed = Math.floor((endDay - startDay) / DAY_MS) + 1;
  return Math.max(0, Math.min(Math.max(1, habit.totalDays ?? 1), elapsed));
}

function computeFollowThrough(habits: readonly Habit[], now: Date): number {
  let completed = 0;
  let expected = 0;
  for (const habit of habits) {
    const slots = habitExpectedSlots(habit, now);
    expected += slots;
    completed += Math.min(new Set(habit.completedDates ?? []).size, slots);
  }
  return percent(completed, expected);
}

function computeRepairCounts(habits: readonly Habit[]) {
  const repaired = new Set<string>();
  let squad = 0;
  let solo = 0;

  for (const habit of habits) {
    for (const day of habit.repairedDates ?? []) {
      repaired.add(`${habit.id}:${day}`);
    }
    for (const [day, memory] of Object.entries(habit.streakMemories ?? {})) {
      if (!memory?.repairSource) continue;
      repaired.add(`${habit.id}:${day}`);
      if (memory.repairSource === "squad") squad += 1;
      if (memory.repairSource === "solo") solo += 1;
    }
  }

  return {
    total: repaired.size,
    squad,
    solo,
  };
}

function countMemoryProofs(habits: readonly Habit[], miniMissions: readonly MiniMission[]): number {
  let proofs = 0;
  for (const habit of habits) {
    for (const memory of Object.values(habit.streakMemories ?? {})) {
      const note = memory?.note?.trim();
      const image = memory?.imageUri?.trim() || memory?.imageUrl?.trim();
      if (note || image) proofs += 1;
    }
  }
  for (const mini of miniMissions) {
    const note = mini.completionMemory?.note?.trim();
    const image = mini.completionMemory?.imageUri?.trim() || mini.completionMemory?.imageUrl?.trim();
    if (note || image) proofs += 1;
  }
  return proofs;
}

function countPublicMoments(habits: readonly Habit[], miniMissions: readonly MiniMission[]): number {
  let count = 0;
  for (const habit of habits) {
    for (const memory of Object.values(habit.streakMemories ?? {})) {
      if (memory?.communityPosted && !memory.communityFeedRevoked) count += 1;
    }
  }
  for (const mini of miniMissions) {
    if (
      mini.visibility === "public" &&
      mini.status === "completed" &&
      !mini.communityFeedRevoked &&
      mini.completionMemory
    ) {
      count += 1;
    }
  }
  return count;
}

function miniCompletedMinutes(miniMissions: readonly MiniMission[]): number {
  return miniMissions.reduce((total, mini) => {
    if (mini.status !== "completed") return total;
    return total + Math.max(1, mini.estimatedMinutes + (mini.extendedMinutes ?? 0));
  }, 0);
}

function activeHabitAtRisk(habits: readonly Habit[], todayKey: string): Habit | null {
  const active = habits
    .filter((habit) => !habit.isCompleted && habit.status !== "failed" && !(habit.completedDates ?? []).includes(todayKey))
    .sort((a, b) => (b.streak ?? 0) - (a.streak ?? 0));
  return active[0] ?? null;
}

function buildNextAction(input: {
  habits: readonly Habit[];
  miniMissions: readonly MiniMission[];
  todayKey: string;
  xpToNextLevel: number;
  consistency: number;
  reflectionRate: number;
  pointsToNextTier: number;
  miniLiveTotal: number;
  weeklyDelta: number;
  level: number;
}): ProfileNextAction {
  const riskyHabit = activeHabitAtRisk(input.habits, input.todayKey);

  if (input.habits.length === 0 && input.miniMissions.length === 0) {
    return {
      title: "Start one clean commitment",
      detail: "Create a simple habit or a 15-minute mini to begin the data trail.",
      metric: "0 active",
    };
  }

  if (input.xpToNextLevel <= 25 && input.xpToNextLevel > 0) {
    return {
      title: `Close Level ${input.level + 1}`,
      detail: "One check-in or one mini should be enough to push the level bar.",
      metric: `${input.xpToNextLevel} XP left`,
    };
  }

  if (riskyHabit) {
    return {
      title: `Protect ${riskyHabit.title}`,
      detail: riskyHabit.streak > 0 ? "This is the highest active streak that still needs today." : "A clean mark today improves your consistency score.",
      metric: riskyHabit.streak > 0 ? `${riskyHabit.streak} day streak` : "due today",
    };
  }

  if (input.miniLiveTotal > 0) {
    return {
      title: "Clear one open mini",
      detail: "Finishing or cancelling stale minis will tighten your focus load.",
      metric: `${input.miniLiveTotal} open`,
    };
  }

  if (input.consistency < 50) {
    return {
      title: "Win one active day",
      detail: "A single check-in today has the biggest effect on your 7-day consistency.",
      metric: `${input.consistency}% consistency`,
    };
  }

  if (input.pointsToNextTier > 0 && input.pointsToNextTier <= 25) {
    return {
      title: "Push the weekly tier",
      detail: "You are close enough that one strong action can move the badge.",
      metric: `${input.pointsToNextTier} pts left`,
    };
  }

  if (input.reflectionRate < 45) {
    return {
      title: "Add context to the next win",
      detail: "A short note makes the journey more useful when you review it later.",
      metric: `${input.reflectionRate}% logged`,
    };
  }

  if (input.weeklyDelta < 0) {
    return {
      title: "Recover last week's pace",
      detail: "Match one more action today to bring the weekly trend back up.",
      metric: `${Math.abs(input.weeklyDelta)} pts behind`,
    };
  }

  return {
    title: "Keep the streak clean",
    detail: "Your numbers are stable. Protect today's habit slot before adding more load.",
    metric: "on track",
  };
}

export function buildProfileIntelligence({
  habits,
  miniMissions,
  xpInLevel,
  level,
  missionStats,
  communityEnabled = true,
  now = new Date(),
}: BuildProfileIntelligenceInput): ProfileIntelligence {
  const weeklyScore = weeklyCompeteScore([...habits], [...miniMissions], level, now);
  const tier = weeklyTierLabel(weeklyScore);
  const habitCheckInsThisWeek = countHabitCheckInsThisWeek([...habits], now);
  const miniCompletionsThisWeek = countMiniCompletionsThisWeek([...miniMissions], now);
  const activityPoints = lastNDaysHabitCheckInsPerDay([...habits], 7, now);
  const miniWeekBuckets = miniCompletionsByWeekBuckets([...miniMissions], 4, now);
  const activeDays = activityPoints.filter((point) => point.count > 0).length;
  const consistency = percent(activeDays, activityPoints.length);
  const last7CheckIns = activityPoints.reduce((total, point) => total + point.count, 0);
  const bestDayPoint = activityPoints.reduce(
    (best, point) => (point.count > best.count ? point : best),
    activityPoints[0] ?? { count: 0, shortLabel: "None", dateKey: "" },
  );
  const miniFourWeekTotal = miniWeekBuckets.reduce((total, bucket) => total + bucket.count, 0);
  const miniWeeklyAverage = miniFourWeekTotal / Math.max(1, miniWeekBuckets.length);
  const daysElapsed = weekIndex(now);
  const pointPacePerDay = weeklyScore / Math.max(1, daysElapsed);
  const projectedWeekPoints = Math.round(pointPacePerDay * 7);
  const xpToNextLevel = XP_PER_LEVEL - xpInLevel;
  const projectedLevelDays = pointPacePerDay > 0 ? Math.max(1, Math.ceil(xpToNextLevel / pointPacePerDay)) : null;
  const nextTierTarget = weeklyScore < 15 ? 15 : weeklyScore < 40 ? 40 : weeklyScore < 75 ? 75 : weeklyScore < 120 ? 120 : null;
  const pointsToNextTier = nextTierTarget == null ? 0 : Math.max(0, nextTierTarget - weeklyScore);

  const weekStart = startOfWeekMonday(now).getTime();
  const weekEnd = weekStart + 7 * DAY_MS - 1;
  const prevWeekStart = weekStart - 7 * DAY_MS;
  const prevWeekEnd = weekStart - 1;
  const previousWeekScore = weeklyScoreForRange(habits, miniMissions, prevWeekStart, prevWeekEnd);
  const weeklyDelta = weeklyScore - previousWeekScore;

  const habitDoneTotal = missionStats.pub.habitsDone + missionStats.solo.habitsDone;
  const miniDoneTotal = missionStats.pub.miniDone + missionStats.solo.miniDone;
  const miniLiveTotal = missionStats.pub.miniLive + missionStats.solo.miniLive;
  const habitCompletionRate = percent(habitDoneTotal, missionStats.habitsTotal);
  const miniCompletionRate = percent(miniDoneTotal, missionStats.minisTotal);
  const publicCommitments =
    missionStats.pub.habitsActive +
    missionStats.pub.habitsDone +
    missionStats.pub.miniLive +
    missionStats.pub.miniDone;
  const allCommitments = missionStats.habitsTotal + missionStats.minisTotal;
  const publicRatio = percent(publicCommitments, allCommitments);
  const habitPoints = habitCheckInsThisWeek * WEEKLY_HABIT_CHECKIN_POINTS;
  const miniPoints = miniCompletionsThisWeek * WEEKLY_MINI_COMPLETION_POINTS;

  const lifetimeCheckIns = totalLifetimeCheckIns([...habits]);
  const maxStreak = maxHabitStreak([...habits]);
  const repairs = computeRepairCounts(habits);
  const cleanCheckIns = Math.max(0, lifetimeCheckIns - repairs.total);
  const memoryProofs = countMemoryProofs(habits, miniMissions);
  const completedActions = lifetimeCheckIns + miniDoneTotal;
  const reflectionRate = percent(memoryProofs, completedActions);
  const publicMoments = countPublicMoments(habits, miniMissions);
  const miniMinutes = miniCompletedMinutes(miniMissions);
  const activeHabits = countActiveHabits([...habits]);
  const activeLoad = activeHabits + miniLiveTotal;

  const followThroughScore = computeFollowThrough(habits, now);
  const paceScore = score((Math.min(weeklyScore, 120) / 120) * 100);
  const trendScore = previousWeekScore > 0 ? score(50 + (weeklyDelta / Math.max(previousWeekScore, 30)) * 50) : weeklyScore > 0 ? 65 : 25;
  const momentumScore = score(paceScore * 0.62 + trendScore * 0.38);
  const executionVelocityScore = score(
    Math.min(100, (habitCheckInsThisWeek * 10 + miniCompletionsThisWeek * 14 + Math.min(miniMinutes / 15, 20) * 2)),
  );
  const repairRate = lifetimeCheckIns > 0 ? repairs.total / lifetimeCheckIns : 0;
  const recoveryScore = score(82 + Math.min(repairs.squad, 6) * 3 - repairs.solo * 7 - repairRate * 120);
  const reflectionScore = score(reflectionRate * 0.72 + Math.min(publicMoments, 10) * 2.8);
  const idealLoad = activeHabits > 0 ? 4 : 2;
  const focusLoadScore = activeLoad === 0 ? 35 : score(100 - Math.abs(activeLoad - idealLoad) * 15);
  const socialIncluded = communityEnabled;
  const socialEnergyScore = socialIncluded
    ? score(publicRatio * 0.35 + Math.min(publicMoments, 20) * 3.25)
    : 0;
  const consistencyScore = consistency;
  const personalGrowthScore =
    consistencyScore * 0.25 +
    followThroughScore * 0.2 +
    momentumScore * 0.15 +
    executionVelocityScore * 0.12 +
    recoveryScore * 0.1 +
    reflectionScore * 0.08 +
    focusLoadScore * 0.05;
  const growthScore = score(socialIncluded ? personalGrowthScore + socialEnergyScore * 0.05 : personalGrowthScore / 0.95);

  const missRisk =
    activeHabits === 0 ? "Idle" : consistency >= 70 ? "Low" : consistency >= 40 ? "Medium" : "High";
  const loadLabel =
    activeLoad === 0 ? "Idle" : activeLoad <= 2 ? "Light" : activeLoad <= 6 ? "Focused" : "Heavy";
  const todayKey = formatLocalDateKey(now);
  const nextAction = buildNextAction({
    habits,
    miniMissions,
    todayKey,
    xpToNextLevel,
    consistency,
    reflectionRate,
    pointsToNextTier,
    miniLiveTotal,
    weeklyDelta,
    level,
  });

  return {
    growthScore,
    consistencyScore,
    followThroughScore,
    momentumScore,
    executionVelocityScore,
    recoveryScore,
    reflectionScore,
    focusLoadScore,
    socialEnergyScore,
    socialIncluded,
    weeklyScore,
    previousWeekScore,
    weeklyDelta,
    projectedWeekPoints,
    pointPacePerDay,
    tier,
    habitCheckInsThisWeek,
    miniCompletionsThisWeek,
    habitPoints,
    miniPoints,
    pointsToNextTier,
    activeDays,
    consistency,
    last7CheckIns,
    bestDayLabel: bestDayPoint.count > 0 ? bestDayPoint.shortLabel : "None",
    activeHabits,
    lifetimeCheckIns,
    maxStreak,
    cleanCheckIns,
    repairedCheckIns: repairs.total,
    squadSaves: repairs.squad,
    soloRepairs: repairs.solo,
    memoryProofs,
    reflectionRate,
    publicRatio,
    publicMoments,
    habitDoneTotal,
    miniDoneTotal,
    miniLiveTotal,
    habitCompletionRate,
    miniCompletionRate,
    miniWeeklyAverage,
    miniCompletedMinutes: miniMinutes,
    xpToNextLevel,
    projectedLevelDays,
    missRisk,
    loadLabel,
    nextAction,
  };
}
