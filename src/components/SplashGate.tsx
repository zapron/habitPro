import { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import * as SplashScreen from "expo-splash-screen";

import { useAuth } from "../context/AuthContext";
import { isSupabaseConfigured } from "../lib/env";
import { AnimatedSplashOverlay } from "./AnimatedSplashOverlay";

const MIN_DISPLAY_MS = 1650; // Lets the logo settle into the wordmark before handoff.

type Props = { children: React.ReactNode };

export function SplashGate({ children }: Props) {
  const { initializing } = useAuth();
  const requireAuth = isSupabaseConfigured();
  const [overlayMounted, setOverlayMounted] = useState(true);
  const [nativeHiddenAt, setNativeHiddenAt] = useState<number | null>(null);
  const [shouldDismiss, setShouldDismiss] = useState(false);

  const onFirstLayout = useCallback(() => {
    void SplashScreen.hideAsync().finally(() => {
      setNativeHiddenAt(Date.now());
    });
  }, []);

  useEffect(() => {
    if (!nativeHiddenAt || shouldDismiss) return;
    const id = setInterval(() => {
      const elapsed = Date.now() - nativeHiddenAt;
      const minOk = elapsed >= MIN_DISPLAY_MS;
      const authOk = !requireAuth || !initializing;
      if (minOk && authOk) {
        setShouldDismiss(true);
      }
    }, 120);
    return () => clearInterval(id);
  }, [nativeHiddenAt, shouldDismiss, requireAuth, initializing]);

  const onDismissed = useCallback(() => {
    setOverlayMounted(false);
  }, []);

  return (
    <View style={{ flex: 1 }}>
      {children}
      {overlayMounted ? (
        <AnimatedSplashOverlay
          onFirstLayout={onFirstLayout}
          dismiss={shouldDismiss}
          onDismissed={onDismissed}
        />
      ) : null}
    </View>
  );
}
