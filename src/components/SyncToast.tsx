import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../context/ThemeContext";
import { subscribeSyncFailure } from "../lib/syncQueue";

const DISPLAY_MS = 4200;

/** Bottom banner when remote sync fails (local data is still on device). */
export function SyncToast() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return subscribeSyncFailure(() => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      setVisible(true);
      hideTimer.current = setTimeout(() => {
        setVisible(false);
        hideTimer.current = null;
      }, DISPLAY_MS);
    });
  }, []);

  useEffect(() => {
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  if (!visible) return null;

  return (
    <View
      pointerEvents="none"
      style={[
        styles.wrap,
        {
          paddingBottom: Math.max(insets.bottom, 12),
          paddingHorizontal: theme.spacing.md,
        },
      ]}
    >
      <Text
        style={[
          styles.text,
          {
            color: theme.colors.textPrimary,
            backgroundColor: theme.colors.surfaceElevated,
            borderColor: theme.colors.border,
            borderRadius: theme.radius.md,
          },
        ]}
      >
        Couldn't sync to the server. Check your connection — your changes are saved on this device.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
  },
  text: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    fontSize: 13,
    fontWeight: "600",
    overflow: "hidden",
  },
});
