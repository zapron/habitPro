import type {
  Habit,
  HabitStore,
  MiniMission,
  MissionReport,
  MissionVisibility,
  StreakMemory,
} from "../types/habit";
import { getDerivedState } from "../utils/habitDerived";
import {
  canonicalizeMissionDateKeys,
  canonicalizeStreakMemoryKeys,
} from "../utils/missionCalendarKeys";
import { alignGroupHabitToChallengeStart } from "../utils/groupMissionClock";
import { getSupabase } from "./supabase";
import {
  shouldUploadLocalStreakImage,
  uploadHabitStreakMemoryImage,
  uploadMiniStreakMemoryImage,
} from "./streakMemoryStorage";
import { useHabitStore } from "../store/habitStore";

const HABIT_ROW_SELECT =
  "user_id, id, title, description, mode, visibility, start_date, end_date, completed_dates, streak, total_days, is_completed, status, streak_memories, challenge_group_id, challenge_creator_timezone, mission_timezone, mission_report, mission_report_at, reminder_enabled, reminder_time_local, reminder_locked";

type RemoteSnapshot = Pick<HabitStore, "habits" | "miniMissions" | "xp" | "username"> & {
  cohortPeerHabits: Habit[];
};

type SupabaseClient = NonNullable<ReturnType<typeof getSupabase>>;

type RepairRow = {
  habit_id: string;
  date_str: string;
};

let cachedSessionUserId: string | null = null;

export function updateCachedAuthSession(uid: string | null) {
  cachedSessionUserId = uid;
}

async function hasMatchingAuthSession(
  supabase: SupabaseClient,
  sessionUserId: string,
): Promise<boolean> {
  if (!sessionUserId) return false;
  if (cachedSessionUserId === sessionUserId) return true;
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    if (__DEV__) console.warn("[habitPro] sync auth guard failed", error.message);
    return false;
  }
  const uid = data.session?.user?.id ?? null;
  cachedSessionUserId = uid;
  return uid === sessionUserId;
}

function isHttpImageUri(uri: string | undefined): boolean {
  return Boolean(uri?.startsWith("http://") || uri?.startsWith("https://"));
}

function scheduleHabitMemoryUpload(habitId: string, dateStr: string, memory: StreakMemory) {
  const localUri = memory.imageUri;
  if (!localUri || !shouldUploadLocalStreakImage(localUri) || isHttpImageUri(localUri)) return;

  void uploadHabitStreakMemoryImage({ habitId, dateStr, localUri })
    .then((imageUrl) => {
      useHabitStore.getState().patchStreakMemory(habitId, dateStr, { imageUrl });
      void import("./syncQueue").then(({ requestRemoteSync }) => {
        requestRemoteSync({ immediate: true });
      });
    })
    .catch((e) => {
      console.warn("[habitPro] background memory image upload failed", e);
    });
}

async function memoryForRemote(
  memory: StreakMemory,
  uploadLocalImage: (localUri: string) => Promise<string>,
  options?: { deferLocalUpload?: boolean },
): Promise<StreakMemory> {
  const next: StreakMemory = { ...memory };
  const localUri = next.imageUri;

  if (!next.imageUrl && localUri) {
    if (isHttpImageUri(localUri)) {
      next.imageUrl = localUri;
    } else if (shouldUploadLocalStreakImage(localUri)) {
      if (options?.deferLocalUpload) {
        return next;
      }
      try {
        next.imageUrl = await uploadLocalImage(localUri);
      } catch (e) {
        console.warn("[habitPro] memory image upload before sync failed", e);
      }
    }
  }

  if (next.imageUri && (!isHttpImageUri(next.imageUri) || next.imageUrl)) {
    delete next.imageUri;
  }

  return next;
}

