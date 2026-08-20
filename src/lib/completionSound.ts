import AsyncStorage from "@react-native-async-storage/async-storage";
import { Audio } from "expo-av";

const TIMER_END_SOUND = require("../../assets/sounds/mini-mission-timer-end.wav");
const MISSION_COMPLETED_SOUND = require("../../assets/sounds/mini-mission-completed.wav");
const REMINDER_SOUND = require("../../assets/sounds/mini-mission-reminder.wav");

type SoundKey = "timerEnd" | "missionCompleted" | "reminder";

const cachedSounds: Partial<Record<SoundKey, Audio.Sound>> = {};
const loadingPromises: Partial<Record<SoundKey, Promise<Audio.Sound | null>>> = {};

const SOUND_ENABLED_STORAGE_KEY = "habitpro_mini_mission_sounds_enabled";
/** Optimistic default (sounds on) until the persisted value loads — playback only
 * ever happens well after mount, so in practice this resolves before it matters. */
let soundEnabled = true;
let hydratePromise: Promise<boolean> | null = null;

function hydrateSoundEnabled(): Promise<boolean> {
  if (!hydratePromise) {
    hydratePromise = AsyncStorage.getItem(SOUND_ENABLED_STORAGE_KEY)
      .then((v) => {
        soundEnabled = v !== "false";
        return soundEnabled;
      })
      .catch(() => soundEnabled);
  }
  return hydratePromise;
}
void hydrateSoundEnabled();

/** Synchronous, optimistic read — safe to call from a playback path. */
export function isMiniMissionSoundEnabled(): boolean {
  return soundEnabled;
}

/** Re-reads the persisted preference. Use when a UI (Settings) needs the
 * authoritative current value rather than the optimistic in-memory default. */
export async function loadMiniMissionSoundEnabled(): Promise<boolean> {
  return hydrateSoundEnabled();
}

export function setMiniMissionSoundEnabled(enabled: boolean): void {
  soundEnabled = enabled;
  hydratePromise = Promise.resolve(enabled);
  void AsyncStorage.setItem(SOUND_ENABLED_STORAGE_KEY, enabled ? "true" : "false");
}

async function getSound(key: SoundKey, source: number): Promise<Audio.Sound | null> {
  const cached = cachedSounds[key];
  if (cached) return cached;
  const inFlight = loadingPromises[key];
  if (inFlight) return inFlight;
  const promise = (async () => {
    try {
      const { sound } = await Audio.Sound.createAsync(source, { volume: 0.85 });
      cachedSounds[key] = sound;
      return sound;
    } catch (e) {
      if (__DEV__) console.warn(`[habitPro] failed to load ${key} sound`, e);
      return null;
    } finally {
      delete loadingPromises[key];
    }
  })();
  loadingPromises[key] = promise;
  return promise;
}

async function play(key: SoundKey, source: number): Promise<void> {
  if (!soundEnabled) return;
  const sound = await getSound(key, source);
  if (!sound) return;
  try {
    await sound.replayAsync();
  } catch (e) {
    if (__DEV__) console.warn(`[habitPro] failed to play ${key} sound`, e);
  }
}

/** Fire-and-forget: the countdown hitting 0:00 while the mission-detail screen is
 * open. Distinct from the mission-completed chime below — this one reads as a
 * gentle notice ("time's up"), not a reward. */
export function playMiniMissionTimerEndSound(): void {
  void play("timerEnd", TIMER_END_SOUND);
}

/** Fire-and-forget: the mission is actually marked complete (the user submitted
 * the completion sheet) — a brighter, richer 3-note chime, deliberately more
 * "rewarded" than the plainer timer-end notice. Both respect the iOS silent
 * switch (default `expo-av` audio mode) like any other in-app UI sound, and
 * never throw into the flow that calls them. All three sounds here respect the
 * user's own mute preference (see `isMiniMissionSoundEnabled`/Settings), on top
 * of whatever the device's own mute/volume state is. */
export function playMiniMissionCompletedSound(): void {
  void play("missionCompleted", MISSION_COMPLETED_SOUND);
}

/** Fire-and-forget: the 2-minutes-remaining heads-up, played in-app in place of the
 * OS notification's default sound while the mission-detail screen is on screen and
 * focused (the matching `mini_warn` notification is silenced at that point — see
 * `shouldSuppressForegroundNotification` in `src/utils/notifications.ts` — so this
 * is the only "2 minutes left" sound the user hears in that case). A short repeated
 * "ping" rather than a melodic run, so it reads as a heads-up, not a reward.
 * Suppressing the OS notification's banner still happens even if the user has
 * muted these sounds in Settings — only the audio is gated, not the visibility. */
export function playMiniMissionReminderSound(): void {
  void play("reminder", REMINDER_SOUND);
}
