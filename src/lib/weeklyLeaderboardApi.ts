import { getSupabase } from "./supabase";
import { levelFromTotalXp } from "../utils/xpLevel";

export type WeeklyLeaderboardEntry = {
  rankPosition: number;
  userId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  xp: number;
  level: number;
  points: number;
  habitCheckIns: number;
  miniCompletions: number;
  isMe: boolean;
};

export type WeeklyLeaderboardPage = {
  items: WeeklyLeaderboardEntry[];
  hasMore: boolean;
};

type WeeklyLeaderboardRow = {
  rank_position?: number | null;
  user_id?: string | null;
  username?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
  xp?: number | null;
  level?: number | null;
  points?: number | null;
  habit_days?: number | null;
  mini_completions?: number | null;
};

function errorMessage(error: unknown, fallback: string) {
  return typeof error === "object" && error !== null && "message" in error
    ? String((error as { message?: unknown }).message ?? fallback)
    : String(error || fallback);
}

function normalizeWeeklyLeaderboardRows(
  data: unknown,
  currentUserId: string,
): WeeklyLeaderboardEntry[] {
  return ((data ?? []) as WeeklyLeaderboardRow[])
    .map((row) => {
      const userId = typeof row.user_id === "string" ? row.user_id : "";
      const username = typeof row.username === "string" ? row.username.trim().toLowerCase() : "";
      const xp = typeof row.xp === "number" && Number.isFinite(row.xp) ? Math.max(0, row.xp) : 0;
      const points =
        typeof row.points === "number" && Number.isFinite(row.points)
          ? Math.max(0, row.points)
          : 0;
      return {
        rankPosition:
          typeof row.rank_position === "number" && Number.isFinite(row.rank_position)
            ? row.rank_position
            : 0,
        userId,
        username,
        displayName:
          typeof row.display_name === "string" && row.display_name.trim().length > 0
            ? row.display_name.trim()
            : null,
        avatarUrl:
          typeof row.avatar_url === "string" && row.avatar_url.trim().length > 0 ? row.avatar_url : null,
        xp,
        level:
          typeof row.level === "number" && Number.isFinite(row.level)
            ? Math.max(0, row.level)
            : levelFromTotalXp(xp),
        points,
        habitCheckIns:
          typeof row.habit_days === "number" && Number.isFinite(row.habit_days)
            ? Math.max(0, row.habit_days)
            : 0,
        miniCompletions:
          typeof row.mini_completions === "number" && Number.isFinite(row.mini_completions)
            ? Math.max(0, row.mini_completions)
            : 0,
        isMe: userId === currentUserId,
      };
    })
    .filter((row) => row.rankPosition > 0 && row.userId && row.username);
}

export async function fetchWeeklyLeaderboard(
  limit = 20,
  offset = 0,
): Promise<{ ok: true } & WeeklyLeaderboardPage | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: "Cloud sync is not configured." };

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) return { ok: false, error: "Sign in to view weekly ranks." };

  const pageSize = Math.max(1, Math.min(Math.floor(limit), 49));
  const params = {
    p_limit: pageSize + 1,
    p_offset: Math.max(0, Math.floor(offset)),
  };
  let v2Data: unknown = null;
  let v2Error: unknown = null;
  try {
    const { data, error } = await supabase.rpc("get_weekly_leaderboard_v2", params);
    v2Data = data;
    v2Error = error;
  } catch (error) {
    v2Error = error;
  }
  const { data, error } = v2Error
    ? await supabase.rpc("get_weekly_leaderboard", params)
    : { data: v2Data, error: null };
  if (error) {
    return { ok: false, error: errorMessage(error, "Could not load weekly ranks.") };
  }

  const allItems = normalizeWeeklyLeaderboardRows(data, user.id);

  return {
    ok: true,
    items: allItems.slice(0, pageSize),
    hasMore: allItems.length > pageSize,
  };
}

export async function searchWeeklyLeaderboard(
  query: string,
  limit = 15,
): Promise<{ ok: true; items: WeeklyLeaderboardEntry[] } | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: "Cloud sync is not configured." };

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) return { ok: false, error: "Sign in to search weekly ranks." };

  const q = query.trim().replace(/^@+/, "");
  if (!q) return { ok: true, items: [] };

  const pageSize = Math.max(1, Math.min(Math.floor(limit), 20));
  const { data, error } = await supabase.rpc("search_weekly_leaderboard_v1", {
    p_query: q,
    p_limit: pageSize,
  });
  if (error) {
    return { ok: false, error: errorMessage(error, "Could not search weekly ranks.") };
  }

  return {
    ok: true,
    items: normalizeWeeklyLeaderboardRows(data, user.id).slice(0, pageSize),
  };
}