async function habitForRemote(h: Habit): Promise<Habit> {
  if (!h.streakMemories) return h;

  const entries = await Promise.all(
    Object.entries(h.streakMemories).map(async ([dateStr, memory]) => {
      const localUri = memory.imageUri;
      const needsBackgroundUpload =
        !memory.imageUrl &&
        localUri &&
        shouldUploadLocalStreakImage(localUri) &&
        !isHttpImageUri(localUri);

      if (needsBackgroundUpload) {
        scheduleHabitMemoryUpload(h.id, dateStr, memory);
      }

      const nextMemory = await memoryForRemote(
        memory,
        (uri) => uploadHabitStreakMemoryImage({ habitId: h.id, dateStr, localUri: uri }),
        { deferLocalUpload: needsBackgroundUpload },
      );
      return [dateStr, nextMemory] as const;
    }),
  );

  let changed = false;
  const nextMemories: Record<string, StreakMemory> = {};
  for (const [dateStr, nextMemory] of entries) {
    const prev = h.streakMemories![dateStr];
    nextMemories[dateStr] = nextMemory;
    if (
      nextMemory !== prev ||
      nextMemory.imageUri !== prev.imageUri ||
      nextMemory.imageUrl !== prev.imageUrl
    ) {
      changed = true;
    }
  }

  return changed ? { ...h, streakMemories: nextMemories } : h;
}

async function miniMissionForRemote(m: MiniMission): Promise<MiniMission> {
  if (!m.completionMemory) return m;

  const nextMemory = await memoryForRemote(m.completionMemory, (localUri) =>
    uploadMiniStreakMemoryImage({
      miniMissionId: m.id,
      localUri,
    }),
  );

  return nextMemory !== m.completionMemory ||
    nextMemory.imageUri !== m.completionMemory.imageUri ||
    nextMemory.imageUrl !== m.completionMemory.imageUrl
    ? { ...m, completionMemory: nextMemory }
    : m;
}

function parseMissionReport(v: unknown): MissionReport | undefined {
  return v === "accomplished" || v === "failed" ? v : undefined;
}

function habitFromRow(row: {
  user_id: string;
  id: string;
  title: string;
  description: string | null;
  mode: string;
  visibility?: string | null;
  start_date: string;
  end_date: string | null;
  completed_dates: string[] | null;
  streak: number;
  total_days: number;
  is_completed: boolean;
  status: string;
  streak_memories?: unknown;
  challenge_group_id?: string | null;
  challenge_creator_timezone?: string | null;
  mission_timezone?: string | null;
  mission_report?: string | null;
  mission_report_at?: string | null;
  reminder_enabled?: boolean | null;
  reminder_time_local?: string | null;
  reminder_locked?: boolean | null;
}): Habit {
  const vis: MissionVisibility =
    row.visibility === "public" || row.visibility === "solo"
      ? row.visibility
      : "solo";
  const tdRow = row.total_days ?? 21;
  const rawCompleted = Array.isArray(row.completed_dates)
    ? row.completed_dates.filter((x): x is string => typeof x === "string")
    : [];
  const stableTimeZone = row.mission_timezone ?? row.challenge_creator_timezone ?? undefined;
  const completedDatesMigrated = canonicalizeMissionDateKeys(row.start_date, rawCompleted, tdRow, stableTimeZone);
  const repairedDates: string[] =
    (row as unknown as { repairedDates?: string[] }).repairedDates ?? [];

  const storedStreak = typeof row.streak === "number" && Number.isFinite(row.streak) ? row.streak : 0;
  const missionReport = parseMissionReport(row.mission_report);
  const missionReportAt =
    typeof row.mission_report_at === "string" ? row.mission_report_at : undefined;

  let effectiveReport = missionReport;
  const pre = getDerivedState(
    completedDatesMigrated,
    tdRow,
    missionReport,
  );
  if (!effectiveReport && row.is_completed && pre.gridFull) {
    effectiveReport = "accomplished";
  }

  const d = getDerivedState(
    [...completedDatesMigrated, ...repairedDates],
    tdRow,
    effectiveReport,
  );
  /** Prefer derived streak; max with stored column when present (reconcile cohort / older rows). */
  const streak = Math.max(d.streak, storedStreak);
  let status: Habit["status"] = d.status;
  if (!d.isCompleted && (effectiveReport === "failed" || row.status === "failed")) {
    status = "failed";
  }
  const rawMem = row.streak_memories;
  const streakMemoriesRaw =
    rawMem && typeof rawMem === "object" && !Array.isArray(rawMem)
      ? (rawMem as Record<string, unknown>)
      : undefined;
  const streakMemoriesMigrated = canonicalizeStreakMemoryKeys(row.start_date, streakMemoriesRaw, tdRow, stableTimeZone);
  const streakMemories =
    streakMemoriesMigrated === undefined ? undefined : (streakMemoriesMigrated as Habit["streakMemories"]);
  return {
    ownerUserId: row.user_id,
    id: row.id,
    title: row.title,
    description: row.description ?? undefined,
    mode: row.mode as Habit["mode"],
    visibility: vis,
    startDate: row.start_date,
    endDate: row.end_date ?? undefined,
    completedDates: d.normalized,
    streak,
    totalDays: d.totalDays,
    isCompleted: d.isCompleted,
    status,
    missionReport: effectiveReport,
    missionReportAt,
    streakMemories,
    repairedDates,
    reminderEnabled: row.reminder_enabled ?? false,
    reminderTimeLocal: row.reminder_time_local ?? null,
    reminderLocked: row.reminder_locked ?? false,
    challengeGroupId: row.challenge_group_id ?? null,
    challengeCreatorTimezone: row.challenge_creator_timezone ?? null,
    missionTimezone: row.mission_timezone ?? null,
  };
}

