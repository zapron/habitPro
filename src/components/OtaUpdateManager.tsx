import { useCallback, useEffect, useRef } from "react";
import { AppState } from "react-native";
import * as Updates from "expo-updates";
import { useAppDialog } from "../context/AppDialogContext";
import { useAppVersion } from "../context/AppVersionContext";
import { useToast } from "../context/ToastContext";

const FIRST_CHECK_DELAY_MS = 6_000;
const FOREGROUND_CHECK_COOLDOWN_MS = 15 * 60_000;

type CheckReason = "launch" | "foreground";

function otaEnabled(): boolean {
  return !__DEV__ && Updates.isEnabled;
}

export function OtaUpdateManager() {
  const { needsForceUpdate } = useAppVersion();
  const { showAlert } = useAppDialog();
  const { showToast } = useToast();
  const { isUpdatePending } = Updates.useUpdates();
  const checkingRef = useRef(false);
  const lastCheckAtRef = useRef(0);
  const readyPromptShownRef = useRef(false);

  const applyDownloadedUpdate = useCallback(() => {
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
    showAlert(
      "Update ready",
      "A small HabitPro refresh has downloaded. Restart now to apply it, or it will apply the next time you open the app.",
      [
        { text: "Later", style: "cancel" },
        { text: "Restart now", onPress: applyDownloadedUpdate },
      ],
      { cancelable: true },
    );
  }, [applyDownloadedUpdate, showAlert]);

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

  return null;
}
