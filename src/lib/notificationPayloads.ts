/**
 * Canonical notification payloads stored in Supabase `notifications.payload` and, later,
 * the same JSON can be sent through FCM/APNs (system push) without reshaping the app model.
 *
 * Keep `kind` aligned with `notifications.type` where they match.
 */

export const NOTIFICATION_SCHEMA = "habitpro.notification.v1" as const;

/** community_win_cheer — someone cheered your published win */
export type CommunityWinCheerPayload = {
  schema: typeof NOTIFICATION_SCHEMA;
  kind: "community_win_cheer";
  win_id: string;
  cheer_id: string;
  from_user_id: string;
  from_username: string;
  mini_mission_title: string;
  created_at?: string;
};

export function parseCommunityWinCheerPayload(
  raw: Record<string, unknown>,
): CommunityWinCheerPayload | null {
  const looksLikeCheer =
    raw.kind === "community_win_cheer" ||
    (raw.kind === undefined && typeof raw.win_id === "string");
  if (!looksLikeCheer) return null;
  const win_id = typeof raw.win_id === "string" ? raw.win_id : "";
  const cheer_id = typeof raw.cheer_id === "string" ? raw.cheer_id : "";
  const from_user_id = typeof raw.from_user_id === "string" ? raw.from_user_id : "";
  const from_username =
    typeof raw.from_username === "string" && raw.from_username.length > 0
      ? raw.from_username
      : "someone";
  const mini_mission_title =
    typeof raw.mini_mission_title === "string" && raw.mini_mission_title.length > 0
      ? raw.mini_mission_title
      : "Mini mission";
  if (!win_id || !cheer_id || !from_user_id) return null;
  return {
    schema: NOTIFICATION_SCHEMA,
    kind: "community_win_cheer",
    win_id,
    cheer_id,
    from_user_id,
    from_username,
    mini_mission_title,
    ...(typeof raw.created_at === "string" ? { created_at: raw.created_at } : {}),
  };
}
