import type { Habit } from "../types/habit";
import {
  MS_PER_MISSION_DAY,
  addCalendarDaysToDateKey,
  calendarDateForMissionDayIndex,
  calendarDateKeyForTimestamp,
  calendarDayEndUtcMsForDateKey,
  calendarDaysBetween,
  getMissionCalendarTimeZone,
} from "./missionCalendarKeys";

export {
  MS_PER_MISSION_DAY,
  addCalendarDaysToDateKey,
  calendarDateForMissionDayIndex,
  calendarDateKeyForTimestamp,
  calendarDayEndUtcMsForDateKey,
  getMissionCalendarTimeZone,
  missionDayDateKey,
} from "./missionCalendarKeys";

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

export function usesCalendarDayMission(habit: Habit): boolean {
  return (
    (typeof habit.missionTimezone === "string" && habit.missionTimezone.trim().length > 0) ||
    (typeof habit.challengeCreatorTimezone === "string" && habit.challengeCreatorTimezone.trim().length > 0)
  );
}

export function getHabitMissionTimeZone(habit: Habit): string {
  const missionTz = habit.missionTimezone?.trim();
  if (missionTz) return missionTz;
  const groupTz = habit.challengeCreatorTimezone?.trim();
  if (groupTz) return groupTz;
  return getMissionCalendarTimeZone();
}

function creationDateKey(habit: Habit, timeZone: string): string {
  return calendarDateForMissionDayIndex(habit.startDate, 0, timeZone);
}

function creationDayCompleted(habit: Habit, creationKey: string): boolean {
  return (habit.completedDates ?? []).includes(creationKey);
}

export function isHabitCreationGraceDay(habit: Habit, nowMs: number): boolean {
  if (!usesCalendarDayMission(habit)) return false;
  const tz = getHabitMissionTimeZone(habit);
  const createdKey = creationDateKey(habit, tz);
  const todayKey = calendarDateKeyForTimestamp(nowMs, tz);
  return todayKey === createdKey && !creationDayCompleted(habit, createdKey);
}

export function getHabitActiveMissionDaySlot(habit: Habit, nowMs: number): number | null {
  const totalDays = Math.max(1, habit.totalDays ?? 21);
  if (!usesCalendarDayMission(habit)) {
    return getActiveMissionDaySlot(habit.startDate, nowMs, totalDays);
  }

  const tz = getHabitMissionTimeZone(habit);
  const createdKey = creationDateKey(habit, tz);
  const todayKey = calendarDateKeyForTimestamp(nowMs, tz);
  if (todayKey < createdKey) return null;

  const createdCompleted = creationDayCompleted(habit, createdKey);
  let slot: number;
  if (createdCompleted) {
    slot = calendarDaysBetween(createdKey, todayKey) + 1;
  } else if (todayKey === createdKey) {
    slot = 1;
  } else {
    const firstRequiredKey = addCalendarDaysToDateKey(createdKey, 1);
    slot = calendarDaysBetween(firstRequiredKey, todayKey) + 1;
  }

  if (slot > totalDays) return null;
  return Math.max(1, slot);
}

export function calendarDateForHabitMissionDayIndex(
  habit: Habit,
  dayIndexZeroBased: number,
  nowMs: number = Date.now(),
): string {
  if (!usesCalendarDayMission(habit)) {
    return calendarDateForMissionDayIndex(habit.startDate, dayIndexZeroBased);
  }

  const tz = getHabitMissionTimeZone(habit);
  const createdKey = creationDateKey(habit, tz);
  const todayKey = calendarDateKeyForTimestamp(nowMs, tz);
  const createdCompleted = creationDayCompleted(habit, createdKey);
  const creationDayIsCurrentGrace = todayKey === createdKey && !createdCompleted;
  const offset =
    createdCompleted || creationDayIsCurrentGrace
      ? dayIndexZeroBased
      : dayIndexZeroBased + 1;
  return addCalendarDaysToDateKey(createdKey, offset);
}

export function getHabitActiveMissionDateKey(habit: Habit, nowMs: number): string | null {
  const slot = getHabitActiveMissionDaySlot(habit, nowMs);
  if (slot == null) return null;
  return calendarDateForHabitMissionDayIndex(habit, slot - 1, nowMs);
}

export function getHabitActiveMissionDayEndMs(habit: Habit, nowMs: number): number | null {
  if (!usesCalendarDayMission(habit)) {
    const slot = getActiveMissionDaySlot(habit.startDate, nowMs, habit.totalDays ?? 21);
    if (slot == null) return null;
    return new Date(habit.startDate).getTime() + slot * MS_PER_MISSION_DAY;
  }
  const dateKey = getHabitActiveMissionDateKey(habit, nowMs);
  if (!dateKey) return null;
  return calendarDayEndUtcMsForDateKey(dateKey, getHabitMissionTimeZone(habit));
}

/** Map a stored calendar date to mission day number (1-based), or null if not in this mission. */
export function missionDayNumberForCalendarDate(habit: Habit, dateStr: string, nowMs: number = Date.now()): number | null {
  const td = Math.max(1, habit.totalDays ?? 21);
  for (let i = 0; i < td; i++) {
    if (calendarDateForHabitMissionDayIndex(habit, i, nowMs) === dateStr) {
      return i + 1;
    }
  }
  return null;
}

export function missionDayNumberMapForHabit(habit: Habit, nowMs: number = Date.now()): Map<string, number> {
  const td = Math.max(1, habit.totalDays ?? 21);
  const out = new Map<string, number>();
  for (let i = 0; i < td; i++) {
    out.set(calendarDateForHabitMissionDayIndex(habit, i, nowMs), i + 1);
  }
  return out;
}

/** Whether this calendar date may be toggled (only the current 24h slot). */
export function isHabitCalendarDateToggleable(habit: Habit, dateStr: string, nowMs: number): boolean {
  if (!usesCalendarDayMission(habit)) {
    if (
      habit.mode === "manual" &&
      habit.endDate &&
      nowMs >= new Date(habit.endDate).getTime()
    ) {
      return false;
    }
    const day = missionDayNumberForCalendarDate(habit, dateStr, nowMs);
    if (day == null) return false;
    const slot = getActiveMissionDaySlot(habit.startDate, nowMs, habit.totalDays ?? 21);
    if (slot == null) return false;
    return day === slot;
  }

  const slot = getHabitActiveMissionDaySlot(habit, nowMs);
  if (slot == null) return false;
  return calendarDateForHabitMissionDayIndex(habit, slot - 1, nowMs) === dateStr;
}
