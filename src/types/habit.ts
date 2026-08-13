export type HabitMode = "autopilot" | "manual";

/** User answer after the mission window ends without a full grid (honor system). */
export type MissionReport = "accomplished" | "failed";

/** Public = group mission members can see streak memory; solo = private to you. */
export type MissionVisibility = "public" | "solo";

/**
 * One task's log entry within a day's memory. See docs/CATALOG_ARCHITECTURE.md.
 * `proofUrls` is an array from day one — v1 UI only ever writes one entry, but this
 * is the seam that lets "multiple proofs per task" slot in later without a migration.
 */
export interface StreakMemoryTaskEntry {
  taskId: string;
  /** Snapshot of the task's label at logging time — survives later checklist edits. */
  label: string;
  note?: string;
  proofUrls: string[];
  loggedAt: string;
  /**
   * Whether this task's photo is included the next time the day's catalog is
   * shared/updated to Community. Defaults to true (absent = included) when a
   * task is first logged; the user can uncheck it before or after sharing —
   * same flag, same "Share/Update catalog" action either way.
   */
  includedInShare?: boolean;
}

/** Optional capture when marking a day complete. */
export interface StreakMemory {
  note?: string;
  /** Device-local URI before upload (offline-only if never uploaded). */
  imageUri?: string;
  /** Supabase Storage public URL after upload (synced for cohort / other devices). */
  imageUrl?: string;
  createdAt: string;
  /** This check-in was shared to the Community wins feed (habit streak moments). */
  communityPosted?: boolean;
  /** User removed this moment from Community; cannot publish this memory again. */
  communityFeedRevoked?: boolean;
  /** Day was completed via streak repair (squad approval vs solo XP). */
  repairSource?: "squad" | "solo";
  /**
   * User chose “Just mark done” with no photo/note — check-in is final (same lock as a saved moment).
   * Prevents re-opening the capture sheet or toggling the day off with a normal tap.
   */
  checkInOnly?: boolean;
  /**
   * Per-task log entries for missions with a task checklist. Absent/empty means this
   * day uses the classic single note+photo capture above, unchanged.
   */
  tasks?: StreakMemoryTaskEntry[];
}

/** One item in a mission's optional task checklist template. */
export interface TaskChecklistItem {
  id: string;
  label: string;
  order: number;
}

/** Lightweight cohort-only badge flags. Actual note/photo data is fetched on tap. */
export interface StreakMemoryMarker {
  hasPhoto?: boolean;
  hasNote?: boolean;
  checkInOnly?: boolean;
  createdAt?: string | null;
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
  /** YYYY-MM-DD -> lightweight marker flags for remote cohort timelines. */
  streakMemoryMarkers?: Record<string, StreakMemoryMarker>;
  /** When set, this habit is part of a Supabase-backed group mission. */
  challengeGroupId?: string | null;
  /** IANA timezone of the challenge creator; used for which calendar day counts. */
  challengeCreatorTimezone?: string | null;
  /** IANA timezone captured when this mission was created; enables calendar-day reset. */
  missionTimezone?: string | null;
  /**
   * When this device joined an EXISTING group challenge mid-way (i.e. `startDate` is the
   * cohort's original day-1 anchor, not when this participant actually started tracking).
   * Absent for the challenge creator and for solo/manual habits — only set on accept-invite.
   * Syncs to Supabase (`habits.joined_challenge_at`) so it survives re-hydration across
   * devices/sign-outs. Used to stop streak-repair eligibility from ever treating a day
   * before the user joined as "missed." See `getEligibleStreakRepair`.
   */
  joinedChallengeAt?: string;
  /** Calendar dates repaired via Streak Repair (treated like completed for streak computation). */
  repairedDates?: string[];

  /** When true, use a user-picked daily reminder time for this mission. */
  reminderEnabled?: boolean;
  /** Local time (HH:MM 24h) in the user's timezone for reminders. */
  reminderTimeLocal?: string | null;
  /** After true, reminder time cannot be changed (one-time confirmation). */
  reminderLocked?: boolean;
  /**
   * Optional ordered task checklist for this mission. Null/absent means this mission
   * uses the classic single note+photo memory flow, completely unchanged.
   */
  taskChecklist?: TaskChecklistItem[];
}

export type MiniMissionStatus =
  | "pending"
  | "scheduled"
  | "in_progress"
  | "completed"
  | "missed"
  | "cancelled";

export type MiniMissionLiveRole = "creator" | "member";
export type MiniMissionCompletionMode = "manual" | "timer_check_in";

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
  /** Manual requires tapping complete before zero; timer_check_in asks for a solo check-in after zero. */
  completionMode?: MiniMissionCompletionMode;
  status: MiniMissionStatus;
  createdAt: string;
  scheduledStartAt?: string;
  startedAt?: string;
  completedAt?: string;
  /** Optional photo/note saved when completing (local URIs until cloud sync). */
  completionMemory?: StreakMemory;
  /** When set, this mini mission is attached to an async Live Squad. */
  liveSquadId?: string | null;
  liveSquadRole?: MiniMissionLiveRole | null;
  /**
   * Optional ordered task checklist for this mini mission. Null/absent means this mission
   * uses the classic single note+photo completion memory flow, completely unchanged. See
   * docs/MINI_MISSION_CATALOG_ARCHITECTURE.md.
   */
  taskChecklist?: TaskChecklistItem[];
  /**
   * In-progress per-task log entries for a `taskChecklist` mission, keyed by taskId —
   * mirrors what `Habit.streakMemories[date].tasks` gives main missions, but for the
   * single active run of a mini mission before it's marked complete. Local-only (not
   * synced to Supabase); cleared once the mission completes/fails/is cancelled.
   */
  draftTasks?: Record<string, StreakMemoryTaskEntry>;
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
  /** Manual mode: fixed mission end (from group template). */
  endDate?: string;
  /** IANA timezone for calendar-day missions; defaults to device timezone. */
  missionTimezone?: string | null;
  /** Advanced: skip automatic full-state sync when the caller performs an explicit server write. */
  requestRemoteSync?: boolean;
  /** Optional task checklist — see docs/CATALOG_ARCHITECTURE.md. Empty/absent = classic mission. */
  taskChecklist?: TaskChecklistItem[];
  /** Set when joining an existing group challenge mid-way — see `Habit.joinedChallengeAt`. */
  joinedChallengeAt?: string;
};

