import type { Habit } from "../types/habit";
import type {
  ChallengeActivityKind,
  ChallengeActivityRow,
  ChallengeNudgeRow,
  PresetChallengeNudgeKind,
} from "../types/groupChallenge";
import type { PageRequest, PageResult } from "../types/paging";
import { getSupabase } from "./supabase";

const MISSION_DAY_MILESTONES = [7, 14, 21] as const;
const STREAK_MILESTONES = [7, 14, 21, 30] as const;
const DAILY_PRESET_NUDGE_KINDS = ["cheer", "ping", "fire"] as const;

type ChallengeActionResult = { error: Error | null; reason?: "premium_required" };
type Cursor = { createdAt: string; id: string };
const challengeActivityCursorByOffset = new Map<string, Cursor | null>();

export function challengeNudgeSentTodayKey(toUserId: string, kind: PresetChallengeNudgeKind): string {
  return `${toUserId}:${kind}`;
}

function isDailyPresetNudgeKind(value: unknown): value is PresetChallengeNudgeKind {
  return value === "cheer" || value === "ping" || value === "fire";
}

function utcTodayBounds(now = new Date()): { startIso: string; endIso: string } {
  const day = now.toISOString().slice(0, 10);
  const startMs = Date.parse(`${day}T00:00:00.000Z`);
  return {
    startIso: new Date(startMs).toISOString(),
    endIso: new Date(startMs + 24 * 60 * 60 * 1000).toISOString(),
  };
}

function isDuplicateKeyError(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  if (err.code === "23505") return true;
  return String(err.message ?? "").toLowerCase().includes("duplicate");
}

function isPremiumPolicyError(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  const msg = String(err.message ?? "").toLowerCase();
  return err.code === "42501" || msg.includes("premium_required") || msg.includes("row-level security");
}

/**
 * After the local habit gains a new completed day, record mission_day / streak_milestone rows for this user's group challenge.
 * Idempotent via unique constraint on (challenge_id, actor_user_id, kind, value).
 */
export async function tryRecordChallengeMilestones(
  habitBefore: Habit,
  habitAfter: Habit,
): Promise<void> {
  const challengeId = habitAfter.challengeGroupId;
  if (!challengeId) return;

  const supabase = getSupabase();
  if (!supabase) return;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  if (habitAfter.ownerUserId != null && habitAfter.ownerUserId !== user.id) return;

  const prevLen = habitBefore.completedDates.length;
  const nextLen = habitAfter.completedDates.length;
  const prevStreak = habitBefore.streak;
  const nextStreak = habitAfter.streak;
  const totalDays = Math.max(1, habitAfter.totalDays);

  const inserts: { kind: ChallengeActivityKind; value: number }[] = [];

  for (const m of MISSION_DAY_MILESTONES) {
    if (m > totalDays) continue;
    if (prevLen < m && nextLen >= m) {
      inserts.push({ kind: "mission_day", value: m });
    }
  }

  for (const s of STREAK_MILESTONES) {
    if (prevStreak < s && nextStreak >= s) {
      inserts.push({ kind: "streak_milestone", value: s });
    }
  }

  if (inserts.length > 0) {
    const { error } = await supabase.from("challenge_activity").insert(
      inserts.map((row) => ({
        challenge_id: challengeId,
        actor_user_id: user.id,
        kind: row.kind,
        value: row.value,
      })),
    );
    if (error && !isDuplicateKeyError(error)) {
      if (__DEV__) console.warn("[challengeCohort] milestone insert", error.message);
    }
  }
}

export async function sendChallengeNudge(
  challengeId: string,
  toUserId: string,
  kind: PresetChallengeNudgeKind,
  opts?: { activityId?: string; targetDateStr?: string | null; targetMissionDay?: number | null },
): Promise<ChallengeActionResult> {
  const supabase = getSupabase();
  if (!supabase) return { error: new Error("Supabase not configured") };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: new Error("Not signed in") };
  if (user.id === toUserId) return { error: new Error("Cannot nudge yourself") };

  try {
    const { error } = await supabase.rpc("rpc_send_challenge_nudge_v2", {
      p_challenge_id: challengeId,
      p_to_user_id: toUserId,
      p_kind: kind,
      p_activity_id: kind === "congrats" ? opts?.activityId ?? null : null,
      p_target_date_str: opts?.targetDateStr ?? null,
      p_target_mission_day: opts?.targetMissionDay ?? null,
    });
    if (isPremiumPolicyError(error)) {
      return {
        error: new Error("Squad nudges are a HabitPro Community feature."),
        reason: "premium_required",
      };
    }
    if (error) {
      const raw = String(error.message ?? "");
      const low = raw.toLowerCase();
      const msg =
        low.includes("duplicate") || error.code === "23505"
          ? kind === "congrats"
            ? "You already congratulated that milestone."
            : "You already sent that today."
          : low.includes("already_sent")
            ? kind === "congrats"
              ? "You already congratulated that milestone."
              : "You already sent that today."
            : raw || "Could not send nudge.";
      return { error: new Error(msg) };
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { error: new Error(msg || "Could not send nudge.") };
  }

  return { error: null };
}

