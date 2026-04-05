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

/** Dev-only hint when env looks wrong (does not log secrets). */
export function logSupabaseEnvHint(): void {
  if (!__DEV__) return;
  const { url, anonKey } = getSupabaseConfig();
  if (url && anonKey) return;
  console.warn(
    "[habitPro] Supabase env missing in bundle. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in .env, restart with: npx expo start -c",
  );
}
