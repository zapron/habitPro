import { Share } from "react-native";
import { getHabitProWebUrl } from "./env";

type InviteShareParams = {
  type: "live_mini" | "challenge";
  path: string;
  fromUsername: string;
  title: string;
};

export function buildInviteShareUrl({ type, path, fromUsername, title }: InviteShareParams): string {
  const base = getHabitProWebUrl();
  const params = new URLSearchParams({
    type,
    path: path.replace(/^\/+/, ""),
    from: fromUsername,
    title,
  });
  return `${base}/invite?${params.toString()}`;
}

export async function shareInviteLink(params: InviteShareParams): Promise<boolean> {
  const url = buildInviteShareUrl(params);
  const kind = params.type === "challenge" ? "mission challenge" : "Live Squad mini mission";
  const message = `${params.fromUsername} started "${params.title}" on HabitPro (${kind}). Join in: ${url}`;
  try {
    // Only `message` — passing `url` as a second field makes iOS attach it as its
    // own share item, which shows up as a raw, unresolved link ahead of this text.
    const result = await Share.share({ message });
    return result.action === Share.sharedAction;
  } catch {
    return false;
  }
}
