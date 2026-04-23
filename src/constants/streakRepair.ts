export const STREAK_REPAIR_WINDOW_HOURS = 24;

/** Solo + group: allow at most 1 repair per user per rolling window. */
export const STREAK_REPAIR_COOLDOWN_DAYS = 14;

/** Group missions: approvals required to apply a repair. */
export const STREAK_REPAIR_SQUAD_APPROVALS_REQUIRED = 2;

/**
 * XP cost curve for streak repair.
 * Uses the user's current streak length as a proxy for "how valuable" the repair is.
 */
export function getStreakRepairXpCost(streakLen: number): number {
  const s = Math.max(0, Math.floor(streakLen));
  if (s <= 3) return 40;
  if (s <= 7) return 80;
  if (s <= 14) return 120;
  return 180;
}

/**
 * Group missions: we default to squad approval (no self-approve) to reduce abuse.
 * You can flip this later if you want a higher-cost self repair option.
 */
export const STREAK_REPAIR_ALLOW_GROUP_SELF_APPROVE = false;

