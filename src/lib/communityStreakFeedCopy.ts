/**
 * Inspiring, context-aware copy for habit streak moments in the Community feed.
 * Uses mission day + consecutive streak at post time.
 */

export type StreakFeedKicker = {
  /** Main celebratory line (often includes fire emoji) */
  line1: string;
  /** Mission name — shown as secondary line */
  missionLine: string;
};

function missionName(title: string): string {
  const t = title.trim();
  return t.length > 0 ? t : "Mission";
}

/**
 * @param displayName — @handle or "Someone" (no @ prefix required)
 */
export function buildStreakCelebrationKicker(opts: {
  displayName: string;
  missionTitle: string;
  missionDay: number;
  streakCount: number;
}): StreakFeedKicker {
  const m = missionName(opts.missionTitle);
  const name = opts.displayName.trim() || "Someone";
  const md = Math.max(1, opts.missionDay);
  const sc = Math.max(1, opts.streakCount);

  // First day of the mission + first day of a streak
  if (md === 1 && sc === 1) {
    return {
      line1: `${name} started the journey — first check-in 🔥`,
      missionLine: m,
    };
  }

  // Same calendar milestone: e.g. 3-day streak and this post is day 3
  if (sc >= 2 && md === sc && md === 3) {
    return {
      line1: `3-day streak — day 3 on the mission 🔥`,
      missionLine: m,
    };
  }

  if (sc >= 2 && md === sc && md > 3) {
    return {
      line1: `${sc}-day streak — day ${md} locked in 🔥`,
      missionLine: m,
    };
  }

  if (sc >= 7) {
    return {
      line1: `${name} is on a ${sc}-day streak 🔥`,
      missionLine: `on ${m}`,
    };
  }

  if (sc >= 2) {
    return {
      line1: `${name} is on a ${sc}-day streak 🔥`,
      missionLine: `on ${m}`,
    };
  }

  return {
    line1: `${name} shared a streak moment 🔥`,
    missionLine: m,
  };
}
