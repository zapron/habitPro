import { getSupabase } from "./supabase";

export type ChallengeMemoryStatus = "check_in_only" | "text" | "photo" | "private" | "not_found";
export type PhotoSyncState = "synced" | "local_only" | "none";

export type ChallengeMemoryCommunityWin = {
  id: string;
  cheerCount: number;
  viewerHasCheered: boolean;
};

export type ChallengeMemoryDetail = {
  viewerCanAccess: boolean;
  challengeId: string;
  subjectUserId: string;
  subjectUsername: string | null;
  subjectDisplayName: string | null;
  habitId: string | null;
  habitTitle: string;
  dateStr: string;
  missionDay: number | null;
  status: ChallengeMemoryStatus;
  note: string | null;
  imageUrl: string | null;
  photoSyncState: PhotoSyncState;
  createdAt: string | null;
  updatedAt: string | null;
  communityWin: ChallengeMemoryCommunityWin | null;
  canSendSquadNudge: boolean;
  customNoteSentToday: boolean;
};

export type ChallengeMemoryRouteParams = {
  challengeId: string;
  actorUserId: string;
  dateStr: string;
  notificationId?: string;
  habitId?: string;
  actorUsername?: string;
  habitTitle?: string;
};

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function booleanValue(value: unknown): boolean {
  return value === true;
}

function normalizeStatus(value: unknown): ChallengeMemoryStatus {
  if (
    value === "check_in_only" ||
    value === "text" ||
    value === "photo" ||
    value === "private" ||
    value === "not_found"
  ) {
    return value;
  }
  return "not_found";
}

function normalizePhotoSyncState(value: unknown): PhotoSyncState {
  if (value === "synced" || value === "local_only" || value === "none") return value;
  return "none";
}

function normalizeCommunityWin(value: unknown): ChallengeMemoryCommunityWin | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const id = stringValue(row.id);
  if (!id) return null;
  return {
    id,
    cheerCount: Math.max(0, Math.floor(numberValue(row.cheerCount) ?? 0)),
    viewerHasCheered: booleanValue(row.viewerHasCheered),
  };
}

function normalizeDetail(value: unknown): ChallengeMemoryDetail | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const challengeId = stringValue(row.challengeId);
  const subjectUserId = stringValue(row.subjectUserId);
  const dateStr = stringValue(row.dateStr);
  if (!challengeId || !subjectUserId || !dateStr) return null;

  return {
    viewerCanAccess: booleanValue(row.viewerCanAccess),
    challengeId,
    subjectUserId,
    subjectUsername: stringValue(row.subjectUsername),
    subjectDisplayName: stringValue(row.subjectDisplayName),
    habitId: stringValue(row.habitId),
    habitTitle: stringValue(row.habitTitle) ?? "Group mission",
    dateStr,
    missionDay: numberValue(row.missionDay),
    status: normalizeStatus(row.status),
    note: stringValue(row.note),
    imageUrl: stringValue(row.imageUrl),
    photoSyncState: normalizePhotoSyncState(row.photoSyncState),
    createdAt: stringValue(row.createdAt),
    updatedAt: stringValue(row.updatedAt),
    communityWin: normalizeCommunityWin(row.communityWin),
    canSendSquadNudge: booleanValue(row.canSendSquadNudge),
    customNoteSentToday: booleanValue(row.customNoteSentToday),
  };
}

export function challengeMemoryRouteParamsFromPayload(
  payload: Record<string, unknown> | undefined,
  notificationId?: string,
): ChallengeMemoryRouteParams | null {
  const challengeId = stringValue(payload?.challenge_id);
  const actorUserId = stringValue(payload?.actor_user_id);
  const dateStr = stringValue(payload?.date_str);
  if (!challengeId || !actorUserId || !dateStr) return null;

  const params: ChallengeMemoryRouteParams = {
    challengeId,
    actorUserId,
    dateStr,
  };
  const habitId = stringValue(payload?.habit_id);
  const actorUsername = stringValue(payload?.actor_username);
  const habitTitle = stringValue(payload?.habit_title);
  if (notificationId) params.notificationId = notificationId;
  if (habitId) params.habitId = habitId;
  if (actorUsername) params.actorUsername = actorUsername;
  if (habitTitle) params.habitTitle = habitTitle;
  return params;
}

export async function fetchChallengeMemoryDetail(input: {
  challengeId: string;
  actorUserId: string;
  dateStr: string;
  habitId?: string | null;
}): Promise<{ ok: true; detail: ChallengeMemoryDetail } | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: "Cloud sync not configured." };

  const { data, error } = await supabase.rpc("rpc_challenge_memory_detail_v1", {
    p_challenge_id: input.challengeId,
    p_actor_user_id: input.actorUserId,
    p_date_str: input.dateStr,
    p_habit_id: input.habitId?.trim() || null,
  });
  if (error) return { ok: false, error: error.message };

  const detail = normalizeDetail(data);
  if (!detail) return { ok: false, error: "Memory detail is unavailable." };
  return { ok: true, detail };
}
