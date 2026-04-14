/**
 * Mission grid date keys (YYYY-MM-DD) aligned with `process-streak-reminders` and `profiles.timezone`.
 * Uses IANA calendar math — not `Date#setDate` + `toISOString` (which mixed local days with UTC dates).
 */

export const MS_PER_MISSION_DAY = 24 * 60 * 60 * 1000;

export function getMissionCalendarTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function ymdPartsInTz(iso: string, timeZone: string): { y: number; m: number; d: number } | null {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));
  const map: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== "literal") map[p.type] = p.value;
  }
  if (!map.year || !map.month || !map.day) return null;
  const y = Number.parseInt(map.year, 10);
  const m = Number.parseInt(map.month, 10);
  const d = Number.parseInt(map.day, 10);
  if (Number.isNaN(y) || Number.isNaN(m) || Number.isNaN(d)) return null;
  return { y, m, d };
}

function addCalendarDaysYmd(y: number, m: number, d: number, days: number): { y: number; m: number; d: number } {
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

/**
 * Calendar label for mission day index (0 = day 1). Must match streak reminder `reminder_date` when
 * `timeZone` equals `profiles.timezone` (synced from the device on login / resume).
 */
export function missionDayDateKey(startIso: string, dayIndexZeroBased: number, timeZone: string): string | null {
  const base = ymdPartsInTz(startIso, timeZone);
  if (!base) return null;
  const { y, m, d } = addCalendarDaysYmd(base.y, base.m, base.d, dayIndexZeroBased);
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

/**
 * Calendar YYYY-MM-DD for grid index `dayIndexZeroBased` (0 = mission day 1 label).
 * Defaults to device IANA zone — keep `profiles.timezone` in sync via `syncProfileTimezone`.
 */
export function calendarDateForMissionDayIndex(startIso: string, dayIndexZeroBased: number, timeZone?: string): string {
  const tz = timeZone ?? getMissionCalendarTimeZone();
  const key = missionDayDateKey(startIso, dayIndexZeroBased, tz);
  if (key) return key;
  const start = new Date(startIso);
  start.setDate(start.getDate() + dayIndexZeroBased);
  return start.toISOString().split("T")[0];
}

/** Pre–missionCalendarKeys client used local `setDate` + UTC ISO day — remap to canonical keys. */
export function legacyCalendarDateForMissionDayIndex(startIso: string, dayIndexZeroBased: number): string {
  const start = new Date(startIso);
  start.setDate(start.getDate() + dayIndexZeroBased);
  return start.toISOString().split("T")[0];
}

export function canonicalizeMissionDateKey(startDate: string, totalDays: number, key: string): string {
  const td = Math.max(1, totalDays);
  for (let i = 0; i < td; i++) {
    const canonical = calendarDateForMissionDayIndex(startDate, i);
    if (key === canonical) return key;
    if (key === legacyCalendarDateForMissionDayIndex(startDate, i)) return canonical;
  }
  return key;
}

export function canonicalizeMissionDateKeys(startDate: string, keys: string[], totalDays: number): string[] {
  const mapped = keys.map((k) => canonicalizeMissionDateKey(startDate, totalDays, k));
  return [...new Set(mapped)].sort((a, b) => a.localeCompare(b));
}

export function canonicalizeStreakMemoryKeys(
  startDate: string,
  memories: Record<string, unknown> | undefined,
  totalDays: number,
): Record<string, unknown> | undefined {
  if (!memories || typeof memories !== "object") return memories;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(memories)) {
    const nk = canonicalizeMissionDateKey(startDate, totalDays, k);
    out[nk] = v;
  }
  return out;
}
