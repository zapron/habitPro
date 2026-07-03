import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Linking, Modal, Platform, Pressable, ScrollView, Share, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Check } from "lucide-react-native";
import { Text } from "../components/AppText";
import { Button } from "../components/Button";
import { PlusBadge } from "../components/PlusBadge";
import { useTheme } from "./ThemeContext";
import { useBilling, type BillingDebugSnapshot } from "./BillingContext";
import { usePremium } from "./PremiumContext";
import { useToast } from "./ToastContext";
import { getPublicLinks } from "../lib/env";
import { startCommunityTrial } from "../lib/communityAccessApi";
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
  /** Open the HabitPro Community upsell. Treat unknown loading as non-Community at call sites. */
  openUpsell: (reason?: PlusUpsellReason) => void;
  closeUpsell: () => void;
};

const PlusUpsellContext = createContext<PlusUpsellContextValue | null>(null);

const BENEFITS = [
  "Share wins and cheer each other on",
  "Join squads, invites, and group missions",
  "Publish streak moments and protect momentum",
];

type UpsellBusy = null | "trial" | "monthly" | "yearly" | "restore" | "diagnostics";
type UpsellPhase =
  | null
  | "starting_trial"
  | "opening_store"
  | "restoring"
  | "applying";

function formatTrialDays(days: number): string {
  if (days >= 30 && days % 30 === 0) {
    const months = days / 30;
    return months === 1 ? "1-month" : `${months}-month`;
  }
  return `${days}-day`;
}

