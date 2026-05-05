/**
 * Short, context-aware copy for habit streak moments in the Community feed.
 * Keep it human and avoid repeating the same day/streak facts twice.
 */

export type StreakFeedKicker = {
  /** Main line, focused on the achievement rather than repeating the author. */
  line1: string;
  /** Mission name context; shown as secondary line. */
  missionLine: string;
};

function missionName(title: string): string {
  const t = title.trim();
  return t.length > 0 ? t : "Mission";
}

/**
 * @param displayName Kept for call-site compatibility; the feed already shows the author.
 */
export function buildStreakCelebrationKicker(opts: {
  displayName: string;
  missionTitle: string;
  missionDay: number;
  streakCount: number;
}): StreakFeedKicker {
  const m = missionName(opts.missionTitle);
  const sc = Math.max(1, opts.streakCount);

  return {
    line1: `${sc}-day streak`,
    missionLine: `on ${m}`,
  };
}
