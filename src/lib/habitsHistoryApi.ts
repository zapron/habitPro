import type { Habit, MissionReport } from "../types/habit";
import type { PageRequest, PageResult } from "../types/paging";
import { getSupabase } from "./supabase";
import { habitFromRow } from "./sync";

let historyPageRpcUnavailable = false;
let historyPageRpcWarned = false;

export type HabitsHistoryPageRequest = PageRequest & {
  status?: MissionReport | null;
};

function normalizeHistoryPagePayload(
  raw: unknown,
  offset: number,
  limit: number,
): PageResult<Habit> | null {
  if (!raw || typeof raw !== "object") return null;
  const payload = raw as Record<string, unknown>;
  const rows = Array.isArray(payload.items) ? payload.items : [];
  const items: Habit[] = [];
  for (const value of rows) {
    if (!value || typeof value !== "object") continue;
    try {
      items.push(habitFromRow(value as Parameters<typeof habitFromRow>[0]));
    } catch {
      // Skip a single malformed row rather than failing the whole page.
    }
  }
  const hasMore = typeof payload.hasMore === "boolean" ? payload.hasMore : items.length > limit;
  const nextOffset =
    typeof payload.nextOffset === "number" && Number.isFinite(payload.nextOffset)
      ? payload.nextOffset
      : hasMore
        ? offset + limit
        : null;
  return { items, hasMore, nextOffset };
}

/**
 * Paginated fetch over the signed-in user's own habits (main missions)
 * history, via rpc_habits_history_page_v1. p_status filters on the stored
 * mission_report/is_completed/status columns directly — a proxy for the
 * client-derived accomplished/failed split (see the migration's comment),
 * not an exact replay of habitFromRow's full derivation logic.
 * Returned items are plain Habit objects, kept in the caller's own local
 * state — never merged into useHabitStore's habits array. Editing one of
 * these must go through upsertRemoteHabit (sync.ts) directly, not the
 * generic dirty-array push, since that path only ever looks at what's
 * already in the store.
 */
export async function fetchHabitsHistoryPage(
  request: HabitsHistoryPageRequest,
): Promise<PageResult<Habit> | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  if (historyPageRpcUnavailable) return null;
  const offset = Math.max(0, Math.floor(request.offset));
  const limit = Math.max(1, Math.floor(request.limit));
  const { data, error } = await supabase.rpc("rpc_habits_history_page_v1", {
    p_offset: offset,
    p_limit: limit,
    p_status: request.status ?? null,
  });
  if (error) {
    const message = typeof error.message === "string" ? error.message : String(error);
    const code = typeof (error as { code?: unknown }).code === "string" ? (error as { code: string }).code : "";
    const schemaCacheMiss =
      code === "PGRST202" ||
      message.toLowerCase().includes("schema cache") ||
      message.toLowerCase().includes("could not find the function");
    if (schemaCacheMiss) {
      historyPageRpcUnavailable = true;
    }
    if (__DEV__ && !historyPageRpcWarned) {
      historyPageRpcWarned = true;
      console.warn("[habitPro] rpc_habits_history_page_v1 unavailable", message);
    }
    return null;
  }
  return normalizeHistoryPagePayload(data, offset, limit);
}
