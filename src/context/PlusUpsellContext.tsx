import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { Linking, Modal, Platform, Pressable, ScrollView, Share, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "../components/AppText";
import { Button } from "../components/Button";
import { PlusBadge } from "../components/PlusBadge";
import { useTheme } from "./ThemeContext";
import { useBilling, type BillingDebugSnapshot } from "./BillingContext";
import { useToast } from "./ToastContext";
import { getPublicLinks } from "../lib/env";
import { useRefreshPremiumAccess } from "../hooks/useRefreshPremiumAccess";

export type PlusUpsellReason =
  | "generic"
  | "community"
  | "visibility"
  | "community_publish"
  | "group_mission"
  | "live_mini"
  | "invite_accept"
  | "squad_nudge"
  | "streak_repair"
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
  "Live mini missions with a small squad board",
  "Squad nudges (cheer, ping, fire, one-time note)",
  "Publish streak moments and mini wins to Community",
  "Streak repairs to protect momentum",
];

function compactProduct(product: NonNullable<BillingDebugSnapshot["storeProducts"]>[number]): string {
  const options = product.subscriptionOptions?.map((o) => o.id).filter(Boolean).join(", ");
  return [
    product.identifier,
    product.priceString,
    product.subscriptionPeriod,
    options ? `options=${options}` : null,
  ].filter(Boolean).join(" | ");
}

function billingDebugLines(debug: BillingDebugSnapshot): string[] {
  const lines = [
    `stage: ${debug.stage ?? "unknown"}`,
    `build: ${debug.appVersion ?? "?"} (${debug.nativeBuildVersion ?? "?"})`,
    `platform: ${debug.platform}, ownership: ${debug.appOwnership ?? "unknown"}`,
    `configured: ${String(debug.configured)}, ready: ${String(debug.ready)}, key: ${debug.apiKeyKind}`,
  ];

  if (debug.error) {
    lines.push(`error: ${debug.error.code ? `[${debug.error.code}] ` : ""}${debug.error.message}`);
    if (debug.error.underlying) lines.push(`underlying: ${debug.error.underlying}`);
  }

  if (debug.offerings) {
    lines.push(`offering: ${debug.offerings.currentIdentifier ?? "none"}`);
    lines.push(
      `packages: ${
        debug.offerings.currentPackages
          .map((p) => `${p.identifier} -> ${compactProduct(p.product)}`)
          .join(" ; ") || "none"
      }`,
    );
  }
  if (debug.offeringsError) lines.push(`offerings error: ${debug.offeringsError}`);

  if (debug.storeProducts?.length) {
    lines.push(`store products: ${debug.storeProducts.map(compactProduct).join(" ; ")}`);
  }
  if (debug.storeProductsError) lines.push(`store products error: ${debug.storeProductsError}`);

  if (debug.customerInfo) {
    lines.push(`active entitlements: ${debug.customerInfo.activeEntitlements.join(", ") || "none"}`);
  }
  if (debug.customerInfoError) lines.push(`customer info error: ${debug.customerInfoError}`);

  if (debug.recentLogs.length) {
    lines.push("recent logs:");
    lines.push(
      ...debug.recentLogs.slice(-3).map((line) =>
        line.length > 140 ? `${line.slice(0, 137)}...` : line,
      ),
    );
  }

  return lines;
}

