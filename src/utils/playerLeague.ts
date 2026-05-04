import type { AppTheme } from "../styles/theme";

export function playerLeagueForLevel(level: number, theme: AppTheme, isDark: boolean) {
  if (level >= 25) {
    return {
      label: "Mythic League",
      color: theme.colors.indigo[400],
      backgroundColor: isDark ? "rgba(99, 102, 241, 0.16)" : "rgba(99, 102, 241, 0.09)",
    };
  }
  if (level >= 15) {
    return {
      label: "Gold League",
      color: theme.colors.amber[500],
      backgroundColor: isDark ? "rgba(245, 158, 11, 0.15)" : "rgba(245, 158, 11, 0.11)",
    };
  }
  if (level >= 8) {
    return {
      label: "Silver League",
      color: theme.colors.cyan[400],
      backgroundColor: isDark ? "rgba(34, 211, 238, 0.13)" : "rgba(8, 145, 178, 0.09)",
    };
  }
  if (level >= 3) {
    return {
      label: "Bronze League",
      color: theme.colors.yellow[400],
      backgroundColor: isDark ? "rgba(217, 119, 6, 0.14)" : "rgba(180, 83, 9, 0.08)",
    };
  }
  return {
    label: "Rookie League",
    color: theme.colors.textMuted,
    backgroundColor: isDark ? "rgba(148, 163, 184, 0.08)" : "rgba(148, 163, 184, 0.12)",
  };
}
