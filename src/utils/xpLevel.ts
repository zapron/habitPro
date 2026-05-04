export const XP_PER_LEVEL = 250;

export function levelFromTotalXp(xp: number): number {
  return Math.floor(Math.max(0, xp) / XP_PER_LEVEL);
}

export function xpInCurrentLevel(xp: number): number {
  return Math.max(0, xp) % XP_PER_LEVEL;
}

export function xpProgressInCurrentLevel(xp: number): number {
  return xpInCurrentLevel(xp) / XP_PER_LEVEL;
}
