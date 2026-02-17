import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

const CHANNEL_ID = "timer-alerts";
const ONGOING_CHANNEL_ID = "mission-progress";

/**
 * Call once at app startup (from _layout.tsx).
 * Sets the foreground handler, creates Android channels, and requests permissions.
 */
export async function setupNotifications() {
  // 1. Foreground handler — show alert + play sound even when app is open
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });

  // 2. Android notification channels
  if (Platform.OS === "android") {
    // High-priority channel for timer expiry alerts
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: "Timer Alerts",
      importance: Notifications.AndroidImportance.HIGH,
      sound: "default",
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#6366f1",
    });
    // Low-priority channel for ongoing mission progress (no sound/vibration)
    await Notifications.setNotificationChannelAsync(ONGOING_CHANNEL_ID, {
      name: "Mission Progress",
      importance: Notifications.AndroidImportance.LOW,
      sound: undefined,
      vibrationPattern: [0],
      enableVibrate: false,
    });
  }

  // 3. Request permissions (Android 13+ needs explicit opt-in)
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== "granted") {
    await Notifications.requestPermissionsAsync();
  }
}

/**
 * Schedule a local notification that fires after `seconds`.
 * Returns the notification ID so it can be cancelled later.
 */
export async function scheduleTimerNotification(
  title: string,
  body: string,
  seconds: number,
): Promise<string | null> {
  try {
    if (seconds <= 0) return null;
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: true,
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

/**
 * Fire an immediate notification (e.g., when timer hits zero while app is open).
 */
export async function fireImmediateNotification(title: string, body: string) {
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
    // Silent fail — alarm sound + vibration are the primary fallback
  }
}

/**
 * Show a persistent/ongoing notification while a mini mission is running.
 * Returns the notification ID so it can be dismissed later.
 */
export async function showOngoingMissionNotification(
  missionTitle: string,
  endTimeMs: number,
): Promise<string | null> {
  try {
    const endDate = new Date(endTimeMs);
    const timeStr = endDate.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: `🚀 ${missionTitle}`,
        body: `In progress — ends at ${timeStr}`,
        sound: false,
        sticky: true,
        autoDismiss: false,
        ...(Platform.OS === "android"
          ? {
              channelId: ONGOING_CHANNEL_ID,
              ongoing: true,
              priority: Notifications.AndroidNotificationPriority.LOW,
            }
          : {}),
      },
      trigger: null,
    });
    return id;
  } catch {
    return null;
  }
}

/**
 * Dismiss an ongoing notification by ID.
 */
export async function dismissOngoingNotification(id: string | null) {
  if (!id) return;
  try {
    await Notifications.dismissNotificationAsync(id);
  } catch {
    // Already dismissed or unavailable
  }
}

/**
 * Cancel a previously scheduled notification by ID.
 */
export async function cancelNotification(id: string | null) {
  if (!id) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(id);
  } catch {
    // Already fired or unavailable
  }
}
