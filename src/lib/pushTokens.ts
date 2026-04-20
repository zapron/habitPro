import Constants from "expo-constants";
import { AppState, type AppStateStatus, Platform } from "react-native";
import { getSupabase } from "./supabase";
import { getOrCreateDeviceInstallId } from "./deviceInstallId";

/**
 * Expo Go: do not dynamically import `expo-notifications` (Android push limits + iOS
 * missing `PushNotificationIOS` in Go). Dev client / store builds register normally.
 */
export function shouldSkipRemotePushRegistration(): boolean {
  return Constants.appOwnership === "expo";
}

async function getNotificationsModule(): Promise<
  typeof import("expo-notifications") | null
> {
  if (shouldSkipRemotePushRegistration()) return null;
  return import("expo-notifications");
}

function getEasProjectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId;
}

/**
 * Registers Expo push token for this user + device. Safe to call repeatedly (upserts).
 * Call after sign-in when notification permission is granted.
 */
export async function registerPushTokenForCurrentUser(userId: string): Promise<void> {
  const Notifications = await getNotificationsModule();
  if (!Notifications) return;

  const { status } = await Notifications.getPermissionsAsync();
  if (status !== "granted") {
    const { status: next } = await Notifications.requestPermissionsAsync();
    if (next !== "granted") return;
  }

  const projectId = getEasProjectId();
  if (!projectId) {
    if (__DEV__) console.warn("[push] Missing EAS projectId in app config; cannot get Expo push token.");
    return;
  }

  const tokenRes = await Notifications.getExpoPushTokenAsync({ projectId });
  const expoPushToken = tokenRes.data;
  if (!expoPushToken) return;

  const deviceId = await getOrCreateDeviceInstallId();
  const platform =
    Platform.OS === "ios" ? "ios" : Platform.OS === "android" ? "android" : "unknown";

  const supabase = getSupabase();
  if (!supabase) return;

  const { error } = await supabase.from("push_tokens").upsert(
    {
      user_id: userId,
      device_id: deviceId,
      expo_push_token: expoPushToken,
      platform,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,device_id" },
  );

  if (error && __DEV__) {
    console.warn("[push] upsert push_tokens failed", error.message);
  }
}

/** Removes push token row for this install so logged-out users are not targeted. */
export async function clearPushTokenForCurrentUser(userId: string): Promise<void> {
  const deviceId = await getOrCreateDeviceInstallId();
  const supabase = getSupabase();
  if (!supabase) return;

  const { error } = await supabase
    .from("push_tokens")
    .delete()
    .eq("user_id", userId)
    .eq("device_id", deviceId);

  if (error && __DEV__) {
    console.warn("[push] delete push_tokens failed", error.message);
  }
}

/**
 * Re-sync timezone (and push token) when the app returns to foreground so `profiles.timezone`
 * matches the device after travel or TZ changes — required for streak reminder date keys.
 */
export function subscribePushAndTimezoneOnAppActive(userId: string): () => void {
  const sub = AppState.addEventListener("change", (next: AppStateStatus) => {
    if (next !== "active") return;
    void syncProfileTimezone(userId);
    void registerPushTokenForCurrentUser(userId);
  });
  return () => sub.remove();
}

/** Stores IANA timezone so streak reminders use the same calendar labels as the mission grid (24h slots from start_date). */
export async function syncProfileTimezone(userId: string): Promise<void> {
  let tz: string;
  try {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    tz = "UTC";
  }
  const supabase = getSupabase();
  if (!supabase) return;

  const { error } = await supabase.from("profiles").update({ timezone: tz }).eq("id", userId);
  if (error && __DEV__) {
    console.warn("[push] profile timezone update failed", error.message);
  }
}
