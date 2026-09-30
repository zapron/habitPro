/**
 * Palette from the "habitPro light mode redesign" Claude Design mockup
 * (claude.ai/design), light + dark variants straight from that project's
 * `renderVals()` (accent tint/shade math included). Applied screen-by-screen
 * as each one gets previewed — not merged into `theme.ts`, so any screen that
 * doesn't opt in is unaffected.
 */
export type RedesignPaletteVariant = {
  screenBg: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  chipBg: string;
  trackBg: string;
  accent: string;
  accentDark: string;
  accentTint: string;
};

export const redesignPalette: { light: RedesignPaletteVariant; dark: RedesignPaletteVariant } = {
  light: {
    screenBg: "#ffffff",
    border: "#ece9e3",
    textPrimary: "#1c1b1f",
    textSecondary: "#4a4850",
    textMuted: "#8b8894",
    chipBg: "#f5f3ee",
    trackBg: "#eeece7",
    /** Preview: maroon variant, matches `theme.ts`'s minimalist-light
     * `indigo` alias for this comparison pass. */
    accent: "#6E1727",
    accentDark: "#5D1421",
    accentTint: "#f7eef0",
  },
  dark: {
    screenBg: "#17161c",
    border: "#28262f",
    textPrimary: "#f2f1f5",
    textSecondary: "#c7c4d1",
    textMuted: "#847f91",
    chipBg: "#211f28",
    trackBg: "#2a2832",
    /** Preview: maroon variant, matches `theme.ts`'s minimalist-dark
     * `indigo` alias for this comparison pass. */
    accent: "#8E1D33",
    accentDark: "#B3243F",
    accentTint: "#2a1015",
  },
};
