import type { Habit } from "../types/habit";
import { canonicalGroupMissionHabitStartIso } from "../utils/challengeInviteeStart";
import { calculateMissionEndDateFromStart } from "../utils/groupMissionClock";
import type {
  ChallengeGroupRow,
  ChallengeInviteRow,
  ChallengeMemberRow,
  NotificationRow,
  ProfileSearchRow,
} from "../types/groupChallenge";
import type { PageRequest, PageResult } from "../types/paging";
import { getRemoteSyncUserId } from "./syncQueue";
import { getSupabase } from "./supabase";
import {
  refreshCohortPeerHabitsCached,
  refreshCohortPeerHabitsImmediate,
  invalidateCohortPeerHabitsCache,
  ensureCohortCacheInvalidatesOnSyncSuccess,
} from "./remoteRefreshCoordinator";

ensureCohortCacheInvalidatesOnSyncSuccess();

type PremiumFailureReason = "premium_required";
type GroupActionErrorResult = { error: Error | null; reason?: PremiumFailureReason };

function isPremiumPolicyError(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  const msg = String(err.message ?? "").toLowerCase();
  return err.code === "42501" || msg.includes("premium_required") || msg.includes("row-level security");
}

function groupActionError(err: { code?: string; message?: string } | null | undefined, fallback: string): GroupActionErrorResult {
  const message = String(err?.message ?? fallback);
  return {
    error: new Error(message),
    reason: isPremiumPolicyError(err) ? "premium_required" : undefined,
  };
}

function getTz(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";
  } catch {
    return "UTC";
  }
}

/** YYYY-MM-DD in local calendar for `d`. */
function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Prefix-match on `profiles.username`; requires migration `search_profiles_by_username`. */
export async function searchProfilesByUsernamePrefix(
  prefix: string,
): Promise<ProfileSearchRow[]> {
  const supabase = getSupabase();
  if (!supabase || prefix.trim().length < 3) return [];
  const { data, error } = await supabase.rpc("search_profiles_by_username", {
    p_prefix: prefix.trim().toLowerCase(),
    p_limit: 20,
  });
  if (error) throw error;
  return (data ?? []).map(
    (r: { id: string; username: string; display_name: string | null }) => ({
      id: r.id,
      username: String(r.username),
      display_name: r.display_name,
    }),
  );
}

export async function createGroupChallengeFromHabit(
  habit: Habit,
  titleOverride?: string,
): Promise<{ group: ChallengeGroupRow; error: Error | null; reason?: PremiumFailureReason }> {
  const supabase = getSupabase();
  if (!supabase) return { group: null as unknown as ChallengeGroupRow, error: new Error("Supabase not configured") };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { group: null as unknown as ChallengeGroupRow, error: new Error("Not signed in") };

  const creatorTz = getTz();
  const startDate = localDateStr(new Date(habit.startDate));

  const habitTemplate: Record<string, unknown> = {
    title: habit.title,
    mode: habit.mode,
    totalDays: habit.totalDays,
    description: habit.description ?? null,
  };
  if (habit.mode === "manual" && typeof habit.endDate === "string" && habit.endDate.trim().length > 0) {
    habitTemplate.endDate = habit.endDate.trim();
  }

  const { data: group, error: gErr } = await supabase
    .from("challenge_groups")
    .insert({
      creator_id: user.id,
      title: titleOverride ?? `${habit.title} · group mission`,
      habit_template: habitTemplate,
      creator_timezone: creatorTz,
      start_date: startDate,
      status: "active",
    })
    .select()
    .single();

  if (gErr || !group) {
    return {
      group: null as unknown as ChallengeGroupRow,
      ...groupActionError(gErr, "create group failed"),
    };
  }

  const canonicalStartIso = canonicalGroupMissionHabitStartIso(startDate, creatorTz);
  const td = Math.max(1, habit.totalDays ?? 21);
  const nextEndDate =
    habit.mode === "manual"
      ? typeof habit.endDate === "string" && habit.endDate.trim().length > 0
        ? habit.endDate.trim()
        : calculateMissionEndDateFromStart(canonicalStartIso, td)
      : null;

  const { error: hErr } = await supabase
    .from("habits")
    .update({
      challenge_group_id: group.id,
      challenge_creator_timezone: creatorTz,
      mission_timezone: creatorTz,
      start_date: canonicalStartIso,
      end_date: nextEndDate,
    })
    .eq("user_id", user.id)
    .eq("id", habit.id);

  if (hErr) return { group: null as unknown as ChallengeGroupRow, ...groupActionError(hErr, "update habit failed") };

  const { error: mErr } = await supabase.from("challenge_members").insert({
    challenge_id: group.id,
    user_id: user.id,
    habit_id: habit.id,
    role: "creator",
  });

  if (mErr) return { group: null as unknown as ChallengeGroupRow, ...groupActionError(mErr, "join group failed") };

  return { group: group as ChallengeGroupRow, error: null };
}

