import type { Habit, HabitStore, MiniMission, MissionVisibility } from "../types/habit";
import { getSupabase } from "./supabase";

type RemoteSnapshot = Pick<HabitStore, "habits" | "miniMissions" | "xp">;

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
}): Habit {
  const vis: MissionVisibility =
    row.visibility === "public" || row.visibility === "solo"
      ? row.visibility
      : "solo";
  return {
    ownerUserId: row.user_id,
    id: row.id,
    title: row.title,
    description: row.description ?? undefined,
    mode: row.mode as Habit["mode"],
    visibility: vis,
    startDate: row.start_date,
    endDate: row.end_date ?? undefined,
    completedDates: row.completed_dates ?? [],
    streak: row.streak,
    totalDays: row.total_days,
    isCompleted: row.is_completed,
    status: row.status as Habit["status"],
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
  };
}

function miniFromRow(row: {
  user_id: string;
  id: string;
  title: string;
  objective: string | null;
  visibility?: string | null;
  estimated_minutes: number;
  extended_minutes: number;
  status: string;
  created_at: string;
  scheduled_start_at: string | null;
  started_at: string | null;
  completed_at: string | null;
}): MiniMission {
  const vis: MissionVisibility =
    row.visibility === "public" || row.visibility === "solo"
      ? row.visibility
      : "solo";
  return {
    ownerUserId: row.user_id,
    id: row.id,
    title: row.title,
    objective: row.objective ?? undefined,
    visibility: vis,
    estimatedMinutes: row.estimated_minutes,
    extendedMinutes: row.extended_minutes,
    status: row.status as MiniMission["status"],
    createdAt: row.created_at,
    scheduledStartAt: row.scheduled_start_at ?? undefined,
    startedAt: row.started_at ?? undefined,
    completedAt: row.completed_at ?? undefined,
  };
}

function miniToRow(sessionUserId: string, m: MiniMission) {
  return {
    id: m.id,
    user_id: sessionUserId,
    title: m.title,
    objective: m.objective ?? null,
    visibility: m.visibility ?? "solo",
    estimated_minutes: m.estimatedMinutes,
    extended_minutes: m.extendedMinutes,
    status: m.status,
    created_at: m.createdAt,
    scheduled_start_at: m.scheduledStartAt ?? null,
    started_at: m.startedAt ?? null,
    completed_at: m.completedAt ?? null,
  };
}

export async function pullFromSupabase(userId: string): Promise<RemoteSnapshot> {
  const supabase = getSupabase();
  if (!supabase) {
    return { habits: [], miniMissions: [], xp: 0 };
  }

  const [habitsRes, miniRes, profileRes] = await Promise.all([
    supabase.from("habits").select("*").eq("user_id", userId),
    supabase.from("mini_missions").select("*").eq("user_id", userId),
    supabase.from("profiles").select("xp").eq("id", userId).maybeSingle(),
  ]);

  if (habitsRes.error) throw habitsRes.error;
  if (miniRes.error) throw miniRes.error;
  if (profileRes.error) throw profileRes.error;

  const habits = (habitsRes.data ?? []).map((r) => habitFromRow(r));
  const miniMissions = (miniRes.data ?? []).map((r) => miniFromRow(r));
  const xp = profileRes.data?.xp ?? 0;

  return { habits, miniMissions, xp };
}

export async function pushFullState(
  sessionUserId: string,
  state: Pick<HabitStore, "habits" | "miniMissions" | "xp">,
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
    { id: sessionUserId, xp: state.xp },
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
 * After sign-in: if the server has no rows but this device had offline data, upload it.
 * Otherwise apply the remote snapshot (remote wins when any server data exists).
 */
export async function hydrateStoreAfterAuth(
  userId: string,
  getLocal: () => Pick<HabitStore, "habits" | "miniMissions" | "xp">,
  apply: (next: RemoteSnapshot) => void,
): Promise<void> {
  const local = getLocal();
  const remote = await pullFromSupabase(userId);

  if (isRemoteEmpty(remote) && localHasData(local)) {
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
    };
    apply(stamped);
    await pushFullState(userId, stamped);
    return;
  }

  apply(remote);
}
