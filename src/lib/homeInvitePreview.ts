import { getSupabase } from "./supabase";
import { getChallengeGroupsByIds, getProfileLabelsForIds, groupInviteVisibleSinceIso } from "./groupChallengesApi";
import { isLiveMiniInviteActionable, listLiveMiniInvitesForMePage } from "./liveMiniMissionsApi";
import type { ChallengeInviteRow } from "../types/groupChallenge";

/**
 * Fresh invites for the Home card. The Invites tab keeps every pending invite
 * forever, but Home only nudges about ones still worth acting on:
 * - group missions: inside the visible window (see groupInviteVisibleSinceIso) and still active;
 * - Live Squads: not expired yet (no expiry stamped → invited in the last day).
 */
const HOME_LIVE_INVITE_NO_EXPIRY_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type HomeInvitePreview = {
  kind: "group" | "live";
  /** challenge_invites.id for a group invite, live_mini_squads.id for a Live Squad. */
  id: string;
  title: string;
  inviterUsername: string | null;
  /** Live Squad planned length, minutes. */
  plannedMinutes: number | null;
  expiresAt: string | null;
  createdAt: string;
};

function groupInviteTitle(habitTemplate: Record<string, unknown>, fallback: string): string {
  const tplTitle = typeof habitTemplate.title === "string" ? habitTemplate.title.trim() : "";
  if (tplTitle) return tplTitle;
  const first = fallback.split(/\s*[—–]\s/)[0]?.trim();
  return first || "Group mission";
}

async function fetchFreshGroupInvites(nowMs: number): Promise<HomeInvitePreview[]> {
  const supabase = getSupabase();
  if (!supabase) return [];
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from("challenge_invites")
    .select("*")
    .eq("invitee_id", user.id)
    .eq("status", "pending")
    .gte("created_at", groupInviteVisibleSinceIso(nowMs))
    .order("created_at", { ascending: false })
    .limit(10);
  if (error) throw error;
  const rows = (data ?? []) as ChallengeInviteRow[];
  if (rows.length === 0) return [];

  const [groups, labels] = await Promise.all([
    getChallengeGroupsByIds(rows.map((r) => r.challenge_id)),
    getProfileLabelsForIds(rows.map((r) => r.inviter_id)),
  ]);
  const groupById = new Map(groups.map((g) => [g.id, g]));
  const out: HomeInvitePreview[] = [];
  for (const r of rows) {
    const group = groupById.get(r.challenge_id);
    if (!group || group.status !== "active") continue;
    out.push({
      kind: "group",
      id: r.id,
      title: groupInviteTitle(group.habit_template ?? {}, group.title),
      inviterUsername: labels[r.inviter_id]?.username ?? null,
      plannedMinutes: null,
      expiresAt: null,
      createdAt: r.created_at,
    });
  }
  return out;
}

async function fetchFreshLiveInvites(nowMs: number): Promise<HomeInvitePreview[]> {
  const page = await listLiveMiniInvitesForMePage({ offset: 0, limit: 10 });
  return page.items
    .filter((inv) => {
      if (!isLiveMiniInviteActionable(inv.participant, nowMs)) return false;
      if (inv.participant.invite_expires_at) return true;
      return nowMs - new Date(inv.participant.created_at).getTime() < HOME_LIVE_INVITE_NO_EXPIRY_MAX_AGE_MS;
    })
    .map((inv) => ({
      kind: "live" as const,
      id: inv.squad.id,
      title: inv.squad.title || "Live Squad",
      inviterUsername: inv.creator?.username ?? null,
      plannedMinutes: inv.participant.planned_minutes,
      expiresAt: inv.participant.invite_expires_at,
      createdAt: inv.participant.created_at,
    }));
}

/** Newest first. Live Squads that are about to expire go ahead of everything. */
export async function fetchHomeInvitePreviews(nowMs = Date.now()): Promise<HomeInvitePreview[]> {
  const [groupInvites, liveInvites] = await Promise.all([
    fetchFreshGroupInvites(nowMs).catch(() => []),
    fetchFreshLiveInvites(nowMs).catch(() => []),
  ]);
  const byNewest = (a: HomeInvitePreview, b: HomeInvitePreview) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  return [...liveInvites.sort(byNewest), ...groupInvites.sort(byNewest)];
}
