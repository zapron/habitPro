/**
 * Align all group-mission habits to `challenge_groups.start_date` so timers and
 * mission-day slots match across the squad. Remaps completion / memory keys in
 * the challenge creator's timezone when the stored `startDate` instant changes.
 */

import type { Habit, StreakMemory } from "../types/habit";
import { getDerivedState } from "./habitDerived";
import { canonicalGroupMissionHabitStartIso } from "./challengeInviteeStart";
import {
  getMissionCalendarTimeZone,
  legacyCalendarDateForMissionDayIndex,
  missionDayDateKey,
} from "./missionCalendarKeys";

export function calculateMissionEndDateFromStart(startIso: string, totalDays: number): string {
  const d = new Date(startIso);
  d.setDate(d.getDate() + Math.max(1, totalDays));
  return d.toISOString();
}

function findDayIndexForCalendarKey(
  startIso: string,
  dateKey: string,
  totalDays: number,
  timeZone: string,
): number | null {
  const td = Math.max(1, totalDays);
  for (let i = 0; i < td; i++) {
    const k = missionDayDateKey(startIso, i, timeZone);
    if (k === dateKey) return i;
    if (legacyCalendarDateForMissionDayIndex(startIso, i) === dateKey) return i;
  }
  return null;
}

export function remapCalendarKeysForGroupStartChange(
  oldStartIso: string,
  newStartIso: string,
  keys: string[],
  totalDays: number,
  timeZone: string,
): string[] {
  const td = Math.max(1, totalDays);
  const out: string[] = [];
  for (const key of keys) {
    const idx = findDayIndexForCalendarKey(oldStartIso, key, td, timeZone);
    if (idx == null) {
      out.push(key);
      continue;
    }
    const nk = missionDayDateKey(newStartIso, idx, timeZone);
    out.push(nk ?? key);
  }
  return [...new Set(out)].sort((a, b) => a.localeCompare(b));
}

export function remapStreakMemoriesForGroupStartChange(
  oldStartIso: string,
  newStartIso: string,
  memories: Record<string, StreakMemory> | undefined,
  totalDays: number,
  timeZone: string,
): Record<string, StreakMemory> | undefined {
  if (!memories || typeof memories !== "object") return memories;
  const out: Record<string, StreakMemory> = {};
  const td = Math.max(1, totalDays);
  for (const [key, mem] of Object.entries(memories)) {
    const idx = findDayIndexForCalendarKey(oldStartIso, key, td, timeZone);
    if (idx == null) {
      out[key] = mem;
      continue;
    }
    const nk = missionDayDateKey(newStartIso, idx, timeZone);
    out[nk ?? key] = mem;
  }
  return out;
}

function manualEndDateFromTemplate(
  canonicalStart: string,
  totalDays: number,
  habitTemplate?: Record<string, unknown> | null,
): string {
  const raw = habitTemplate?.endDate;
  if (typeof raw === "string" && raw.trim().length > 0) return raw.trim();
  return calculateMissionEndDateFromStart(canonicalStart, totalDays);
}

/**
 * Returns a new habit with canonical `startDate`, remapped dates/memories, and
 * manual `endDate` aligned to the group template when present.
 */
export function alignGroupHabitToChallengeStart(
  habit: Habit,
  groupStartDateYmd: string,
  habitTemplate?: Record<string, unknown> | null,
): Habit {
  if (!habit.challengeGroupId) return habit;

  const canonical = canonicalGroupMissionHabitStartIso(groupStartDateYmd);
  const tz = habit.challengeCreatorTimezone || getMissionCalendarTimeZone();
  const td = Math.max(1, habit.totalDays ?? 21);
  const repairedSet = new Set(habit.repairedDates ?? []);
  const mergedCompleted = habit.completedDates;

  const onlyUserCompleted = mergedCompleted.filter((d) => !repairedSet.has(d));
  const remappedUser = remapCalendarKeysForGroupStartChange(
    habit.startDate,
    canonical,
    onlyUserCompleted,
    td,
    tz,
  );
  const remappedRepaired = remapCalendarKeysForGroupStartChange(
    habit.startDate,
    canonical,
    [...repairedSet],
    td,
    tz,
  );
  const mergedForDerived = [...new Set([...remappedUser, ...remappedRepaired])].sort((a, b) =>
    a.localeCompare(b),
  );

  const nextMemories = remapStreakMemoriesForGroupStartChange(
    habit.startDate,
    canonical,
    habit.streakMemories,
    td,
    tz,
  );

  let endDate = habit.endDate;
  if (habit.mode === "manual") {
    endDate = manualEndDateFromTemplate(canonical, td, habitTemplate);
  }

  const d = getDerivedState(mergedForDerived, td, habit.missionReport);
  const streak = Math.max(d.streak, habit.streak);
  let status: Habit["status"] = d.status;
  if (!d.isCompleted && habit.status === "failed") status = "failed";

  return {
    ...habit,
    startDate: canonical,
    endDate,
    completedDates: d.normalized,
    streak,
    isCompleted: d.isCompleted,
    status,
    streakMemories: nextMemories,
    repairedDates: remappedRepaired,
  };
}
