/**
 * Consecutive streak + completion flags derived from completed date strings.
 * Shared by the store, AsyncStorage rehydration, and Supabase row mapping.
 */

const normalizeCompletedDates = (dates: string[]) =>
  [...new Set(dates)].sort((a, b) => a.localeCompare(b));

/**
 * Current consecutive streak ending today or yesterday.
 * If the user hasn't completed today AND hasn't completed yesterday, streak = 0.
 */
export function getConsecutiveStreak(sortedDates: string[]): number {
  if (sortedDates.length === 0) return 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const todayStr = fmt(today);
  const yesterdayStr = fmt(yesterday);

  const dateSet = new Set(sortedDates);

  if (!dateSet.has(todayStr) && !dateSet.has(yesterdayStr)) return 0;

  let cursor = dateSet.has(todayStr) ? new Date(today) : new Date(yesterday);
  let streak = 0;

  while (true) {
    const key = fmt(cursor);
    if (!dateSet.has(key)) break;
    streak++;
    cursor.setDate(cursor.getDate() - 1);
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
