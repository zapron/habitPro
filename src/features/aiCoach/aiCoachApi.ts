import { getSupabase } from "../../lib/supabase";
import { getSupabaseConfig } from "../../lib/env";
import type { AiCoachRequestResult, AiCoachResponse, AiCoachSnapshot } from "./types";
import { buildLocalMockCoachResponse } from "./localMock";

function devDetail(message: string | undefined): string {
  const text = String(message ?? "").trim();
  return text ? ` ${text}` : "";
}

function isAiCoachResponse(value: unknown): value is AiCoachResponse {
  const rec = value as Partial<AiCoachResponse> | null;
  return (
    Boolean(rec) &&
    rec?.schema === "habitpro.aiCoach.v1" &&
    Array.isArray(rec.suggestions) &&
    typeof rec.headline === "string" &&
    typeof rec.subheadline === "string"
  );
}

async function requestAiCoachDev(snapshot: AiCoachSnapshot): Promise<AiCoachRequestResult> {
  const supabase = getSupabase();
  if (!supabase) {
    return {
      ok: true,
      response: buildLocalMockCoachResponse(
        snapshot,
        "Supabase is not configured, so the app is showing local mock AI for UI testing.",
      ),
    };
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) {
    return {
      ok: true,
      response: buildLocalMockCoachResponse(
        snapshot,
        "No Supabase session token was found, so the app is showing local mock AI for UI testing.",
      ),
    };
  }

  const { url, anonKey } = getSupabaseConfig();
  const endpoint = `${url}/functions/v1/ai-coach`;

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: anonKey,
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        schema: "habitpro.aiCoach.request.v1",
        intent: "today",
        snapshot,
      }),
    });
    const raw = await res.text();
    let data: unknown = null;
    try {
      data = raw ? JSON.parse(raw) : null;
    } catch {
      data = null;
    }

    if (!res.ok) {
      const detail = raw ? raw.slice(0, 220) : res.statusText;
      return {
        ok: true,
        response: buildLocalMockCoachResponse(
          snapshot,
          `Edge Function HTTP ${res.status}. Local mock is filling the UI. ${detail}`,
        ),
      };
    }

    if (isAiCoachResponse(data)) {
      return { ok: true, response: data };
    }

    return {
      ok: true,
      response: buildLocalMockCoachResponse(
        snapshot,
        `Edge Function HTTP 200 but response shape was unexpected. Local mock is filling the UI. ${raw.slice(0, 220)}`,
      ),
    };
  } catch (e) {
    return {
      ok: true,
      response: buildLocalMockCoachResponse(
        snapshot,
        `Network call failed, so the app is showing local mock AI for UI testing.${devDetail(
          e instanceof Error ? e.message : String(e),
        )}`,
      ),
    };
  }
}

export async function requestAiCoach(snapshot: AiCoachSnapshot): Promise<AiCoachRequestResult> {
  if (__DEV__) return requestAiCoachDev(snapshot);

  const supabase = getSupabase();
  if (!supabase) {
    return {
      ok: false,
      reason: "not_configured",
      error: "Supabase is not configured for this build.",
    };
  }

  try {
    const { data, error } = await supabase.functions.invoke("ai-coach", {
      body: {
        schema: "habitpro.aiCoach.request.v1",
        intent: "today",
        snapshot,
      },
    });

    if (error) {
      return { ok: false, reason: "network", error: error.message || "AI coach is unavailable." };
    }
    if (isAiCoachResponse(data)) {
      return { ok: true, response: data };
    }

    const detail =
      data && typeof data === "object" && "error" in data
        ? String((data as { error?: unknown }).error ?? "")
        : "";
    return {
      ok: false,
      reason: "unexpected",
      error: detail || "AI coach returned an unexpected response.",
    };
  } catch (e) {
    return {
      ok: false,
      reason: "network",
      error: e instanceof Error ? e.message : "AI coach is unavailable.",
    };
  }
}
