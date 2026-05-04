import { Text } from "./AppText";
import { Image, StyleSheet, View } from "react-native";
import { useTheme } from "../context/ThemeContext";

const COMMUNITY_MARK = require("../../assets/habitpro-logo-transparent-v3.png");

type Props = {
  /**
   * Text inside the pill. Defaults to `"PLUS"`, or `"Community"` when `withFlame` is true.
   */
  label?: string;
  /** Smaller badge for inline placements. */
  size?: "sm" | "md";
  /**
   * HabitPro Community tier: shows the transparent Habit Ring mark + short label.
   */
  withFlame?: boolean;
};

export function PlusBadge({ label, size = "sm", withFlame = false }: Props) {
  const { theme, isDark } = useTheme();
  const bg = isDark ? "rgba(167, 139, 250, 0.12)" : "rgba(124, 58, 237, 0.08)";
  const border = isDark ? "rgba(167, 139, 250, 0.32)" : "rgba(124, 58, 237, 0.24)";
  const fg = isDark ? "#c4b5fd" : "#7c3aed";

  const cfg =
    size === "md"
      ? {
          padV: 4,
          padH: 8,
          fontSize: 10,
          letter: 0.85,
          mark: 16,
        }
      : {
          padV: 3,
          padH: 7,
          fontSize: 9,
          letter: 0.75,
          mark: 14,
        };

  const resolvedLabel = withFlame ? (label ?? "Community") : (label ?? "PLUS");

  return (
    <View
      style={[
        styles.wrap,
        withFlame && styles.wrapRow,
        {
          backgroundColor: bg,
          borderColor: border,
          borderRadius: theme.radius.pill,
          paddingVertical: cfg.padV,
          paddingHorizontal: cfg.padH,
          gap: withFlame ? 5 : 0,
        },
      ]}
    >
      {withFlame ? (
        <Image
          source={COMMUNITY_MARK}
          style={{ width: cfg.mark, height: cfg.mark }}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
        />
      ) : null}
      <Text
        style={[
          styles.text,
          { color: fg, fontSize: cfg.fontSize, letterSpacing: cfg.letter },
        ]}
      >
        {resolvedLabel}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  wrapRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  text: {
    fontWeight: "900",
  },
});
