import type { ChallengeTemplate } from "../types/challenge";

/** Catalog of joinable challenges (v1 — all evaluated locally). */
export const CHALLENGE_TEMPLATES: readonly ChallengeTemplate[] = [
  {
    id: "five_day_grind",
    title: "5-Day Grind",
    subtitle: "Build consistency across your missions.",
    goalLine: "Log 5 different days with at least one habit check-in.",
    target: 5,
    durationDays: 7,
    metric: "habit_days",
  },
  {
    id: "mini_double",
    title: "Mini Double",
    subtitle: "Ship quick wins with mini missions.",
    goalLine: "Complete 2 mini missions before the timer ends.",
    target: 2,
    durationDays: 7,
    metric: "mini_completions",
  },
  {
    id: "hot_streak",
    title: "Hot Streak",
    subtitle: "Keep the chain alive.",
    goalLine: "Reach a streak of 3+ days on any habit during the challenge.",
    target: 1,
    durationDays: 7,
    metric: "min_streak",
  },
] as const;

const byId: Record<string, ChallengeTemplate> = Object.fromEntries(
  CHALLENGE_TEMPLATES.map((t) => [t.id, t]),
);

export function getChallengeTemplate(id: string): ChallengeTemplate | undefined {
  return byId[id];
}
