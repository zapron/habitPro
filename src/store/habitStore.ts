import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Habit, HabitStore } from "../types/habit";

export const useHabitStore = create<HabitStore>()(
  persist(
    (set, get) => ({
      habits: [],
      addHabit: (title, description) => {
        const newHabit: Habit = {
          id: Math.random().toString(36).substring(7),
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
        set((state) => {
          const updatedHabits = state.habits.map((habit) => {
            if (habit.id !== id) return habit;

            const isAlreadyCompleted = habit.completedDates.includes(date);
            let newCompletedDates = isAlreadyCompleted
              ? habit.completedDates.filter((d) => d !== date)
              : [...habit.completedDates, date];

            // Simple streak calculation (can be enhanced)
            const newStreak = newCompletedDates.length;
            const isCompleted = newCompletedDates.length >= 21;

            return {
              ...habit,
              completedDates: newCompletedDates,
              streak: newStreak,
              isCompleted: isCompleted,
              status: isCompleted ? "completed" : "active",
            };
          });
          return { habits: updatedHabits };
        });
      },
      deleteHabit: (id) => {
        set((state) => ({
          habits: state.habits.filter((h) => h.id !== id),
        }));
      },
      getHabit: (id) => {
        return get().habits.find((h) => h.id === id);
      },
    }),
    {
      name: "habit-storage",
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
