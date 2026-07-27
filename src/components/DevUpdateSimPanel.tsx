import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "./AppText";
import { useTheme } from "../context/ThemeContext";
import { useAppVersion } from "../context/AppVersionContext";
import { simulateOtaUpdateReady } from "./OtaUpdateManager";

/**
 * TEMP-DEV-SIM — floating __DEV__-only panel to preview the force-update block
 * screen and the OTA "Update ready" sheet without touching real Supabase data
 * or waiting for a real OTA download. Delete this file and its one mount point
 * in app/_layout.tsx once the premium update-flow visuals are finalized —
 * search "TEMP-DEV-SIM" for the couple of small hooks in AppVersionContext.tsx
 * and OtaUpdateManager.tsx that go with it.
 */
export function DevUpdateSimPanel() {
  const { theme } = useTheme();
  const { devSimulateForceUpdate, setDevSimulateForceUpdate } = useAppVersion();

  if (!__DEV__) return null;

  return (
    <View style={styles.root} pointerEvents="box-none">
      <Pressable
        onPress={() => setDevSimulateForceUpdate(!devSimulateForceUpdate)}
        style={[
          styles.chip,
          {
            backgroundColor: devSimulateForceUpdate ? theme.colors.red[500] : theme.colors.surface,
            borderColor: devSimulateForceUpdate ? theme.colors.red[500] : theme.colors.border,
          },
        ]}
      >
        <Text style={[styles.chipText, { color: devSimulateForceUpdate ? "#fff" : theme.colors.textSecondary }]}>
          {devSimulateForceUpdate ? "Force update: ON" : "Simulate force update"}
        </Text>
      </Pressable>
      <Pressable
        onPress={() => simulateOtaUpdateReady()}
        style={[styles.chip, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
      >
        <Text style={[styles.chipText, { color: theme.colors.textSecondary }]}>Simulate OTA ready</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: "absolute",
    right: 10,
    bottom: 90,
    gap: 6,
    zIndex: 9999,
  },
  chip: {
    borderWidth: 1,
    borderRadius: 9999,
    paddingVertical: 6,
    paddingHorizontal: 10,
    opacity: 0.9,
  },
  chipText: { fontSize: 10, fontWeight: "800" },
});
