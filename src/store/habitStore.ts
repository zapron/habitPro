import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  getRemoteSyncUserId,
  registerSyncSnapshotGetter,
  requestRemoteSync,
} from "../lib/syncQueue";
import { Habit, HabitStore, MiniMission, type MissionVisibility } from "../types/habit";

const isEditableDate = (dateString: string) => {
  const target = new Date(dateString);
  target.setHours(0, 0, 0, 0);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  return (
    target.getTime() === today.getTime() ||
    target.getTime() === yesterday.getTime()
  );
};

const normalizeCompletedDates = (dates: string[]) =>
  [...new Set(dates)].sort((a, b) => a.localeCompare(b));

/**
 * Calculate the current CONSECUTIVE streak ending today or yesterday.
 * If the user hasn't completed today AND hasn't completed yesterday, streak = 0.
 */
const getConsecutiveStreak = (sortedDates: string[]): number => {
  if (sortedDates.length === 0) return 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const todayStr = fmt(today);
  const yesterdayStr = fmt(yesterday);

  const dateSet = new Set(sortedDates);

  // Streak must be anchored to today or yesterday
  if (!dateSet.has(todayStr) && !dateSet.has(yesterdayStr)) return 0;

  // Count backwards from the most recent completed day
  let cursor = dateSet.has(todayStr) ? new Date(today) : new Date(yesterday);
  let streak = 0;

  while (true) {
    const key = fmt(cursor);
    if (!dateSet.has(key)) break;
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
};

const getDerivedState = (completedDates: string[], totalDays: number) => {
  const normalized = normalizeCompletedDates(completedDates);
  const streak = getConsecutiveStreak(normalized);
  const isCompleted = normalized.length >= totalDays;
  const status = (isCompleted ? "completed" : "active") as
    | "active"
    | "completed"
    | "failed";

  return { normalized, streak, isCompleted, status };
};

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
const migrateHabit = (h: any): Habit => ({
  ...h,
  mode: h.mode ?? "autopilot",
  totalDays: h.totalDays ?? 21,
  ownerUserId: h.ownerUserId ?? null,
  visibility:
    h.visibility === "public" || h.visibility === "solo" ? h.visibility : "solo",
  // endDate is intentionally left undefined for autopilot
});

export const useHabitStore = create<HabitStore>()(
  persist(
    (set, get) => ({
      habits: [],
      miniMissions: [],
      xp: 0,
      resetStore: () => set({ habits: [], miniMissions: [], xp: 0 }),
      addHabit: ({ title, description, mode, totalDays: customDays, visibility }) => {
        const now = new Date().toISOString();
        const totalDays =
          mode === "manual" ? Math.max(3, Math.min(365, customDays ?? 21)) : 21;
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
        };
        set((state) => ({ habits: [...state.habits, newHabit] }));
        requestRemoteSync({ immediate: true });
      },
      toggleCompletion: (id, date) => {
        if (!isEditableDate(date)) {
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
            );

            return {
              ...habit,
              completedDates: normalized,
              streak,
              isCompleted,
              status,
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
          }
        }
        if (changed) {
          requestRemoteSync({ immediate: false });
        }
        return changed;
      },
      deleteHabit: (id) => {
        set((state) => ({
          habits: state.habits.filter((h) => h.id !== id),
        }));
        requestRemoteSync({ immediate: true });
      },
      resetHabit: (id) => {
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
              endDate:
                h.mode === "manual"
                  ? calculateEndDate(now, h.totalDays)
                  : undefined,
            };
          }),
        }));
        requestRemoteSync({ immediate: false });
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
      addMiniMission: ({ title, objective, estimatedMinutes, startMode, visibility }) => {
        const now = new Date().toISOString();
        const id =
          Date.now().toString(36) + Math.random().toString(36).substring(2);
        const normalizedMinutes = Math.max(1, Math.floor(estimatedMinutes));
        const vis: MissionVisibility =
          visibility === "public" || visibility === "solo" ? visibility : "solo";

        const newMiniMission: MiniMission = {
          ownerUserId: getRemoteSyncUserId() ?? undefined,
          id,
          title,
          objective,
          visibility: vis,
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
      completeMiniMission: (id) => {
        const now = new Date().toISOString();
        const mission = get().miniMissions.find((m) => m.id === id);
        set((state) => ({
          miniMissions: state.miniMissions.map((m) => {
            if (m.id !== id) return m;
            return {
              ...m,
              status: "completed",
              completedAt: now,
              startedAt: m.startedAt ?? now,
            };
          }),
        }));

        // Award XP for mini mission completion
        let xpGain = 15;
        if (mission?.startedAt) {
          const elapsed = Date.now() - new Date(mission.startedAt).getTime();
          const allocated =
            (mission.estimatedMinutes + mission.extendedMinutes) * 60_000;
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
      extendMiniMission: (id, extraMinutes) => {
        set((state) => ({
          miniMissions: state.miniMissions.map((mission) => {
            if (mission.id !== id) return mission;
            if (mission.status !== "in_progress") return mission;
            return {
              ...mission,
              extendedMinutes: mission.extendedMinutes + extraMinutes,
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
          state.habits = state.habits.map(migrateHabit);
          // Migrate legacy mini missions missing extendedMinutes
          state.miniMissions = state.miniMissions.map((m) => ({
            ...m,
            extendedMinutes: m.extendedMinutes ?? 0,
            ownerUserId: m.ownerUserId ?? null,
            visibility:
              m.visibility === "public" || m.visibility === "solo"
                ? m.visibility
                : "solo",
          }));
          // Migrate: ensure xp exists
          if (state.xp == null) state.xp = 0;
        }
      },
    },
  ),
);

registerSyncSnapshotGetter(() => {
  const s = useHabitStore.getState();
  return { habits: s.habits, miniMissions: s.miniMissions, xp: s.xp };
});