export type HabitStore = {
  habits: Habit[];
  miniMissions: MiniMission[];
  xp: number;
  dirtyHabitIds?: string[];
  dirtyMiniMissionIds?: string[];
  /** Remote deletes that must be retried until Supabase confirms them. */
  pendingDeleteHabitIds?: string[];
  pendingDeleteMiniMissionIds?: string[];
  /** Habit reset artifact cleanup that must run before the reset row is pushed. */
  pendingResetHabitIds?: string[];
  /** Lowercase public handle for challenges; synced to `profiles.username`. */
  username: string | null;
  setUsername: (username: string | null) => void;
  /** Clears mission data (e.g. on sign-out). */
  resetStore: () => void;
  addHabit: (input: AddHabitInput) => string;
  toggleCompletion: (id: string, date: string, nowMs?: number) => boolean;
  /**
   * Apply a server-approved streak repair to local state immediately (without granting completion XP).
   * Used for squad approvals so UI updates without logout/login.
   */
  applyStreakRepairLocally: (input: {
    habitId: string;
    dateStr: string;
    xpCost?: number;
    repairSource?: "squad" | "solo";
    /** When false, XP was already adjusted client-side (e.g. solo repair). Default true if xpCost > 0. */
    deductXp?: boolean;
  }) => void;
  /** Repairs local progress when saved streak memories exist for dates missing from completedDates. */
  repairHabitCompletedDatesFromMemories: (id: string) => boolean;
  setStreakMemory: (id: string, date: string, memory: StreakMemory | null) => void;
  /** Merge into an existing streak memory (e.g. Community flags); no-op if no memory for date. */
  patchStreakMemory: (id: string, date: string, patch: Partial<StreakMemory>) => void;
  /** Updates one already-logged task's photo URL within a day's streak memory (e.g. after a background re-upload succeeds). No-op if the date/task isn't logged. */
  patchStreakMemoryTaskProof: (id: string, date: string, taskId: string, imageUrl: string) => void;
  /** Merge into a mini mission's finalized completionMemory (e.g. Community flags, background re-upload). No-op if the mission has no completionMemory. */
  patchMiniCompletionMemory: (id: string, patch: Partial<StreakMemory>) => void;
  /** Updates one already-logged task's photo URL within a finalized mini mission's completionMemory. No-op if not present. */
  patchMiniCompletionMemoryTaskProof: (id: string, taskId: string, imageUrl: string) => void;
  /**
   * Checklist main missions only: explicit "Mark Day Complete" action. Toggles the
   * day on (streak/XP/squad notification) — task-by-task logging no longer does
   * this itself — and, if no task was logged, records a bare check-in memory so
   * the day still has a recognizable moment. No-op (returns false) if the date is
   * already completed or isn't toggleable.
   */
  markChecklistDayComplete: (id: string, date: string, nowMs?: number) => boolean;
  deleteHabit: (id: string) => void;
  /** No-op (returns false) when the habit is linked to a group mission — avoids cohort desync. */
  resetHabit: (id: string) => boolean;
  setMissionReport: (id: string, report: MissionReport) => void;
  getHabit: (id: string) => Habit | undefined;
  addMiniMission: (input: {
    id?: string;
    title: string;
    objective?: string;
    estimatedMinutes: number;
    completionMode?: MiniMissionCompletionMode;
    startMode: "now" | "later";
    createdAt?: string;
    startedAt?: string;
    liveSquadId?: string | null;
    liveSquadRole?: MiniMissionLiveRole | null;
    /** Optional task checklist — see docs/MINI_MISSION_CATALOG_ARCHITECTURE.md. Empty/absent = classic mini mission. */
    taskChecklist?: TaskChecklistItem[];
  }) => string;
  setMiniMissionLiveSquad: (id: string, squadId: string | null, role: MiniMissionLiveRole | null) => void;
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
  /**
   * Logs (or updates) one task's draft entry for the mission's current run, so it
   * survives the app being backgrounded/killed before the whole mission is completed.
   */
  setMiniMissionDraftTask: (id: string, taskId: string, entry: StreakMemoryTaskEntry) => void;
  removeMiniMissionDraftTask: (id: string, taskId: string) => void;
  clearMiniMissionDraftTasks: (id: string) => void;
  /** User explicitly decided an expired timer check-in was not completed. */
  failMiniMission: (id: string) => void;
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
  /** Align habit clock + grid keys to `challenge_groups.start_date` after create/join; pushes to Supabase. */
  synchronizeHabitWithChallengeGroup: (
    habitId: string,
    group: import("./groupChallenge").ChallengeGroupRow,
    options?: { requestRemoteSync?: boolean },
  ) => void;
  clearDirtyState: (habitIds?: string[], miniIds?: string[]) => void;
  clearRemotePendingState: (input: {
    habitDeleteIds?: string[];
    miniDeleteIds?: string[];
    habitResetIds?: string[];
  }) => void;
};
