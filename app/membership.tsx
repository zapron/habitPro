import { Text } from "../src/components/AppText";
import { useCallback, useEffect, useMemo, useState } from "react";
import { View, ScrollView, TouchableOpacity, StyleSheet, StatusBar, ActivityIndicator, Platform } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import {
  ArrowLeft,
  AlertTriangle,
  Crown,
  ExternalLink,
  RefreshCw,
  RotateCcw,
} from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Screen } from "../src/components/Screen";
import { Button } from "../src/components/Button";
import { useTheme } from "../src/context/ThemeContext";
import { useBilling } from "../src/context/BillingContext";
import { usePremium } from "../src/context/PremiumContext";
import { usePlusUpsell } from "../src/context/PlusUpsellContext";
import { useToast } from "../src/context/ToastContext";
import { useAuth } from "../src/context/AuthContext";
import type { AppTheme } from "../src/styles/theme";
import {
  buildMembershipSummary,
  formatMembershipDate,
  storeDisplayName,
} from "../src/lib/membershipFromCustomerInfo";

function DetailRow({
  label,
  value,
  theme,
  valueColor,
}: {
  label: string;
  value: string;
  theme: AppTheme;
  valueColor?: string;
}) {
  return (
    <View style={styles.detailRow}>
      <Text style={[styles.detailLabel, { color: theme.colors.textMuted }]}>{label}</Text>
      <Text
        style={[styles.detailValue, { color: valueColor ?? theme.colors.textPrimary }]}
        numberOfLines={3}
      >
        {value}
      </Text>
    </View>
  );
}

