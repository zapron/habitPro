/** Shared (non-color) design tokens. */
const tokens = {
  spacing: { xs: 8, sm: 12, md: 16, lg: 24, xl: 32 },
  radius: { sm: 10, md: 14, lg: 20, pill: 9999 },
  typography: { h1: 30, h2: 22, h3: 18, body: 16, caption: 13, micro: 11 },
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
  indigo: { 400: "#818cf8", 500: "#6366f1", 600: "#4f46e5" },
  cyan: { 400: "#22d3ee", 500: "#06b6d4" },
  amber: { 500: "#f59e0b" },
  yellow: { 400: "#fbbf24" },
  red: { 500: "#ef4444" },
  green: { 500: "#22c55e", 600: "#16a34a" },
  white: "#ffffff",
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
  indigo: { 400: "#6366f1", 500: "#4f46e5", 600: "#4338ca" },
  cyan: { 400: "#0891b2", 500: "#0e7490" },
  amber: { 500: "#d97706" },
  yellow: { 400: "#eab308" },
  red: { 500: "#dc2626" },
  green: { 500: "#16a34a", 600: "#15803d" },
  white: "#ffffff",
};

const darkShadow: ShadowSet = {
  glow: {
    shadowColor: "#6366f1",
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
    shadowColor: "#6366f1",
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
