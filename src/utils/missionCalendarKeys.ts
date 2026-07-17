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

function ymdFromDateKey(dateKey: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey.trim());
  if (!m) return null;
  const y = Number.parseInt(m[1], 10);
  const mo = Number.parseInt(m[2], 10);
  const d = Number.parseInt(m[3], 10);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  return { y, m: mo, d };
}

function dateTimePartsInTz(ms: number, timeZone: string): {
  y: number;
  m: number;
  d: number;
  hh: number;
  mm: number;
  ss: number;
} | null {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(ms));
    const map: Record<string, string> = {};
    for (const p of parts) {
      if (p.type !== "literal") map[p.type] = p.value;
    }
    const y = Number.parseInt(map.year ?? "", 10);
    const m = Number.parseInt(map.month ?? "", 10);
    const d = Number.parseInt(map.day ?? "", 10);
    const hh = Number.parseInt(map.hour ?? "", 10);
    const mm = Number.parseInt(map.minute ?? "", 10);
    const ss = Number.parseInt(map.second ?? "", 10);
    if ([y, m, d, hh, mm, ss].some((n) => !Number.isFinite(n))) return null;
    return { y, m, d, hh, mm, ss };
  } catch {
    return null;
  }
}

function timeZoneOffsetMs(utcMs: number, timeZone: string): number {
  const p = dateTimePartsInTz(utcMs, timeZone);
  if (!p) return 0;
  const localAsUtc = Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm, p.ss);
  return localAsUtc - utcMs;
}

export function addCalendarDaysToDateKey(dateKey: string, days: number): string {
  const parts = ymdFromDateKey(dateKey);
  if (!parts) return dateKey;
  const next = addCalendarDaysYmd(parts.y, parts.m, parts.d, Math.floor(days));
  return `${next.y}-${pad2(next.m)}-${pad2(next.d)}`;
}

export function calendarDaysBetween(startKey: string, endKey: string): number {
  const start = ymdFromDateKey(startKey);
  const end = ymdFromDateKey(endKey);
  if (!start || !end) return 0;
  const startMs = Date.UTC(start.y, start.m - 1, start.d);
  const endMs = Date.UTC(end.y, end.m - 1, end.d);
  return Math.floor((endMs - startMs) / MS_PER_MISSION_DAY);
}

export function calendarDateKeyForTimestamp(ms: number, timeZone: string): string {
  const key = missionDayDateKey(new Date(ms).toISOString(), 0, timeZone);
  return key ?? new Date(ms).toISOString().slice(0, 10);
}

export function calendarDayStartUtcMsForDateKey(dateKey: string, timeZone: string): number {
  const parts = ymdFromDateKey(dateKey);
  if (!parts) return new Date(`${dateKey}T00:00:00.000Z`).getTime();
  const targetAsUtc = Date.UTC(parts.y, parts.m - 1, parts.d, 0, 0, 0);
  let utcMs = targetAsUtc - timeZoneOffsetMs(targetAsUtc, timeZone);
  utcMs = targetAsUtc - timeZoneOffsetMs(utcMs, timeZone);
  return utcMs;
}

export function calendarDayEndUtcMsForDateKey(dateKey: string, timeZone: string): number {
  return calendarDayStartUtcMsForDateKey(addCalendarDaysToDateKey(dateKey, 1), timeZone);
}

export function calendarDayEndUtcMsForTimestamp(ms: number, timeZone: string): number {
  const key = calendarDateKeyForTimestamp(ms, timeZone);
  return calendarDayEndUtcMsForDateKey(key, timeZone);
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

export function canonicalizeMissionDateKey(startDate: string, totalDays: number, key: string, timeZone?: string): string {
  return canonicalizeMissionDateKeyWithMap(canonicalDateKeyMap(startDate, totalDays, timeZone), key);
}

function canonicalDateKeyMap(startDate: string, totalDays: number, timeZone?: string): Map<string, string> {
  const out = new Map<string, string>();
  const td = Math.max(1, totalDays);
  for (let i = 0; i < td; i++) {
    const canonical = calendarDateForMissionDayIndex(startDate, i, timeZone);
    out.set(canonical, canonical);
    out.set(legacyCalendarDateForMissionDayIndex(startDate, i), canonical);
  }
  return out;
}

function canonicalizeMissionDateKeyWithMap(map: Map<string, string>, key: string): string {
  return map.get(key) ?? key;
}

export function canonicalizeMissionDateKeys(
  startDate: string,
  keys: string[],
  totalDays: number,
  timeZone?: string,
): string[] {
  const map = canonicalDateKeyMap(startDate, totalDays, timeZone);
  const mapped = keys.map((k) => canonicalizeMissionDateKeyWithMap(map, k));
  return [...new Set(mapped)].sort((a, b) => a.localeCompare(b));
}

export function canonicalizeStreakMemoryKeys(
  startDate: string,
  memories: Record<string, unknown> | undefined,
  totalDays: number,
  timeZone?: string,
): Record<string, unknown> | undefined {
  if (!memories || typeof memories !== "object") return memories;
  const map = canonicalDateKeyMap(startDate, totalDays, timeZone);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(memories)) {
    const nk = canonicalizeMissionDateKeyWithMap(map, k);
    out[nk] = v;
  }
  return out;
}
