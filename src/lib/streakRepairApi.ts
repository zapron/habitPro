import { getSupabase } from "./supabase";

export type StreakRepairStatus = "pending" | "approved" | "declined" | "applied";

export type StreakRepairRow = {
  id: string;
  user_id: string;
  habit_id: string;
  challenge_id: string | null;
  date_str: string;
  reason: string;
  xp_cost: number;
  status: StreakRepairStatus;
  approvals_required: number;
  created_at: string;
  applied_at: string | null;
};

export type StreakRepairVoteRow = {
  repair_id: string;
  voter_id: string;
  vote: "approve" | "decline";
};

export async function requestStreakRepair(input: {
  habitId: string;
  dateStr: string;
  reason: string;
  xpCost: number;
  challengeId?: string | null;
  approvalsRequired?: number;
}): Promise<{ ok: true; repairId: string } | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: "Cloud sync not configured." };

  const { data, error } = await supabase.rpc("rpc_request_streak_repair", {
    p_habit_id: input.habitId,
    p_date_str: input.dateStr,
    p_reason: input.reason,
    p_xp_cost: input.xpCost,
    p_challenge_id: input.challengeId ?? null,
    p_approvals_required: input.approvalsRequired ?? 2,
  });

  if (error) return { ok: false, error: error.message };
  const repairId = typeof data === "string" ? data : String(data ?? "");
  if (!repairId) return { ok: false, error: "Failed to create repair request." };
  return { ok: true, repairId };
}

export async function voteStreakRepair(input: {
  repairId: string;
  vote: "approve" | "decline";
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: "Cloud sync not configured." };

  const { error } = await supabase.rpc("rpc_vote_streak_repair", {
    p_repair_id: input.repairId,
    p_vote: input.vote,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function listChallengeStreakRepairs(challengeId: string): Promise<
  { ok: true; repairs: StreakRepairRow[]; votes: StreakRepairVoteRow[] } | { ok: false; error: string }
> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: "Cloud sync not configured." };

  const repairsRes = await supabase
    .from("streak_repairs")
    .select("*")
    .eq("challenge_id", challengeId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (repairsRes.error) return { ok: false, error: repairsRes.error.message };

  const ids =
    (repairsRes.data ?? []).map((r) => (r as { id: string }).id) ?? [];
  const votesRes =
    ids.length > 0
      ? await supabase
          .from("streak_repair_votes")
          .select("repair_id, voter_id, vote")
          .in("repair_id", ids)
      : { data: [] as unknown[] };
  if ("error" in votesRes && (votesRes as { error?: { message: string } }).error) {
    return { ok: false, error: (votesRes as { error: { message: string } }).error.message };
  }

  return {
    ok: true,
    repairs: (repairsRes.data ?? []) as unknown as StreakRepairRow[],
    votes: ((votesRes as { data?: unknown[] }).data ?? []) as unknown as StreakRepairVoteRow[],
  };
}

export async function getMyStreakRepairStatusForDay(input: {
  habitId: string;
  dateStr: string;
}): Promise<{ ok: true; status: StreakRepairStatus | null } | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: "Cloud sync not configured." };

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) return { ok: false, error: "Not signed in." };

  const { data, error } = await supabase
    .from("streak_repairs")
    .select("status")
    .eq("user_id", user.id)
    .eq("habit_id", input.habitId)
    .eq("date_str", input.dateStr)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };

  const st = (data as { status?: string } | null)?.status;
  if (st === "pending" || st === "approved" || st === "declined" || st === "applied") {
    return { ok: true, status: st };
  }
  return { ok: true, status: null };
}

