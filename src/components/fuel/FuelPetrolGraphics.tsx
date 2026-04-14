import { useId, memo } from "react";
import Svg, { Defs, LinearGradient, Stop, Path, Rect, Ellipse, G } from "react-native-svg";

/** Petrol / iridescent fuel palette */
export const PETROL = {
  deep: "#0f766e",
  mid: "#14b8a6",
  bright: "#5eead4",
  highlight: "#ccfbf1",
  glow: "rgba(20, 184, 166, 0.35)",
  surfaceDark: "rgba(13, 148, 136, 0.18)",
  surfaceLight: "rgba(204, 251, 241, 0.45)",
  borderActive: "rgba(45, 212, 191, 0.85)",
  borderIdle: "rgba(20, 184, 166, 0.28)",
  textOnPetrol: "#f0fdfa",
  textMuted: "rgba(240, 253, 250, 0.75)",
} as const;

/** HUD-style accents for sub-hour duration strip (cyan on dark) */
export const AVIATION_HUD = {
  stripBorderDark: "rgba(34, 211, 238, 0.35)",
  stripBorderLight: "rgba(14, 116, 144, 0.35)",
  segmentActiveDark: "rgba(34, 211, 238, 0.22)",
  segmentActiveLight: "rgba(6, 182, 212, 0.18)",
  segmentIdleDark: "rgba(15, 23, 42, 0.6)",
  segmentIdleLight: "rgba(255, 255, 255, 0.85)",
  textActiveDark: "#ecfeff",
  textActiveLight: "#0e7490",
  textIdleDark: "rgba(148, 163, 184, 0.95)",
  textIdleLight: "#475569",
  ringActive: "rgba(34, 211, 238, 0.95)",
} as const;

type DropProps = { size?: number };

/** Liquid droplet with petrol-style teal gradient */
export const FuelPetrolDrop = memo(function FuelPetrolDrop({ size = 14 }: DropProps) {
  const uid = useId().replace(/:/g, "");
  const gradId = `pd-${uid}`;
  const h = size * 1.2;
  return (
    <Svg width={size} height={h} viewBox="0 0 24 28" accessibilityLabel="">
      <Defs>
        <LinearGradient id={gradId} x1="0%" y1="100%" x2="100%" y2="0%">
          <Stop offset="0%" stopColor={PETROL.deep} />
          <Stop offset="0.45" stopColor={PETROL.mid} />
          <Stop offset="1" stopColor={PETROL.bright} />
        </LinearGradient>
      </Defs>
      <Path
        d="M12 2.5C7.8 2.5 4.5 5.8 4.5 10c0 5.2 6.2 12.5 7.5 14 1.3-1.5 7.5-8.8 7.5-14 0-4.2-3.3-7.5-7.5-7.5z"
        fill={`url(#${gradId})`}
      />
      <Ellipse cx="12" cy="9" rx="4" ry="3" fill={PETROL.highlight} opacity={0.35} />
    </Svg>
  );
});

type TankProps = { size?: number; isDark: boolean };

/** Compact side-view fuel tank (tanker-style) */
export const FuelTankGlyph = memo(function FuelTankGlyph({ size = 22, isDark }: TankProps) {
  const uid = useId().replace(/:/g, "");
  const g1 = `tg1-${uid}`;
  const g2 = `tg2-${uid}`;
  const stroke = isDark ? "rgba(148, 163, 184, 0.35)" : "rgba(71, 85, 105, 0.35)";
  return (
    <Svg width={size * 1.4} height={size * 0.75} viewBox="0 0 42 22" accessibilityLabel="">
      <Defs>
        <LinearGradient id={g1} x1="0%" y1="0%" x2="0%" y2="100%">
          <Stop offset="0%" stopColor={PETROL.mid} stopOpacity={0.9} />
          <Stop offset="100%" stopColor={PETROL.deep} stopOpacity={0.95} />
        </LinearGradient>
        <LinearGradient id={g2} x1="0%" y1="0%" x2="100%" y2="0%">
          <Stop offset="0%" stopColor={PETROL.bright} stopOpacity={0.5} />
          <Stop offset="100%" stopColor={PETROL.mid} stopOpacity={0.3} />
        </LinearGradient>
      </Defs>
      <G opacity={0.95}>
        <Rect x="4" y="8" width="32" height="11" rx="3" fill={`url(#${g1})`} stroke={stroke} strokeWidth={0.6} />
        <Rect x="6" y="10" width="28" height="4" rx="1" fill={`url(#${g2})`} opacity={0.85} />
        <Rect x="34" y="10" width="4" height="7" rx="1" fill={PETROL.deep} opacity={0.85} />
        <Rect x="2" y="10" width="4" height="7" rx="1" fill={PETROL.deep} opacity={0.75} />
        <Ellipse cx="20" cy="8" rx="10" ry="2.5" fill={PETROL.mid} opacity={0.5} />
      </G>
    </Svg>
  );
});
