import React, { createContext, useContext, useMemo, useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { Text } from "../components/AppText";
import { Button } from "../components/Button";
import { useTheme } from "./ThemeContext";
import {
  getRemotePushPermissionStatus,
  requestRemotePushPermission,
  type RemotePushPermissionStatus,
} from "../lib/pushTokens";
import * as Linking from "expo-linking";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type NotificationGateReason =
  | "mini_timer"
  | "daily_reminder"
  | "mission_create"
  | "invite_accept";

type NotificationGateContextValue = {
  /**
   * Prompts for notification permission when needed.
   * Resolves true when permission is granted; false if user cancels / skips.
   */
  requireNotifications: (reason: NotificationGateReason) => Promise<boolean>;
  /**
   * Non-blocking soft ask. Only shows when notifications are not granted and this reason
   * hasn't been shown on this device yet.
   */
  suggestNotifications: (reason: "mission_create" | "invite_accept") => Promise<boolean>;
};

const NotificationGateContext = createContext<NotificationGateContextValue | null>(null);

function titleForReason(reason: NotificationGateReason): string {
  switch (reason) {
    case "mini_timer":
      return "Enable notifications for mini timers";
    case "daily_reminder":
      return "Enable notifications for reminders";
    case "mission_create":
      return "Turn on notifications?";
    case "invite_accept":
      return "Turn on notifications?";
  }
}

function bodyForReason(reason: NotificationGateReason): string {
  switch (reason) {
    case "mini_timer":
      return "So we can alert you when your mini mission is about to end (and when it fails).";
    case "daily_reminder":
      return "So we can notify you at your chosen daily reminder time.";
    case "mission_create":
      return "For a better experience, enable notifications so we can remind you to check in on this mission.";
    case "invite_accept":
      return "Enable notifications to get updates and reminders for your group mission.";
  }
}

function primaryLabelForStatus(status: RemotePushPermissionStatus): string {
  if (status === "denied") return "Open Settings";
  return "Enable notifications";
}

function softAskStorageKey(reason: "mission_create" | "invite_accept"): string {
  return `@habitpro_notif_softask_${reason}_v1`;
}

export function NotificationGateProvider({ children }: { children: React.ReactNode }) {
  const { theme, isDark } = useTheme();
  const resolverRef = useRef<((ok: boolean) => void) | null>(null);
  const [visible, setVisible] = useState(false);
  const [reason, setReason] = useState<NotificationGateReason>("mini_timer");
  const [status, setStatus] = useState<RemotePushPermissionStatus>("undetermined");
  const [busy, setBusy] = useState(false);

  const close = (result: boolean) => {
    setVisible(false);
    setBusy(false);
    const resolve = resolverRef.current;
    resolverRef.current = null;
    resolve?.(result);
  };

  const runPrimary = async () => {
    if (busy) return;
    setBusy(true);
    const current = await getRemotePushPermissionStatus();
    setStatus(current);
    if (current === "granted") {
      close(true);
      return;
    }
    if (current === "undetermined") {
      const next = await requestRemotePushPermission();
      setStatus(next);
      setBusy(false);
      if (next === "granted") close(true);
      return;
    }
    // denied / unavailable → Settings path (OS-controlled)
    try {
      await Linking.openSettings();
    } finally {
      setBusy(false);
      close(false);
    }
  };

  const value = useMemo<NotificationGateContextValue>(
    () => ({
      requireNotifications: async (nextReason: NotificationGateReason) => {
        const s = await getRemotePushPermissionStatus();
        if (s === "granted") return true;
        if (resolverRef.current) {
          return await new Promise<boolean>((resolve) => {
            const prev = resolverRef.current;
            resolverRef.current = (ok) => {
              prev?.(ok);
              resolve(ok);
            };
          });
        }
        setReason(nextReason);
        setStatus(s);
        setVisible(true);
        return await new Promise<boolean>((resolve) => {
          resolverRef.current = resolve;
        });
      },
      suggestNotifications: async (nextReason: "mission_create" | "invite_accept") => {
        const s = await getRemotePushPermissionStatus();
        if (s === "granted") return true;
        try {
          const key = softAskStorageKey(nextReason);
          const already = await AsyncStorage.getItem(key);
          if (already === "1") return false;
          await AsyncStorage.setItem(key, "1");
        } catch {
          // Ignore storage failures; still best-effort show.
        }
        if (resolverRef.current) return false;
        setReason(nextReason);
        setStatus(s);
        setVisible(true);
        return await new Promise<boolean>((resolve) => {
          resolverRef.current = resolve;
        });
      },
    }),
    [],
  );

  return (
    <NotificationGateContext.Provider value={value}>
      {children}
      <Modal transparent visible={visible} animationType="fade" statusBarTranslucent onRequestClose={() => close(false)}>
        <View style={styles.modalRoot}>
          <Pressable
            style={[styles.backdrop, { backgroundColor: isDark ? "rgba(0,0,0,0.62)" : "rgba(15,23,42,0.45)" }]}
            onPress={() => close(false)}
            accessibilityRole="button"
            accessibilityLabel="Dismiss"
          />
          <View
            style={[
              styles.sheet,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
                borderRadius: theme.radius.lg,
                ...theme.shadow.card,
              },
            ]}
          >
            <Text style={[styles.title, { color: theme.colors.textPrimary }]}>{titleForReason(reason)}</Text>
            <Text style={[styles.body, { color: theme.colors.textSecondary }]}>{bodyForReason(reason)}</Text>
            {status === "denied" ? (
              <Text style={[styles.note, { color: theme.colors.textMuted }]}>
                You previously denied notifications. Android only lets you re-enable it from Settings.
              </Text>
            ) : null}
            <View style={styles.actions}>
              <Button
                title={primaryLabelForStatus(status)}
                onPress={() => void runPrimary()}
                disabled={busy}
              />
              <Button
                title="Not now"
                variant="secondary"
                onPress={() => close(false)}
                disabled={busy}
              />
            </View>
          </View>
        </View>
      </Modal>
    </NotificationGateContext.Provider>
  );
}

export function useNotificationGate(): NotificationGateContextValue {
  const v = useContext(NotificationGateContext);
  if (!v) throw new Error("useNotificationGate must be used within NotificationGateProvider");
  return v;
}

const styles = StyleSheet.create({
  modalRoot: { flex: 1, justifyContent: "flex-end", padding: 20 },
  backdrop: { ...StyleSheet.absoluteFillObject },
  sheet: {
    width: "100%",
    maxWidth: 440,
    alignSelf: "center",
    borderWidth: 1,
    padding: 18,
  },
  title: { fontSize: 18, fontWeight: "900", letterSpacing: -0.2, marginBottom: 6 },
  body: { fontSize: 13.5, lineHeight: 18, fontWeight: "600" },
  note: { fontSize: 12.5, lineHeight: 17, fontWeight: "600", marginTop: 10 },
  actions: { gap: 10, marginTop: 14 },
});

