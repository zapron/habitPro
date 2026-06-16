import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  getRemoteSyncUserId,
  registerSyncCommitHandler,
  registerSyncSnapshotGetter,
  requestRemoteHabitDelete,
  requestRemoteMiniMissionDelete,
  requestRemoteSync,
} from "../lib/syncQueue";
import { registerHabitMemoryUploadCommitter } from "../lib/sync";
import {
  Habit,
  HabitStore,
  MiniMission,
  type MissionReport,
  type MissionVisibility,
  type StreakMemory,
} from "../types/habit";
import { MAX_RESERVE_FUEL_MINUTES } from "../constants/miniMission";
import { recordAccountDeletedMissionId } from "../lib/accountBackup";
import { tryRecordChallengeMilestones } from "../lib/challengeCohort";
import { getDerivedState, isMissionGridFull } from "../utils/habitDerived";
import { isHabitCalendarDateToggleable } from "../utils/missionDaySlots";
import { isHabitMissionWindowClosed } from "../utils/habitMissionWindow";
import { mergeRepairIntoStreakMemory } from "../utils/repairStreakMemoryMerge";
import { alignGroupHabitToChallengeStart } from "../utils/groupMissionClock";
import { getMissionCalendarTimeZone } from "../utils/missionCalendarKeys";
import type { ChallengeGroupRow } from "../types/groupChallenge";
import { createDeferredJsonPersistStorage } from "../lib/deferredJsonPersistStorage";
/** Calculate endDate by adding `totalDays` to a start ISO string. */
const calculateEndDate = (startIso: string, totalDays: number): string => {
  const d = new Date(startIso);
  d.setDate(d.getDate() + totalDays);
  return d.toISOString();
};

/**
 * Migrate legacy habits that were created before the mode field existed.
 * They become autopilot missions with totalDays 21.
 */
const migrateHabit = (h: any): Habit => {
  const rawReport = h.missionReport;
  const missionReport: MissionReport | undefined =
    rawReport === "accomplished" || rawReport === "failed" ? rawReport : undefined;
  return {
    ...h,
    mode: h.mode ?? "autopilot",
    totalDays: h.totalDays ?? 21,
    ownerUserId: h.ownerUserId ?? null,
    visibility:
      h.visibility === "public" || h.visibility === "solo" ? h.visibility : "solo",
    streakMemories:
      h.streakMemories && typeof h.streakMemories === "object"
        ? h.streakMemories
        : undefined,
    challengeGroupId: h.challengeGroupId ?? null,
    challengeCreatorTimezone: h.challengeCreatorTimezone ?? null,
    missionTimezone:
      typeof h.missionTimezone === "string" || h.missionTimezone === null
        ? h.missionTimezone
        : null,
    reminderEnabled: typeof h.reminderEnabled === "boolean" ? h.reminderEnabled : false,
    reminderTimeLocal:
      typeof h.reminderTimeLocal === "string" || h.reminderTimeLocal === null
        ? h.reminderTimeLocal
        : null,
    reminderLocked: typeof h.reminderLocked === "boolean" ? h.reminderLocked : false,
    missionReport,
    missionReportAt:
      typeof h.missionReportAt === "string" ? h.missionReportAt : undefined,
    // endDate is intentionally left undefined for autopilot
  };
};

function mergeDirtyIdsByReference<T extends { id: string }>(
  previousItems: T[],
  nextItems: T[],
  currentDirtyIds: string[] | undefined,
): string[] {
  const dirtyIds = currentDirtyIds ?? [];
  if (previousItems === nextItems) return dirtyIds;

  const previousById = new Map(previousItems.map((item) => [item.id, item]));
  let nextDirtySet: Set<string> | null = null;

  for (const item of nextItems) {
    if (previousById.get(item.id) === item) continue;
    nextDirtySet ??= new Set(dirtyIds);
    nextDirtySet.add(item.id);
  }

  return nextDirtySet ? [...nextDirtySet] : dirtyIds;
}

function sameStringArray(a: string[] | undefined, b: string[] | undefined): boolean {
  const aa = a ?? [];
  const bb = b ?? [];
  if (aa.length !== bb.length) return false;
  for (let i = 0; i < aa.length; i += 1) {
    if (aa[i] !== bb[i]) return false;
  }
  return true;
}

