import { fontFamily } from "./fonts";

/**
 * Appends a precise alpha channel to a 6-digit hex color, e.g.
 * `withAlpha("#7C5CF2", 20)` -> `"#7C5CF233"`. Use this instead of hand-picking
 * an `rgba(...)` literal for a tinted background/border/badge.
 *
 * Hand-picked rgba literals are how this app ended up with the same tint
 * (e.g. an indigo wash, a cyan badge) written dozens of times across screens
 * with slightly different RGB values each time — several of which turned out
 * to be stock Tailwind colors (`rgba(99,102,241,...)`) rather than this app's
 * actual indigo token (`#7C5CF2`/`#5B3FDE`), because nothing tied the literal
 * back to the real palette. Deriving the tint from the token itself instead
 * makes that class of drift structurally impossible.
 */
export function withAlpha(hex: string, alphaPercent: number): string {
  const clamped = Math.max(0, Math.min(100, alphaPercent));
  const alphaHex = Math.round((clamped / 100) * 255)
    .toString(16)
    .padStart(2, "0")
    .toUpperCase();
  return `${hex}${alphaHex}`;
}

/** Shared (non-color) design tokens. Plus Jakarta Sans — see `AppText` + `fontAssets` in root layout. */
const tokens = {
  spacing: { xs: 8, sm: 12, md: 16, lg: 24, xl: 32 },
  radius: { xs: 8, sm: 12, md: 16, lg: 20, xl: 24, pill: 9999 },
  typography: { h1: 30, h2: 22, h3: 18, body: 16, caption: 13, micro: 11 },
  letterSpacing: { tight: -0.35, label: 0.85, wide: 0.5 } as const,
  /** Prefer these over ad hoc sizes for Lucide icons in rows, headers, chips */
  icon: { xs: 12, sm: 14, md: 18, lg: 20, xl: 22 },
  fontFamily,
} as const;

/* ── Color palette shape ── */
type ColorPalette = {
  background: string;
  surface: string;
  surfaceElevated: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  slate: {
    900: string;
    800: string;
    750: string;
    700: string;
    600: string;
    500: string;
    400: string;
    200: string;
  };
  indigo: { 400: string; 500: string; 600: string };
  cyan: { 400: string; 500: string };
  amber: { 500: string };
  yellow: { 400: string };
  red: { 500: string };
  green: { 500: string; 600: string };
  white: string;
  scrim: string;
  sheen: string;
};

type ShadowSet = {
  glow: {
    shadowColor: string;
    shadowOffset: { width: number; height: number };
    shadowOpacity: number;
    shadowRadius: number;
    elevation: number;
  };
  card: {
    shadowColor: string;
    shadowOffset: { width: number; height: number };
    shadowOpacity: number;
    shadowRadius: number;
    elevation: number;
  };
};

/* ── Dark palette (original) ── */
const darkColors: ColorPalette = {
  background: "#070b14",
  surface: "#111827",
  surfaceElevated: "#172033",
  border: "#24324a",
  textPrimary: "#f8fafc",
  textSecondary: "#94a3b8",
  textMuted: "#64748b",
  slate: {
    900: "#0f172a",
    800: "#1e293b",
    750: "#2d3a52",
    700: "#334155",
    600: "#475569",
    500: "#64748b",
    400: "#94a3b8",
    200: "#e2e8f0",
  },
  indigo: { 400: "#9B8AFB", 500: "#7C5CF2", 600: "#6144E0" },
  cyan: { 400: "#2DD9E8", 500: "#0FB8CE" },
  amber: { 500: "#F0940A" },
  yellow: { 400: "#fbbf24" },
  red: { 500: "#ef4444" },
  green: { 500: "#22c55e", 600: "#16a34a" },
  white: "#ffffff",
  /** Modal/sheet backdrop dimming base — always a dark tint regardless of theme; callers apply their own withAlpha() opacity. */
  scrim: "#000000",
  /** Glass-highlight base — light catches as white on a dark card; each caller picks its own opacity via withAlpha(). */
  sheen: "#ffffff",
};

/* ── Light palette (new) ── */
const lightColors: ColorPalette = {
  background: "#f8fafc",
  surface: "#ffffff",
  surfaceElevated: "#f1f5f9",
  border: "#e2e8f0",
  textPrimary: "#0f172a",
  textSecondary: "#475569",
  textMuted: "#94a3b8",
  slate: {
    900: "#f8fafc",
    800: "#f1f5f9",
    750: "#e8edf4",
    700: "#e2e8f0",
    600: "#cbd5e1",
    500: "#94a3b8",
    400: "#64748b",
    200: "#1e293b",
  },
  indigo: { 400: "#6D56E8", 500: "#5B3FDE", 600: "#4C2FC9" },
  cyan: { 400: "#0C86A8", 500: "#106E8C" },
  amber: { 500: "#D1720A" },
  yellow: { 400: "#eab308" },
  red: { 500: "#dc2626" },
  green: { 500: "#16a34a", 600: "#15803d" },
  white: "#ffffff",
  /** Same dark-ink tone serves both jobs in light mode — there's no separate "light scrim" concept the way dark mode needs pure black vs. pure white. */
  scrim: "#0f172a",
  sheen: "#0f172a",
};

const darkShadow: ShadowSet = {
  glow: {
    shadowColor: "#7C5CF2",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 8,
  },
  card: {
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 5,
  },
};

const lightShadow: ShadowSet = {
  glow: {
    shadowColor: "#5B3FDE",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 14,
    elevation: 6,
  },
  card: {
    shadowColor: "#94a3b8",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 3,
  },
};

/** Full theme object shape. */
export type AppTheme = {
  colors: ColorPalette;
  shadow: ShadowSet;
  spacing: typeof tokens.spacing;
  radius: typeof tokens.radius;
  typography: typeof tokens.typography;
  letterSpacing: typeof tokens.letterSpacing;
  icon: typeof tokens.icon;
  fontFamily: typeof fontFamily;
};

export const darkTheme: AppTheme = {
  colors: darkColors,
  shadow: darkShadow,
  ...tokens,
};
export const lightTheme: AppTheme = {
  colors: lightColors,
  shadow: lightShadow,
  ...tokens,
};

/** Backwards-compat default export — components migrating to useTheme() can drop this. */
export const theme = darkTheme;
