import Svg, { Circle, Path } from "react-native-svg";

import { SPLASH_COLORS } from "../lib/splashInfinityMotion";

/**
 * The static, settled-frame version of the HabitPro mark — same path/colors
 * as SplashInfinityMark's animation once it comes to rest (left lobe+head
 * dark forest green, right lobe+head deep maroon — the color the traveling
 * pulse leaves behind). Used everywhere the brand mark appears outside the
 * splash itself: login header, PlusBadge, MissionShareCard watermark.
 */

const { forest: FOREST, maroon: MAROON } = SPLASH_COLORS;

export type HabitProMarkProps = {
  size: number;
};

export function HabitProMark({ size }: HabitProMarkProps) {
  return (
    <Svg width={size} height={size} viewBox="-130 -142 260 260">
      <Path d="M0,0 C30,-42 88,-40 88,0 C88,40 30,42 0,0 Z" fill="none" stroke={MAROON} strokeWidth={22} strokeLinecap="round" />
      <Path d="M0,0 C-30,-42 -88,-40 -88,0 C-88,40 -30,42 0,0 Z" fill="none" stroke={FOREST} strokeWidth={22} strokeLinecap="round" />
      <Circle cx={-51} cy={-64} r={14} fill={FOREST} />
      <Circle cx={51} cy={-64} r={14} fill={MAROON} />
    </Svg>
  );
}