export type ChallengeInviteRowStatus = ChallengeInviteRow["status"];

/**
 * Latest invite status per invitee for this challenge (newest `created_at` wins).
 * Used to block duplicate invites and show Pending / Declined / Joined in the UI.
 */
export async function listChallengeInviteeStatusesForChallenge(
  challengeId: string,
): Promise<Partial<Record<string, ChallengeInviteRowStatus>>> {
  const supabase = getSupabase();
  if (!supabase) return {};
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return {};
  const { data, error } = await supabase
    .from("challenge_invites")
    .select("invitee_id, status, created_at")
    .eq("challenge_id", challengeId)
    .in("status", ["pending", "declined", "accepted"])
    .order("created_at", { ascending: false });
  if (error) throw error;
  const out: Partial<Record<string, ChallengeInviteRowStatus>> = {};
  for (const r of data ?? []) {
    const row = r as { invitee_id: string; status: string };
    if (out[row.invitee_id]) continue;
    if (row.status === "pending" || row.status === "declined" || row.status === "accepted") {
      out[row.invitee_id] = row.status;
    }
  }
  return out;
}

/** Public usernames for cohort display (RLS: shared challenge members only). */
export async function getProfileUsernamesForIds(userIds: string[]): Promise<Record<string, string>> {
  const uniq = [...new Set(userIds)].filter(Boolean);
  if (uniq.length === 0) return {};
  const supabase = getSupabase();
  if (!supabase) return {};
  const { data, error } = await supabase.from("profiles").select("id, username").in("id", uniq);
  if (error) throw error;
  const out: Record<string, string> = {};
  for (const r of data ?? []) {
    const row = r as { id: string; username: string | null };
    const u = row.username;
    if (typeof u === "string" && u.trim().length > 0) {
      out[row.id] = u.trim().toLowerCase();
    }
  }
  return out;
}

export type ProfileLabel = { username: string; displayName: string | null; xp: number | null };

/** Usernames + optional display names for challenge participant cards. */
/** `profiles.is_premium` — set server-side (billing / admin). Used for squad custom note gate. */
export async function getProfileIsPremiumForUser(userId: string): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase || !userId) return false;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.id !== userId) return false;
  const { data, error } = await supabase.from("profiles").select("is_premium").eq("id", userId).maybeSingle();
  if (error || !data) return false;
  return Boolean((data as { is_premium?: boolean }).is_premium);
}

export async function getMyProfileIsPremium(): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  return getProfileIsPremiumForUser(user.id);
}

export async function getProfileLabelsForIds(userIds: string[]): Promise<Record<string, ProfileLabel>> {
  const uniq = [...new Set(userIds)].filter(Boolean);
  if (uniq.length === 0) return {};
  const supabase = getSupabase();
  if (!supabase) return {};
  const { data, error } = await supabase.from("profiles").select("id, username, display_name, xp").in("id", uniq);
  if (error) throw error;
  const out: Record<string, ProfileLabel> = {};
  for (const r of data ?? []) {
    const row = r as { id: string; username: string | null; display_name: string | null; xp?: number | null };
    const u = typeof row.username === "string" ? row.username.trim().toLowerCase() : "";
    if (!u) continue;
    const dn = typeof row.display_name === "string" ? row.display_name.trim() : "";
    const xp = typeof row.xp === "number" && Number.isFinite(row.xp) ? row.xp : null;
    out[row.id] = { username: u, displayName: dn.length > 0 ? dn : null, xp };
  }
  return out;
}

