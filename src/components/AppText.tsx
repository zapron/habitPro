import { forwardRef, useMemo } from "react";
import {
  Text as RNText,
  type TextProps,
  type TextStyle,
  StyleSheet,
  Platform,
  type StyleProp,
} from "react-native";
import { fontFamily } from "../styles/fonts";

function numericWeight(w: TextStyle["fontWeight"]): number {
  if (w == null || w === "normal") return 400;
  if (w === "bold") return 700;
  if (typeof w === "string") {
    const n = parseInt(w, 10);
    return Number.isFinite(n) ? n : 400;
  }
  return typeof w === "number" && Number.isFinite(w) ? w : 400;
}

/**
 * Resolves `fontWeight` → Plus Jakarta file (React Native does not map weights for custom families).
 * Respects explicit `fontFamily` (e.g. for monospace later).
 */
export function resolveAppTextStyle(style: StyleProp<TextStyle>): TextStyle {
  const f = StyleSheet.flatten(style) as (TextStyle & { fontFamily?: string }) | undefined;
  if (!f) {
    return {
      fontFamily: fontFamily.regular,
      ...(Platform.OS === "android" ? { includeFontPadding: false } : {}),
    };
  }
  if (typeof f.fontFamily === "string" && f.fontFamily.length > 0) {
    return {
      ...f,
      ...(Platform.OS === "android" ? { includeFontPadding: f.includeFontPadding ?? false } : {}),
    };
  }
  const w = numericWeight(f.fontWeight);
  const fam: TextStyle["fontFamily"] =
    w >= 700
      ? fontFamily.bold
      : w >= 600
        ? fontFamily.semibold
        : w >= 500
          ? fontFamily.medium
          : fontFamily.regular;
  const { fontWeight: _omit, ...rest } = f;
  return {
    ...rest,
    fontFamily: fam,
    ...(Platform.OS === "android" ? { includeFontPadding: f.includeFontPadding ?? false } : {}),
  };
}

/**
 * App-wide `Text` — Plus Jakarta Sans with weight → face mapping (aligned with tryitfirst-mobile-v2).
 */
export const Text = forwardRef<RNText, TextProps>(function Text({ style, ...props }, ref) {
  const merged = useMemo(() => resolveAppTextStyle(style), [style]);
  return <RNText ref={ref} {...props} style={merged} />;
});
