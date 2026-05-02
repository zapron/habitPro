/// <reference path="../deno-ambient.d.ts" />
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

// @ts-expect-error Deno resolves https:// imports; workspace TypeScript does not.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const ENTITLEMENT_ID = "habitpro_community";
const COMMUNITY_PRODUCT_IDS = new Set([
  "monthly",
  "monthly:monthly-base",
  "yearly",
  "yearly:yearly-base",
]);

type RevenueCatEventPayload = {
  event?: {
    id?: string;
    type?: string;
    app_user_id?: string;
    entitlement_ids?: string[];
    expiration_at_ms?: number | null;
    purchased_at_ms?: number | null;
    original_app_user_id?: string | null;
    product_id?: string | null;
    store?: string | null;
    cancel_reason?: string | null;
    expiration_reason?: string | null;
  };
};

type PremiumDecision = {
  isPremium: boolean | null;
  skipped?: string;
};

const GRANT_ACCESS_EVENTS = new Set([
  "INITIAL_PURCHASE",
  "NON_RENEWING_PURCHASE",
  "RENEWAL",
  "PRODUCT_CHANGE",
  "TRIAL_STARTED",
  "TRIAL_CONVERTED",
  "UNCANCELLATION",
  "SUBSCRIPTION_EXTENDED",
  "TEMPORARY_ENTITLEMENT_GRANT",
]);

const REVOKE_ACCESS_EVENTS = new Set([
  "EXPIRATION",
  "REFUND",
]);

function normalizeEventType(value: unknown): string {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

function normalizeReason(value: unknown): string {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

function normalizeProductId(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function getExpirationMs(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isFutureOrUnknownExpiration(expiresAtMs: number | null): boolean {
  return expiresAtMs == null || expiresAtMs > Date.now();
}

function decidePremium(evt: NonNullable<RevenueCatEventPayload["event"]>): PremiumDecision {
  const eventType = normalizeEventType(evt.type);
  const entitlementIds = Array.isArray(evt.entitlement_ids) ? evt.entitlement_ids : [];
  const hasEntitlement = entitlementIds.includes(ENTITLEMENT_ID);
  const productId = normalizeProductId(evt.product_id);
  const hasKnownProduct = productId ? COMMUNITY_PRODUCT_IDS.has(productId) : false;
  const expiresAtMs = getExpirationMs(evt.expiration_at_ms);

  if (entitlementIds.length > 0 && !hasEntitlement) {
    return { isPremium: null, skipped: "unrelated_entitlement" };
  }

  if (entitlementIds.length === 0 && productId && !hasKnownProduct) {
    return { isPremium: null, skipped: "unrelated_product" };
  }

  if (entitlementIds.length === 0 && !hasKnownProduct && eventType !== "TRANSFER") {
    return { isPremium: null, skipped: "missing_entitlement_or_product" };
  }

  if (REVOKE_ACCESS_EVENTS.has(eventType)) {
    return { isPremium: false };
  }

  if (GRANT_ACCESS_EVENTS.has(eventType)) {
    return { isPremium: isFutureOrUnknownExpiration(expiresAtMs) };
  }

  if (eventType === "CANCELLATION") {
    const cancelReason = normalizeReason(evt.cancel_reason);
    if (cancelReason === "CUSTOMER_SUPPORT") {
      return { isPremium: false };
    }
    return { isPremium: isFutureOrUnknownExpiration(expiresAtMs) };
  }

  if (eventType === "TRIAL_CANCELLED") {
    return { isPremium: isFutureOrUnknownExpiration(expiresAtMs) };
  }

  if (eventType === "BILLING_ISSUE" || eventType === "SUBSCRIPTION_PAUSED" || eventType === "TRANSFER") {
    if (expiresAtMs != null && expiresAtMs <= Date.now()) {
      return { isPremium: false };
    }
    return { isPremium: null, skipped: `no_access_change_${eventType.toLowerCase()}` };
  }

  if (hasEntitlement) {
    return { isPremium: isFutureOrUnknownExpiration(expiresAtMs) };
  }

  return { isPremium: null, skipped: eventType ? `unsupported_event_${eventType.toLowerCase()}` : "missing_event_type" };
}

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

  const premiumDecision = decidePremium(evt);
  if (premiumDecision.isPremium == null) {
    console.log("[revenuecat-webhook] skipped", {
      skipped: premiumDecision.skipped,
      eventId: evt.id ?? null,
      eventType: evt.type ?? null,
      appUserId,
    });
    return new Response(JSON.stringify({ ok: true, skipped: premiumDecision.skipped }), {
      status: 200,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
    });
  }

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
      is_premium: premiumDecision.isPremium,
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