export async function sendChallengeInvite(
  challengeId: string,
  inviteeUserId: string,
): Promise<GroupActionErrorResult> {
  const supabase = getSupabase();
  if (!supabase) return { error: new Error("Supabase not configured") };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: new Error("Not signed in") };

  const { data: latest } = await supabase
    .from("challenge_invites")
    .select("status")
    .eq("challenge_id", challengeId)
    .eq("invitee_id", inviteeUserId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const st = latest?.status;
  if (st === "pending") {
    return {
      error: new Error(
        "There is already a pending invite to this person for this group mission.",
      ),
    };
  }
  if (st === "accepted") {
    return {
      error: new Error("This person already joined this group mission."),
    };
  }

  const { data: inviterProfile } = await supabase.from("profiles").select("username").eq("id", user.id).maybeSingle();
  const inviterUsername =
    typeof inviterProfile?.username === "string" && inviterProfile.username.trim().length > 0
      ? inviterProfile.username.trim().toLowerCase()
      : null;

  const { data: inserted, error: invErr } = await supabase
    .from("challenge_invites")
    .insert({
      challenge_id: challengeId,
      inviter_id: user.id,
      invitee_id: inviteeUserId,
      status: "pending",
    })
    .select("id")
    .single();
  if (invErr) {
    if (isPremiumPolicyError(invErr)) {
      return {
        error: new Error("Group invites are a HabitPro Community feature."),
        reason: "premium_required",
      };
    }
    const msg =
      invErr.message.toLowerCase().includes("unique") || invErr.code === "23505"
        ? "There is already a pending invite to this person for this group mission."
        : invErr.message;
    return { error: new Error(msg) };
  }

  const { error: nErr } = await supabase.rpc("rpc_insert_notification", {
    p_user_id: inviteeUserId,
    p_type: "challenge_invite",
    p_payload: {
      challenge_id: challengeId,
      invite_id: typeof inserted?.id === "string" ? inserted.id : null,
      inviter_id: user.id,
      inviter_username: inviterUsername,
    },
  });
  if (nErr) return { error: new Error(nErr.message) };

  return { error: null };
}

export async function listPendingInvitesForMe(): Promise<ChallengeInviteRow[]> {
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
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ChallengeInviteRow[];
}

/** All invites for the current user (pending, accepted, declined) — newest first within each group. */
export async function countPendingInvitesForMe(): Promise<number> {
  const supabase = getSupabase();
  if (!supabase) return 0;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return 0;
  const { count, error } = await supabase
    .from("challenge_invites")
    .select("id", { count: "exact", head: true })
    .eq("invitee_id", user.id)
    .eq("status", "pending");
  if (error) throw error;
  return count ?? 0;
}

