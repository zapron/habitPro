import type { Habit } from "../types/habit";
import { getStreakRepairXpCost, STREAK_REPAIR_WINDOW_HOURS } from "../constants/streakRepair";
import {
  MS_PER_MISSION_DAY,
  calendarDateForHabitMissionDayIndex,
  calendarDateKeyForTimestamp,
  calendarDayEndUtcMsForDateKey,
  getHabitActiveMissionDaySlot,
  getHabitMissionTimeZone,
  usesCalendarDayMission,
} from "./missionDaySlots";

export type EligibleStreakRepair = {
  dateStr: string;
  missionDayNumber: number;
  xpCost: number;
  isGroupMission: boolean;
};

/**
 * We currently only support repairing the immediately previous mission day,
 * and only within a fixed time window after that slot ended.
 */
export function getEligibleStreakRepair(habit: Habit, nowMs: number): EligibleStreakRepair | null {
  if (habit.missionReport != null) return null;
  if (!habit.startDate) return null;

  const slot = getHabitActiveMissionDaySlot(habit, nowMs);
  if (slot == null) return null;
  if (slot < 2) return null;

  const prevMissionDayNumber = slot - 1; // 1-based
  const prevIndex = prevMissionDayNumber - 1; // 0-based
  const dateStr = calendarDateForHabitMissionDayIndex(habit, prevIndex, nowMs);
  if (!dateStr) return null;
  if ((habit.completedDates ?? []).includes(dateStr)) return null;

  // A user who joined an existing group challenge mid-way never tracked days before
  // they joined — never offer a repair for one of those (see Habit.joinedChallengeAt).
  if (habit.joinedChallengeAt) {
    const joinDateKey = calendarDateKeyForTimestamp(
      new Date(habit.joinedChallengeAt).getTime(),
      getHabitMissionTimeZone(habit),
    );
    if (dateStr < joinDateKey) return null;
  }

  const prevEndMs = usesCalendarDayMission(habit)
    ? calendarDayEndUtcMsForDateKey(dateStr, getHabitMissionTimeZone(habit))
    : new Date(habit.startDate).getTime() + (slot - 1) * MS_PER_MISSION_DAY;
  const windowMs = STREAK_REPAIR_WINDOW_HOURS * 60 * 60 * 1000;
  if (nowMs > prevEndMs + windowMs) return null;

  // Avoid showing repair when the user hasn't started the mission at all.
  if ((habit.completedDates ?? []).length === 0) return null;

  return {
    dateStr,
    missionDayNumber: prevMissionDayNumber,
    xpCost: getStreakRepairXpCost(habit.streak ?? 0),
    isGroupMission: Boolean(habit.challengeGroupId),
  };
}

