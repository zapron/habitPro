import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "../components/AppText";
import { Button } from "../components/Button";
import { PlusBadge } from "../components/PlusBadge";
import { useTheme } from "./ThemeContext";
import { BillingProvider, useBilling } from "./BillingContext";

export type PlusUpsellReason =
  | "generic"
  | "community"
  | "visibility"
  | "community_publish"
  | "group_mission"
  | "invite_accept"
  | "squad_nudge"
  | "profile";

type PlusUpsellContextValue = {
  /** Open the HabitPro Community upsell. Treat unknown loading as non‑Community at call sites. */
  openUpsell: (reason?: PlusUpsellReason) => void;
  closeUpsell: () => void;
};

const PlusUpsellContext = createContext<PlusUpsellContextValue | null>(null);

const BULLETS = [
  "Cheer and discover wins in Community",
  "Public missions: visible to your squad on the mission",
  "Group missions, invites, and cohort streaks",
  "Squad nudges (cheer, ping, fire, one-time note)",
  "Publish streak moments and mini wins to Community",
];

export function PlusUpsellProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState(false);
  const [reason, setReason] = useState<PlusUpsellReason>("generic");

  const openUpsell = useCallback((r?: PlusUpsellReason) => {
    setReason(r ?? "generic");
    setVisible(true);
  }, []);

  const closeUpsell = useCallback(() => setVisible(false), []);

  const value = useMemo(
    () => ({ openUpsell, closeUpsell }),
    [openUpsell, closeUpsell],
  );

  const headline =
    reason === "community"
      ? "Community is part of HabitPro Community"
      : reason === "visibility"
        ? "Public squad visibility is HabitPro Community"
        : reason === "community_publish"
          ? "Publishing to Community is HabitPro Community"
          : reason === "group_mission"
            ? "Group missions are HabitPro Community"
            : reason === "invite_accept"
              ? "Joining group missions is HabitPro Community"
              : reason === "squad_nudge"
                ? "Squad nudges are HabitPro Community"
                : reason === "profile"
                  ? "HabitPro Community"
                  : "Unlock HabitPro Community";

  return (
    <BillingProvider>
      <PlusUpsellContext.Provider value={value}>
        {children}
        <Modal
          visible={visible}
          transparent
          animationType="fade"
          onRequestClose={closeUpsell}
          statusBarTranslucent
          accessibilityViewIsModal
        >
          <BillingUpsellModal
            visible={visible}
            onClose={closeUpsell}
            headline={headline}
            isDark={isDark}
            insetsBottom={insets.bottom}
          />
        </Modal>
      </PlusUpsellContext.Provider>
    </BillingProvider>
  );
}

function BillingUpsellModal({
  visible,
  onClose,
  headline,
  isDark,
  insetsBottom,
}: {
  visible: boolean;
  onClose: () => void;
  headline: string;
  isDark: boolean;
  insetsBottom: number;
}) {
  const { theme } = useTheme();
  const { configured, ready, purchaseCommunity, restore } = useBilling();
  const [busy, setBusy] = useState<null | "monthly" | "annual" | "restore">(
    null,
  );

  if (!visible) return null;

  const canBuy = configured && ready && busy === null;

  const run = async (kind: "monthly" | "annual" | "restore") => {
    setBusy(kind);
    try {
      if (kind === "restore") {
        await restore();
        onClose();
        return;
      }
      const res = await purchaseCommunity(kind);
      if (!res.cancelled) onClose();
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={styles.root}>
      <Pressable
        style={[
          styles.backdrop,
          {
            backgroundColor: isDark
              ? "rgba(0,0,0,0.55)"
              : "rgba(15,23,42,0.45)",
          },
        ]}
        onPress={onClose}
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
            marginBottom: Math.max(insetsBottom, 16),
          },
        ]}
      >
        <View style={styles.titleRow}>
          <PlusBadge label="HABITPRO COMMUNITY" size="md" />
        </View>
        <Text
          style={[
            styles.title,
            { color: theme.colors.textPrimary, fontSize: theme.typography.h3 },
          ]}
        >
          {headline}
        </Text>
        <Text style={[styles.sub, { color: theme.colors.textSecondary }]}>
          Solo habits stay free. Social mode (post, cheer, squads, and invites)
          is included with HabitPro Community.
        </Text>
        <View style={styles.list}>
          {BULLETS.map((line) => (
            <View key={line} style={styles.bulletRow}>
              <Text
                style={[styles.bulletDot, { color: theme.colors.indigo[400] }]}
              >
                {"\u2022"}
              </Text>
              <Text
                style={[
                  styles.bulletText,
                  { color: theme.colors.textSecondary },
                ]}
              >
                {line}
              </Text>
            </View>
          ))}
        </View>

        <Button
          title={
            busy === "monthly" ? "Starting trial…" : "7 day trial then Monthly"
          }
          onPress={() => void run("monthly")}
          disabled={!canBuy}
          style={{ marginTop: 8, opacity: canBuy ? 1 : 0.65 }}
        />
        <Button
          title={
            busy === "annual" ? "Starting trial…" : "7 day trial then Yearly"
          }
          onPress={() => void run("annual")}
          disabled={!canBuy}
          style={{ marginTop: 10, opacity: canBuy ? 1 : 0.65 }}
        />
        <Button
          title={busy === "restore" ? "Restoring…" : "Restore purchases"}
          variant="secondary"
          onPress={() => void run("restore")}
          disabled={!configured || !ready || busy !== null}
          style={{
            marginTop: 10,
            opacity: configured && ready && busy === null ? 1 : 0.65,
          }}
        />
        <Button
          title="Not now"
          variant="secondary"
          onPress={onClose}
          style={{ marginTop: 10 }}
        />
      </View>
    </View>
  );
}

export function usePlusUpsell(): PlusUpsellContextValue {
  const v = useContext(PlusUpsellContext);
  if (!v)
    throw new Error("usePlusUpsell must be used within PlusUpsellProvider");
  return v;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "flex-end",
    paddingHorizontal: 20,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    padding: 20,
    borderWidth: 1,
    maxWidth: 440,
    width: "100%",
    alignSelf: "center",
  },
  titleRow: { marginBottom: 10 },
  title: { fontWeight: "800", letterSpacing: -0.3, marginBottom: 8 },
  sub: { fontSize: 14, lineHeight: 20, marginBottom: 14, fontWeight: "500" },
  list: { gap: 8, marginBottom: 4 },
  bulletRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  bulletDot: {
    fontSize: 14,
    fontWeight: "900",
    marginTop: 1,
    width: 14,
    textAlign: "center",
  },
  bulletText: { flex: 1, fontSize: 13, lineHeight: 19, fontWeight: "600" },
});
