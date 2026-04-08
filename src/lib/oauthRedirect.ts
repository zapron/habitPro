import * as AuthSession from "expo-auth-session";
import sessionUrlProvider from "expo-auth-session/build/SessionUrlProvider";
import Constants, { ExecutionEnvironment } from "expo-constants";

/** `@owner/slug` for Expo’s `https://auth.expo.io/...` OAuth proxy (Expo Go). */
function expoProjectFullName(): string | null {
  const cfg = Constants.expoConfig;
  if (!cfg) return null;
  if (typeof cfg.originalFullName === "string" && cfg.originalFullName.length > 0) {
    return cfg.originalFullName;
  }
  const owner = typeof cfg.owner === "string" ? cfg.owner : null;
  const slug = typeof cfg.slug === "string" ? cfg.slug : null;
  if (owner && slug) return `@${owner}/${slug}`;
  return null;
}

/**
 * Where the **browser must return** after OAuth (Expo Go: `exp://…/--/auth/callback`, standalone: `habitpro://…`).
 * Pass this as `returnUrl` to `SessionUrlProvider.getStartUrl` and as the **second** argument to
 * `WebBrowser.openAuthSessionAsync` — **not** the same as {@link getOAuthRedirectUri} in Expo Go.
 */
export function getOAuthReturnUrl(): string {
  return AuthSession.makeRedirectUri({
    path: "auth/callback",
  });
}

/**
 * Supabase `redirect_to` (must be in **Redirect URLs**). In Expo Go this is `https://auth.expo.io/@owner/slug`.
 * **Do not** pass this to `openAuthSessionAsync` as the second argument in Expo Go — use {@link getOAuthReturnUrl}.
 */
export function getOAuthRedirectUri(): string {
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
    const fullName = expoProjectFullName();
    if (fullName) {
      try {
        return sessionUrlProvider.getRedirectUrl({ projectNameForProxy: fullName });
      } catch (e) {
        if (__DEV__) {
          console.warn("[OAuth] getRedirectUrl(projectNameForProxy) failed, falling back to exp://. Error:", e);
        }
      }
    } else if (__DEV__) {
      console.warn(
        "[OAuth] Missing expo.owner + expo.slug (or originalFullName); cannot build auth.expo.io redirect.",
      );
    }
  }
  return AuthSession.makeRedirectUri({
    path: "auth/callback",
  });
}

/**
 * Expo Go: open the **proxy** `/start` URL so auth.expo.io can finish the handoff to `exp://…`.
 * Opening the raw Supabase URL while `redirect_to` is auth.expo.io leaves the proxy without a `/start`
 * session → “Something went wrong trying to finish signing in”.
 */
export function buildSupabaseOAuthBrowserUrl(supabaseAuthorizeUrl: string): string {
  if (Constants.executionEnvironment !== ExecutionEnvironment.StoreClient) {
    return supabaseAuthorizeUrl;
  }
  const fullName = expoProjectFullName();
  if (!fullName) return supabaseAuthorizeUrl;
  const returnUrl = getOAuthReturnUrl();
  try {
    return sessionUrlProvider.getStartUrl(supabaseAuthorizeUrl, returnUrl, fullName);
  } catch (e) {
    if (__DEV__) {
      console.warn("[OAuth] getStartUrl failed; using raw Supabase authorize URL. Error:", e);
    }
    return supabaseAuthorizeUrl;
  }
}