function areCohortPeerHabitsEqual(previous: Habit[], next: Habit[]): boolean {
  if (previous === next) return true;
  if (previous.length !== next.length) return false;

  for (let i = 0; i < previous.length; i += 1) {
    const a = previous[i];
    const b = next[i];
    if (
      a.id !== b.id ||
      a.ownerUserId !== b.ownerUserId ||
      a.challengeGroupId !== b.challengeGroupId ||
      a.status !== b.status ||
      a.streak !== b.streak ||
      a.totalDays !== b.totalDays ||
      a.isCompleted !== b.isCompleted ||
      a.missionReport !== b.missionReport ||
      !sameStringArray(a.completedDates, b.completedDates)
    ) {
      return false;
    }
  }

  return true;
}

export const useHabitStore = create<HabitStore>()(
  persist(
    (rawSet, get) => {
      const set: typeof rawSet = (nextStateOrFn, replace) => {
        rawSet((state) => {
          const next =
            typeof nextStateOrFn === "function"
              ? (nextStateOrFn as any)(state)
              : nextStateOrFn;
          const updates = { ...next };

          if (next.habits && next.habits !== state.habits) {
            updates.dirtyHabitIds = mergeDirtyIdsByReference(
              state.habits,
              next.habits,
              state.dirtyHabitIds,
            );
          }

          if (next.miniMissions && next.miniMissions !== state.miniMissions) {
            updates.dirtyMiniMissionIds = mergeDirtyIdsByReference(
              state.miniMissions,
              next.miniMissions,
              state.dirtyMiniMissionIds,
            );
          }

          return updates;
        }, replace);
      };

      return {
        habits: [],
        miniMissions: [],
        xp: 0,
        dirtyHabitIds: [],
        dirtyMiniMissionIds: [],
        clearDirtyState: (habitIds, miniIds) => {
          rawSet((state) => {
            const nextHabits = habitIds
              ? (state.dirtyHabitIds ?? []).filter((id) => !habitIds.includes(id))
              : state.dirtyHabitIds ?? [];
            const nextMinis = miniIds
              ? (state.dirtyMiniMissionIds ?? []).filter((id) => !miniIds.includes(id))
              : state.dirtyMiniMissionIds ?? [];
            return { dirtyHabitIds: nextHabits, dirtyMiniMissionIds: nextMinis };
          });
        },
        username: null,
        setUsername: (username) => set({ username }),
        cohortPeerHabits: [],
        setCohortPeerHabits: (cohortPeerHabits) => {
          rawSet((state) =>
            areCohortPeerHabitsEqual(state.cohortPeerHabits, cohortPeerHabits)
              ? state
              : { cohortPeerHabits },
          );
        },
      setHabitChallengeMeta: (id, meta) => {
        set((state) => ({
          habits: state.habits.map((h) =>
            h.id === id
              ? {
                  ...h,
                  challengeGroupId: meta.challengeGroupId,
                  challengeCreatorTimezone: meta.challengeCreatorTimezone,
                  missionTimezone: meta.challengeCreatorTimezone ?? h.missionTimezone ?? null,
                }
              : h,
          ),
        }));
        requestRemoteSync({ immediate: true });
      },
      synchronizeHabitWithChallengeGroup: (habitId, group: ChallengeGroupRow) => {
        set((state) => ({
          habits: state.habits.map((h) => {
            if (h.id !== habitId) return h;
            const withMeta: Habit = {
              ...h,
              challengeGroupId: group.id,
              challengeCreatorTimezone: group.creator_timezone,
              missionTimezone: group.creator_timezone ?? h.missionTimezone ?? getMissionCalendarTimeZone(),
            };
            return alignGroupHabitToChallengeStart(
              withMeta,
              group.start_date,
              group.habit_template,
            );
          }),
        }));
        requestRemoteSync({ immediate: true });
      },
      resetStore: () =>
        set({ habits: [], miniMissions: [], xp: 0, username: null, cohortPeerHabits: [] }),
      addHabit: ({
        title,
        description,
        mode,
        totalDays: customDays,
        visibility,
        challengeGroupId,
        challengeCreatorTimezone,
        startDate: startDateOverride,
        endDate: endDateOverride,
        missionTimezone: missionTimezoneOverride,
      }) => {
        const now = startDateOverride ?? new Date().toISOString();
        const totalDays =
          mode === "manual" ? Math.max(1, Math.min(365, customDays ?? 21)) : 21;
        const vis: MissionVisibility =
          visibility === "public" || visibility === "solo" ? visibility : "solo";
        const missionTimezone =
          typeof missionTimezoneOverride === "string" && missionTimezoneOverride.trim().length > 0
            ? missionTimezoneOverride.trim()
            : typeof challengeCreatorTimezone === "string" && challengeCreatorTimezone.trim().length > 0
              ? challengeCreatorTimezone.trim()
              : getMissionCalendarTimeZone();

        const newHabit: Habit = {
          ownerUserId: getRemoteSyncUserId() ?? undefined,
          id: Date.now().toString(36) + Math.random().toString(36).substring(2),
          title,
          description,
          mode,
          visibility: vis,
          startDate: now,
          endDate:
            mode === "manual"
              ? endDateOverride ?? calculateEndDate(now, totalDays)
              : undefined,
          completedDates: [],
          streak: 0,
          totalDays,
          isCompleted: false,
          status: "active",
          missionTimezone,
          ...(challengeGroupId
            ? {
                challengeGroupId,
                challengeCreatorTimezone: challengeCreatorTimezone ?? null,
              }
            : {}),
        };
        set((state) => ({ habits: [...state.habits, newHabit] }));
        requestRemoteSync({ immediate: true });
        return newHabit.id;
      },
      toggleCompletion: (id, date) => {
        const habitBefore = get().habits.find((h) => h.id === id);
        if (!habitBefore || !isHabitCalendarDateToggleable(habitBefore, date, Date.now())) {
          return false;
        }

        let changed = false;
        set((state) => {
          let xpGain = 0;
          const updatedHabits = state.habits.map((habit) => {
            if (habit.id !== id) return habit;

            changed = true;
            const isAlreadyCompleted = habit.completedDates.includes(date);
            const newCompletedDates = isAlreadyCompleted
              ? habit.completedDates.filter((d) => d !== date)
              : [...habit.completedDates, date];

            const { normalized, streak, isCompleted, status } = getDerivedState(
              newCompletedDates,
              habit.totalDays,
              habit.missionReport,
            );

            // Award XP inside the store action atomically
            if (!isAlreadyCompleted && normalized.includes(date)) {
              xpGain = 10; // base XP
              if (streak === 7) xpGain += 50;
              else if (streak === 14) xpGain += 75;
              else if (streak === 21) xpGain += 150;
              else if (streak >= 3 && streak % 7 === 0) xpGain += 30;
            }

            let nextMemories = habit.streakMemories ?? {};
            if (isAlreadyCompleted) {
              nextMemories = { ...nextMemories };
              delete nextMemories[date];
            }

            return {
              ...habit,
              completedDates: normalized,
              streak,
              isCompleted,
              status,
              streakMemories: nextMemories,
            };
          });

          return changed
            ? { habits: updatedHabits, xp: state.xp + xpGain }
            : { habits: updatedHabits };
        });

        if (changed) {
          const habit = get().habits.find((h) => h.id === id);
          if (habit && habit.challengeGroupId) {
            void tryRecordChallengeMilestones(habitBefore, habit);
          }
          requestRemoteSync({ immediate: false });
        }
        return changed;
      },
      applyStreakRepairLocally: ({
        habitId,
        dateStr,
        xpCost,
        repairSource = "squad",
        deductXp,
      }) => {
        const shouldDeduct =
          deductXp !== false &&
          typeof xpCost === "number" &&
          Number.isFinite(xpCost) &&
          xpCost > 0;

        let didApply = false;
        let shouldChargeXp = false;
        set((state) => {
          const updatedHabits = state.habits.map((habit) => {
            if (habit.id !== habitId) return habit;

            const prevMem = habit.streakMemories?.[dateStr];
            const alreadyRepaired =
              habit.repairedDates?.includes(dateStr) === true ||
              prevMem?.repairSource === "solo" ||
              prevMem?.repairSource === "squad";
            const mergedMem = mergeRepairIntoStreakMemory(prevMem, repairSource);
            const nextStreakMemories: Record<string, StreakMemory> = {
              ...(habit.streakMemories ?? {}),
              [dateStr]: mergedMem,
            };

            // If already completed, still record repairedDates for UI dot (if missing).
            const alreadyCompleted = habit.completedDates.includes(dateStr);
            const nextCompletedDates = alreadyCompleted
              ? habit.completedDates
              : [...habit.completedDates, dateStr];

            const nextRepaired = Array.isArray(habit.repairedDates)
              ? habit.repairedDates.includes(dateStr)
                ? habit.repairedDates
                : [...habit.repairedDates, dateStr]
              : [dateStr];

            const { normalized, streak, isCompleted, status } = getDerivedState(
              nextCompletedDates,
              habit.totalDays,
              habit.missionReport,
            );

            didApply = true;
            if (!alreadyRepaired) shouldChargeXp = true;
            return {
              ...habit,
              completedDates: normalized,
              repairedDates: nextRepaired,
              streakMemories: nextStreakMemories,
              streak,
              isCompleted,
              status,
            };
          });

          const nextXp =
            shouldDeduct && shouldChargeXp ? Math.max(0, state.xp - (xpCost as number)) : state.xp;

          return didApply ? { habits: updatedHabits, xp: nextXp } : { habits: updatedHabits };
        });
      },
      setStreakMemory: (id, date, memory) => {
        set((state) => ({
          habits: state.habits.map((habit) => {
            if (habit.id !== id) return habit;
            const next = { ...(habit.streakMemories ?? {}) };
            if (memory === null) {
              delete next[date];
            } else {
              if (next[date]) return habit;
              next[date] = memory;
            }
            return { ...habit, streakMemories: next };
          }),
        }));
        requestRemoteSync({ immediate: false });
      },
      patchStreakMemory: (id, date, patch) => {
        set((state) => ({
          habits: state.habits.map((habit) => {
            if (habit.id !== id) return habit;
            const prev = habit.streakMemories?.[date];
            if (!prev) return habit;
            return {
              ...habit,
              streakMemories: {
                ...(habit.streakMemories ?? {}),
                [date]: { ...prev, ...patch },
              },
            };
          }),
        }));
        requestRemoteSync({ immediate: false });
      },
      deleteHabit: (id) => {
        void recordAccountDeletedMissionId(getRemoteSyncUserId(), "habit", id);
        set((state) => ({
          habits: state.habits.filter((h) => h.id !== id),
        }));
        requestRemoteHabitDelete(id);
      },
      resetHabit: (id) => {
        const target = get().habits.find((h) => h.id === id);
        if (target?.challengeGroupId) {
          return false;
        }
        set((state) => ({
          habits: state.habits.map((h) => {
            if (h.id !== id) return h;
            const now = new Date().toISOString();
            return {
              ...h,
              completedDates: [],
              streak: 0,
              isCompleted: false,
              status: "active",
              startDate: now,
              streakMemories: {},
              missionReport: undefined,
              missionReportAt: undefined,
              endDate:
                h.mode === "manual"
                  ? calculateEndDate(now, h.totalDays)
                  : undefined,
            };
          }),
        }));
        requestRemoteSync({ immediate: false });
        return true;
      },
      setMissionReport: (id, report) => {
        const habitBefore = get().habits.find((h) => h.id === id);
        if (!habitBefore || habitBefore.missionReport) return;

        const nowMs = Date.now();
        if (
          !isHabitMissionWindowClosed(habitBefore, nowMs) &&
          !isMissionGridFull(habitBefore)
        ) {
          return;
        }

        let didApply = false;
        set((state) => {
          let xpGain = 0;
          const updatedHabits = state.habits.map((habit) => {
            if (habit.id !== id) return habit;
            if (habit.missionReport) return habit;
            didApply = true;
            const d = getDerivedState(habit.completedDates, habit.totalDays, report);
            const at = new Date().toISOString();
            if (report === "accomplished") {
              xpGain = 100;
            }
            return {
              ...habit,
              completedDates: d.normalized,
              streak: d.streak,
              isCompleted: d.isCompleted,
              status: d.status,
              missionReport: report,
              missionReportAt: at,
            };
          });

          return didApply
            ? { habits: updatedHabits, xp: state.xp + xpGain }
            : { habits: updatedHabits };
        });

        const habitAfter = get().habits.find((h) => h.id === id);
        if (habitBefore && habitAfter && report === "accomplished") {
          void tryRecordChallengeMilestones(habitBefore, habitAfter);
        }
        if (didApply) {
          requestRemoteSync({ immediate: true });
        }
      },
      getHabit: (id) => {
        return get().habits.find((h) => h.id === id);
      },
      setHabitVisibility: (id, visibility) => {
        set((state) => ({
          habits: state.habits.map((h) =>
            h.id === id ? { ...h, visibility } : h,
          ),
        }));
        requestRemoteSync({ immediate: false });
      },
      setMiniMissionVisibility: (id, visibility) => {
        set((state) => ({
          miniMissions: state.miniMissions.map((m) =>
            m.id === id ? { ...m, visibility } : m,
          ),
        }));
        requestRemoteSync({ immediate: false });
      },
      setMiniMissionCommunityFeedRevoked: (id, revoked) => {
        set((state) => ({
          miniMissions: state.miniMissions.map((m) =>
            m.id === id ? { ...m, communityFeedRevoked: revoked } : m,
          ),
        }));
        requestRemoteSync({ immediate: false });
      },
      setMiniMissionLiveSquad: (id, squadId, role) => {
        set((state) => ({
          miniMissions: state.miniMissions.map((m) =>
            m.id === id ? { ...m, liveSquadId: squadId, liveSquadRole: role } : m,
          ),
        }));
        requestRemoteSync({ immediate: true });
      },
      addMiniMission: ({
        id: idOverride,
        title,
        objective,
        estimatedMinutes,
        startMode,
        createdAt,
        startedAt,
        liveSquadId,
        liveSquadRole,
      }) => {
        const now = createdAt ?? new Date().toISOString();
        const id = idOverride ??
          Date.now().toString(36) + Math.random().toString(36).substring(2);
        const normalizedMinutes = Math.max(1, Math.floor(estimatedMinutes));

        const newMiniMission: MiniMission = {
          ownerUserId: getRemoteSyncUserId() ?? undefined,
          id,
          title,
          objective,
          visibility: "solo",
          communityFeedRevoked: false,
          estimatedMinutes: normalizedMinutes,
          extendedMinutes: 0,
          status: startMode === "now" ? "in_progress" : "pending",
          createdAt: now,
          startedAt: startMode === "now" ? startedAt ?? now : undefined,
          scheduledStartAt: startMode === "later" ? now : undefined,
          liveSquadId: liveSquadId ?? null,
          liveSquadRole: liveSquadRole ?? null,
        };

        set((state) => ({
          miniMissions: [newMiniMission, ...state.miniMissions],
        }));
        requestRemoteSync({ immediate: true });

        return id;
      },
      startMiniMission: (id) => {
        const now = new Date().toISOString();
        set((state) => ({
          miniMissions: state.miniMissions.map((mission) => {
            if (mission.id !== id) return mission;
            if (mission.status === "completed") return mission;
            return {
              ...mission,
              status: "in_progress",
              startedAt: mission.startedAt ?? now,
              scheduledStartAt: undefined,
            };
          }),
        }));
        requestRemoteSync({ immediate: true });
      },
      completeMiniMission: (id, memory, opts) => {
        const now = new Date().toISOString();
        const completedAt = opts?.completedAt ?? now;
        const mission = get().miniMissions.find((m) => m.id === id);
        let completionMemory: StreakMemory | undefined;
        if (memory && (memory.note || memory.imageUri || memory.imageUrl)) {
          completionMemory = {
            createdAt: memory.createdAt ?? completedAt,
            ...(memory.note ? { note: memory.note } : {}),
            ...(memory.imageUri ? { imageUri: memory.imageUri } : {}),
            ...(memory.imageUrl ? { imageUrl: memory.imageUrl } : {}),
          };
        }
        const visOverride = opts?.visibility;
        const nextVisibility: MissionVisibility | undefined =
          visOverride === "public" || visOverride === "solo" ? visOverride : undefined;
        const nextRevoked =
          opts?.communityFeedRevoked !== undefined
            ? opts.communityFeedRevoked
            : undefined;

        let xpGain = 15;
        if (mission?.startedAt) {
          const elapsed =
            new Date(completedAt).getTime() -
            new Date(mission.startedAt).getTime();
          const allocated =
            (mission.estimatedMinutes + (mission.extendedMinutes ?? 0)) * 60_000;
          if (elapsed < allocated) xpGain += 10; // early finish bonus
        }

        set((state) => ({
          xp: state.xp + xpGain,
          miniMissions: state.miniMissions.map((m) => {
            if (m.id !== id) return m;
            return {
              ...m,
              status: "completed",
              completedAt,
              startedAt: m.startedAt ?? completedAt,
              ...(nextVisibility !== undefined ? { visibility: nextVisibility } : {}),
              ...(nextRevoked !== undefined
                ? { communityFeedRevoked: nextRevoked }
                : {}),
              ...(completionMemory ? { completionMemory } : {}),
            };
          }),
        }));

        requestRemoteSync({ immediate: true });
      },
      cancelMiniMission: (id) => {
        set((state) => ({
          miniMissions: state.miniMissions.map((mission) => {
            if (mission.id !== id) return mission;
            if (mission.status === "completed") return mission;
            return {
              ...mission,
              status: "cancelled",
            };
          }),
        }));
        requestRemoteSync({ immediate: false });
      },
      retryFailedMiniMission: (id) => {
        const mission = get().miniMissions.find((m) => m.id === id);
        if (mission?.liveSquadId) return;
        if (!mission || mission.status !== "in_progress" || !mission.startedAt) return;
        const totalMinutes =
          mission.estimatedMinutes + (mission.extendedMinutes ?? 0);
        const totalMs = totalMinutes * 60_000;
        const elapsed =
          Date.now() - new Date(mission.startedAt).getTime();
        if (elapsed < totalMs) return;
        const now = new Date().toISOString();
        set((state) => ({
          miniMissions: state.miniMissions.map((m) => {
            if (m.id !== id) return m;
            return {
              ...m,
              status: "in_progress",
              startedAt: now,
              extendedMinutes: 0,
              scheduledStartAt: undefined,
            };
          }),
        }));
        requestRemoteSync({ immediate: true });
      },
      extendMiniMission: (id, extraMinutes) => {
        set((state) => ({
          miniMissions: state.miniMissions.map((mission) => {
            if (mission.id !== id) return mission;
            if (mission.status !== "in_progress") return mission;
            const prev = mission.extendedMinutes ?? 0;
            const next = Math.min(
              MAX_RESERVE_FUEL_MINUTES,
              prev + extraMinutes,
            );
            if (next === prev) return mission;
            return {
              ...mission,
              extendedMinutes: next,
            };
          }),
        }));
        requestRemoteSync({ immediate: false });
      },
      deleteMiniMission: (id) => {
        const mission = get().miniMissions.find((m) => m.id === id);
        if (mission?.liveSquadId) return;
        void recordAccountDeletedMissionId(getRemoteSyncUserId(), "miniMission", id);
        set((state) => ({
          miniMissions: state.miniMissions.filter(
            (mission) => mission.id !== id,
          ),
        }));
        requestRemoteMiniMissionDelete(id);
      },
      getMiniMission: (id) => {
        return get().miniMissions.find((mission) => mission.id === id);
      },
      addXp: (amount) => {
        set((state) => ({ xp: state.xp + amount }));
      },
    };
  },
    {
      name: "habit-storage",
      storage: createDeferredJsonPersistStorage({
        delayMs: 250,
      }),
      partialize: (state) => ({
        habits: state.habits,
        miniMissions: state.miniMissions,
        xp: state.xp,
        dirtyHabitIds: state.dirtyHabitIds,
        dirtyMiniMissionIds: state.dirtyMiniMissionIds,
        username: state.username,
      }),
      // Migrate legacy habits on rehydration
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.habits = state.habits.map((h) => {
            const migrated = migrateHabit(h);
            const pre = getDerivedState(
              migrated.completedDates ?? [],
              migrated.totalDays ?? 21,
              migrated.missionReport,
            );
            let missionReport = migrated.missionReport;
            if (!missionReport && migrated.isCompleted === true && pre.gridFull) {
              missionReport = "accomplished";
            }
            const d = getDerivedState(
              migrated.completedDates ?? [],
              migrated.totalDays ?? 21,
              missionReport,
            );
            const missionReportAt =
              missionReport && !migrated.missionReportAt
                ? new Date().toISOString()
                : migrated.missionReportAt;
            return {
              ...migrated,
              missionReport,
              missionReportAt,
              completedDates: d.normalized,
              totalDays: d.totalDays,
              streak: d.streak,
              isCompleted: d.isCompleted,
              status: d.status,
            };
          });
          // Migrate legacy mini missions missing extendedMinutes
          state.miniMissions = state.miniMissions.map((m) => {
            const vis: MissionVisibility =
              m.visibility === "public" || m.visibility === "solo"
                ? m.visibility
                : "solo";
            const explicitRevoked = m.communityFeedRevoked;
            const communityFeedRevoked =
              explicitRevoked === true
                ? true
                : explicitRevoked === false
                  ? false
                  : m.status === "completed" && vis === "solo"
                    ? true
                    : false;
            return {
              ...m,
              extendedMinutes: m.extendedMinutes ?? 0,
              ownerUserId: m.ownerUserId ?? null,
              visibility: vis,
              communityFeedRevoked,
              liveSquadId:
                typeof (m as { liveSquadId?: unknown }).liveSquadId === "string"
                  ? (m as { liveSquadId: string }).liveSquadId
                  : null,
              liveSquadRole:
                (m as { liveSquadRole?: unknown }).liveSquadRole === "creator" ||
                (m as { liveSquadRole?: unknown }).liveSquadRole === "member"
                  ? ((m as { liveSquadRole: "creator" | "member" }).liveSquadRole)
                  : null,
            };
          });
          // Migrate: ensure xp exists
          if (state.xp == null) state.xp = 0;
          if (state.username === undefined) state.username = null;
        }
      },
    },
  ),
);

