/**
 * Group-mission room rules (docs/GROUP_CHALLENGE_GOVERNANCE.md, Phases 2/3).
 * `habits.require_note`/`require_photo` (and the matching keys on
 * `challenge_groups.habit_template`) are stored as two independent
 * booleans, not a tier enum — see the governance doc's model-correction
 * note for why. This file is the one place that turns those two booleans
 * back into an "Easy/Medium/Hard" label for display, so that reverse
 * mapping only ever gets written once.
 */

export type RoomRuleTier = "easy" | "medium" | "hard";

/** A lone true flag means "either satisfies" (Medium); both true means "both required" (Hard). */
export function roomRuleTierFromFlags(
  requireNote?: boolean | null,
  requirePhoto?: boolean | null,
): RoomRuleTier {
  if (requireNote && requirePhoto) return "hard";
  if (requireNote || requirePhoto) return "medium";
  return "easy";
}

export function roomRuleTierLabel(tier: RoomRuleTier): string {
  return tier === "hard" ? "Hard" : tier === "medium" ? "Medium" : "Easy";
}

/** First-person commitment line for the accept-invite confirmation step (habits only). */
export function roomRuleTierCommitmentLine(tier: RoomRuleTier): string {
  switch (tier) {
    case "hard":
      return "I'll add a note and a photo each day to check in.";
    case "medium":
      return "I'll add a note or a photo each day to check in.";
    default:
      return "I'll mark each day complete. No note or photo required.";
  }
}
