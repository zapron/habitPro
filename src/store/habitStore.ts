import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  getRemoteSyncUserId,
  noteLocalStoreMutation,
  registerSyncCommitHandler,
  registerSyncSnapshotGetter,
  requestRemoteHabitDelete,
  requestRemoteMiniMissionDelete,
  requestRemoteSync,
} from "../lib/syncQueue";
import {
  registerHabitMemoryUploadCommitter,
  registerHabitTaskMemoryUploadCommitter,
  registerMiniTaskMemoryUploadCommitter,
  isHttpImageUri,
} from "../lib/sync";
import {
  canUseStreakMemoryUpload,
  shouldUploadLocalStreakImage,
  uploadHabitStreakMemoryImage,
  uploadHabitStreakTaskMemoryImage,
  uploadMiniStreakMemoryImage,
  uploadMiniStreakTaskMemoryImage,
} from "../lib/streakMemoryStorage";
import {
  Habit,
  HabitStore,
  MiniMission,
  type MissionReport,
  type MissionVisibility,
  type StreakMemory,
  type StreakMemoryTaskEntry,
} from "../types/habit";
import { MAX_RESERVE_FUEL_MINUTES } from "../constants/miniMission";
import { recordAccountDeletedMissionId } from "../lib/accountBackup";
import { tryRecordChallengeMilestones } from "../lib/challengeCohort";
import { getDerivedState, isMissionGridFull } from "../utils/habitDerived";
import {
  isHabitCalendarDateToggleable,
} from "../utils/missionDaySlots";
import { isHabitMissionWindowClosed } from "../utils/habitMissionWindow";
import { mergeRepairIntoStreakMemory } from "../utils/repairStreakMemoryMerge";
import { alignGroupHabitToChallengeStart } from "../utils/groupMissionClock";
import { getMissionCalendarTimeZone } from "../utils/missionCalendarKeys";
import type { ChallengeGroupRow } from "../types/groupChallenge";
import { createChunkedHabitPersistStorage } from "../lib/chunkedHabitPersistStorage";
/** Calculate endDate by adding `totalDays` to a start ISO string. */
const calculateEndDate = (startIso: string, totalDays: number): string => {
  const d = new Date(startIso);
  d.setDate(d.getDate() + totalDays);
  return d.toISOString();
};

/**
 * A memory entry only counts as evidence the day was actually completed when it
 * carries a classic marker (note/photo/check-in-only/repair). Checklist missions
 * (docs/CATALOG_ARCHITECTURE.md "Mark Day Complete") deliberately write a
 * tasks-only memory entry *before* the day is completed — logging a task no
 * longer implies completion — so a bare `{ tasks: [...] }` entry must NOT be
 * treated as proof the day should be force-added to completedDates. Getting this
 * wrong reintroduces exactly the bug this feature was built to remove: logging
 * the first task silently re-completing the day and firing the squad
 * notification, then locking every other task as if the day had been finished.
 */
const hasClassicCompletionEvidence = (memory: StreakMemory | undefined): boolean =>
  Boolean(memory?.note || memory?.imageUrl || memory?.imageUri || memory?.checkInOnly || memory?.repairSource);

