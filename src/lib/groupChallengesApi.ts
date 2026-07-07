import type { Habit } from "../types/habit";
import { canonicalGroupMissionHabitStartIso } from "../utils/challengeInviteeStart";
import { alignGroupHabitToChallengeStart, calculateMissionEndDateFromStart } from "../utils/groupMissionClock";
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
import { fetchCommunityAccessStatusForCurrentUser } from "./communityAccessApi";

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
export type ChallengeInviteeStatus = ChallengeInviteRowStatus | "left";

/**
 * Latest invite status per invitee for this challenge (newest `created_at` wins).
 * Used to block duplicate invites and show Pending / Declined / Joined in the UI.
 */
export async function listChallengeInviteeStatusesForChallenge(
  challengeId: string,
): Promise<Partial<Record<string, ChallengeInviteeStatus>>> {
  const supabase = getSupabase();
  if (!supabase) return {};
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return {};

  const { data: members, error: membersErr } = await supabase
    .from("challenge_members")
    .select("user_id")
    .eq("challenge_id", challengeId);
  if (membersErr) throw membersErr;
  const activeMemberIds = new Set(
    (members ?? [])
      .map((r) => (r as { user_id?: string | null }).user_id)
      .filter((id): id is string => typeof id === "string" && id.length > 0),
  );

  const { data, error } = await supabase
    .from("challenge_invites")
    .select("invitee_id, status, created_at")
    .eq("challenge_id", challengeId)
    .in("status", ["pending", "declined", "accepted"])
    .order("created_at", { ascending: false });
  if (error) throw error;
  const out: Partial<Record<string, ChallengeInviteeStatus>> = {};
  for (const r of data ?? []) {
    const row = r as { invitee_id: string; status: string };
    if (out[row.invitee_id]) continue;
    if (activeMemberIds.has(row.invitee_id)) {
      out[row.invitee_id] = "accepted";
      continue;
    }
    if (row.status === "pending" || row.status === "declined" || row.status === "accepted") {
      out[row.invitee_id] = row.status === "accepted" ? "left" : row.status;
    }
  }
  for (const memberId of activeMemberIds) {
    if (memberId !== user.id && !out[memberId]) out[memberId] = "accepted";
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
/** Effective Community access: paid subscription/admin grant OR active backend trial. */
export async function getProfileIsPremiumForUser(userId: string): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase || !userId) return false;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.id !== userId) return false;
  const status = await fetchCommunityAccessStatusForCurrentUser();
  return status?.hasAccess === true;
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
  const { error } = await supabase.rpc("rpc_send_challenge_invite_v1", {
    p_challenge_id: challengeId,
    p_invitee_user_id: inviteeUserId,
  });
  if (!error) return { error: null };

  if (isPremiumPolicyError(error)) {
    return {
      error: new Error("Group invites are a HabitPro Community feature."),
      reason: "premium_required",
    };
  }
  const low = error.message.toLowerCase();
  if (low.includes("already_joined")) {
    return {
      error: new Error("This person already joined this group mission."),
    };
  }
  if (low.includes("invite_already_pending") || error.code === "23505") {
    return {
      error: new Error("There is already a pending invite to this person for this group mission."),
    };
  }
  return { error: new Error(error.message) };
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

