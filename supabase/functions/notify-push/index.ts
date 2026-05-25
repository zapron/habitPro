/// <reference path="../deno-ambient.d.ts" />
/**
 * Supabase Edge Function: send Expo push when a row is inserted into public.notifications.
 * Trigger: Database Webhook (INSERT on notifications) with header x-notify-secret.
 *
 * Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NOTIFY_PUSH_SECRET (match webhook header).
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// @ts-expect-error Deno resolves https:// imports; workspace TypeScript does not.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

type NotificationRow = {
  id: string;
  user_id: string;
  type: string;
  payload: Record<string, unknown>;
};

function textPayloadValue(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function buildMessage(
  type: string | undefined | null,
  payload: Record<string, unknown>,
): { title: string; body: string; data: Record<string, unknown> } {
  const resolvedType =
    String(type ?? "").trim() ||
    (typeof payload.type === "string" ? payload.type.trim() : "");
  const t = resolvedType.toLowerCase();

  const data: Record<string, unknown> = {
    type: resolvedType || t,
    schema: "habitpro.notification.v1",
    ...payload,
  };

  switch (t) {
    case "challenge_invite": {
      const inviter =
        typeof payload.inviter_username === "string"
          ? payload.inviter_username
          : "Someone";
      return {
        title: "Group mission invite",
        body: `From @${String(inviter).toLowerCase()} · Open to respond`,
        data,
      };
    }
    case "live_mini_invite": {
      const inviter =
        typeof payload.inviter_username === "string"
          ? payload.inviter_username
          : "Someone";
      const title =
        typeof payload.mini_mission_title === "string"
          ? payload.mini_mission_title
          : "a mini mission";
      return {
        title: "Live mini invite",
        body: `@${String(inviter).toLowerCase()} invited you to "${title}"`,
        data,
      };
    }
    case "live_mini_accepted": {
      const u = typeof payload.invitee_username === "string" ? payload.invitee_username : "Someone";
      return {
        title: "Live mini accepted",
        body: `@${String(u).toLowerCase()} joined your Live Squad`,
        data,
      };
    }
    case "live_mini_declined": {
      const u = typeof payload.invitee_username === "string" ? payload.invitee_username : "Someone";
      return {
        title: "Live mini declined",
        body: `@${String(u).toLowerCase()} declined your invite`,
        data,
      };
    }
    case "live_mini_completed": {
      const u =
        typeof payload.participant_username === "string"
          ? payload.participant_username
          : "Someone";
      return {
        title: "Live mini completed",
        body: `@${String(u).toLowerCase()} finished the mini mission`,
        data,
      };
    }
    case "challenge_invite_accepted": {
      const u = typeof payload.invitee_username === "string" ? payload.invitee_username : "Someone";
      return {
        title: "Invite accepted",
        body: `@${String(u).toLowerCase()} joined your group mission`,
        data,
      };
    }
    case "challenge_invite_declined": {
      const u = typeof payload.invitee_username === "string" ? payload.invitee_username : "Someone";
      return {
        title: "Invite declined",
        body: `@${String(u).toLowerCase()} declined`,
        data,
      };
    }
    case "challenge_nudge": {
      const from =
        typeof payload.from_username === "string" ? payload.from_username : "Someone";
      const kind = typeof payload.kind === "string" ? payload.kind : "nudge";
      const fromHandle = String(from).toLowerCase();
      if (kind === "custom_note") {
        const msg = typeof payload.message === "string" ? payload.message.trim() : "";
        const preview = msg.length > 100 ? `${msg.slice(0, 97)}…` : msg;
        return {
          title: "Squad note",
          body:
            preview.length > 0
              ? `@${fromHandle}: “${preview}”`
              : `@${fromHandle} sent you a note`,
          data,
        };
      }
      return {
        title: "Squad nudge",
        body: `@${fromHandle} sent ${kind}`,
        data,
      };
    }
    case "challenge_squad_checkin": {
      const from =
        typeof payload.actor_username === "string" && payload.actor_username.length > 0
          ? String(payload.actor_username).toLowerCase()
          : "someone";
      const habitTitle =
        typeof payload.habit_title === "string" && payload.habit_title.length > 0
          ? payload.habit_title
          : "Group mission";
      const who = from === "someone" ? "Someone" : `@${from}`;
      return {
        title: "Squad streak",
        body: `${who} updated the streak on “${habitTitle}”`,
        data,
      };
    }
    case "community_win_cheer": {
      const who =
        typeof payload.from_username === "string" && payload.from_username !== "someone"
          ? `@${String(payload.from_username).toLowerCase()}`
          : "Someone";
      const title =
        typeof payload.mini_mission_title === "string"
          ? payload.mini_mission_title
          : "your win";
      const feedSource =
        typeof payload.feed_source === "string" ? payload.feed_source : "mini";
      if (feedSource === "habit_streak") {
        return {
          title: "Love for your streak",
          body: `${who} cheered your streak on “${title}”`,
          data,
        };
      }
      return {
        title: "Cheer on your win",
        body: `${who} cheered “${title}”`,
        data,
      };
    }
    case "streak_window_reminder": {
      const habitTitle =
        typeof payload.habit_title === "string" ? payload.habit_title : "Your mission";
      const displayTitle = textPayloadValue(payload, "display_title");
      const displayBody = textPayloadValue(payload, "display_body");
      if (displayTitle && displayBody) {
        return {
          title: displayTitle,
          body: displayBody,
          data,
        };
      }
      const phase = payload.reminder_phase;
      const minsLeft = typeof payload.minutes_left === "number" ? payload.minutes_left : null;
      const hm =
        typeof minsLeft === "number" && Number.isFinite(minsLeft) && minsLeft > 0
          ? { hh: Math.floor(minsLeft / 60), mm: minsLeft % 60 }
          : null;
      const leftStr =
        hm && hm.hh > 0 ? `${hm.hh}h ${hm.mm}m` : hm ? `${hm.mm}m` : "";
      if (phase === "open") {
        return {
          title: "Streak window is open",
          body: `You have 24 hours to finish today’s habit for “${habitTitle}”.`,
          data,
        };
      }
      if (phase === "custom") {
        return {
          title: "Streak check-in",
          body:
            leftStr.length > 0
              ? `You have ${leftStr} left to mark today for “${habitTitle}”.`
              : `Time to mark today for “${habitTitle}”.`,
          data,
        };
      }
      if (phase === "closing") {
        return {
          title: "Almost time’s up",
          body: `You have almost an hour left. Complete your streak for “${habitTitle}”.`,
          data,
        };
      }
      return {
        title: "Streak window closing",
        body: `About 1 hour left to mark today for “${habitTitle}”.`,
        data,
      };
    }
    case "streak_repair_request": {
      const requesterName =
        typeof payload.requester_username === "string" && payload.requester_username.length > 0
          ? `@${payload.requester_username.toLowerCase()}`
          : "A squadmate";
      const dateStr = typeof payload.date_str === "string" ? payload.date_str : "a missed day";
      return {
        title: "Streak repair request",
        body: `${requesterName} is asking to repair ${dateStr}. Tap to review.`,
        data,
      };
    }
    case "streak_repair_result": {
      const status = typeof payload.status === "string" ? payload.status : "";
      if (status === "applied") {
        return {
          title: "Streak repaired! 🔥",
          body: "Your squad approved your repair request. Your streak is back on track.",
          data,
        };
      }
      const reason = typeof payload.reason === "string" ? payload.reason : "";
      if (reason === "insufficient_xp") {
        return {
          title: "Repair declined",
          body: "Your squad approved but you didn't have enough XP. Earn more and try again.",
          data,
        };
      }
      return {
        title: "Repair request declined",
        body: "Your squad declined the streak repair request.",
        data,
      };
    }
    default: {
      // Fallback: webhook may omit notifications.type; squad check-in payload is distinctive
      if (
        typeof payload.challenge_id === "string" &&
        typeof payload.habit_title === "string" &&
        typeof payload.date_str === "string" &&
        typeof payload.actor_user_id === "string"
      ) {
        const from =
          typeof payload.actor_username === "string" && payload.actor_username.length > 0
            ? String(payload.actor_username).toLowerCase()
            : "someone";
        const habitTitle =
          typeof payload.habit_title === "string" && payload.habit_title.length > 0
            ? payload.habit_title
            : "Group mission";
        const who = from === "someone" ? "Someone" : `@${from}`;
        return {
          title: "Squad streak",
          body: `${who} updated the streak on “${habitTitle}”`,
          data: { ...data, type: "challenge_squad_checkin" },
        };
      }
      return {
        title: "habitPro",
        body: "You have a new notification",
        data,
      };
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders() });
  }

  const secret = Deno.env.get("NOTIFY_PUSH_SECRET");
  const got = req.headers.get("x-notify-secret") ?? "";
  if (!secret || got !== secret) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
    });
  }

  let body: { type?: string; table?: string; record?: NotificationRow };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid json" }), {
      status: 400,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
    });
  }

  const evt = String(body.type ?? "").toUpperCase();
  if (body.table !== "notifications" || evt !== "INSERT" || !body.record) {
    return new Response(JSON.stringify({ ok: true, skipped: true }), {
      status: 200,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
    });
  }

  const record = body.record;
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const { data: tokens, error: tokErr } = await supabase
    .from("push_tokens")
    .select("expo_push_token")
    .eq("user_id", record.user_id);

  if (tokErr) {
    console.error("[notify-push] tokens", tokErr);
    return new Response(JSON.stringify({ error: tokErr.message }), {
      status: 500,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
    });
  }

  if (!tokens?.length) {
    return new Response(JSON.stringify({ ok: true, sent: 0 }), {
      status: 200,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
    });
  }

  const payload = (record.payload ?? {}) as Record<string, unknown>;
  const { title, body: msgBody, data } = buildMessage(record.type, payload);

  const messages = tokens.map((t: { expo_push_token: string }) => ({
    to: t.expo_push_token,
    sound: "default",
    title,
    body: msgBody,
    data,
    priority: "high" as const,
    /** Android channel created at app startup (`default` channel, MAX importance). */
    channelId: "default",
  }));

  const chunkSize = 100;
  const expoResults: unknown[] = [];
  for (let i = 0; i < messages.length; i += chunkSize) {
    const chunk = messages.slice(i, i + chunkSize);
    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(chunk),
    });
    const expoJson = await res.json().catch(() => ({}));
    expoResults.push(expoJson);
    if (!res.ok) {
      console.error("[notify-push] Expo error", res.status, expoJson);
      return new Response(JSON.stringify({ error: "expo", detail: expoJson }), {
        status: 502,
        headers: { ...corsHeaders(), "Content-Type": "application/json" },
      });
    }
  }

  return new Response(JSON.stringify({ ok: true, sent: messages.length, expo: expoResults }), {
    status: 200,
    headers: { ...corsHeaders(), "Content-Type": "application/json" },
  });
});

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-notify-secret",
  };
}
