import type {
  Habit,
  HabitStore,
  MiniMission,
  MissionReport,
  MissionVisibility,
  StreakMemory,
} from "../types/habit";
import { getDerivedState } from "../utils/habitDerived";
import { getSupabase } from "./supabase";

type RemoteSnapshot = Pick<HabitStore, "habits" | "miniMissions" | "xp" | "username"> & {
  cohortPeerHabits: Habit[];
};

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
  mission_report?: string | null;
  mission_report_at?: string | null;
}): Habit {
  const vis: MissionVisibility =
    row.visibility === "public" || row.visibility === "solo"
      ? row.visibility
      : "solo";
  const storedStreak = typeof row.streak === "number" && Number.isFinite(row.streak) ? row.streak : 0;
  const missionReport = parseMissionReport(row.mission_report);
  const missionReportAt =
    typeof row.mission_report_at === "string" ? row.mission_report_at : undefined;

  let effectiveReport = missionReport;
  const pre = getDerivedState(
    row.completed_dates ?? [],
    row.total_days ?? 21,
    missionReport,
  );
  if (!effectiveReport && row.is_completed && pre.gridFull) {
    effectiveReport = "accomplished";
  }

  const d = getDerivedState(
    row.completed_dates ?? [],
    row.total_days ?? 21,
    effectiveReport,
  );
  /** Prefer derived streak; max with stored column when present (reconcile cohort / older rows). */
  const streak = Math.max(d.streak, storedStreak);
  let status: Habit["status"] = d.status;
  if (!d.isCompleted && (effectiveReport === "failed" || row.status === "failed")) {
    status = "failed";
  }
  const rawMem = row.streak_memories;
  const streakMemories =
    rawMem && typeof rawMem === "object" && !Array.isArray(rawMem)
      ? (rawMem as Habit["streakMemories"])
      : undefined;
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
    challengeGroupId: row.challenge_group_id ?? null,
    challengeCreatorTimezone: row.challenge_creator_timezone ?? null,
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
    mission_report: h.missionReport ?? null,
    mission_report_at: h.missionReportAt ?? null,
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
  };
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
  };
}

export async function pullFromSupabase(userId: string): Promise<RemoteSnapshot> {
  const supabase = getSupabase();
  if (!supabase) {
    return { habits: [], miniMissions: [], xp: 0, username: null, cohortPeerHabits: [] };
  }

  const [habitsRes, miniRes, profileRes] = await Promise.all([
    supabase.from("habits").select("*").eq("user_id", userId),
    supabase.from("mini_missions").select("*").eq("user_id", userId),
    supabase.from("profiles").select("xp, username").eq("id", userId).maybeSingle(),
  ]);

  if (habitsRes.error) throw habitsRes.error;
  if (miniRes.error) throw miniRes.error;
  if (profileRes.error) throw profileRes.error;

  const habits = (habitsRes.data ?? []).map((r) => habitFromRow(r));
  const miniMissions = (miniRes.data ?? []).map((r) => miniFromRow(r));
  const xp = profileRes.data?.xp ?? 0;
  const rawUser = profileRes.data as { username?: string | null } | null;
  const username =
    typeof rawUser?.username === "string" && rawUser.username.trim().length > 0
      ? rawUser.username.trim().toLowerCase()
      : null;

  const { data: memberRows } = await supabase
    .from("challenge_members")
    .select("challenge_id")
    .eq("user_id", userId);

  const groupIds = [...new Set((memberRows ?? []).map((m) => m.challenge_id))];
  let cohortPeerHabits: Habit[] = [];
  if (groupIds.length > 0) {
    const { data: peerRows, error: peerErr } = await supabase
      .from("habits")
      .select("*")
      .in("challenge_group_id", groupIds)
      .neq("user_id", userId);
    if (peerErr) throw peerErr;
    cohortPeerHabits = (peerRows ?? []).map((r) => habitFromRow(r));
  }

  return { habits, miniMissions, xp, username, cohortPeerHabits };
}

export async function pushFullState(
  sessionUserId: string,
  state: Pick<HabitStore, "habits" | "miniMissions" | "xp" | "username">,
): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;

  const habitsForUser = state.habits.filter(
    (h) =>
      h.ownerUserId == null || h.ownerUserId === sessionUserId,
  );
  const minisForUser = state.miniMissions.filter(
    (m) =>
      m.ownerUserId == null || m.ownerUserId === sessionUserId,
  );

  const habitRows = habitsForUser.map((h) => habitToRow(sessionUserId, h));
  const miniRows = minisForUser.map((m) => miniToRow(sessionUserId, m));

  if (habitRows.length > 0) {
    const { error } = await supabase.from("habits").upsert(habitRows, {
      onConflict: "user_id,id",
    });
    if (error) throw error;
  }

  const { data: existingHabits } = await supabase
    .from("habits")
    .select("id")
    .eq("user_id", sessionUserId);
  const wantHabitIds = new Set(habitsForUser.map((h) => h.id));
  const habitIdsToRemove =
    existingHabits?.map((r) => r.id).filter((id) => !wantHabitIds.has(id)) ??
    [];
  for (const id of habitIdsToRemove) {
    const { error } = await supabase
      .from("habits")
      .delete()
      .eq("user_id", sessionUserId)
      .eq("id", id);
    if (error) throw error;
  }

  if (miniRows.length > 0) {
    const { error } = await supabase.from("mini_missions").upsert(miniRows, {
      onConflict: "user_id,id",
    });
    if (error) throw error;
  }

  const { data: existingMini } = await supabase
    .from("mini_missions")
    .select("id")
    .eq("user_id", sessionUserId);
  const wantMiniIds = new Set(minisForUser.map((m) => m.id));
  const miniIdsToRemove =
    existingMini?.map((r) => r.id).filter((id) => !wantMiniIds.has(id)) ?? [];
  for (const id of miniIdsToRemove) {
    const { error } = await supabase
      .from("mini_missions")
      .delete()
      .eq("user_id", sessionUserId)
      .eq("id", id);
    if (error) throw error;
  }

  const { error: profileErr } = await supabase.from("profiles").upsert(
    { id: sessionUserId, xp: state.xp, username: state.username },
    { onConflict: "id" },
  );
  if (profileErr) throw profileErr;
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
  const remote = await pullFromSupabase(userId);

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
