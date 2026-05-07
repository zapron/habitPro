import { getSupabase } from "./supabase";

/**
 * Synthetic `mini_mission_id` for habit streak-memory wins so we reuse `community_wins`
 * without a schema migration (stable per user + habit + calendar day).
 */
export function habitStreakCommunityWinId(habitId: string, memoryDateStr: string): string {
  return `habitwin:${habitId}:${memoryDateStr}`;
}

export type CommunityWinFeedSource = "mini" | "habit_streak";

export type CommunityWinRow = {
  id: string;
  user_id: string;
  mini_mission_id: string;
  title: string;
  completed_at: string;
  memory_note: string | null;
  memory_image_url: string | null;
  created_at: string;
  feed_source: CommunityWinFeedSource;
  streak_mission_day: number | null;
  streak_count_at_post: number | null;
  live_squad_id: string | null;
};

export type CommunityWinFeedItem = CommunityWinRow & {
  username: string | null;
  displayName: string | null;
  xp: number;
  cheerCount: number;
  viewerHasCheered: boolean;
};

export type CommunityPlayerRecentWin = {
  id: string;
  title: string;
  createdAt: string;
  completedAt: string;
  feedSource: CommunityWinFeedSource;
  streakMissionDay: number | null;
  streakCountAtPost: number | null;
};

export type CommunityPlayerProfile = {
  userId: string;
  username: string | null;
  displayName: string | null;
  xp: number;
  publicWins: number;
  miniWins: number;
  habitStreakWins: number;
  cheersReceived: number;
  recentWins: CommunityPlayerRecentWin[];
};

export type CommunityWinCheerer = {
  userId: string;
  username: string | null;
  /** Total XP from profile; used for level display. */
  xp: number;
  cheeredAt: string | null;
};

type CommunityActionFailureReason = "auth_required" | "premium_required";
type CommunityActionResult =
  | { ok: true }
  | { ok: false; error: string; reason?: CommunityActionFailureReason };

function isPremiumPolicyError(error: { code?: string; message?: string } | null | undefined): boolean {
  const msg = error?.message?.toLowerCase() ?? "";
  return error?.code === "42501" || msg.includes("row-level security") || msg.includes("violates row-level security");
}

export async function postCommunityWin(input: {
  miniMissionId: string;
  title: string;
  completedAt: string;
  memoryNote?: string | null;
  memoryImageUrl?: string | null;
  /** Default mini. habit_streak enables streak feed styling + cheer copy. */
  feedSource?: CommunityWinFeedSource;
  streakMissionDay?: number | null;
  streakCountAtPost?: number | null;
  /** Mini missions only. Shows a Live Squad badge on the public Community photo. */
  liveSquadId?: string | null;
}): Promise<CommunityActionResult> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: "Cloud sync not configured." };

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) return { ok: false, error: "Sign in to share your win.", reason: "auth_required" };

  const feedSource = input.feedSource ?? "mini";
  const streakDay =
    feedSource === "habit_streak" && typeof input.streakMissionDay === "number"
      ? input.streakMissionDay
      : null;
  const streakCount =
    feedSource === "habit_streak" && typeof input.streakCountAtPost === "number"
      ? input.streakCountAtPost
      : null;
  const liveSquadId =
    feedSource === "mini" &&
    typeof input.liveSquadId === "string" &&
    input.liveSquadId.trim().length > 0
      ? input.liveSquadId.trim()
      : null;

  const { error } = await supabase.from("community_wins").upsert(
    {
      user_id: user.id,
      mini_mission_id: input.miniMissionId,
      title: input.title,
      completed_at: input.completedAt,
      memory_note: input.memoryNote ?? null,
      memory_image_url: input.memoryImageUrl ?? null,
      feed_source: feedSource,
      streak_mission_day: streakDay,
      streak_count_at_post: streakCount,
      live_squad_id: liveSquadId,
    },
    { onConflict: "user_id,mini_mission_id" },
  );

  if (error) {
    return {
      ok: false,
      error: isPremiumPolicyError(error)
        ? "Membership is still activating. Try again in a moment."
        : error.message,
      reason: isPremiumPolicyError(error) ? "premium_required" : undefined,
    };
  }
  return { ok: true };
}

