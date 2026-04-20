import { Text } from "./AppText";
import { Image, StyleSheet, View } from "react-native";
import { useTheme } from "../context/ThemeContext";

const FLAME = require("../../assets/swirling-gradient-flame-logo.png");

type Props = {
  /**
   * Text inside the pill. Defaults to `"PLUS"`, or `"Community"` when `withFlame` is true.
   */
  label?: string;
  /** Smaller badge for inline placements. */
  size?: "sm" | "md";
  /**
   * HabitPro Community tier: shows the app flame mark + short label (compact vs full name).
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
          flame: 15,
        }
      : {
          padV: 3,
          padH: 7,
          fontSize: 9,
          letter: 0.75,
          flame: 13,
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
          source={FLAME}
          style={{ width: cfg.flame, height: cfg.flame, borderRadius: cfg.flame / 3 }}
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
