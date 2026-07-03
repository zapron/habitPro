import { getSupabase } from "./supabase";

export type CommunityAccessSource = "paid" | "trial" | "none";

export type CommunityAccessStatus = {
  hasAccess: boolean;
  paidAccess: boolean;
  trialEnabled: boolean;
  trialDays: number;
  trialAvailable: boolean;
  trialActive: boolean;
  trialStartedAt: string | null;
  trialExpiresAt: string | null;
  trialUsed: boolean;
  accessSource: CommunityAccessSource;
  serverNow: string | null;
};

export type StartCommunityTrialResult = {
  ok: boolean;
  started: boolean;
  reason: string | null;
  status: CommunityAccessStatus | null;
  error?: Error;
};

const DEFAULT_ACCESS_STATUS: CommunityAccessStatus = {
  hasAccess: false,
  paidAccess: false,
  trialEnabled: false,
  trialDays: 7,
  trialAvailable: false,
  trialActive: false,
  trialStartedAt: null,
  trialExpiresAt: null,
  trialUsed: false,
  accessSource: "none",
  serverNow: null,
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function bool(value: unknown): boolean {
  return value === true;
}

function intOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : fallback;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function accessSource(value: unknown): CommunityAccessSource {
  return value === "paid" || value === "trial" || value === "none" ? value : "none";
}

export function parseCommunityAccessStatus(raw: unknown): CommunityAccessStatus {
  const r = asRecord(raw);
  const trialDays = Math.max(1, Math.min(120, intOr(r.trialDays, DEFAULT_ACCESS_STATUS.trialDays)));
  return {
    hasAccess: bool(r.hasAccess),
    paidAccess: bool(r.paidAccess),
    trialEnabled: bool(r.trialEnabled),
    trialDays,
    trialAvailable: bool(r.trialAvailable),
    trialActive: bool(r.trialActive),
    trialStartedAt: stringOrNull(r.trialStartedAt),
    trialExpiresAt: stringOrNull(r.trialExpiresAt),
    trialUsed: bool(r.trialUsed),
    accessSource: accessSource(r.accessSource),
    serverNow: stringOrNull(r.serverNow),
  };
}

export async function fetchCommunityAccessStatusForCurrentUser(): Promise<CommunityAccessStatus | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase.rpc("rpc_get_community_access_status");
  if (error) throw error;
  return parseCommunityAccessStatus(data);
}

export async function startCommunityTrial(): Promise<StartCommunityTrialResult> {
  const supabase = getSupabase();
  if (!supabase) {
    return {
      ok: false,
      started: false,
      reason: "supabase_not_configured",
      status: null,
      error: new Error("Supabase not configured"),
    };
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      started: false,
      reason: "auth_required",
      status: null,
      error: new Error("Not signed in"),
    };
  }

  const { data, error } = await supabase.rpc("rpc_start_community_trial");
  if (error) {
    return {
      ok: false,
      started: false,
      reason: "rpc_error",
      status: null,
      error: new Error(error.message),
    };
  }

  const raw = asRecord(data);
  const status = raw.status ? parseCommunityAccessStatus(raw.status) : parseCommunityAccessStatus(raw);
  return {
    ok: raw.ok !== false,
    started: raw.started === true,
    reason: stringOrNull(raw.reason),
    status,
  };
}

