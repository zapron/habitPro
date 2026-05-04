import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Modal, Pressable, StyleSheet, View } from "react-native";
import { Bell } from "lucide-react-native";
import { Text } from "../components/AppText";
import { Button } from "../components/Button";
import { useReducedMotion } from "../hooks/useReducedMotion";
import type { AppTheme } from "../styles/theme";
import { useTheme } from "./ThemeContext";
import {
  getRemotePushPermissionDetails,
  registerPushTokenForCurrentUser,
  requestRemotePushPermissionDetails,
  type RemotePushPermissionStatus,
} from "../lib/pushTokens";
import * as Linking from "expo-linking";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "./AuthContext";

export type NotificationGateReason =
  | "mini_timer"
  | "daily_reminder"
  | "mission_create"
  | "invite_accept"
  | "app_launch";

export type NotificationGateResult = "granted" | "skipped" | "settings";

type NotificationGateContextValue = {
  /**
   * Prompts for notification permission when needed.
   * Resolves true when permission is granted; false if user cancels / skips.
   */
  requireNotifications: (reason: NotificationGateReason) => Promise<boolean>;
  /**
   * Soft prompt variant. Useful when the feature can continue without notifications.
   */
  softAskNotifications: (reason: NotificationGateReason) => Promise<NotificationGateResult>;
  /**
   * Non-blocking soft ask. Only shows when notifications are not granted and this reason
   * hasn't been shown on this device yet.
   */
  suggestNotifications: (reason: "mission_create" | "invite_accept" | "app_launch") => Promise<boolean>;
};

const NotificationGateContext = createContext<NotificationGateContextValue | null>(null);

function titleForReason(reason: NotificationGateReason): string {
  switch (reason) {
    case "mini_timer":
      return "Protect this mini mission";
    case "daily_reminder":
      return "Enable notifications for reminders";
    case "mission_create":
      return "Turn on notifications?";
    case "invite_accept":
      return "Turn on notifications?";
    case "app_launch":
      return "Stay on track with HabitPro";
  }
}

function bodyForReason(reason: NotificationGateReason): string {
  switch (reason) {
    case "mini_timer":
      return "Allow timer alerts so HabitPro can warn you near the end, even if your screen locks or you switch apps.";
    case "daily_reminder":
      return "So we can notify you at your chosen daily reminder time.";
    case "mission_create":
      return "For a better experience, enable notifications so we can remind you to check in on this mission.";
    case "invite_accept":
      return "Enable notifications to get updates and reminders for your group mission.";
    case "app_launch":
      return "For the best experience, turn on notifications for streak check-ins, mission reminders, and squad updates. You can change this anytime in Settings.";
  }
}

function primaryLabelForStatus(
  status: RemotePushPermissionStatus,
  reason: NotificationGateReason,
  canAskAgain: boolean,
): string {
  if (status === "denied" && !canAskAgain) return "Open Settings";
  if (reason === "mini_timer") return "Enable timer alerts";
  return "Enable notifications";
}

function secondaryLabelForReason(reason: NotificationGateReason): string {
  if (reason === "mini_timer") return "Start anyway";
  return "Not now";
}

function softAskStorageKey(reason: "mission_create" | "invite_accept" | "app_launch"): string {
  return `@habitpro_notif_softask_${reason}_v1`;
}

