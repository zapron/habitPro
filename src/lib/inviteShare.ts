import { Platform, Share } from "react-native";
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
  try {
    if (Platform.OS === "ios") {
      // `url` as its own field (not embedded in the message text) makes iOS hand this
      // off as a real NSURL share item — tappable via AirDrop/Notes/Messages. The prior
      // message-only form (url typed into the sentence) shared as plain text instead,
      // which a real user report caught: AirDropping it left the receiver with inert
      // text, and pasting that into Google searched it instead of opening the link.
      const message = `${params.fromUsername} started "${params.title}" on HabitPro (${kind}). Join in:`;
      const result = await Share.share({ message, url });
      return result.action === Share.sharedAction;
    }
    // Android's Share module has no separate `url` field, and its share intent already
    // auto-linkifies a URL inside plain text — no change needed here.
    const message = `${params.fromUsername} started "${params.title}" on HabitPro (${kind}). Join in: ${url}`;
    const result = await Share.share({ message });
    return result.action === Share.sharedAction;
  } catch {
    return false;
  }
}
