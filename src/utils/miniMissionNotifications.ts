import type { MiniMission } from "../types/habit";
import {
  cancelNotification,
  dismissOngoingNotification,
  scheduleTimerNotification,
  showOngoingMissionNotification,
} from "./notifications";

/** Tracks OS notification ids per mission so we can reschedule without cancelling on screen unmount. */
const lastEndMsByMission = new Map<string, number>();
const scheduledIdByMission = new Map<string, string | null>();
const ongoingIdByMission = new Map<string, string | null>();

function getMissionEndMs(mission: MiniMission): number | null {
  if (mission.status !== "in_progress" || !mission.startedAt) return null;
  const totalMinutes = mission.estimatedMinutes + (mission.extendedMinutes ?? 0);
  const startMs = new Date(mission.startedAt).getTime();
  return startMs + totalMinutes * 60 * 1000;
}

/**
 * Reconcile local notifications with store state. Safe to call on every miniMissions change
 * and after hydration — skips work when end time unchanged.
 */
export async function syncMiniMissionNotifications(missions: MiniMission[]) {
  const active = missions.filter((m) => m.status === "in_progress" && m.startedAt);
  const activeIds = new Set(active.map((m) => m.id));

  for (const missionId of [...lastEndMsByMission.keys()]) {
    if (!activeIds.has(missionId)) {
      await cancelNotification(scheduledIdByMission.get(missionId) ?? null);
      await dismissOngoingNotification(ongoingIdByMission.get(missionId) ?? null);
      lastEndMsByMission.delete(missionId);
      scheduledIdByMission.delete(missionId);
      ongoingIdByMission.delete(missionId);
    }
  }

  for (const mission of active) {
    const endMs = getMissionEndMs(mission);
    if (endMs == null) continue;

    const secondsUntilEnd = Math.floor((endMs - Date.now()) / 1000);

    if (secondsUntilEnd <= 1) {
      await cancelNotification(scheduledIdByMission.get(mission.id) ?? null);
      await dismissOngoingNotification(ongoingIdByMission.get(mission.id) ?? null);
      lastEndMsByMission.delete(mission.id);
      scheduledIdByMission.delete(mission.id);
      ongoingIdByMission.delete(mission.id);
      continue;
    }

    const prevEnd = lastEndMsByMission.get(mission.id);
    if (prevEnd === endMs && scheduledIdByMission.get(mission.id)) {
      continue;
    }

    await cancelNotification(scheduledIdByMission.get(mission.id) ?? null);
    await dismissOngoingNotification(ongoingIdByMission.get(mission.id) ?? null);

    const oId = await showOngoingMissionNotification(mission.title, endMs);
    ongoingIdByMission.set(mission.id, oId);

    const nId = await scheduleTimerNotification(
      "⏰ Mission failed",
      `"${mission.title}" — timer hit zero.`,
      secondsUntilEnd,
    );
    if (nId) {
      scheduledIdByMission.set(mission.id, nId);
      lastEndMsByMission.set(mission.id, endMs);
    } else {
      await dismissOngoingNotification(oId);
      ongoingIdByMission.delete(mission.id);
    }
  }
}

/** Cancel scheduled + dismiss ongoing for one mission (e.g. timer fired in foreground). */
export async function clearMiniMissionNotifications(missionId: string) {
  await cancelNotification(scheduledIdByMission.get(missionId) ?? null);
  await dismissOngoingNotification(ongoingIdByMission.get(missionId) ?? null);
  lastEndMsByMission.delete(missionId);
  scheduledIdByMission.delete(missionId);
  ongoingIdByMission.delete(missionId);
}
