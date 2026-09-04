import { getSupabase } from "./supabase";

/**
 * Synthetic `mini_mission_id` for habit streak-memory wins so we reuse `community_wins`
 * without a schema migration (stable per user + habit + calendar day).
 */
export function habitStreakCommunityWinId(habitId: string, memoryDateStr: string): string {
  return `habitwin:${habitId}:${memoryDateStr}`;
}

export type CommunityWinFeedSource = "mini" | "habit_streak";

/**
 * One task's photo within a habit-streak day's catalog. See docs/CATALOG_ARCHITECTURE.md.
 * Optional/nullable everywhere — absent on every post that predates the catalog feature.
 *
 * `imageUrl` is `string | null` to also cover a text-only task (a note, no photo) — but
 * Community-shared galleries (`community_wins.memory_gallery`, parsed by
 * `storyMemoryGallery` below) never actually contain one: sharing intentionally only
 * ever includes tasks with a photo. `null` only shows up in the purely local mirror of
 * this shape built for the private Journey view (`app/my-journey.tsx`), which shows
 * every logged task regardless of whether it has a photo.
 */
export type CommunityMemoryGalleryItem = {
  taskId: string;
  label: string;
  note: string | null;
  imageUrl: string | null;
};

export type CommunityWinRow = {
  id: string;
  user_id: string;
  mini_mission_id: string;
  title: string;
  completed_at: string;
  memory_note: string | null;
  memory_image_url: string | null;
  memory_gallery: CommunityMemoryGalleryItem[] | null;
  created_at: string;
  feed_source: CommunityWinFeedSource;
  streak_mission_day: number | null;
  streak_count_at_post: number | null;
  live_squad_id: string | null;
};

export type CommunityWinFeedItem = CommunityWinRow & {
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
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
  avatarUrl: string | null;
  xp: number;
  publicWins: number;
  miniWins: number;
  habitStreakWins: number;
  cheersReceived: number;
  journeyViews: number;
  recentWins: CommunityPlayerRecentWin[];
};

export type CommunityPlayerStoryPost = {
  id: string;
  title: string;
  completedAt: string;
  createdAt: string;
  memoryNote: string | null;
  memoryImageUrl: string | null;
  /** Present + non-empty means render as a swipeable catalog instead of a single image. */
  memoryGallery: CommunityMemoryGalleryItem[] | null;
  feedSource: CommunityWinFeedSource;
  streakMissionDay: number | null;
  streakCountAtPost: number | null;
  liveSquadId: string | null;
  cheerCount: number;
  viewerHasCheered: boolean;
  repairSource?: "squad" | "solo" | null;
};

export type CommunityPlayerMissionStory = {
  key: string;
  title: string;
  description?: string | null;
  postCount: number;
  photoCount: number;
  latestAt: string;
  bestStreak: number | null;
  posts: CommunityPlayerStoryPost[];
};

export type CommunityPlayerMissionJourneyPage = {
  posts: CommunityPlayerStoryPost[];
  hasMore: boolean;
};

export type CommunityPlayerWeeklyRank = {
  rankPosition: number;
  points: number;
  habitCheckIns: number;
  miniCompletions: number;
};

export type CommunityPlayerGlobalRank = {
  rankPosition: number;
  xp: number;
};

export type CommunityPlayerStory = {
  profile: CommunityPlayerProfile;
  weeklyRank: CommunityPlayerWeeklyRank | null;
  globalRank: CommunityPlayerGlobalRank | null;
  missionStories: CommunityPlayerMissionStory[];
  miniPosts: CommunityPlayerStoryPost[];
  totalPhotoMoments: number;
  hasMore?: boolean;
  missionHasMore?: boolean;
  miniHasMore?: boolean;
  missionFetchedCount?: number;
  miniFetchedCount?: number;
};

export type CommunityPlayerStoryPage = {
  missionStories: CommunityPlayerMissionStory[];
  miniPosts: CommunityPlayerStoryPost[];
  totalPhotoMoments: number;
  hasMore: boolean;
  feedSource?: CommunityWinFeedSource;
  fetchedCount?: number;
};

