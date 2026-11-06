import type { Habit } from "../../types/habit";
import {
  calendarDateForHabitMissionDayIndex,
  getHabitActiveMissionDaySlot,
} from "../../utils/missionDaySlots";

/**
 * Video Moments: a mission earns one 5-second video per 7-day block of its own
 * days (1-7, 8-14, ...) when all seven are done, none was streak-repaired and
 * at least 4 of them were posted to Community. The video can be used from the
 * block's own day 7 (once days 1-6 are done) through the last day of the next
 * block. Only missions that began on or after the feature's start date count.
 * The server re-checks all of this when the video is claimed
 * (rpc_claim_video_moment_v1); this file only drives the UI.
 */
export const VIDEO_MOMENT_BLOCK_DAYS = 7;
export const VIDEO_MOMENT_MIN_POSTS = 4;
export const VIDEO_MOMENT_MAX_MS = 5000;

export type VideoMomentBlockProgress = {
  blockNumber: number;
  dateKeys: string[];
  daysDone: number;
  repairs: number;
  posts: number;
  earned: boolean;
};

export type VideoMomentCredit = {
  /** The block that earned the video. */
  block: VideoMomentBlockProgress;
  /** Today's mission day and date, where the video would be attached. */
  missionDay: number;
  dateKey: string;
};

/**
 * `throughDay` (1-7) limits which days of the block are counted — 6 on the
 * block's own day 7, which is still being checked in.
 */
export function videoMomentBlockProgress(
  habit: Habit,
  blockNumber: number,
  nowMs: number,
  throughDay: number = VIDEO_MOMENT_BLOCK_DAYS,
): VideoMomentBlockProgress {
  const completed = new Set(habit.completedDates ?? []);
  const memories = habit.streakMemories ?? {};
  const dateKeys: string[] = [];
  let daysDone = 0;
  let repairs = 0;
  let posts = 0;
  for (let i = 0; i < VIDEO_MOMENT_BLOCK_DAYS; i++) {
    const dayIndex = (blockNumber - 1) * VIDEO_MOMENT_BLOCK_DAYS + i;
    const key = calendarDateForHabitMissionDayIndex(habit, dayIndex, nowMs);
    dateKeys.push(key);
    if (i >= throughDay) continue;
    if (completed.has(key)) daysDone += 1;
    const mem = memories[key];
    if (mem?.repairSource) repairs += 1;
    if (mem?.communityPosted && !mem.communityFeedRevoked) posts += 1;
  }
  return {
    blockNumber,
    dateKeys,
    daysDone,
    repairs,
    posts,
    earned: daysDone === throughDay && repairs === 0 && posts >= VIDEO_MOMENT_MIN_POSTS,
  };
}

/** Block the mission is in today (1-based), or null when the mission isn't running. */
export function currentVideoMomentBlock(habit: Habit, nowMs: number): number | null {
  const slot = getHabitActiveMissionDaySlot(habit, nowMs);
  if (slot == null) return null;
  return Math.ceil(slot / VIDEO_MOMENT_BLOCK_DAYS);
}

/** The mission began on or after the feature's start date (the server also checks when it first saw it). */
export function videoMomentMissionEligible(habit: Habit, nowMs: number, startsOn: string | null): boolean {
  if (!startsOn) return false;
  return calendarDateForHabitMissionDayIndex(habit, 0, nowMs) >= startsOn;
}

/**
 * The video credit usable today, if any. The previous block's credit comes
 * first (it expires sooner); on a block's own day 7 that block's credit is
 * offered once days 1-6 qualify. `claimedBlocks` comes from moment_videos.
 */
export function videoMomentCreditForToday(
  habit: Habit,
  nowMs: number,
  claimedBlocks: ReadonlySet<number>,
  startsOn: string | null,
): VideoMomentCredit | null {
  if (!videoMomentMissionEligible(habit, nowMs, startsOn)) return null;
  const slot = getHabitActiveMissionDaySlot(habit, nowMs);
  if (slot == null) return null;
  const dateKey = calendarDateForHabitMissionDayIndex(habit, slot - 1, nowMs);

  const previous = Math.ceil(slot / VIDEO_MOMENT_BLOCK_DAYS) - 1;
  if (previous >= 1 && !claimedBlocks.has(previous)) {
    const block = videoMomentBlockProgress(habit, previous, nowMs);
    if (block.earned) return { block, missionDay: slot, dateKey };
  }

  if (slot % VIDEO_MOMENT_BLOCK_DAYS === 0) {
    const current = slot / VIDEO_MOMENT_BLOCK_DAYS;
    if (!claimedBlocks.has(current)) {
      const block = videoMomentBlockProgress(habit, current, nowMs, VIDEO_MOMENT_BLOCK_DAYS - 1);
      if (block.earned) return { block, missionDay: slot, dateKey };
    }
  }
  return null;
}

