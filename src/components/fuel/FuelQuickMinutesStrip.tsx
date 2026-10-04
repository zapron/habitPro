import { memo } from "react";
import { View, TouchableOpacity, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Text } from "../AppText";
import { AVIATION_HUD } from "./FuelPetrolGraphics";
import { withAlpha, darkTheme, lightTheme } from "../../styles/theme";

export type QuickMinutePreset = { label: string; minutes: number };

type Props = {
  presets: QuickMinutePreset[];
  selectedMinutes: number;
  onSelect: (minutes: number) => void;
  isDark: boolean;
};

/** Compact segmented row for sub-hour presets — no large drop SVGs per chip */
export const FuelQuickMinutesStrip = memo(function FuelQuickMinutesStrip({
  presets,
  selectedMinutes,
  onSelect,
  isDark,
}: Props) {
  return (
    <View
      style={[
        styles.strip,
        {
          borderColor: isDark ? AVIATION_HUD.stripBorderDark : AVIATION_HUD.stripBorderLight,
          backgroundColor: isDark ? withAlpha(darkTheme.colors.slate[900], 45) : withAlpha(lightTheme.colors.surfaceElevated, 90),
        },
      ]}
    >
      {presets.map((p, index) => {
        const active = selectedMinutes === p.minutes;
        // Position-in-list, not minutes/60 — this strip is a handful of fixed
        // presets, not a continuous range, so the last one should always land
        // on a fully-lit pair of dots rather than petering out partway (45m
        // out of a literal 60m max would only ever reach 75%).
        const ratio = presets.length > 1 ? index / (presets.length - 1) : 1;
        const leftOn = ratio >= 0.33;
        const leftMid = ratio > 0 && ratio < 0.33;
        const rightOn = ratio >= 0.99;
        const rightMid = ratio >= 0.66 && ratio < 0.99;
        const idleDotColor = isDark ? AVIATION_HUD.textIdleDark : AVIATION_HUD.textIdleLight;
        const forest = isDark ? darkTheme.colors.green[500] : lightTheme.colors.green[600];
        const maroon = isDark ? darkTheme.colors.maroon[500] : lightTheme.colors.maroon[600];
        return (
          <View
            key={p.minutes}
            style={[
              styles.segmentWrap,
              index > 0 && {
                borderLeftWidth: StyleSheet.hairlineWidth,
                borderLeftColor: isDark ? "rgba(148, 163, 184, 0.35)" : "rgba(71, 85, 105, 0.22)",
              },
            ]}
          >
            {(() => {
              const content = (
                <>
                  <View style={styles.dotsRow}>
                    <View
                      style={[
                        styles.dot,
                        { backgroundColor: leftOn ? forest : idleDotColor, opacity: leftOn ? 1 : leftMid ? 0.5 : 0.35 },
                      ]}
                    />
                    <View
                      style={[
                        styles.dot,
                        { backgroundColor: rightOn ? maroon : idleDotColor, opacity: rightOn ? 1 : rightMid ? 0.5 : 0.35 },
                      ]}
                    />
                  </View>
                  <Text
                    style={[
                      styles.segmentLabel,
                      {
                        color: active
                          ? isDark
                            ? AVIATION_HUD.textActiveDark
                            : AVIATION_HUD.textActiveLight
                          : isDark
                            ? AVIATION_HUD.textIdleDark
                            : AVIATION_HUD.textIdleLight,
                      },
                    ]}
                    numberOfLines={1}
                  >
                    {p.label}
                  </Text>
                </>
              );
              // Selected state is a crisp forest->maroon gradient ring with a
              // soft glow of the same two colors behind it, not a filled
              // block — RN has no CSS-style gradient border, so the ring is
              // the standard substitute: a gradient-filled wrapper sized to
              // the segment, with the pressable inset inside it so the
              // gradient only shows through as a thin edge. That inset fill
              // has to be fully OPAQUE — it was left at the old semi-
              // transparent cyan wash (AVIATION_HUD.segmentActiveDark/Light),
              // which let the gradient bleed through the whole segment
              // instead of just the ring, reading as a solid block rather
              // than a boundary. Replaces the old flat cyan
              // AVIATION_HUD.ringActive, left over from the pre-rebrand
              // "petrol" theme.
              //
              // Dual-container sizing: segmentOuter is the one thing that
              // decides this cell's footprint, and it's wrapped identically
              // for idle and active — same flex:1, same overflow:"hidden"
              // clip at the exact same edge. The glow lives inside that
              // fixed boundary (in the margin:2 gap segment/segmentGradientEdge
              // already reserve) and gets clipped flush at segmentOuter's
              // own edge, so it can never paint past it — there's no size
              // difference left for the eye to catch between the two states.
              if (!active) {
                return (
                  <View style={styles.segmentOuter}>
                    <TouchableOpacity
                      onPress={() => onSelect(p.minutes)}
                      activeOpacity={0.85}
                      style={[styles.segment, { backgroundColor: "transparent", borderColor: "transparent" }]}
                      accessibilityRole="button"
                      accessibilityLabel={`${p.label} minutes`}
                      accessibilityState={{ selected: active }}
                    >
                      {content}
                    </TouchableOpacity>
                  </View>
                );
              }
              return (
                <View style={styles.segmentOuter}>
                  <LinearGradient colors={[forest, maroon]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.segmentGlow} />
                  <LinearGradient colors={[forest, maroon]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.segmentGradientEdge}>
                    <TouchableOpacity
                      onPress={() => onSelect(p.minutes)}
                      activeOpacity={0.85}
                      style={[
                        styles.segment,
                        styles.segmentActiveInner,
                        { backgroundColor: isDark ? "rgba(15, 23, 42, 0.95)" : "rgba(255, 255, 255, 0.98)" },
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={`${p.label} minutes`}
                      accessibilityState={{ selected: active }}
                    >
                      {content}
                    </TouchableOpacity>
                  </LinearGradient>
                </View>
              );
            })()}
          </View>
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  strip: {
    flexDirection: "row",
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
    minHeight: 40,
  },
  segmentWrap: {
    flex: 1,
    minWidth: 0,
  },
  segment: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    paddingHorizontal: 2,
    borderWidth: 1.5,
    borderRadius: 0,
    margin: 2,
    minHeight: 36,
  },
  // Wraps the active segment; its own padding is the gradient ring's
  // thickness, replacing the inner TouchableOpacity's margin+borderWidth
  // (segmentActiveInner below zeroes both) so the outer footprint matches
  // the idle segment exactly — no size jump when a tile gets selected.
  segmentGradientEdge: {
    flex: 1,
    margin: 2,
    padding: 1.5,
    minHeight: 36,
  },
  segmentActiveInner: {
    margin: 0,
    borderWidth: 0,
    minHeight: 0,
  },
  // The one shell both idle and active cells render inside — identical
  // size either way, and clipped at its own edge so nothing drawn inside
  // (namely the glow) can ever visually exceed it.
  segmentOuter: { flex: 1, position: "relative", overflow: "hidden" },
  // Soft color bleed behind the boundary — approximates a blur (no native
  // filter available) with a larger, lower-opacity copy of the same
  // gradient sitting behind the crisp ring. Sized to fill segmentOuter
  // completely (including the margin:2 gap segment/segmentGradientEdge
  // reserve around the ring) — segmentOuter's own overflow:"hidden" clips
  // it flush at that same edge, so it never bleeds past the cell.
  segmentGlow: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 2,
    opacity: 0.45,
  },
  dotsRow: {
    flexDirection: "row",
    gap: 4,
    marginBottom: 3,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  segmentLabel: {
    fontSize: 13,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
    letterSpacing: 0.3,
  },
});
