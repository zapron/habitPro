import type { Habit } from "../types/habit";
import type {
  ChallengeActivityKind,
  ChallengeActivityRow,
  ChallengeNudgeKind,
  ChallengeNudgeRow,
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
  kind: ChallengeNudgeKind,
): Promise<{ error: Error | null }> {
  const supabase = getSupabase();
  if (!supabase) return { error: new Error("Supabase not configured") };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: new Error("Not signed in") };
  if (user.id === toUserId) return { error: new Error("Cannot nudge yourself") };

  const { error } = await supabase.from("challenge_nudges").insert({
    challenge_id: challengeId,
    from_user_id: user.id,
    to_user_id: toUserId,
    kind,
  });

  if (error) {
    const msg =
      error.code === "23505" || String(error.message).includes("duplicate")
        ? "You already sent that today."
        : error.message;
    return { error: new Error(msg) };
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
    .select("id, challenge_id, from_user_id, to_user_id, kind, created_at")
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
