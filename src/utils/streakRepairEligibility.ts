import type { Habit } from "../types/habit";
import { getStreakRepairXpCost, STREAK_REPAIR_WINDOW_HOURS } from "../constants/streakRepair";
import { MS_PER_MISSION_DAY, calendarDateForMissionDayIndex, getActiveMissionDaySlot } from "./missionDaySlots";

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

  const totalDays = habit.totalDays ?? 21;
  const slot = getActiveMissionDaySlot(habit.startDate, nowMs, totalDays);
  if (slot == null) return null;
  if (slot < 2) return null;

  const prevMissionDayNumber = slot - 1; // 1-based
  const prevIndex = prevMissionDayNumber - 1; // 0-based
  const dateStr = calendarDateForMissionDayIndex(habit.startDate, prevIndex);
  if (!dateStr) return null;
  if ((habit.completedDates ?? []).includes(dateStr)) return null;

  // Previous slot ended when the current slot began: start + (slot-1) days.
  const startMs = new Date(habit.startDate).getTime();
  const prevEndMs = startMs + (slot - 1) * MS_PER_MISSION_DAY;
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

