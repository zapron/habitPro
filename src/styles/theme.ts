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

/** Widened so a theme pack's `fontFamily` can point its `regular/medium/semibold/bold` slots at a different family entirely (see `minimalistFontFamily`), not just the literal Plus Jakarta Sans postscript names. */
type FontFamilySet = Record<keyof typeof fontFamily, string>;

/**
 * "habitPro redesign" theme pack — Manrope (display) + DM Sans (body) instead
 * of Plus Jakarta Sans everywhere. `AppText` resolves `fontWeight` through
 * whichever `fontFamily` the active theme provides, so this one mapping is
 * all that's needed for every screen's text to switch, with no per-component
 * changes required.
 */
const minimalistFontFamily: FontFamilySet = {
  ...fontFamily,
  regular: fontFamily.dmSansRegular,
  medium: fontFamily.dmSansMedium,
  semibold: fontFamily.dmSansSemibold,
  bold: fontFamily.manropeBold,
};

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
  /** `900` is a deep/dark shade of the same amber — same shade-scale idea as `red[900]`/`green[900]`. */
  amber: { 500: string; 900: string };
  yellow: { 400: string };
  /** `900` is a deep/dark shade of the same hue (not a different color) — for contexts that
   * want the semantic meaning of red without it reading as an alert (e.g. a "failed" status
   * dot sitting next to other calm UI). See `green[900]` for the counterpart. */
  red: { 500: string; 900: string };
  /** `900` is a deep/dark "forest" shade of the same green — same shade-scale idea as `red[900]`.
   * Unlike most tokens here, this one is deliberately NOT identical across light/dark: the same
   * near-black value that blends calmly into a dark surface reads as stark, heavy contrast against
   * a light one, so light mode gets its own lighter forest step to keep the same calm feeling. */
  green: { 500: string; 600: string; 900: string };
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
  amber: { 500: "#F0940A", 900: "#6B4413" },
  yellow: { 400: "#fbbf24" },
  red: { 500: "#ef4444", 900: "#6B1E1E" },
  green: { 500: "#22c55e", 600: "#16a34a", 900: "#1B4332" },
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
  /** Tonal elevation (Material 3 style): a whisper of the brand indigo mixed into the "elevated" surface instead of a flat gray step, so stacked/nested surfaces read as branded depth rather than generic gray. */
  surfaceElevated: "#f3f1fb",
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
  amber: { 500: "#D1720A", 900: "#6B4413" },
  yellow: { 400: "#eab308" },
  red: { 500: "#dc2626", 900: "#6B1E1E" },
  /** `900` is lighter than dark mode's — see the doc comment on `ColorPalette.green` for why. */
  green: { 500: "#16a34a", 600: "#15803d", 900: "#2D6A4F" },
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
  /**
   * A soft, wide, low-opacity "floating card" shadow rather than a tight
   * mid-gray drop shadow — paired with cards dropping their neutral border
   * in light mode (see call sites), so depth reads from one cue (the glow),
   * not a shadow stacked on top of a hairline outline.
   */
  card: {
    shadowColor: "#1e293b",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 3,
  },
};

/**
 * "habitPro redesign" theme pack — from the Claude Design mockup
 * ("habitPro light mode redesign" project): warm neutral ground (not the
 * cool slate-blue base above), one accent (`#5B5BD6`) instead of a
 * multi-step indigo ramp, flat bordered cards instead of shadowed ones.
 * Semantic colors (cyan/amber/yellow/red/green) are carried over from the
 * matching classic palette unchanged — the mockup never redefined them, and
 * inventing new ones wasn't worth the drift risk against their existing
 * meanings (mode icons, streak-repair, mission outcomes, etc).
 */
const minimalistLightColors: ColorPalette = {
  background: "#ffffff",
  surface: "#ffffff",
  surfaceElevated: "#f5f3ee",
  border: "#ece9e3",
  textPrimary: "#1c1b1f",
  textSecondary: "#4a4850",
  textMuted: "#8b8894",
  slate: {
    900: "#f5f3ee",
    800: "#eeece7",
    750: "#e5e2db",
    700: "#ddd9d0",
    600: "#c9c4b8",
    500: "#8b8894",
    400: "#4a4850",
    200: "#1c1b1f",
  },
  indigo: { 400: "#5B5BD6", 500: "#5B5BD6", 600: "#5B5BD6" },
  cyan: lightColors.cyan,
  amber: lightColors.amber,
  yellow: lightColors.yellow,
  red: lightColors.red,
  green: lightColors.green,
  white: "#ffffff",
  scrim: "#1c1b1f",
  sheen: "#1c1b1f",
};

const minimalistDarkColors: ColorPalette = {
  background: "#17161c",
  surface: "#17161c",
  surfaceElevated: "#211f28",
  border: "#28262f",
  textPrimary: "#f2f1f5",
  textSecondary: "#c7c4d1",
  textMuted: "#847f91",
  slate: {
    900: "#17161c",
    800: "#211f28",
    750: "#262430",
    700: "#28262f",
    600: "#3a3742",
    500: "#847f91",
    400: "#c7c4d1",
    200: "#f2f1f5",
  },
  indigo: { 400: "#5B5BD6", 500: "#5B5BD6", 600: "#5B5BD6" },
  cyan: darkColors.cyan,
  amber: darkColors.amber,
  yellow: darkColors.yellow,
  red: darkColors.red,
  green: darkColors.green,
  white: "#ffffff",
  scrim: "#000000",
  sheen: "#ffffff",
};

/** Flat by design — the redesign mockup never uses a shadow anywhere, on either theme; depth comes from the border + background alone. */
const minimalistFlatShadow: ShadowSet = {
  glow: { shadowColor: "transparent", shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0, shadowRadius: 0, elevation: 0 },
  card: { shadowColor: "transparent", shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0, shadowRadius: 0, elevation: 0 },
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
  fontFamily: FontFamilySet;
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

export const minimalistDarkTheme: AppTheme = {
  colors: minimalistDarkColors,
  shadow: minimalistFlatShadow,
  ...tokens,
  fontFamily: minimalistFontFamily,
};
export const minimalistLightTheme: AppTheme = {
  colors: minimalistLightColors,
  shadow: minimalistFlatShadow,
  ...tokens,
  fontFamily: minimalistFontFamily,
};

/** Backwards-compat default export — components migrating to useTheme() can drop this. */
export const theme = darkTheme;
