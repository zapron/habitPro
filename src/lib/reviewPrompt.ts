import AsyncStorage from "@react-native-async-storage/async-storage";
import * as StoreReview from "expo-store-review";

const STORAGE_KEY = "habitpro.reviewPrompt.v1";
/** Hand-picked "this person is genuinely engaged" points, not every completion. */
const MILESTONE_COUNTS = [3, 10, 30, 75, 150];
const MIN_DAYS_BETWEEN_PROMPTS = 21;

type ReviewPromptState = {
  completionCount: number;
  lastPromptAtMs: number | null;
};

async function readState(): Promise<ReviewPromptState> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return { completionCount: 0, lastPromptAtMs: null };
    const parsed = JSON.parse(raw) as Partial<ReviewPromptState>;
    return {
      completionCount: typeof parsed.completionCount === "number" ? parsed.completionCount : 0,
      lastPromptAtMs: typeof parsed.lastPromptAtMs === "number" ? parsed.lastPromptAtMs : null,
    };
  } catch {
    return { completionCount: 0, lastPromptAtMs: null };
  }
}

async function writeState(state: ReviewPromptState): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Best-effort — a missed write just re-evaluates from stale state next time.
  }
}

/**
 * Call this after a genuinely positive moment (a mission or mini mission
 * completing) — never after a fail/retry. Fires at most a handful of times
 * over the app's lifetime, at hand-picked engagement milestones spaced weeks
 * apart. `StoreReview.isAvailableAsync()` already returns false on TestFlight
 * builds, so this is a safe no-op on iOS until the app is live on the App Store.
 */
export async function maybeRequestStoreReview(): Promise<void> {
  const state = await readState();
  const nextCount = state.completionCount + 1;
  const daysSinceLastPrompt = state.lastPromptAtMs
    ? (Date.now() - state.lastPromptAtMs) / 86_400_000
    : Infinity;
  const hitMilestone = MILESTONE_COUNTS.includes(nextCount);

  if (!hitMilestone || daysSinceLastPrompt < MIN_DAYS_BETWEEN_PROMPTS) {
    await writeState({ ...state, completionCount: nextCount });
    return;
  }

  try {
    const available = await StoreReview.isAvailableAsync();
    if (available) {
      await StoreReview.requestReview();
    }
  } catch {
    // Never let a review-prompt failure interrupt the completion flow.
  }
  await writeState({ completionCount: nextCount, lastPromptAtMs: Date.now() });
}
