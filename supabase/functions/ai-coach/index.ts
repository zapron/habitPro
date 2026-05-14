/// <reference path="../deno-ambient.d.ts" />
/**
 * AI Coach Spike: removable HabitPro experiment.
 *
 * Secrets:
 * - SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY
 * - AI_PROVIDER=auto|mock|openai (default: auto)
 * - OPENAI_API_KEY (optional; real AI only when present)
 * - OPENAI_MODEL (optional; default: gpt-4.1-nano)
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// @ts-expect-error Deno resolves https:// imports; workspace TypeScript does not.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Provider = "mock" | "openai";

type CoachAction =
  | {
      type: "prefill_habit";
      label: string;
      title: string;
      description?: string;
      mode: "autopilot" | "manual";
      totalDays?: number;
    }
  | { type: "open_habit"; label: string; habitId: string }
  | { type: "open_mini"; label: string }
  | { type: "open_reports"; label: string }
  | { type: "none"; label: string };

type CoachSuggestion = {
  id: string;
  title: string;
  body: string;
  priority: "high" | "medium" | "low";
  reason?: string;
  action: CoachAction;
};

type CoachResponse = {
  schema: "habitpro.aiCoach.v1";
  provider: Provider;
  generatedAt: string;
  headline: string;
  subheadline: string;
  suggestions: CoachSuggestion[];
  usage?: {
    premium: boolean;
    limitPerDay: number;
    usedToday: number;
    remainingToday: number;
  };
};

type SnapshotHabit = {
  id?: string;
  title?: string;
  description?: string;
  mode?: "autopilot" | "manual";
  status?: "active" | "needs_report" | "completed" | "failed";
  streak?: number;
  totalDays?: number;
  completedCount?: number;
  visibility?: "public" | "solo";
  isSquadMission?: boolean;
};

type SnapshotMini = {
  id?: string;
  title?: string;
  objective?: string;
  status?: string;
  estimatedMinutes?: number;
  remainingSeconds?: number;
  isLiveSquad?: boolean;
};

type CoachRequest = {
  schema?: string;
  intent?: string;
  snapshot?: {
    schema?: string;
    clientNowIso?: string;
    timezone?: string | null;
    xp?: number;
    level?: number;
    stats?: {
      activeMissions?: number;
      pendingReports?: number;
      accomplishedReports?: number;
      failedReports?: number;
      liveMiniMissions?: number;
      waitingMiniMissions?: number;
    };
    habits?: SnapshotHabit[];
    miniMissions?: SnapshotMini[];
  };
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function env(name: string): string {
  return Deno.env.get(name)?.trim() ?? "";
}

function debugEnabled(): boolean {
  const value = env("AI_COACH_DEBUG").toLowerCase();
  return value !== "0" && value !== "false" && value !== "off";
}

function shortId(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.length <= 12 ? value : `${value.slice(0, 8)}...${value.slice(-4)}`;
}

function logDebug(event: string, details: Record<string, unknown> = {}): void {
  if (!debugEnabled()) return;
  console.log(`[ai-coach] ${event}`, JSON.stringify(details));
}

function logWarn(event: string, details: Record<string, unknown> = {}): void {
  console.warn(`[ai-coach] ${event}`, JSON.stringify(details));
}

function intEnv(name: string, fallback: number): number {
  const n = Number.parseInt(env(name), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function safeText(value: unknown, fallback: string, max = 120): string {
  const text = typeof value === "string" ? value.trim() : "";
  const resolved = text || fallback;
  return resolved.length > max ? `${resolved.slice(0, max - 1).trim()}...` : resolved;
}

function num(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function firstActiveHabit(snapshot: CoachRequest["snapshot"]): SnapshotHabit | null {
  return (
    snapshot?.habits?.find((h) => h.status === "active") ??
    snapshot?.habits?.find((h) => h.status === "needs_report") ??
    snapshot?.habits?.[0] ??
    null
  );
}

function makeResponse(input: {
  provider: Provider;
  headline: string;
  subheadline: string;
  suggestions: CoachSuggestion[];
  premium: boolean;
  limitPerDay: number;
  usedToday: number;
}): CoachResponse {
  return {
    schema: "habitpro.aiCoach.v1",
    provider: input.provider,
    generatedAt: new Date().toISOString(),
    headline: safeText(input.headline, "Today’s move", 80),
    subheadline: safeText(input.subheadline, "One practical next step, no automatic changes.", 180),
    suggestions: input.suggestions.slice(0, 3),
    usage: {
      premium: input.premium,
      limitPerDay: input.limitPerDay,
      usedToday: input.usedToday,
      remainingToday: Math.max(0, input.limitPerDay - input.usedToday),
    },
  };
}

function mockCoach(snapshot: CoachRequest["snapshot"], usage: { premium: boolean; limitPerDay: number; usedToday: number }): CoachResponse {
  const stats = snapshot?.stats ?? {};
  const active = num(stats.activeMissions);
  const pending = num(stats.pendingReports);
  const liveMini = num(stats.liveMiniMissions);
  const waitingMini = num(stats.waitingMiniMissions);
  const habit = firstActiveHabit(snapshot);
  const habitTitle = safeText(habit?.title, "your main mission", 80);
  const suggestions: CoachSuggestion[] = [];

  if (pending > 0) {
    suggestions.push({
      id: "review-pending",
      title: pending === 1 ? "Close the open report" : `Close ${pending} open reports`,
      body: "Lock the mission outcome first so your board feels clean before starting anything new.",
      priority: "high",
      reason: "Pending reports are blocking a clear next move.",
      action: { type: "open_reports", label: "Open Reports" },
    });
  }

  if (habit && habit.status === "active") {
    const streak = num(habit.streak);
    suggestions.push({
      id: "protect-streak",
      title: streak >= 3 ? `Protect the ${streak}-day streak` : `Check in on ${habitTitle}`,
      body: `Do the smallest honest version of "${habitTitle}" today. Keep it simple enough that you can finish it now.`,
      priority: suggestions.length === 0 ? "high" : "medium",
      reason: habit.isSquadMission ? "Squad mission momentum is visible to your group." : "Main mission momentum matters more than adding a new task.",
      action: habit.id
        ? { type: "open_habit", label: "Open Mission", habitId: String(habit.id) }
        : { type: "none", label: "Use This" },
    });
  }

  if (liveMini > 0 || waitingMini > 0) {
    suggestions.push({
      id: "mini-focus",
      title: liveMini > 0 ? "Finish the live mini now" : "Start one short mini",
      body: liveMini > 0
        ? "A timer is already moving. Finish that before planning a bigger day."
        : "Pick a tiny side quest to create momentum without touching your main mission.",
      priority: suggestions.length === 0 ? "high" : "low",
      action: { type: "open_mini", label: liveMini > 0 ? "Open Mini" : "Browse Minis" },
    });
  }

  if (suggestions.length === 0 && active === 0) {
    suggestions.push({
      id: "create-simple-mission",
      title: "Start with a frictionless 21-day mission",
      body: "A good first AI test is a small daily promise with a clear moment and no heroic setup.",
      priority: "high",
      reason: "No active mission is available right now.",
      action: {
        type: "prefill_habit",
        label: "Draft Mission",
        title: "10-minute daily reset",
        description: "Do one focused 10-minute reset at the same time each day. Keep the promise small and repeatable.",
        mode: "autopilot",
      },
    });
  }

  return makeResponse({
    provider: "mock",
    headline: pending > 0 ? "Clean up the board first" : habit ? "Protect today’s momentum" : "Draft a small first win",
    subheadline: "Mock fallback is active. The UX is real; the intelligence is deterministic until OpenAI is configured.",
    suggestions,
    ...usage,
  });
}

function normalizeSuggestion(value: unknown, index: number): CoachSuggestion | null {
  const rec = value as Partial<CoachSuggestion> | null;
  if (!rec || typeof rec !== "object") return null;
  const rawAction = rec.action as Partial<CoachAction> | null;
  const actionType = typeof rawAction?.type === "string" ? rawAction.type : "none";
  let action: CoachAction = { type: "none", label: safeText(rawAction?.label, "Use This", 28) };

  if (actionType === "prefill_habit") {
    action = {
      type: "prefill_habit",
      label: safeText(rawAction?.label, "Draft Mission", 28),
      title: safeText((rawAction as { title?: unknown })?.title, "Small daily mission", 80),
      description: safeText((rawAction as { description?: unknown })?.description, "", 220) || undefined,
      mode: (rawAction as { mode?: unknown })?.mode === "manual" ? "manual" : "autopilot",
      totalDays: Math.max(1, Math.min(365, num((rawAction as { totalDays?: unknown })?.totalDays, 21))),
    };
  } else if (actionType === "open_habit" && typeof (rawAction as { habitId?: unknown })?.habitId === "string") {
    action = {
      type: "open_habit",
      label: safeText(rawAction?.label, "Open Mission", 28),
      habitId: String((rawAction as { habitId?: unknown }).habitId),
    };
  } else if (actionType === "open_mini") {
    action = { type: "open_mini", label: safeText(rawAction?.label, "Open Mini", 28) };
  } else if (actionType === "open_reports") {
    action = { type: "open_reports", label: safeText(rawAction?.label, "Open Reports", 28) };
  }

  const priority = rec.priority === "high" || rec.priority === "low" ? rec.priority : "medium";
  return {
    id: safeText(rec.id, `ai-${index}`, 40).replace(/[^a-zA-Z0-9_-]/g, "-"),
    title: safeText(rec.title, "Take one small next step", 90),
    body: safeText(rec.body, "Keep today simple and finish one clear action.", 240),
    priority,
    reason: safeText(rec.reason, "", 140) || undefined,
    action,
  };
}

async function openAiCoach(snapshot: CoachRequest["snapshot"], usage: { premium: boolean; limitPerDay: number; usedToday: number }): Promise<{
  response: CoachResponse;
  promptTokens: number | null;
  completionTokens: number | null;
}> {
  const apiKey = env("OPENAI_API_KEY");
  if (!apiKey) throw new Error("missing_openai_key");

  const model = env("OPENAI_MODEL") || "gpt-4.1-nano";
  const prompt = {
    role: "system",
    content:
      "You are HabitPro's AI coach. Return strict JSON only. Suggest at most 3 practical next moves. Do not claim you changed data. Prefer action types: open_reports, open_habit, open_mini, prefill_habit, none. Keep copy concise and motivating.",
  };
  const user = {
    role: "user",
    content: JSON.stringify({
      expectedSchema: {
        headline: "string",
        subheadline: "string",
        suggestions: [
          {
            id: "string",
            title: "string",
            body: "string",
            priority: "high|medium|low",
            reason: "optional string",
            action: "one of the allowed action objects",
          },
        ],
      },
      context: snapshot,
    }),
  };

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [prompt, user],
      response_format: { type: "json_object" },
      temperature: 0.45,
      max_tokens: 700,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`openai_${res.status}:${detail.slice(0, 140)}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) throw new Error("openai_empty_response");

  const parsed = JSON.parse(content) as {
    headline?: unknown;
    subheadline?: unknown;
    suggestions?: unknown[];
  };
  const suggestions = Array.isArray(parsed.suggestions)
    ? parsed.suggestions.map(normalizeSuggestion).filter(Boolean) as CoachSuggestion[]
    : [];

  if (suggestions.length === 0) throw new Error("openai_no_suggestions");

  return {
    response: makeResponse({
      provider: "openai",
      headline: safeText(parsed.headline, "Today’s move"),
      subheadline: safeText(parsed.subheadline, "One practical next step, reviewed by AI.", 180),
      suggestions,
      ...usage,
    }),
    promptTokens: typeof data?.usage?.prompt_tokens === "number" ? data.usage.prompt_tokens : null,
    completionTokens: typeof data?.usage?.completion_tokens === "number" ? data.usage.completion_tokens : null,
  };
}

async function recordUsage(admin: any, input: {
  userId: string;
  provider: Provider;
  status: string;
  promptTokens?: number | null;
  completionTokens?: number | null;
  error?: string | null;
  snapshot?: CoachRequest["snapshot"];
}) {
  try {
    const { error } = await admin.rpc("ai_coach_spike_record_usage", {
      p_user_id: input.userId,
      p_intent: "today",
      p_provider: input.provider,
      p_status: input.status,
      p_prompt_tokens: input.promptTokens ?? null,
      p_completion_tokens: input.completionTokens ?? null,
      p_error: input.error ?? null,
      p_client_context: {
        activeMissions: input.snapshot?.stats?.activeMissions ?? null,
        pendingReports: input.snapshot?.stats?.pendingReports ?? null,
        liveMiniMissions: input.snapshot?.stats?.liveMiniMissions ?? null,
      },
    });
    if (error) {
      logWarn("usage_record_failed", {
        provider: input.provider,
        status: input.status,
        message: error.message,
      });
    } else {
      logDebug("usage_recorded", {
        provider: input.provider,
        status: input.status,
        promptTokens: input.promptTokens ?? null,
        completionTokens: input.completionTokens ?? null,
      });
    }
  } catch (e) {
    logWarn("usage_record_exception", {
      provider: input.provider,
      status: input.status,
      message: e instanceof Error ? e.message : String(e),
    });
  }
}

async function getUsageCountSafe(admin: any, input: {
  userId: string;
  since: string;
  requestId: string;
}): Promise<{ data: number; error: { message: string } | null }> {
  try {
    const { data, error } = await admin.rpc("ai_coach_spike_usage_count", {
      p_user_id: input.userId,
      p_since: input.since,
    });
    return {
      data: typeof data === "number" ? data : 0,
      error: error ? { message: String(error.message ?? error) } : null,
    };
  } catch (e) {
    logWarn("usage_count_exception", {
      requestId: input.requestId,
      userId: shortId(input.userId),
      message: e instanceof Error ? e.message : String(e),
    });
    return { data: 0, error: null };
  }
}

Deno.serve(async (req) => {
  const requestId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  logDebug("request_start", { requestId, method: req.method });

  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    logWarn("method_not_allowed", { requestId, method: req.method });
    return json({ error: "method_not_allowed" }, 405);
  }

  const supabaseUrl = env("SUPABASE_URL");
  const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    logWarn("server_not_configured", {
      requestId,
      hasSupabaseUrl: Boolean(supabaseUrl),
      hasServiceRoleKey: Boolean(serviceKey),
    });
    return json({ error: "server_not_configured" }, 500);
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  logDebug("auth_check_start", { requestId, hasAuthHeader: Boolean(authHeader) });
  const userClient = createClient(supabaseUrl, serviceKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const admin = createClient(supabaseUrl, serviceKey);

  const { data: userData, error: userErr } = await userClient.auth.getUser();
  const user = userData?.user;
  if (userErr || !user) {
    logWarn("auth_required", {
      requestId,
      hasAuthHeader: Boolean(authHeader),
      message: userErr?.message ?? "missing_user",
    });
    return json({ error: "auth_required" }, 401);
  }
  logDebug("auth_ok", { requestId, userId: shortId(user.id) });

  let body: CoachRequest;
  try {
    body = await req.json();
  } catch {
    logWarn("invalid_json", { requestId, userId: shortId(user.id) });
    return json({ error: "invalid_json" }, 400);
  }

  const snapshot = body.snapshot;
  logDebug("snapshot_received", {
    requestId,
    userId: shortId(user.id),
    intent: body.intent ?? "today",
    habits: snapshot?.habits?.length ?? 0,
    miniMissions: snapshot?.miniMissions?.length ?? 0,
    activeMissions: snapshot?.stats?.activeMissions ?? null,
    pendingReports: snapshot?.stats?.pendingReports ?? null,
    liveMiniMissions: snapshot?.stats?.liveMiniMissions ?? null,
  });
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [profileRes, usedTodayRes] = await Promise.all([
    admin.from("profiles").select("is_premium").eq("id", user.id).maybeSingle(),
    getUsageCountSafe(admin, { userId: user.id, since, requestId }),
  ]);
  if (profileRes.error) {
    logWarn("profile_read_failed", {
      requestId,
      userId: shortId(user.id),
      message: profileRes.error.message,
    });
  }
  if (usedTodayRes.error) {
    logWarn("usage_count_failed", {
      requestId,
      userId: shortId(user.id),
      message: usedTodayRes.error.message,
    });
  }

  const premium = Boolean((profileRes.data as { is_premium?: boolean } | null)?.is_premium);
  const limitPerDay = premium ? intEnv("AI_COACH_PLUS_DAILY_LIMIT", 50) : intEnv("AI_COACH_FREE_DAILY_LIMIT", 5);
  const usedToday = typeof usedTodayRes.data === "number" ? usedTodayRes.data : 0;
  const usage = { premium, limitPerDay, usedToday };
  logDebug("usage_resolved", {
    requestId,
    userId: shortId(user.id),
    premium,
    limitPerDay,
    usedToday,
  });

  if (usedToday >= limitPerDay) {
    logWarn("daily_limit_reached", {
      requestId,
      userId: shortId(user.id),
      premium,
      limitPerDay,
      usedToday,
    });
    const response = makeResponse({
      provider: "mock",
      headline: "AI coach limit reached",
      subheadline: "The experiment is capped so API costs stay predictable. Normal HabitPro flows still work.",
      suggestions: [
        {
          id: "limit",
          title: "Come back after the rolling window resets",
          body: "You can keep using missions, minis, memories, and squads without AI.",
          priority: "medium",
          action: { type: "none", label: "Got it" },
        },
      ],
      ...usage,
    });
    return json(response);
  }

  const providerMode = (env("AI_PROVIDER") || "auto").toLowerCase();
  const shouldTryOpenAi = providerMode === "openai" || (providerMode === "auto" && Boolean(env("OPENAI_API_KEY")));
  logDebug("provider_resolved", {
    requestId,
    userId: shortId(user.id),
    providerMode,
    hasOpenAiKey: Boolean(env("OPENAI_API_KEY")),
    shouldTryOpenAi,
    model: env("OPENAI_MODEL") || "gpt-4.1-nano",
  });

  if (shouldTryOpenAi) {
    try {
      const result = await openAiCoach(snapshot, { ...usage, usedToday: usedToday + 1 });
      logDebug("openai_success", {
        requestId,
        userId: shortId(user.id),
        promptTokens: result.promptTokens,
        completionTokens: result.completionTokens,
        suggestions: result.response.suggestions.length,
      });
      await recordUsage(admin, {
        userId: user.id,
        provider: "openai",
        status: "ok",
        promptTokens: result.promptTokens,
        completionTokens: result.completionTokens,
        snapshot,
      });
      logDebug("response_ok", { requestId, userId: shortId(user.id), provider: "openai" });
      return json(result.response);
    } catch (e) {
      logWarn("openai_failed_mock_fallback", {
        requestId,
        userId: shortId(user.id),
        message: e instanceof Error ? e.message : String(e),
      });
      const fallback = mockCoach(snapshot, { ...usage, usedToday: usedToday + 1 });
      await recordUsage(admin, {
        userId: user.id,
        provider: "mock",
        status: "mock_fallback",
        error: e instanceof Error ? e.message : "openai_failed",
        snapshot,
      });
      logDebug("response_ok", { requestId, userId: shortId(user.id), provider: "mock", fallback: true });
      return json(fallback);
    }
  }

  logDebug("mock_provider_selected", { requestId, userId: shortId(user.id) });
  const response = mockCoach(snapshot, { ...usage, usedToday: usedToday + 1 });
  await recordUsage(admin, {
    userId: user.id,
    provider: "mock",
    status: "ok",
    snapshot,
  });
  logDebug("response_ok", { requestId, userId: shortId(user.id), provider: "mock" });
  return json(response);
});
