import { Text } from "./AppText";
import {
  View,
  Switch,
  StyleSheet,
} from "react-native";
import { Globe, User } from "lucide-react-native";
import type { AppTheme } from "../styles/theme";
import type { MissionVisibility } from "../types/habit";

const PUBLIC_HINT =
  "Users in your group mission can see your streak memory. Turn off to keep it solo.";
const SOLO_HINT = "Only you can see your streak memory. Turn on to share with your group mission.";

type Props = {
  theme: AppTheme;
  visibility: MissionVisibility;
  onChange: (next: MissionVisibility) => void;
  /** When false, Solo/Public wording stays; the switch is omitted (e.g. locked Community). */
  showToggle?: boolean;
};

export function MiniVisibilityRow({
  theme,
  visibility,
  onChange,
  showToggle = true,
}: Props) {
  const isPublic = visibility === "public";
  const hint = isPublic ? PUBLIC_HINT : SOLO_HINT;
  return (
    <View
      style={[
        styles.row,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.md,
        },
      ]}
    >
      {isPublic ? (
        <Globe size={theme.icon.md} color={theme.colors.cyan[400]} />
      ) : (
        <User size={theme.icon.md} color={theme.colors.indigo[400]} />
      )}
      <View style={styles.textCol}>
        <Text style={[styles.title, { color: theme.colors.textPrimary }]}>{isPublic ? "Public" : "Solo"}</Text>
        <Text style={[styles.hint, { color: theme.colors.textMuted }]}>{hint}</Text>
      </View>
      {showToggle ? (
        <Switch
          value={isPublic}
          onValueChange={(v) => onChange(v ? "public" : "solo")}
          trackColor={{
            false: theme.colors.border,
            true: theme.colors.indigo[600],
          }}
          thumbColor={theme.colors.white}
          ios_backgroundColor={theme.colors.border}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    marginBottom: 16,
  },
  textCol: { flex: 1 },
  title: { fontWeight: "700", fontSize: 14 },
  hint: { fontSize: 11, marginTop: 3, lineHeight: 15 },
});
