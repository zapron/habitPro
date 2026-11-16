import type { StreakMemoryTaskEntry } from "../types/habit";

/**
 * The moment the user starred as the cover leads every gallery built from
 * these entries (Community post, share card, squad board). Everything else
 * keeps its order. No star = the original order.
 */
export function coverFirst<T extends { isCover?: boolean }>(entries: readonly T[]): T[] {
  const index = entries.findIndex((e) => e.isCover === true);
  if (index <= 0) return [...entries];
  return [entries[index], ...entries.slice(0, index), ...entries.slice(index + 1)];
}

/**
 * Stars `taskId` as the cover (only one cover at a time). Starring the
 * current cover again clears it.
 */
export function toggleCover(entries: readonly StreakMemoryTaskEntry[], taskId: string): StreakMemoryTaskEntry[] {
  const wasCover = entries.some((e) => e.taskId === taskId && e.isCover === true);
  return entries.map((e) => {
    const { isCover: _drop, ...rest } = e;
    return !wasCover && e.taskId === taskId ? { ...rest, isCover: true } : rest;
  });
}
