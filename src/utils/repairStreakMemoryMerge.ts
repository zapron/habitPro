import type { StreakMemory } from "../types/habit";

export const REPAIR_MEMORY_NOTE_SQUAD = "Streak saved by squad.";
export const REPAIR_MEMORY_NOTE_SOLO = "Streak repaired.";

/** Matches server `_rpc_merge_repair_streak_memory` conflict rules. */
export function mergeRepairIntoStreakMemory(
  existing: StreakMemory | undefined,
  repairSource: "squad" | "solo",
): StreakMemory {
  const note = repairSource === "squad" ? REPAIR_MEMORY_NOTE_SQUAD : REPAIR_MEMORY_NOTE_SOLO;
  const createdAt = new Date().toISOString();

  if (!existing) {
    return { note, createdAt, repairSource };
  }

  const n = existing.note?.trim() ?? "";
  const hasUserContent =
    Boolean(existing.imageUrl?.trim()) ||
    Boolean(existing.imageUri?.trim()) ||
    existing.checkInOnly === true ||
    (n.length > 0 && n !== REPAIR_MEMORY_NOTE_SQUAD && n !== REPAIR_MEMORY_NOTE_SOLO);

  if (hasUserContent) {
    return { ...existing, repairSource };
  }

  return {
    ...existing,
    note,
    createdAt: existing.createdAt || createdAt,
    repairSource,
  };
}
