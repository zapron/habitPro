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

export type MiniMissionStatus =
  | "pending"
  | "scheduled"
  | "in_progress"
  | "completed"
  | "cancelled";

export interface MiniMission {
  id: string;
  title: string;
  objective?: string;
  estimatedMinutes: number;
  status: MiniMissionStatus;
  createdAt: string;
  scheduledStartAt?: string;
  startedAt?: string;
  completedAt?: string;
}

export type HabitStore = {
  habits: Habit[];
  miniMissions: MiniMission[];
  addHabit: (title: string, description?: string) => void;
  toggleCompletion: (id: string, date: string) => boolean;
  deleteHabit: (id: string) => void;
  resetHabit: (id: string) => void;
  getHabit: (id: string) => Habit | undefined;
  addMiniMission: (input: {
    title: string;
    objective?: string;
    estimatedMinutes: number;
    startMode: "now" | "later";
  }) => string;
  startMiniMission: (id: string) => void;
  completeMiniMission: (id: string) => void;
  cancelMiniMission: (id: string) => void;
  deleteMiniMission: (id: string) => void;
  getMiniMission: (id: string) => MiniMission | undefined;
};