export type CommunityWinCheerer = {
  userId: string;
  username: string | null;
  avatarUrl: string | null;
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
  /** Catalog posts (habit_streak or checklist mini). Omit/undefined leaves the column untouched on update. */
  memoryGallery?: CommunityMemoryGalleryItem[] | null;
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
      // Omit entirely (rather than defaulting to null) when the caller doesn't pass it,
      // so every existing call site — none of which know about catalogs — leaves this
      // column completely untouched on upsert instead of clobbering it.
      ...(input.memoryGallery !== undefined ? { memory_gallery: input.memoryGallery } : {}),
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
  const supabase = getSupabase();
  if (!supabase) return;

  try {
    const { error } = await supabase.rpc("rpc_delete_habit_community_wins_v1", { p_habit_id: habit.id });
    if (!error) return;
  } catch {
    // Fall through to client-side batch delete for environments without this RPC.
  }

  const dates = new Set<string>([
    ...Object.keys(habit.streakMemories ?? {}),
    ...habit.completedDates,
  ]);
  const ids = Array.from(dates).map((dateStr) => habitStreakCommunityWinId(habit.id, dateStr));
  if (ids.length === 0) return;

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) return;

  const { error } = await supabase
    .from("community_wins")
    .delete()
    .eq("user_id", user.id)
    .in("mini_mission_id", ids);

  if (error) {
    console.warn("[habitPro] failed to delete habit community wins", error);
  }
}

/** Default page size for Community feed (fetches pageSize+1 to detect hasMore). */
export const COMMUNITY_WINS_PAGE_SIZE = 15;

export type CommunityWinsFeedPage = {
  items: CommunityWinFeedItem[];
  hasMore: boolean;
};

type CommunityFeedCursor = { createdAt: string; id: string };
const communityFeedCursorByOffset = new Map<number, CommunityFeedCursor | null>();

type CommunityFeedRpcItem = {
  win?: Partial<CommunityWinRow> | null;
  author?: {
    username?: string | null;
    displayName?: string | null;
    display_name?: string | null;
    avatarUrl?: string | null;
    xp?: number | null;
  } | null;
  cheerCount?: number | null;
  viewerHasCheered?: boolean | null;
};

function normalizeRpcCommunityWinItem(item: CommunityFeedRpcItem): CommunityWinFeedItem | null {
  const win = item.win;
  if (!win || typeof win.id !== "string" || typeof win.user_id !== "string") return null;
  const author = item.author ?? {};
  const username =
    typeof author.username === "string" && author.username.trim().length > 0
      ? author.username.trim().toLowerCase()
      : null;
  const displayRaw = author.displayName ?? author.display_name;
  return {
    id: win.id,
    user_id: win.user_id,
    mini_mission_id: typeof win.mini_mission_id === "string" ? win.mini_mission_id : "",
    title: typeof win.title === "string" ? win.title : "Community win",
    completed_at: typeof win.completed_at === "string" ? win.completed_at : new Date(0).toISOString(),
    memory_note: typeof win.memory_note === "string" ? win.memory_note : null,
    memory_image_url: typeof win.memory_image_url === "string" ? win.memory_image_url : null,
    memory_gallery: storyMemoryGallery(win.memory_gallery),
    created_at: typeof win.created_at === "string" ? win.created_at : new Date(0).toISOString(),
    feed_source: (win.feed_source ?? "mini") as CommunityWinFeedSource,
    streak_mission_day:
      typeof win.streak_mission_day === "number" && Number.isFinite(win.streak_mission_day)
        ? win.streak_mission_day
        : null,
    streak_count_at_post:
      typeof win.streak_count_at_post === "number" && Number.isFinite(win.streak_count_at_post)
        ? win.streak_count_at_post
        : null,
    live_squad_id: typeof win.live_squad_id === "string" ? win.live_squad_id : null,
    username,
    displayName: typeof displayRaw === "string" && displayRaw.trim().length > 0 ? displayRaw.trim() : null,
    avatarUrl: typeof author.avatarUrl === "string" && author.avatarUrl.trim().length > 0 ? author.avatarUrl : null,
    xp: typeof author.xp === "number" && Number.isFinite(author.xp) ? Math.max(0, author.xp) : 0,
    cheerCount:
      typeof item.cheerCount === "number" && Number.isFinite(item.cheerCount)
        ? Math.max(0, item.cheerCount)
        : 0,
    viewerHasCheered: Boolean(item.viewerHasCheered),
  };
}

