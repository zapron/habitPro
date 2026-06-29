const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function parseDateKey(value: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isFinite(year) || month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

function partsFromDate(value: Date): { year: number; month: number; day: number } | null {
  if (Number.isNaN(value.getTime())) return null;
  return { year: value.getFullYear(), month: value.getMonth() + 1, day: value.getDate() };
}

function formatParts(parts: { year: number; month: number; day: number }): string {
  const yy = pad2(parts.year % 100);
  return `${pad2(parts.day)}-${MONTHS[parts.month - 1]}-${yy}`;
}

export function formatDateDisplay(value: string | Date | null | undefined, fallback = ""): string {
  if (!value) return fallback;
  if (value instanceof Date) {
    const parts = partsFromDate(value);
    return parts ? formatParts(parts) : fallback;
  }

  const dateKeyParts = parseDateKey(value);
  if (dateKeyParts) return formatParts(dateKeyParts);

  const d = new Date(value);
  const parts = partsFromDate(d);
  return parts ? formatParts(parts) : fallback;
}

export function formatTimeDisplay(value: string | Date | null | undefined, fallback = ""): string {
  if (!value) return fallback;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return fallback;
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(d);
}

export function formatDateTimeDisplay(value: string | Date | null | undefined, fallback = ""): string {
  if (!value) return fallback;
  if (typeof value === "string" && parseDateKey(value)) return formatDateDisplay(value, fallback);
  const date = formatDateDisplay(value, fallback);
  const time = formatTimeDisplay(value);
  if (!date || !time) return date || fallback;
  return `${date} · ${time}`;
}
