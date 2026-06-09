/**
 * Consecutive streak + completion flags derived from completed date strings.
 * Shared by the store, AsyncStorage rehydration, and Supabase row mapping.
 */

import type { MissionReport } from "../types/habit";

const normalizeCompletedDates = (dates: string[]) =>
  [...new Set(dates)].sort((a, b) => a.localeCompare(b));

/** YYYY-MM-DD keys from `missionCalendarKeys` / mission grid (IANA calendar days, aligned with streak reminders). */
function utcCalendarKey(d: Date): string {
  return d.toISOString().split("T")[0];
}

/**
 * Current consecutive streak ending on the latest UTC calendar day or the day before.
 * Uses UTC “today/yesterday” for streak length; grid keys still come from mission calendar helpers.
 * Local-calendar logic previously mismatched those strings and showed 0 on cohort / after sync.
 */
export function getConsecutiveStreak(sortedDates: string[]): number {
  if (sortedDates.length === 0) return 0;

  const now = new Date();
  const dateSet = new Set(sortedDates);

  const todayUtc = utcCalendarKey(now);
  const y = now.getUTCFullYear();
  const mo = now.getUTCMonth();
  const day = now.getUTCDate();
  const yday = new Date(Date.UTC(y, mo, day, 12, 0, 0));
  yday.setUTCDate(yday.getUTCDate() - 1);
  const yesterdayUtc = utcCalendarKey(yday);

  if (!dateSet.has(todayUtc) && !dateSet.has(yesterdayUtc)) return 0;

  /** Noon UTC avoids DST edge cases when stepping days. */
  let cursor = new Date(Date.UTC(y, mo, day, 12, 0, 0));
  if (!dateSet.has(todayUtc)) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  let streak = 0;
  while (dateSet.has(utcCalendarKey(cursor))) {
    streak++;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  return streak;
}

export type DerivedHabitNumericState = {
  normalized: string[];
  streak: number;
  totalDays: number;
  gridFull: boolean;
};

/** Streak + grid fullness from dates only (no mission outcome). */
export function getDerivedDatesState(
  completedDates: string[],
  totalDays: number,
): DerivedHabitNumericState {
  const td = Math.max(1, totalDays);
  const normalized = normalizeCompletedDates(completedDates);
  const streak = getConsecutiveStreak(normalized);
  const gridFull = normalized.length >= td;
  return { normalized, streak, totalDays: td, gridFull };
}

/**
 * Full habit flags. `isCompleted` is true only when the user chose **Accomplished** in mission reports.
 * A full grid alone no longer marks the mission completed until that confirmation.
 */
export function getDerivedState(
  completedDates: string[],
  totalDays: number,
  missionReport?: MissionReport | null,
) {
  const { normalized, streak, totalDays: td, gridFull } = getDerivedDatesState(
    completedDates,
    totalDays,
  );

  let isCompleted = false;
  let status: "active" | "completed" | "failed" = "active";

  if (missionReport === "accomplished") {
    isCompleted = true;
    status = "completed";
  } else if (missionReport === "failed") {
    isCompleted = false;
    status = "failed";
  }

  return { normalized, streak, isCompleted, status, totalDays: td, gridFull };
}

/** Every mission day has a check-in (grid full); does not imply user marked Accomplished. */
export function isMissionGridFull(habit: {
  completedDates: string[];
  totalDays: number;
}): boolean {
  const totalDays = Math.max(1, habit.totalDays ?? 21);
  const seen = new Set<string>();
  for (const date of habit.completedDates ?? []) {
    seen.add(date);
    if (seen.size >= totalDays) return true;
  }
  return false;
}
