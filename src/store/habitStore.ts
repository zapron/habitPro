import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Habit, HabitStore, MiniMission } from "../types/habit";

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

const getDerivedState = (completedDates: string[], totalDays: number) => {
  const normalized = normalizeCompletedDates(completedDates);
  const streak = normalized.length;
  const isCompleted = normalized.length >= totalDays;
  const status = (isCompleted ? "completed" : "active") as
    | "active"
    | "completed"
    | "failed";

  return { normalized, streak, isCompleted, status };
};

export const useHabitStore = create<HabitStore>()(
  persist(
    (set, get) => ({
      habits: [],
      miniMissions: [],
      addHabit: (title, description) => {
        const newHabit: Habit = {
          id: Date.now().toString(36) + Math.random().toString(36).substring(2),
          title,
          description,
          startDate: new Date().toISOString(),
          completedDates: [],
          streak: 0,
          totalDays: 21,
          isCompleted: false,
          status: "active",
        };
        set((state) => ({ habits: [...state.habits, newHabit] }));
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
        return changed;
      },
      deleteHabit: (id) => {
        set((state) => ({
          habits: state.habits.filter((h) => h.id !== id),
        }));
      },
      resetHabit: (id) => {
        set((state) => ({
          habits: state.habits.map((h) => {
            if (h.id !== id) return h;
            return {
              ...h,
              completedDates: [],
              streak: 0,
              isCompleted: false,
              status: "active",
              startDate: new Date().toISOString(),
            };
          }),
        }));
      },
      getHabit: (id) => {
        return get().habits.find((h) => h.id === id);
      },
      addMiniMission: ({ title, objective, estimatedMinutes, startMode }) => {
        const now = new Date().toISOString();
        const id =
          Date.now().toString(36) + Math.random().toString(36).substring(2);
        const normalizedMinutes = Math.max(1, Math.floor(estimatedMinutes));

        const newMiniMission: MiniMission = {
          id,
          title,
          objective,
          estimatedMinutes: normalizedMinutes,
          status: startMode === "now" ? "in_progress" : "pending",
          createdAt: now,
          startedAt: startMode === "now" ? now : undefined,
          scheduledStartAt: startMode === "later" ? now : undefined,
        };

        set((state) => ({
          miniMissions: [newMiniMission, ...state.miniMissions],
        }));

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
      },
      completeMiniMission: (id) => {
        const now = new Date().toISOString();
        set((state) => ({
          miniMissions: state.miniMissions.map((mission) => {
            if (mission.id !== id) return mission;
            return {
              ...mission,
              status: "completed",
              completedAt: now,
              startedAt: mission.startedAt ?? now,
            };
          }),
        }));
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
      },
      deleteMiniMission: (id) => {
        set((state) => ({
          miniMissions: state.miniMissions.filter((mission) => mission.id !== id),
        }));
      },
      getMiniMission: (id) => {
        return get().miniMissions.find((mission) => mission.id === id);
      },
    }),
    {
      name: "habit-storage",
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
