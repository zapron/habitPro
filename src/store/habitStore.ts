import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  getRemoteSyncUserId,
  registerSyncSnapshotGetter,
  requestRemoteSync,
} from "../lib/syncQueue";
import {
  Habit,
  HabitStore,
  MiniMission,
  type MissionReport,
  type MissionVisibility,
  type StreakMemory,
} from "../types/habit";
import { MAX_RESERVE_FUEL_MINUTES } from "../constants/miniMission";
import { tryRecordChallengeMilestones } from "../lib/challengeCohort";
import { getDerivedState, isMissionGridFull } from "../utils/habitDerived";
import { isHabitCalendarDateToggleable } from "../utils/missionDaySlots";
import { isHabitMissionWindowClosed } from "../utils/habitMissionWindow";
import { mergeRepairIntoStreakMemory } from "../utils/repairStreakMemoryMerge";

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

export const useHabitStore = create<HabitStore>()(
  persist(
    (set, get) => ({
      habits: [],
      miniMissions: [],
      xp: 0,
      username: null,
      setUsername: (username) => set({ username }),
      cohortPeerHabits: [],
      setCohortPeerHabits: (cohortPeerHabits) => set({ cohortPeerHabits }),
      setHabitChallengeMeta: (id, meta) => {
        set((state) => ({
          habits: state.habits.map((h) =>
            h.id === id
              ? {
                  ...h,
                  challengeGroupId: meta.challengeGroupId,
                  challengeCreatorTimezone: meta.challengeCreatorTimezone,
                }
              : h,
          ),
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
      }) => {
        const now = startDateOverride ?? new Date().toISOString();
        const totalDays =
          mode === "manual" ? Math.max(1, Math.min(365, customDays ?? 21)) : 21;
        const vis: MissionVisibility =
          visibility === "public" || visibility === "solo" ? visibility : "solo";

        const newHabit: Habit = {
          ownerUserId: getRemoteSyncUserId() ?? undefined,
          id: Date.now().toString(36) + Math.random().toString(36).substring(2),
          title,
          description,
          mode,
          visibility: vis,
          startDate: now,
          endDate:
            mode === "manual" ? calculateEndDate(now, totalDays) : undefined,
          completedDates: [],
          streak: 0,
          totalDays,
          isCompleted: false,
          status: "active",
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
          return { habits: updatedHabits };
        });

        // Award XP for completing (not uncompleting)
        if (changed) {
          const habit = get().habits.find((h) => h.id === id);
          if (habit && habit.completedDates.includes(date)) {
            let xpGain = 10; // base XP
            // Streak milestone bonuses (psychological: variable reward)
            if (habit.streak === 7) xpGain += 50;
            else if (habit.streak === 14) xpGain += 75;
            else if (habit.streak === 21) xpGain += 150;
            else if (habit.streak >= 3 && habit.streak % 7 === 0) xpGain += 30;
            get().addXp(xpGain);
            if (habit.challengeGroupId) {
              void tryRecordChallengeMilestones(habitBefore, habit);
            }
          }
        }
        if (changed) {
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
        set((state) => {
          const updatedHabits = state.habits.map((habit) => {
            if (habit.id !== habitId) return habit;

            const prevMem = habit.streakMemories?.[dateStr];
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
            shouldDeduct && didApply ? Math.max(0, state.xp - (xpCost as number)) : state.xp;

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
        set((state) => ({
          habits: state.habits.filter((h) => h.id !== id),
        }));
        requestRemoteSync({ immediate: true });
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

        set((state) => ({
          habits: state.habits.map((habit) => {
            if (habit.id !== id) return habit;
            if (habit.missionReport) return habit;
            const d = getDerivedState(habit.completedDates, habit.totalDays, report);
            const at = new Date().toISOString();
            return {
              ...habit,
              completedDates: d.normalized,
              streak: d.streak,
              isCompleted: d.isCompleted,
              status: d.status,
              missionReport: report,
              missionReportAt: at,
            };
          }),
        }));

        const habitAfter = get().habits.find((h) => h.id === id);
        if (habitBefore && habitAfter && report === "accomplished") {
          get().addXp(100);
          void tryRecordChallengeMilestones(habitBefore, habitAfter);
        }
        requestRemoteSync({ immediate: true });
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
      addMiniMission: ({ title, objective, estimatedMinutes, startMode }) => {
        const now = new Date().toISOString();
        const id =
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
          startedAt: startMode === "now" ? now : undefined,
          scheduledStartAt: startMode === "later" ? now : undefined,
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
            };
          }),
        }));
        requestRemoteSync({ immediate: false });
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

        set((state) => ({
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

        // Award XP for mini mission completion
        let xpGain = 15;
        if (mission?.startedAt) {
          const elapsed =
            new Date(completedAt).getTime() -
            new Date(mission.startedAt).getTime();
          const allocated =
            (mission.estimatedMinutes + (mission.extendedMinutes ?? 0)) * 60_000;
          if (elapsed < allocated) xpGain += 10; // early finish bonus
        }
        get().addXp(xpGain);
        requestRemoteSync({ immediate: false });
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
        set((state) => ({
          miniMissions: state.miniMissions.filter(
            (mission) => mission.id !== id,
          ),
        }));
        requestRemoteSync({ immediate: true });
      },
      getMiniMission: (id) => {
        return get().miniMissions.find((mission) => mission.id === id);
      },
      addXp: (amount) => {
        set((state) => ({ xp: state.xp + amount }));
      },
    }),
    {
      name: "habit-storage",
      storage: createJSONStorage(() => AsyncStorage),
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
  return { habits: s.habits, miniMissions: s.miniMissions, xp: s.xp, username: s.username };
});
