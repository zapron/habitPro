import { getSupabase } from "./supabase";

export type ProfileLifetimeStats = {
  lifetimeCheckIns: number;
  maxStreak: number;
  memoryProofs: number;
  publicMoments: number;
  repairs: { total: number; squad: number; solo: number };
  habitsTotal: number;
  minisTotal: number;
  pub: { habitsDone: number; miniDone: number; miniTotal: number };
  solo: { habitsDone: number; miniDone: number; miniTotal: number };
};

let lifetimeStatsRpcUnavailable = false;
let lifetimeStatsRpcWarned = false;

function toCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function normalizeBucket(raw: unknown): { habitsDone: number; miniDone: number; miniTotal: number } {
  const bucket = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    habitsDone: toCount(bucket.habitsDone),
    miniDone: toCount(bucket.miniDone),
    miniTotal: toCount(bucket.miniTotal),
  };
}

/**
 * Server-computed lifetime totals (rpc_profile_lifetime_stats_v1), independent of how
 * much history happens to be loaded locally. Deliberately scoped to only the fields
 * that need a full-table scan — "active"/"live" counts stay computed from the local
 * store, since an active mission is always part of the hot window by definition.
 */
export async function fetchProfileLifetimeStats(): Promise<ProfileLifetimeStats | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  if (lifetimeStatsRpcUnavailable) return null;
  const { data, error } = await supabase.rpc("rpc_profile_lifetime_stats_v1");
  if (error) {
    const message = typeof error.message === "string" ? error.message : String(error);
    const code = typeof (error as { code?: unknown }).code === "string" ? (error as { code: string }).code : "";
    const schemaCacheMiss =
      code === "PGRST202" ||
      message.toLowerCase().includes("schema cache") ||
      message.toLowerCase().includes("could not find the function");
    if (schemaCacheMiss) {
      lifetimeStatsRpcUnavailable = true;
    }
    if (__DEV__ && !lifetimeStatsRpcWarned) {
      lifetimeStatsRpcWarned = true;
      console.warn("[habitPro] rpc_profile_lifetime_stats_v1 unavailable", message);
    }
    return null;
  }
  if (!data || typeof data !== "object") return null;
  const raw = data as Record<string, unknown>;
  const repairsRaw = raw.repairs && typeof raw.repairs === "object" ? (raw.repairs as Record<string, unknown>) : {};
  return {
    lifetimeCheckIns: toCount(raw.lifetimeCheckIns),
    maxStreak: toCount(raw.maxStreak),
    memoryProofs: toCount(raw.memoryProofs),
    publicMoments: toCount(raw.publicMoments),
    repairs: {
      total: toCount(repairsRaw.total),
      squad: toCount(repairsRaw.squad),
      solo: toCount(repairsRaw.solo),
    },
    habitsTotal: toCount(raw.habitsTotal),
    minisTotal: toCount(raw.minisTotal),
    pub: normalizeBucket(raw.pub),
    solo: normalizeBucket(raw.solo),
  };
}
