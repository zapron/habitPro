import { StyleSheet, View } from "react-native";
import { Play } from "lucide-react-native";
import { useTheme } from "../../context/ThemeContext";

/**
 * Marks a thumbnail whose moment is a Chapter clip. Centered over the poster,
 * same look as the hex gallery's badge; the clip itself plays in the viewer.
 */
export function ChapterPlayBadge({ size = 26 }: { size?: number }) {
  const { theme } = useTheme();
  return (
    <View pointerEvents="none" style={styles.wrap}>
      <View
        style={[
          styles.badge,
          { width: size, height: size, borderRadius: size / 2, backgroundColor: theme.colors.amber[500] },
        ]}
      >
        <Play size={Math.round(size * 0.42)} color="#ffffff" fill="#ffffff" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  badge: {
    alignItems: "center",
    justifyContent: "center",
    paddingLeft: 2,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.85)",
  },
});
