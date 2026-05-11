import { calendarDayStartUtcMsForDateKey } from "./missionCalendarKeys";

/**
 * Single mission clock for every member of a group challenge.
 * New calendar-day groups anchor at creator-local midnight. Legacy groups without
 * a mission timezone keep the historical 12:00 UTC anchor.
 */
export function canonicalGroupMissionHabitStartIso(startDateYmd: string | null, timeZone?: string | null): string {
  const nowIso = new Date().toISOString();
  if (!startDateYmd || typeof startDateYmd !== "string") return nowIso;
  const ymd = startDateYmd.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return nowIso;
  const tz = typeof timeZone === "string" && timeZone.trim().length > 0 ? timeZone.trim() : null;
  const ms = tz
    ? calendarDayStartUtcMsForDateKey(ymd, tz)
    : new Date(`${ymd}T12:00:00.000Z`).getTime();
  if (Number.isNaN(ms)) return nowIso;
  return new Date(ms).toISOString();
}

/** @deprecated alias — use canonicalGroupMissionHabitStartIso */
export const inviteeHabitStartIsoFromGroupStartDate = canonicalGroupMissionHabitStartIso;
