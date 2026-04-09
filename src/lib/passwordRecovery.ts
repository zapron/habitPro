import type { Session } from "@supabase/supabase-js";

/** Decode JWT payload (React Native–safe base64url). */
function decodeJwtPayload(accessToken: string): Record<string, unknown> {
  const parts = accessToken.split(".");
  if (parts.length < 2) throw new Error("invalid jwt");
  let base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  const pad = base64.length % 4;
  if (pad) base64 += "=".repeat(4 - pad);
  const json = atob(base64);
  return JSON.parse(json) as Record<string, unknown>;
}

/**
 * PKCE `exchangeCodeForSession` always emits SIGNED_IN, not PASSWORD_RECOVERY (gotrue-js).
 * Recovery sessions are identified via JWT `amr` (Authentication Method References).
 */
export function isPasswordRecoverySession(session: Session | null | undefined): boolean {
  if (!session?.access_token) return false;
  try {
    const payload = decodeJwtPayload(session.access_token);
    const amr = payload.amr;
    if (!Array.isArray(amr)) return false;
    return amr.some((entry) => {
      if (typeof entry === "string") return entry === "recovery";
      if (entry && typeof entry === "object" && "method" in entry) {
        return (entry as { method?: string }).method === "recovery";
      }
      return false;
    });
  } catch {
    return false;
  }
}
