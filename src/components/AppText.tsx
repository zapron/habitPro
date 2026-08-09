import { forwardRef, useMemo } from "react";
import {
  Text as RNText,
  type TextProps,
  type TextStyle,
  StyleSheet,
  Platform,
  type StyleProp,
} from "react-native";
import { fontFamily as classicFontFamily } from "../styles/fonts";
import { useTheme } from "../context/ThemeContext";

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
 * Resolves `fontWeight` → the active theme pack's font file (React Native
 * does not map weights for custom families). Respects explicit `fontFamily`
 * (e.g. for monospace later). `fonts` is whichever theme is currently active
 * (`theme.fontFamily`) — Classic maps to Plus Jakarta Sans, the Minimalist
 * pack maps to Manrope/DM Sans — so this one function drives font-switching
 * for every screen without each one needing to know which pack is active.
 */
export function resolveAppTextStyle(
  style: StyleProp<TextStyle>,
  fonts: Record<"regular" | "medium" | "semibold" | "bold", string> = classicFontFamily,
): TextStyle {
  const f = StyleSheet.flatten(style) as (TextStyle & { fontFamily?: string }) | undefined;
  if (!f) {
    return {
      fontFamily: fonts.regular,
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
      ? fonts.bold
      : w >= 600
        ? fonts.semibold
        : w >= 500
          ? fonts.medium
          : fonts.regular;
  const { fontWeight: _omit, ...rest } = f;
  return {
    ...rest,
    fontFamily: fam,
    ...(Platform.OS === "android" ? { includeFontPadding: f.includeFontPadding ?? false } : {}),
  };
}

/**
 * App-wide `Text` — weight → face mapping, sourced from the active theme
 * pack (Classic: Plus Jakarta Sans. Minimalist: Manrope/DM Sans) so every
 * screen's text switches automatically with the theme pack, no per-screen
 * changes needed.
 */
export const Text = forwardRef<RNText, TextProps>(function Text({ style, ...props }, ref) {
  const { theme } = useTheme();
  const merged = useMemo(() => resolveAppTextStyle(style, theme.fontFamily), [style, theme.fontFamily]);
  return <RNText ref={ref} {...props} style={merged} />;
});
