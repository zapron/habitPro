import { memo } from "react";
import { View, TouchableOpacity, StyleSheet } from "react-native";
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
            <TouchableOpacity
              onPress={() => onSelect(p.minutes)}
              activeOpacity={0.85}
              style={[
                styles.segment,
                {
                  backgroundColor: active
                    ? isDark
                      ? AVIATION_HUD.segmentActiveDark
                      : AVIATION_HUD.segmentActiveLight
                    : "transparent",
                  borderColor: active ? AVIATION_HUD.ringActive : "transparent",
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel={`${p.label} minutes`}
              accessibilityState={{ selected: active }}
            >
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
            </TouchableOpacity>
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
  segmentLabel: {
    fontSize: 13,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
    letterSpacing: 0.3,
  },
});
