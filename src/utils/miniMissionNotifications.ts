import { MAX_RESERVE_FUEL_MINUTES } from "../constants/miniMission";
import type { MiniMission } from "../types/habit";
import {
  cancelNotification,
  listScheduledNotifications,
  scheduleTimerNotification,
} from "./notifications";

/** Timer heads-up rules for mini missions. */
const WARN_LEAD_SECONDS = 120;
const WARN_MIN_BUFFER_SECONDS = 15;
const MIN_TOTAL_MINUTES_FOR_WARN = 3;

/** Tracks OS notification ids per mission so we can reschedule without cancelling on screen unmount. */
const lastEndMsByMission = new Map<string, number>();
const warnIdByMission = new Map<string, string | null>();
const failIdByMission = new Map<string, string | null>();

type MiniMissionNotifKind = "mini_warn" | "mini_fail";

let syncInFlight: Promise<void> | null = null;
let pendingSyncMissions: MiniMission[] | null = null;

function isMiniMissionNotifKind(x: unknown): x is MiniMissionNotifKind {
  return x === "mini_warn" || x === "mini_fail";
}

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
      title: "Two minutes left",
      body: `Try to complete "${mission.title}" before the timer runs out.`,
    };
  }
  return {
    title: "Mini mission ending soon",
    body: `About 2 minutes left for "${mission.title}". Add reserve fuel if you need it.`,
  };
}

function shouldScheduleWarn(mission: MiniMission, secondsUntilEnd: number): boolean {
  const totalMinutes = mission.estimatedMinutes + (mission.extendedMinutes ?? 0);
  return (
    totalMinutes >= MIN_TOTAL_MINUTES_FOR_WARN &&
    secondsUntilEnd > WARN_LEAD_SECONDS + WARN_MIN_BUFFER_SECONDS
  );
}

