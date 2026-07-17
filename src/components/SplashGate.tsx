import { useCallback, useEffect, useRef, useState } from "react";
import { InteractionManager, View } from "react-native";
import * as SplashScreen from "expo-splash-screen";

import { useAuth } from "../context/AuthContext";
import { isSupabaseConfigured } from "../lib/env";
import { countUnreadNotificationsCached } from "../lib/groupChallengesApi";
import { useHabitStore } from "../store/habitStore";
import { AnimatedSplashOverlay } from "./AnimatedSplashOverlay";

const MIN_DISPLAY_MS = 2400; // Logo lockup + daily wisdom have time to read before handoff.
const MAX_DISPLAY_MS = 3900;
const HOME_NOTIFICATION_COUNT_TTL_MS = 30_000;

type Props = { children: React.ReactNode };

export function SplashGate({ children }: Props) {
  const { initializing, session, syncReady, syncError, passwordRecoveryPending } = useAuth();
  const requireAuth = isSupabaseConfigured();
  const [overlayMounted, setOverlayMounted] = useState(true);
  const [nativeHiddenAt, setNativeHiddenAt] = useState<number | null>(null);
  const [shouldDismiss, setShouldDismiss] = useState(false);
  const [storeHydrated, setStoreHydrated] = useState(() => useHabitStore.persist.hasHydrated());
  const dismissLoggedRef = useRef(false);
  const userId = session?.user?.id ?? null;
  const shouldWaitForSignedInData = Boolean(requireAuth && userId && !passwordRecoveryPending);
  const signedInDataReady =
    !shouldWaitForSignedInData || (storeHydrated && (syncReady || Boolean(syncError)));

  const onFirstLayout = useCallback(() => {
    void SplashScreen.hideAsync().finally(() => {
      const hiddenAt = Date.now();
      if (__DEV__) {
        console.info("[habitPro:perf] splash.nativeHidden");
      }
      setNativeHiddenAt(hiddenAt);
    });
  }, []);

  useEffect(() => {
    if (!nativeHiddenAt || shouldDismiss) return;
    const id = setInterval(() => {
      const elapsed = Date.now() - nativeHiddenAt;
      const minOk = elapsed >= MIN_DISPLAY_MS;
      const authOk = !requireAuth || !initializing;
      const maxOk = elapsed >= MAX_DISPLAY_MS;
      if (authOk && ((minOk && signedInDataReady) || maxOk)) {
        if (__DEV__ && !dismissLoggedRef.current) {
          dismissLoggedRef.current = true;
          console.info(
            `[habitPro:perf] splash.dismissAfter ${elapsed}ms ${JSON.stringify({
              authOk,
              signedInDataReady,
              maxOk,
              storeHydrated,
              syncReady,
              syncError: Boolean(syncError),
            })}`,
          );
        }
        setShouldDismiss(true);
      }
    }, 120);
    return () => clearInterval(id);
  }, [nativeHiddenAt, shouldDismiss, requireAuth, initializing, signedInDataReady]);

  useEffect(() => {
    const unsub = useHabitStore.persist.onFinishHydration(() => {
      setStoreHydrated(true);
    });
    if (useHabitStore.persist.hasHydrated()) setStoreHydrated(true);
    return unsub;
  }, []);

  useEffect(() => {
    if (!nativeHiddenAt || !requireAuth || !userId) return;
    const task = InteractionManager.runAfterInteractions(() => {
      void countUnreadNotificationsCached(userId, {
        maxAgeMs: HOME_NOTIFICATION_COUNT_TTL_MS,
      }).catch((error) => {
        if (__DEV__) console.warn("[splash] notification count prewarm failed", error);
      });
    });
    return () => {
      task.cancel();
    };
  }, [nativeHiddenAt, requireAuth, userId]);

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
