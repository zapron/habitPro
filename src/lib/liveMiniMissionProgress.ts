import type { MiniMission, StreakMemoryTaskEntry } from "../types/habit";
import type { LiveMiniMemoryGalleryItem, LiveMiniParticipantStatus } from "../types/liveMiniMission";
import { getMiniRemainingMs } from "../utils/miniMissionTime";
import { syncLiveMiniMissionProgress } from "./liveMiniMissionsApi";

/**
 * Checklist mini missions only (docs/MINI_MISSION_CATALOG_ARCHITECTURE.md Phase 3).
 * Mirrors the squad-viewer precedent from the main-mission build (not the
 * Community-share precedent) — text-only tasks (a note, no photo) are kept, not
 * dropped, since this feeds a squad-facing surface, not a public feed post. Tasks
 * logged with neither a note nor a photo ("just mark done") are kept too — every
 * logged task should show up, not just the ones with proof.
 */
function buildLiveMiniMemoryGallery(
  tasks: StreakMemoryTaskEntry[] | undefined,
): LiveMiniMemoryGalleryItem[] | null {
  if (!tasks || tasks.length === 0) return null;
  const items = tasks.map((t): LiveMiniMemoryGalleryItem => ({
    taskId: t.taskId,
    label: t.label,
    note: t.note ?? null,
    imageUrl: /^https?:\/\//.test(t.proofUrls[0] ?? "") ? t.proofUrls[0] : null,
  }));
  return items.length > 0 ? items : null;
}

export function liveMiniStatusFromMission(
  mission: MiniMission,
  now = Date.now(),
): Extract<LiveMiniParticipantStatus, "joined" | "in_progress" | "completed" | "missed" | "cancelled"> | null {
  if (!mission.liveSquadId) return null;
  if (mission.status === "completed") return "completed";
  if (mission.status === "missed") return "missed";
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
  const completedMemoryGallery =
    status === "completed" ? buildLiveMiniMemoryGallery(completionMemory?.tasks) : null;
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
    memoryGallery: completedMemoryGallery,
  });
}