function habitToRow(sessionUserId: string, h: Habit) {
  return {
    id: h.id,
    user_id: sessionUserId,
    title: h.title,
    description: h.description ?? null,
    mode: h.mode,
    visibility: h.visibility ?? "solo",
    start_date: h.startDate,
    end_date: h.endDate ?? null,
    completed_dates: h.completedDates,
    streak: h.streak,
    total_days: h.totalDays,
    is_completed: h.isCompleted,
    status: h.status,
    streak_memories: h.streakMemories ?? {},
    challenge_group_id: h.challengeGroupId ?? null,
    challenge_creator_timezone: h.challengeCreatorTimezone ?? null,
    mission_timezone: h.missionTimezone ?? null,
    mission_report: h.missionReport ?? null,
    mission_report_at: h.missionReportAt ?? null,
    reminder_enabled: h.reminderEnabled ?? false,
    reminder_time_local: h.reminderTimeLocal ?? null,
    reminder_locked: h.reminderLocked ?? false,
  };
}

function miniCompletionMemoryFromRow(
  raw: unknown,
): StreakMemory | undefined {
  if (raw == null || raw === "") return undefined;
  try {
    const o = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!o || typeof o !== "object") return undefined;
    const rec = o as Record<string, unknown>;
    const note = typeof rec.note === "string" ? rec.note : undefined;
    const imageUri = typeof rec.imageUri === "string" ? rec.imageUri : undefined;
    const imageUrl = typeof rec.imageUrl === "string" ? rec.imageUrl : undefined;
    const createdAt =
      typeof rec.createdAt === "string"
        ? rec.createdAt
        : new Date().toISOString();
    if (!note && !imageUri && !imageUrl) return undefined;
    return {
      createdAt,
      ...(note ? { note } : {}),
      ...(imageUri ? { imageUri } : {}),
      ...(imageUrl ? { imageUrl } : {}),
    };
  } catch {
    return undefined;
  }
}