async function fetchCommunityWinsFeedPageViaRpc(
  offset: number,
  pageSize: number,
): Promise<CommunityWinsFeedPage | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  if (offset === 0) {
    communityFeedCursorByOffset.clear();
    communityFeedCursorByOffset.set(0, null);
  }
  if (!communityFeedCursorByOffset.has(offset)) return null;
  const cursor = communityFeedCursorByOffset.get(offset) ?? null;
  const { data, error } = await supabase.rpc("rpc_community_feed_page_v1", {
    p_cursor_created_at: cursor?.createdAt ?? null,
    p_cursor_id: cursor?.id ?? null,
    p_limit: pageSize,
  });
  if (error || !data || typeof data !== "object") return null;

  const payload = data as {
    items?: CommunityFeedRpcItem[];
    nextCursor?: CommunityFeedCursor | null;
  };
  const items = (Array.isArray(payload.items) ? payload.items : [])
    .map(normalizeRpcCommunityWinItem)
    .filter((row): row is CommunityWinFeedItem => row !== null);
  const nextCursor = payload.nextCursor ?? null;
  communityFeedCursorByOffset.set(offset + items.length, nextCursor);
  return { items, hasMore: Boolean(nextCursor) };
}

async function enrichWinsWithProfilesAndCheers(
  wins: CommunityWinRow[],
  viewerId: string | null,
): Promise<CommunityWinFeedItem[]> {
  const supabase = getSupabase();
  if (!supabase || wins.length === 0) return [];

  const winIds = wins.map((w) => w.id);
  const userIds = [...new Set(wins.map((w) => w.user_id))];

  const [{ data: profiles }, { data: allCheers }] = await Promise.all([
    supabase.from("profiles").select("id, username, display_name, avatar_url, xp").in("id", userIds),
    supabase.from("community_win_cheers").select("win_id, user_id").in("win_id", winIds),
  ]);

  const profileByUserId = new Map<
    string,
    { username: string | null; displayName: string | null; avatarUrl: string | null; xp: number }
  >();
  for (const p of profiles ?? []) {
    const id = p.id as string;
    const u = p.username;
    const dn = p.display_name;
    const av = p.avatar_url;
    const xpRaw = p.xp;
    profileByUserId.set(id, {
      username: typeof u === "string" && u.trim().length > 0 ? u.trim().toLowerCase() : null,
      displayName: typeof dn === "string" && dn.trim().length > 0 ? dn.trim() : null,
      avatarUrl: typeof av === "string" && av.trim().length > 0 ? av : null,
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
      avatarUrl: prof?.avatarUrl ?? null,
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

  const rpcPage = await fetchCommunityWinsFeedPageViaRpc(offset, pageSize).catch(() => null);
  if (rpcPage) return rpcPage;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const viewerId = user?.id ?? null;

  const take = pageSize + 1;
  const { data: winsRaw, error: winsErr } = await supabase
    .from("community_wins")
    .select(
      "id, user_id, mini_mission_id, title, completed_at, memory_note, memory_image_url, memory_gallery, created_at, feed_source, streak_mission_day, streak_count_at_post, live_squad_id",
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

export async function fetchCommunityWinMoment(
  winId: string,
): Promise<{ ok: true; win: CommunityWinFeedItem } | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: "Cloud sync not configured." };

  const id = winId.trim();
  if (!id) return { ok: false, error: "Moment not found." };

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) return { ok: false, error: "Sign in to view this moment." };

  const { data, error } = await supabase
    .from("community_wins")
    .select(
      "id, user_id, mini_mission_id, title, completed_at, memory_note, memory_image_url, memory_gallery, created_at, feed_source, streak_mission_day, streak_count_at_post, live_squad_id",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data || typeof data.id !== "string") {
    return { ok: false, error: "This moment is no longer available." };
  }

  const row = data as Partial<CommunityWinRow>;
  const win: CommunityWinRow = {
    id: row.id,
    user_id: storyString(row.user_id),
    mini_mission_id: storyString(row.mini_mission_id),
    title: storyString(row.title, "Community win"),
    completed_at: storyString(row.completed_at, row.created_at ?? new Date(0).toISOString()),
    memory_note: typeof row.memory_note === "string" ? row.memory_note : null,
    memory_image_url: typeof row.memory_image_url === "string" ? row.memory_image_url : null,
    memory_gallery: storyMemoryGallery(row.memory_gallery),
    created_at: storyString(row.created_at, row.completed_at ?? new Date(0).toISOString()),
    feed_source: (row.feed_source ?? "mini") as CommunityWinFeedSource,
    streak_mission_day:
      typeof row.streak_mission_day === "number" && Number.isFinite(row.streak_mission_day)
        ? row.streak_mission_day
        : null,
    streak_count_at_post:
      typeof row.streak_count_at_post === "number" && Number.isFinite(row.streak_count_at_post)
        ? row.streak_count_at_post
        : null,
    live_squad_id: typeof row.live_squad_id === "string" ? row.live_squad_id : null,
  };

  if (!win.user_id) return { ok: false, error: "This moment is no longer available." };

  const [enriched] = await enrichWinsWithProfilesAndCheers([win], user.id);
  if (!enriched) return { ok: false, error: "This moment is no longer available." };
  return { ok: true, win: enriched };
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

function storyNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : fallback;
}

function storyString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

/** Defensive parse for the `memory_gallery` jsonb column — malformed/unexpected shapes fall back to null. */
function storyMemoryGallery(value: unknown): CommunityMemoryGalleryItem[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const items = value
    .map((entry): CommunityMemoryGalleryItem | null => {
      if (!entry || typeof entry !== "object") return null;
      const taskId = (entry as { taskId?: unknown }).taskId;
      const label = (entry as { label?: unknown }).label;
      const imageUrl = (entry as { imageUrl?: unknown }).imageUrl;
      const note = (entry as { note?: unknown }).note;
      if (typeof taskId !== "string" || typeof label !== "string" || typeof imageUrl !== "string") {
        return null;
      }
      return { taskId, label, imageUrl, note: typeof note === "string" ? note : null };
    })
    .filter((entry): entry is CommunityMemoryGalleryItem => entry !== null);
  return items.length > 0 ? items : null;
}

function normalizeStoryPost(
  row: CommunityWinRow,
  cheerCount: number,
  viewerHasCheered: boolean,
): CommunityPlayerStoryPost {
  return {
    id: row.id,
    title: row.title,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    memoryNote: row.memory_note ?? null,
    memoryImageUrl: row.memory_image_url ?? null,
    memoryGallery: row.memory_gallery ?? null,
    feedSource: (row.feed_source ?? "mini") as CommunityWinFeedSource,
    streakMissionDay: row.streak_mission_day ?? null,
    streakCountAtPost: row.streak_count_at_post ?? null,
    liveSquadId: row.live_squad_id ?? null,
    cheerCount,
    viewerHasCheered,
  };
}

function habitStoryKey(row: CommunityWinRow): string {
  const syntheticParts = row.mini_mission_id.split(":");
  if (syntheticParts[0] === "habitwin" && syntheticParts[1]) {
    return `habit:${syntheticParts[1]}`;
  }
  const normalizedTitle = row.title.trim().toLowerCase();
  return normalizedTitle ? `habit-title:${normalizedTitle}` : `habit:${row.id}`;
}

function habitIdFromStoryKey(key: string): string | null {
  if (!key.startsWith("habit:")) return null;
  const habitId = key.slice("habit:".length).trim();
  return habitId || null;
}

function storyDescriptionRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw !== "string") continue;
    const description = raw.trim();
    if (description) out[key] = description;
  }
  return out;
}