export async function deleteCommunityWin(
  miniMissionId: string,
): Promise<CommunityActionResult> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: "Cloud sync not configured." };

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) return { ok: false, error: "Sign in to update your win.", reason: "auth_required" };

  const { error } = await supabase
    .from("community_wins")
    .delete()
    .eq("user_id", user.id)
    .eq("mini_mission_id", miniMissionId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Best-effort: delete Community wins for this habit’s streak keys (`habitwin:…`).
 * Uses streak memory dates plus completed dates so orphaned rows are still removed.
 * Does not throw; callers should proceed with local habit delete even if some calls fail.
 */
export async function deleteAllCommunityWinsForHabit(habit: {
  id: string;
  streakMemories?: Record<string, unknown>;
  completedDates: string[];
}): Promise<void> {
  const dates = new Set<string>([
    ...Object.keys(habit.streakMemories ?? {}),
    ...habit.completedDates,
  ]);
  for (const dateStr of dates) {
    await deleteCommunityWin(habitStreakCommunityWinId(habit.id, dateStr));
  }
}

/** Default page size for Community feed (fetches pageSize+1 to detect hasMore). */
export const COMMUNITY_WINS_PAGE_SIZE = 15;

export type CommunityWinsFeedPage = {
  items: CommunityWinFeedItem[];
  hasMore: boolean;
};

async function enrichWinsWithProfilesAndCheers(
  wins: CommunityWinRow[],
  viewerId: string | null,
): Promise<CommunityWinFeedItem[]> {
  const supabase = getSupabase();
  if (!supabase || wins.length === 0) return [];

  const winIds = wins.map((w) => w.id);
  const userIds = [...new Set(wins.map((w) => w.user_id))];

  const [{ data: profiles }, { data: allCheers }] = await Promise.all([
    supabase.from("profiles").select("id, username, display_name, xp").in("id", userIds),
    supabase.from("community_win_cheers").select("win_id, user_id").in("win_id", winIds),
  ]);

  const profileByUserId = new Map<string, { username: string | null; displayName: string | null; xp: number }>();
  for (const p of profiles ?? []) {
    const id = p.id as string;
    const u = p.username;
    const dn = p.display_name;
    const xpRaw = p.xp;
    profileByUserId.set(id, {
      username: typeof u === "string" && u.trim().length > 0 ? u.trim().toLowerCase() : null,
      displayName: typeof dn === "string" && dn.trim().length > 0 ? dn.trim() : null,
      xp: typeof xpRaw === "number" && Number.isFinite(xpRaw) ? Math.max(0, xpRaw) : 0,
    });
  }

  const countByWin = new Map<string, number>();
  const viewerCheered = new Set<string>();
  for (const c of allCheers ?? []) {
    const wid = c.win_id as string;
    const uid = c.user_id as string;
    countByWin.set(wid, (countByWin.get(wid) ?? 0) + 1);
    if (viewerId && uid === viewerId) viewerCheered.add(wid);
  }

  return wins.map((row) => {
    const r = row as CommunityWinRow;
    const prof = profileByUserId.get(row.user_id);
    return {
      ...r,
      feed_source: (r.feed_source ?? "mini") as CommunityWinFeedSource,
      streak_mission_day: r.streak_mission_day ?? null,
      streak_count_at_post: r.streak_count_at_post ?? null,
      live_squad_id: r.live_squad_id ?? null,
      username: prof?.username ?? null,
      displayName: prof?.displayName ?? null,
      xp: prof?.xp ?? 0,
      cheerCount: countByWin.get(row.id) ?? 0,
      viewerHasCheered: viewerCheered.has(row.id),
    };
  });
}

/**
 * One page of Community wins (newest first). Requests `pageSize + 1` rows to set `hasMore` without a count query.
 */
export async function fetchCommunityWinsFeedPage(
  offset: number,
  pageSize: number = COMMUNITY_WINS_PAGE_SIZE,
): Promise<CommunityWinsFeedPage> {
  const supabase = getSupabase();
  if (!supabase) return { items: [], hasMore: false };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const viewerId = user?.id ?? null;

  const take = pageSize + 1;
  const { data: winsRaw, error: winsErr } = await supabase
    .from("community_wins")
    .select(
      "id, user_id, mini_mission_id, title, completed_at, memory_note, memory_image_url, created_at, feed_source, streak_mission_day, streak_count_at_post, live_squad_id",
    )
    .order("created_at", { ascending: false })
    .range(offset, offset + take - 1);

  if (winsErr || !winsRaw?.length) {
    return { items: [], hasMore: false };
  }

  const wins = winsRaw as CommunityWinRow[];
  const hasMore = wins.length > pageSize;
  const slice = wins.slice(0, pageSize);
  const items = await enrichWinsWithProfilesAndCheers(slice, viewerId);

  return { items, hasMore };
}

/** @deprecated Prefer fetchCommunityWinsFeedPage for pagination */
export async function fetchCommunityWinsFeed(limit = 40): Promise<CommunityWinFeedItem[]> {
  const { items } = await fetchCommunityWinsFeedPage(0, limit);
  return items;
}

export async function toggleCheer(winId: string, currentlyCheered: boolean): Promise<CommunityActionResult> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: "Cloud sync not configured." };

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) return { ok: false, error: "Sign in to cheer.", reason: "auth_required" };

  if (currentlyCheered) {
    const { error } = await supabase
      .from("community_win_cheers")
      .delete()
      .eq("win_id", winId)
      .eq("user_id", user.id);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await supabase.from("community_win_cheers").insert({
      win_id: winId,
      user_id: user.id,
    });
    if (error) {
      return {
        ok: false,
        error: isPremiumPolicyError(error)
          ? "Membership is still activating. Try again in a moment."
          : error.message,
        reason: isPremiumPolicyError(error) ? "premium_required" : undefined,
      };
    }
  }
  return { ok: true };
}

