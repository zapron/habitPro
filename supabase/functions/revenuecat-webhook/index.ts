/**
 * Supabase Edge Function: RevenueCat webhook → update profiles.is_premium (+ expiry).
 *
 * Secrets:
 * - SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY
 * - REVENUECAT_WEBHOOK_SECRET (must match RevenueCat webhook auth header)
 *
 * RevenueCat:
 * - Set webhook Authorization header: `Bearer <REVENUECAT_WEBHOOK_SECRET>`
 * - Ensure Purchases.logIn(app_user_id) uses Supabase auth uid (we do that client-side)
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const ENTITLEMENT_ID = "habitpro_community";

type RevenueCatEventPayload = {
  event?: {
    type?: string;
    app_user_id?: string;
    entitlement_ids?: string[];
    expiration_at_ms?: number | null;
    purchased_at_ms?: number | null;
    original_app_user_id?: string | null;
    product_id?: string | null;
    store?: string | null;
  };
};

function getBearerToken(req: Request): string {
  const raw = req.headers.get("authorization") ?? "";
  const m = raw.match(/^bearer\s+(.+)$/i);
  return (m?.[1] ?? "").trim();
}

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders() });
  }

  const secret = Deno.env.get("REVENUECAT_WEBHOOK_SECRET") ?? "";
  const got = getBearerToken(req);
  if (!secret || !got || got !== secret) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
    });
  }

  let body: RevenueCatEventPayload;
  try {
    body = (await req.json()) as RevenueCatEventPayload;
  } catch {
    return new Response(JSON.stringify({ error: "invalid json" }), {
      status: 400,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
    });
  }

  const evt = body.event ?? {};
  const appUserId = typeof evt.app_user_id === "string" ? evt.app_user_id.trim() : "";
  if (!appUserId) {
    return new Response(JSON.stringify({ ok: true, skipped: "missing_app_user_id" }), {
      status: 200,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
    });
  }

  const entitlementIds = Array.isArray(evt.entitlement_ids) ? evt.entitlement_ids : [];
  const hasEntitlement = entitlementIds.includes(ENTITLEMENT_ID);

  // If entitlement list includes our entitlement, mark premium; otherwise revoke.
  // (RevenueCat will send updates for renewals/cancellations/expirations; this is best-effort.)
  const isPremium = hasEntitlement;

  const expiresAt =
    typeof evt.expiration_at_ms === "number" && Number.isFinite(evt.expiration_at_ms)
      ? new Date(evt.expiration_at_ms).toISOString()
      : null;

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const { error } = await supabase
    .from("profiles")
    .update({
      is_premium: isPremium,
      premium_expires_at: expiresAt,
      premium_source: "revenuecat",
      rc_app_user_id: appUserId,
    })
    .eq("id", appUserId);

  if (error) {
    console.error("[revenuecat-webhook] update failed", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders(), "Content-Type": "application/json" },
  });
});