export type ChallengeStreakMemberPageItem = {
  memberId: string;
  label?: ProfileLabel;
  habit?: Habit;
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
/**
 * Last successful primary snapshot per challenge, kept in memory so the cohort
 * screen can paint instantly on revisit and refresh in the background instead of
 * blocking on a network round trip behind a spinner. Lives for the app session.
 */
const primarySnapshotCache = new Map<string, ChallengePrimarySnapshot>();
const primarySnapshotInFlight = new Map<string, Promise<ChallengePrimarySnapshot>>();
const streakMembersPageCache = new Map<string, PageResult<ChallengeStreakMemberPageItem>>();
const streakMembersPageInFlight = new Map<string, Promise<PageResult<ChallengeStreakMemberPageItem>>>();
let challengeStreakMembersPageRpcUnavailable = false;
let challengeStreakMembersPageRpcWarned = false;

/** Synchronous read of the last known snapshot for instant first paint (may be stale). */
export function getCachedChallengePrimarySnapshot(
  challengeId: string,
): ChallengePrimarySnapshot | null {
  return primarySnapshotCache.get(challengeId) ?? null;
}

function streakMembersPageCacheKey(challengeId: string, offset: number, limit: number): string {
  return `${challengeId}:${offset}:${limit}`;
}

export function getCachedChallengeStreakMembersPage(
  challengeId: string,
  request: PageRequest,
): PageResult<ChallengeStreakMemberPageItem> | null {
  const offset = Math.max(0, Math.floor(request.offset));
  const limit = Math.max(1, Math.floor(request.limit));
  return streakMembersPageCache.get(streakMembersPageCacheKey(challengeId, offset, limit)) ?? null;
}

export async function loadChallengePrimarySnapshot(
  challengeId: string,
): Promise<ChallengePrimarySnapshot> {
  const inFlight = primarySnapshotInFlight.get(challengeId);
  if (inFlight) return inFlight;

  const request = (async () => {
    const viaRpc = await fetchChallengePrimarySnapshotViaRpc(challengeId);
    if (viaRpc) {
      primarySnapshotCache.set(challengeId, viaRpc);
      return viaRpc;
    }

    const [g, members] = await Promise.all([
      getChallengeGroup(challengeId),
      listChallengeMembers(challengeId),
    ]);
    const memberIdsOrdered = members.map((m) => m.user_id);
    const labels = await getProfileLabelsForIds(memberIdsOrdered);
    const snapshot: ChallengePrimarySnapshot = { group: g, memberIdsOrdered, profileLabels: labels };
    primarySnapshotCache.set(challengeId, snapshot);
    return snapshot;
  })().finally(() => {
    primarySnapshotInFlight.delete(challengeId);
  });

  primarySnapshotInFlight.set(challengeId, request);
  return request;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((x): x is string => typeof x === "string") : [];
}

function missionVisibility(value: unknown): Habit["visibility"] {
  return value === "public" || value === "solo" ? value : "solo";
}

function habitMode(value: unknown): Habit["mode"] {
  return value === "manual" ? "manual" : "autopilot";
}

function habitStatus(value: unknown): Habit["status"] {
  return value === "completed" || value === "failed" || value === "active" ? value : "active";
}

function missionReport(value: unknown): Habit["missionReport"] | undefined {
  return value === "accomplished" || value === "failed" ? value : undefined;
}

function streakMemories(value: unknown): Habit["streakMemories"] | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Habit["streakMemories"];
}

