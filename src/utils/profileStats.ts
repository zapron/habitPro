import type { Habit, MiniMission } from "../types/habit";
import { startOfWeekMonday } from "./weekStats";

export type DayCheckInPoint = {
  /** YYYY-MM-DD local */
  dateKey: string;
  /** How many habits had a check-in that day */
  count: number;
  /** Short label for chart axis, e.g. "Mon" or "Today" */
  shortLabel: string;
};

export type MiniWeekBucket = {
  /** Start of week Monday YYYY-MM-DD (local) */
  weekStartKey: string;
  label: string;
  count: number;
};

const pad2 = (n: number) => String(n).padStart(2, "0");

/** Local calendar YYYY-MM-DD */
export function formatLocalDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function normalizeDayKey(raw: string): string {
  return raw.slice(0, 10);
}

/**
 * For each of the last `n` local calendar days, oldest first, count how many habits
 * had at least one check-in that day.
 */
export function lastNDaysHabitCheckInsPerDay(habits: Habit[], n: number, now: Date = new Date()): DayCheckInPoint[] {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const out: DayCheckInPoint[] = [];

  for (let offset = n - 1; offset >= 0; offset--) {
    const d = new Date(today);
    d.setDate(d.getDate() - offset);
    const dateKey = formatLocalDateKey(d);
    let count = 0;
    for (const h of habits) {
      const dates = h.completedDates ?? [];
      for (const raw of dates) {
        if (normalizeDayKey(raw) === dateKey) {
          count += 1;
          break;
        }
      }
    }
    const dow = d.getDay();
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const isToday = offset === 0;
    const shortLabel = isToday ? "Today" : dayNames[dow];
    out.push({ dateKey, count, shortLabel });
  }
  return out;
}

/** Sum of check-ins across all habits (total completed date entries). */
export function totalLifetimeCheckIns(habits: Habit[]): number {
  let n = 0;
  for (const h of habits) n += (h.completedDates ?? []).length;
  return n;
}

/** Max `habit.streak` across habits (store-maintained consecutive streak). */
export function maxHabitStreak(habits: Habit[]): number {
  let m = 0;
  for (const h of habits) m = Math.max(m, h.streak ?? 0);
  return m;
}

/** Habits that are not finished (still active campaign). */
export function countActiveHabits(habits: Habit[]): number {
  return habits.filter((h) => !h.isCompleted).length;
}

/**
 * Last `numWeeks` calendar weeks (Monday start), oldest bucket first.
 * Counts completed mini missions with `completedAt` in each week.
 */
export function miniCompletionsByWeekBuckets(
  missions: MiniMission[],
  numWeeks: number,
  now: Date = new Date(),
): MiniWeekBucket[] {
  const currentWeekStart = startOfWeekMonday(now);
  const buckets: MiniWeekBucket[] = [];

  for (let w = numWeeks - 1; w >= 0; w--) {
    const start = new Date(currentWeekStart);
    start.setDate(start.getDate() - w * 7);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    const startMs = start.getTime();
    const endMs = end.getTime() - 1;

    const weekStartKey = formatLocalDateKey(start);
    const isCurrentWeek = w === 0;
    const label = isCurrentWeek ? "This wk" : `${start.getMonth() + 1}/${start.getDate()}`;

    let count = 0;
    for (const m of missions) {
      if (m.status !== "completed" || !m.completedAt) continue;
      const t = new Date(m.completedAt).getTime();
      if (t >= startMs && t <= endMs) count += 1;
    }
    buckets.push({ weekStartKey, label, count });
  }
  return buckets;
}

/** Progress 0–1 toward the next weekly tier (same thresholds as `weeklyTierLabel`). */
export function weeklyTierProgressFraction(score: number): { fraction: number; nextTierName: string } {
  if (score >= 120) return { fraction: 1, nextTierName: "Mythic" };
  if (score >= 75) return { fraction: (score - 75) / (120 - 75), nextTierName: "Mythic" };
  if (score >= 40) return { fraction: (score - 40) / (75 - 40), nextTierName: "Gold" };
  if (score >= 15) return { fraction: (score - 15) / (40 - 15), nextTierName: "Silver" };
  return { fraction: score / 15, nextTierName: "Bronze" };
}

export function buildActivityChartA11ySummary(points: DayCheckInPoint[]): string {
  if (points.length === 0) return "No activity data.";
  const parts = points.map((p) => `${p.shortLabel} ${p.count} check-ins`);
  return `Last ${points.length} days: ${parts.join(", ")}.`;
}

export function buildMiniWeekA11ySummary(buckets: MiniWeekBucket[]): string {
  if (buckets.length === 0) return "No mini mission data.";
  const parts = buckets.map((b) => `${b.label} ${b.count} completed`);
  return `Last ${buckets.length} weeks: ${parts.join(", ")}.`;
}
