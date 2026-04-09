import { getSupabase } from "./supabase";

export type CommunityWinRow = {
  id: string;
  user_id: string;
  mini_mission_id: string;
  title: string;
  completed_at: string;
  memory_note: string | null;
  memory_image_url: string | null;
  created_at: string;
};

export type CommunityWinFeedItem = CommunityWinRow & {
  username: string | null;
  cheerCount: number;
  viewerHasCheered: boolean;
};

export async function postCommunityWin(input: {
  miniMissionId: string;
  title: string;
  completedAt: string;
  memoryNote?: string | null;
  memoryImageUrl?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: "Cloud sync not configured." };

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) return { ok: false, error: "Sign in to share your win." };

  const { error } = await supabase.from("community_wins").upsert(
    {
      user_id: user.id,
      mini_mission_id: input.miniMissionId,
      title: input.title,
      completed_at: input.completedAt,
      memory_note: input.memoryNote ?? null,
      memory_image_url: input.memoryImageUrl ?? null,
    },
    { onConflict: "user_id,mini_mission_id" },
  );

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function deleteCommunityWin(
  miniMissionId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: "Cloud sync not configured." };

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) return { ok: false, error: "Sign in to update your win." };

  const { error } = await supabase
    .from("community_wins")
    .delete()
    .eq("user_id", user.id)
    .eq("mini_mission_id", miniMissionId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function fetchCommunityWinsFeed(limit = 40): Promise<CommunityWinFeedItem[]> {
  const supabase = getSupabase();
  if (!supabase) return [];

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const viewerId = user?.id ?? null;

  const { data: wins, error: winsErr } = await supabase
    .from("community_wins")
    .select("id, user_id, mini_mission_id, title, completed_at, memory_note, memory_image_url, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (winsErr || !wins?.length) return [];

  const winIds = wins.map((w) => w.id as string);
  const userIds = [...new Set(wins.map((w) => w.user_id as string))];

  const [{ data: profiles }, { data: allCheers }] = await Promise.all([
    supabase.from("profiles").select("id, username").in("id", userIds),
    supabase.from("community_win_cheers").select("win_id, user_id").in("win_id", winIds),
  ]);

  const usernameByUserId = new Map<string, string | null>();
  for (const p of profiles ?? []) {
    const id = p.id as string;
    const u = p.username;
    usernameByUserId.set(
      id,
      typeof u === "string" && u.trim().length > 0 ? u.trim().toLowerCase() : null,
    );
  }

  const countByWin = new Map<string, number>();
  const viewerCheered = new Set<string>();
  for (const c of allCheers ?? []) {
    const wid = c.win_id as string;
    const uid = c.user_id as string;
    countByWin.set(wid, (countByWin.get(wid) ?? 0) + 1);
    if (viewerId && uid === viewerId) viewerCheered.add(wid);
  }

  return wins.map((w) => {
    const row = w as CommunityWinRow;
    return {
      ...row,
      username: usernameByUserId.get(row.user_id) ?? null,
      cheerCount: countByWin.get(row.id) ?? 0,
      viewerHasCheered: viewerCheered.has(row.id),
    };
  });
}

export async function toggleCheer(winId: string, currentlyCheered: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: "Cloud sync not configured." };

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) return { ok: false, error: "Sign in to cheer." };

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
    if (error) return { ok: false, error: error.message };
  }
  return { ok: true };
}