const completedDatesWithMemoryEvidence = (
  completedDates: string[] | undefined,
  streakMemories: Habit["streakMemories"] | undefined,
): string[] => {
  const memoryDates = Object.entries(streakMemories ?? {})
    .filter(([date, memory]) => /^\d{4}-\d{2}-\d{2}$/.test(date) && hasClassicCompletionEvidence(memory))
    .map(([date]) => date);
  return [...(completedDates ?? []), ...memoryDates];
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
  const nextIds = new Set(nextItems.map((item) => item.id));
  const dirtyIds = (currentDirtyIds ?? []).filter((id) => nextIds.has(id));
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

          noteLocalStoreMutation();
          return updates;
        }, replace);
      };

      return {
        habits: [],
        miniMissions: [],
        xp: 0,
        dirtyHabitIds: [],
        dirtyMiniMissionIds: [],
        pendingDeleteHabitIds: [],
        pendingDeleteMiniMissionIds: [],
        pendingResetHabitIds: [],
        clearDirtyState: (habitIds, miniIds) => {
          rawSet((state) => {
            const clearedHabitIds = habitIds ? new Set(habitIds) : null;
            const clearedMiniIds = miniIds ? new Set(miniIds) : null;
            const nextHabits = habitIds
              ? (state.dirtyHabitIds ?? []).filter((id) => !clearedHabitIds!.has(id))
              : state.dirtyHabitIds ?? [];
            const nextMinis = miniIds
              ? (state.dirtyMiniMissionIds ?? []).filter((id) => !clearedMiniIds!.has(id))
              : state.dirtyMiniMissionIds ?? [];
            return { dirtyHabitIds: nextHabits, dirtyMiniMissionIds: nextMinis };
          });
        },
        clearRemotePendingState: ({ habitDeleteIds, miniDeleteIds, habitResetIds }) => {
          rawSet((state) => {
            const habitDeleteSet = habitDeleteIds ? new Set(habitDeleteIds) : null;
            const miniDeleteSet = miniDeleteIds ? new Set(miniDeleteIds) : null;
            const habitResetSet = habitResetIds ? new Set(habitResetIds) : null;
            return {
              pendingDeleteHabitIds: habitDeleteSet
                ? (state.pendingDeleteHabitIds ?? []).filter((id) => !habitDeleteSet.has(id))
                : state.pendingDeleteHabitIds ?? [],
              pendingDeleteMiniMissionIds: miniDeleteSet
                ? (state.pendingDeleteMiniMissionIds ?? []).filter((id) => !miniDeleteSet.has(id))
                : state.pendingDeleteMiniMissionIds ?? [],
              pendingResetHabitIds: habitResetSet
                ? (state.pendingResetHabitIds ?? []).filter((id) => !habitResetSet.has(id))
                : state.pendingResetHabitIds ?? [],
            };
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
      synchronizeHabitWithChallengeGroup: (habitId, group: ChallengeGroupRow, options) => {
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
        if (options?.requestRemoteSync !== false) {
          requestRemoteSync({ immediate: true });
        }
      },
      resetStore: () =>
        set({
          habits: [],
          miniMissions: [],
          xp: 0,
          username: null,
          cohortPeerHabits: [],
          dirtyHabitIds: [],
          dirtyMiniMissionIds: [],
          pendingDeleteHabitIds: [],
          pendingDeleteMiniMissionIds: [],
          pendingResetHabitIds: [],
        }),
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
        requestRemoteSync: shouldRequestRemoteSync = true,
        taskChecklist,
        joinedChallengeAt,
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
          ...(taskChecklist && taskChecklist.length > 0 ? { taskChecklist } : {}),
          ...(joinedChallengeAt ? { joinedChallengeAt } : {}),
        };
        set((state) => ({ habits: [...state.habits, newHabit] }));
        if (shouldRequestRemoteSync) {
          requestRemoteSync({ immediate: true });
        }
        return newHabit.id;
      },
      toggleCompletion: (id, date, nowMs = Date.now()) => {
        const habitBefore = get().habits.find((h) => h.id === id);
        if (!habitBefore || !isHabitCalendarDateToggleable(habitBefore, date, nowMs)) {
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
      repairHabitCompletedDatesFromMemories: (id) => {
        let changed = false;
        let beforeHabit: Habit | undefined;
        set((state) => {
          const updatedHabits = state.habits.map((habit) => {
            if (habit.id !== id) return habit;
            beforeHabit = habit;
            const nextCompletedDates = completedDatesWithMemoryEvidence(
              habit.completedDates,
              habit.streakMemories,
            );
            const { normalized, streak, isCompleted, status } = getDerivedState(
              nextCompletedDates,
              habit.totalDays,
              habit.missionReport,
            );
            if (
              normalized.length === habit.completedDates.length &&
              normalized.every((date, index) => date === habit.completedDates[index])
            ) {
              return habit;
            }
            changed = true;
            return {
              ...habit,
              completedDates: normalized,
              streak,
              isCompleted,
              status,
            };
          });
          return changed ? { habits: updatedHabits } : state;
        });

        if (changed) {
          const habit = get().habits.find((h) => h.id === id);
          if (habit && habit.challengeGroupId) {
            void tryRecordChallengeMilestones(beforeHabit, habit);
          }
          requestRemoteSync({ immediate: false });
        }
        return changed;
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
      patchStreakMemoryTaskProof: (id, date, taskId, imageUrl) => {
        set((state) => ({
          habits: state.habits.map((habit) => {
            if (habit.id !== id) return habit;
            const prevMemory = habit.streakMemories?.[date];
            if (!prevMemory?.tasks) return habit;
            let found = false;
            const nextTasks = prevMemory.tasks.map((t) => {
              if (t.taskId !== taskId) return t;
              found = true;
              return { ...t, proofUrls: [imageUrl] };
            });
            if (!found) return habit;
            return {
              ...habit,
              streakMemories: {
                ...(habit.streakMemories ?? {}),
                [date]: { ...prevMemory, tasks: nextTasks },
              },
            };
          }),
        }));
        requestRemoteSync({ immediate: false });
      },
      patchMiniCompletionMemory: (id, patch) => {
        set((state) => ({
          miniMissions: state.miniMissions.map((m) => {
            if (m.id !== id || !m.completionMemory) return m;
            return { ...m, completionMemory: { ...m.completionMemory, ...patch } };
          }),
        }));
        requestRemoteSync({ immediate: false });
      },
      patchMiniCompletionMemoryTaskProof: (id, taskId, imageUrl) => {
        set((state) => ({
          miniMissions: state.miniMissions.map((m) => {
            if (m.id !== id || !m.completionMemory?.tasks) return m;
            let found = false;
            const nextTasks = m.completionMemory.tasks.map((t) => {
              if (t.taskId !== taskId) return t;
              found = true;
              return { ...t, proofUrls: [imageUrl] };
            });
            if (!found) return m;
            return { ...m, completionMemory: { ...m.completionMemory, tasks: nextTasks } };
          }),
        }));
        requestRemoteSync({ immediate: false });
      },
      markChecklistDayComplete: (id, date, nowMs = Date.now()) => {
        const habitBefore = get().habits.find((h) => h.id === id);
        // A plain toggle would un-complete an already-completed day — this action
        // means "complete", not "flip", so bail out instead of calling toggleCompletion.
        if (!habitBefore || habitBefore.completedDates.includes(date)) return false;
        const changed = get().toggleCompletion(id, date, nowMs);
        if (!changed) return false;
        const habitAfter = get().habits.find((h) => h.id === id);
        if (habitAfter && !habitAfter.streakMemories?.[date]) {
          get().setStreakMemory(id, date, {
            createdAt: new Date().toISOString(),
            checkInOnly: true,
          });
        }
        return true;
      },
      deleteHabit: (id) => {
        void recordAccountDeletedMissionId(getRemoteSyncUserId(), "habit", id);
        set((state) => {
          const pendingDeleteHabitIds = state.pendingDeleteHabitIds?.includes(id)
            ? state.pendingDeleteHabitIds
            : [id, ...(state.pendingDeleteHabitIds ?? [])];
          return {
            habits: state.habits.filter((h) => h.id !== id),
            pendingDeleteHabitIds,
            pendingResetHabitIds: (state.pendingResetHabitIds ?? []).filter((pendingId) => pendingId !== id),
          };
        });
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
              repairedDates: [],
              missionReport: undefined,
              missionReportAt: undefined,
              endDate:
                h.mode === "manual"
                  ? calculateEndDate(now, h.totalDays)
                  : undefined,
            };
          }),
          pendingResetHabitIds: state.pendingResetHabitIds?.includes(id)
            ? state.pendingResetHabitIds
            : [id, ...(state.pendingResetHabitIds ?? [])],
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
        completionMode,
        startMode,
        createdAt,
        startedAt,
        liveSquadId,
        liveSquadRole,
        taskChecklist,
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
          completionMode: completionMode === "timer_check_in" ? "timer_check_in" : "manual",
          status: startMode === "now" ? "in_progress" : "pending",
          createdAt: now,
          startedAt: startMode === "now" ? startedAt ?? now : undefined,
          scheduledStartAt: startMode === "later" ? now : undefined,
          liveSquadId: liveSquadId ?? null,
          liveSquadRole: liveSquadRole ?? null,
          ...(taskChecklist && taskChecklist.length > 0 ? { taskChecklist } : {}),
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
        if (
          memory &&
          (memory.note || memory.imageUri || memory.imageUrl || (memory.tasks && memory.tasks.length > 0))
        ) {
          completionMemory = {
            createdAt: memory.createdAt ?? completedAt,
            ...(memory.note ? { note: memory.note } : {}),
            ...(memory.imageUri ? { imageUri: memory.imageUri } : {}),
            ...(memory.imageUrl ? { imageUrl: memory.imageUrl } : {}),
            ...(memory.tasks && memory.tasks.length > 0 ? { tasks: memory.tasks } : {}),
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
              draftTasks: undefined,
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
              draftTasks: undefined,
            };
          }),
        }));
        requestRemoteSync({ immediate: false });
      },
      failMiniMission: (id) => {
        const mission = get().miniMissions.find((m) => m.id === id);
        if (mission?.liveSquadId) return;
        set((state) => ({
          miniMissions: state.miniMissions.map((m) => {
            if (m.id !== id) return m;
            if (m.status === "completed" || m.status === "cancelled") return m;
            return {
              ...m,
              status: "missed",
              draftTasks: undefined,
            };
          }),
        }));
        requestRemoteSync({ immediate: true });
      },
      retryFailedMiniMission: (id) => {
        const mission = get().miniMissions.find((m) => m.id === id);
        if (mission?.liveSquadId) return;
        if (!mission || !mission.startedAt) return;
        const alreadyMissed = mission.status === "missed";
        if (!alreadyMissed && mission.status !== "in_progress") return;
        const totalMinutes =
          mission.estimatedMinutes + (mission.extendedMinutes ?? 0);
        const totalMs = totalMinutes * 60_000;
        const elapsed =
          Date.now() - new Date(mission.startedAt).getTime();
        if (!alreadyMissed && elapsed < totalMs) return;
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
              draftTasks: undefined,
            };
          }),
        }));
        requestRemoteSync({ immediate: true });
      },
      setMiniMissionDraftTask: (id, taskId, entry) => {
        set((state) => ({
          miniMissions: state.miniMissions.map((m) => {
            if (m.id !== id) return m;
            return { ...m, draftTasks: { ...m.draftTasks, [taskId]: entry } };
          }),
        }));
      },
      removeMiniMissionDraftTask: (id, taskId) => {
        set((state) => ({
          miniMissions: state.miniMissions.map((m) => {
            if (m.id !== id || !m.draftTasks || !(taskId in m.draftTasks)) return m;
            const { [taskId]: _removed, ...rest } = m.draftTasks;
            return { ...m, draftTasks: rest };
          }),
        }));
      },
      clearMiniMissionDraftTasks: (id) => {
        set((state) => ({
          miniMissions: state.miniMissions.map((m) => {
            if (m.id !== id || !m.draftTasks) return m;
            return { ...m, draftTasks: undefined };
          }),
        }));
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
        set((state) => {
          const pendingDeleteMiniMissionIds = state.pendingDeleteMiniMissionIds?.includes(id)
            ? state.pendingDeleteMiniMissionIds
            : [id, ...(state.pendingDeleteMiniMissionIds ?? [])];
          return {
            miniMissions: state.miniMissions.filter(
              (mission) => mission.id !== id,
            ),
            pendingDeleteMiniMissionIds,
          };
        });
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
      storage: createChunkedHabitPersistStorage({
        delayMs: 250,
      }),
      partialize: (state) => ({
        habits: state.habits,
        miniMissions: state.miniMissions,
        xp: state.xp,
        dirtyHabitIds: state.dirtyHabitIds,
        dirtyMiniMissionIds: state.dirtyMiniMissionIds,
        pendingDeleteHabitIds: state.pendingDeleteHabitIds,
        pendingDeleteMiniMissionIds: state.pendingDeleteMiniMissionIds,
        pendingResetHabitIds: state.pendingResetHabitIds,
        username: state.username,
      }),
      // Migrate legacy habits on rehydration
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.habits = state.habits.map((h) => {
            const migrated = migrateHabit(h);
            const completedWithMemories = completedDatesWithMemoryEvidence(
              migrated.completedDates,
              migrated.streakMemories,
            );
            const pre = getDerivedState(
              completedWithMemories,
              migrated.totalDays ?? 21,
              migrated.missionReport,
            );
            let missionReport = migrated.missionReport;
            if (!missionReport && migrated.isCompleted === true && pre.gridFull) {
              missionReport = "accomplished";
            }
            const d = getDerivedState(
              completedWithMemories,
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
          if (!Array.isArray(state.dirtyHabitIds)) state.dirtyHabitIds = [];
          if (!Array.isArray(state.dirtyMiniMissionIds)) state.dirtyMiniMissionIds = [];
          if (!Array.isArray(state.pendingDeleteHabitIds)) state.pendingDeleteHabitIds = [];
          if (!Array.isArray(state.pendingDeleteMiniMissionIds)) state.pendingDeleteMiniMissionIds = [];
          if (!Array.isArray(state.pendingResetHabitIds)) state.pendingResetHabitIds = [];
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
    pendingDeleteHabitIds: s.pendingDeleteHabitIds ?? [],
    pendingDeleteMiniMissionIds: s.pendingDeleteMiniMissionIds ?? [],
    pendingResetHabitIds: s.pendingResetHabitIds ?? [],
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
  state.clearRemotePendingState({
    habitDeleteIds: snap.pendingDeleteHabitIds ?? [],
    miniDeleteIds: snap.pendingDeleteMiniMissionIds ?? [],
    habitResetIds: snap.pendingResetHabitIds ?? [],
  });

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

registerHabitTaskMemoryUploadCommitter((habitId, dateStr, taskId, imageUrl) => {
  useHabitStore.getState().patchStreakMemoryTaskProof(habitId, dateStr, taskId, imageUrl);
});

registerMiniTaskMemoryUploadCommitter((miniMissionId, taskId, imageUrl) => {
  const mission = useHabitStore.getState().getMiniMission(miniMissionId);
  // Finalized missions store the task in completionMemory.tasks; a still-active
  // checklist run stores it in draftTasks — commit to whichever one actually has it.
  if (mission?.completionMemory?.tasks?.some((t) => t.taskId === taskId)) {
    useHabitStore.getState().patchMiniCompletionMemoryTaskProof(miniMissionId, taskId, imageUrl);
    return;
  }
  const draft = mission?.draftTasks?.[taskId];
  if (draft) {
    useHabitStore.getState().setMiniMissionDraftTask(miniMissionId, taskId, {
      ...draft,
      proofUrls: [imageUrl],
    });
  }
});

/** True when a task entry's photo is stuck on a device-local path (upload never succeeded/finished). */
function taskNeedsUploadRetry(task: StreakMemoryTaskEntry): boolean {
  const uri = task.proofUrls[0];
  return Boolean(uri && shouldUploadLocalStreakImage(uri) && !isHttpImageUri(uri));
}

/**
 * Sweeps every habit/mini-mission for a memory or task photo stuck on a device-local
 * path — an upload that failed or never finished, and (since nothing re-dirties that
 * record on its own) was never retried. `scheduleHabit*MemoryUpload` in sync.ts only
 * fires opportunistically when a record happens to be dirty-pushed again; this is the
 * explicit backstop so a one-off memory that's never touched again still eventually
 * uploads and becomes visible on other devices. Call once per successful auth hydration
 * (see AuthContext.tsx) — fire-and-forget, each upload commits independently as it
 * resolves.
 */
export function retryPendingMemoryUploads(): void {
  if (!canUseStreakMemoryUpload()) return;
  const { habits, miniMissions } = useHabitStore.getState();

  for (const habit of habits) {
    if (!habit.streakMemories) continue;
    for (const [dateStr, memory] of Object.entries(habit.streakMemories)) {
      const localUri = memory.imageUri;
      if (localUri && shouldUploadLocalStreakImage(localUri) && !isHttpImageUri(localUri)) {
        uploadHabitStreakMemoryImage({ habitId: habit.id, dateStr, localUri })
          .then((imageUrl) => {
            useHabitStore.getState().patchStreakMemory(habit.id, dateStr, { imageUrl });
          })
          .catch((e) => {
            if (__DEV__) console.warn("[habitPro] retry habit memory upload failed", e);
          });
      }
      for (const task of memory.tasks ?? []) {
        if (!taskNeedsUploadRetry(task)) continue;
        uploadHabitStreakTaskMemoryImage({
          habitId: habit.id,
          dateStr,
          taskId: task.taskId,
          localUri: task.proofUrls[0],
        })
          .then((imageUrl) => {
            useHabitStore.getState().patchStreakMemoryTaskProof(habit.id, dateStr, task.taskId, imageUrl);
          })
          .catch((e) => {
            if (__DEV__) console.warn("[habitPro] retry habit task upload failed", e);
          });
      }
    }
  }

  for (const mission of miniMissions) {
    const classicUri = mission.completionMemory?.imageUri;
    if (classicUri && shouldUploadLocalStreakImage(classicUri) && !isHttpImageUri(classicUri)) {
      uploadMiniStreakMemoryImage({ miniMissionId: mission.id, localUri: classicUri })
        .then((imageUrl) => {
          useHabitStore.getState().patchMiniCompletionMemory(mission.id, { imageUrl });
        })
        .catch((e) => {
          if (__DEV__) console.warn("[habitPro] retry mini memory upload failed", e);
        });
    }
    for (const task of mission.completionMemory?.tasks ?? []) {
      if (!taskNeedsUploadRetry(task)) continue;
      uploadMiniStreakTaskMemoryImage({
        miniMissionId: mission.id,
        taskId: task.taskId,
        localUri: task.proofUrls[0],
      })
        .then((imageUrl) => {
          useHabitStore.getState().patchMiniCompletionMemoryTaskProof(mission.id, task.taskId, imageUrl);
        })
        .catch((e) => {
          if (__DEV__) console.warn("[habitPro] retry mini task upload failed", e);
        });
    }
    // In-progress checklist run, not finalized yet — same treatment so the photo is
    // already uploaded by the time "Complete Mission" bakes draftTasks into completionMemory.
    for (const [taskId, entry] of Object.entries(mission.draftTasks ?? {})) {
      if (!taskNeedsUploadRetry(entry)) continue;
      uploadMiniStreakTaskMemoryImage({
        miniMissionId: mission.id,
        taskId,
        localUri: entry.proofUrls[0],
      })
        .then((imageUrl) => {
          const current = useHabitStore.getState().getMiniMission(mission.id)?.draftTasks?.[taskId];
          if (!current) return;
          useHabitStore.getState().setMiniMissionDraftTask(mission.id, taskId, {
            ...current,
            proofUrls: [imageUrl],
          });
        })
        .catch((e) => {
          if (__DEV__) console.warn("[habitPro] retry mini draft task upload failed", e);
        });
    }
  }
}
