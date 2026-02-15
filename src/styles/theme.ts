export const theme = {
  colors: {
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
      750: "#2d3a52", // approximating active state
      700: "#334155",
      600: "#475569",
      500: "#64748b",
      400: "#94a3b8",
      200: "#e2e8f0",
    },
    indigo: {
      400: "#818cf8",
      600: "#4f46e5",
      500: "#6366f1", // shadow color approximation
    },
    cyan: {
      400: "#22d3ee",
      500: "#06b6d4",
    },
    amber: {
      500: "#f59e0b",
    },
    yellow: {
      400: "#fbbf24", // Trophy color
    },
    red: {
      500: "#ef4444",
    },
    green: {
      500: "#22c55e",
      600: "#16a34a",
    },
    white: "#ffffff",
  },
  spacing: {
    xs: 8,
    sm: 12,
    md: 16,
    lg: 24,
    xl: 32,
  },
  radius: {
    sm: 10,
    md: 14,
    lg: 20,
    pill: 9999,
  },
  typography: {
    h1: 30,
    h2: 22,
    h3: 18,
    body: 16,
    caption: 13,
    micro: 11,
  },
  shadow: {
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
  },
};
