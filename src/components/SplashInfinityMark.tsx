import { useEffect } from "react";
import Svg, {
  Circle,
  ClipPath,
  Defs,
  G,
  LinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
  Text as SvgText,
} from "react-native-svg";
import type { GProps } from "react-native-svg/lib/typescript/elements/G";
import Animated, {
  Easing,
  useAnimatedProps,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import {
  SPLASH_COLORS,
  SPLASH_CUES,
  SPLASH_DURATION_S,
  SPLASH_PATH_D,
  SPLASH_PATH_LEN,
  clamp01,
  drawMotion,
  enterMotion,
  pointOnSplashPath,
  settleMotion,
} from "../lib/splashInfinityMotion";

/**
 * The HabitPro infinity-mark splash animation — ported from the Claude
 * Design storyboard ("Splash Animation.dc.html"). Scene timeline (5.0s
 * total): Seed -> Draw -> People -> Ignite -> Evolve -> Return -> Core ->
 * Settle -> Reveal -> Hold. See splashInfinityMotion.ts for the exact cue
 * timestamps and easing math, kept faithful to the original.
 *
 * All continuously-varying visual props are driven by Reanimated worklets
 * off a single linear clock (`T`, 0 -> SPLASH_DURATION_S seconds) so the
 * 5-second, ~20-value animation runs on the UI thread, not via per-frame
 * React state updates (which would be the wrong tool for something this
 * animation-heavy — see AnimatedSplashOverlay.tsx's much simpler existing
 * fades for the contrast).
 *
 * Dash math works in the path's real arc-length units (SPLASH_PATH_LEN),
 * not SVG's `pathLength` normalization attribute — the installed
 * react-native-svg version doesn't expose `pathLength` in its TS types,
 * so real units sidesteps that risk; plain dasharray/dashoffset need no
 * special attribute support.
 */

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedRect = Animated.createAnimatedComponent(Rect);
const AnimatedG = Animated.createAnimatedComponent(G);
const AnimatedSvgText = Animated.createAnimatedComponent(SvgText);

const C = SPLASH_CUES;
const LEN = SPLASH_PATH_LEN;
const { forest: FOREST, maroon: MAROON, amber: AMBER, red: RED, pale: PALE, paleGreen: PALE_GREEN } = SPLASH_COLORS;

export type SplashInfinityMarkProps = {
  isDark: boolean;
  showWordmark?: boolean;
  /** Keep a small ember glowing at the crossing after Reveal, instead of fading it out. */
  keepCore?: boolean;
};

export function SplashInfinityMark({ isDark, showWordmark = true, keepCore = false }: SplashInfinityMarkProps) {
  const T = useSharedValue(0);

  useEffect(() => {
    T.value = withTiming(SPLASH_DURATION_S, {
      duration: SPLASH_DURATION_S * 1000,
      easing: Easing.linear,
    });
  }, [T]);

  // --- Seed + draw ---
  const seedOp = useDerivedValue(() => enterMotion(T.value, 0, 1, C.Seed + 0.05, C.Seed + 0.35));
  const seedScale = useDerivedValue(() => enterMotion(T.value, 0.6, 1, C.Seed + 0.05, C.Seed + 0.35));
  const draw = useDerivedValue(() => drawMotion(T.value, 0, 1, C.Draw, C.People - 0.06));
  const tip = useDerivedValue(() => pointOnSplashPath(draw.value));
  const tipOp = useDerivedValue(
    () => seedOp.value * enterMotion(T.value, 1, 0, C.People - 0.12, C.People + 0.15),
  );

  // --- People (two heads drop in) ---
  const h1 = useDerivedValue(() => settleMotion(T.value, 0, 1, C.People, C.People + 0.5));
  const h2 = useDerivedValue(() => settleMotion(T.value, 0, 1, C.People + 0.12, C.People + 0.6));

  // --- Ignite + traveling pulses ---
  const ignite = useDerivedValue(
    () =>
      enterMotion(T.value, 0, 1, C.Ignite, C.Ignite + 0.3) *
      enterMotion(T.value, 1, 0, C.Evolve, C.Evolve + 0.35),
  );
  const p = useDerivedValue(() => drawMotion(T.value, 0, 0.5, C.Ignite + 0.25, C.Core));
  const pulseOp = useDerivedValue(
    () =>
      enterMotion(T.value, 0, 1, C.Ignite + 0.22, C.Ignite + 0.32) *
      enterMotion(T.value, 1, 0, C.Core - 0.02, C.Core + 0.12),
  );
  const head2Deep = useDerivedValue(() => clamp01((p.value - 0.08) / 0.08));

  // --- Core (forms at the crossing, then shrinks to an ember) ---
  const coreIn = useDerivedValue(() => enterMotion(T.value, 0, 17, C.Core, C.Core + 0.25));
  const coreShrink = useDerivedValue(() => settleMotion(T.value, 17, 6, C.Settle, C.Reveal));
  const coreR = useDerivedValue(() => (T.value < C.Settle ? coreIn.value : coreShrink.value));
  const coreOp = useDerivedValue(() => {
    const fadeToEmber = enterMotion(T.value, 1, 0.6, C.Settle, C.Reveal);
    return keepCore ? fadeToEmber : fadeToEmber * enterMotion(T.value, 1, 0, C.Reveal, C.Reveal + 0.3);
  });
  const nodeOp = useDerivedValue(
    () => (draw.value > 0 ? 1 : 0) * enterMotion(T.value, 1, 0, C.Settle, C.Reveal + 0.2),
  );

  // --- Reveal (mark lifts + shrinks, wordmark + tagline fade up below it) ---
  const lift = useDerivedValue(() => (showWordmark ? drawMotion(T.value, 0, 1, C.Reveal - 0.15, C.Reveal + 0.3) : 0));
  const drift = useDerivedValue(() => enterMotion(T.value, 1, 1.015, C.Hold, C.Hold + 0.6));
  // Base scale kept modest (was 3.6, which left the mark's own footprint
  // overlapping the wordmark below it) and shrinks further on reveal, moving
  // up further too, so there's real clearance for the wordmark/tagline and
  // the wisdom panel overlaid beneath.
  const logoScale = useDerivedValue(() => 2.05 * (1 - 0.35 * lift.value) * drift.value);
  const logoY = useDerivedValue(() => -390 * lift.value);
  const wordOp = useDerivedValue(() => enterMotion(T.value, 0, 1, C.Reveal + 0.15, C.Reveal + 0.55));
  const tagOp = useDerivedValue(() => enterMotion(T.value, 0, 1, C.Reveal + 0.3, C.Hold + 0.3));

  // ===== animated props =====

  // RN's own View-style transform-object-array form, NOT a transform
  // string and NOT a flat 6-number matrix — on Fabric, when Reanimated
  // writes an animated `transform` straight into the shadow node
  // (bypassing the JS-side parsing that only runs for statically-set
  // props), react-native-svg's native G delegate feeds it through RN's
  // shared TransformHelper.processTransform, which calls .getMap() on
  // each array element — i.e. it always expects an array of single-key
  // transform objects, exactly like RN View's own `transform` style, not
  // a string (ClassCastException: String) and not a flat matrix
  // (ClassCastException: Double, from treating each number as a map).
  // Also unlike a CSS/SVG transform string (where "translate() scale()"
  // always means scale-then-translate regardless of write order), this
  // native helper applies array entries strictly in the order given —
  // `scale` must come first or the translation itself gets multiplied by
  // the scale factor too, which is exactly what pushed the mark visibly
  // further from the (separately, fixed-position) wordmark below it.
  const groupProps = useAnimatedProps(() => ({
    // react-native-svg's own TS types model this as a discriminated union
    // stricter than what's actually needed at runtime (each member must
    // explicitly set every other key to undefined) — verified live on
    // Android that this plain array-of-single-key-objects shape is what
    // the native side actually wants; casting past the over-strict type.
    transform: [{ scale: logoScale.value }, { translateY: logoY.value }] as unknown as GProps["transform"],
  }));

  const baseLoopProps = useAnimatedProps(() => {
    const d = draw.value;
    if (d <= 0.001) return { opacity: 0, strokeDasharray: `0 ${LEN}` };
    if (d >= 1) return { opacity: 1, strokeDasharray: `${LEN} 0` };
    return { opacity: 1, strokeDasharray: `${d * LEN} ${LEN}` };
  });
  const deepWipeProps = useAnimatedProps(() => ({
    opacity: p.value > 0 ? 1 : 0,
    strokeDasharray: `${p.value * LEN} ${LEN - p.value * LEN}`,
  }));
  const clippedDeepProps = useAnimatedProps(() => ({
    opacity: nodeOp.value,
    strokeDasharray: draw.value < 1 ? `${draw.value * LEN} ${LEN}` : `${LEN} 0`,
  }));

  const tipGroupProps = useAnimatedProps(() => {
    const tx = draw.value > 0 ? tip.value.x : 0;
    const ty = draw.value > 0 ? tip.value.y : 0;
    return {
      opacity: tipOp.value,
      transform: [{ scale: seedScale.value }, { translateX: tx }, { translateY: ty }] as unknown as GProps["transform"],
    };
  });
  const tipGlowProps = useAnimatedProps(() => ({ fill: draw.value > 0 ? "#F8FAF7" : FOREST }));

  const head1GroupProps = useAnimatedProps(() => ({ opacity: clamp01(h1.value * 4) }));
  const head1YProps = useAnimatedProps(() => ({ cy: -420 + (420 - 64) * h1.value }));
  const head1TrailProps = useAnimatedProps(() => {
    const y = -420 + (420 - 64) * h1.value;
    const trail = h1.value > 0 && h1.value < 1 ? (1 - h1.value) * 0.6 : 0;
    return { y: y - 80, opacity: trail };
  });
  const head2GroupProps = useAnimatedProps(() => ({ opacity: clamp01(h2.value * 4) }));
  const head2YProps = useAnimatedProps(() => ({ cy: -420 + (420 - 64) * h2.value }));
  const head2DeepYProps = useAnimatedProps(() => ({
    cy: -420 + (420 - 64) * h2.value,
    opacity: head2Deep.value,
  }));
  const head2TrailProps = useAnimatedProps(() => {
    const y = -420 + (420 - 64) * h2.value;
    const trail = h2.value > 0 && h2.value < 1 ? (1 - h2.value) * 0.6 : 0;
    return { y: y - 80, opacity: trail };
  });

  const igniteGroupProps = useAnimatedProps(() => ({ opacity: ignite.value }));

  // Four separate hooks, not a shared helper — a non-"use"-prefixed function
  // calling useAnimatedProps is exactly the shape of Rules-of-Hooks risk that
  // caused a real production crash elsewhere in this app (see the delete-crash
  // postmortem in docs/CURRENT_WORK.md); inlining avoids that class of bug.
  const dashAmberBoldProps = useAnimatedProps(() => {
    const h = p.value * LEN;
    const l = Math.max(0, Math.min(0.1 * LEN, h));
    const op = pulseOp.value;
    if (op <= 0.001 || l <= 0.01) return { opacity: 0 };
    return { opacity: op, strokeDasharray: `${l} ${LEN - l}`, strokeDashoffset: -(h - l) };
  });
  const dashAmberSharpProps = useAnimatedProps(() => {
    const h = p.value * LEN;
    const l = Math.max(0, Math.min(0.05 * LEN, h));
    const op = pulseOp.value;
    if (op <= 0.001 || l <= 0.01) return { opacity: 0 };
    return { opacity: op, strokeDasharray: `${l} ${LEN - l}`, strokeDashoffset: -(h - l) };
  });
  const dashGreenBoldProps = useAnimatedProps(() => {
    const h = LEN / 2 + p.value * LEN;
    const l = Math.max(0, Math.min(0.1 * LEN, h));
    const op = pulseOp.value;
    if (op <= 0.001 || l <= 0.01) return { opacity: 0 };
    return { opacity: op, strokeDasharray: `${l} ${LEN - l}`, strokeDashoffset: -(h - l) };
  });
  const dashGreenSharpProps = useAnimatedProps(() => {
    const h = LEN / 2 + p.value * LEN;
    const l = Math.max(0, Math.min(0.05 * LEN, h));
    const op = pulseOp.value;
    if (op <= 0.001 || l <= 0.01) return { opacity: 0 };
    return { opacity: op, strokeDasharray: `${l} ${LEN - l}`, strokeDashoffset: -(h - l) };
  });

  const coreGroupProps = useAnimatedProps(() => ({
    opacity: coreR.value > 0.1 ? coreOp.value : 0,
  }));
  // Both circles below are filled with a RadialGradient. coreR animates from
  // 0 for the first few seconds (before the Core cue fires) — on Android,
  // react-native-svg's RadialGradient throws ("ending radius must be > 0")
  // the instant a gradient-filled shape's radius hits exactly 0, crashing
  // the app on the very first frame; iOS silently no-ops on the same case.
  // The group's own opacity already goes to 0 whenever coreR<=0.1, so this
  // floor is invisible — it only exists to keep Android's renderer from
  // ever seeing a zero radius.
  const coreGlowProps = useAnimatedProps(() => ({ r: Math.max(0.01, coreR.value * 1.5) }));
  const coreFireProps = useAnimatedProps(() => ({ r: Math.max(0.01, coreR.value) }));

  const wordmarkProps = useAnimatedProps(() => ({
    y: -354 + 24 * (1 - wordOp.value),
    opacity: wordOp.value,
  }));
  const taglineProps = useAnimatedProps(() => ({
    y: -291 + 16 * (1 - tagOp.value),
    opacity: tagOp.value,
  }));

  const habitColor = isDark ? "#F8FAF7" : "#0F172A";
  const tagColor = isDark ? "#94A3B8" : "#64748B";

  return (
    <Svg width="100%" height="100%" viewBox="-540 -960 1080 1920">
      <Defs>
        <ClipPath id="splashCoreClip">
          <Circle cx={0} cy={0} r={16} />
        </ClipPath>
        <RadialGradient id="splashCoreFire">
          <Stop offset="0" stopColor="#FFFFFF" />
          <Stop offset="0.3" stopColor="#FEF3C7" />
          <Stop offset="0.55" stopColor={AMBER} />
          <Stop offset="0.8" stopColor={RED} stopOpacity={0.7} />
          <Stop offset="1" stopColor={RED} stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id="splashCoreGlow">
          <Stop offset="0" stopColor={AMBER} stopOpacity={0.4} />
          <Stop offset="1" stopColor={AMBER} stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id="splashSeedGlow">
          <Stop offset="0" stopColor={FOREST} stopOpacity={0.55} />
          <Stop offset="1" stopColor={FOREST} stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id="splashIgniteGlow">
          <Stop offset="0" stopColor={AMBER} stopOpacity={0.5} />
          <Stop offset="1" stopColor={AMBER} stopOpacity={0} />
        </RadialGradient>
        <LinearGradient id="splashDrop" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={FOREST} stopOpacity={0} />
          <Stop offset="1" stopColor={FOREST} stopOpacity={0.5} />
        </LinearGradient>
      </Defs>

      {/* Static outer shift raising the whole composition (mark + wordmark +
       * tagline) as one unit — the scene otherwise sits centered on the
       * viewBox's own vertical middle, which reads too low on a tall phone
       * screen, leaving a big dead zone above and crowding the wisdom panel
       * below. This is a plain translate, so it doesn't touch any of the
       * relative math between the mark and the wordmark/tagline. */}
      <G transform="translate(0 -131)">
      <AnimatedG animatedProps={groupProps}>
        {/* infinity loop: forest-green base, maroon wipe trailing the pulse across the right lobe, darker crossing under the drawing tip */}
        <AnimatedPath d={SPLASH_PATH_D} fill="none" stroke={FOREST} strokeWidth={22} strokeLinecap="round" animatedProps={baseLoopProps} />
        <AnimatedPath d={SPLASH_PATH_D} fill="none" stroke={MAROON} strokeWidth={22} strokeLinecap="round" animatedProps={deepWipeProps} />
        <AnimatedG animatedProps={clippedDeepProps} clipPath="url(#splashCoreClip)">
          <Path d={SPLASH_PATH_D} fill="none" stroke={FOREST} strokeWidth={22} strokeLinecap="round" />
        </AnimatedG>

        {/* seed / drawing tip */}
        <AnimatedG animatedProps={tipGroupProps}>
          <Circle r={12} fill="url(#splashSeedGlow)" />
          <AnimatedCircle r={4} animatedProps={tipGlowProps} />
        </AnimatedG>

        {/* two heads dropping in with a comet trail */}
        <AnimatedG animatedProps={head1GroupProps}>
          <AnimatedRect x={-55} width={8} height={66} rx={4} fill="url(#splashDrop)" animatedProps={head1TrailProps} />
          <AnimatedCircle cx={-51} r={14} fill={FOREST} animatedProps={head1YProps} />
        </AnimatedG>
        <AnimatedG animatedProps={head2GroupProps}>
          <AnimatedRect x={47} width={8} height={66} rx={4} fill="url(#splashDrop)" animatedProps={head2TrailProps} />
          <AnimatedCircle cx={51} r={14} fill={FOREST} animatedProps={head2YProps} />
          <AnimatedCircle cx={51} r={14} fill={MAROON} animatedProps={head2DeepYProps} />
        </AnimatedG>

        {/* ignition flash at the crossing */}
        <AnimatedG animatedProps={igniteGroupProps}>
          <Circle r={20} fill="url(#splashIgniteGlow)" />
          <Circle r={6} fill="#FEF3C7" />
        </AnimatedG>

        {/* two traveling pulses — amber/red on the right lobe, pale green half a lap ahead on the left */}
        <AnimatedPath d={SPLASH_PATH_D} fill="none" stroke={RED} strokeWidth={12} strokeLinecap="round" animatedProps={dashAmberBoldProps} />
        <AnimatedPath d={SPLASH_PATH_D} fill="none" stroke={AMBER} strokeWidth={9} strokeLinecap="round" animatedProps={dashAmberSharpProps} />
        <AnimatedPath d={SPLASH_PATH_D} fill="none" stroke={PALE_GREEN} strokeWidth={12} strokeLinecap="round" animatedProps={dashGreenBoldProps} />
        <AnimatedPath d={SPLASH_PATH_D} fill="none" stroke={PALE} strokeWidth={9} strokeLinecap="round" animatedProps={dashGreenSharpProps} />

        {/* core: forms white-amber-red at the crossing, then shrinks to an ember */}
        <AnimatedG animatedProps={coreGroupProps}>
          <AnimatedCircle fill="url(#splashCoreGlow)" animatedProps={coreGlowProps} />
          <AnimatedCircle fill="url(#splashCoreFire)" animatedProps={coreFireProps} />
        </AnimatedG>
      </AnimatedG>

      {showWordmark ? (
        <G>
          {/* react-native-svg's Text doesn't auto-flow nested tspans the way
           * browser SVG does — each inherits the parent's x/textAnchor
           * independently, so a single centered <Text> with two colored
           * children renders both runs on top of each other. Two separate,
           * oppositely-anchored Text elements meeting at a fixed split point
           * sidesteps that (split point estimated from Manrope 800 metrics,
           * verified live in-simulator). */}
          <AnimatedSvgText
            x={50}
            textAnchor="end"
            fontFamily="Manrope, sans-serif"
            fontWeight="800"
            fontSize={112}
            letterSpacing={-2}
            fill={habitColor}
            animatedProps={wordmarkProps}
          >
            Habit
          </AnimatedSvgText>
          <AnimatedSvgText
            x={50}
            textAnchor="start"
            fontFamily="Manrope, sans-serif"
            fontWeight="800"
            fontSize={112}
            letterSpacing={-2}
            fill={MAROON}
            animatedProps={wordmarkProps}
          >
            Pro
          </AnimatedSvgText>
          <AnimatedSvgText
            x={0}
            textAnchor="middle"
            fontFamily="DM Sans, sans-serif"
            fontWeight="600"
            fontSize={26}
            letterSpacing={8}
            fill={tagColor}
            animatedProps={taglineProps}
          >
            COMMUNITY POWERS PROGRESS
          </AnimatedSvgText>
        </G>
      ) : null}
      </G>
    </Svg>
  );
}
