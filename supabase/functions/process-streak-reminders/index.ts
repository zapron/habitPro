/**
 * Scheduled Edge Function: during the **last hour** of each mission’s **24h day** (same model as
 * `src/utils/missionDaySlots.ts` — not calendar midnight), remind if that day’s check-in key
 * is still missing from `completed_dates`.
 *
 * `profiles.timezone` should match the device (synced on login) so `YYYY-MM-DD` keys align
 * with the client’s `getDayDate` grid labels.
 *
 * Schedule in Supabase Dashboard (e.g. every 15 minutes) with header x-cron-secret.
 * Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const MS_PER_MISSION_DAY = 24 * 60 * 60 * 1000;
const MS_REMINDER_WINDOW = 60 * 60 * 1000;

type HabitRow = {
  id: string;
  user_id: string;
  title: string;
  start_date: string;
  total_days: number;
  completed_dates: string[] | null;
};

/** Same slot index as `getActiveMissionDaySlot` in missionDaySlots.ts */
function getActiveMissionDaySlot(startIso: string, nowMs: number, totalDays: number): number | null {
  const td = Math.max(1, totalDays);
  const startMs = new Date(startIso).getTime();
  const elapsed = Math.max(0, nowMs - startMs);
  const rawSlot = Math.floor(elapsed / MS_PER_MISSION_DAY) + 1;
  if (rawSlot > td) return null;
  return Math.max(1, rawSlot);
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Wall calendar Y/M/D for `iso` in `timeZone` */
function ymdPartsInTz(iso: string, timeZone: string): { y: number; m: number; d: number } | null {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));
  const map: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== "literal") map[p.type] = p.value;
  }
  if (!map.year || !map.month || !map.day) return null;
  const y = Number.parseInt(map.year, 10);
  const m = Number.parseInt(map.month, 10);
  const d = Number.parseInt(map.day, 10);
  if (Number.isNaN(y) || Number.isNaN(m) || Number.isNaN(d)) return null;
  return { y, m, d };
}

/** Calendar add; mirrors `setDate(getDate()+n)` for typical days */
function addCalendarDaysYmd(y: number, m: number, d: number, days: number): { y: number; m: number; d: number } {
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

/**
 * Same key the app stores for mission day `(slot)` — `getDayDate(slot - 1)` using wall date
 * in the user’s timezone (see habit/[id].tsx).
 */
function missionDayDateKey(startIso: string, dayIndexZeroBased: number, timeZone: string): string | null {
  const base = ymdPartsInTz(startIso, timeZone);
  if (!base) return null;
  const { y, m, d } = addCalendarDaysYmd(base.y, base.m, base.d, dayIndexZeroBased);
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders() });
  }

  const secret = Deno.env.get("CRON_SECRET");
  const got = req.headers.get("x-cron-secret") ?? "";
  if (!secret || got !== secret) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const { data: habits, error: hErr } = await supabase
    .from("habits")
    .select("id, user_id, title, start_date, total_days, completed_dates")
    .eq("status", "active")
    .eq("is_completed", false);

  if (hErr) {
    console.error("[streak-reminders] habits", hErr);
    return new Response(JSON.stringify({ error: hErr.message }), {
      status: 500,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
    });
  }

  if (!habits?.length) {
    return new Response(JSON.stringify({ ok: true, reminders: 0 }), {
      status: 200,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
    });
  }

  const userIds = [...new Set(habits.map((h) => h.user_id))];
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, timezone")
    .in("id", userIds);

  const tzByUser = new Map<string, string | null>();
  for (const p of profiles ?? []) {
    tzByUser.set(p.id, p.timezone ?? null);
  }

  const nowMs = Date.now();
  let inserted = 0;

  for (const h of habits as HabitRow[]) {
    const tz = tzByUser.get(h.user_id) ?? "UTC";
    const totalDays = Math.max(1, h.total_days ?? 21);

    const slot = getActiveMissionDaySlot(h.start_date, nowMs, totalDays);
    if (slot == null) continue;

    const startMs = new Date(h.start_date).getTime();
    const slotEndMs = startMs + slot * MS_PER_MISSION_DAY;
    if (nowMs < slotEndMs - MS_REMINDER_WINDOW || nowMs >= slotEndMs) continue;

    const expectedDateKey = missionDayDateKey(h.start_date, slot - 1, tz);
    if (!expectedDateKey) continue;

    const raw = h.completed_dates;
    const dates = Array.isArray(raw)
      ? raw.filter((x): x is string => typeof x === "string")
      : [];
    if (dates.includes(expectedDateKey)) continue;

    const { data: existing } = await supabase
      .from("streak_reminder_log")
      .select("user_id")
      .eq("user_id", h.user_id)
      .eq("habit_id", h.id)
      .eq("reminder_date", expectedDateKey)
      .maybeSingle();

    if (existing) continue;

    const { error: logErr } = await supabase.from("streak_reminder_log").insert({
      user_id: h.user_id,
      habit_id: h.id,
      reminder_date: expectedDateKey,
    });

    if (logErr) {
      if (logErr.code === "23505") continue;
      console.warn("[streak-reminders] log skip", logErr.message);
      continue;
    }

    const { error: nErr } = await supabase.from("notifications").insert({
      user_id: h.user_id,
      type: "streak_window_reminder",
      payload: {
        schema: "habitpro.notification.v1",
        kind: "streak_window_reminder",
        habit_id: h.id,
        habit_title: h.title,
        reminder_date: expectedDateKey,
      },
    });

    if (nErr) {
      console.error("[streak-reminders] notification", nErr);
      await supabase
        .from("streak_reminder_log")
        .delete()
        .eq("user_id", h.user_id)
        .eq("habit_id", h.id)
        .eq("reminder_date", expectedDateKey);
      continue;
    }

    inserted++;
  }

  return new Response(JSON.stringify({ ok: true, reminders: inserted }), {
    status: 200,
    headers: { ...corsHeaders(), "Content-Type": "application/json" },
  });
});

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-cron-secret",
  };
}