function streakMemoryMarkers(value: unknown): Habit["streakMemoryMarkers"] | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const out: NonNullable<Habit["streakMemoryMarkers"]> = {};
  for (const [dateStr, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const row = raw as Record<string, unknown>;
    const hasPhoto =
      row.hasPhoto === true ||
      (typeof row.imageUrl === "string" && row.imageUrl.trim().length > 0) ||
      (typeof row.imageUri === "string" && row.imageUri.trim().length > 0);
    const hasNote =
      row.hasNote === true ||
      (typeof row.note === "string" && row.note.trim().length > 0);
    const checkInOnly = row.checkInOnly === true;
    const createdAt =
      typeof row.createdAt === "string" && row.createdAt.trim().length > 0
        ? row.createdAt.trim()
        : null;
    if (hasPhoto || hasNote || checkInOnly || createdAt) {
      out[dateStr] = { hasPhoto, hasNote, checkInOnly, createdAt };
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function lightweightHabitFromRpc(
  raw: unknown,
  challengeId: string,
  groupMeta?: { startDate?: unknown; habitTemplate?: unknown },
): Habit | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const row = raw as Record<string, unknown>;
  const id = typeof row.id === "string" ? row.id : "";
  const ownerUserId = typeof row.user_id === "string" ? row.user_id : null;
  if (!id || !ownerUserId) return undefined;
  const totalDays =
    typeof row.total_days === "number" && Number.isFinite(row.total_days)
      ? Math.max(1, Math.floor(row.total_days))
      : 21;
  const completedDates = stringArray(row.completed_dates);
  const streak =
    typeof row.streak === "number" && Number.isFinite(row.streak)
      ? Math.max(0, Math.floor(row.streak))
      : 0;
  const habit: Habit = {
    ownerUserId,
    id,
    title: typeof row.title === "string" && row.title.trim() ? row.title : "Group mission",
    description: typeof row.description === "string" && row.description.trim() ? row.description : undefined,
    mode: habitMode(row.mode),
    visibility: missionVisibility(row.visibility),
    startDate: typeof row.start_date === "string" ? row.start_date : new Date().toISOString(),
    endDate: typeof row.end_date === "string" ? row.end_date : undefined,
    completedDates,
    streak,
    totalDays,
    isCompleted: row.is_completed === true,
    status: habitStatus(row.status),
    missionReport: missionReport(row.mission_report),
    missionReportAt: typeof row.mission_report_at === "string" ? row.mission_report_at : undefined,
    challengeGroupId: typeof row.challenge_group_id === "string" ? row.challenge_group_id : challengeId,
    challengeCreatorTimezone:
      typeof row.challenge_creator_timezone === "string" ? row.challenge_creator_timezone : null,
    missionTimezone: typeof row.mission_timezone === "string" ? row.mission_timezone : null,
    streakMemories: streakMemories(row.streak_memories),
    streakMemoryMarkers: streakMemoryMarkers(row.streak_memory_markers) ?? streakMemoryMarkers(row.streak_memories),
    repairedDates: [],
    reminderEnabled: false,
    reminderTimeLocal: null,
    reminderLocked: false,
  };

  const groupStart = typeof groupMeta?.startDate === "string" ? groupMeta.startDate : null;
  const template =
    groupMeta?.habitTemplate && typeof groupMeta.habitTemplate === "object"
      ? (groupMeta.habitTemplate as Record<string, unknown>)
      : null;
  return groupStart ? alignGroupHabitToChallengeStart(habit, groupStart, template) : habit;
}

function normalizeStreakMembersPayload(
  raw: unknown,
  challengeId: string,
  offset: number,
  limit: number,
): PageResult<ChallengeStreakMemberPageItem> | null {
  if (!raw || typeof raw !== "object") return null;
  const payload = raw as Record<string, unknown>;
  const rows = Array.isArray(payload.items) ? payload.items : [];
  const group = payload.group && typeof payload.group === "object" ? payload.group as Record<string, unknown> : undefined;
  const items: ChallengeStreakMemberPageItem[] = [];
  for (const value of rows) {
    if (!value || typeof value !== "object") continue;
    const row = value as Record<string, unknown>;
    const memberId = typeof row.memberId === "string" ? row.memberId : "";
    if (!memberId) continue;
    const label = profileLabelFromRpc(row.label) ?? undefined;
    const habit = lightweightHabitFromRpc(row.habit, challengeId, {
      startDate: group?.startDate,
      habitTemplate: group?.habitTemplate,
    });
    items.push({ memberId, label, habit });
  }
  const hasMore =
    typeof payload.hasMore === "boolean"
      ? payload.hasMore
      : items.length > limit;
  const nextOffset =
    typeof payload.nextOffset === "number" && Number.isFinite(payload.nextOffset)
      ? payload.nextOffset
      : hasMore
        ? offset + limit
        : null;
  return { items, hasMore, nextOffset };
}

async function listChallengeStreakMembersPageViaRpc(
  challengeId: string,
  request: PageRequest,
): Promise<PageResult<ChallengeStreakMemberPageItem> | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  if (challengeStreakMembersPageRpcUnavailable) return null;
  const offset = Math.max(0, Math.floor(request.offset));
  const limit = Math.max(1, Math.floor(request.limit));
  const { data, error } = await supabase.rpc("rpc_challenge_streak_members_page_v1", {
    p_challenge_id: challengeId,
    p_offset: offset,
    p_limit: limit,
  });
  if (error) {
    const message = typeof error.message === "string" ? error.message : String(error);
    const code = typeof (error as { code?: unknown }).code === "string" ? (error as { code: string }).code : "";
    const schemaCacheMiss =
      code === "PGRST202" ||
      message.toLowerCase().includes("schema cache") ||
      message.toLowerCase().includes("could not find the function");
    if (schemaCacheMiss) {
      challengeStreakMembersPageRpcUnavailable = true;
    }
    if (__DEV__ && !challengeStreakMembersPageRpcWarned) {
      challengeStreakMembersPageRpcWarned = true;
      console.warn("[habitPro] rpc_challenge_streak_members_page_v1 unavailable, using legacy load", message);
    }
    return null;
  }
  return normalizeStreakMembersPayload(data, challengeId, offset, limit);
}

const LIGHTWEIGHT_HABIT_ROW_SELECT =
  "user_id, id, title, description, mode, visibility, start_date, end_date, completed_dates, streak, total_days, is_completed, status, challenge_group_id, challenge_creator_timezone, mission_timezone, mission_report, mission_report_at";
const PAGE_HABIT_ROW_SELECT = `${LIGHTWEIGHT_HABIT_ROW_SELECT}, streak_memories`;

export async function listChallengeStreakMembersPage(
  challengeId: string,
  request: PageRequest & { cache?: "prefer" | "bypass" },
): Promise<PageResult<ChallengeStreakMemberPageItem>> {
  const supabase = getSupabase();
  const offset = Math.max(0, Math.floor(request.offset));
  const limit = Math.max(1, Math.floor(request.limit));
  if (!supabase) return { items: [], hasMore: false, nextOffset: null };
  const cacheKey = streakMembersPageCacheKey(challengeId, offset, limit);
  if (request.cache !== "bypass") {
    const cached = streakMembersPageCache.get(cacheKey);
    if (cached) return cached;
    const inFlight = streakMembersPageInFlight.get(cacheKey);
    if (inFlight) return inFlight;
  }

  const requestPromise = (async () => {
    const viaRpc = await listChallengeStreakMembersPageViaRpc(challengeId, { offset, limit });
    if (viaRpc) {
      streakMembersPageCache.set(cacheKey, viaRpc);
      return viaRpc;
    }

    const group = await getChallengeGroup(challengeId);
    const members = await listChallengeMembers(challengeId);
    const habitIds = [...new Set(members.map((m) => m.habit_id).filter((id): id is string => Boolean(id)))];
    const labels = await getProfileLabelsForIds(members.map((m) => m.user_id));
    const habitRows =
      habitIds.length > 0
        ? await supabase
            .from("habits")
            .select(LIGHTWEIGHT_HABIT_ROW_SELECT)
            .in("id", habitIds)
        : { data: [] as unknown[], error: null };
    if (habitRows.error) throw habitRows.error;
    const habitByOwnerAndId = new Map<string, Habit>();
    for (const raw of habitRows.data ?? []) {
      if (!raw || typeof raw !== "object") continue;
      const row = raw as Record<string, unknown>;
      const owner = typeof row.user_id === "string" ? row.user_id : "";
      const hid = typeof row.id === "string" ? row.id : "";
      const habit = lightweightHabitFromRpc(row, challengeId, {
        startDate: group?.start_date,
        habitTemplate: group?.habit_template,
      });
      if (owner && hid && habit) habitByOwnerAndId.set(`${owner}:${hid}`, habit);
    }
    const allItems = members.map((member) => {
      const habit = member.habit_id ? habitByOwnerAndId.get(`${member.user_id}:${member.habit_id}`) : undefined;
      return { memberId: member.user_id, label: labels[member.user_id], habit };
    }).sort((a, b) => {
      const sa = a.habit?.streak ?? -1;
      const sb = b.habit?.streak ?? -1;
      if (sb !== sa) return sb - sa;
      const ca = a.habit?.completedDates.length ?? 0;
      const cb = b.habit?.completedDates.length ?? 0;
      if (cb !== ca) return cb - ca;
      return a.memberId.localeCompare(b.memberId);
    });
    const slicedRows = allItems.slice(offset, offset + limit + 1);
    const hasMore = slicedRows.length > limit;
    const pageRows = hasMore ? slicedRows.slice(0, limit) : slicedRows;
    const pageHabitIds = [
      ...new Set(pageRows.map((item) => item.habit?.id).filter((id): id is string => Boolean(id))),
    ];
    const pageHabitRows =
      pageHabitIds.length > 0
        ? await supabase
            .from("habits")
            .select(PAGE_HABIT_ROW_SELECT)
            .in("id", pageHabitIds)
        : { data: [] as unknown[], error: null };
    if (pageHabitRows.error) throw pageHabitRows.error;
    const pageHabitByOwnerAndId = new Map<string, Habit>();
    for (const raw of pageHabitRows.data ?? []) {
      if (!raw || typeof raw !== "object") continue;
      const row = raw as Record<string, unknown>;
      const owner = typeof row.user_id === "string" ? row.user_id : "";
      const hid = typeof row.id === "string" ? row.id : "";
      const habit = lightweightHabitFromRpc(row, challengeId, {
        startDate: group?.start_date,
        habitTemplate: group?.habit_template,
      });
      if (owner && hid && habit) pageHabitByOwnerAndId.set(`${owner}:${hid}`, habit);
    }
    const hydratedPageRows = pageRows.map((item) => {
      if (!item.habit?.ownerUserId) return item;
      const habit = pageHabitByOwnerAndId.get(`${item.habit.ownerUserId}:${item.habit.id}`);
      return habit ? { ...item, habit } : item;
    });
    const result = {
      items: hydratedPageRows,
      hasMore,
      nextOffset: hasMore ? offset + limit : null,
    };
    streakMembersPageCache.set(cacheKey, result);
    return result;
  })().finally(() => {
    streakMembersPageInFlight.delete(cacheKey);
  });

  streakMembersPageInFlight.set(cacheKey, requestPromise);
  return requestPromise;
}

export async function prewarmChallengeStreaks(challengeId: string, initialLimit = 3): Promise<void> {
  await Promise.all([
    loadChallengePrimarySnapshot(challengeId),
    listChallengeStreakMembersPage(challengeId, { offset: 0, limit: initialLimit }),
  ]);
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
  const { error } = await supabase.rpc("rpc_decline_challenge_invite_v1", { p_invite_id: inviteId });
  if (error) return { error: new Error(error.message) };
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
  const { error } = await supabase.rpc("rpc_accept_challenge_invite_v1", {
    p_invite_id: invite.id,
    p_habit_id: newHabitId,
  });
  if (error) return groupActionError(error, "Could not join group mission.");

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

const UNREAD_NOTIFICATION_COUNT_CACHE_TTL_MS = 30_000;

let unreadNotificationCountCache: { userId: string; count: number; fetchedAt: number } | null = null;
let unreadNotificationCountInFlight: { userId: string | null; promise: Promise<number> } | null = null;

export function getCachedUnreadNotificationCount(
  userId: string | null | undefined,
  maxAgeMs = UNREAD_NOTIFICATION_COUNT_CACHE_TTL_MS,
): number | null {
  if (!userId || unreadNotificationCountCache?.userId !== userId) return null;
  if (Date.now() - unreadNotificationCountCache.fetchedAt > maxAgeMs) return null;
  return unreadNotificationCountCache.count;
}

export function setCachedUnreadNotificationCount(userId: string | null | undefined, count: number): void {
  if (!userId) return;
  unreadNotificationCountCache = {
    userId,
    count: Math.max(0, Math.floor(count)),
    fetchedAt: Date.now(),
  };
}

export function adjustCachedUnreadNotificationCount(userId: string | null | undefined, delta: number): void {
  if (!userId || unreadNotificationCountCache?.userId !== userId) return;
  setCachedUnreadNotificationCount(userId, unreadNotificationCountCache.count + delta);
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
  const unreadCount = count ?? 0;
  setCachedUnreadNotificationCount(user.id, unreadCount);
  return unreadCount;
}

export async function countUnreadNotificationsCached(
  userId: string | null | undefined,
  options?: { force?: boolean; maxAgeMs?: number },
): Promise<number> {
  if (!userId) return 0;
  const cached = options?.force
    ? null
    : getCachedUnreadNotificationCount(userId, options?.maxAgeMs ?? UNREAD_NOTIFICATION_COUNT_CACHE_TTL_MS);
  if (cached != null) return cached;
  if (!options?.force && unreadNotificationCountInFlight?.userId === userId) {
    return unreadNotificationCountInFlight.promise;
  }

  let request: Promise<number>;
  request = countUnreadNotifications().finally(() => {
    if (unreadNotificationCountInFlight?.promise === request) {
      unreadNotificationCountInFlight = null;
    }
  });
  unreadNotificationCountInFlight = { userId, promise: request };
  return request;
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