async function fetchMissionDescriptionMap(
  userId: string,
  stories: readonly CommunityPlayerMissionStory[],
): Promise<Map<string, string>> {
  const habitIds = Array.from(
    new Set(stories.map((story) => habitIdFromStoryKey(story.key)).filter((id): id is string => Boolean(id))),
  );
  if (habitIds.length === 0) return new Map();

  const supabase = getSupabase();
  if (!supabase) return new Map();

  const { data: rpcData, error: rpcError } = await supabase.rpc("rpc_community_player_mission_descriptions_v1", {
    p_user_id: userId,
    p_habit_ids: habitIds,
  });
  if (!rpcError) {
    return new Map(Object.entries(storyDescriptionRecord(rpcData)));
  }

  const { data } = await supabase
    .from("habits")
    .select("id, description")
    .eq("user_id", userId)
    .in("id", habitIds);

  const descriptions = new Map<string, string>();
  for (const row of (data ?? []) as Array<{ id?: unknown; description?: unknown }>) {
    if (typeof row.id !== "string" || typeof row.description !== "string") continue;
    const description = row.description.trim();
    if (description) descriptions.set(row.id, description);
  }
  return descriptions;
}

async function enrichMissionStoriesWithDescriptions(
  userId: string,
  stories: readonly CommunityPlayerMissionStory[],
): Promise<CommunityPlayerMissionStory[]> {
  const descriptions = await fetchMissionDescriptionMap(userId, stories);
  if (descriptions.size === 0) return [...stories];

  return stories.map((story) => {
    const habitId = habitIdFromStoryKey(story.key);
    const description = habitId ? descriptions.get(habitId) : null;
    return description ? { ...story, description } : story;
  });
}

