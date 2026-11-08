import type { Habit } from "../../types/habit";
import {
  calendarDateForHabitMissionDayIndex,
  getHabitActiveMissionDaySlot,
} from "../../utils/missionDaySlots";

/**
 * Video Moments (Chapters): any 7 mission days in a row earn one 7-second
 * video when all seven are done, none was streak-repaired and at least 3 of
 * them were posted to Community. A repair or missed day restarts the count
 * the next day, and a Chapter's days never count toward the next one (posts
 * included). The video can be used from the week's own day 7 (once the six
 * days before it are done) through 7 days after it. Only missions that began
 * on or after the feature's start date count. The server re-checks all of
 * this when the video is claimed (rpc_claim_video_moment_v1); this file only
 * drives the UI.
 */
export const VIDEO_MOMENT_BLOCK_DAYS = 7;
export const VIDEO_MOMENT_MIN_POSTS = 3;
export const VIDEO_MOMENT_MAX_MS = 7000;

/** A Chapter already used (a moment_videos row). */
export type ClaimedChapter = { blockNumber: number; startDateKey: string };

export type VideoMomentBlockProgress = {
  /** The Chapter's number (1, 2, ...); also names its storage path. */
  blockNumber: number;
  /** Mission day of the week's first day. */
  startDay: number;
  dateKeys: string[];
  daysDone: number;
  repairs: number;
  posts: number;
  earned: boolean;
};

export type VideoMomentCredit = {
  /** The week that earned the video. */
  block: VideoMomentBlockProgress;
  /** Today's mission day and date, where the video would be attached. */
  missionDay: number;
  dateKey: string;
};

function dateKeyForDay(habit: Habit, day: number, nowMs: number): string {
  return calendarDateForHabitMissionDayIndex(habit, day - 1, nowMs);
}

function postedOn(habit: Habit, key: string): boolean {
  const mem = habit.streakMemories?.[key];
  return Boolean(mem?.communityPosted && !mem.communityFeedRevoked);
}

/**
 * The 7 days from `startDay`. Days after today aren't counted, and today
 * needn't be done yet (a Chapter can be recorded on its own day 7).
 */
function weekProgress(
  habit: Habit,
  blockNumber: number,
  startDay: number,
  slot: number,
  nowMs: number,
): VideoMomentBlockProgress {
  const completed = new Set(habit.completedDates ?? []);
  const memories = habit.streakMemories ?? {};
  const dateKeys: string[] = [];
  let daysDone = 0;
  let daysNeeded = 0;
  let repairs = 0;
  let posts = 0;
  for (let day = startDay; day < startDay + VIDEO_MOMENT_BLOCK_DAYS; day++) {
    const key = dateKeyForDay(habit, day, nowMs);
    dateKeys.push(key);
    if (day > slot) continue;
    if (memories[key]?.repairSource) repairs += 1;
    if (postedOn(habit, key)) posts += 1;
    if (day === slot) continue;
    daysNeeded += 1;
    if (completed.has(key)) daysDone += 1;
  }
  return {
    blockNumber,
    startDay,
    dateKeys,
    daysDone,
    repairs,
    posts,
    earned:
      startDay + VIDEO_MOMENT_BLOCK_DAYS - 1 <= slot &&
      daysDone === daysNeeded &&
      repairs === 0 &&
      posts >= VIDEO_MOMENT_MIN_POSTS,
  };
}

type EarnedChapter = { block: VideoMomentBlockProgress; endDay: number; claimed: boolean };

/**
 * Chapters earned up to today, earliest first: each is the first qualifying
 * 7 days after the previous one. A claimed week always counts, under the
 * number the server stored, and no other week may share its days (an older
 * app claims fixed weeks: days 1-7, 8-14, ...).
 */
function earnedChapters(
  habit: Habit,
  slot: number,
  nowMs: number,
  claimed: readonly ClaimedChapter[],
): { chapters: EarnedChapter[]; nextStart: number; lastNumber: number } {
  const claimedByStart = new Map(claimed.map((c) => [c.startDateKey, c.blockNumber]));
  const claimedStartDays: number[] = [];
  for (let day = 1; day <= slot; day++) {
    if (claimedByStart.has(dateKeyForDay(habit, day, nowMs))) claimedStartDays.push(day);
  }
  const chapters: EarnedChapter[] = [];
  let nextStart = 1;
  let lastNumber = 0;
  for (let endDay = VIDEO_MOMENT_BLOCK_DAYS; endDay <= slot; endDay++) {
    const startDay = endDay - VIDEO_MOMENT_BLOCK_DAYS + 1;
    if (startDay < nextStart) continue;
    const claimedNumber = claimedByStart.get(dateKeyForDay(habit, startDay, nowMs));
    if (claimedNumber == null && claimedStartDays.some((d) => d > startDay && d < startDay + VIDEO_MOMENT_BLOCK_DAYS)) {
      continue;
    }
    const block = weekProgress(habit, claimedNumber ?? lastNumber + 1, startDay, slot, nowMs);
    if (claimedNumber == null && !block.earned) continue;
    chapters.push({ block, endDay, claimed: claimedNumber != null });
    lastNumber = Math.max(lastNumber, block.blockNumber);
    nextStart = endDay + 1;
  }
  return { chapters, nextStart, lastNumber };
}

/** The mission began on or after the feature's start date (the server also checks when it first saw it). */
export function videoMomentMissionEligible(habit: Habit, nowMs: number, startsOn: string | null): boolean {
  if (!startsOn) return false;
  return calendarDateForHabitMissionDayIndex(habit, 0, nowMs) >= startsOn;
}