/** Preset squad nudges are limited per kind, per recipient, per UTC day. */
export async function listSentPresetNudgeKindsToday(
  challengeId: string,
  toUserIds: string[],
): Promise<Record<string, PresetChallengeNudgeKind[]>> {
  const supabase = getSupabase();
  if (!supabase) return {};
  const uniqueToUserIds = [...new Set(toUserIds.map((id) => id.trim()).filter(Boolean))];
  if (uniqueToUserIds.length === 0) return {};
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return {};

  const { startIso, endIso } = utcTodayBounds();
  const { data, error } = await supabase
    .from("challenge_nudges")
    .select("to_user_id, kind")
    .eq("challenge_id", challengeId)
    .eq("from_user_id", user.id)
    .in("to_user_id", uniqueToUserIds)
    .in("kind", [...DAILY_PRESET_NUDGE_KINDS])
    .gte("created_at", startIso)
    .lt("created_at", endIso);
  if (error) throw error;

  const byUser: Record<string, Set<PresetChallengeNudgeKind>> = {};
  for (const row of data ?? []) {
    const toUserId = typeof row.to_user_id === "string" ? row.to_user_id : "";
    const kind = isDailyPresetNudgeKind(row.kind) ? row.kind : null;
    if (!toUserId || !kind) continue;
    byUser[toUserId] ??= new Set<PresetChallengeNudgeKind>();
    byUser[toUserId].add(kind);
  }

  return Object.fromEntries(
    Object.entries(byUser).map(([toUserId, kinds]) => [toUserId, [...kinds]]),
  );
}

