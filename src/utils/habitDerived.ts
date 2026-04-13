/**
 * Consecutive streak + completion flags derived from completed date strings.
 * Shared by the store, AsyncStorage rehydration, and Supabase row mapping.
 */

const normalizeCompletedDates = (dates: string[]) =>
  [...new Set(dates)].sort((a, b) => a.localeCompare(b));

/** YYYY-MM-DD in UTC — must match mission grid + sync (`calendarDateForMissionDayIndex` / `toISOString().split("T")[0]`). */
function utcCalendarKey(d: Date): string {
  return d.toISOString().split("T")[0];
}

/**
 * Current consecutive streak ending on the latest UTC calendar day or the day before.
 * Uses UTC dates only so this matches stored `completed_dates` (see missionDaySlots).
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

export function getDerivedState(completedDates: string[], totalDays: number) {
  const td = Math.max(1, totalDays);
  const normalized = normalizeCompletedDates(completedDates);
  const streak = getConsecutiveStreak(normalized);
  const isCompleted = normalized.length >= td;
  const status = (isCompleted ? "completed" : "active") as "active" | "completed" | "failed";

  return { normalized, streak, isCompleted, status, totalDays: td };
}
