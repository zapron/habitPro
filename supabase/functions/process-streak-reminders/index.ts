/// <reference path="../deno-ambient.d.ts" />
/**
 * Scheduled Edge Function: mission streak reminders.
 * New calendar-day missions (`habits.mission_timezone`) reset at local midnight with a grace creation day.
 * Legacy missions without `mission_timezone` keep the rolling 24h window.
 *
 * No new "window opened" reminders are emitted. Only user custom reminders and last-hour safety reminders run.
 *
 * `profiles.timezone` aligns `YYYY-MM-DD` keys with the client grid.
 *
 * Schedule with header x-cron-secret. Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// @ts-expect-error Deno resolves https:// imports; workspace TypeScript does not.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  addCalendarDaysToDateKey,
  calendarDateKeyForTimestamp,
  calendarDayEndUtcMsForDateKey,
  calendarDaysBetween,
  missionDayDateKey,
} from "../_shared/missionCalendarKeys.ts";

type Supabase = ReturnType<typeof createClient>;

const MS_PER_MISSION_DAY = 24 * 60 * 60 * 1000;
const MS_REMINDER_WINDOW = 60 * 60 * 1000;
const MS_DEBUG_INTERVAL = 10 * 60 * 1000;
const DEFAULT_CRON_INTERVAL_MINUTES = 10;

function cronIntervalMinutes(): number {
  const raw = Deno.env.get("CRON_INTERVAL_MINUTES");
  const n = raw ? Number(raw) : NaN;
  if (Number.isFinite(n) && n >= 1 && n <= 60) return Math.floor(n);
  return DEFAULT_CRON_INTERVAL_MINUTES;
}

type HabitRow = {
  id: string;
  user_id: string;
  title: string;
  start_date: string;
  total_days: number;
  completed_dates: string[] | null;
  challenge_group_id?: string | null;
  challenge_creator_timezone?: string | null;
  mission_timezone?: string | null;
  reminder_enabled?: boolean | null;
  reminder_time_local?: string | null;
};

type ReminderKind = "slot_closing" | "custom_time" | "debug_10m";

type ActiveMissionDay = {
  slot: number;
  dateKey: string;
  slotEndMs: number;
  creationGrace: boolean;
};

function parseTimeHHMM(v: unknown): { hh: number; mm: number } | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(s);
  if (!m) return null;
  return { hh: Number(m[1]), mm: Number(m[2]) };
}

function getLocalHHMM(nowMs: number, tz: string): { hh: number; mm: number } | null {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
    }).formatToParts(new Date(nowMs));
    const hh = Number(parts.find((p) => p.type === "hour")?.value ?? "");
    const mm = Number(parts.find((p) => p.type === "minute")?.value ?? "");
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
    if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
    return { hh, mm };
  } catch {
    return null;
  }
}

function minutesLeft(nowMs: number, slotEndMs: number): number {
  return Math.max(0, Math.ceil((slotEndMs - nowMs) / 60_000));
}

function formatMinutesLeftLabel(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  const minutes = Math.max(1, Math.round(value));
  const hh = Math.floor(minutes / 60);
  const mm = minutes % 60;
  if (hh > 0 && mm > 0) return `${hh}h ${mm}m`;
  if (hh > 0) return `${hh}h`;
  return `${mm}m`;
}

function streakReminderDisplay(
  habitTitle: string,
  phase: "open" | "closing" | "custom",
  payload: Record<string, unknown>,
): { title: string; body: string } {
  if (phase === "open") {
    return {
      title: "Streak window is open",
      body: `You have 24 hours to finish today's habit for "${habitTitle}".`,
    };
  }

  if (phase === "custom") {
    const left = formatMinutesLeftLabel(payload.minutes_left);
    return {
      title: "Streak check-in",
      body: left
        ? `You have ${left} left to mark today for "${habitTitle}".`
        : `Time to mark today for "${habitTitle}".`,
    };
  }

  return {
    title: "Almost time's up",
    body: `You have almost an hour left. Complete your streak for "${habitTitle}".`,
  };
}

function isTimeInNextWindow(
  now: { hh: number; mm: number },
  target: { hh: number; mm: number },
  windowMinutes: number,
): boolean {
  const w = Math.max(1, Math.min(60, Math.floor(windowMinutes)));
  const nowMin = now.hh * 60 + now.mm;
  const targetMin = target.hh * 60 + target.mm;
  const end = nowMin + w;
  if (end < 1440) {
    return targetMin >= nowMin && targetMin < end;
  }
  // Wraps across midnight.
  const endWrapped = end % 1440;
  return targetMin >= nowMin || targetMin < endWrapped;
}

function getRollingActiveMissionDaySlot(startIso: string, nowMs: number, totalDays: number): number | null {
  const td = Math.max(1, totalDays);
  const startMs = new Date(startIso).getTime();
  if (!Number.isFinite(startMs)) return null;
  const elapsed = Math.max(0, nowMs - startMs);
  const rawSlot = Math.floor(elapsed / MS_PER_MISSION_DAY) + 1;
  if (rawSlot > td) return null;
  return Math.max(1, rawSlot);
}

function hasCalendarDayModel(h: HabitRow): boolean {
  return typeof h.mission_timezone === "string" && h.mission_timezone.trim().length > 0;
}

function reminderTimeZoneForHabit(h: HabitRow, profileTz: string | null | undefined): string {
  const missionTz = h.mission_timezone?.trim();
  if (missionTz) return missionTz;
  const groupTz = h.challenge_creator_timezone?.trim();
  if (groupTz) return groupTz;
  return profileTz || "UTC";
}

function getCalendarActiveMissionDay(
  h: HabitRow,
  nowMs: number,
  totalDays: number,
  timeZone: string,
  dates: string[],
): ActiveMissionDay | null {
  const createdKey = missionDayDateKey(h.start_date, 0, timeZone);
  if (!createdKey) return null;
  const todayKey = calendarDateKeyForTimestamp(nowMs, timeZone);
  if (todayKey < createdKey) return null;

  const creationCompleted = dates.includes(createdKey);
  let slot: number;
  let dateKey: string;
  let creationGrace = false;

  if (creationCompleted) {
    slot = calendarDaysBetween(createdKey, todayKey) + 1;
    dateKey = todayKey;
  } else if (todayKey === createdKey) {
    slot = 1;
    dateKey = createdKey;
    creationGrace = true;
  } else {
    const firstRequiredKey = addCalendarDaysToDateKey(createdKey, 1);
    slot = calendarDaysBetween(firstRequiredKey, todayKey) + 1;
    dateKey = todayKey;
  }

  if (slot > totalDays) return null;
  return {
    slot: Math.max(1, slot),
    dateKey,
    slotEndMs: calendarDayEndUtcMsForDateKey(dateKey, timeZone),
    creationGrace,
  };
}

function getRollingActiveMissionDay(
  h: HabitRow,
  nowMs: number,
  totalDays: number,
  timeZone: string,
): ActiveMissionDay | null {
  const slot = getRollingActiveMissionDaySlot(h.start_date, nowMs, totalDays);
  if (slot == null) return null;
  const startMs = new Date(h.start_date).getTime();
  if (!Number.isFinite(startMs)) return null;
  const dateKey = missionDayDateKey(h.start_date, slot - 1, timeZone);
  if (!dateKey) return null;
  return {
    slot,
    dateKey,
    slotEndMs: startMs + slot * MS_PER_MISSION_DAY,
    creationGrace: false,
  };
}

function debugBucketKey(nowMs: number): string {
  const bucketStart = Math.floor(nowMs / MS_DEBUG_INTERVAL) * MS_DEBUG_INTERVAL;
  // YYYY-MM-DDTHH:MM (UTC) - stable text key
  const iso = new Date(bucketStart).toISOString();
  return iso.slice(0, 16);
}

async function insertStreakReminderIfEligible(
  supabase: Supabase,
  h: HabitRow,
  logKey: string,
  reminderDateKey: string,
  dates: string[],
  reminderKind: ReminderKind,
  reminderPhase: "open" | "closing" | "custom",
  extraPayload?: Record<string, unknown>,
): Promise<boolean> {
  // No reminders if this mission day is already marked in `completed_dates` (same YYYY-MM-DD key as the grid).
  if (dates.includes(reminderDateKey)) return false;

  const { error: logErr } = await supabase.from("streak_reminder_log").insert({
    user_id: h.user_id,
    habit_id: h.id,
    reminder_date: logKey,
    reminder_kind: reminderKind,
  });

  if (logErr) {
    if (logErr.code === "23505") return false;
    console.warn("[streak-reminders] log skip", logErr.message);
    return false;
  }

  const reminderPayload = extraPayload ?? {};
  const display = streakReminderDisplay(h.title || "Your mission", reminderPhase, reminderPayload);

  const { error: nErr } = await supabase.from("notifications").insert({
    user_id: h.user_id,
    type: "streak_window_reminder",
    payload: {
      schema: "habitpro.notification.v1",
      kind: "streak_window_reminder",
      habit_id: h.id,
      habit_title: h.title,
      reminder_date: reminderDateKey,
      reminder_phase: reminderPhase,
      ...reminderPayload,
      display_title: display.title,
      display_body: display.body,
    },
  });

  if (nErr) {
    console.error("[streak-reminders] notification", nErr);
    await supabase
      .from("streak_reminder_log")
      .delete()
      .eq("user_id", h.user_id)
      .eq("habit_id", h.id)
      .eq("reminder_date", logKey)
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
    .select("id, user_id, title, start_date, total_days, completed_dates, challenge_group_id, challenge_creator_timezone, mission_timezone, reminder_enabled, reminder_time_local")
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
    .select("id, timezone, debug_streak_reminders")
    .in("id", userIds);

  const tzByUser = new Map<string, string | null>();
  const debugUsers = new Set<string>();
  for (const p of profiles ?? []) {
    tzByUser.set(p.id, p.timezone ?? null);
    if ((p as { debug_streak_reminders?: boolean }).debug_streak_reminders === true) {
      debugUsers.add(p.id);
    }
  }

  const nowMs = Date.now();
  let inserted = 0;

  for (const h of habits as HabitRow[]) {
    const tz = reminderTimeZoneForHabit(h, tzByUser.get(h.user_id));
    const totalDays = Math.max(1, h.total_days ?? 21);
    const raw = h.completed_dates;
    const dates = Array.isArray(raw)
      ? raw.filter((x): x is string => typeof x === "string")
      : [];
    const activeDay = hasCalendarDayModel(h)
      ? getCalendarActiveMissionDay(h, nowMs, totalDays, tz, dates)
      : getRollingActiveMissionDay(h, nowMs, totalDays, tz);
    if (!activeDay) continue;
    const { dateKey: expectedDateKey, slotEndMs, creationGrace } = activeDay;

    // Debug mode: user-scoped frequent reminders every 10 minutes while the slot is open
    // (and the day is not yet completed). This is ONLY for profiles.debug_streak_reminders = true.
    if (debugUsers.has(h.user_id)) {
      if (!dates.includes(expectedDateKey)) {
        const bucket = debugBucketKey(nowMs);
        const ok = await insertStreakReminderIfEligible(
          supabase,
          h,
          bucket,
          expectedDateKey,
          dates,
          "debug_10m",
          "open",
        );
        if (ok) {
          inserted++;
        }
      }
      continue;
    }

    // Normal mode:
    // If reminder_enabled=true with reminder_time_local, send custom_time at the chosen time.
    // All required days also get a last-hour safety reminder.
    // Calendar-day creation grace gets custom reminder only if the chosen time is still ahead,
    // and never gets the last-hour reminder.

    const reminderEnabled = (h as { reminder_enabled?: boolean | null }).reminder_enabled === true;
    const reminderTime = parseTimeHHMM((h as { reminder_time_local?: string | null }).reminder_time_local);
    const hasCustom = reminderEnabled && reminderTime !== null;

    if (hasCustom) {
      const nowLocal = getLocalHHMM(nowMs, tz);
      // Cron can run every N minutes (e.g. 10/15). Use a window so custom reminders aren't missed.
      // Example: cron every 10m, user picks 10:07 → the 10:00 run should still deliver.
      const windowMin = cronIntervalMinutes();
      if (nowLocal && isTimeInNextWindow(nowLocal, reminderTime, windowMin)) {
        const ok = await insertStreakReminderIfEligible(
          supabase,
          h,
          expectedDateKey,
          expectedDateKey,
          dates,
          "custom_time",
          "custom",
          { minutes_left: minutesLeft(nowMs, slotEndMs) },
        );
        if (ok) inserted++;
      }

      if (!creationGrace && nowMs >= slotEndMs - MS_REMINDER_WINDOW && nowMs < slotEndMs) {
        const ok = await insertStreakReminderIfEligible(
          supabase,
          h,
          expectedDateKey,
          expectedDateKey,
          dates,
          "slot_closing",
          "closing",
          { minutes_left: minutesLeft(nowMs, slotEndMs) },
        );
        if (ok) inserted++;
      }
      continue;
    }

    if (!creationGrace && nowMs >= slotEndMs - MS_REMINDER_WINDOW && nowMs < slotEndMs) {
      const ok = await insertStreakReminderIfEligible(
        supabase,
        h,
        expectedDateKey,
        expectedDateKey,
        dates,
        "slot_closing",
        "closing",
        { minutes_left: minutesLeft(nowMs, slotEndMs) },
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