function miniFromRow(row: {
  user_id: string;
  id: string;
  title: string;
  objective: string | null;
  visibility?: string | null;
  community_feed_revoked?: boolean | null;
  estimated_minutes: number;
  extended_minutes: number;
  status: string;
  created_at: string;
  scheduled_start_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  completion_memory?: unknown | null;
  live_squad_id?: string | null;
  live_squad_role?: string | null;
}): MiniMission {
  const vis: MissionVisibility =
    row.visibility === "public" || row.visibility === "solo"
      ? row.visibility
      : "solo";
  const rawRevoked = row.community_feed_revoked;
  const communityFeedRevoked =
    rawRevoked === true
      ? true
      : rawRevoked === false
        ? false
        : row.status === "completed" && vis === "solo"
          ? true
          : false;
  return {
    ownerUserId: row.user_id,
    id: row.id,
    title: row.title,
    objective: row.objective ?? undefined,
    visibility: vis,
    communityFeedRevoked,
    estimatedMinutes: row.estimated_minutes,
    extendedMinutes: row.extended_minutes,
    status: row.status as MiniMission["status"],
    createdAt: row.created_at,
    scheduledStartAt: row.scheduled_start_at ?? undefined,
    startedAt: row.started_at ?? undefined,
    completedAt: row.completed_at ?? undefined,
    completionMemory: miniCompletionMemoryFromRow(row.completion_memory),
    liveSquadId: row.live_squad_id ?? null,
    liveSquadRole:
      row.live_squad_role === "creator" || row.live_squad_role === "member"
        ? row.live_squad_role
        : null,
  };
}

type ChallengeGroupAlignmentMeta = {
  start_date: string;
  habit_template: Record<string, unknown>;
};

async function fetchChallengeGroupAlignmentMeta(
  supabase: NonNullable<ReturnType<typeof getSupabase>>,
  groupIds: string[],
): Promise<Map<string, ChallengeGroupAlignmentMeta>> {
  const map = new Map<string, ChallengeGroupAlignmentMeta>();
  const uniq = [...new Set(groupIds)].filter(Boolean);
  if (uniq.length === 0) return map;
  const { data, error } = await supabase
    .from("challenge_groups")
    .select("id, start_date, habit_template")
    .in("id", uniq);
  if (error) throw error;
  for (const row of data ?? []) {
    const rec = row as { id: string; start_date: string; habit_template?: unknown };
    map.set(rec.id, {
      start_date: String(rec.start_date),
      habit_template: (rec.habit_template ?? {}) as Record<string, unknown>,
    });
  }
  return map;
}

function alignHabitsToChallengeGroups(
  list: Habit[],
  meta: Map<string, ChallengeGroupAlignmentMeta>,
): Habit[] {
  return list.map((h) => {
    if (!h.challengeGroupId) return h;
    const g = meta.get(h.challengeGroupId);
    if (!g) return h;
    return alignGroupHabitToChallengeStart(h, g.start_date, g.habit_template);
  });
}

function miniToRow(sessionUserId: string, m: MiniMission) {
  return {
    id: m.id,
    user_id: sessionUserId,
    title: m.title,
    objective: m.objective ?? null,
    visibility: m.visibility ?? "solo",
    community_feed_revoked: m.communityFeedRevoked === true,
    estimated_minutes: m.estimatedMinutes,
    extended_minutes: m.extendedMinutes,
    status: m.status,
    created_at: m.createdAt,
    scheduled_start_at: m.scheduledStartAt ?? null,
    started_at: m.startedAt ?? null,
    completed_at: m.completedAt ?? null,
    completion_memory: m.completionMemory ?? null,
    live_squad_id: m.liveSquadId ?? null,
    live_squad_role: m.liveSquadRole ?? null,
  };
}

async function pullCohortPeerHabitsViaRpc(
  supabase: SupabaseClient,
): Promise<Habit[] | null> {
  const { data, error } = await supabase.rpc("rpc_cohort_peer_habits_v1");
  if (error) {
    if (__DEV__) console.warn("[habitPro] rpc_cohort_peer_habits_v1 failed, using legacy pull", error.message);
    return null;
  }
  const payload = data as {
    habits?: unknown;
    groupMeta?: { id: string; start_date: string; habit_template?: unknown }[];
  } | null;
  if (!payload || !Array.isArray(payload.habits)) return null;

  const meta = new Map<string, ChallengeGroupAlignmentMeta>();
  for (const g of payload.groupMeta ?? []) {
    if (!g?.id) continue;
    meta.set(g.id, {
      start_date: String(g.start_date),
      habit_template: (g.habit_template ?? {}) as Record<string, unknown>,
    });
  }

  const cohortPeerHabits = payload.habits
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const r = row as Record<string, unknown>;
      if (typeof r.id !== "string" || typeof r.user_id !== "string") return null;
      return habitFromRow(r as Parameters<typeof habitFromRow>[0]);
    })
    .filter((h): h is Habit => Boolean(h));

  return alignHabitsToChallengeGroups(cohortPeerHabits, meta);
}