export async function listInvitesForMe(limit = 40): Promise<ChallengeInviteRow[]> {
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
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  const rows = (data ?? []) as ChallengeInviteRow[];
  return rows.sort((a, b) => {
    const pa = a.status === "pending" ? 0 : 1;
    const pb = b.status === "pending" ? 0 : 1;
    if (pa !== pb) return pa - pb;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

export async function listInvitesForMePage(
  request: PageRequest,
): Promise<PageResult<ChallengeInviteRow>> {
  const supabase = getSupabase();
  if (!supabase) return { items: [], hasMore: false, nextOffset: null };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { items: [], hasMore: false, nextOffset: null };
  const offset = Math.max(0, Math.floor(request.offset));
  const limit = Math.max(1, Math.floor(request.limit));
  const { data, error } = await supabase
    .from("challenge_invites")
    .select("*")
    .eq("invitee_id", user.id)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit);
  if (error) throw error;
  const rows = ((data ?? []) as ChallengeInviteRow[]).sort((a, b) => {
    const pa = a.status === "pending" ? 0 : 1;
    const pb = b.status === "pending" ? 0 : 1;
    if (pa !== pb) return pa - pb;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
  const hasMore = rows.length > limit;
  return {
    items: hasMore ? rows.slice(0, limit) : rows,
    hasMore,
    nextOffset: hasMore ? offset + limit : null,
  };
}

export async function listMyChallengeGroups(): Promise<ChallengeGroupRow[]> {
  const supabase = getSupabase();
  if (!supabase) return [];
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data: mids } = await supabase.from("challenge_members").select("challenge_id").eq("user_id", user.id);
  const ids = [...new Set((mids ?? []).map((m) => m.challenge_id))];
  if (ids.length === 0) return [];
  const { data, error } = await supabase.from("challenge_groups").select("*").in("id", ids);
  if (error) throw error;
  return (data ?? []) as ChallengeGroupRow[];
}

export type ChallengePrimarySnapshot = {
  group: ChallengeGroupRow | null;
  memberIdsOrdered: string[];
  profileLabels: Record<string, ProfileLabel>;
};

function profileLabelFromRpc(raw: unknown): ProfileLabel | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const u = typeof o.username === "string" ? o.username.trim().toLowerCase() : "";
  const dn = typeof o.displayName === "string" ? o.displayName.trim() : "";
  const xp = typeof o.xp === "number" && Number.isFinite(o.xp) ? o.xp : null;
  if (!u && !dn) return null;
  return { username: u || "member", displayName: dn.length > 0 ? dn : null, xp };
}

async function fetchChallengePrimarySnapshotViaRpc(
  challengeId: string,
): Promise<ChallengePrimarySnapshot | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("rpc_challenge_snapshot_v1", {
    p_challenge_id: challengeId,
  });
  if (error) {
    if (__DEV__) console.warn("[habitPro] rpc_challenge_snapshot_v1 failed, using legacy load", error.message);
    return null;
  }
  if (!data || typeof data !== "object") return null;
  const payload = data as {
    group?: unknown;
    members?: { member?: { user_id?: string }; label?: unknown }[];
  };
  const group =
    payload.group && typeof payload.group === "object"
      ? (payload.group as ChallengeGroupRow)
      : null;
  const memberIdsOrdered: string[] = [];
  const profileLabels: Record<string, ProfileLabel> = {};
  for (const entry of payload.members ?? []) {
    const memberId =
      entry?.member && typeof entry.member.user_id === "string" ? entry.member.user_id : null;
    if (!memberId) continue;
    memberIdsOrdered.push(memberId);
    const label = profileLabelFromRpc(entry.label);
    if (label) profileLabels[memberId] = label;
  }
  return { group, memberIdsOrdered, profileLabels };
}

/** Group + members + profile labels in one round trip when RPC is available. */
export async function loadChallengePrimarySnapshot(
  challengeId: string,
): Promise<ChallengePrimarySnapshot> {
  const viaRpc = await fetchChallengePrimarySnapshotViaRpc(challengeId);
  if (viaRpc) return viaRpc;

  const [g, members] = await Promise.all([
    getChallengeGroup(challengeId),
    listChallengeMembers(challengeId),
  ]);
  const memberIdsOrdered = members.map((m) => m.user_id);
  const labels = await getProfileLabelsForIds(memberIdsOrdered);
  return { group: g, memberIdsOrdered, profileLabels: labels };
}

export async function getChallengeGroup(id: string): Promise<ChallengeGroupRow | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase.from("challenge_groups").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return (data as ChallengeGroupRow) ?? null;
}

export async function getChallengeGroupsByIds(ids: string[]): Promise<ChallengeGroupRow[]> {
  const supabase = getSupabase();
  if (!supabase) return [];
  const uniq = [...new Set(ids)].filter(Boolean);
  if (uniq.length === 0) return [];
  const { data, error } = await supabase.from("challenge_groups").select("*").in("id", uniq);
  if (error) throw error;
  return (data ?? []) as ChallengeGroupRow[];
}

export async function listChallengeMembers(challengeId: string): Promise<ChallengeMemberRow[]> {
  const supabase = getSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase.from("challenge_members").select("*").eq("challenge_id", challengeId);
  if (error) throw error;
  return (data ?? []) as ChallengeMemberRow[];
}

/**
 * Leave a group mission: removes your `challenge_members` row and deletes your linked habit on the server.
 * Call `deleteHabit` locally afterward so device state and sync match.
 */
export async function leaveChallengeGroup(challengeId: string): Promise<{ error: Error | null }> {
  const supabase = getSupabase();
  if (!supabase) return { error: new Error("Supabase not configured") };
  const { error } = await supabase.rpc("rpc_leave_challenge", { p_challenge_id: challengeId });
  if (error) return { error: new Error(error.message) };
  return { error: null };
}

