import { memo } from "react";
import { TouchableOpacity, View, StyleSheet } from "react-native";
import Svg, { Path, Circle } from "react-native-svg";
import { LinearGradient } from "expo-linear-gradient";
import { Text } from "../AppText";
import { PETROL } from "./FuelPetrolGraphics";
import { darkTheme, lightTheme } from "../../styles/theme";

// Default ceiling for callers that don't pass their own — Mini Missions'
// create screen (16h). Live Squad has its own real, server-enforced 8h cap
// (rpc_request_join_live_mini_squad_v1 rejects anything over 480 minutes) and
// passes maxMinutes explicitly so its own "8h" tile still shows as the full
// mark, not half of a 16h scale it doesn't actually have.
const DEFAULT_MAX_MIN = 960;

// Same two-loop path/colors as HabitProMark.tsx's static mark, centered on its
// own origin (viewBox -130 -142 260 260). LOOP_LEN is each loop's real arc
// length (not SVG's `pathLength` normalization attribute — see the identical
// note in SplashInfinityMark.tsx: the installed react-native-svg version
// doesn't support it), measured by numeric integration of the two cubic
// bezier segments that make up one loop.
const RIGHT_LOOP = "M0,0 C30,-42 88,-40 88,0 C88,40 30,42 0,0 Z";
const LEFT_LOOP = "M0,0 C-30,-42 -88,-40 -88,0 C-88,40 -30,42 0,0 Z";
const LOOP_LEN = 232.41;
const VIEW_BOX = "-130 -142 260 260";

type Props = {
  label: string;
  minutes: number;
  active: boolean;
  onPress: () => void;
  isDark: boolean;
  /** Duration this screen's longest preset actually represents — defaults to
   * 16h (Mini Missions' create screen). Pass your own when it differs, e.g.
   * Live Squad's real 8h cap. */
  maxMinutes?: number;
  /** Stretch to fill its row (flex:1) instead of a fixed 56px width — for a
   * caller laying tiles out in explicit equal-width rows (so they span the
   * same full width as a sibling strip above). Defaults false so existing
   * fixed-width grids (Live Squad) are unaffected. */
  fillRow?: boolean;
};

