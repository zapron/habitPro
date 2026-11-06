import { useEffect, useState } from "react";
import { getSupabase } from "./supabase";

/**
 * Server-side switches (public.app_feature_flags plus a per-user tester
 * allowlist), read once per app session through rpc_my_feature_flags_v1 and
 * cached. Unknown or unreachable flags count as off, so a feature behind one
 * stays hidden until the server explicitly turns it on for this user.
 */
export type FeatureFlagKey = "video_moments";

export type FeatureFlag = {
  enabled: boolean;
  /** First calendar date (YYYY-MM-DD) that counts for this user; null = nothing yet. */
  startsOn: string | null;
};

const OFF: FeatureFlag = { enabled: false, startsOn: null };

let cache: Partial<Record<FeatureFlagKey, FeatureFlag>> | null = null;
let inFlight: Promise<Partial<Record<FeatureFlagKey, FeatureFlag>>> | null = null;

async function loadFlags(): Promise<Partial<Record<FeatureFlagKey, FeatureFlag>>> {
  const supabase = getSupabase();
  if (!supabase) return {};
  const { data, error } = await supabase.rpc("rpc_my_feature_flags_v1");
  if (error || !data || typeof data !== "object") return {};
  const out: Partial<Record<FeatureFlagKey, FeatureFlag>> = {};
  for (const [key, raw] of Object.entries(data as Record<string, { enabled?: unknown; startsOn?: unknown }>)) {
    out[key as FeatureFlagKey] = {
      enabled: raw?.enabled === true,
      startsOn: typeof raw?.startsOn === "string" ? raw.startsOn : null,
    };
  }
  return out;
}

export function getFeatureFlags(): Promise<Partial<Record<FeatureFlagKey, FeatureFlag>>> {
  if (cache) return Promise.resolve(cache);
  if (!inFlight) {
    inFlight = loadFlags()
      .then((flags) => {
        cache = flags;
        return flags;
      })
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

export function useFeatureFlag(key: FeatureFlagKey): FeatureFlag {
  const [flag, setFlag] = useState<FeatureFlag>(() => cache?.[key] ?? OFF);
  useEffect(() => {
    let cancelled = false;
    void getFeatureFlags().then((flags) => {
      if (!cancelled) setFlag(flags[key] ?? OFF);
    });
    return () => {
      cancelled = true;
    };
  }, [key]);
  return flag;
}
