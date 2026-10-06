import type { MiniMission } from "../types/habit";
import { calendarDayEndUtcMsForTimestamp, getMissionCalendarTimeZone } from "./missionCalendarKeys";

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
    // A timed-out freeform mission gets the same "did you complete this?"
    // review as Timer Check-In mode, instead of failing automatically — a
    // fixed timer doesn't fit freeform capture well (you're logging moments
    // as they happen, not racing a single deadline), so the user gets a
    // chance to mark it complete with whatever was captured. Live Squad
    // missions are excluded — those use the shared squad board's own
    // missed/retry semantics, not this local single-player flow. This was
    // previously only patched into app/mini/[id].tsx's own local check, not
    // here — every other screen that calls this helper directly (the mini
    // missions list/tabs, missed-counters) kept showing an expired freeform
    // mission as "Failed" with a Retry-only action, even though the detail
    // screen still correctly offered a working Complete path underneath.
    (getMiniMissionCompletionMode(m) === "timer_check_in" || m.captureMode === "freeform") &&
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

/**
 * A completed mission can still be published (or re-published) to Community
 * up through midnight of the calendar day it was completed on — after that,
 * the squad board it would have appeared "live" alongside has moved past
 * that day, so publishing stops making sense. This replaces an old
 * permanent lock (set the instant you declined to publish at completion, or
 * got interrupted — e.g. a sandboxed payment gateway — with no way back)
 * with a same-day window, same day-boundary math the streak-repair window
 * already uses.
 */
export function isMiniMissionPublishWindowOpen(m: MiniMission, now: number): boolean {
  if (!m.completedAt) return false;
  const cutoffMs = calendarDayEndUtcMsForTimestamp(new Date(m.completedAt).getTime(), getMissionCalendarTimeZone());
  return now <= cutoffMs;
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
