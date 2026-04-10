import Constants from "expo-constants";
import { Platform } from "react-native";

/** Used for remote pushes (Expo/FCM) + matches manifest `default_notification_channel_id`. */
const DEFAULT_REMOTE_CHANNEL_ID = "default";
const CHANNEL_ID = "timer-alerts";

/**
 * Expo Go on Android (SDK 53+) removed remote push; loading expo-notifications
 * still runs push registration and throws + can cause spurious "Network request failed".
 * Skip importing the module entirely in that environment.
 */
function shouldSkipNotificationsModule(): boolean {
  return Constants.appOwnership === "expo" && Platform.OS === "android";
}

type NotificationsModule = typeof import("expo-notifications");

let cached: NotificationsModule | null | undefined;

async function getNotifications(): Promise<NotificationsModule | null> {
  if (shouldSkipNotificationsModule()) {
    return null;
  }
  if (cached !== undefined) {
    return cached;
  }
  cached = await import("expo-notifications");
  return cached;
}

/**
 * Call once at app startup (from _layout.tsx).
 * Sets the foreground handler, creates Android channels, and requests permissions.
 */
export async function setupNotifications() {
  const Notifications = await getNotifications();
  if (!Notifications) return;

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(DEFAULT_REMOTE_CHANNEL_ID, {
      name: "Alerts",
      importance: Notifications.AndroidImportance.MAX,
      sound: "default",
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#6366f1",
    });
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: "Timer Alerts",
      importance: Notifications.AndroidImportance.HIGH,
      sound: "default",
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#6366f1",
    });
  }

  const { status } = await Notifications.getPermissionsAsync();
  if (status !== "granted") {
    await Notifications.requestPermissionsAsync();
  }
}

export async function scheduleTimerNotification(
  title: string,
  body: string,
  seconds: number,
  options?: { data?: Record<string, unknown> },
): Promise<string | null> {
  const Notifications = await getNotifications();
  if (!Notifications) return null;
  try {
    if (seconds <= 0) return null;
    const data = options?.data;
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: true,
        ...(data && Object.keys(data).length > 0 ? { data } : {}),
        ...(Platform.OS === "android" ? { channelId: CHANNEL_ID } : {}),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: Math.max(1, Math.round(seconds)),
      },
    });
    return id;
  } catch {
    return null;
  }
}

export async function fireImmediateNotification(title: string, body: string) {
  const Notifications = await getNotifications();
  if (!Notifications) return;
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: true,
        ...(Platform.OS === "android" ? { channelId: CHANNEL_ID } : {}),
      },
      trigger: null,
    });
  } catch {
    // Silent fail
  }
}

export async function cancelNotification(id: string | null) {
  if (!id) return;
  const Notifications = await getNotifications();
  if (!Notifications) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(id);
  } catch {
    // Already fired or unavailable
  }
}