function numberFromNotificationData(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

async function scanAndCancelMiniMissionNotifications(
  missionId: string,
  kinds: MiniMissionNotifKind[] = ["mini_warn", "mini_fail"],
) {
  const kindSet = new Set(kinds);
  const scheduled = await listScheduledNotifications();
  await Promise.all(
    scheduled
      .filter((n) => {
        const data = n.content?.data;
        return (
          data?.type === "mini_mission" &&
          data?.missionId === missionId &&
          isMiniMissionNotifKind(data?.kind) &&
          kindSet.has(data.kind)
        );
      })
      .map((n) => cancelNotification(n.identifier)),
  );
}

/**
 * Reconcile local notifications with store state. Safe to call on every miniMissions change
 * and after hydration — skips work when end time unchanged and warn/fail ids still match intent.
 */
export async function syncMiniMissionNotifications(missions: MiniMission[]) {
  pendingSyncMissions = missions;
  if (syncInFlight) return syncInFlight;

  syncInFlight = (async () => {
    while (pendingSyncMissions) {
      const next = pendingSyncMissions;
      pendingSyncMissions = null;
      await syncMiniMissionNotificationsNow(next);
    }
  })().finally(() => {
    syncInFlight = null;
    if (pendingSyncMissions) {
      void syncMiniMissionNotifications(pendingSyncMissions);
    }
  });

  return syncInFlight;
}

async function syncMiniMissionNotificationsNow(missions: MiniMission[]) {
  const active = missions.filter((m) => m.status === "in_progress" && m.startedAt);
  const activeIds = new Set(active.map((m) => m.id));
  const nowMs = Date.now();

  // If the app was killed, our in-memory maps are empty and we can’t cancel old scheduled ids.
  // Reconcile by scanning OS scheduled notifications and cancelling mini-mission entries
  // that no longer match store state (or are already expired).
  const scheduled = await listScheduledNotifications();
  const activeById = new Map(active.map((m) => [m.id, m] as const));
  const scheduledMini = scheduled
    .map((n) => {
      const data = n.content?.data;
      const kind = data?.kind;
      const missionId = data?.missionId;
      const endMs = data?.endMs;
      const type = data?.type;
      return {
        id: n.identifier,
        type,
        kind,
        missionId,
        endMs,
      };
    })
    .filter((n) => n.type === "mini_mission" && isMiniMissionNotifKind(n.kind));

  const endMsByActiveMission = new Map<string, number>();
  for (const m of active) {
    const e = getMissionEndMs(m);
    if (e != null) endMsByActiveMission.set(m.id, e);
  }

  const keptWarnIdByMission = new Map<string, string>();
  const keptFailIdByMission = new Map<string, string>();

  for (const n of scheduledMini) {
    const missionId = typeof n.missionId === "string" ? n.missionId : "";
    const expectedEndMs = endMsByActiveMission.get(missionId);
    const storedEndMs = numberFromNotificationData(n.endMs);
    const mission = activeById.get(missionId);

    const shouldCancel =
      !missionId ||
      expectedEndMs == null ||
      expectedEndMs <= nowMs + 1000 ||
      storedEndMs == null ||
      storedEndMs !== expectedEndMs;

    if (shouldCancel || !mission) {
      await cancelNotification(n.id);
      continue;
    }

    const secondsUntilEnd = Math.floor((expectedEndMs - nowMs) / 1000);
    if (secondsUntilEnd <= 1) {
      await cancelNotification(n.id);
      continue;
    }

    const needsWarn = shouldScheduleWarn(mission, secondsUntilEnd);

    if (n.kind === "mini_warn" && !needsWarn) {
      await cancelNotification(n.id);
      continue;
    }

    if (n.kind === "mini_warn") {
      const existing = keptWarnIdByMission.get(missionId);
      if (existing) {
        await cancelNotification(n.id);
      } else {
        keptWarnIdByMission.set(missionId, n.id);
      }
      continue;
    }

    if (n.kind === "mini_fail") {
      const existing = keptFailIdByMission.get(missionId);
      if (existing) {
        await cancelNotification(n.id);
      } else {
        keptFailIdByMission.set(missionId, n.id);
      }
      continue;
    }
  }

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

    const secondsUntilEnd = Math.floor((endMs - nowMs) / 1000);

    if (secondsUntilEnd <= 1) {
      await cancelNotification(warnIdByMission.get(mission.id) ?? null);
      await cancelNotification(failIdByMission.get(mission.id) ?? null);
      lastEndMsByMission.delete(mission.id);
      warnIdByMission.delete(mission.id);
      failIdByMission.delete(mission.id);
      continue;
    }

    const needsWarn = shouldScheduleWarn(mission, secondsUntilEnd);

    // Seed ids from OS schedule (after app restart) so we don't double-schedule.
    const keptFailId = keptFailIdByMission.get(mission.id);
    if (keptFailId) {
      failIdByMission.set(mission.id, keptFailId);
      lastEndMsByMission.set(mission.id, endMs);
      const keptWarnId = keptWarnIdByMission.get(mission.id);
      if (needsWarn && keptWarnId) {
        warnIdByMission.set(mission.id, keptWarnId);
      } else {
        warnIdByMission.delete(mission.id);
      }
    }

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
      const warnSeconds = secondsUntilEnd - WARN_LEAD_SECONDS;
      if (warnSeconds >= 1) {
        const { title, body } = getWarnCopy(mission);
        newWarnId = await scheduleTimerNotification(title, body, warnSeconds, {
          data: {
            type: "mini_mission",
            kind: "mini_warn",
            missionId: mission.id,
            endMs,
          },
        });
      }
    }

    const failTitle = "Mini failed";
    const failBody = `Your mini mission failed. Retry "${mission.title}" and try to win again.`;
    const newFailId = await scheduleTimerNotification(failTitle, failBody, secondsUntilEnd, {
      data: {
        type: "mini_mission",
        kind: "mini_fail",
        missionId: mission.id,
        endMs,
      },
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

/** Cancel the pre-end warning while leaving the deadline alert intact. */
export async function clearMiniMissionWarningNotification(missionId: string) {
  await cancelNotification(warnIdByMission.get(missionId) ?? null);
  await scanAndCancelMiniMissionNotifications(missionId, ["mini_warn"]);
  warnIdByMission.delete(missionId);
}

/** Cancel scheduled warn + fail for one mission (e.g. timer fired in foreground). */
export async function clearMiniMissionNotifications(missionId: string) {
  await cancelNotification(warnIdByMission.get(missionId) ?? null);
  await cancelNotification(failIdByMission.get(missionId) ?? null);
  await scanAndCancelMiniMissionNotifications(missionId);
  lastEndMsByMission.delete(missionId);
  warnIdByMission.delete(missionId);
  failIdByMission.delete(missionId);
}
