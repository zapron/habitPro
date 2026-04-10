/**
 * Scheduled Edge Function: mission streak reminders (rolling 24h from `start_date`, same as
 * `src/utils/missionDaySlots.ts`). From **mission day 2 onward** only:
 * - **slot_open:** first hour after the current mission day starts — “window is open”
 * - **slot_closing:** last hour before that day ends — “almost an hour left”
 * Mission day 1 is skipped (user just created the mission).
 *
 * `profiles.timezone` aligns `YYYY-MM-DD` keys with the client grid.
 *
 * Schedule with header x-cron-secret. Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

type Supabase = ReturnType<typeof createClient>;

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

type ReminderKind = "slot_open" | "slot_closing";

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

function addCalendarDaysYmd(y: number, m: number, d: number, days: number): { y: number; m: number; d: number } {
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

function missionDayDateKey(startIso: string, dayIndexZeroBased: number, timeZone: string): string | null {
  const base = ymdPartsInTz(startIso, timeZone);
  if (!base) return null;
  const { y, m, d } = addCalendarDaysYmd(base.y, base.m, base.d, dayIndexZeroBased);
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

async function insertStreakReminderIfEligible(
  supabase: Supabase,
  h: HabitRow,
  expectedDateKey: string,
  dates: string[],
  reminderKind: ReminderKind,
  reminderPhase: "open" | "closing",
): Promise<boolean> {
  // No reminders if this mission day is already marked in `completed_dates` (same YYYY-MM-DD key as the grid).
  if (dates.includes(expectedDateKey)) return false;

  const { data: existing } = await supabase
    .from("streak_reminder_log")
    .select("user_id")
    .eq("user_id", h.user_id)
    .eq("habit_id", h.id)
    .eq("reminder_date", expectedDateKey)
    .eq("reminder_kind", reminderKind)
    .maybeSingle();

  if (existing) return false;

  const { error: logErr } = await supabase.from("streak_reminder_log").insert({
    user_id: h.user_id,
    habit_id: h.id,
    reminder_date: expectedDateKey,
    reminder_kind: reminderKind,
  });

  if (logErr) {
    if (logErr.code === "23505") return false;
    console.warn("[streak-reminders] log skip", logErr.message);
    return false;
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
      reminder_phase: reminderPhase,
    },
  });

  if (nErr) {
    console.error("[streak-reminders] notification", nErr);
    await supabase
      .from("streak_reminder_log")
      .delete()
      .eq("user_id", h.user_id)
      .eq("habit_id", h.id)
      .eq("reminder_date", expectedDateKey)
      .eq("reminder_kind", reminderKind);
    return false;
  }

  return true;
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
    if (slot == null || slot < 2) continue;

    const startMs = new Date(h.start_date).getTime();
    const slotStartMs = startMs + (slot - 1) * MS_PER_MISSION_DAY;
    const slotEndMs = startMs + slot * MS_PER_MISSION_DAY;

    const expectedDateKey = missionDayDateKey(h.start_date, slot - 1, tz);
    if (!expectedDateKey) continue;

    const raw = h.completed_dates;
    const dates = Array.isArray(raw)
      ? raw.filter((x): x is string => typeof x === "string")
      : [];

    if (nowMs >= slotStartMs && nowMs < slotStartMs + MS_REMINDER_WINDOW) {
      const ok = await insertStreakReminderIfEligible(
        supabase,
        h,
        expectedDateKey,
        dates,
        "slot_open",
        "open",
      );
      if (ok) inserted++;
    }

    if (nowMs >= slotEndMs - MS_REMINDER_WINDOW && nowMs < slotEndMs) {
      const ok = await insertStreakReminderIfEligible(
        supabase,
        h,
        expectedDateKey,
        dates,
        "slot_closing",
        "closing",
      );
      if (ok) inserted++;
    }
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
