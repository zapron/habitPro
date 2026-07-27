import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import * as Updates from "expo-updates";
import { useAppVersion } from "../context/AppVersionContext";
import { useToast } from "../context/ToastContext";
import { OtaUpdateReadySheet } from "./OtaUpdateReadySheet";

const FIRST_CHECK_DELAY_MS = 6_000;
const FOREGROUND_CHECK_COOLDOWN_MS = 15 * 60_000;

type CheckReason = "launch" | "foreground";

function otaEnabled(): boolean {
  return !__DEV__ && Updates.isEnabled;
}

// TEMP-DEV-SIM: lets a __DEV__-only debug toggle open the "Update ready" sheet
// without a real OTA download, since otaEnabled() is always false in __DEV__.
// Remove this along with the toggle once the premium OTA/force-update visuals
// are done and no longer need live preview.
let devTriggerOtaReadySheet: (() => void) | null = null;
export function simulateOtaUpdateReady(): void {
  if (!__DEV__) return;
  devTriggerOtaReadySheet?.();
}

export function OtaUpdateManager() {
  const { needsForceUpdate } = useAppVersion();
  const { showToast } = useToast();
  const { isUpdatePending } = Updates.useUpdates();
  const checkingRef = useRef(false);
  const lastCheckAtRef = useRef(0);
  const readyPromptShownRef = useRef(false);
  const [readyVisible, setReadyVisible] = useState(false);

  useEffect(() => {
    devTriggerOtaReadySheet = () => setReadyVisible(true);
    return () => {
      devTriggerOtaReadySheet = null;
    };
  }, []);

  const applyDownloadedUpdate = useCallback(() => {
    setReadyVisible(false);
    showToast("Applying update...", "info", 1200);
    setTimeout(() => {
      void Updates.reloadAsync().catch((e) => {
        if (__DEV__) console.warn("[habitPro] OTA reload failed", e);
      });
    }, 350);
  }, [showToast]);

  const promptForReload = useCallback(() => {
    if (readyPromptShownRef.current) return;
    readyPromptShownRef.current = true;
    setReadyVisible(true);
  }, []);

  const checkForOtaUpdate = useCallback(
    async (reason: CheckReason) => {
      if (!otaEnabled() || needsForceUpdate || checkingRef.current) return;
      const now = Date.now();
      if (reason === "foreground" && now - lastCheckAtRef.current < FOREGROUND_CHECK_COOLDOWN_MS) {
        return;
      }
      checkingRef.current = true;
      lastCheckAtRef.current = now;
      try {
        const check = await Updates.checkForUpdateAsync();
        if (!check.isAvailable) return;

        showToast("Downloading a small update...", "info", 1600);
        const fetch = await Updates.fetchUpdateAsync();
        if (fetch.isNew || fetch.isRollBackToEmbedded) {
          promptForReload();
        }
      } catch (e) {
        if (__DEV__) console.warn("[habitPro] OTA update check failed", e);
      } finally {
        checkingRef.current = false;
      }
    },
    [needsForceUpdate, promptForReload, showToast],
  );

  useEffect(() => {
    if (!otaEnabled() || needsForceUpdate) return;
    const timer = setTimeout(() => {
      void checkForOtaUpdate("launch");
    }, FIRST_CHECK_DELAY_MS);
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void checkForOtaUpdate("foreground");
      }
    });
    return () => {
      clearTimeout(timer);
      sub.remove();
    };
  }, [checkForOtaUpdate, needsForceUpdate]);

  useEffect(() => {
    if (!otaEnabled() || needsForceUpdate || !isUpdatePending) return;
    promptForReload();
  }, [isUpdatePending, needsForceUpdate, promptForReload]);

  return (
    <OtaUpdateReadySheet
      visible={readyVisible}
      onLater={() => setReadyVisible(false)}
      onRestart={applyDownloadedUpdate}
    />
  );
}
