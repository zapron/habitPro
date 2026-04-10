import type { MiniMission } from "../types/habit";

/** Remaining time for an in-progress mission; 0 means timer depleted (failed). */
export function getMiniRemainingMs(m: MiniMission, now: number): number {
  if (m.status !== "in_progress" || !m.startedAt) return 0;
  const totalMinutes = m.estimatedMinutes + (m.extendedMinutes ?? 0);
  const totalMs = totalMinutes * 60 * 1000;
  const elapsedMs = now - new Date(m.startedAt).getTime();
  return Math.max(0, totalMs - elapsedMs);
}
