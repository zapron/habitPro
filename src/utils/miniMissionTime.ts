import type { MiniMission } from "../types/habit";

/** Remaining time for an in-progress mission; 0 means timer depleted (failed). */
export function getMiniRemainingMs(m: MiniMission, now: number): number {
  if (m.status !== "in_progress" || !m.startedAt) return 0;
  const totalMinutes = m.estimatedMinutes + (m.extendedMinutes ?? 0);
  const totalMs = totalMinutes * 60 * 1000;
  const elapsedMs = now - new Date(m.startedAt).getTime();
  return Math.max(0, totalMs - elapsedMs);
}

export function isMiniMissionTimerDepleted(m: MiniMission, now: number): boolean {
  return m.status === "in_progress" && Boolean(m.startedAt) && getMiniRemainingMs(m, now) <= 0;
}

export function isMiniMissionRunning(m: MiniMission, now: number): boolean {
  return m.status === "in_progress" && getMiniRemainingMs(m, now) > 0;
}

export function isMiniMissionOpen(m: MiniMission, now: number): boolean {
  return m.status === "pending" || m.status === "scheduled" || isMiniMissionRunning(m, now);
}

export type MiniMissionDisplayStatus = "active" | "queued" | "done" | "failed" | "cancelled";

export function getMiniMissionDisplayStatus(m: MiniMission, now: number): MiniMissionDisplayStatus {
  if (m.status === "completed") return "done";
  if (m.status === "cancelled") return "cancelled";
  if (isMiniMissionTimerDepleted(m, now)) return "failed";
  if (m.status === "pending" || m.status === "scheduled") return "queued";
  return "active";
}
