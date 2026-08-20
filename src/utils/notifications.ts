import Constants from "expo-constants";
import { Platform } from "react-native";
import { useHabitStore } from "../store/habitStore";
import { getFocusedMiniMissionId } from "../lib/miniMissionFocusTracker";
import { isMiniMissionSoundEnabled } from "../lib/completionSound";

/** Used for remote pushes (Expo/FCM) + matches manifest `default_notification_channel_id`. */
const DEFAULT_REMOTE_CHANNEL_ID = "default";
const CHANNEL_ID = "timer-alerts";

/**
 * Expo Go: avoid loading `expo-notifications` — Android (SDK 53+) broke remote push, and
 * iOS Expo Go can throw when the native module graph touches `PushNotificationIOS`.
 * Use a dev client / production build for real notification behavior.
 */
function shouldSkipNotificationsModule(): boolean {
  return Constants.appOwnership === "expo";
}

type NotificationsModule = typeof import("expo-notifications");

let cached: NotificationsModule | null | undefined;

const foregroundDisplay = {
  shouldPlaySound: true,
  shouldSetBadge: false,
  shouldShowBanner: true,
  shouldShowList: true,
};

const foregroundSuppress = {
  shouldPlaySound: false,
  shouldSetBadge: false,
  shouldShowBanner: false,
  shouldShowList: false,
};

function getMiniMissionEndMs(missionId: string): number | null {
  const mission = useHabitStore.getState().miniMissions.find((m) => m.id === missionId);
  if (!mission || mission.status !== "in_progress" || !mission.startedAt) return null;
  const totalMinutes = mission.estimatedMinutes + (mission.extendedMinutes ?? 0);
  return new Date(mission.startedAt).getTime() + totalMinutes * 60_000;
}

function numberFromNotificationData(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function shouldSuppressForegroundNotification(data: Record<string, unknown> | undefined): boolean {
  if (data?.type !== "mini_mission") return false;
  const missionId = typeof data.missionId === "string" ? data.missionId : "";
  const kind = typeof data.kind === "string" ? data.kind : "";
  if (!missionId) return true;

  const expectedEndMs = getMiniMissionEndMs(missionId);
  const notificationEndMs = numberFromNotificationData(data.endMs);

  // Mission is no longer in_progress (expired, completed, etc.).
  if (expectedEndMs == null) {
    // Always suppress warn — no point showing "ending soon" after mission is done.
    if (kind === "mini_warn") return true;
    // Allow fail notification if it fired within the last 5 minutes — the OS may have
    // delayed delivery slightly, or the status change raced with delivery.
    if (kind === "mini_fail" && notificationEndMs != null && notificationEndMs >= Date.now() - 5 * 60_000) {
      return false;
    }
    return true;
  }

  if (notificationEndMs == null) return true;
  if (expectedEndMs !== notificationEndMs) return true;
  if (kind === "mini_warn" && expectedEndMs <= Date.now()) return true;
  if (kind === "mini_fail" && expectedEndMs + 5 * 60_000 < Date.now()) return true;

  // The user is already looking at this exact mission's countdown — the OS "2 minutes
  // left" banner/sound would be pure redundancy. The mission-detail screen plays its
  // own in-app reminder chime in this case instead (see playMiniMissionReminderSound).
  // Only suppress if that chime would actually play — if the user has muted mini
  // mission sounds in Settings, suppressing this too would silently drop the
  // reminder entirely (no chime, no banner).
  if (kind === "mini_warn" && missionId === getFocusedMiniMissionId() && isMiniMissionSoundEnabled()) {
    return true;
  }

  return false;
}

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
 * Sets the foreground handler and creates Android channels.
 *
 * IMPORTANT: Do not request notification permission here. Permission prompts should be
 * user-initiated (soft ask → OS prompt), and denied users must be routed to Settings.
 */
export async function setupNotifications() {
  const Notifications = await getNotifications();
  if (!Notifications) return;

  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const data = notification.request.content.data as Record<string, unknown> | undefined;
      return shouldSuppressForegroundNotification(data)
        ? foregroundSuppress
        : foregroundDisplay;
    },
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

export type ScheduledNotificationInfo = {
  identifier: string;
  content: { data?: Record<string, unknown> };
};

export async function listScheduledNotifications(): Promise<ScheduledNotificationInfo[]> {
  const Notifications = await getNotifications();
  if (!Notifications) return [];
  try {
    const list = await Notifications.getAllScheduledNotificationsAsync();
    return (list ?? []) as unknown as ScheduledNotificationInfo[];
  } catch {
    return [];
  }
}
