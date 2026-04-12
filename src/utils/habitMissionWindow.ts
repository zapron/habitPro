import type { Habit } from "../types/habit";
import { getActiveMissionDaySlot } from "./missionDaySlots";

/**
 * True when the mission timer/window has ended but the grid is not fully complete.
 * Manual missions also close when `endDate` has passed (countdown), even if slots disagree.
 */
export function isHabitMissionWindowClosed(habit: Habit, nowMs: number): boolean {
  if (habit.isCompleted) return false;
  const totalDays = Math.max(1, habit.totalDays ?? 21);
  if (
    habit.mode === "manual" &&
    habit.endDate &&
    nowMs >= new Date(habit.endDate).getTime()
  ) {
    return true;
  }
  return getActiveMissionDaySlot(habit.startDate, nowMs, totalDays) === null;
}
