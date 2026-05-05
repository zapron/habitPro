import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseConfig, isSupabaseConfigured } from "./env";

const authStorage = {
  getItem: (key: string) => AsyncStorage.getItem(key),
  setItem: (key: string, value: string) => AsyncStorage.setItem(key, value),
  removeItem: (key: string) => AsyncStorage.removeItem(key),
};

let client: SupabaseClient | null = null;

function getSupabaseAuthStorageKey(): string | null {
  if (!isSupabaseConfigured()) return null;
  const { url } = getSupabaseConfig();
  try {
    const parsed = new URL(url);
    return `sb-${parsed.hostname.split(".")[0]}-auth-token`;
  } catch {
    return null;
  }
}

/** Best-effort local session cleanup used when network sign-out cannot clear storage. */
export async function clearSupabaseAuthStorage(): Promise<void> {
  const storageKey = getSupabaseAuthStorageKey();
  if (!storageKey) return;
  await Promise.all([
    AsyncStorage.removeItem(storageKey),
    AsyncStorage.removeItem(`${storageKey}-code-verifier`),
    AsyncStorage.removeItem(`${storageKey}-user`),
  ]);
}

export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  if (!client) {
    const { url, anonKey } = getSupabaseConfig();
    try {
      // eslint-disable-next-line no-new
      new URL(url);
    } catch {
      if (__DEV__) {
        console.warn("[habitPro] Invalid EXPO_PUBLIC_SUPABASE_URL (must be a full URL).");
      }
      return null;
    }
    client = createClient(url, anonKey, {
      auth: {
        storage: authStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
        flowType: "pkce",
      },
    });
  }
  return client;
}
