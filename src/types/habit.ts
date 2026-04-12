export type HabitMode = "autopilot" | "manual";

/** User answer after the mission window ends without a full grid (honor system). */
export type MissionReport = "accomplished" | "failed";

/** Public = group mission members can see streak memory; solo = private to you. */
export type MissionVisibility = "public" | "solo";

/** Optional capture when marking a day complete. */
export interface StreakMemory {
  note?: string;
  /** Device-local URI before upload (offline-only if never uploaded). */
  imageUri?: string;
  /** Supabase Storage public URL after upload (synced for cohort / other devices). */
  imageUrl?: string;
  createdAt: string;
}

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
  /** Set after mission window ends (incomplete grid); drives Mission Reports + pills. */
  missionReport?: MissionReport;
  missionReportAt?: string;
  /** YYYY-MM-DD → memory for that check-in */
  streakMemories?: Record<string, StreakMemory>;
  /** When set, this habit is part of a Supabase-backed group mission. */
  challengeGroupId?: string | null;
  /** IANA timezone of the challenge creator; used for which calendar day counts. */
  challengeCreatorTimezone?: string | null;
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
  /** After removing from Community wins, user cannot publish this mission again. */
  communityFeedRevoked?: boolean;
  estimatedMinutes: number;
  extendedMinutes: number; // +1 min per reserve tap; capped (see MAX_RESERVE_FUEL_MINUTES)
  status: MiniMissionStatus;
  createdAt: string;
  scheduledStartAt?: string;
  startedAt?: string;
  completedAt?: string;
  /** Optional photo/note saved when completing (local URIs until cloud sync). */
  completionMemory?: StreakMemory;
}

export type AddHabitInput = {
  title: string;
  description?: string;
  mode: HabitMode;
  totalDays?: number; // required for manual, defaults to 21 for autopilot
  visibility?: MissionVisibility;
  /** When joining a group challenge from a template (new habit id on accept). */
  challengeGroupId?: string | null;
  challengeCreatorTimezone?: string | null;
  /** Override start date (ISO) e.g. to align with challenge start. */
  startDate?: string;
};

export type HabitStore = {
  habits: Habit[];
  miniMissions: MiniMission[];
  xp: number;
  /** Lowercase public handle for challenges; synced to `profiles.username`. */
  username: string | null;
  setUsername: (username: string | null) => void;
  /** Clears mission data (e.g. on sign-out). */
  resetStore: () => void;
  addHabit: (input: AddHabitInput) => string;
  toggleCompletion: (id: string, date: string) => boolean;
  setStreakMemory: (id: string, date: string, memory: StreakMemory | null) => void;
  deleteHabit: (id: string) => void;
  resetHabit: (id: string) => void;
  setMissionReport: (id: string, report: MissionReport) => void;
  getHabit: (id: string) => Habit | undefined;
  addMiniMission: (input: {
    title: string;
    objective?: string;
    estimatedMinutes: number;
    startMode: "now" | "later";
  }) => string;
  setHabitVisibility: (id: string, visibility: MissionVisibility) => void;
  setMiniMissionVisibility: (id: string, visibility: MissionVisibility) => void;
  setMiniMissionCommunityFeedRevoked: (id: string, revoked: boolean) => void;
  startMiniMission: (id: string) => void;
  completeMiniMission: (
    id: string,
    memory?: StreakMemory | null,
    opts?: {
      visibility?: MissionVisibility;
      communityFeedRevoked?: boolean;
      /** When set (e.g. when timer was frozen at “Mark Complete”), used for completedAt and XP early-finish. */
      completedAt?: string;
    },
  ) => void;
  extendMiniMission: (id: string, extraMinutes: number) => void;
  cancelMiniMission: (id: string) => void;
  /** Timer depleted: restart same mission with fresh clock (reserve fuel cleared). */
  retryFailedMiniMission: (id: string) => void;
  deleteMiniMission: (id: string) => void;
  getMiniMission: (id: string) => MiniMission | undefined;
  addXp: (amount: number) => void;
  /** Habits owned by other users in shared group missions (read-only for UI). */
  cohortPeerHabits: Habit[];
  setCohortPeerHabits: (habits: Habit[]) => void;
  setHabitChallengeMeta: (
    id: string,
    meta: { challengeGroupId: string | null; challengeCreatorTimezone: string | null },
  ) => void;
};
