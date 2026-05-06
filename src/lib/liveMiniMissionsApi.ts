import type {
  LiveMiniParticipantRow,
  LiveMiniParticipantStatus,
  LiveMiniSquadRow,
  LiveMiniSquadSnapshot,
} from "../types/liveMiniMission";
import { getProfileLabelsForIds } from "./groupChallengesApi";
import { getSupabase } from "./supabase";

export type LiveMiniActionResult =
  | { ok: true }
  | { ok: false; error: string; reason?: "auth_required" | "premium_required" };

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message?: unknown }).message ?? "Unknown error");
  }
  return String(error);
}

function actionError(error: unknown): Extract<LiveMiniActionResult, { ok: false }> {
  const message = errorMessage(error);
  const lower = message.toLowerCase();
  return {
    ok: false,
    error: message,
    reason: lower.includes("premium_required") ? "premium_required" : undefined,
  };
}

export async function createLiveMiniSquad(input: {
  miniMissionId: string;
  title: string;
  objective?: string | null;
  plannedMinutes: number;
  startedAt?: string | null;
}): Promise<{ ok: true; squadId: string } | { ok: false; error: string; reason?: "auth_required" | "premium_required" }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: "Supabase not configured" };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in", reason: "auth_required" };

  const { data, error } = await supabase.rpc("rpc_create_live_mini_squad", {
    p_mini_mission_id: input.miniMissionId,
    p_title: input.title,
    p_objective: input.objective ?? null,
    p_planned_minutes: input.plannedMinutes,
    p_started_at: input.startedAt ?? null,
  });
  if (error) return actionError(error);
  return { ok: true, squadId: String(data) };
}

export async function inviteLiveMiniParticipant(
  squadId: string,
  inviteeUserId: string,
): Promise<LiveMiniActionResult> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: "Supabase not configured" };
  const { error } = await supabase.rpc("rpc_invite_live_mini_participant", {
    p_squad_id: squadId,
    p_invitee_id: inviteeUserId,
  });
  if (error) return actionError(error);
  return { ok: true };
}

export async function acceptLiveMiniInvite(input: {
  squadId: string;
  localMiniMissionId: string;
  plannedMinutes: number;
  startedAt: string;
}): Promise<LiveMiniActionResult> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: "Supabase not configured" };
  const { error } = await supabase.rpc("rpc_accept_live_mini_invite", {
    p_squad_id: input.squadId,
    p_local_mini_mission_id: input.localMiniMissionId,
    p_planned_minutes: input.plannedMinutes,
    p_started_at: input.startedAt,
  });
  if (error) return actionError(error);
  return { ok: true };
}

export async function declineLiveMiniInvite(squadId: string): Promise<LiveMiniActionResult> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: "Supabase not configured" };
  const { error } = await supabase.rpc("rpc_decline_live_mini_invite", {
    p_squad_id: squadId,
  });
  if (error) return actionError(error);
  return { ok: true };
}

export async function syncLiveMiniMissionProgress(input: {
  squadId: string;
  localMiniMissionId: string;
  status: Extract<LiveMiniParticipantStatus, "joined" | "in_progress" | "completed" | "missed" | "cancelled">;
  reserveMinutes?: number;
  startedAt?: string | null;
  completedAt?: string | null;
  memoryNote?: string | null;
  memoryImageUrl?: string | null;
}): Promise<LiveMiniActionResult> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: "Supabase not configured" };
  const { error } = await supabase.rpc("rpc_sync_live_mini_progress", {
    p_squad_id: input.squadId,
    p_local_mini_mission_id: input.localMiniMissionId,
    p_status: input.status,
    p_reserve_minutes: input.reserveMinutes ?? 0,
    p_started_at: input.startedAt ?? null,
    p_completed_at: input.completedAt ?? null,
    p_memory_note: input.memoryNote ?? null,
    p_memory_image_url: input.memoryImageUrl ?? null,
  });
  if (error) return actionError(error);
  return { ok: true };
}

export async function refreshLiveMiniMissed(squadId: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;
  await supabase.rpc("rpc_refresh_live_mini_missed", { p_squad_id: squadId });
}

export async function fetchLiveMiniSquad(squadId: string): Promise<LiveMiniSquadSnapshot | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  await refreshLiveMiniMissed(squadId).catch(() => {});

  const [squadRes, participantsRes] = await Promise.all([
    supabase.from("live_mini_squads").select("*").eq("id", squadId).maybeSingle(),
    supabase
      .from("live_mini_participants")
      .select("*")
      .eq("squad_id", squadId)
      .order("created_at", { ascending: true }),
  ]);

  if (squadRes.error) throw squadRes.error;
  if (participantsRes.error) throw participantsRes.error;
  if (!squadRes.data) return null;

  const participants = (participantsRes.data ?? []) as LiveMiniParticipantRow[];
  const ids = [
    String((squadRes.data as LiveMiniSquadRow).creator_id),
    ...participants.map((p) => p.user_id),
  ];
  const profiles = await getProfileLabelsForIds(ids);
  return {
    squad: squadRes.data as LiveMiniSquadRow,
    participants,
    profiles,
  };
}

export async function listLiveMiniParticipantStatuses(
  squadId: string,
): Promise<Record<string, LiveMiniParticipantStatus>> {
  const supabase = getSupabase();
  if (!supabase) return {};
  const { data, error } = await supabase
    .from("live_mini_participants")
    .select("user_id,status")
    .eq("squad_id", squadId);
  if (error) throw error;
  const out: Record<string, LiveMiniParticipantStatus> = {};
  for (const row of data ?? []) {
    const r = row as { user_id?: string; status?: string };
    if (!r.user_id || !r.status) continue;
    out[r.user_id] = r.status as LiveMiniParticipantStatus;
  }
  return out;
}

export function subscribeLiveMiniSquad(
  squadId: string,
  onChange: () => void,
): (() => void) | null {
  const supabase = getSupabase();
  if (!supabase || !squadId) return null;
  const channelName = `live_mini_squad_${squadId}_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2)}`;
  const channel = supabase
    .channel(channelName)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "live_mini_participants",
        filter: `squad_id=eq.${squadId}`,
      },
      () => onChange(),
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

export function formatLiveMiniElapsed(seconds: number | null | undefined): string {
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) return "--";
  const safe = Math.max(0, Math.floor(seconds));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s.toString().padStart(2, "0")}s`;
  return `${s}s`;
}
