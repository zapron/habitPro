import type { MiniMission } from "../types/habit";
import type { LiveMiniParticipantStatus } from "../types/liveMiniMission";
import { getMiniRemainingMs } from "../utils/miniMissionTime";
import { syncLiveMiniMissionProgress } from "./liveMiniMissionsApi";

export function liveMiniStatusFromMission(
  mission: MiniMission,
  now = Date.now(),
): Extract<LiveMiniParticipantStatus, "joined" | "in_progress" | "completed" | "missed" | "cancelled"> | null {
  if (!mission.liveSquadId) return null;
  if (mission.status === "completed") return "completed";
  if (mission.status === "cancelled") return "cancelled";
  if (mission.status === "in_progress") {
    return getMiniRemainingMs(mission, now) <= 0 ? "missed" : "in_progress";
  }
  return "joined";
}

export async function syncLiveMiniFromLocalMission(
  mission: MiniMission | undefined | null,
  opts?: {
    now?: number;
    completedAt?: string | null;
    memoryNote?: string | null;
    memoryImageUrl?: string | null;
  },
) {
  if (!mission?.liveSquadId) return;
  const status = liveMiniStatusFromMission(mission, opts?.now ?? Date.now());
  if (!status) return;
  const completionMemory = mission.completionMemory;
  const completedMemoryNote =
    status === "completed"
      ? opts?.memoryNote ?? completionMemory?.note ?? null
      : null;
  const completedMemoryImageUrl =
    status === "completed"
      ? opts?.memoryImageUrl ?? completionMemory?.imageUrl ?? null
      : null;
  await syncLiveMiniMissionProgress({
    squadId: mission.liveSquadId,
    localMiniMissionId: mission.id,
    status,
    reserveMinutes: mission.extendedMinutes ?? 0,
    startedAt: mission.startedAt ?? null,
    completedAt:
      status === "completed"
        ? opts?.completedAt ?? mission.completedAt ?? null
        : null,
    memoryNote: completedMemoryNote,
    memoryImageUrl: completedMemoryImageUrl,
  });
}
