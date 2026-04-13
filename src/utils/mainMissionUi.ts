import type { Habit } from "../types/habit";
import { isMissionGridFull } from "./habitDerived";
import { isHabitMissionWindowClosed } from "./habitMissionWindow";

/**
 * Main mission detail: show the live timer only while the window is open, the grid
 * is not full, and the user has not submitted a mission report yet.
 */
export function shouldShowMainMissionTimer(habit: Habit, nowMs: number): boolean {
  if (habit.missionReport != null) return false;
  if (isMissionGridFull(habit)) return false;
  if (isHabitMissionWindowClosed(habit, nowMs)) return false;
  return true;
}

export function needsMainMissionOutcome(habit: Habit, nowMs: number): boolean {
  if (habit.missionReport != null) return false;
  return isMissionGridFull(habit) || isHabitMissionWindowClosed(habit, nowMs);
}

export function isMainMissionPlayableOnHome(habit: Habit, nowMs: number): boolean {
  if (habit.missionReport != null) return false;
  return !isMissionGridFull(habit) && !isHabitMissionWindowClosed(habit, nowMs);
}
