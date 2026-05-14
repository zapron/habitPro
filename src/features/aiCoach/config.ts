const ENABLED_VALUES = new Set(["1", "true", "yes", "on"]);

export const AI_COACH_FEATURE_FLAG = "EXPO_PUBLIC_AI_COACH_ENABLED";

export function isAiCoachEnabled(): boolean {
  return ENABLED_VALUES.has(
    String(process.env.EXPO_PUBLIC_AI_COACH_ENABLED ?? "")
      .trim()
      .toLowerCase(),
  );
}

