import type { StreakMemoryTaskEntry } from "../types/habit";

/**
 * Photo order for a shared post. The user taps photos in the order they want
 * them shown; each tapped photo gets `shareOrder` 1, 2, 3… Photos without a
 * number follow in their original order. The first one is the cover.
 *
 * `isCover` is the older single-star version of this (shipped before tap
 * order). A starred photo counts as number 1 when nothing is numbered yet.
 */
type Orderable = { taskId: string; shareOrder?: number; isCover?: boolean; includedInShare?: boolean };

function numbered<T extends Orderable>(entries: readonly T[]): T[] {
  const withNumber = entries.filter((e) => typeof e.shareOrder === "number" && e.includedInShare !== false);
  if (withNumber.length > 0) {
    return [...withNumber].sort((a, b) => (a.shareOrder ?? 0) - (b.shareOrder ?? 0));
  }
  const legacy = entries.find((e) => e.isCover === true && e.includedInShare !== false);
  return legacy ? [legacy] : [];
}

/** Entries in post order: numbered photos first (1, 2, 3…), then the rest as they were. */
export function inShareOrder<T extends Orderable>(entries: readonly T[]): T[] {
  const first = numbered(entries);
  const ids = new Set(first.map((e) => e.taskId));
  return [...first, ...entries.filter((e) => !ids.has(e.taskId))];
}

/** The number shown on a photo (1-based), or null when it has none. */
export function shareOrderNumber(entries: readonly Orderable[], taskId: string): number | null {
  const index = numbered(entries).findIndex((e) => e.taskId === taskId);
  return index >= 0 ? index + 1 : null;
}

/** Writes `ids` as 1, 2, 3… and clears every other number and the old star. */
function renumber(entries: readonly StreakMemoryTaskEntry[], ids: string[]): StreakMemoryTaskEntry[] {
  return entries.map((e) => {
    const { shareOrder: _o, isCover: _c, ...rest } = e;
    const at = ids.indexOf(e.taskId);
    return at >= 0 ? { ...rest, shareOrder: at + 1 } : rest;
  });
}

/**
 * A tap on a photo: give it the next number, or take its number away (the
 * numbers after it move up by one).
 */
export function toggleShareOrder(entries: readonly StreakMemoryTaskEntry[], taskId: string): StreakMemoryTaskEntry[] {
  const ids = numbered(entries).map((e) => e.taskId);
  const at = ids.indexOf(taskId);
  if (at >= 0) ids.splice(at, 1);
  else ids.push(taskId);
  return renumber(entries, ids);
}

/** IN POST / HIDDEN. A hidden photo loses its number. */
export function toggleIncludedInShare(entries: readonly StreakMemoryTaskEntry[], taskId: string): StreakMemoryTaskEntry[] {
  const flipped = entries.map((e) =>
    e.taskId === taskId ? { ...e, includedInShare: e.includedInShare === false } : e,
  );
  const ids = numbered(flipped).map((e) => e.taskId);
  const hadNumbers = entries.some((e) => typeof e.shareOrder === "number" || e.isCover === true);
  return hadNumbers ? renumber(flipped, ids) : flipped;
}