/** Hour+ presets: the brand mark traces in as duration grows. Fill = duration / max. */
export const FuelTimePresetButton = memo(function FuelTimePresetButton({
  label,
  minutes,
  active,
  onPress,
  isDark,
  maxMinutes = DEFAULT_MAX_MIN,
  fillRow = false,
}: Props) {
  const fillRatio = Math.min(1, Math.max(0.06, minutes / maxMinutes));
  const forest = isDark ? darkTheme.colors.green[500] : lightTheme.colors.green[600];
  const maroon = isDark ? darkTheme.colors.maroon[500] : lightTheme.colors.maroon[600];

  const content = (
    <>
      <MarkTraceGraphic fillRatio={fillRatio} active={active} isDark={isDark} />
      <Text
        style={[
          styles.caption,
          {
            color: active ? (isDark ? PETROL.textOnPetrol : "#0f766e") : isDark ? "rgba(226, 232, 240, 0.9)" : "#134e4a",
          },
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </>
  );

  // Selected state is a crisp forest->maroon gradient ring with a soft glow
  // of the same two colors behind it — "boundaried," not filled. RN has no
  // CSS-style gradient border, so the ring is the standard substitute: a
  // gradient-filled wrapper sized to the card, with the pressable inset
  // inside it so the gradient only shows through as a thin edge. That inset
  // fill has to be fully OPAQUE — an earlier pass left it at the old
  // semi-transparent teal wash (PETROL's active tint), which let the
  // gradient bleed through the whole tile instead of just the ring, reading
  // as a solid color block rather than a boundary. Replaces the old flat
  // cyan PETROL.borderActive ring, left over from the pre-rebrand "petrol"
  // theme.
  //
  // Dual-container sizing: the outer shell below is the one and only thing
  // that decides this tile's footprint, and it's identical whether idle or
  // active — same width (or flex:1), same GLOW_PAD reserved on every side,
  // same overflow:"hidden" clip. The glow lives *inside* that reserved pad
  // and is clipped at the shell's own edge, so no matter how its insets are
  // tuned it can never paint past the shell — there's nothing left for the
  // eye to read as "the tile got bigger."
  const outerSize = fillRow ? styles.outerFillRow : styles.outerFixed;
  if (!active) {
    return (
      <View style={[outerSize, styles.outerShell]}>
        <TouchableOpacity
          onPress={onPress}
          activeOpacity={0.88}
          style={[
            styles.card,
            styles.cardFlexFill,
            {
              borderColor: isDark ? PETROL.borderIdle : "rgba(13, 148, 136, 0.32)",
              backgroundColor: isDark ? "rgba(15, 23, 42, 0.55)" : "rgba(255, 255, 255, 0.85)",
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel={`${label} fuel`}
        >
          {content}
        </TouchableOpacity>
      </View>
    );
  }
  return (
    <View style={[outerSize, styles.outerShell]}>
      <LinearGradient
        colors={[forest, maroon]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.glow}
      />
      <LinearGradient
        colors={[forest, maroon]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradientEdge}
      >
        <TouchableOpacity
          onPress={onPress}
          activeOpacity={0.88}
          style={[
            styles.card,
            styles.cardActiveInner,
            styles.cardFlexFill,
            { backgroundColor: isDark ? "rgba(15, 23, 42, 0.95)" : "rgba(255, 255, 255, 0.98)" },
          ]}
          accessibilityRole="button"
          accessibilityLabel={`${label} fuel`}
        >
          {content}
        </TouchableOpacity>
      </LinearGradient>
    </View>
  );
});

/**
 * Hour+ presets: the brand mark traces itself in as duration grows — forest
 * loop draws first, then maroon, each dot lighting the instant its own loop
 * finishes. Direction A from the duration-tile design review, picked over
 * the radial-wipe alternative. Same geometry/colors as HabitProMark.tsx.
 */
const MarkTraceGraphic = memo(function MarkTraceGraphic({
  fillRatio,
  active,
  isDark,
}: {
  fillRatio: number;
  active: boolean;
  isDark: boolean;
}) {
  const leftReveal = Math.min(1, fillRatio * 2);
  const rightReveal = Math.max(0, fillRatio * 2 - 1);
  const leftDotOn = leftReveal >= 0.995;
  const rightDotOn = rightReveal >= 0.995;

  const forest = isDark ? darkTheme.colors.green[500] : lightTheme.colors.green[600];
  const maroon = isDark ? darkTheme.colors.maroon[500] : lightTheme.colors.maroon[600];
  const ghostStroke = active ? PETROL.bright : isDark ? "rgba(148, 163, 184, 0.3)" : "rgba(71, 85, 105, 0.22)";
  const idleDot = isDark ? "rgba(148, 163, 184, 0.35)" : "rgba(71, 85, 105, 0.25)";

  return (
    <Svg width={30} height={30} viewBox={VIEW_BOX}>
      {/* Faint full-mark ghost so the not-yet-traced portion still reads as "the mark" */}
      <Path d={LEFT_LOOP} fill="none" stroke={ghostStroke} strokeWidth={22} strokeLinecap="round" opacity={0.3} />
      <Path d={RIGHT_LOOP} fill="none" stroke={ghostStroke} strokeWidth={22} strokeLinecap="round" opacity={0.3} />

      <Path
        d={LEFT_LOOP}
        fill="none"
        stroke={forest}
        strokeWidth={22}
        strokeLinecap="round"
        strokeDasharray={`${leftReveal * LOOP_LEN} ${LOOP_LEN}`}
      />
      <Path
        d={RIGHT_LOOP}
        fill="none"
        stroke={maroon}
        strokeWidth={22}
        strokeLinecap="round"
        strokeDasharray={`${rightReveal * LOOP_LEN} ${LOOP_LEN}`}
      />

      <Circle cx={-51} cy={-64} r={14} fill={leftDotOn ? forest : idleDot} opacity={leftDotOn ? 1 : 0.6} />
      <Circle cx={51} cy={-64} r={14} fill={rightDotOn ? maroon : idleDot} opacity={rightDotOn ? 1 : 0.6} />
    </Svg>
  );
});

// Reserved space, on every side, inside the outer shell — this is the only
// room the glow is ever allowed to bleed into. Same for idle and active.
const GLOW_PAD = 3;

const styles = StyleSheet.create({
  card: {
    paddingTop: 4,
    paddingBottom: 6,
    paddingHorizontal: 2,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "flex-start",
  },
  // Fills whatever box the outer shell hands it (56px fixed-grid content
  // area, or the fillRow flex share) — the shell below is what actually sets
  // the tile's footprint now, not this.
  cardFlexFill: { flex: 1 },
  // The outer shell: the one place this tile's total footprint is decided.
  // Fixed-width grids (Live Squad) get 56 + 2*GLOW_PAD so the *content* area
  // inside the padding still lands on exactly 56px, matching the original
  // size; fillRow grids (Mini Missions) just take their flex share and the
  // padding eats into it uniformly for every tile, idle or active alike —
  // so there is nothing that ever differs in size between the two states.
  outerFixed: { width: 56 + GLOW_PAD * 2 },
  outerFillRow: { flex: 1 },
  outerShell: {
    padding: GLOW_PAD,
    position: "relative",
    overflow: "hidden",
    borderRadius: 12 + GLOW_PAD,
  },
  // Wraps the active card; its own padding is the gradient ring's thickness,
  // replacing the inner TouchableOpacity's borderWidth (cardActiveInner below
  // zeroes it) so the ring's footprint matches the idle card's exactly.
  gradientEdge: {
    flex: 1,
    borderRadius: 12,
    padding: 1.5,
  },
  cardActiveInner: {
    borderWidth: 0,
    borderRadius: 10.5,
  },
  // Soft color bleed behind the boundary — RN has no blur filter without an
  // extra native dependency, so this approximates one: a larger, lower-
  // opacity copy of the same gradient sitting behind the crisp ring. It's
  // free to bleed all the way out to GLOW_PAD because outerShell's
  // overflow:"hidden" clips it right at the shell's own edge — the one
  // boundary that's identical whether this tile is idle or active.
  glow: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 12 + GLOW_PAD,
    opacity: 0.45,
  },
  caption: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
    letterSpacing: 0.2,
  },
});