function planButtonTitle(
  label: "Monthly" | "Yearly",
  priceString: string | null | undefined,
): string {
  if (!priceString) return `Subscribe ${label.toLowerCase()}`;
  return `${label} - ${priceString}/${label === "Monthly" ? "month" : "year"}`;
}

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
      ? "Unlock the social layer"
      : reason === "visibility"
        ? "Make this mission public"
        : reason === "community_publish"
          ? "Share this win"
          : reason === "group_mission"
            ? "Start group missions"
            : reason === "live_mini"
              ? "Host live mini missions"
            : reason === "invite_accept"
              ? "Join the squad mission"
              : reason === "squad_nudge"
                ? "Send squad nudges"
                : reason === "streak_repair"
                  ? "Protect your streak"
                  : reason === "profile"
                    ? "Manage your membership"
                    : "Unlock the social layer";

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
    communityPlans,
    refreshCommunityPlans,
    purchaseCommunity,
    restore,
    billingDebug,
    runBillingDiagnostics,
  } = useBilling();
  const { accessStatus, refresh: refreshPremium } = usePremium();
  const { showToast } = useToast();
  const refreshPremiumAccess = useRefreshPremiumAccess(1_000);
  const publicLinks = useMemo(() => getPublicLinks(), []);
  const [busy, setBusy] = useState<UpsellBusy>(null);
  const [phase, setPhase] = useState<UpsellPhase>(null);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    void refreshPremium();
    if (!configured || !ready || isExpoGo) return;
    void refreshCommunityPlans().catch((e) => {
      if (__DEV__) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn("[habitPro] paywall plan refresh failed:", msg);
      }
    });
  }, [configured, isExpoGo, ready, refreshCommunityPlans, refreshPremium, visible]);

  if (!visible) return null;

  const storeName = Platform.OS === "ios" ? "App Store" : "Google Play";
  const storeInstallHint =
    Platform.OS === "ios"
      ? "Purchase could not start. Make sure this app was installed from TestFlight or the App Store with a tester account."
      : "Purchase could not start. Make sure this app was installed from Google Play with a tester account.";
  const canBuy = configured && ready && busy === null;
  const trialDays = accessStatus?.trialDays ?? 7;
  const trialLabel = formatTrialDays(trialDays);
  const trialAvailable = accessStatus?.trialAvailable === true;
  const trialUsed = accessStatus?.trialUsed === true;
  const canStartTrial = trialAvailable && busy === null;
  const monthlyTitle = planButtonTitle("Monthly", communityPlans.monthly?.priceString);
  const yearlyTitle = planButtonTitle("Yearly", communityPlans.yearly?.priceString);
  const paidPlanHint = communityPlans.monthly?.priceString
    ? `Then from ${communityPlans.monthly.priceString}/month.`
    : "Plans are shown before purchase.";
  const showBillingDebug = __DEV__ && Boolean(purchaseError || billingDebug);
  const debugLines = showBillingDebug && billingDebug ? billingDebugLines(billingDebug) : [];

  const shareBillingDebug = async () => {
    if (!billingDebug) return;
    await Share.share({ message: billingDebugText(billingDebug) });
  };

  const refreshBillingDebug = async () => {
    setBusy("diagnostics");
    setPhase(null);
    try {
      await runBillingDiagnostics();
    } finally {
      setBusy(null);
      setPhase(null);
    }
  };

  const runTrial = async () => {
    setBusy("trial");
    setPhase("starting_trial");
    setPurchaseError(null);
    showToast(`Starting ${trialLabel} free trial...`, "info", 1400);
    try {
      const res = await startCommunityTrial();
      if (res.ok && res.status?.hasAccess) {
        setPhase("applying");
        await refreshPremium();
        await refreshPremiumAccess({ force: true, serverOnly: true });
        showToast(`Community trial active for ${trialLabel}.`, "success", 2800);
        onClose();
        return;
      }

      const message =
        res.reason === "trial_disabled"
          ? "Free trial is not available right now."
          : res.reason === "trial_already_used"
            ? "This account already used its free trial."
            : res.error?.message ?? "Could not start free trial.";
      setPurchaseError(message);
      showToast(message, "error");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setPurchaseError(msg.length <= 180 ? msg : "Could not start free trial.");
      showToast("Could not start free trial.", "error");
    } finally {
      setBusy(null);
      setPhase(null);
    }
  };

  const run = async (kind: "monthly" | "yearly" | "restore") => {
    setBusy(kind);
    setPhase(kind === "restore" ? "restoring" : "opening_store");
    setPurchaseError(null);
    showToast(
      kind === "restore" ? "Restoring..." : "Starting purchase...",
      "info",
      1200,
    );
    try {
      if (kind === "restore") {
        await restore();
        setPhase("applying");
        showToast("Applying membership...", "info", 1400);
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
        setPhase("applying");
        showToast("Applying subscription...", "info", 1400);
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
      setPhase(null);
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

  const paidBusyTitle =
    phase === "applying" ? "Applying subscription..." : `Opening ${storeName}...`;
  const yearlyButtonTitle = busy === "yearly" ? paidBusyTitle : yearlyTitle;
  const monthlyButtonTitle = busy === "monthly" ? paidBusyTitle : monthlyTitle;
  const restoreButtonTitle =
    busy === "restore"
      ? phase === "applying"
        ? "Applying membership..."
        : "Restoring purchases..."
      : "Restore purchases";
  const trialButtonTitle =
    busy === "trial"
      ? phase === "applying"
        ? "Activating trial..."
        : "Starting trial..."
      : `Start ${trialLabel} free trial`;

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
          <Text style={[styles.wordmark, { color: theme.colors.textPrimary }]}>
            Habit
            <Text style={{ color: theme.colors.indigo[400] }}>Pro</Text>
          </Text>
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
          Solo habits stay free. Community unlocks the social layer.
        </Text>

        <View
          style={[
            styles.benefitBox,
            {
              backgroundColor: theme.colors.surfaceElevated,
              borderColor: theme.colors.border,
            },
          ]}
        >
          {BENEFITS.map((line) => (
            <View key={line} style={styles.benefitRow}>
              <View
                style={[
                  styles.checkDot,
                  { backgroundColor: isDark ? "rgba(99, 102, 241, 0.22)" : "rgba(99, 102, 241, 0.10)" },
                ]}
              >
                <Check size={13} color={theme.colors.indigo[400]} strokeWidth={3} />
              </View>
              <Text
                style={[
                  styles.benefitText,
                  { color: theme.colors.textSecondary },
                ]}
              >
                {line}
              </Text>
            </View>
          ))}
        </View>

        <View
          style={[
            styles.notice,
            {
              backgroundColor: isDark ? "rgba(99, 102, 241, 0.12)" : "rgba(99, 102, 241, 0.07)",
              borderColor: isDark ? "rgba(129, 140, 248, 0.28)" : "rgba(99, 102, 241, 0.16)",
            },
          ]}
        >
          <Text style={[styles.noticeTitle, { color: theme.colors.textPrimary }]}>
            {trialAvailable ? `${trialLabel} free trial` : "Flexible plans"}
          </Text>
          <Text style={[styles.noticeText, { color: theme.colors.textSecondary }]}>
            {trialAvailable
              ? `No payment required. ${paidPlanHint}`
              : `Shown by ${storeName} before purchase. Cancel anytime.`}
          </Text>
        </View>

        {!trialAvailable && trialUsed ? (
          <Text style={[styles.disclaimerHint, { color: theme.colors.textMuted }]}>
            This account already used its free trial.
          </Text>
        ) : null}

        {!configured ? (
          <Text
            style={[styles.disclaimerHint, { color: theme.colors.textMuted }]}
          >
            Billing isn't configured yet on this build. Add your RevenueCat API
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

        {trialAvailable ? (
          <Button
            title={trialButtonTitle}
            onPress={() => void runTrial()}
            disabled={!canStartTrial}
            style={{ marginTop: 8, opacity: canStartTrial ? 1 : 0.65 }}
          />
        ) : null}
        <Button
          title={yearlyButtonTitle}
          onPress={() => void run("yearly")}
          disabled={!canBuy}
          style={{ marginTop: trialAvailable ? 10 : 8, opacity: canBuy ? 1 : 0.65 }}
        />
        <Button
          title={monthlyButtonTitle}
          variant="secondary"
          onPress={() => void run("monthly")}
          disabled={!canBuy}
          style={{ marginTop: 10, opacity: canBuy ? 1 : 0.65 }}
        />
        <Pressable
          onPress={() => void run("restore")}
          disabled={!configured || !ready || busy !== null}
          accessibilityRole="button"
          style={[
            styles.restoreLink,
            { opacity: configured && ready && busy === null ? 1 : 0.55 },
          ]}
        >
          <Text style={[styles.restoreText, { color: theme.colors.indigo[400] }]}>
            {restoreButtonTitle}
          </Text>
        </Pressable>

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
            -
          </Text>
          <Pressable
            onPress={() => void onOpenPrivacy()}
            accessibilityRole="link"
          >
            <Text style={[styles.link, { color: theme.colors.indigo[400] }]}>
              Privacy
            </Text>
          </Pressable>
          <Text style={[styles.linkSep, { color: theme.colors.textMuted }]}>
            -
          </Text>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
          >
            <Text style={[styles.link, { color: theme.colors.textMuted }]}>
              Not now
            </Text>
          </Pressable>
        </View>

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
    maxHeight: "86%",
    maxWidth: 440,
    width: "100%",
    alignSelf: "center",
    zIndex: 2,
    overflow: "hidden",
  },
  sheetScroll: { width: "100%" },
  sheetScrollContent: { padding: 18, paddingBottom: 18 },
  titleRow: {
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  wordmark: {
    fontSize: 18,
    lineHeight: 22,
    fontWeight: "900",
    letterSpacing: 0,
  },
  title: { fontWeight: "800", letterSpacing: 0, marginBottom: 6 },
  sub: { fontSize: 13, lineHeight: 18, marginBottom: 12, fontWeight: "600" },
  benefitBox: {
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 11,
    paddingHorizontal: 12,
    gap: 9,
    marginBottom: 10,
  },
  benefitRow: { flexDirection: "row", alignItems: "center", gap: 9 },
  checkDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  benefitText: { flex: 1, fontSize: 12.5, lineHeight: 17, fontWeight: "700" },
  notice: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  noticeTitle: { fontSize: 13, lineHeight: 17, fontWeight: "900" },
  noticeText: { fontSize: 12, lineHeight: 16, fontWeight: "700", marginTop: 2 },
  disclaimerHint: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "700",
    marginTop: 4,
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
  restoreLink: {
    minHeight: 38,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
    paddingHorizontal: 8,
  },
  restoreText: { fontSize: 12, lineHeight: 16, fontWeight: "800" },
  linkRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    marginTop: 6,
  },
  link: { fontSize: 12, fontWeight: "800" },
  linkSep: { fontSize: 12, fontWeight: "800" },
});