function lastUsableDay(habit: Habit, endDay: number): number {
  return Math.min(Math.max(1, habit.totalDays ?? 21), endDay + VIDEO_MOMENT_BLOCK_DAYS);
}

function creditFrom(
  habit: Habit,
  slot: number,
  nowMs: number,
  chapters: readonly EarnedChapter[],
): { credit: VideoMomentCredit; endDay: number } | null {
  // Earliest first: it expires soonest.
  const open = chapters.find((c) => !c.claimed && slot <= lastUsableDay(habit, c.endDay));
  if (!open) return null;
  return {
    credit: { block: open.block, missionDay: slot, dateKey: dateKeyForDay(habit, slot, nowMs) },
    endDay: open.endDay,
  };
}

/** The video credit usable today, if any. `claimed` comes from moment_videos. */
export function videoMomentCreditForToday(
  habit: Habit,
  nowMs: number,
  claimed: readonly ClaimedChapter[],
  startsOn: string | null,
): VideoMomentCredit | null {
  if (!videoMomentMissionEligible(habit, nowMs, startsOn)) return null;
  const slot = getHabitActiveMissionDaySlot(habit, nowMs);
  if (slot == null) return null;
  return creditFrom(habit, slot, nowMs, earnedChapters(habit, slot, nowMs, claimed).chapters)?.credit ?? null;
}

/** What the campaign progress card's chapter row shows today. */
export type ChapterStatus =
  | {
      kind: "charging";
      /** Chapter being earned. */
      chapter: number;
      /** One per day of its 7 days: done, today (not done yet) or still ahead. */
      dots: ("done" | "today" | "ahead")[];
      /** Days after today until its day 7 (0 on day 7 itself). */
      daysToGo: number;
      /** Mission day of its day 7. */
      endDay: number;
      /** Community posts still needed in these 7 days (0 when there are enough). */
      postsNeeded: number;
      /** These 7 days' posts so far (removed posts don't count). */
      posts: number;
      /** A repair or missed day restarted the count. */
      restarted: boolean;
    }
  | { kind: "ready"; credit: VideoMomentCredit; chapter: number; daysLeft: number }
  | { kind: "kept"; chapter: number; nextDay: number | null };

/**
 * Null hides the row: the mission isn't eligible (began before the start
 * date), isn't running, or 7 more days can't fit before it ends.
 */
export function chapterStatusForToday(
  habit: Habit,
  nowMs: number,
  claimed: readonly ClaimedChapter[],
  startsOn: string | null,
): ChapterStatus | null {
  if (!videoMomentMissionEligible(habit, nowMs, startsOn)) return null;
  const slot = getHabitActiveMissionDaySlot(habit, nowMs);
  if (slot == null) return null;
  const totalDays = Math.max(1, habit.totalDays ?? 21);

  const { chapters, nextStart, lastNumber } = earnedChapters(habit, slot, nowMs, claimed);
  const open = creditFrom(habit, slot, nowMs, chapters);
  if (open) {
    return {
      kind: "ready",
      credit: open.credit,
      chapter: open.credit.block.blockNumber,
      daysLeft: lastUsableDay(habit, open.endDay) - slot + 1,
    };
  }

  // A Chapter ended today (and was kept): the next count starts tomorrow.
  if (nextStart > slot) {
    const nextDay = slot + VIDEO_MOMENT_BLOCK_DAYS;
    return { kind: "kept", chapter: lastNumber, nextDay: nextDay <= totalDays ? nextDay : null };
  }

  // The count restarts the day after a repaired or missed day.
  const completed = new Set(habit.completedDates ?? []);
  let runStart = nextStart;
  for (let day = nextStart; day <= slot; day++) {
    const key = dateKeyForDay(habit, day, nowMs);
    if (habit.streakMemories?.[key]?.repairSource || (day < slot && !completed.has(key))) runStart = day + 1;
  }
  if (runStart > slot) return null;

  // Today can't be posted any more once it's on Community or was taken off it.
  const todayMem = habit.streakMemories?.[dateKeyForDay(habit, slot, nowMs)];
  const todayUsed = Boolean(todayMem?.communityPosted || todayMem?.communityFeedRevoked);
  // The earliest day 7 these days can still reach: when the posts so far are
  // short, the 7 days slide forward and their oldest posts drop off.
  let endDay = Math.max(slot, runStart + VIDEO_MOMENT_BLOCK_DAYS - 1);
  let posts = 0;
  for (; ; endDay++) {
    posts = 0;
    for (let day = endDay - VIDEO_MOMENT_BLOCK_DAYS + 1; day <= slot; day++) {
      if (postedOn(habit, dateKeyForDay(habit, day, nowMs))) posts += 1;
    }
    const postingDaysLeft = endDay - slot + (todayUsed ? 0 : 1);
    if (posts + postingDaysLeft >= VIDEO_MOMENT_MIN_POSTS) break;
  }
  if (endDay > totalDays) return null;

  const dots: ("done" | "today" | "ahead")[] = [];
  for (let day = endDay - VIDEO_MOMENT_BLOCK_DAYS + 1; day <= endDay; day++) {
    if (day > slot) dots.push("ahead");
    else if (completed.has(dateKeyForDay(habit, day, nowMs))) dots.push("done");
    else dots.push("today");
  }
  return {
    kind: "charging",
    chapter: lastNumber + 1,
    dots,
    daysToGo: endDay - slot,
    endDay,
    postsNeeded: Math.max(0, VIDEO_MOMENT_MIN_POSTS - posts),
    posts,
    restarted: runStart > nextStart,
  };
}