/** What the campaign progress card's chapter row shows today. */
export type ChapterStatus =
  | {
      kind: "charging";
      /** Week (block) being earned. */
      chapter: number;
      /** One per day of this week: done, today (not done yet), still ahead, or missed. */
      dots: ("done" | "today" | "ahead" | "missed")[];
      /** Days after today until this week's day 7 (0 on day 7 itself). */
      daysToGo: number;
      /** Community posts still needed this week (0 when there are enough). */
      postsNeeded: number;
    }
  | { kind: "blocked"; chapter: number; reason: "repaired" | "missed" | "posts"; nextDay: number }
  | { kind: "ready"; credit: VideoMomentCredit; chapter: number; daysLeft: number }
  | { kind: "kept"; chapter: number; nextDay: number | null };

/**
 * Null hides the row: the mission isn't eligible (began before the start
 * date), isn't running, or this week can't finish inside the mission.
 */
export function chapterStatusForToday(
  habit: Habit,
  nowMs: number,
  claimedBlocks: ReadonlySet<number>,
  startsOn: string | null,
): ChapterStatus | null {
  if (!videoMomentMissionEligible(habit, nowMs, startsOn)) return null;
  const slot = getHabitActiveMissionDaySlot(habit, nowMs);
  if (slot == null) return null;
  const totalDays = Math.max(1, habit.totalDays ?? 21);

  const credit = videoMomentCreditForToday(habit, nowMs, claimedBlocks, startsOn);
  if (credit) {
    const lastUsableDay = Math.min(totalDays, credit.block.blockNumber * VIDEO_MOMENT_BLOCK_DAYS + VIDEO_MOMENT_BLOCK_DAYS);
    return { kind: "ready", credit, chapter: credit.block.blockNumber, daysLeft: lastUsableDay - slot + 1 };
  }

  const chapter = Math.ceil(slot / VIDEO_MOMENT_BLOCK_DAYS);
  const weekEnd = chapter * VIDEO_MOMENT_BLOCK_DAYS;
  const nextWeekEnd = weekEnd + VIDEO_MOMENT_BLOCK_DAYS;
  if (claimedBlocks.has(chapter)) {
    return { kind: "kept", chapter, nextDay: nextWeekEnd <= totalDays ? nextWeekEnd : null };
  }
  if (weekEnd > totalDays) return null;

  const completed = new Set(habit.completedDates ?? []);
  const memories = habit.streakMemories ?? {};
  const dots: ("done" | "today" | "ahead" | "missed")[] = [];
  let posts = 0;
  let postedToday = false;
  let repaired = false;
  for (let i = 0; i < VIDEO_MOMENT_BLOCK_DAYS; i++) {
    const day = (chapter - 1) * VIDEO_MOMENT_BLOCK_DAYS + i + 1;
    const key = calendarDateForHabitMissionDayIndex(habit, day - 1, nowMs);
    const mem = memories[key];
    if (mem?.repairSource) repaired = true;
    if (mem?.communityPosted && !mem.communityFeedRevoked) {
      posts += 1;
      if (day === slot) postedToday = true;
    }
    if (completed.has(key)) dots.push("done");
    else if (day === slot) dots.push("today");
    else if (day > slot) dots.push("ahead");
    else dots.push("missed");
  }
  const nextDay = weekEnd + 1 <= totalDays ? weekEnd + 1 : null;
  if (repaired && nextDay) return { kind: "blocked", chapter, reason: "repaired", nextDay };
  if (dots.includes("missed") && nextDay) return { kind: "blocked", chapter, reason: "missed", nextDay };
  const postsNeeded = Math.max(0, VIDEO_MOMENT_MIN_POSTS - posts);
  // Days left to post this week, today included if it isn't posted yet.
  const postingDaysLeft = weekEnd - slot + (postedToday ? 0 : 1);
  if (postsNeeded > postingDaysLeft && nextDay) return { kind: "blocked", chapter, reason: "posts", nextDay };
  if (repaired || dots.includes("missed") || postsNeeded > postingDaysLeft) return null;
  return { kind: "charging", chapter, dots, daysToGo: weekEnd - slot, postsNeeded };
}