export default function MembershipScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme, isDark } = useTheme();
  const { showToast } = useToast();
  const { openUpsell } = usePlusUpsell();
  const { session } = useAuth();
  const {
    customerInfo,
    configured,
    ready,
    isExpoGo,
    refresh: refreshBilling,
    restore,
    openManageSubscriptions,
  } = useBilling();
  const { isPremium, loading: premiumLoading, refresh: refreshPremium } = usePremium();
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [manageBusy, setManageBusy] = useState(false);
  const userId = session?.user?.id ?? null;

  const summary = useMemo(() => buildMembershipSummary(customerInfo), [customerInfo]);

  useEffect(() => {
    setRestoreBusy(false);
    setManageBusy(false);
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      void refreshBilling();
      void refreshPremium();
    }, [refreshBilling, refreshPremium]),
  );

  const onRestore = useCallback(async () => {
    if (isExpoGo || !configured || !ready) return;
    setRestoreBusy(true);
    try {
      await restore();
      await refreshBilling();
      await refreshPremium();
      showToast("Purchases restored.", "success");
    } catch {
      showToast("Could not restore purchases.", "error");
    } finally {
      setRestoreBusy(false);
    }
  }, [configured, isExpoGo, ready, refreshBilling, refreshPremium, restore, showToast]);

  const onManage = useCallback(async () => {
    if (isExpoGo || !configured || !ready) return;
    setManageBusy(true);
    try {
      await openManageSubscriptions();
    } finally {
      setManageBusy(false);
      void refreshBilling();
      void refreshPremium();
    }
  }, [configured, isExpoGo, openManageSubscriptions, ready, refreshBilling, refreshPremium]);

  const billingLoading = configured && !ready && !isExpoGo;
  const storeName = Platform.OS === "android" ? "Google Play" : "App Store";

  const renewalLine = useMemo(() => {
    if (summary.kind !== "active") return null;
    if (!summary.expiresAt) {
      return summary.willRenew
        ? `Active — open ${storeName} for your next billing date.`
        : "See your store account for access dates.";
    }
    if (summary.willRenew) {
      return `Renews on ${formatMembershipDate(summary.expiresAt)}`;
    }
    return `Access until ${formatMembershipDate(summary.expiresAt)}`;
  }, [storeName, summary]);

  const bottomPad = Math.max(insets.bottom, 20) + 12;

  return (
    <Screen>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={theme.colors.background} />

      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={[styles.backBtn, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <ArrowLeft size={22} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.screenTitle, { color: theme.colors.textPrimary }]}>Membership</Text>
        <TouchableOpacity
          onPress={() => {
            void refreshBilling();
            void refreshPremium();
          }}
          style={[styles.backBtn, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
          accessibilityRole="button"
          accessibilityLabel="Refresh membership"
        >
          <RefreshCw size={18} color={theme.colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: bottomPad, paddingHorizontal: 16 }}
      >
        {isExpoGo ? (
          <View style={[styles.banner, { borderColor: theme.colors.amber[500], backgroundColor: theme.colors.surfaceElevated }]}>
            <Text style={[styles.bannerText, { color: theme.colors.textSecondary }]}>
              Subscription management runs in a store build or dev client. Expo Go cannot load native billing.
            </Text>
          </View>
        ) : null}

        {!configured ? (
          <View style={[styles.banner, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceElevated }]}>
            <Text style={[styles.bannerText, { color: theme.colors.textSecondary }]}>
              Billing is not configured in this build. Add your RevenueCat keys to see membership details.
            </Text>
          </View>
        ) : null}

        {billingLoading ? (
          <View style={[styles.card, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface, marginTop: 12 }]}>
            <ActivityIndicator color={theme.colors.indigo[400]} />
            <Text style={[styles.bannerText, { color: theme.colors.textMuted, marginTop: 10, textAlign: "center" }]}>
              Loading subscription status…
            </Text>
          </View>
        ) : null}

        {!billingLoading && isPremium && summary.kind === "active" ? (
          <>
            <View
              style={[
                styles.card,
                {
                  borderColor: theme.colors.indigo[500],
                  backgroundColor: theme.colors.surface,
                  ...theme.shadow.card,
                },
              ]}
            >
              <View style={styles.statusHead}>
                <View style={[styles.crownWrap, { backgroundColor: isDark ? "rgba(99, 102, 241, 0.2)" : "rgba(79, 70, 229, 0.12)" }]}>
                  <Crown size={22} color={theme.colors.indigo[400]} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.planTitle, { color: theme.colors.textPrimary }]}>HabitPro Community</Text>
                  <Text style={[styles.planSub, { color: theme.colors.indigo[400] }]}>{summary.periodLabel}</Text>
                </View>
                <View style={[styles.activePill, { backgroundColor: theme.colors.green[500] + "22", borderColor: theme.colors.green[500] }]}>
                  <Text style={[styles.activePillText, { color: theme.colors.green[500] }]}>Active</Text>
                </View>
              </View>

              {summary.billingIssueDetectedAt ? (
                <View style={[styles.warnRow, { backgroundColor: theme.colors.amber[500] + "14", borderColor: theme.colors.amber[500] }]}>
                  <AlertTriangle size={16} color={theme.colors.amber[500]} />
                  <Text style={[styles.warnText, { color: theme.colors.textPrimary }]}>
                    Billing issue detected. Update your payment method in {storeName} to avoid losing access.
                  </Text>
                </View>
              ) : null}

              {summary.unsubscribeDetectedAt ? (
                <View style={[styles.warnRow, { backgroundColor: theme.colors.cyan[400] + "12", borderColor: theme.colors.cyan[500] }]}>
                  <Text style={[styles.warnText, { color: theme.colors.textSecondary }]}>
                    Auto-renew is off. You keep access until the date below.
                  </Text>
                </View>
              ) : null}

              <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />

              <DetailRow label="Member since" value={formatMembershipDate(summary.startedAt)} theme={theme} />
              <DetailRow label={summary.willRenew ? "Renewal" : "Access"} value={renewalLine ?? "—"} theme={theme} />
              <DetailRow label="Purchased through" value={storeDisplayName(summary.store)} theme={theme} />
              <DetailRow
                label="Product"
                value={
                  summary.productPlanIdentifier
                    ? `${summary.productIdentifier} · ${summary.productPlanIdentifier}`
                    : summary.productIdentifier
                }
                theme={theme}
                valueColor={theme.colors.textSecondary}
              />
              {summary.isSandbox ? (
                <DetailRow label="Environment" value="Sandbox (test purchase)" theme={theme} valueColor={theme.colors.amber[500]} />
              ) : null}
            </View>

            <Text style={[styles.legal, { color: theme.colors.textMuted }]}>
              To change plans, cancel, or update payment methods, use {storeName}. HabitPro cannot cancel subscriptions
              inside the app.
            </Text>

            <Button
              title={manageBusy ? "Opening…" : `Manage in ${storeName}`}
              onPress={() => void onManage()}
              disabled={manageBusy || isExpoGo || !ready}
            />
            <Button
              title={restoreBusy ? "Restoring…" : "Restore purchases"}
              variant="secondary"
              onPress={() => void onRestore()}
              disabled={restoreBusy || isExpoGo || !ready}
              style={{ marginTop: 10 }}
            />
          </>
        ) : null}

        {!billingLoading && isPremium && summary.kind === "none" ? (
          <View
            style={[
              styles.card,
              { borderColor: theme.colors.border, backgroundColor: theme.colors.surface, marginTop: 12, ...theme.shadow.card },
            ]}
          >
            <Text style={[styles.planTitle, { color: theme.colors.textPrimary }]}>HabitPro Community</Text>
            <Text style={[styles.bodyMuted, { color: theme.colors.textSecondary, marginTop: 8 }]}>
              You have Community access on this account, but no active App Store or Play subscription was found on this
              device yet. If you subscribed on another device, use Restore. Otherwise your access may be managed directly
              on your profile.
            </Text>
            <Button title="Restore purchases" onPress={() => void onRestore()} disabled={restoreBusy || isExpoGo || !ready} style={{ marginTop: 16 }} />
            <Button
              title={`Open ${storeName}`}
              variant="secondary"
              onPress={() => void onManage()}
              disabled={manageBusy || isExpoGo || !ready}
              style={{ marginTop: 10 }}
            />
          </View>
        ) : null}

        {!billingLoading && !isPremium ? (
          <View
            style={[
              styles.card,
              { borderColor: theme.colors.border, backgroundColor: theme.colors.surface, marginTop: 12, ...theme.shadow.card },
            ]}
          >
            <Text style={[styles.planTitle, { color: theme.colors.textPrimary }]}>Free plan</Text>
            <Text style={[styles.bodyMuted, { color: theme.colors.textSecondary, marginTop: 8 }]}>
              Upgrade to HabitPro Community for group missions, squad updates, streak tools, and more.
            </Text>
            <Button title="View Community plans" onPress={() => openUpsell("profile")} style={{ marginTop: 16 }} />
          </View>
        ) : null}

        {premiumLoading && !isPremium ? (
          <View style={{ marginTop: 16, alignItems: "center" }}>
            <ActivityIndicator color={theme.colors.indigo[400]} />
          </View>
        ) : null}

        <TouchableOpacity
          onPress={() => void onManage()}
          disabled={!configured || !ready || isExpoGo}
          style={[styles.linkRow, { opacity: configured && ready && !isExpoGo ? 1 : 0.5 }]}
        >
          <ExternalLink size={14} color={theme.colors.indigo[400]} />
          <Text style={[styles.linkText, { color: theme.colors.indigo[400] }]}>Subscription help ({storeName})</Text>
        </TouchableOpacity>

        <View style={[styles.rotateRow, { marginTop: 20 }]}>
          <RotateCcw size={14} color={theme.colors.textMuted} />
          <Text style={[styles.footerHint, { color: theme.colors.textMuted }]}>
            After changing subscription in {storeName}, pull refresh or revisit this screen to update dates.
          </Text>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    paddingVertical: 8,
    gap: 8,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  screenTitle: { flex: 1, textAlign: "center", fontSize: 17, fontWeight: "900", letterSpacing: -0.2 },
  banner: {
    marginTop: 8,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  bannerText: { fontSize: 13, lineHeight: 18, fontWeight: "600" },
  card: {
    marginTop: 12,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  statusHead: { flexDirection: "row", alignItems: "center", gap: 12 },
  crownWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  planTitle: { fontSize: 18, fontWeight: "900", letterSpacing: -0.2 },
  planSub: { fontSize: 13, fontWeight: "800", marginTop: 2 },
  activePill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  activePillText: { fontSize: 10, fontWeight: "900", letterSpacing: 0.6 },
  warnRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginTop: 12,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  warnText: { flex: 1, fontSize: 12.5, lineHeight: 17, fontWeight: "600" },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 14 },
  detailRow: { marginBottom: 12 },
  detailLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 0.6, marginBottom: 4 },
  detailValue: { fontSize: 15, fontWeight: "700", lineHeight: 20 },
  legal: { fontSize: 12, lineHeight: 17, fontWeight: "600", marginTop: 14, marginBottom: 6 },
  bodyMuted: { fontSize: 14, lineHeight: 20, fontWeight: "600" },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 20,
    alignSelf: "center",
  },
  linkText: { fontSize: 13, fontWeight: "800" },
  rotateRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, paddingHorizontal: 4 },
  footerHint: { flex: 1, fontSize: 12, lineHeight: 16, fontWeight: "600" },
});