export async function pullCohortPeerHabitsFromSupabase(userId: string): Promise<Habit[]> {
  const supabase = getSupabase();
  if (!supabase) return [];

  const rpcHabits = await pullCohortPeerHabitsViaRpc(supabase);
  if (rpcHabits) return rpcHabits;

  const { data: memberRows } = await supabase
    .from("challenge_members")
    .select("challenge_id")
    .eq("user_id", userId);

  const groupIds = [...new Set((memberRows ?? []).map((m) => m.challenge_id))];
  if (groupIds.length === 0) return [];

  // Use challenge_members as the join source so we find peer habits even when
  // habits.challenge_group_id was never written, or was raced into a different
  // group by an older double-create edge case.
  const { data: peerMemberRows, error: peerMemberErr } = await supabase
    .from("challenge_members")
    .select("habit_id, challenge_id, user_id")
    .in("challenge_id", groupIds)
    .neq("user_id", userId);
  if (peerMemberErr) throw peerMemberErr;

  const peerLinks = (peerMemberRows ?? []).filter(
    (row): row is { habit_id: string; challenge_id: string; user_id: string } =>
      typeof row.habit_id === "string" &&
      row.habit_id.length > 0 &&
      typeof row.challenge_id === "string" &&
      typeof row.user_id === "string",
  );
  const habitIds = [...new Set(peerLinks.map((row) => row.habit_id))];
  if (habitIds.length === 0) return [];

  const { data: peerRows, error: peerErr } = await supabase
    .from("habits")
    .select(HABIT_ROW_SELECT)
    .in("id", habitIds);
  if (peerErr) throw peerErr;

  const rowByOwnerHabit = new Map<string, NonNullable<typeof peerRows>[number]>();
  for (const row of peerRows ?? []) {
    rowByOwnerHabit.set(`${row.user_id}:${row.id}`, row);
  }

  const cohortPeerHabits = peerLinks
    .map((link) => {
      const row = rowByOwnerHabit.get(`${link.user_id}:${link.habit_id}`);
      return row ? habitFromRow({ ...row, challenge_group_id: link.challenge_id }) : null;
    })
    .filter((h): h is Habit => Boolean(h));

  const alignGroupIds = cohortPeerHabits
    .map((h) => h.challengeGroupId)
    .filter((id): id is string => Boolean(id));
  const groupMeta = await fetchChallengeGroupAlignmentMeta(supabase, alignGroupIds);
  return alignHabitsToChallengeGroups(cohortPeerHabits, groupMeta);
}

