import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "habitpro_device_install_id";

function randomUuid(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

/** Stable per-app-install id for multi-device push token rows. */
export async function getOrCreateDeviceInstallId(): Promise<string> {
  const existing = await AsyncStorage.getItem(KEY);
  if (existing) return existing;
  const next = randomUuid();
  await AsyncStorage.setItem(KEY, next);
  return next;
}
