import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { Text } from "../components/AppText";
import { Button } from "../components/Button";
import { UsernameSetupFields } from "../components/UsernameSetupFields";
import { useTheme } from "./ThemeContext";
import { useHabitStore } from "../store/habitStore";
import { useAuth } from "./AuthContext";

type UsernameGateReason =
  | "community_like"
  | "community_post"
  | "group_mission_create"
  | "group_invite"
  | "live_mini_create"
  | "live_mini_invite";

type UsernameGateContextValue = {
  /**
   * Prompts for username if missing. Resolves true when the user has a username,
   * false if they skipped.
   */
  requireUsername: (reason: UsernameGateReason) => Promise<boolean>;
};

const UsernameGateContext = createContext<UsernameGateContextValue | null>(null);

function titleForReason(reason: UsernameGateReason): string {
  switch (reason) {
    case "community_like":
      return "Pick a username to cheer";
    case "community_post":
      return "Pick a username to post";
    case "group_mission_create":
      return "Pick a username to start a group mission";
    case "group_invite":
      return "Pick a username to invite";
    case "live_mini_create":
      return "Pick a username to start Live Squad";
    case "live_mini_invite":
      return "Pick a username to invite";
  }
}

function bodyForReason(reason: UsernameGateReason): string {
  switch (reason) {
    case "community_like":
      return "Cheering is social. Choose a public username so others can recognize you.";
    case "community_post":
      return "Community posts show your handle. Choose a public username to publish.";
    case "group_mission_create":
      return "Group missions use your handle for invites and squad activity.";
    case "live_mini_create":
      return "Live mini missions use your handle for invites and the squad board.";
    case "live_mini_invite":
      return "Invites include your handle so people know who started the mini mission.";
    case "group_invite":
      return "Invites include your handle so your squad knows it’s you.";
  }
}

export function UsernameGateProvider({ children }: { children: React.ReactNode }) {
  const { theme, isDark } = useTheme();
  const { session } = useAuth();
  const username = useHabitStore((s) => s.username);

  const resolverRef = useRef<((ok: boolean) => void) | null>(null);
  const [visible, setVisible] = useState(false);
  const [reason, setReason] = useState<UsernameGateReason>("community_like");

  const close = (result: boolean) => {
    setVisible(false);
    const resolve = resolverRef.current;
    resolverRef.current = null;
    resolve?.(result);
  };

  useEffect(() => {
    if (!visible) return;
    if (username && username.trim().length > 0) {
      close(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, username]);

  const value = useMemo<UsernameGateContextValue>(
    () => ({
      requireUsername: async (nextReason: UsernameGateReason) => {
        const u = username?.trim() ?? "";
        if (u.length > 0) return true;
        if (!session?.user) return false;
        if (resolverRef.current) {
          // Another prompt is already open; do not stack.
          return await new Promise<boolean>((resolve) => {
            const prev = resolverRef.current;
            resolverRef.current = (ok) => {
              prev?.(ok);
              resolve(ok);
            };
          });
        }
        setReason(nextReason);
        setVisible(true);
        return await new Promise<boolean>((resolve) => {
          resolverRef.current = resolve;
        });
      },
    }),
    [session?.user, username],
  );

  return (
    <UsernameGateContext.Provider value={value}>
      {children}
      <Modal transparent visible={visible} animationType="fade" statusBarTranslucent onRequestClose={() => close(false)}>
        <View style={styles.modalRoot}>
          <Pressable
            style={[
              styles.backdrop,
              { backgroundColor: isDark ? "rgba(0,0,0,0.62)" : "rgba(15,23,42,0.45)" },
            ]}
            onPress={() => close(false)}
          />
          <View
            style={[
              styles.sheet,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
                ...theme.shadow.card,
              },
            ]}
          >
            <Text style={[styles.title, { color: theme.colors.textPrimary }]}>{titleForReason(reason)}</Text>
            <Text style={[styles.body, { color: theme.colors.textSecondary }]}>{bodyForReason(reason)}</Text>
            <UsernameSetupFields />
            <Button title="Skip for now" variant="secondary" onPress={() => close(false)} style={{ marginTop: 12 }} />
          </View>
        </View>
      </Modal>
    </UsernameGateContext.Provider>
  );
}

export function useUsernameGate(): UsernameGateContextValue {
  const v = useContext(UsernameGateContext);
  if (!v) throw new Error("useUsernameGate must be used within UsernameGateProvider");
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
    borderRadius: 16,
    padding: 18,
  },
  title: { fontSize: 18, fontWeight: "900", letterSpacing: -0.2, marginBottom: 6 },
  body: { fontSize: 13.5, lineHeight: 18, fontWeight: "600" },
});