function billingDebugText(debug: BillingDebugSnapshot): string {
  return `HabitPro billing debug\n\n${billingDebugLines(debug).join("\n")}\n\nRaw:\n${JSON.stringify(debug, null, 2)}`;
}

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
            : reason === "live_mini"
              ? "Live mini missions are HabitPro Community"
            : reason === "invite_accept"
              ? "Joining group missions is HabitPro Community"
              : reason === "squad_nudge"
                ? "Squad nudges are HabitPro Community"
                : reason === "streak_repair"
                  ? "Streak repairs are HabitPro Community"
                  : reason === "profile"
                    ? "HabitPro Community"
                    : "Unlock HabitPro Community";

  return (
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
  const {
    configured,
    ready,
    isExpoGo,
    purchaseCommunity,
    restore,
    billingDebug,
    runBillingDiagnostics,
  } = useBilling();
  const { showToast } = useToast();
  const refreshPremiumAccess = useRefreshPremiumAccess(1_000);
  const publicLinks = useMemo(() => getPublicLinks(), []);
  const [busy, setBusy] = useState<
    null | "monthly" | "yearly" | "restore" | "diagnostics"
  >(null);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);

  if (!visible) return null;

  const storeName = Platform.OS === "ios" ? "App Store" : "Google Play";
  const storeInstallHint =
    Platform.OS === "ios"
      ? "Purchase could not start. Make sure this app was installed from TestFlight or the App Store with a tester account."
      : "Purchase could not start. Make sure this app was installed from Google Play with a tester account.";
  const canBuy = configured && ready && busy === null;
  const showBillingDebug = __DEV__ && Boolean(purchaseError || billingDebug);
  const debugLines = showBillingDebug && billingDebug ? billingDebugLines(billingDebug) : [];

  const shareBillingDebug = async () => {
    if (!billingDebug) return;
    await Share.share({ message: billingDebugText(billingDebug) });
  };

  const refreshBillingDebug = async () => {
    setBusy("diagnostics");
    try {
      await runBillingDiagnostics();
    } finally {
      setBusy(null);
    }
  };

  const run = async (kind: "monthly" | "yearly" | "restore") => {
    setBusy(kind);
    setPurchaseError(null);
    showToast(
      kind === "restore" ? "Restoring…" : "Starting purchase…",
      "info",
      1200,
    );
    try {
      if (kind === "restore") {
        await restore();
        showToast("Activating membership...", "info", 1400);
        const serverReady = await waitForServerPremium();
        showToast(
          serverReady
            ? "Purchases restored."
            : "Purchases restored. Community actions may take a moment to activate.",
          serverReady ? "success" : "info",
          serverReady ? 2600 : 5000,
        );
        onClose();
        return;
      }
      const res = await purchaseCommunity(kind);
      if (!res.cancelled) {
        showToast("Activating membership...", "info", 1400);
        const serverReady = await waitForServerPremium();
        showToast(
          serverReady
            ? "Subscription active. Welcome to HabitPro Community."
            : "Subscription active. Community actions may take a moment to activate.",
          serverReady ? "success" : "info",
          serverReady ? 2600 : 5000,
        );
        onClose();
      } else if (res.purchaseFailed) {
        const msg = res.message?.trim();
        const prefix = res.stage ? `Failed to ${res.stage}: ` : "";
        setPurchaseError(
          msg && msg.length <= 180
            ? `${prefix}${msg}`
            : storeInstallHint,
        );
        showToast("Purchase did not complete.", "error");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setPurchaseError(
        msg.length <= 180
          ? msg
          : storeInstallHint,
      );
      showToast(msg.length > 120 ? "Purchase failed to start." : msg, "error");
    } finally {
      setBusy(null);
    }
  };

  async function waitForServerPremium(): Promise<boolean> {
    const delays = [0, 1_000, 2_000, 3_000, 5_000];
    for (const delayMs of delays) {
      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
      const ok = await refreshPremiumAccess({ force: true, serverOnly: true });
      if (ok === true) return true;
    }
    return false;
  }

  const onOpenPrivacy = async () => {
    await Linking.openURL(publicLinks.privacy);
  };

  const onOpenTerms = async () => {
    await Linking.openURL(publicLinks.terms);
  };

  return (
    <View style={styles.root} pointerEvents="box-none">
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
        <ScrollView
          style={styles.sheetScroll}
          contentContainerStyle={styles.sheetScrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator
        >
        <View style={styles.titleRow}>
          <PlusBadge withFlame size="md" />
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

        <Text style={[styles.disclaimer, { color: theme.colors.textMuted }]}>
          Monthly and yearly plans are shown by {storeName} before purchase. Cancel anytime in {storeName}.
        </Text>

        {!configured ? (
          <Text
            style={[styles.disclaimerHint, { color: theme.colors.textMuted }]}
          >
            Billing isn’t configured yet on this build. Add your RevenueCat API
            key to enable purchases.
          </Text>
        ) : isExpoGo ? (
          <Text
            style={[styles.disclaimerHint, { color: theme.colors.textMuted }]}
          >
            Billing is available in a dev build or store install (not Expo Go).
          </Text>
        ) : null}

        {purchaseError ? (
          <Text style={[styles.errorText, { color: theme.colors.red[500] }]}>
            {purchaseError}
          </Text>
        ) : null}

        {showBillingDebug ? (
          <View style={styles.debugActions}>
            <Button
              title={
                busy === "diagnostics"
                  ? "Checking billing..."
                  : "Refresh billing debug"
              }
              variant="secondary"
              onPress={() => void refreshBillingDebug()}
              disabled={busy !== null}
              style={{ marginTop: 10, opacity: busy === null ? 1 : 0.65 }}
            />
            <Button
              title="Share billing debug"
              variant="secondary"
              onPress={() => void shareBillingDebug()}
              disabled={!billingDebug || busy !== null}
              style={{
                marginTop: 10,
                opacity: billingDebug && busy === null ? 1 : 0.65,
              }}
            />
          </View>
        ) : null}

        {debugLines.length > 0 ? (
          <View
            style={[
              styles.debugBox,
              {
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surfaceElevated,
              },
            ]}
          >
            <Text style={[styles.debugTitle, { color: theme.colors.textPrimary }]}>
              Billing debug
            </Text>
            {debugLines.map((line, idx) => (
              <Text
                key={`${idx}-${line.slice(0, 12)}`}
                style={[styles.debugLine, { color: theme.colors.textSecondary }]}
              >
                {line}
              </Text>
            ))}
            <Text style={[styles.debugLine, { color: theme.colors.textMuted }]}>
              Share includes the full raw debug text.
            </Text>
          </View>
        ) : null}

        <Button
          title={
            busy === "monthly" ? `Opening ${storeName}…` : "Subscribe monthly"
          }
          onPress={() => void run("monthly")}
          disabled={!canBuy}
          style={{ marginTop: 8, opacity: canBuy ? 1 : 0.65 }}
        />
        <Button
          title={
            busy === "yearly" ? `Opening ${storeName}…` : "Subscribe yearly"
          }
          onPress={() => void run("yearly")}
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

        <View style={styles.linkRow}>
          <Pressable
            onPress={() => void onOpenTerms()}
            accessibilityRole="link"
          >
            <Text style={[styles.link, { color: theme.colors.indigo[400] }]}>
              Terms
            </Text>
          </Pressable>
          <Text style={[styles.linkSep, { color: theme.colors.textMuted }]}>
            ·
          </Text>
          <Pressable
            onPress={() => void onOpenPrivacy()}
            accessibilityRole="link"
          >
            <Text style={[styles.link, { color: theme.colors.indigo[400] }]}>
              Privacy
            </Text>
          </Pressable>
        </View>

        <Button
          title="Not now"
          variant="secondary"
          onPress={onClose}
          style={{ marginTop: 10 }}
        />
        </ScrollView>
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
    zIndex: 1,
  },
  sheet: {
    borderWidth: 1,
    maxHeight: "92%",
    maxWidth: 440,
    width: "100%",
    alignSelf: "center",
    zIndex: 2,
    overflow: "hidden",
  },
  sheetScroll: { width: "100%" },
  sheetScrollContent: { padding: 20, paddingBottom: 24 },
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
  disclaimer: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "700",
    marginTop: 10,
  },
  disclaimerHint: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "700",
    marginTop: 6,
    opacity: 0.9,
  },
  errorText: { fontSize: 12, lineHeight: 17, fontWeight: "800", marginTop: 8 },
  debugActions: { marginTop: 10 },
  debugBox: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    marginTop: 10,
    gap: 4,
  },
  debugTitle: { fontSize: 12, fontWeight: "900" },
  debugLine: { fontSize: 10, lineHeight: 14, fontWeight: "700" },
  linkRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
  },
  link: { fontSize: 12, fontWeight: "800" },
  linkSep: { fontSize: 12, fontWeight: "800" },
});
