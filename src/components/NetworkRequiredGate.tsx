import NetInfo, { useNetInfo } from "@react-native-community/netinfo";
import { RefreshCw, WifiOff } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme } from "../context/ThemeContext";
import { Text } from "./AppText";

export function NetworkRequiredGate() {
  const netInfo = useNetInfo();
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [checking, setChecking] = useState(false);
  const [confirmedOffline, setConfirmedOffline] = useState(false);
  const offlineConfirmTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const rawOffline = netInfo.isConnected === false || netInfo.isInternetReachable === false;

  useEffect(() => {
    const clearOfflineConfirmTimeout = () => {
      if (offlineConfirmTimeoutRef.current) {
        clearTimeout(offlineConfirmTimeoutRef.current);
        offlineConfirmTimeoutRef.current = null;
      }
    };

    clearOfflineConfirmTimeout();

    if (!rawOffline) {
      setConfirmedOffline(false);
      return clearOfflineConfirmTimeout;
    }

    offlineConfirmTimeoutRef.current = setTimeout(() => {
      setConfirmedOffline(true);
    }, 1400);

    return clearOfflineConfirmTimeout;
  }, [rawOffline]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      setConfirmedOffline(false);
      void NetInfo.refresh();
    });

    return () => sub.remove();
  }, []);

  const offline = rawOffline && confirmedOffline;

  if (!offline) return null;

  const retry = async () => {
    if (checking) return;
    setChecking(true);
    try {
      await NetInfo.refresh();
    } finally {
      setChecking(false);
    }
  };

  return (
    <View
      style={[
        styles.overlay,
        {
          paddingTop: Math.max(insets.top, 20),
          paddingBottom: Math.max(insets.bottom, 24),
          backgroundColor: isDark ? "rgba(7, 11, 20, 0.98)" : "rgba(248, 250, 252, 0.98)",
        },
      ]}
      accessibilityViewIsModal
      accessibilityRole="alert"
      accessibilityLabel="No internet connection. Internet is required to use habitPro."
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
    >
      <View
        style={[
          styles.panel,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
            ...theme.shadow.card,
          },
        ]}
      >
        <View style={[styles.iconWrap, { backgroundColor: theme.colors.red[500] + "18" }]}>
          <WifiOff size={34} color={theme.colors.red[500]} strokeWidth={2.3} />
        </View>
        <Text style={[styles.title, { color: theme.colors.textPrimary }]}>No internet connection</Text>
        <Text style={[styles.body, { color: theme.colors.textSecondary }]}>
          habitPro needs an active internet connection to keep your missions, squads, billing, and updates in sync.
        </Text>
        <Pressable
          style={({ pressed }) => [
            styles.retryButton,
            {
              backgroundColor: theme.colors.indigo[500],
              opacity: pressed || checking ? 0.82 : 1,
            },
          ]}
          onPress={retry}
          disabled={checking}
          accessibilityRole="button"
          accessibilityLabel="Retry internet connection"
        >
          {checking ? (
            <ActivityIndicator size="small" color={theme.colors.white} />
          ) : (
            <RefreshCw size={17} color={theme.colors.white} strokeWidth={2.5} />
          )}
          <Text style={[styles.retryText, { color: theme.colors.white }]}>
            {checking ? "Checking..." : "Try Again"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10000,
    elevation: 10000,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 22,
  },
  panel: {
    width: "100%",
    maxWidth: 420,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 22,
    paddingVertical: 24,
    alignItems: "center",
  },
  iconWrap: {
    width: 70,
    height: 70,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },
  title: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "900",
    textAlign: "center",
  },
  body: {
    marginTop: 10,
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "600",
    textAlign: "center",
  },
  retryButton: {
    marginTop: 22,
    minHeight: 46,
    borderRadius: 14,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  retryText: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "900",
  },
});
