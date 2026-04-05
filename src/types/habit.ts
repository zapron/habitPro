export type HabitMode = "autopilot" | "manual";

/** Public = discoverable by others later; solo = private to you. */
export type MissionVisibility = "public" | "solo";

export interface Habit {
  /** Supabase auth user id who owns this mission (set on create / hydrate). */
  ownerUserId?: string | null;
  id: string;
  title: string;
  description?: string;
  mode: HabitMode;
  /** Default solo; public missions can be made solo anytime. */
  visibility: MissionVisibility;
  startDate: string; // ISO string
  endDate?: string; // ISO string — only set for manual mode
  completedDates: string[]; // Array of ISO date strings (YYYY-MM-DD)
  streak: number;
  totalDays: number; // Fixed 21 for autopilot, user-defined for manual
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
  /** Supabase auth user id who owns this mini mission (set on create / hydrate). */
  ownerUserId?: string | null;
  id: string;
  title: string;
  objective?: string;
  visibility: MissionVisibility;
  estimatedMinutes: number;
  extendedMinutes: number; // extra time added via "5 More Minutes"
  status: MiniMissionStatus;
  createdAt: string;
  scheduledStartAt?: string;
  startedAt?: string;
  completedAt?: string;
}

export type AddHabitInput = {
  title: string;
  description?: string;
  mode: HabitMode;
  totalDays?: number; // required for manual, defaults to 21 for autopilot
  visibility?: MissionVisibility;
};

export type HabitStore = {
  habits: Habit[];
  miniMissions: MiniMission[];
  xp: number;
  /** Clears mission data (e.g. on sign-out). */
  resetStore: () => void;
  addHabit: (input: AddHabitInput) => void;
  toggleCompletion: (id: string, date: string) => boolean;
  deleteHabit: (id: string) => void;
  resetHabit: (id: string) => void;
  getHabit: (id: string) => Habit | undefined;
  addMiniMission: (input: {
    title: string;
    objective?: string;
    estimatedMinutes: number;
    startMode: "now" | "later";
    visibility?: MissionVisibility;
  }) => string;
  setHabitVisibility: (id: string, visibility: MissionVisibility) => void;
  setMiniMissionVisibility: (id: string, visibility: MissionVisibility) => void;
  startMiniMission: (id: string) => void;
  completeMiniMission: (id: string) => void;
  extendMiniMission: (id: string, extraMinutes: number) => void;
  cancelMiniMission: (id: string) => void;
  deleteMiniMission: (id: string) => void;
  getMiniMission: (id: string) => MiniMission | undefined;
  addXp: (amount: number) => void;
};
