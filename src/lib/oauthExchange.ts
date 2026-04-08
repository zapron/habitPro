import { getSupabase } from "./supabase";

/** Extract PKCE auth code from OAuth return URL (query or hash fragment). */
export function extractOAuthCodeFromUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const q = u.searchParams.get("code");
    if (q) return q;
    if (u.hash) {
      const hash = new URLSearchParams(u.hash.replace(/^#/, ""));
      return hash.get("code");
    }
    return null;
  } catch {
    return null;
  }
}

/** Complete OAuth when the app opens from a deep link before the `/callback` screen runs (backup path). */
export async function tryCompleteOAuthFromUrl(url: string | null): Promise<boolean> {
  if (!url?.includes("code=")) return false;
  const supabase = getSupabase();
  if (!supabase) return false;
  const { data: existing } = await supabase.auth.getSession();
  if (existing.session) return true;
  const code = extractOAuthCodeFromUrl(url);
  if (!code) return false;
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (!error) return true;
  const { data: after } = await supabase.auth.getSession();
  return !!after.session;
}