export async function declineInvite(inviteId: string): Promise<{ error: Error | null }> {
  const supabase = getSupabase();
  if (!supabase) return { error: new Error("Supabase not configured") };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: new Error("Not signed in") };

  const { data: invite, error: fetchErr } = await supabase
    .from("challenge_invites")
    .select("id, challenge_id, inviter_id, invitee_id, status")
    .eq("id", inviteId)
    .eq("invitee_id", user.id)
    .maybeSingle();
  if (fetchErr) return { error: new Error(fetchErr.message) };
  if (!invite || invite.status !== "pending") {
    return { error: new Error("Invite not found or already resolved.") };
  }

  const { error } = await supabase.from("challenge_invites").update({ status: "declined" }).eq("id", inviteId);
  if (error) return { error: new Error(error.message) };

  const { data: inviteeProfile } = await supabase.from("profiles").select("username").eq("id", user.id).maybeSingle();
  const inviteeUsername =
    typeof inviteeProfile?.username === "string" && inviteeProfile.username.trim().length > 0
      ? inviteeProfile.username.trim().toLowerCase()
      : null;

  const { error: nErr } = await supabase.rpc("rpc_insert_notification", {
    p_user_id: invite.inviter_id,
    p_type: "challenge_invite_declined",
    p_payload: {
      challenge_id: invite.challenge_id,
      invite_id: invite.id,
      invitee_id: user.id,
      invitee_username: inviteeUsername,
    },
  });
  if (nErr && __DEV__) console.warn("[notifications] challenge_invite_declined", nErr.message);

  return { error: null };
}

/**
 * After invitee creates a local habit with `challengeGroupId` / `challengeCreatorTimezone`
 * set and has synced to Supabase, call this to record membership and close the invite.
 */
export async function acceptInviteAndJoin(
  invite: ChallengeInviteRow,
  newHabitId: string,
): Promise<GroupActionErrorResult> {
  const supabase = getSupabase();
  if (!supabase) return { error: new Error("Supabase not configured") };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: new Error("Not signed in") };

  const { error: mErr } = await supabase.from("challenge_members").insert({
    challenge_id: invite.challenge_id,
    user_id: user.id,
    habit_id: newHabitId,
    role: "member",
  });
  if (mErr && (mErr as { code?: string }).code !== "23505") {
    return groupActionError(mErr, "Could not join group mission.");
  }

  const { error: iErr } = await supabase
    .from("challenge_invites")
    .update({ status: "accepted" })
    .eq("id", invite.id);
  if (iErr) return { error: new Error(iErr.message) };

  const { data: inviteeProfile } = await supabase.from("profiles").select("username").eq("id", user.id).maybeSingle();
  const inviteeUsername =
    typeof inviteeProfile?.username === "string" && inviteeProfile.username.trim().length > 0
      ? inviteeProfile.username.trim().toLowerCase()
      : null;

  const { error: nErr } = await supabase.rpc("rpc_insert_notification", {
    p_user_id: invite.inviter_id,
    p_type: "challenge_invite_accepted",
    p_payload: {
      challenge_id: invite.challenge_id,
      invite_id: invite.id,
      invitee_id: user.id,
      invitee_username: inviteeUsername,
      habit_id: newHabitId,
    },
  });
  if (nErr && __DEV__) console.warn("[notifications] challenge_invite_accepted", nErr.message);

  return { error: null };
}

export async function listNotifications(limit = 40): Promise<NotificationRow[]> {
  const supabase = getSupabase();
  if (!supabase) return [];
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as NotificationRow[];
}

export async function listNotificationsPage(
  request: PageRequest,
): Promise<PageResult<NotificationRow>> {
  const supabase = getSupabase();
  if (!supabase) return { items: [], hasMore: false, nextOffset: null };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { items: [], hasMore: false, nextOffset: null };
  const offset = Math.max(0, Math.floor(request.offset));
  const limit = Math.max(1, Math.floor(request.limit));
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit);
  if (error) throw error;
  const rows = (data ?? []) as NotificationRow[];
  const hasMore = rows.length > limit;
  return {
    items: hasMore ? rows.slice(0, limit) : rows,
    hasMore,
    nextOffset: hasMore ? offset + limit : null,
  };
}

export async function countUnreadNotifications(): Promise<number> {
  const supabase = getSupabase();
  if (!supabase) return 0;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return 0;
  const { count, error } = await supabase
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id)
    .is("read_at", null);
  if (error) throw error;
  return count ?? 0;
}

export async function markNotificationRead(id: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;
  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id);
}

export async function markAllNotificationsRead(): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("read_at", null);
}

/** Re-fetch cohort peer habits (uncached; use after join/accept). */
export async function refreshCohortPeerHabits(): Promise<void> {
  await refreshCohortPeerHabitsImmediate();
}

export { refreshCohortPeerHabitsCached, invalidateCohortPeerHabitsCache };

export {
  listChallengeActivity,
  listChallengeActivityPage,
  listRecentNudges,
  listRecentNudgesPage,
  sendChallengeNudge,
  tryRecordChallengeMilestones,
} from "./challengeCohort";
