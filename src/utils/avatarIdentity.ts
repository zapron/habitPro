/**
 * Deterministic per-person color identity for avatar circles. Without this,
 * every user in social surfaces (leaderboard, squads, community feed) renders
 * as an identical gray circle, making people visually indistinguishable.
 */

const AVATAR_HUES = [
  "#F472B6", // rose
  "#FB923C", // tangerine
  "#FBBF24", // gold
  "#A3E635", // lime
  "#34D399", // emerald
  "#2DD4BF", // teal
  "#38BDF8", // sky
  "#818CF8", // periwinkle
  "#C084FC", // violet
  "#F87171", // coral
  "#4ADE80", // green
  "#FB7185", // watermelon
] as const;

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace("#", "");
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

function rgba(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export type AvatarIdentity = {
  /** Saturated hue, for text/icon foreground. */
  foreground: string;
  /** Tinted background for the avatar circle. */
  background: string;
  /** Tinted border for the avatar circle. */
  border: string;
};

/**
 * Deterministic avatar color identity from a stable identifier — pass the
 * user id when available (preferred, stable across renames), falling back to
 * a username/display name.
 */
export function avatarIdentityFor(identifier: string | null | undefined): AvatarIdentity {
  const seed = identifier && identifier.length > 0 ? identifier : "habitpro";
  const hue = AVATAR_HUES[hashString(seed) % AVATAR_HUES.length];
  return {
    foreground: hue,
    background: rgba(hue, 0.18),
    border: rgba(hue, 0.42),
  };
}
