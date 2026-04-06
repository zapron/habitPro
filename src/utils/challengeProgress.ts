import type { ChallengeTemplate, ChallengeProgressView } from "../types/challenge";
import type { Habit, MiniMission } from "../types/habit";

function enrollmentWindow(startIso: string, durationDays: number): { startMs: number; endMs: number } {
  const start = new Date(startIso).getTime();
  const end = start + durationDays * 24 * 60 * 60 * 1000;
  return { startMs: start, endMs: end };
}

/** Distinct calendar days (YYYY-MM-DD) with ≥1 habit completion in [startMs, endMs]. */
export function countHabitCompletionDaysInWindow(
  habits: Habit[],
  startMs: number,
  endMs: number,
): number {
  const days = new Set<string>();
  for (const h of habits) {
    for (const raw of h.completedDates ?? []) {
      const day = raw.slice(0, 10);
      const t = new Date(day + "T12:00:00").getTime();
      if (t >= startMs && t <= endMs) days.add(day);
    }
  }
  return days.size;
}

export function countMiniCompletionsInWindow(
  missions: MiniMission[],
  startMs: number,
  endMs: number,
): number {
  let n = 0;
  for (const m of missions) {
    if (m.status !== "completed" || !m.completedAt) continue;
    const t = new Date(m.completedAt).getTime();
    if (t >= startMs && t <= endMs) n += 1;
  }
  return n;
}

export function maxHabitStreak(habits: Habit[]): number {
  let max = 0;
  for (const h of habits) {
    if (h.streak > max) max = h.streak;
  }
  return max;
}

export function computeChallengeProgress(
  template: ChallengeTemplate,
  startedAt: string,
  habits: Habit[],
  miniMissions: MiniMission[],
  nowMs: number = Date.now(),
): ChallengeProgressView {
  const { startMs, endMs } = enrollmentWindow(startedAt, template.durationDays);
  const pastEnd = nowMs > endMs;

  let current = 0;
  if (template.metric === "habit_days") {
    current = countHabitCompletionDaysInWindow(habits, startMs, endMs);
  } else if (template.metric === "mini_completions") {
    current = countMiniCompletionsInWindow(miniMissions, startMs, endMs);
  } else {
    current = maxHabitStreak(habits) >= 3 ? 1 : 0;
  }

  const target = template.target;
  const done =
    template.metric === "min_streak" ? maxHabitStreak(habits) >= 3 : current >= target;
  const ratio =
    target <= 0 ? 0 : template.metric === "min_streak" ? (done ? 1 : 0) : Math.min(1, current / target);

  return {
    current,
    target,
    ratio,
    done,
    expired: pastEnd && !done,
    endsAtMs: endMs,
  };
}
