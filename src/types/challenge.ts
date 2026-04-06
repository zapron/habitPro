/**
 * Local-first challenges (v1): goals are evaluated from habit + mini mission data.
 * Future: Supabase-backed duels, friends, and global leaderboards.
 */

export type ChallengeTemplateId = "five_day_grind" | "mini_double" | "hot_streak";

export type ChallengeMetric = "habit_days" | "mini_completions" | "min_streak";

export interface ChallengeTemplate {
  id: ChallengeTemplateId;
  title: string;
  subtitle: string;
  /** User-facing goal line, e.g. "Log 5 distinct days with a habit check-in" */
  goalLine: string;
  target: number;
  durationDays: number;
  metric: ChallengeMetric;
}

export interface ChallengeEnrollment {
  id: string;
  templateId: ChallengeTemplateId;
  startedAt: string;
}

export interface CompletedChallengeRecord {
  templateId: ChallengeTemplateId;
  completedAt: string;
}

export type ChallengeProgressView = {
  current: number;
  target: number;
  /** 0–1 for habit_days / mini_completions; min_streak uses 0 or 1 current */
  ratio: number;
  done: boolean;
  expired: boolean;
  endsAtMs: number;
};
