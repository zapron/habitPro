import type { Habit, MiniMission } from "../types/habit";

export const WEEKLY_HABIT_CHECKIN_POINTS = 25;
export const WEEKLY_MINI_COMPLETION_POINTS = 12;

/** Monday 00:00 local time for the week containing `d`. */
export function startOfWeekMonday(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function weekRangeMs(now: Date = new Date()): { startMs: number; endMs: number } {
  const start = startOfWeekMonday(now);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  end.setMilliseconds(-1);
  return { startMs: start.getTime(), endMs: end.getTime() };
}

export function countHabitCheckInsThisWeek(habits: Habit[], now: Date = new Date()): number {
  const { startMs, endMs } = weekRangeMs(now);
  let n = 0;
  for (const h of habits) {
    const seenDatesForHabit = new Set<string>();
    for (const raw of h.completedDates ?? []) {
      const day = raw.slice(0, 10);
      if (seenDatesForHabit.has(day)) continue;
      const t = new Date(day + "T12:00:00").getTime();
      if (t >= startMs && t <= endMs) {
        seenDatesForHabit.add(day);
        n += 1;
      }
    }
  }
  return n;
}

export function countMiniCompletionsThisWeek(missions: MiniMission[], now: Date = new Date()): number {
  const { startMs, endMs } = weekRangeMs(now);
  let n = 0;
  for (const m of missions) {
    if (m.status !== "completed" || !m.completedAt) continue;
    const t = new Date(m.completedAt).getTime();
    if (t >= startMs && t <= endMs) n += 1;
  }
  return n;
}

/** Lightweight score for solo “tier” copy (local only). */
export function weeklyCompeteScore(
  habits: Habit[],
  miniMissions: MiniMission[],
  _level: number,
  now: Date = new Date(),
): number {
  const days = countHabitCheckInsThisWeek(habits, now);
  const minis = countMiniCompletionsThisWeek(miniMissions, now);
  return days * WEEKLY_HABIT_CHECKIN_POINTS + minis * WEEKLY_MINI_COMPLETION_POINTS;
}

export function weeklyTierLabel(score: number): { label: string; detail: string } {
  if (score >= 120) return { label: "Mythic", detail: "You are on fire this week." };
  if (score >= 75) return { label: "Gold", detail: "Strong consistency." };
  if (score >= 40) return { label: "Silver", detail: "Solid momentum." };
  if (score >= 15) return { label: "Bronze", detail: "Keep building the habit." };
  return { label: "Rookie", detail: "Log a few days to climb the ranks." };
}
