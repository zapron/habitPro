import type { Habit, MiniMission } from "../../types/habit";
import { getMiniRemainingMs } from "../../utils/miniMissionTime";
import { isMainMissionPlayableOnHome, needsMainMissionOutcome } from "../../utils/mainMissionUi";
import type { AiCoachSnapshot, AiCoachSnapshotHabit, AiCoachSnapshotMiniMission } from "./types";

const MAX_HABITS = 6;
const MAX_MINIS = 6;

function text(value: string | undefined, max: number): string | undefined {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return undefined;
  return trimmed.length > max ? `${trimmed.slice(0, max - 1).trim()}...` : trimmed;
}

function getTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

function habitStatus(habit: Habit, nowMs: number): AiCoachSnapshotHabit["status"] {
  if (needsMainMissionOutcome(habit, nowMs)) return "needs_report";
  if (isMainMissionPlayableOnHome(habit, nowMs)) return "active";
  if (habit.missionReport === "failed" || habit.status === "failed") return "failed";
  return "completed";
}

function habitScore(habit: Habit, nowMs: number): number {
  const status = habitStatus(habit, nowMs);
  if (status === "needs_report") return 10_000 + habit.streak;
  if (status === "active") return 5_000 + habit.streak;
  return habit.streak;
}

function miniScore(mini: MiniMission, nowMs: number): number {
  if (mini.status === "in_progress" && getMiniRemainingMs(mini, nowMs) > 0) return 10_000;
  if (mini.status === "pending" || mini.status === "scheduled") return 5_000;
  return 0;
}

export function buildAiCoachSnapshot(input: {
  habits: Habit[];
  miniMissions: MiniMission[];
  xp: number;
  level: number;
  nowMs?: number;
}): AiCoachSnapshot {
  const nowMs = input.nowMs ?? Date.now();
  const habits = [...input.habits]
    .sort((a, b) => habitScore(b, nowMs) - habitScore(a, nowMs))
    .slice(0, MAX_HABITS)
    .map((habit): AiCoachSnapshotHabit => ({
      id: habit.id,
      title: text(habit.title, 80) ?? "Untitled mission",
      description: text(habit.description, 160),
      mode: habit.mode,
      status: habitStatus(habit, nowMs),
      streak: habit.streak,
      totalDays: habit.totalDays,
      completedCount: habit.completedDates.length,
      visibility: habit.visibility,
      isSquadMission: Boolean(habit.challengeGroupId),
      missionReport: habit.missionReport,
    }));

  const miniMissions = [...input.miniMissions]
    .sort((a, b) => miniScore(b, nowMs) - miniScore(a, nowMs))
    .slice(0, MAX_MINIS)
    .map((mini): AiCoachSnapshotMiniMission => {
      const remainingMs = getMiniRemainingMs(mini, nowMs);
      return {
        id: mini.id,
        title: text(mini.title, 80) ?? "Untitled mini mission",
        objective: text(mini.objective, 160),
        status: mini.status,
        estimatedMinutes: mini.estimatedMinutes,
        remainingSeconds:
          mini.status === "in_progress" && remainingMs > 0
            ? Math.ceil(remainingMs / 1000)
            : undefined,
        isLiveSquad: Boolean(mini.liveSquadId),
      };
    });

  return {
    schema: "habitpro.aiCoach.snapshot.v1",
    clientNowIso: new Date(nowMs).toISOString(),
    timezone: getTimeZone(),
    xp: Math.max(0, Math.floor(input.xp)),
    level: Math.max(1, Math.floor(input.level)),
    stats: {
      activeMissions: input.habits.filter((h) => isMainMissionPlayableOnHome(h, nowMs)).length,
      pendingReports: input.habits.filter((h) => needsMainMissionOutcome(h, nowMs)).length,
      accomplishedReports: input.habits.filter((h) => h.missionReport === "accomplished").length,
      failedReports: input.habits.filter((h) => h.missionReport === "failed").length,
      liveMiniMissions: input.miniMissions.filter(
        (m) => m.status === "in_progress" && getMiniRemainingMs(m, nowMs) > 0,
      ).length,
      waitingMiniMissions: input.miniMissions.filter((m) => m.status === "pending" || m.status === "scheduled").length,
    },
    habits,
    miniMissions,
  };
}