function groupMissionStories(rows: CommunityWinRow[], postsById: Map<string, CommunityPlayerStoryPost>) {
  const grouped = new Map<string, CommunityPlayerStoryPost[]>();
  for (const row of rows) {
    if ((row.feed_source ?? "mini") !== "habit_streak") continue;
    const post = postsById.get(row.id);
    if (!post) continue;
    const key = habitStoryKey(row);
    const existing = grouped.get(key) ?? [];
    existing.push(post);
    grouped.set(key, existing);
  }

  return [...grouped.entries()]
    .map(([key, posts]) => {
      const sorted = [...posts].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
      const bestStreak = sorted.reduce<number | null>((best, post) => {
        const n = post.streakCountAtPost;
        if (typeof n !== "number" || !Number.isFinite(n)) return best;
        return best === null ? n : Math.max(best, n);
      }, null);
      return {
        key,
        title: sorted[0]?.title ?? "Mission",
        description: null,
        postCount: sorted.length,
        photoCount: sorted.filter((post) => Boolean(post.memoryImageUrl)).length,
        latestAt: sorted[0]?.createdAt ?? new Date(0).toISOString(),
        bestStreak,
        posts: sorted,
      } satisfies CommunityPlayerMissionStory;
    })
    .sort((a, b) => new Date(b.latestAt).getTime() - new Date(a.latestAt).getTime());
}

