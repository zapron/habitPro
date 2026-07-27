import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

type MemoryFormationHapticsOptions = {
  itemCount: number;
  reduceMotion?: boolean;
};

const FORMATION_THROTTLE_MS = 1800;
const IOS_FORMATION_DELAYS_MS = [0, 82, 164];
const ANDROID_FORMATION_DELAYS_MS = [0, 120];

let lastMemoryFormationAt = 0;

function runHaptic(task: Promise<void>): void {
  task.catch(() => {
    // Older devices, disabled haptics, low-power edge cases, or unsupported runtimes should stay quiet.
  });
}

/** Light tap feedback for primary/secondary button presses. */
export function triggerTapHaptic(): void {
  if (Platform.OS === "web") return;
  runHaptic(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}

/** Slightly heavier feedback for destructive/danger actions. */
export function triggerWarningHaptic(): void {
  if (Platform.OS === "web") return;
  runHaptic(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
}

export function playMemoryFormationHaptics({
  itemCount,
  reduceMotion = false,
}: MemoryFormationHapticsOptions): () => void {
  if (Platform.OS === "web" || itemCount <= 0) return () => {};

  const now = Date.now();
  if (now - lastMemoryFormationAt < FORMATION_THROTTLE_MS) return () => {};
  lastMemoryFormationAt = now;

  if (reduceMotion) {
    runHaptic(Haptics.selectionAsync());
    return () => {};
  }

  const delays =
    Platform.OS === "ios" ? IOS_FORMATION_DELAYS_MS : ANDROID_FORMATION_DELAYS_MS;
  const pulseCount = Math.min(itemCount, delays.length);
  const timers = delays.slice(0, pulseCount).map((delay, index) =>
    setTimeout(() => {
      const style =
        index === 0
          ? Haptics.ImpactFeedbackStyle.Light
          : Haptics.ImpactFeedbackStyle.Soft;
      runHaptic(Haptics.impactAsync(style));
    }, delay),
  );

  return () => {
    timers.forEach(clearTimeout);
  };
}
