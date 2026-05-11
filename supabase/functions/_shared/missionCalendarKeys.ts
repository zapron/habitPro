/**
 * Keep in sync with `src/utils/missionCalendarKeys.ts` (`missionDayDateKey` + helpers).
 * Used by `process-streak-reminders` so server date keys match the app grid + `profiles.timezone`.
 */

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
  return Math.floor((endMs - startMs) / (24 * 60 * 60 * 1000));
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

export function missionDayDateKey(startIso: string, dayIndexZeroBased: number, timeZone: string): string | null {
  const base = ymdPartsInTz(startIso, timeZone);
  if (!base) return null;
  const { y, m, d } = addCalendarDaysYmd(base.y, base.m, base.d, dayIndexZeroBased);
  return `${y}-${pad2(m)}-${pad2(d)}`;
}
