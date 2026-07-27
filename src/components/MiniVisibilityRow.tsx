import { Text } from "./AppText";
import {
  View,
  Switch,
  StyleSheet,
} from "react-native";
import { Globe, User } from "lucide-react-native";
import type { AppTheme } from "../styles/theme";
import type { MissionVisibility } from "../types/habit";

const PUBLIC_HINT = "Visible to your squad on this mission.";
const SOLO_HINT = "Private to you on this mission.";

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
    <View style={styles.row}>
      {isPublic ? (
        <Globe size={theme.icon.sm} color={theme.colors.cyan[400]} />
      ) : (
        <User size={theme.icon.sm} color={theme.colors.indigo[400]} />
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
    gap: 10,
    paddingVertical: 4,
    marginBottom: 14,
  },
  textCol: { flex: 1 },
  title: { fontWeight: "700", fontSize: 13 },
  hint: { fontSize: 11, marginTop: 2, lineHeight: 14 },
});