/** Custom notes are limited to one per recipient per UTC day. */
export async function listSentCustomNoteUserIdsToday(
  challengeId: string,
  toUserIds: string[],
): Promise<string[]> {
  const supabase = getSupabase();
  if (!supabase) return [];
  const uniqueToUserIds = [...new Set(toUserIds.map((id) => id.trim()).filter(Boolean))];
  if (uniqueToUserIds.length === 0) return [];
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { startIso, endIso } = utcTodayBounds();
  const { data, error } = await supabase
    .from("challenge_nudges")
    .select("to_user_id")
    .eq("challenge_id", challengeId)
    .eq("from_user_id", user.id)
    .in("to_user_id", uniqueToUserIds)
    .eq("kind", "custom_note")
    .gte("created_at", startIso)
    .lt("created_at", endIso);
  if (error) throw error;

  return [
    ...new Set(
      (data ?? [])
        .map((row) => row.to_user_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  ];
}

/** Premium: one custom note per squad member per 24h (UTC day) — enforced server-side. */
export async function sendChallengeCustomNudge(
  challengeId: string,
  toUserId: string,
  message: string,
  opts?: { targetDateStr?: string | null; targetMissionDay?: number | null },
): Promise<ChallengeActionResult> {
  const supabase = getSupabase();
  if (!supabase) return { error: new Error("Supabase not configured") };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: new Error("Not signed in") };
  if (user.id === toUserId) return { error: new Error("Cannot nudge yourself") };

  const trimmed = message.trim();
  if (trimmed.length < 1 || trimmed.length > 200) {
    return { error: new Error("Message must be 1–200 characters.") };
  }

  const { error } = await supabase.rpc("rpc_send_challenge_custom_nudge", {
    p_challenge_id: challengeId,
    p_to_user_id: toUserId,
    p_message: trimmed,
    p_target_date_str: opts?.targetDateStr ?? null,
    p_target_mission_day: opts?.targetMissionDay ?? null,
  });

  if (error) {
    const raw = String(error.message ?? "");
    const low = raw.toLowerCase();
    if (low.includes("premium_required")) {
      return { error: new Error("Custom notes are a HabitPro Community feature."), reason: "premium_required" };
    }
    if (low.includes("custom_note_daily_limit") || low.includes("custom_note_already_sent")) {
      return { error: new Error("You can send one note per person every 24 hours.") };
    }
    if (low.includes("invalid_message_length")) {
      return { error: new Error("Message must be 1–200 characters.") };
    }
    return { error: new Error(raw || "Could not send note.") };
  }

  return { error: null };
}

export async function listRecentNudges(
  challengeId: string,
  limit = 24,
): Promise<ChallengeNudgeRow[]> {
  const supabase = getSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("challenge_nudges")
    .select("id, challenge_id, from_user_id, to_user_id, kind, activity_id, target_date_str, target_mission_day, message, created_at")
    .eq("challenge_id", challengeId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as ChallengeNudgeRow[];
}

export async function listRecentNudgesPage(
  challengeId: string,
  request: PageRequest,
): Promise<PageResult<ChallengeNudgeRow>> {
  const supabase = getSupabase();
  if (!supabase) return { items: [], hasMore: false, nextOffset: null };
  const offset = Math.max(0, Math.floor(request.offset));
  const limit = Math.max(1, Math.floor(request.limit));
  const { data, error } = await supabase
    .from("challenge_nudges")
    .select("id, challenge_id, from_user_id, to_user_id, kind, activity_id, target_date_str, target_mission_day, message, created_at")
    .eq("challenge_id", challengeId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit);
  if (error) throw error;
  const rows = (data ?? []) as ChallengeNudgeRow[];
  const hasMore = rows.length > limit;
  return {
    items: hasMore ? rows.slice(0, limit) : rows,
    hasMore,
    nextOffset: hasMore ? offset + limit : null,
  };
}

export async function listChallengeActivity(
  challengeId: string,
  limit = 30,
): Promise<ChallengeActivityRow[]> {
  const supabase = getSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("challenge_activity")
    .select("id, challenge_id, actor_user_id, kind, value, created_at")
    .eq("challenge_id", challengeId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as ChallengeActivityRow[];
}

export async function listChallengeActivityPage(
  challengeId: string,
  request: PageRequest,
): Promise<PageResult<ChallengeActivityRow>> {
  const supabase = getSupabase();
  if (!supabase) return { items: [], hasMore: false, nextOffset: null };
  const offset = Math.max(0, Math.floor(request.offset));
  const limit = Math.max(1, Math.floor(request.limit));
  const cursorKey = `${challengeId}:${offset}`;
  if (offset === 0) {
    for (const key of [...challengeActivityCursorByOffset.keys()]) {
      if (key.startsWith(`${challengeId}:`)) challengeActivityCursorByOffset.delete(key);
    }
    challengeActivityCursorByOffset.set(cursorKey, null);
  }
  if (challengeActivityCursorByOffset.has(cursorKey)) {
    const cursor = challengeActivityCursorByOffset.get(cursorKey) ?? null;
    let rpcData: unknown = null;
    try {
      const { data, error } = await supabase.rpc("rpc_challenge_activity_page_v1", {
        p_challenge_id: challengeId,
        p_cursor_created_at: cursor?.createdAt ?? null,
        p_cursor_id: cursor?.id ?? null,
        p_limit: limit,
      });
      if (!error) rpcData = data;
    } catch {
      rpcData = null;
    }
    if (rpcData && typeof rpcData === "object") {
      const payload = rpcData as { items?: ChallengeActivityRow[]; nextCursor?: Cursor | null };
      const items = Array.isArray(payload.items) ? payload.items : [];
      challengeActivityCursorByOffset.set(`${challengeId}:${offset + items.length}`, payload.nextCursor ?? null);
      return {
        items,
        hasMore: Boolean(payload.nextCursor),
        nextOffset: payload.nextCursor ? offset + items.length : null,
      };
    }
  }
  const { data, error } = await supabase
    .from("challenge_activity")
    .select("id, challenge_id, actor_user_id, kind, value, created_at")
    .eq("challenge_id", challengeId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit);
  if (error) throw error;
  const rows = (data ?? []) as ChallengeActivityRow[];
  const hasMore = rows.length > limit;
  return {
    items: hasMore ? rows.slice(0, limit) : rows,
    hasMore,
    nextOffset: hasMore ? offset + limit : null,
  };
}