export async function fetchCommunityPlayerProfile(
  userId: string,
): Promise<{ ok: true; profile: CommunityPlayerProfile } | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: "Cloud sync not configured." };

  const [
    { data: profile, error: profileErr },
    { data: wins, error: winsErr },
    publicWinsRes,
    miniWinsRes,
    habitStreakWinsRes,
    cheersReceivedCount,
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, username, display_name, xp")
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .from("community_wins")
      .select("id, title, created_at, completed_at, feed_source, streak_mission_day, streak_count_at_post")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("community_wins")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId),
    supabase
      .from("community_wins")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("feed_source", "mini"),
    supabase
      .from("community_wins")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("feed_source", "habit_streak"),
    countCheersReceivedForUser(userId),
  ]);

  if (profileErr) return { ok: false, error: profileErr.message };
  if (winsErr) return { ok: false, error: winsErr.message };
  if (publicWinsRes.error) return { ok: false, error: publicWinsRes.error.message };
  if (miniWinsRes.error) return { ok: false, error: miniWinsRes.error.message };
  if (habitStreakWinsRes.error) return { ok: false, error: habitStreakWinsRes.error.message };
  if (!profile) return { ok: false, error: "Player not found." };

  const winRows = (wins ?? []) as Array<{
    id: string;
    title: string;
    created_at: string;
    completed_at: string;
    feed_source: CommunityWinFeedSource | null;
    streak_mission_day: number | null;
    streak_count_at_post: number | null;
  }>;

  const u = profile.username;
  const dn = profile.display_name;
  const xpRaw = profile.xp;
  const publicWins = publicWinsRes.count ?? 0;
  const habitStreakWins = habitStreakWinsRes.count ?? 0;
  const miniWins = Math.max(0, miniWinsRes.count ?? publicWins - habitStreakWins);

  return {
    ok: true,
    profile: {
      userId,
      username: typeof u === "string" && u.trim().length > 0 ? u.trim().toLowerCase() : null,
      displayName: typeof dn === "string" && dn.trim().length > 0 ? dn.trim() : null,
      xp: typeof xpRaw === "number" && Number.isFinite(xpRaw) ? Math.max(0, xpRaw) : 0,
      publicWins,
      miniWins,
      habitStreakWins,
      cheersReceived: cheersReceivedCount,
      recentWins: winRows.map((w) => ({
        id: w.id,
        title: w.title,
        createdAt: w.created_at,
        completedAt: w.completed_at,
        feedSource: (w.feed_source ?? "mini") as CommunityWinFeedSource,
        streakMissionDay: w.streak_mission_day ?? null,
        streakCountAtPost: w.streak_count_at_post ?? null,
      })),
    },
  };
}

async function countCheersReceivedForUser(userId: string): Promise<number> {
  const supabase = getSupabase();
  if (!supabase) return 0;

  const { count, error } = await supabase
    .from("community_win_cheers")
    .select("win_id, community_wins!inner(user_id)", { count: "exact", head: true })
    .eq("community_wins.user_id", userId);

  if (error) return 0;
  return count ?? 0;
}

export async function listCommunityWinCheerers(
  winId: string,
  limit = 50,
): Promise<{ ok: true; items: CommunityWinCheerer[] } | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: "Cloud sync not configured." };

  const { data: cheers, error } = await supabase
    .from("community_win_cheers")
    .select("user_id, created_at")
    .eq("win_id", winId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return { ok: false, error: error.message };

  const userIds = [...new Set((cheers ?? []).map((c) => c.user_id as string).filter(Boolean))];
  if (userIds.length === 0) return { ok: true, items: [] };

  const { data: profiles, error: profilesErr } = await supabase
    .from("profiles")
    .select("id, username, xp")
    .in("id", userIds);

  if (profilesErr) return { ok: false, error: profilesErr.message };

  const profileById = new Map<string, { username: string | null; xp: number }>();
  for (const p of profiles ?? []) {
    const id = p.id as string;
    const u = p.username;
    const xpRaw = p.xp;
    const xp = typeof xpRaw === "number" && Number.isFinite(xpRaw) ? xpRaw : 0;
    profileById.set(id, {
      username: typeof u === "string" && u.trim().length > 0 ? u.trim().toLowerCase() : null,
      xp,
    });
  }

  const items: CommunityWinCheerer[] = (cheers ?? []).map((c) => {
    const uid = c.user_id as string;
    const prof = profileById.get(uid);
    return {
      userId: uid,
      username: prof?.username ?? null,
      xp: prof?.xp ?? 0,
      cheeredAt: (c.created_at as string | null) ?? null,
    };
  });

  return { ok: true, items };
}
