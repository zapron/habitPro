import { getSupabase } from "./supabase";
import { levelFromTotalXp } from "../utils/xpLevel";

export type WeeklyLeaderboardEntry = {
  rankPosition: number;
  userId: string;
  username: string;
  displayName: string | null;
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
  xp?: number | null;
  level?: number | null;
  points?: number | null;
  habit_days?: number | null;
  mini_completions?: number | null;
};

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
  const { data, error } = await supabase.rpc("get_weekly_leaderboard", {
    p_limit: pageSize + 1,
    p_offset: Math.max(0, Math.floor(offset)),
  });
  if (error) return { ok: false, error: error.message };

  const allItems: WeeklyLeaderboardEntry[] = ((data ?? []) as WeeklyLeaderboardRow[])
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
        isMe: userId === user.id,
      };
    })
    .filter((row) => row.rankPosition > 0 && row.userId && row.username);

  return {
    ok: true,
    items: allItems.slice(0, pageSize),
    hasMore: allItems.length > pageSize,
  };
}
