import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View, type LayoutChangeEvent } from "react-native";
import Animated, { Easing, useAnimatedProps, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import Svg, { Defs, Image as SvgImage, Path, Pattern } from "react-native-svg";
import { captureRef } from "react-native-view-shot";
import { useTheme } from "../context/ThemeContext";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { withAlpha } from "../styles/theme";

/**
 * Liquid light/dark switch. On toggle we snapshot the app in the current theme,
 * switch the real theme underneath, and lay the snapshot back on top with a
 * wobbly hole cut out of it. The hole grows from the tapped point, so the new
 * theme looks like liquid spreading across the screen until the snapshot is gone.
 *
 * Built only from react-native-svg + view-shot + Reanimated (all already in the
 * native build), so it ships over the air.
 */

const DURATION_MS = 1050;
const FADE_MS = 260;
const POINTS = 44;

type Origin = { x: number; y: number };
type Shot = { uri: string; origin: Origin; mode: "wave" | "fade" };

const ThemeWaveContext = createContext<{ toggleThemeWithWave: (origin: Origin) => void }>({
  toggleThemeWithWave: () => {},
});

export function useThemeWave() {
  return useContext(ThemeWaveContext);
}

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedView = Animated.View;

/** Closed, smoothed blob around (cx, cy). Three drifting sine waves on the radius make the rim ripple. */
function blob(cx: number, cy: number, r: number, amp: number, phase: number): string {
  "worklet";
  if (r <= 0.5) return "";
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < POINTS; i++) {
    const a = (i / POINTS) * Math.PI * 2;
    const wobble =
      0.55 * Math.sin(3 * a + phase) +
      0.3 * Math.sin(5 * a - phase * 1.4) +
      0.15 * Math.sin(8 * a + phase * 2.2);
    const rr = Math.max(0, r + amp * wobble);
    xs.push(cx + rr * Math.cos(a));
    ys.push(cy + rr * Math.sin(a));
  }
  // Quadratic curves through the midpoints give a smooth closed outline.
  const last = POINTS - 1;
  let d = `M${(xs[last] + xs[0]) / 2} ${(ys[last] + ys[0]) / 2}`;
  for (let i = 0; i < POINTS; i++) {
    const n = (i + 1) % POINTS;
    d += `Q${xs[i]} ${ys[i]} ${(xs[i] + xs[n]) / 2} ${(ys[i] + ys[n]) / 2}`;
  }
  return d + "Z";
}

function WaveOverlay({
  shot,
  width,
  height,
  onReady,
  onDone,
}: {
  shot: Shot;
  width: number;
  height: number;
  onReady: () => void;
  onDone: () => void;
}) {
  const { theme } = useTheme();
  const progress = useSharedValue(0);
  const opacity = useSharedValue(1);
  const startedRef = useRef(false);

  const { x: cx, y: cy } = shot.origin;
  // Far enough that even the wave's inner dips clear the farthest corner.
  const maxR =
    Math.max(Math.hypot(cx, cy), Math.hypot(width - cx, cy), Math.hypot(cx, height - cy), Math.hypot(width - cx, height - cy)) + 60;

  const start = useCallback(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    onReady();
    // Two frames so the theme re-render lands before the liquid starts moving.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (shot.mode === "fade") {
          opacity.value = withTiming(0, { duration: FADE_MS });
        } else {
          progress.value = withTiming(1, { duration: DURATION_MS, easing: Easing.bezier(0.55, 0.05, 0.25, 1) });
        }
        setTimeout(onDone, (shot.mode === "fade" ? FADE_MS : DURATION_MS) + 80);
      }),
    );
  }, [onDone, onReady, opacity, progress, shot.mode]);

  // Safety net in case the image's onLoad never fires.
  useEffect(() => {
    const t = setTimeout(start, 450);
    return () => clearTimeout(t);
  }, [start]);

  const holeProps = useAnimatedProps(() => {
    const p = progress.value;
    const r = p * maxR;
    const amp = Math.min(34, r * 0.2) * (1 - 0.55 * p);
    return { d: `M0 0H${width}V${height}H0Z` + blob(cx, cy, r, amp, p * 9) };
  });
  const rimProps = useAnimatedProps(() => {
    const p = progress.value;
    const r = p * maxR;
    const amp = Math.min(34, r * 0.2) * (1 - 0.55 * p);
    return { d: blob(cx, cy, r, amp, p * 9) || "M0 0Z", strokeOpacity: p < 0.02 ? 0 : 1 - p * 0.6 };
  });
  const fadeStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <AnimatedView style={[StyleSheet.absoluteFill, fadeStyle]} pointerEvents="auto">
      <Svg width={width} height={height}>
        <Defs>
          <Pattern id="themeWaveShot" patternUnits="userSpaceOnUse" x={0} y={0} width={width} height={height}>
            <SvgImage
              href={{ uri: shot.uri }}
              x={0}
              y={0}
              width={width}
              height={height}
              preserveAspectRatio="none"
              onLoad={start}
            />
          </Pattern>
        </Defs>
        {/* Old-theme snapshot everywhere except inside the blob (even-odd hole). */}
        <AnimatedPath animatedProps={holeProps} fill="url(#themeWaveShot)" fillRule="evenodd" />
        {shot.mode === "wave" ? (
          <AnimatedPath
            animatedProps={rimProps}
            fill="none"
            stroke={withAlpha(theme.colors.indigo[400], 60)}
            strokeWidth={2.5}
          />
        ) : null}
      </Svg>
    </AnimatedView>
  );
}

export function ThemeWaveProvider({ children }: { children: React.ReactNode }) {
  const { isDark, setPreference } = useTheme();
  const reduceMotion = useReducedMotion();
  const rootRef = useRef<View>(null);
  const busyRef = useRef(false);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [shot, setShot] = useState<Shot | null>(null);
  const nextRef = useRef<"light" | "dark">("dark");

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize({ width, height });
  }, []);

  const onReady = useCallback(() => setPreference(nextRef.current), [setPreference]);
  const safetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onDone = useCallback(() => {
    if (safetyTimerRef.current) clearTimeout(safetyTimerRef.current);
    safetyTimerRef.current = null;
    setShot(null);
    busyRef.current = false;
  }, []);

  const toggleThemeWithWave = useCallback(
    async (origin: Origin) => {
      const next = isDark ? "light" : "dark";
      if (busyRef.current) return;
      if (!rootRef.current || size.width === 0) {
        setPreference(next);
        return;
      }
      busyRef.current = true;
      nextRef.current = next;
      try {
        const uri = await captureRef(rootRef, { format: "jpg", quality: 0.9, result: "tmpfile" });
        setShot({ uri, origin, mode: reduceMotion ? "fade" : "wave" });
        // Safety net only — the overlay normally removes itself via onDone.
        safetyTimerRef.current = setTimeout(onDone, 4000);
      } catch {
        setPreference(next);
        busyRef.current = false;
      }
    },
    [isDark, onDone, reduceMotion, setPreference, size.width],
  );

  const value = useMemo(() => ({ toggleThemeWithWave }), [toggleThemeWithWave]);

  return (
    <ThemeWaveContext.Provider value={value}>
      <View style={styles.root} onLayout={onLayout}>
        <View ref={rootRef} collapsable={false} style={styles.root}>
          {children}
        </View>
        {shot ? (
          <WaveOverlay
            key={shot.uri}
            shot={shot}
            width={size.width}
            height={size.height}
            onReady={onReady}
            onDone={onDone}
          />
        ) : null}
      </View>
    </ThemeWaveContext.Provider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
