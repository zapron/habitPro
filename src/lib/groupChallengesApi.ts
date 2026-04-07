import type { Habit } from "../types/habit";
import type {
  ChallengeGroupRow,
  ChallengeInviteRow,
  ChallengeMemberRow,
  NotificationRow,
  ProfileSearchRow,
} from "../types/groupChallenge";
import { useHabitStore } from "../store/habitStore";
import { pullFromSupabase } from "./sync";
import { getRemoteSyncUserId } from "./syncQueue";
import { getSupabase } from "./supabase";

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
): Promise<{ group: ChallengeGroupRow; error: Error | null }> {
  const supabase = getSupabase();
  if (!supabase) return { group: null as unknown as ChallengeGroupRow, error: new Error("Supabase not configured") };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { group: null as unknown as ChallengeGroupRow, error: new Error("Not signed in") };

  const creatorTz = getTz();
  const startDate = localDateStr(new Date(habit.startDate));

  const habitTemplate = {
    title: habit.title,
    mode: habit.mode,
    totalDays: habit.totalDays,
    description: habit.description ?? null,
  };

  const { data: group, error: gErr } = await supabase
    .from("challenge_groups")
    .insert({
      creator_id: user.id,
      title: titleOverride ?? `${habit.title} — group mission`,
      habit_template: habitTemplate,
      creator_timezone: creatorTz,
      start_date: startDate,
      status: "active",
    })
    .select()
    .single();

  if (gErr || !group) return { group: null as unknown as ChallengeGroupRow, error: new Error(gErr?.message ?? "create group failed") };

  const { error: hErr } = await supabase
    .from("habits")
    .update({
      challenge_group_id: group.id,
      challenge_creator_timezone: creatorTz,
    })
    .eq("user_id", user.id)
    .eq("id", habit.id);

  if (hErr) return { group: null as unknown as ChallengeGroupRow, error: new Error(hErr.message) };

  const { error: mErr } = await supabase.from("challenge_members").insert({
    challenge_id: group.id,
    user_id: user.id,
    habit_id: habit.id,
    role: "creator",
  });

  if (mErr) return { group: null as unknown as ChallengeGroupRow, error: new Error(mErr.message) };

  return { group: group as ChallengeGroupRow, error: null };
}

/** Pending invites you sent for this challenge (for de-duping UI). */
export async function listPendingInviteeIdsForChallenge(challengeId: string): Promise<string[]> {
  const supabase = getSupabase();
  if (!supabase) return [];
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from("challenge_invites")
    .select("invitee_id")
    .eq("challenge_id", challengeId)
    .eq("inviter_id", user.id)
    .eq("status", "pending");
  if (error) throw error;
  return (data ?? []).map((r: { invitee_id: string }) => r.invitee_id);
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

export async function sendChallengeInvite(
  challengeId: string,
  inviteeUserId: string,
): Promise<{ error: Error | null }> {
  const supabase = getSupabase();
  if (!supabase) return { error: new Error("Supabase not configured") };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: new Error("Not signed in") };

  const { data: existing } = await supabase
    .from("challenge_invites")
    .select("id")
    .eq("challenge_id", challengeId)
    .eq("invitee_id", inviteeUserId)
    .eq("status", "pending")
    .maybeSingle();
  if (existing) {
    return { error: new Error("You already sent an invite to this person for this group mission.") };
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
    const msg = invErr.message.toLowerCase().includes("unique") || invErr.code === "23505"
      ? "You already sent an invite to this person for this group mission."
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

export async function getChallengeGroup(id: string): Promise<ChallengeGroupRow | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase.from("challenge_groups").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return (data as ChallengeGroupRow) ?? null;
}

export async function listChallengeMembers(challengeId: string): Promise<ChallengeMemberRow[]> {
  const supabase = getSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase.from("challenge_members").select("*").eq("challenge_id", challengeId);
  if (error) throw error;
  return (data ?? []) as ChallengeMemberRow[];
}

export async function declineInvite(inviteId: string): Promise<{ error: Error | null }> {
  const supabase = getSupabase();
  if (!supabase) return { error: new Error("Supabase not configured") };
  const { error } = await supabase.from("challenge_invites").update({ status: "declined" }).eq("id", inviteId);
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
): Promise<{ error: Error | null }> {
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
  if (mErr) return { error: new Error(mErr.message) };

  const { error: iErr } = await supabase
    .from("challenge_invites")
    .update({ status: "accepted" })
    .eq("id", invite.id);
  if (iErr) return { error: new Error(iErr.message) };

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

/** Re-fetch cohort peer habits from Supabase (e.g. after challenge screen focus). */
export async function refreshCohortPeerHabits(): Promise<void> {
  const uid = getRemoteSyncUserId();
  if (!uid) return;
  const snap = await pullFromSupabase(uid);
  useHabitStore.getState().setCohortPeerHabits(snap.cohortPeerHabits);
}

