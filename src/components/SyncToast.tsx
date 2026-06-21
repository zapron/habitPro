import { Text } from "./AppText";
import { useEffect, useRef, useState } from "react";
import { Platform, StyleSheet, ToastAndroid, View } from "react-native";
import { useToastBottomPadding } from "../hooks/useToastBottomPadding";
import { useTheme } from "../context/ThemeContext";
import { subscribeSyncFailure } from "../lib/syncQueue";

const DISPLAY_MS = 4200;
const SYNC_FAILURE_MESSAGE =
  "Couldn't sync to the server. Check your connection. Your changes are saved on this device.";
/** Avoid spamming the user when debounced sync retries fail repeatedly. */
const TOAST_COOLDOWN_MS = 45_000;

/** Bottom banner when remote sync fails (local data is still on device). */
export function SyncToast() {
  const { theme, isDark } = useTheme();
  const paddingBottom = useToastBottomPadding();
  const [visible, setVisible] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastToastAt = useRef(0);

  useEffect(() => {
    return subscribeSyncFailure(() => {
      const now = Date.now();
      if (now - lastToastAt.current < TOAST_COOLDOWN_MS) return;
      lastToastAt.current = now;
      if (Platform.OS === "android") {
        ToastAndroid.show(SYNC_FAILURE_MESSAGE, ToastAndroid.LONG);
        return;
      }
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
      collapsable={false}
      pointerEvents="none"
      style={[
        styles.wrap,
        {
          paddingBottom,
          paddingHorizontal: theme.spacing.md,
        },
      ]}
    >
      <View collapsable={false} pointerEvents="none">
        <Text
          style={[
            styles.text,
            {
              color: isDark ? theme.colors.textPrimary : "#fafafa",
              backgroundColor: isDark ? "rgba(38, 38, 40, 0.96)" : "rgba(33, 33, 33, 0.92)",
              borderColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.12)",
              ...(Platform.OS === "android"
                ? { elevation: 6 }
                : {
                    shadowColor: "#000",
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.22,
                    shadowRadius: 4,
                  }),
            },
          ]}
        >
          {SYNC_FAILURE_MESSAGE}
        </Text>
      </View>
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
    alignItems: "center",
  },
  text: {
    maxWidth: "92%",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    fontSize: 12,
    fontWeight: "500",
    textAlign: "center",
    overflow: "hidden",
  },
});
