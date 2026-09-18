import type { MiniMission } from "../types/habit";
import type { PageRequest, PageResult } from "../types/paging";
import { getSupabase } from "./supabase";
import { miniFromRow } from "./sync";

let historyPageRpcUnavailable = false;
let historyPageRpcWarned = false;
let byIdRpcUnavailable = false;
let byIdRpcWarned = false;

export type MiniMissionsHistoryPageRequest = PageRequest & {
  status?: MiniMission["status"] | null;
  query?: string | null;
};

function normalizeHistoryPagePayload(
  raw: unknown,
  offset: number,
  limit: number,
): PageResult<MiniMission> | null {
  if (!raw || typeof raw !== "object") return null;
  const payload = raw as Record<string, unknown>;
  const rows = Array.isArray(payload.items) ? payload.items : [];
  const items: MiniMission[] = [];
  for (const value of rows) {
    if (!value || typeof value !== "object") continue;
    try {
      items.push(miniFromRow(value as Record<string, unknown>));
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
 * Paginated + full-text (title/objective/completion_memory) search over the
 * signed-in user's own mini_missions history, via rpc_mini_missions_history_page_v1.
 * Returned items are plain MiniMission objects, kept in the caller's own local
 * state — never merged into useHabitStore's miniMissions array. Editing one of
 * these (e.g. revoking Community visibility) must go through
 * upsertRemoteMiniMission (sync.ts) directly, not the generic dirty-array push,
 * since that path only ever looks at what's already in the store.
 */
export async function fetchMiniMissionsHistoryPage(
  request: MiniMissionsHistoryPageRequest,
): Promise<PageResult<MiniMission> | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  if (historyPageRpcUnavailable) return null;
  const offset = Math.max(0, Math.floor(request.offset));
  const limit = Math.max(1, Math.floor(request.limit));
  const { data, error } = await supabase.rpc("rpc_mini_missions_history_page_v1", {
    p_offset: offset,
    p_limit: limit,
    p_status: request.status ?? null,
    p_query: request.query ?? null,
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
      console.warn("[habitPro] rpc_mini_missions_history_page_v1 unavailable", message);
    }
    return null;
  }
  return normalizeHistoryPagePayload(data, offset, limit);
}

/** Convenience wrapper for the search-box use case — a single generous page, no status filter. */
export async function searchMiniMissions(query: string, limit = 30): Promise<MiniMission[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const page = await fetchMiniMissionsHistoryPage({ offset: 0, limit, query: trimmed });
  return page?.items ?? [];
}

/**
 * Direct fetch of one of the signed-in user's own mini missions by id, via
 * rpc_mini_mission_by_id_v1 — the fallback for when a mini mission isn't in
 * the local store. Returns null on not-found, not-owned, or
 * RPC-unavailable — callers should treat all of those as "couldn't load,"
 * not distinguish between them.
 */
export async function fetchMiniMissionById(id: string): Promise<MiniMission | null> {
  const supabase = getSupabase();
  if (!supabase || !id) return null;
  if (byIdRpcUnavailable) return null;
  const { data, error } = await supabase.rpc("rpc_mini_mission_by_id_v1", { p_id: id });
  if (error) {
    const message = typeof error.message === "string" ? error.message : String(error);
    const code = typeof (error as { code?: unknown }).code === "string" ? (error as { code: string }).code : "";
    const schemaCacheMiss =
      code === "PGRST202" ||
      message.toLowerCase().includes("schema cache") ||
      message.toLowerCase().includes("could not find the function");
    if (schemaCacheMiss) {
      byIdRpcUnavailable = true;
    }
    if (__DEV__ && !byIdRpcWarned) {
      byIdRpcWarned = true;
      console.warn("[habitPro] rpc_mini_mission_by_id_v1 unavailable", message);
    }
    return null;
  }
  if (!data || typeof data !== "object") return null;
  try {
    return miniFromRow(data as Record<string, unknown>);
  } catch {
    return null;
  }
}
