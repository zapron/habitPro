/**
 * Pure math for the HabitPro infinity-mark splash animation. Ported from
 * the Claude Design storyboard ("Splash Animation.dc.html" / its
 * splash-scene.jsx), which used the same arc-length-parametrized path and
 * named-cue timeline on the web (SVG + React DOM). This file has zero
 * React/RN dependencies so the exact same numbers drive both the JS-thread
 * constants and the Reanimated worklets in SplashInfinityMark.tsx.
 *
 * Scene timeline (from the storyboard, durations in seconds):
 * Seed 0.4 -> Draw 1.0 -> People 0.6 -> Ignite 0.4 -> Evolve 0.7 ->
 * Return 0.3 -> Core 0.4 -> Settle 0.2 -> Reveal 0.4 -> Hold 0.6 = 5.0s total.
 */

export const SPLASH_CUES = {
  Seed: 0,
  Draw: 0.4,
  People: 1.4,
  Ignite: 2.0,
  Evolve: 2.4,
  Return: 3.1,
  Core: 3.4,
  Settle: 3.8,
  Reveal: 4.0,
  Hold: 4.4,
  End: 5.0,
} as const;

export const SPLASH_DURATION_S = SPLASH_CUES.End;

/**
 * Two-tone mark palette — `forest` (left lobe/head, resting state) vs
 * `maroon` (right lobe/head, the color the traveling pulse leaves behind
 * once it sweeps across at Ignite). Renamed from the original `light`/`deep`
 * (two shades of the same green) once the right side became a different hue
 * entirely, not just a darker green.
 */
export const SPLASH_COLORS = {
  forest: "#166534",
  maroon: "#8E1D33",
  amber: "#F59E0B",
  red: "#EF4444",
  pale: "#DCFCE7",
  paleGreen: "#86EFAC",
  fireWhite: "#FFFFFF",
  fireCream: "#FEF3C7",
};

/** Same 4-segment cubic-bezier infinity path as the web version's `P` constant. */
export const SPLASH_PATH_D =
  "M0,0 C30,-42 88,-40 88,0 C88,40 30,42 0,0 C-30,-42 -88,-40 -88,0 C-88,40 -30,42 0,0 Z";

type Cubic = readonly [readonly [number, number], readonly [number, number], readonly [number, number], readonly [number, number]];

const SEGMENTS: Cubic[] = [
  [[0, 0], [30, -42], [88, -40], [88, 0]],
  [[88, 0], [88, 40], [30, 42], [0, 0]],
  [[0, 0], [-30, -42], [-88, -40], [-88, 0]],
  [[-88, 0], [-88, 40], [-30, 42], [0, 0]],
];

/** [x, y, cumulativeLength] samples along the whole path, 200 subdivisions per segment. */
function buildTable(): { pts: [number, number, number][]; len: number } {
  const pts: [number, number, number][] = [];
  let len = 0;
  let prevX = 0;
  let prevY = 0;
  let first = true;
  for (const [a, b, c, d] of SEGMENTS) {
    for (let i = 0; i <= 200; i++) {
      const t = i / 200;
      const u = 1 - t;
      const x = u * u * u * a[0] + 3 * u * u * t * b[0] + 3 * u * t * t * c[0] + t * t * t * d[0];
      const y = u * u * u * a[1] + 3 * u * u * t * b[1] + 3 * u * t * t * c[1] + t * t * t * d[1];
      if (!first) len += Math.hypot(x - prevX, y - prevY);
      pts.push([x, y, len]);
      prevX = x;
      prevY = y;
      first = false;
    }
  }
  return { pts, len };
}

/** Computed once at module load — captured by reference into Reanimated worklets below. */
export const SPLASH_PATH_TABLE = buildTable();

/**
 * Real arc length of the closed path, in its own coordinate units. Used as
 * the "one full lap" unit for stroke-dasharray/-dashoffset math instead of
 * SVG's `pathLength` normalization attribute — react-native-svg's installed
 * version doesn't expose `pathLength` in its TS types (and support at
 * runtime is unverified), so working in real units sidesteps that risk
 * entirely; plain dasharray/dashoffset need no special attribute support.
 */
export const SPLASH_PATH_LEN = SPLASH_PATH_TABLE.len;

function easeOutCubic(x: number): number {
  "worklet";
  return 1 - Math.pow(1 - x, 3);
}
function easeInOutCubic(x: number): number {
  "worklet";
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}
function easeOutQuart(x: number): number {
  "worklet";
  return 1 - Math.pow(1 - x, 4);
}

/** Matches web MOTION.enter — easeOutCubic ramp between two values over [start, end]. */
export function enterMotion(t: number, from: number, to: number, start: number, end: number): number {
  "worklet";
  if (t <= start) return from;
  if (t >= end) return to;
  const p = (t - start) / (end - start);
  return from + (to - from) * easeOutCubic(p);
}

/** Matches web MOTION.draw — easeInOutCubic ramp, used for path-drawing progress. */
export function drawMotion(t: number, from: number, to: number, start: number, end: number): number {
  "worklet";
  if (t <= start) return from;
  if (t >= end) return to;
  const p = (t - start) / (end - start);
  return from + (to - from) * easeInOutCubic(p);
}

/** Matches web MOTION.settle — easeOutQuart ramp, used for things landing/shrinking. */
export function settleMotion(t: number, from: number, to: number, start: number, end: number): number {
  "worklet";
  if (t <= start) return from;
  if (t >= end) return to;
  const p = (t - start) / (end - start);
  return from + (to - from) * easeOutQuart(p);
}

export function clamp01(v: number): number {
  "worklet";
  return Math.max(0, Math.min(1, v));
}

/** Position at fraction `f` (0-1) of total arc length along the infinity path. */
export function pointOnSplashPath(f: number): { x: number; y: number } {
  "worklet";
  const table = SPLASH_PATH_TABLE;
  const target = clamp01(f) * table.len;
  const pts = table.pts;
  let lo = 0;
  let hi = pts.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (pts[mid][2] < target) lo = mid;
    else hi = mid;
  }
  return { x: pts[hi][0], y: pts[hi][1] };
}
