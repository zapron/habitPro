/**
 * Single mission clock for every member of a group challenge: calendar `start_date`
 * from `challenge_groups` anchored at 12:00 UTC. Keeps timers, slots, and window end
 * aligned for creator + late joiners (client remaps grid keys when switching anchors).
 */
export function canonicalGroupMissionHabitStartIso(startDateYmd: string | null): string {
  const nowIso = new Date().toISOString();
  if (!startDateYmd || typeof startDateYmd !== "string") return nowIso;
  const ymd = startDateYmd.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return nowIso;
  const ms = new Date(`${ymd}T12:00:00.000Z`).getTime();
  if (Number.isNaN(ms)) return nowIso;
  return new Date(ms).toISOString();
}

/** @deprecated alias — use canonicalGroupMissionHabitStartIso */
export const inviteeHabitStartIsoFromGroupStartDate = canonicalGroupMissionHabitStartIso;
