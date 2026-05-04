import Constants from "expo-constants";

function getManifestExtra(): Record<string, unknown> | undefined {
  const expo = Constants.expoConfig;
  if (expo?.extra && typeof expo.extra === "object") {
    return expo.extra as Record<string, unknown>;
  }
  const legacy = (Constants as { manifest?: { extra?: unknown } }).manifest;
  if (legacy?.extra && typeof legacy.extra === "object") {
    return legacy.extra as Record<string, unknown>;
  }
  return undefined;
}

const DEFAULT_HABITPRO_WEB_URL = "https://habitpro-web.vercel.app";

function normalizeOrigin(origin: string | null | undefined): string | null {
  if (!origin) return null;
  const normalized = origin.trim().replace(/\/+$/, "");
  if (!normalized) return null;
  try {
    const url = new URL(normalized);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return normalized;
  } catch {
    return null;
  }
}

/**
 * Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in a .env file
 * at the project root, or add supabaseUrl / supabaseAnonKey under expo.extra (see app.config.js).
 */
export function getSupabaseConfig(): { url: string; anonKey: string } {
  const extra = getManifestExtra();
  const rawUrl = String(
    process.env.EXPO_PUBLIC_SUPABASE_URL ??
      extra?.supabaseUrl ??
      "",
  ).trim();
  const rawKey = String(
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
      extra?.supabaseAnonKey ??
      "",
  ).trim();
  const url = rawUrl.replace(/\/+$/, "");
  const anonKey = rawKey.replace(/\s+/g, "");
  return { url, anonKey };
}

export function isSupabaseConfigured(): boolean {
  const { url, anonKey } = getSupabaseConfig();
  if (!url || !anonKey) return false;
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

export function getRevenueCatConfig(): { androidApiKey: string; iosApiKey: string } {
  const extra = getManifestExtra();
  const androidApiKey = String(
    process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY ??
      extra?.revenuecatAndroidApiKey ??
      "",
  ).trim();
  const iosApiKey = String(
    process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY ??
      extra?.revenuecatIosApiKey ??
      "",
  ).trim();
  return { androidApiKey, iosApiKey };
}

export function isRevenueCatConfigured(): boolean {
  const { androidApiKey, iosApiKey } = getRevenueCatConfig();
  return Boolean(androidApiKey || iosApiKey);
}

export function getHabitProWebUrl(): string {
  const extra = getManifestExtra();
  return (
    normalizeOrigin(process.env.EXPO_PUBLIC_HABITPRO_WEB_URL) ??
    normalizeOrigin(String(extra?.habitProWebUrl ?? "")) ??
    normalizeOrigin(process.env.EXPO_PUBLIC_SITE_URL) ??
    DEFAULT_HABITPRO_WEB_URL
  );
}

export function getPublicLinks(): {
  privacy: string;
  terms: string;
  support: string;
} {
  const base = getHabitProWebUrl();
  return {
    privacy: `${base}/privacy`,
    terms: `${base}/terms`,
    support: `${base}/support`,
  };
}

/** Dev-only hint when env looks wrong (does not log secrets). */
export function logSupabaseEnvHint(): void {
  if (!__DEV__) return;
  const { url, anonKey } = getSupabaseConfig();
  if (url && anonKey) return;
  console.warn(
    "[habitPro] Supabase env missing in bundle. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in .env, restart with: npx expo start -c",
  );
}

export function logRevenueCatEnvHint(): void {
  if (!__DEV__) return;
  const { androidApiKey, iosApiKey } = getRevenueCatConfig();
  if (androidApiKey || iosApiKey) return;
  console.warn(
    "[habitPro] RevenueCat env missing in bundle. Set EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY / EXPO_PUBLIC_REVENUECAT_IOS_API_KEY in .env, restart with: npx expo start -c",
  );
}
