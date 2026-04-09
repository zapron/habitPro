import { getSupabase } from "./supabase";

/** Extract PKCE auth code from OAuth / email confirmation return URL (query or hash fragment). */
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

/** Implicit / magic-link style tokens in URL (query or hash). */
function extractTokenPairFromUrl(url: string): { access_token: string; refresh_token: string } | null {
  try {
    const u = new URL(url);
    const fromSearch = () => {
      const access_token = u.searchParams.get("access_token");
      const refresh_token = u.searchParams.get("refresh_token");
      if (access_token && refresh_token) return { access_token, refresh_token };
      return null;
    };
    const fromHash = () => {
      if (!u.hash) return null;
      const hash = new URLSearchParams(u.hash.replace(/^#/, ""));
      const access_token = hash.get("access_token");
      const refresh_token = hash.get("refresh_token");
      if (access_token && refresh_token) return { access_token, refresh_token };
      return null;
    };
    return fromSearch() ?? fromHash();
  } catch {
    return null;
  }
}

/**
 * Complete session from a deep link (Google OAuth, email confirmation PKCE, or token fragment).
 * Call from root `Linking` listener and optionally from `auth/callback`.
 */
export async function tryCompleteAuthFromUrl(url: string | null): Promise<boolean> {
  if (!url) return false;
  const supabase = getSupabase();
  if (!supabase) return false;

  const { data: existing } = await supabase.auth.getSession();
  if (existing.session) return true;

  const code = extractOAuthCodeFromUrl(url);
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return true;
    const { data: after } = await supabase.auth.getSession();
    return !!after.session;
  }

  const tokens = extractTokenPairFromUrl(url);
  if (tokens) {
    const { error } = await supabase.auth.setSession({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
    });
    if (!error) return true;
    const { data: after } = await supabase.auth.getSession();
    return !!after.session;
  }

  return false;
}

/** @deprecated Same as {@link tryCompleteAuthFromUrl} (name kept for older imports). */
export const tryCompleteOAuthFromUrl = tryCompleteAuthFromUrl;
