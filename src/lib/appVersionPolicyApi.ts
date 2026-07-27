import { getSupabase } from "./supabase";

export type AppVersionPolicyRow = {
  id: number;
  min_android_version: string | null;
  min_ios_version: string | null;
  latest_android_version: string | null;
  latest_ios_version: string | null;
  android_download_url: string | null;
  ios_download_url: string | null;
  force_update_message: string | null;
  updated_at: string;
};

export type AppVersionReleaseRow = {
  id: string;
  version: string;
  platform: "android" | "ios" | "all";
  download_url: string | null;
  notes: string | null;
  /** Optional hero image for the force-update screen's premium card. */
  image_url: string | null;
  /** Optional structured bullet-point changelog; falls back to `notes` when null. */
  changelog: string[] | null;
  /** Optional link to a full changelog / release notes page. */
  changelog_url: string | null;
  created_at: string;
};

export async function fetchAppVersionPolicy(): Promise<AppVersionPolicyRow | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase.from("app_version_policy").select("*").eq("id", 1).maybeSingle();
  if (error) throw error;
  return (data as AppVersionPolicyRow) ?? null;
}

export async function fetchAppVersionReleases(limit = 8): Promise<AppVersionReleaseRow[]> {
  const supabase = getSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("app_version_releases")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as AppVersionReleaseRow[];
}