export async function pullFromSupabase(
  userId: string,
  options?: { includeCohortPeerHabits?: boolean },
): Promise<RemoteSnapshot> {
  const supabase = getSupabase();
  if (!supabase) {
    return { habits: [], miniMissions: [], xp: 0, username: null, cohortPeerHabits: [] };
  }
  const includeCohortPeerHabits = options?.includeCohortPeerHabits ?? true;

  const [habitsRes, miniRes, profileRes, repairsRes] = await Promise.all([
    supabase.from("habits").select(HABIT_ROW_SELECT).eq("user_id", userId),
    supabase.from("mini_missions").select("user_id, id, title, objective, visibility, community_feed_revoked, estimated_minutes, extended_minutes, status, created_at, scheduled_start_at, started_at, completed_at, completion_memory, live_squad_id, live_squad_role").eq("user_id", userId),
    supabase.from("profiles").select("xp, username").eq("id", userId).maybeSingle(),
    supabase.from("streak_repairs").select("habit_id, date_str").eq("user_id", userId).eq("status", "applied"),
  ]);

  if (habitsRes.error) throw habitsRes.error;
  if (miniRes.error) throw miniRes.error;
  if (profileRes.error) throw profileRes.error;
  if (repairsRes.error) throw repairsRes.error;

  const repairs = (repairsRes.data ?? []) as unknown as RepairRow[];
  const repairedByHabit = new Map<string, string[]>();
  for (const rr of repairs) {
    const hid = rr.habit_id;
    const ds = rr.date_str;
    if (!hid || !ds) continue;
    const prev = repairedByHabit.get(hid) ?? [];
    prev.push(ds);
    repairedByHabit.set(hid, prev);
  }

  const habits = (habitsRes.data ?? []).map((r) => {
    const row = r as unknown as Record<string, unknown>;
    const hid = String(row.id ?? "");
    const repairedDates = repairedByHabit.get(hid) ?? [];
    return habitFromRow({ ...(r as any), repairedDates });
  });
  const miniMissions = (miniRes.data ?? []).map((r) => miniFromRow(r));
  const xp = profileRes.data?.xp ?? 0;
  const rawUser = profileRes.data as { username?: string | null } | null;
  const username =
    typeof rawUser?.username === "string" && rawUser.username.trim().length > 0
      ? rawUser.username.trim().toLowerCase()
      : null;

  const cohortPeerHabits = includeCohortPeerHabits
    ? await pullCohortPeerHabitsFromSupabase(userId)
    : [];

  const alignGroupIds = [
    ...habits.map((h) => h.challengeGroupId).filter((id): id is string => Boolean(id)),
  ];
  const groupMeta = await fetchChallengeGroupAlignmentMeta(supabase, alignGroupIds);
  const alignedHabits = alignHabitsToChallengeGroups(habits, groupMeta);

  return { habits: alignedHabits, miniMissions, xp, username, cohortPeerHabits };
}

export async function pushFullState(
  sessionUserId: string,
  state: Pick<HabitStore, "habits" | "miniMissions" | "xp" | "username" | "dirtyHabitIds" | "dirtyMiniMissionIds">,
): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;
  if (!(await hasMatchingAuthSession(supabase, sessionUserId))) return;

  // Filter local habits/minis: only those belonging to user
  const localHabitsForUser = state.habits.filter(
    (h) => h.ownerUserId == null || h.ownerUserId === sessionUserId,
  );
  const localMinisForUser = state.miniMissions.filter(
    (m) => m.ownerUserId == null || m.ownerUserId === sessionUserId,
  );

  // Incremental Filter: only push what is dirty (or all if dirty tracking is empty/undefined)
  const dirtyHabits = state.dirtyHabitIds
    ? localHabitsForUser.filter((h) => state.dirtyHabitIds!.includes(h.id))
    : localHabitsForUser;
  const dirtyMinis = state.dirtyMiniMissionIds
    ? localMinisForUser.filter((m) => state.dirtyMiniMissionIds!.includes(m.id))
    : localMinisForUser;

  // If there are no dirty items and XP/Username hasn't changed, we can skip network write entirely!
  // However, we still do a quick sync push if it is a manual force or initial sync.
  if (state.dirtyHabitIds && state.dirtyMiniMissionIds && dirtyHabits.length === 0 && dirtyMinis.length === 0) {
    // Only skip if XP and Username have nothing new to write to DB
    const { data: existingProfile } = await supabase
      .from("profiles")
      .select("xp")
      .eq("id", sessionUserId)
      .maybeSingle();
    if (existingProfile && existingProfile.xp >= state.xp) {
      return; // Skip completely! Zero roundtrips!
    }
  }

  const habitsForRemote = await Promise.all(dirtyHabits.map(habitForRemote));
  const minisForRemote = await Promise.all(dirtyMinis.map(miniMissionForRemote));
  if (!(await hasMatchingAuthSession(supabase, sessionUserId))) return;

  const habitRows = habitsForRemote.map((h) => habitToRow(sessionUserId, h));
  const miniRows = minisForRemote.map((m) => miniToRow(sessionUserId, m));

  // Single-Roundtrip Transactional RPC Sync
  const { error } = await supabase.rpc("rpc_sync_dirty_state", {
    p_dirty_habits: habitRows,
    p_dirty_minis: miniRows,
    p_local_xp: state.xp,
    p_username: state.username ?? null,
  });

  if (error) throw error;
}