function NotificationPermissionSheet({
  reason,
  status,
  canAskAgain,
  busy,
  theme,
  isDark,
  onClose,
  onPrimary,
}: {
  reason: NotificationGateReason;
  status: RemotePushPermissionStatus;
  canAskAgain: boolean;
  busy: boolean;
  theme: AppTheme;
  isDark: boolean;
  onClose: () => void;
  onPrimary: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const backdropOp = useRef(new Animated.Value(0)).current;
  const sheetOp = useRef(new Animated.Value(0)).current;
  const sheetY = useRef(new Animated.Value(28)).current;

  useEffect(() => {
    if (reduceMotion) {
      backdropOp.setValue(1);
      sheetOp.setValue(1);
      sheetY.setValue(0);
      return;
    }
    backdropOp.setValue(0);
    sheetOp.setValue(0);
    sheetY.setValue(28);
    Animated.parallel([
      Animated.timing(backdropOp, {
        toValue: 1,
        duration: 240,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(sheetOp, {
        toValue: 1,
        duration: 280,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(sheetY, {
        toValue: 0,
        friction: 9,
        tension: 68,
        useNativeDriver: true,
      }),
    ]).start();
  }, [backdropOp, reduceMotion, sheetOp, sheetY]);

  const accent = theme.colors.indigo[500];
  const accentSoft = isDark ? "rgba(99, 102, 241, 0.22)" : "rgba(79, 70, 229, 0.12)";

  return (
    <View style={styles.modalRoot} pointerEvents="box-none">
      <Animated.View
        pointerEvents="box-none"
        style={[
          styles.backdrop,
          {
            opacity: backdropOp,
            backgroundColor: isDark ? "rgba(0,0,0,0.62)" : "rgba(15,23,42,0.45)",
          },
        ]}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Dismiss" />
      </Animated.View>
      <Animated.View
        style={{
          width: "100%",
          maxWidth: 440,
          alignSelf: "center",
          opacity: sheetOp,
          transform: [{ translateY: sheetY }],
        }}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={[
            styles.sheet,
            {
              backgroundColor: theme.colors.surface,
              borderColor: accent,
              borderRadius: theme.radius.lg,
              ...theme.shadow.card,
              shadowColor: accent,
            },
          ]}
        >
          <View style={[styles.sheetAccentBar, { backgroundColor: accent }]} />
          <View style={[styles.iconWrap, { backgroundColor: accentSoft }]}>
            <Bell size={26} color={accent} strokeWidth={2.2} />
          </View>
          {reason === "app_launch" ? (
            <Text style={[styles.title, { color: theme.colors.textPrimary }]}>
              <Text style={{ fontWeight: "900" }}>Stay on track with </Text>
              <Text style={{ fontWeight: "900", color: theme.colors.indigo[400] }}>HabitPro</Text>
            </Text>
          ) : (
            <Text style={[styles.title, { color: theme.colors.textPrimary }]}>{titleForReason(reason)}</Text>
          )}
          <Text style={[styles.body, { color: theme.colors.textSecondary }]}>{bodyForReason(reason)}</Text>
          {status === "denied" && !canAskAgain ? (
            <Text style={[styles.note, { color: theme.colors.amber[500] }]}>
              You previously denied notifications. On Android, turn them back on from Settings.
            </Text>
          ) : null}
          <View style={styles.actions}>
            <Button title={primaryLabelForStatus(status, reason, canAskAgain)} onPress={onPrimary} disabled={busy} />
            <Button title={secondaryLabelForReason(reason)} variant="secondary" onPress={onClose} disabled={busy} />
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
}

export function NotificationGateProvider({ children }: { children: React.ReactNode }) {
  const { theme, isDark } = useTheme();
  const { session } = useAuth();
  const resolverRef = useRef<((ok: boolean) => void) | null>(null);
  const resultResolverRef = useRef<((result: NotificationGateResult) => void) | null>(null);
  const [visible, setVisible] = useState(false);
  const [reason, setReason] = useState<NotificationGateReason>("mini_timer");
  const [status, setStatus] = useState<RemotePushPermissionStatus>("undetermined");
  const [canAskAgain, setCanAskAgain] = useState(true);
  const [busy, setBusy] = useState(false);
  const uid = session?.user?.id ?? null;

  const close = (result: NotificationGateResult) => {
    setVisible(false);
    setBusy(false);
    const resolveBoolean = resolverRef.current;
    const resolveResult = resultResolverRef.current;
    resolverRef.current = null;
    resultResolverRef.current = null;
    resolveBoolean?.(result === "granted");
    resolveResult?.(result);
  };

  const runPrimary = async () => {
    if (busy) return;
    setBusy(true);
    const current = await getRemotePushPermissionDetails();
    setStatus(current.status);
    setCanAskAgain(current.canAskAgain);
    if (current.status === "granted") {
      if (uid) void registerPushTokenForCurrentUser(uid);
      close("granted");
      return;
    }
    if (current.status === "undetermined" || (current.status === "denied" && current.canAskAgain)) {
      const next = await requestRemotePushPermissionDetails();
      setStatus(next.status);
      setCanAskAgain(next.canAskAgain);
      setBusy(false);
      if (next.status === "granted") {
        if (uid) void registerPushTokenForCurrentUser(uid);
        close("granted");
      }
      return;
    }
    // denied / unavailable → Settings path (OS-controlled)
    try {
      await Linking.openSettings();
    } finally {
      setBusy(false);
      close("settings");
    }
  };

  const value = useMemo<NotificationGateContextValue>(
    () => ({
      requireNotifications: async (nextReason: NotificationGateReason) => {
        const details = await getRemotePushPermissionDetails();
        if (details.status === "granted") return true;
        if (details.status === "unavailable") return false;
        if (resolverRef.current) {
          return await new Promise<boolean>((resolve) => {
            const prev = resolverRef.current;
            resolverRef.current = (ok) => {
              prev?.(ok);
              resolve(ok);
            };
          });
        }
        if (resultResolverRef.current) return false;
        setReason(nextReason);
        setStatus(details.status);
        setCanAskAgain(details.canAskAgain);
        setVisible(true);
        return await new Promise<boolean>((resolve) => {
          resolverRef.current = resolve;
        });
      },
      softAskNotifications: async (nextReason: NotificationGateReason) => {
        const details = await getRemotePushPermissionDetails();
        if (details.status === "granted") return "granted";
        if (details.status === "unavailable") return "skipped";
        if (resolverRef.current || resultResolverRef.current) return "skipped";
        setReason(nextReason);
        setStatus(details.status);
        setCanAskAgain(details.canAskAgain);
        setVisible(true);
        return await new Promise<NotificationGateResult>((resolve) => {
          resultResolverRef.current = resolve;
        });
      },
      suggestNotifications: async (nextReason: "mission_create" | "invite_accept" | "app_launch") => {
        const details = await getRemotePushPermissionDetails();
        if (details.status === "granted") return true;
        if (details.status === "unavailable") return false;
        try {
          const key = softAskStorageKey(nextReason);
          const already = await AsyncStorage.getItem(key);
          if (already === "1") return false;
          await AsyncStorage.setItem(key, "1");
        } catch {
          // Ignore storage failures; still best-effort show.
        }
        if (resolverRef.current || resultResolverRef.current) return false;
        setReason(nextReason);
        setStatus(details.status);
        setCanAskAgain(details.canAskAgain);
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
      <Modal transparent visible={visible} animationType="none" statusBarTranslucent onRequestClose={() => close("skipped")}>
        {visible ? (
          <NotificationPermissionSheet
            reason={reason}
            status={status}
            canAskAgain={canAskAgain}
            busy={busy}
            theme={theme}
            isDark={isDark}
            onClose={() => close("skipped")}
            onPrimary={() => void runPrimary()}
          />
        ) : null}
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
    borderWidth: 1.5,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 18,
    overflow: "hidden",
  },
  sheetAccentBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 3,
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  title: { fontSize: 18, fontWeight: "900", letterSpacing: -0.2, marginBottom: 8, lineHeight: 24 },
  body: { fontSize: 14, lineHeight: 20, fontWeight: "600" },
  note: { fontSize: 12.5, lineHeight: 17, fontWeight: "700", marginTop: 10 },
  actions: { gap: 10, marginTop: 16 },
});

