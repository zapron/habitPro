import type { HabitMode, MiniMissionStatus } from "../../types/habit";

export type AiCoachProvider = "mock" | "openai";

export type AiCoachAction =
  | {
      type: "prefill_habit";
      label: string;
      title: string;
      description?: string;
      mode: HabitMode;
      totalDays?: number;
    }
  | { type: "open_habit"; label: string; habitId: string }
  | { type: "open_mini"; label: string }
  | { type: "open_reports"; label: string }
  | { type: "none"; label: string };

export type AiCoachSuggestion = {
  id: string;
  title: string;
  body: string;
  priority: "high" | "medium" | "low";
  reason?: string;
  action: AiCoachAction;
};

export type AiCoachResponse = {
  schema: "habitpro.aiCoach.v1";
  provider: AiCoachProvider;
  generatedAt: string;
  headline: string;
  subheadline: string;
  suggestions: AiCoachSuggestion[];
  usage?: {
    premium: boolean;
    limitPerDay: number;
    usedToday: number;
    remainingToday: number;
  };
};

export type AiCoachSnapshotHabit = {
  id: string;
  title: string;
  description?: string;
  mode: HabitMode;
  status: "active" | "needs_report" | "completed" | "failed";
  streak: number;
  totalDays: number;
  completedCount: number;
  visibility: "public" | "solo";
  isSquadMission: boolean;
  missionReport?: "accomplished" | "failed";
};

export type AiCoachSnapshotMiniMission = {
  id: string;
  title: string;
  objective?: string;
  status: MiniMissionStatus;
  estimatedMinutes: number;
  remainingSeconds?: number;
  isLiveSquad: boolean;
};

export type AiCoachSnapshot = {
  schema: "habitpro.aiCoach.snapshot.v1";
  clientNowIso: string;
  timezone: string | null;
  xp: number;
  level: number;
  stats: {
    activeMissions: number;
    pendingReports: number;
    accomplishedReports: number;
    failedReports: number;
    liveMiniMissions: number;
    waitingMiniMissions: number;
  };
  habits: AiCoachSnapshotHabit[];
  miniMissions: AiCoachSnapshotMiniMission[];
};

export type AiCoachRequestResult =
  | { ok: true; response: AiCoachResponse }
  | { ok: false; error: string; reason?: "not_configured" | "auth_required" | "network" | "unexpected" };

