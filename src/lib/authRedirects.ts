import * as Linking from "expo-linking";
import { Platform } from "react-native";
import { getHabitProWebUrl } from "./env";

/**
 * Email signup confirmation lands on the public website. The domain can move later:
 * set EXPO_PUBLIC_HABITPRO_WEB_URL / EXPO_PUBLIC_SITE_URL and allow-list that URL in Supabase.
 */
const LOCAL_WEB_ORIGIN_PATTERN = /^(https?:\/\/)(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$/i;

const normalizeOrigin = (origin: string | null | undefined) => {
  if (!origin) return null;
  return origin.trim().replace(/\/+$/, "");
};

const getConfiguredWebOrigin = () =>
  normalizeOrigin(process.env.EXPO_PUBLIC_SITE_URL) ??
  normalizeOrigin(process.env.EXPO_PUBLIC_HABITPRO_WEB_URL) ??
  getHabitProWebUrl();

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

/** Email confirmation landing page. The app clears password fields and asks the user to sign in after verifying. */
export const getSignupConfirmationRedirectUrl = () => buildWebAuthUrl("/auth/verified");

/** For `resetPasswordForEmail` when you add a forgot-password screen (same as v2). */
export const getPasswordResetRedirectUrl = () =>
  Platform.OS === "web" ? buildWebAuthUrl("/reset-password") : Linking.createURL("/reset-password");

export const getConfiguredAuthWebOrigin = () => getConfiguredWebOrigin();
