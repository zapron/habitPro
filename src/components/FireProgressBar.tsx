/**
 * FireProgressBar
 * ───────────────────────────────────────────────────────────────────
 * A premium progress bar with a Lottie animated fire 🔥 riding the
 * leading edge, ember particles, and a glowing fill.
 *
 * Usage:
 *   <FireProgressBar progress={0.65} isDark height={10} fireSize={52} />
 *
 * Props:
 *   progress          0–1
 *   height            bar height in px (default 8)
 *   isDark            dark-mode flag (affects track background)
 *   fireSize          Lottie square size in px (default 48)
 *   accessibilityLabel  custom a11y label
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  StyleSheet,
  Animated,
  Easing,
  LayoutChangeEvent,
} from "react-native";
import LottieView from "lottie-react-native";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { FIRE_LOTTIE_URI } from "./FireLottie";

// ─────────────────────────────────────────────────────────────────
// Colour helpers
// ─────────────────────────────────────────────────────────────────

function lerpHex(a: string, b: string, t: number): string {
  const p = (h: string, o: number) => parseInt(h.slice(o, o + 2), 16);
  const r = Math.round(p(a, 1) + (p(b, 1) - p(a, 1)) * t);
  const g = Math.round(p(a, 3) + (p(b, 3) - p(a, 3)) * t);
  const bl = Math.round(p(a, 5) + (p(b, 5) - p(a, 5)) * t);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${bl.toString(16).padStart(2, "0")}`;
}

/** Yellow → orange → deep-red colour ramp based on progress (0–1). */
function progressColor(p: number): string {
  if (p <= 0.5) return lerpHex("#fbbf24", "#f97316", p * 2);
  return lerpHex("#f97316", "#ef4444", (p - 0.5) * 2);
}

// ─────────────────────────────────────────────────────────────────
// Ember particle
// ─────────────────────────────────────────────────────────────────

const EMBER_PALETTE = ["#fef08a", "#fbbf24", "#fb923c", "#f97316", "#ef4444"];

function EmberParticle({ fireSize }: { fireSize: number }) {
  const prog = useRef(new Animated.Value(0)).current;
  const driftX = useRef(new Animated.Value(0)).current;
  const color =
    EMBER_PALETTE[Math.floor(Math.random() * EMBER_PALETTE.length)];
  const dotSize = 2 + Math.random() * 3;

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    function run() {
      if (cancelled) return;
      const startX = (Math.random() - 0.5) * fireSize * 0.4;
      const endX = startX + (Math.random() - 0.5) * fireSize * 0.7;
      const dur = 650 + Math.random() * 750;

      prog.setValue(0);
      driftX.setValue(startX);

      Animated.parallel([
        Animated.timing(prog, {
          toValue: 1,
          duration: dur,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(driftX, {
          toValue: endX,
          duration: dur,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (!finished || cancelled) return;
        timer = setTimeout(run, 100 + Math.random() * 500);
      });
    }

    timer = setTimeout(run, Math.random() * 900);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [driftX, fireSize, prog]);

  const translateY = prog.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -(fireSize * 0.9)],
  });
  const opacity = prog.interpolate({
    inputRange: [0, 0.1, 0.8, 1],
    outputRange: [0, 0.95, 0.7, 0],
  });
  const scale = prog.interpolate({
    inputRange: [0, 0.4, 1],
    outputRange: [0.4, 1.2, 0.6],
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.ember,
        {
          width: dotSize,
          height: dotSize,
          borderRadius: dotSize / 2,
          backgroundColor: color,
          opacity,
          transform: [{ translateX: driftX }, { translateY }, { scale }],
        },
      ]}
    />
  );
}

// ─────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────

export interface FireProgressBarProps {
  /** 0–1. Animated when changed. */
  progress: number;
  /** Bar track height in px. Default 8. */
  height?: number;
  /** Affects track background colour. Default true. */
  isDark?: boolean;
  /** Size of the Lottie fire rendered at the leading edge. Default: 36 */
  fireSize?: number;
  /** Custom accessibility label. */
  accessibilityLabel?: string;
}

// ─────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────

const EMBER_COUNT = 6;

export function FireProgressBar({
  progress,
  height = 8,
  isDark = true,
  fireSize = 36,
  accessibilityLabel,
}: FireProgressBarProps) {
  const reduceMotion = useReducedMotion();
  const clamped = Math.min(1, Math.max(0, progress));
  const pct = Math.round(clamped * 100);
  const color = progressColor(clamped);
  const showFlame = clamped > 0.02;

  // Track layout width (needed to translate % → px for Animated positioning)
  const [trackWidth, setTrackWidth] = useState(0);
  const onLayout = useCallback(
    (e: LayoutChangeEvent) => setTrackWidth(e.nativeEvent.layout.width),
    [],
  );

  // Animated fill progress (0–1 → px)
  const fillAnim = useRef(new Animated.Value(clamped)).current;
  useEffect(() => {
    Animated.timing(fillAnim, {
      toValue: clamped,
      duration: 550,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false, // drives width — must be JS driver
    }).start();
  }, [clamped, fillAnim]);

  // Pixel position of the leading edge centre
  const leadPx = trackWidth > 0
    ? fillAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0, trackWidth],
      })
    : null;

  return (
    <View
      style={styles.root}
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel ?? `Progress: ${pct}%`}
      accessibilityValue={{ min: 0, max: 100, now: pct }}
    >
      {/* ── Track (measures itself) ── */}
      <View
        onLayout={onLayout}
        style={[
          styles.track,
          {
            height,
            borderRadius: height / 2,
            backgroundColor: isDark
              ? "rgba(255,255,255,0.07)"
              : "rgba(0,0,0,0.09)",
          },
        ]}
      >
        {/* Glowing fill */}
        {trackWidth > 0 && leadPx && (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.fill,
              {
                height,
                borderRadius: height / 2,
                backgroundColor: color,
                // Animate width from 0 → trackWidth
                width: fillAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, trackWidth],
                }),
                shadowColor: color,
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.65,
                shadowRadius: 8,
                elevation: 4,
              },
            ]}
          />
        )}
      </View>


      {/* ── Lottie fire (sits just above the track, centred on the leading edge) ── */}
      {showFlame && trackWidth > 0 && leadPx && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.fireWrap,
            {
              width: fireSize,
              height: fireSize,
              // Vertically: bottom of the fire sits on top of the bar track
              bottom: height,
              // Horizontally: centre on the leading edge pixel
              left: leadPx,
              marginLeft: -(fireSize / 2),
            },
          ]}
        >
          <LottieView
            source={{ uri: FIRE_LOTTIE_URI }}
            autoPlay={!reduceMotion}
            loop={!reduceMotion}
            progress={reduceMotion ? 0.08 : undefined}
            resizeMode="contain"
            style={{ width: fireSize, height: fireSize }}
          />

          {/* Ember particles that drift up from the flame */}
          {!reduceMotion &&
            Array.from({ length: EMBER_COUNT }, (_, i) => (
              <EmberParticle key={i} fireSize={fireSize} />
            ))}
        </Animated.View>
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    // Extra headroom above for the fire animation (scales with fireSize)
    paddingTop: 40,
    position: "relative",
    overflow: "visible",
  },
  track: {
    overflow: "visible",
    position: "relative",
  },
  fill: {
    position: "absolute",
    left: 0,
    top: 0,
  },
  fireWrap: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "flex-end",
    overflow: "visible",
  },
  ember: {
    position: "absolute",
    bottom: 0,
  },
});
