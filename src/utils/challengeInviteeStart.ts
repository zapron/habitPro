/**
 * Build `habit.startDate` when an invitee accepts a group mission.
 * A naive `${start_date}T12:00:00.000Z` can still be in the future on the same
 * calendar day (before noon UTC), so autopilot `Timer` stays at 00:00:00:00.
 * Clamp so the stored start is never after "now".
 */
export function inviteeHabitStartIsoFromGroupStartDate(startDateYmd: string | null): string {
  const now = Date.now();
  if (!startDateYmd) return new Date(now).toISOString();
  const naiveUtc = new Date(`${startDateYmd}T12:00:00.000Z`).getTime();
  if (Number.isNaN(naiveUtc)) return new Date(now).toISOString();
  return new Date(Math.min(naiveUtc, now)).toISOString();
}
