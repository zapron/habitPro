/** Matches Home / Compete / Profile: 100 XP per level. */
export function levelFromTotalXp(xp: number): number {
  return Math.floor(Math.max(0, xp) / 100);
}
