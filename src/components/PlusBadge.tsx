import { Text } from "./AppText";
import { StyleSheet, View } from "react-native";
import { useTheme } from "../context/ThemeContext";

type Props = {
  /** Defaults to "PLUS". */
  label?: string;
  /** Smaller badge for inline placements. */
  size?: "sm" | "md";
};

export function PlusBadge({ label = "PLUS", size = "sm" }: Props) {
  const { theme, isDark } = useTheme();
  const bg = isDark ? "rgba(167, 139, 250, 0.12)" : "rgba(124, 58, 237, 0.08)";
  const border = isDark ? "rgba(167, 139, 250, 0.32)" : "rgba(124, 58, 237, 0.24)";
  const fg = isDark ? "#c4b5fd" : "#7c3aed";

  const cfg =
    size === "md"
      ? { padV: 4, padH: 8, fontSize: 10, letter: 0.9 }
      : { padV: 3, padH: 7, fontSize: 9, letter: 0.8 };

  return (
    <View
      style={[
        styles.wrap,
        {
          backgroundColor: bg,
          borderColor: border,
          borderRadius: theme.radius.pill,
          paddingVertical: cfg.padV,
          paddingHorizontal: cfg.padH,
        },
      ]}
    >
      <Text style={[styles.text, { color: fg, fontSize: cfg.fontSize, letterSpacing: cfg.letter }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  text: {
    fontWeight: "900",
  },
});
