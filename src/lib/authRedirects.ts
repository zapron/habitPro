import * as Linking from "expo-linking";
import { Platform } from "react-native";

/**
 * Email signup confirmation must **not** use `https://auth.expo.io/...` — that proxy is OAuth-only.
 * We use the same deep link as Google PKCE (`/auth/callback`) so `exchangeCodeForSession` applies.
 *
 * Supabase dashboard: set **Site URL** to `habitpro://auth/callback` (or `habitpro://`), **not** auth.expo.io.
 * See `docs/email-auth-supabase.md`.
 */
const DEFAULT_WEB_ORIGIN = "https://YOUR-PRODUCTION-SITE.example";
const LOCAL_WEB_ORIGIN_PATTERN = /^(https?:\/\/)(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$/i;

const normalizeOrigin = (origin: string | null | undefined) => {
  if (!origin) return null;
  return origin.trim().replace(/\/+$/, "");
};

const getConfiguredWebOrigin = () =>
  normalizeOrigin(process.env.EXPO_PUBLIC_SITE_URL) ?? DEFAULT_WEB_ORIGIN;

const getRuntimeWebOrigin = () => {
  if (Platform.OS !== "web" || typeof window === "undefined") return null;

  const runtimeOrigin = normalizeOrigin(window.location.origin);
  if (!runtimeOrigin || LOCAL_WEB_ORIGIN_PATTERN.test(runtimeOrigin)) {
    return null;
  }

  return runtimeOrigin;
};

const buildWebAuthUrl = (path: string) => {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${getRuntimeWebOrigin() ?? getConfiguredWebOrigin()}${normalizedPath}`;
};

/** Email confirmation + OAuth PKCE return — must be in Supabase Redirect URLs (e.g. `habitpro://auth/callback`). */
export const getSignupConfirmationRedirectUrl = () =>
  Platform.OS === "web" ? buildWebAuthUrl("/auth/callback") : Linking.createURL("/auth/callback");

/** For `resetPasswordForEmail` when you add a forgot-password screen (same as v2). */
export const getPasswordResetRedirectUrl = () =>
  Platform.OS === "web" ? buildWebAuthUrl("/reset-password") : Linking.createURL("/reset-password");

export const getConfiguredAuthWebOrigin = () => getConfiguredWebOrigin();
