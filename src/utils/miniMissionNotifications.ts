import { MAX_RESERVE_FUEL_MINUTES } from "../constants/miniMission";
import type { MiniMission } from "../types/habit";
import { cancelNotification, scheduleTimerNotification } from "./notifications";

/** Min total mission length (estimated + reserve) to show the T−1 minute heads-up. */
const MIN_TOTAL_MINUTES_FOR_WARN = 2;

/** Tracks OS notification ids per mission so we can reschedule without cancelling on screen unmount. */
const lastEndMsByMission = new Map<string, number>();
const warnIdByMission = new Map<string, string | null>();
const failIdByMission = new Map<string, string | null>();

function getMissionEndMs(mission: MiniMission): number | null {
  if (mission.status !== "in_progress" || !mission.startedAt) return null;
  const totalMinutes = mission.estimatedMinutes + (mission.extendedMinutes ?? 0);
  const startMs = new Date(mission.startedAt).getTime();
  return startMs + totalMinutes * 60 * 1000;
}

function getWarnCopy(mission: MiniMission): { title: string; body: string } {
  const extended = mission.extendedMinutes ?? 0;
  const reserveMaxed = extended >= MAX_RESERVE_FUEL_MINUTES;
  if (reserveMaxed) {
    return {
      title: "One minute left",
      body: `Just 1 minute left. Try to complete "${mission.title}" and get XP.`,
    };
  }
  return {
    title: "Mini mission ending soon",
    body: `Your mini mission is about to end. Pack some reserve fuel for "${mission.title}".`,
  };
}

/**
 * Reconcile local notifications with store state. Safe to call on every miniMissions change
 * and after hydration — skips work when end time unchanged and warn/fail ids still match intent.
 */
export async function syncMiniMissionNotifications(missions: MiniMission[]) {
  const active = missions.filter((m) => m.status === "in_progress" && m.startedAt);
  const activeIds = new Set(active.map((m) => m.id));

  for (const missionId of [...lastEndMsByMission.keys()]) {
    if (!activeIds.has(missionId)) {
      await cancelNotification(warnIdByMission.get(missionId) ?? null);
      await cancelNotification(failIdByMission.get(missionId) ?? null);
      lastEndMsByMission.delete(missionId);
      warnIdByMission.delete(missionId);
      failIdByMission.delete(missionId);
    }
  }

  for (const mission of active) {
    const endMs = getMissionEndMs(mission);
    if (endMs == null) continue;

    const secondsUntilEnd = Math.floor((endMs - Date.now()) / 1000);

    if (secondsUntilEnd <= 1) {
      await cancelNotification(warnIdByMission.get(mission.id) ?? null);
      await cancelNotification(failIdByMission.get(mission.id) ?? null);
      lastEndMsByMission.delete(mission.id);
      warnIdByMission.delete(mission.id);
      failIdByMission.delete(mission.id);
      continue;
    }

    const totalMinutes = mission.estimatedMinutes + (mission.extendedMinutes ?? 0);
    const needsWarn = totalMinutes > MIN_TOTAL_MINUTES_FOR_WARN && secondsUntilEnd > 60;

    const prevEnd = lastEndMsByMission.get(mission.id);
    const warnId = warnIdByMission.get(mission.id);
    const failId = failIdByMission.get(mission.id);
    if (prevEnd === endMs && failId) {
      const warnOk = needsWarn === !!warnId;
      if (warnOk) continue;
    }

    await cancelNotification(warnIdByMission.get(mission.id) ?? null);
    await cancelNotification(failIdByMission.get(mission.id) ?? null);

    let newWarnId: string | null = null;
    if (needsWarn) {
      const warnSeconds = secondsUntilEnd - 60;
      if (warnSeconds >= 1) {
        const { title, body } = getWarnCopy(mission);
        newWarnId = await scheduleTimerNotification(title, body, warnSeconds, {
          data: { kind: "mini_warn", missionId: mission.id },
        });
      }
    }

    const failTitle = "Mini failed";
    const failBody = `Your mini mission failed. Retry "${mission.title}" and try to win again.`;
    const newFailId = await scheduleTimerNotification(failTitle, failBody, secondsUntilEnd, {
      data: { kind: "mini_fail", missionId: mission.id },
    });

    if (!newFailId) {
      await cancelNotification(newWarnId);
      warnIdByMission.delete(mission.id);
      failIdByMission.delete(mission.id);
      lastEndMsByMission.delete(mission.id);
      continue;
    }

    warnIdByMission.set(mission.id, newWarnId);
    failIdByMission.set(mission.id, newFailId);
    lastEndMsByMission.set(mission.id, endMs);
  }
}

/** Cancel scheduled warn + fail for one mission (e.g. timer fired in foreground). */
export async function clearMiniMissionNotifications(missionId: string) {
  await cancelNotification(warnIdByMission.get(missionId) ?? null);
  await cancelNotification(failIdByMission.get(missionId) ?? null);
  lastEndMsByMission.delete(missionId);
  warnIdByMission.delete(missionId);
  failIdByMission.delete(missionId);
}
