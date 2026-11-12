import { memo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { GalleryHorizontal, List } from "lucide-react-native";
import { Text } from "./AppText";
import { useTheme } from "../context/ThemeContext";

export type MomentsView = "list" | "cards";

/**
 * Small List | Cards switch for a moments section header (finished mission
 * screen, live squad feed). Neutrals only: the active side is a raised chip.
 */
export const MomentsViewToggle = memo(function MomentsViewToggle({
  value,
  onChange,
}: {
  value: MomentsView;
  onChange: (next: MomentsView) => void;
}) {
  const { theme, isDark } = useTheme();
  const activeBg = isDark ? "#3a3744" : "#ffffff";
  const option = (key: MomentsView, label: string, Icon: typeof List) => {
    const on = value === key;
    const color = on ? theme.colors.textPrimary : theme.colors.textMuted;
    return (
      <Pressable
        key={key}
        onPress={() => onChange(key)}
        hitSlop={{ top: 8, bottom: 8 }}
        accessibilityRole="button"
        accessibilityState={{ selected: on }}
        accessibilityLabel={`${label} view`}
        style={[
          styles.option,
          on ? { backgroundColor: activeBg } : null,
          on && !isDark ? styles.raised : null,
        ]}
      >
        <Icon size={14} color={color} strokeWidth={2.4} />
        <Text style={[styles.label, { color }]}>{label}</Text>
      </Pressable>
    );
  };
  return (
    <View style={[styles.wrap, { backgroundColor: theme.colors.surfaceElevated }]}>
      {option("list", "List", List)}
      {option("cards", "Cards", GalleryHorizontal)}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", padding: 3, borderRadius: 12, gap: 2 },
  option: { height: 28, paddingHorizontal: 10, borderRadius: 9, flexDirection: "row", alignItems: "center", gap: 5 },
  raised: { shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  label: { fontSize: 12, fontWeight: "800" },
});
