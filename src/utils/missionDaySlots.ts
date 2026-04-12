import type { Habit } from "../types/habit";

/** One mission "day" = 24 hours from mission start (not calendar midnight). */
export const MS_PER_MISSION_DAY = 24 * 60 * 60 * 1000;

/** Calendar YYYY-MM-DD for grid index `dayIndexZeroBased` (0 = day 1 label). */
export function calendarDateForMissionDayIndex(startIso: string, dayIndexZeroBased: number): string {
  const start = new Date(startIso);
  start.setDate(start.getDate() + dayIndexZeroBased);
  return start.toISOString().split("T")[0];
}

/**
 * Which mission day (1 … totalDays) is active right now: floor(elapsed / 24h) + 1.
 * Returns null after the last slot has ended (no check-ins left).
 */
export function getActiveMissionDaySlot(startIso: string, nowMs: number, totalDays: number): number | null {
  const td = Math.max(1, totalDays);
  const startMs = new Date(startIso).getTime();
  const elapsed = Math.max(0, nowMs - startMs);
  const rawSlot = Math.floor(elapsed / MS_PER_MISSION_DAY) + 1;
  if (rawSlot > td) return null;
  return Math.max(1, rawSlot);
}

/** Map a stored calendar date to mission day number (1-based), or null if not in this mission. */
export function missionDayNumberForCalendarDate(habit: Habit, dateStr: string): number | null {
  const td = Math.max(1, habit.totalDays ?? 21);
  for (let i = 0; i < td; i++) {
    if (calendarDateForMissionDayIndex(habit.startDate, i) === dateStr) {
      return i + 1;
    }
  }
  return null;
}

/** Whether this calendar date may be toggled (only the current 24h slot). */
export function isHabitCalendarDateToggleable(habit: Habit, dateStr: string, nowMs: number): boolean {
  if (
    habit.mode === "manual" &&
    habit.endDate &&
    nowMs >= new Date(habit.endDate).getTime()
  ) {
    return false;
  }
  const day = missionDayNumberForCalendarDate(habit, dateStr);
  if (day == null) return false;
  const slot = getActiveMissionDaySlot(habit.startDate, nowMs, habit.totalDays ?? 21);
  if (slot == null) return false;
  return day === slot;
}
