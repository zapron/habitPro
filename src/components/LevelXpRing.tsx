import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Circle, G } from "react-native-svg";

import { useTheme } from "../context/ThemeContext";

type LevelXpRingProps = {
  level: number;
  xpInLevel: number;
  children: ReactNode;
  size?: number;
  strokeWidth?: number;
};

function hexToRgba(hex: string | undefined | null, a: number): string {
  const raw = typeof hex === "string" ? hex : "#6366f1";
  const h = raw.replace("#", "").trim();
  if (h.length !== 6) return `rgba(99,102,241,${a})`;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

export function LevelXpRing({
  level,
  xpInLevel,
  children,
  size = 102,
  strokeWidth = 4,
}: LevelXpRingProps) {
  const { theme, isDark } = useTheme();
  const c = size / 2;
  const r = (size - strokeWidth) / 2 - 1;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(1, Math.max(0, xpInLevel / 100));

  const levelPalette = [
    theme.colors.indigo[500],
    theme.colors.cyan[400],
    theme.colors.amber[500],
    theme.colors.green[500],
    theme.colors.red[500],
    theme.colors.yellow[400],
  ] as const;
  const levelColor =
    levelPalette[Math.abs(level) % levelPalette.length] ??
    theme.colors.indigo[500];
  const track = hexToRgba(levelColor, isDark ? 0.22 : 0.16);

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <G transform={`rotate(-90 ${c} ${c})`}>
          <Circle cx={c} cy={c} r={r} stroke={track} strokeWidth={strokeWidth} fill="none" />
          <Circle
            cx={c}
            cy={c}
            r={r}
            stroke={levelColor}
            strokeWidth={strokeWidth}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${circ} ${circ}`}
            strokeDashoffset={circ * (1 - pct)}
          />
        </G>
      </Svg>
      {children}
    </View>
  );
}