function mergeStoryPosts(
  existing: CommunityPlayerStoryPost[],
  incoming: CommunityPlayerStoryPost[],
): CommunityPlayerStoryPost[] {
  const seen = new Set<string>();
  const merged: CommunityPlayerStoryPost[] = [];
  for (const post of [...existing, ...incoming]) {
    if (seen.has(post.id)) continue;
    seen.add(post.id);
    merged.push(post);
  }
  return merged.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function mergeCommunityPlayerStoryPosts(
  existing: CommunityPlayerStoryPost[],
  incoming: CommunityPlayerStoryPost[],
): CommunityPlayerStoryPost[] {
  return mergeStoryPosts(existing, incoming);
}

async function fetchCommunityPlayerRanks(
  userId: string,
): Promise<{ weeklyRank: CommunityPlayerWeeklyRank | null; globalRank: CommunityPlayerGlobalRank | null }> {
  const supabase = getSupabase();
  if (!supabase) return { weeklyRank: null, globalRank: null };

  const { data, error } = await supabase.rpc("rpc_community_player_ranks_v1", {
    p_user_id: userId,
  });
  if (error || !data || typeof data !== "object") {
    return { weeklyRank: null, globalRank: null };
  }

  const payload = data as {
    weekly?: Record<string, unknown> | null;
    global?: Record<string, unknown> | null;
  };
  const weekly = payload.weekly;
  const global = payload.global;

  return {
    weeklyRank:
      weekly && storyNumber(weekly.rankPosition) > 0
        ? {
            rankPosition: storyNumber(weekly.rankPosition),
            points: storyNumber(weekly.points),
            habitCheckIns: storyNumber(weekly.habitCheckIns),
            miniCompletions: storyNumber(weekly.miniCompletions),
          }
        : null,
    globalRank:
      global && storyNumber(global.rankPosition) > 0
        ? {
            rankPosition: storyNumber(global.rankPosition),
            xp: storyNumber(global.xp),
          }
        : null,
  };
}

export async function fetchCommunityPlayerMissionJourneyPage(input: {
  userId: string;
  missionKey: string;
  missionTitle: string;
  offset: number;
  limit?: number;
}): Promise<{ ok: true; page: CommunityPlayerMissionJourneyPage } | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: "Cloud sync not configured." };

  const pageSize = Math.max(6, Math.min(Math.floor(input.limit ?? 12), 36));
  const offset = Math.max(0, Math.floor(input.offset));

  let query = supabase
    .from("community_wins")
    .select(
      "id, user_id, mini_mission_id, title, completed_at, memory_note, memory_image_url, memory_gallery, created_at, feed_source, streak_mission_day, streak_count_at_post, live_squad_id",
    )
    .eq("user_id", input.userId)
    .eq("feed_source", "habit_streak")
    .order("created_at", { ascending: false });

  if (input.missionKey.startsWith("habit:")) {
    const habitId = input.missionKey.slice("habit:".length);
    query = habitId
      ? query.like("mini_mission_id", `habitwin:${habitId}:%`)
      : query.eq("title", input.missionTitle);
  } else if (input.missionKey.startsWith("habit-title:")) {
    query = query.eq("title", input.missionTitle);
  } else {
    query = query.eq("title", input.missionTitle);
  }

  const { data: rowsRaw, error } = await query.range(offset, offset + pageSize);
  if (error) return { ok: false, error: error.message };

  const rows = ((rowsRaw ?? []) as Partial<CommunityWinRow>[])
    .map((row) => {
      if (typeof row.id !== "string") return null;
      return {
        id: row.id,
        user_id: storyString(row.user_id, input.userId),
        mini_mission_id: storyString(row.mini_mission_id),
        title: storyString(row.title, input.missionTitle),
        completed_at: storyString(row.completed_at, row.created_at ?? new Date(0).toISOString()),
        memory_note: typeof row.memory_note === "string" ? row.memory_note : null,
        memory_image_url: typeof row.memory_image_url === "string" ? row.memory_image_url : null,
        memory_gallery: storyMemoryGallery(row.memory_gallery),
        created_at: storyString(row.created_at, row.completed_at ?? new Date(0).toISOString()),
        feed_source: (row.feed_source ?? "habit_streak") as CommunityWinFeedSource,
        streak_mission_day:
          typeof row.streak_mission_day === "number" && Number.isFinite(row.streak_mission_day)
            ? row.streak_mission_day
            : null,
        streak_count_at_post:
          typeof row.streak_count_at_post === "number" && Number.isFinite(row.streak_count_at_post)
            ? row.streak_count_at_post
            : null,
        live_squad_id: typeof row.live_squad_id === "string" ? row.live_squad_id : null,
      } satisfies CommunityWinRow;
    })
    .filter((row): row is CommunityWinRow => row !== null);

  const hasMore = rows.length > pageSize;
  const pageRows = rows.slice(0, pageSize);
  const winIds = pageRows.map((row) => row.id);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: cheersRaw } =
    winIds.length > 0
      ? await supabase.from("community_win_cheers").select("win_id, user_id").in("win_id", winIds)
      : { data: [] as Array<{ win_id: string; user_id: string }> };

  const cheerCountByWin = new Map<string, number>();
  const viewerCheered = new Set<string>();
  for (const cheer of cheersRaw ?? []) {
    const winId = (cheer as { win_id?: unknown }).win_id;
    const cheerUserId = (cheer as { user_id?: unknown }).user_id;
    if (typeof winId !== "string") continue;
    cheerCountByWin.set(winId, (cheerCountByWin.get(winId) ?? 0) + 1);
    if (typeof cheerUserId === "string" && user?.id === cheerUserId) {
      viewerCheered.add(winId);
    }
  }

  return {
    ok: true,
    page: {
      posts: pageRows.map((row) =>
        normalizeStoryPost(row, cheerCountByWin.get(row.id) ?? 0, viewerCheered.has(row.id)),
      ),
      hasMore,
    },
  };
}

