import type { MiniMission } from "../types/habit";

export function getMiniMissionCompletionMode(m: MiniMission) {
  return m.completionMode === "timer_check_in" ? "timer_check_in" : "manual";
}

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

export function isMiniMissionAwaitingCheckIn(m: MiniMission, now: number): boolean {
  return (
    getMiniMissionCompletionMode(m) === "timer_check_in" &&
    !m.liveSquadId &&
    isMiniMissionTimerDepleted(m, now)
  );
}

export function isMiniMissionMissed(m: MiniMission, now: number): boolean {
  return m.status === "missed" || (isMiniMissionTimerDepleted(m, now) && !isMiniMissionAwaitingCheckIn(m, now));
}

export function isMiniMissionRunning(m: MiniMission, now: number): boolean {
  return m.status === "in_progress" && getMiniRemainingMs(m, now) > 0;
}

export function isMiniMissionOpen(m: MiniMission, now: number): boolean {
  return (
    m.status === "pending" ||
    m.status === "scheduled" ||
    isMiniMissionRunning(m, now) ||
    isMiniMissionAwaitingCheckIn(m, now)
  );
}

export type MiniMissionDisplayStatus = "active" | "queued" | "done" | "review" | "failed" | "cancelled";

export function getMiniMissionDisplayStatus(m: MiniMission, now: number): MiniMissionDisplayStatus {
  if (m.status === "completed") return "done";
  if (m.status === "cancelled") return "cancelled";
  if (m.status === "missed") return "failed";
  if (isMiniMissionAwaitingCheckIn(m, now)) return "review";
  if (isMiniMissionMissed(m, now)) return "failed";
  if (m.status === "pending" || m.status === "scheduled") return "queued";
  return "active";
}