registerSyncSnapshotGetter(() => {
  const s = useHabitStore.getState();
  return {
    habits: s.habits,
    miniMissions: s.miniMissions,
    xp: s.xp,
    username: s.username,
    dirtyHabitIds: s.dirtyHabitIds ?? [],
    dirtyMiniMissionIds: s.dirtyMiniMissionIds ?? [],
  };
});

registerSyncCommitHandler((snap) => {
  const state = useHabitStore.getState();
  const pushedHabitsById = new Map(snap.habits.map((habit) => [habit.id, habit]));
  const pushedMinisById = new Map(snap.miniMissions.map((mission) => [mission.id, mission]));
  const safeHabitIds = (snap.dirtyHabitIds ?? []).filter((id) => {
    const current = state.habits.find((habit) => habit.id === id);
    return current != null && current === pushedHabitsById.get(id);
  });
  const safeMiniIds = (snap.dirtyMiniMissionIds ?? []).filter((id) => {
    const current = state.miniMissions.find((mission) => mission.id === id);
    return current != null && current === pushedMinisById.get(id);
  });
  state.clearDirtyState(safeHabitIds, safeMiniIds);

  const nextState = useHabitStore.getState();
  return {
    hasMoreDirty:
      (nextState.dirtyHabitIds?.length ?? 0) > 0 ||
      (nextState.dirtyMiniMissionIds?.length ?? 0) > 0,
  };
});

registerHabitMemoryUploadCommitter((habitId, dateStr, imageUrl) => {
  useHabitStore.getState().patchStreakMemory(habitId, dateStr, { imageUrl });
});
