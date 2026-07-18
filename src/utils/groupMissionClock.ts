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

function dayIndexMapForMission(
  startIso: string,
  totalDays: number,
  timeZone: string,
): Map<string, number> {
  const td = Math.max(1, totalDays);
  const out = new Map<string, number>();
  for (let i = 0; i < td; i++) {
    const key = missionDayDateKey(startIso, i, timeZone);
    if (key) out.set(key, i);
    const legacy = legacyCalendarDateForMissionDayIndex(startIso, i);
    if (!out.has(legacy)) out.set(legacy, i);
  }
  return out;
}

function missionDateKeysByIndex(
  startIso: string,
  totalDays: number,
  timeZone: string,
): string[] {
  const td = Math.max(1, totalDays);
  const out: string[] = [];
  for (let i = 0; i < td; i++) {
    out[i] = missionDayDateKey(startIso, i, timeZone) ?? legacyCalendarDateForMissionDayIndex(startIso, i);
  }
  return out;
}

export function remapCalendarKeysForGroupStartChange(
  oldStartIso: string,
  newStartIso: string,
  keys: string[],
  totalDays: number,
  timeZone: string,
): string[] {
  const oldIndexByKey = dayIndexMapForMission(oldStartIso, totalDays, timeZone);
  const newKeys = missionDateKeysByIndex(newStartIso, totalDays, timeZone);
  const out: string[] = [];
  for (const key of keys) {
    const idx = oldIndexByKey.get(key) ?? null;
    if (idx == null) {
      out.push(key);
      continue;
    }
    out.push(newKeys[idx] ?? key);
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
  const oldIndexByKey = dayIndexMapForMission(oldStartIso, totalDays, timeZone);
  const newKeys = missionDateKeysByIndex(newStartIso, totalDays, timeZone);
  const out: Record<string, StreakMemory> = {};
  for (const [key, mem] of Object.entries(memories)) {
    const idx = oldIndexByKey.get(key) ?? null;
    if (idx == null) {
      out[key] = mem;
      continue;
    }
    out[newKeys[idx] ?? key] = mem;
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

  const anchorTimeZone = habit.missionTimezone || habit.challengeCreatorTimezone || null;
  const canonical = canonicalGroupMissionHabitStartIso(groupStartDateYmd, anchorTimeZone);
  const tz = habit.missionTimezone || habit.challengeCreatorTimezone || getMissionCalendarTimeZone();
  const td = Math.max(1, habit.totalDays ?? 21);

  let endDate = habit.endDate;
  if (habit.mode === "manual") {
    endDate = manualEndDateFromTemplate(canonical, td, habitTemplate);
  }

  if (habit.startDate === canonical && habit.endDate === endDate) {
    return habit;
  }

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
