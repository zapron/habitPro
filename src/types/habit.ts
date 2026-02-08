export interface Habit {
  id: string;
  title: string;
  description?: string;
  startDate: string; // ISO string
  completedDates: string[]; // Array of ISO date strings (YYYY-MM-DD)
  streak: number;
  totalDays: number; // Target is 21
  isCompleted: boolean;
  status: "active" | "completed" | "failed";
}

export type HabitStore = {
  habits: Habit[];
  addHabit: (title: string, description?: string) => void;
  toggleCompletion: (id: string, date: string) => void;
  deleteHabit: (id: string) => void;
  getHabit: (id: string) => Habit | undefined;
};