export async function fetchCommunityPlayerStoryPage(input: {
  userId: string;
  offset: number;
  limit?: number;
  feedSource?: CommunityWinFeedSource;
}): Promise<{ ok: true; page: CommunityPlayerStoryPage } | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: "Cloud sync not configured." };

  const pageSize = Math.max(10, Math.min(Math.floor(input.limit ?? 48), 120));
  const offset = Math.max(0, Math.floor(input.offset));
  let query = supabase
    .from("community_wins")
    .select(
      "id, user_id, mini_mission_id, title, completed_at, memory_note, memory_image_url, memory_gallery, created_at, feed_source, streak_mission_day, streak_count_at_post, live_squad_id",
    )
    .eq("user_id", input.userId)
    .order("created_at", { ascending: false });

  if (input.feedSource) query = query.eq("feed_source", input.feedSource);

  const { data: rowsRaw, error } = await query.range(offset, offset + pageSize);

  if (error) return { ok: false, error: error.message };

  const rows = ((rowsRaw ?? []) as Partial<CommunityWinRow>[])
    .map((row) => {
      if (typeof row.id !== "string") return null;
      return {
        id: row.id,
        user_id: storyString(row.user_id, input.userId),
        mini_mission_id: storyString(row.mini_mission_id),
        title: storyString(row.title, "Community win"),
        completed_at: storyString(row.completed_at, row.created_at ?? new Date(0).toISOString()),
        memory_note: typeof row.memory_note === "string" ? row.memory_note : null,
        memory_image_url: typeof row.memory_image_url === "string" ? row.memory_image_url : null,
        memory_gallery: storyMemoryGallery(row.memory_gallery),
        created_at: storyString(row.created_at, row.completed_at ?? new Date(0).toISOString()),
        feed_source: (row.feed_source ?? "mini") as CommunityWinFeedSource,
        streak_mission_day:
          typeof row.streak_mission_day === "number" && Number.isFinite(row.streak_mission_day)
            ? row.streak_mission_day
            : null,
        streak_count_at_post:
          typeof row.streak_count_at_post === "number" && Number.isFinite(row.streak_count_at_post)
            ? row.streak_count_at_post
            : null,
        live_squad_id: typeof row.live_squad_id === "string" ? row.live_squad_id : null,
      } satisfies CommunityWinRow;
    })
    .filter((row): row is CommunityWinRow => row !== null);

  const hasMore = rows.length > pageSize;
  const pageRows = rows.slice(0, pageSize);
  const winIds = pageRows.map((row) => row.id);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: cheersRaw } =
    winIds.length > 0
      ? await supabase.from("community_win_cheers").select("win_id, user_id").in("win_id", winIds)
      : { data: [] as Array<{ win_id: string; user_id: string }> };

  const cheerCountByWin = new Map<string, number>();
  const viewerCheered = new Set<string>();
  for (const cheer of cheersRaw ?? []) {
    const winId = (cheer as { win_id?: unknown }).win_id;
    const cheerUserId = (cheer as { user_id?: unknown }).user_id;
    if (typeof winId !== "string") continue;
    cheerCountByWin.set(winId, (cheerCountByWin.get(winId) ?? 0) + 1);
    if (typeof cheerUserId === "string" && user?.id === cheerUserId) viewerCheered.add(winId);
  }

  const posts = pageRows.map((row) =>
    normalizeStoryPost(row, cheerCountByWin.get(row.id) ?? 0, viewerCheered.has(row.id)),
  );
  const postsById = new Map(posts.map((post) => [post.id, post]));
  const missionStories = await enrichMissionStoriesWithDescriptions(input.userId, groupMissionStories(pageRows, postsById));
  const miniPosts = posts.filter((post) => post.feedSource === "mini");

  return {
    ok: true,
    page: {
      missionStories,
      miniPosts,
      totalPhotoMoments: posts.filter((post) => Boolean(post.memoryImageUrl)).length,
      hasMore,
      feedSource: input.feedSource,
      fetchedCount: pageRows.length,
    },
  };
}