export async function deleteRemoteHabit(sessionUserId: string, habitId: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase || !sessionUserId || !habitId) return;
  if (!(await hasMatchingAuthSession(supabase, sessionUserId))) return;
  const { error } = await supabase
    .from("habits")
    .delete()
    .eq("user_id", sessionUserId)
    .eq("id", habitId);
  if (error) throw error;
}

export async function upsertRemoteHabit(sessionUserId: string, habit: Habit): Promise<void> {
  const supabase = getSupabase();
  if (!supabase || !sessionUserId) return;
  if (!(await hasMatchingAuthSession(supabase, sessionUserId))) return;
  const normalized = await habitForRemote(habit);
  if (!(await hasMatchingAuthSession(supabase, sessionUserId))) return;
  const row = habitToRow(sessionUserId, normalized);
  const { error } = await supabase.from("habits").upsert(row, {
    onConflict: "user_id,id",
  });
  if (error) throw error;
}

export async function deleteRemoteMiniMission(sessionUserId: string, miniMissionId: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase || !sessionUserId || !miniMissionId) return;
  if (!(await hasMatchingAuthSession(supabase, sessionUserId))) return;
  const { error } = await supabase
    .from("mini_missions")
    .delete()
    .eq("user_id", sessionUserId)
    .eq("id", miniMissionId);
  if (error) throw error;
}

function isRemoteEmpty(snapshot: RemoteSnapshot): boolean {
  return (
    snapshot.habits.length === 0 &&
    snapshot.miniMissions.length === 0 &&
    snapshot.xp === 0
  );
}

function localHasData(state: Pick<HabitStore, "habits" | "miniMissions" | "xp">) {
  return (
    state.habits.length > 0 ||
    state.miniMissions.length > 0 ||
    state.xp > 0
  );
}

/**
 * Whether local offline data is safe to stamp onto this Supabase user.
 * Blocks cross-account leaks: another user's synced rows, or orphan XP after a bad sign-out.
 */
function localCanUploadAsFirstUser(
  local: Pick<HabitStore, "habits" | "miniMissions" | "xp">,
  userId: string,
): boolean {
  if (!localHasData(local)) return false;
  const habitWrongOwner = local.habits.some(
    (h) => h.ownerUserId != null && h.ownerUserId !== userId,
  );
  const miniWrongOwner = local.miniMissions.some(
    (m) => m.ownerUserId != null && m.ownerUserId !== userId,
  );
  if (habitWrongOwner || miniWrongOwner) return false;
  if (local.habits.length === 0 && local.miniMissions.length === 0 && local.xp > 0) {
    return false;
  }
  return true;
}

/**
 * After sign-in: if the server has no rows but this device had offline data, upload it.
 * Otherwise apply the remote snapshot (remote wins when any server data exists).
 */
export async function hydrateStoreAfterAuth(
  userId: string,
  getLocal: () => Pick<HabitStore, "habits" | "miniMissions" | "xp" | "username">,
  apply: (next: RemoteSnapshot) => void,
): Promise<void> {
  const local = getLocal();
  const remote = await pullFromSupabase(userId, { includeCohortPeerHabits: false });

  if (isRemoteEmpty(remote) && localCanUploadAsFirstUser(local, userId)) {
    const stamped: RemoteSnapshot = {
      habits: local.habits.map((h) => ({
        ...h,
        ownerUserId: h.ownerUserId ?? userId,
      })),
      miniMissions: local.miniMissions.map((m) => ({
        ...m,
        ownerUserId: m.ownerUserId ?? userId,
      })),
      xp: local.xp,
      username: local.username ?? null,
      cohortPeerHabits: [],
    };
    apply(stamped);
    await pushFullState(userId, stamped);
    return;
  }

  apply(remote);
}
