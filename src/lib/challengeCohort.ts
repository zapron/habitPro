import type { Habit } from "../types/habit";
import type {
  ChallengeActivityKind,
  ChallengeActivityRow,
  ChallengeNudgeRow,
  PresetChallengeNudgeKind,
} from "../types/groupChallenge";
import { getSupabase } from "./supabase";

const MISSION_DAY_MILESTONES = [7, 14, 21] as const;
const STREAK_MILESTONES = [7, 14, 21, 30] as const;

function isDuplicateKeyError(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  if (err.code === "23505") return true;
  return String(err.message ?? "").toLowerCase().includes("duplicate");
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

  for (const row of inserts) {
    const { error } = await supabase.from("challenge_activity").insert({
      challenge_id: challengeId,
      actor_user_id: user.id,
      kind: row.kind,
      value: row.value,
    });
    if (error && !isDuplicateKeyError(error)) {
      if (__DEV__) console.warn("[challengeCohort] milestone insert", error.message);
    }
  }
}

export async function sendChallengeNudge(
  challengeId: string,
  toUserId: string,
  kind: PresetChallengeNudgeKind,
): Promise<{ error: Error | null }> {
  const supabase = getSupabase();
  if (!supabase) return { error: new Error("Supabase not configured") };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: new Error("Not signed in") };
  if (user.id === toUserId) return { error: new Error("Cannot nudge yourself") };

  const { data: inserted, error } = await supabase
    .from("challenge_nudges")
    .insert({
      challenge_id: challengeId,
      from_user_id: user.id,
      to_user_id: toUserId,
      kind,
    })
    .select("id")
    .single();

  if (error) {
    const msg =
      error.code === "23505" || String(error.message).includes("duplicate")
        ? "You already sent that today."
        : error.message;
    return { error: new Error(msg) };
  }

  const { data: fromProfile } = await supabase.from("profiles").select("username").eq("id", user.id).maybeSingle();
  const fromUsername =
    typeof fromProfile?.username === "string" && fromProfile.username.trim().length > 0
      ? fromProfile.username.trim().toLowerCase()
      : null;

  const { error: nErr } = await supabase.rpc("rpc_insert_notification", {
    p_user_id: toUserId,
    p_type: "challenge_nudge",
    p_payload: {
      challenge_id: challengeId,
      nudge_id: inserted.id,
      from_user_id: user.id,
      from_username: fromUsername,
      kind,
    },
  });
  if (nErr && __DEV__) console.warn("[notifications] challenge_nudge", nErr.message);

  return { error: null };
}

/** Premium: one custom note per squad member per 24h (UTC day) — enforced server-side. */
export async function sendChallengeCustomNudge(
  challengeId: string,
  toUserId: string,
  message: string,
): Promise<{ error: Error | null }> {
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
  });

  if (error) {
    const raw = String(error.message ?? "");
    const low = raw.toLowerCase();
    if (low.includes("premium_required")) {
      return { error: new Error("Custom notes are a HabitPro Community feature.") };
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
    .select("id, challenge_id, from_user_id, to_user_id, kind, message, created_at")
    .eq("challenge_id", challengeId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as ChallengeNudgeRow[];
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