export async function fetchCommunityPlayerStory(
  userId: string,
  limit = 48,
): Promise<{ ok: true; story: CommunityPlayerStory } | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: "Cloud sync not configured." };

  const requestedLimit = Math.max(10, Math.min(Math.floor(limit), 120));
  const [profileResult, ranks, missionPage, miniPage] = await Promise.all([
    fetchCommunityPlayerProfile(userId),
    fetchCommunityPlayerRanks(userId),
    fetchCommunityPlayerStoryPage({ userId, offset: 0, limit: requestedLimit, feedSource: "habit_streak" }),
    fetchCommunityPlayerStoryPage({ userId, offset: 0, limit: requestedLimit, feedSource: "mini" }),
  ]);

  if (profileResult.ok === false) return profileResult;
  if (missionPage.ok === false) return missionPage;
  if (miniPage.ok === false) return miniPage;
  const missionStories = missionPage.page.missionStories;
  const miniPosts = miniPage.page.miniPosts;
  const totalPhotoMoments = [...missionStories.flatMap((story) => story.posts), ...miniPosts].filter((post) =>
    Boolean(post.memoryImageUrl),
  ).length;

  return {
    ok: true,
    story: {
      profile: profileResult.profile,
      weeklyRank: ranks.weeklyRank,
      globalRank: ranks.globalRank,
      missionStories,
      miniPosts,
      totalPhotoMoments,
      hasMore: missionPage.page.hasMore || miniPage.page.hasMore,
      missionHasMore: missionPage.page.hasMore,
      miniHasMore: miniPage.page.hasMore,
      missionFetchedCount:
        missionPage.page.fetchedCount ?? missionStories.reduce((total, story) => total + story.postCount, 0),
      miniFetchedCount: miniPage.page.fetchedCount ?? miniPosts.length,
    },
  };
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
    journeyViewsCount,
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url, xp")
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
    countCommunityJourneyViews(userId),
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
  const av = profile.avatar_url;
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
      avatarUrl: typeof av === "string" && av.trim().length > 0 ? av : null,
      xp: typeof xpRaw === "number" && Number.isFinite(xpRaw) ? Math.max(0, xpRaw) : 0,
      publicWins,
      miniWins,
      habitStreakWins,
      cheersReceived: cheersReceivedCount,
      journeyViews: journeyViewsCount,
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

async function countCommunityJourneyViews(userId: string): Promise<number> {
  const supabase = getSupabase();
  if (!supabase) return 0;

  const { data, error } = await supabase.rpc("rpc_community_journey_view_count_v1", {
    p_profile_user_id: userId,
  });
  if (error) return 0;
  return typeof data === "number" && Number.isFinite(data) ? Math.max(0, Math.floor(data)) : 0;
}

export async function recordCommunityJourneyView(
  profileUserId: string,
): Promise<{ ok: true; journeyViews: number } | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: "Cloud sync not configured." };

  const { data, error } = await supabase.rpc("rpc_record_community_journey_view_v1", {
    p_profile_user_id: profileUserId,
  });
  if (error) return { ok: false, error: error.message };

  return {
    ok: true,
    journeyViews: typeof data === "number" && Number.isFinite(data) ? Math.max(0, Math.floor(data)) : 0,
  };
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
    .select("id, username, avatar_url, xp")
    .in("id", userIds);

  if (profilesErr) return { ok: false, error: profilesErr.message };

  const profileById = new Map<string, { username: string | null; avatarUrl: string | null; xp: number }>();
  for (const p of profiles ?? []) {
    const id = p.id as string;
    const u = p.username;
    const av = p.avatar_url;
    const xpRaw = p.xp;
    const xp = typeof xpRaw === "number" && Number.isFinite(xpRaw) ? xpRaw : 0;
    profileById.set(id, {
      username: typeof u === "string" && u.trim().length > 0 ? u.trim().toLowerCase() : null,
      avatarUrl: typeof av === "string" && av.trim().length > 0 ? av : null,
      xp,
    });
  }

  const items: CommunityWinCheerer[] = (cheers ?? []).map((c) => {
    const uid = c.user_id as string;
    const prof = profileById.get(uid);
    return {
      userId: uid,
      username: prof?.username ?? null,
      avatarUrl: prof?.avatarUrl ?? null,
      xp: prof?.xp ?? 0,
      cheeredAt: (c.created_at as string | null) ?? null,
    };
  });

  return { ok: true, items };
}
