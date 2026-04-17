import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Platform } from "react-native";
import Constants from "expo-constants";
import Purchases, { type CustomerInfo, LOG_LEVEL } from "react-native-purchases";
import { getRevenueCatConfig, logRevenueCatEnvHint } from "../lib/env";
import { useAuth } from "./AuthContext";

type PlanId = "monthly" | "annual";

type BillingContextValue = {
  /** True when an API key is present for this platform. */
  configured: boolean;
  /** True once Purchases.configure has been called (or we intentionally skipped). */
  ready: boolean;
  /** Most recent CustomerInfo fetched from the SDK. */
  customerInfo: CustomerInfo | null;
  /** True when the entitlement is active in current CustomerInfo. */
  hasCommunityAccess: boolean;
  refresh: () => Promise<void>;
  purchaseCommunity: (plan: PlanId) => Promise<{ cancelled: boolean }>;
  restore: () => Promise<void>;
};

const BillingContext = createContext<BillingContextValue | null>(null);

/**
 * RevenueCat wiring note:
 * - Create an entitlement in RevenueCat: `habitpro_community`
 * - Map it to Play subscription products (monthly + annual)
 * - Create an Offering in RevenueCat and set it as the current offering
 * - Ensure monthly/annual packages exist (RevenueCat default IDs: `$rc_monthly`, `$rc_annual`)
 */
const ENTITLEMENT_ID = "habitpro_community";
const PACKAGE_BY_PLAN: Record<PlanId, string> = {
  monthly: "$rc_monthly",
  annual: "$rc_annual",
};

function shouldSkipNativePurchases(): boolean {
  // Expo Go doesn't include native billing modules; skip to avoid crashes.
  return Constants.appOwnership === "expo";
}

export function BillingProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const [ready, setReady] = useState(false);
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const configuredRef = useRef(false);

  const { androidApiKey, iosApiKey } = getRevenueCatConfig();
  const apiKey = Platform.OS === "android" ? androidApiKey : iosApiKey;
  const configured = Boolean(apiKey);

  useEffect(() => {
    logRevenueCatEnvHint();
  }, []);

  useEffect(() => {
    if (!configured || !apiKey) {
      setReady(false);
      setCustomerInfo(null);
      configuredRef.current = false;
      return;
    }

    if (shouldSkipNativePurchases()) {
      // In Expo Go we intentionally no-op; keep app usable.
      setReady(true);
      return;
    }

    if (configuredRef.current) return;
    configuredRef.current = true;

    if (__DEV__) {
      Purchases.setLogLevel(LOG_LEVEL.INFO);
    }

    Purchases.configure({ apiKey });
    setReady(true);
  }, [apiKey, configured]);

  useEffect(() => {
    if (!ready || !configured || shouldSkipNativePurchases()) return;
    const uid = session?.user?.id ?? null;
    let cancelled = false;

    void (async () => {
      try {
        if (uid) {
          await Purchases.logIn(uid);
        } else {
          await Purchases.logOut();
        }
        const info = await Purchases.getCustomerInfo();
        if (!cancelled) setCustomerInfo(info);
      } catch (e) {
        if (__DEV__) {
          const msg = e instanceof Error ? e.message : String(e);
          console.warn("[habitPro] RevenueCat auth sync failed:", msg);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [configured, ready, session?.user?.id]);

  const refresh = async () => {
    if (!ready || !configured || shouldSkipNativePurchases()) return;
    const info = await Purchases.getCustomerInfo();
    setCustomerInfo(info);
  };

  const restore = async () => {
    if (!ready || !configured || shouldSkipNativePurchases()) return;
    const info = await Purchases.restorePurchases();
    setCustomerInfo(info);
  };

  const purchaseCommunity = async (plan: PlanId) => {
    if (!ready || !configured || shouldSkipNativePurchases()) {
      return { cancelled: true };
    }

    try {
      const offerings = await Purchases.getOfferings();
      const current = offerings.current;
      const pkgId = PACKAGE_BY_PLAN[plan];
      const pkg = current?.availablePackages?.find((p) => p.identifier === pkgId);
      if (!pkg) {
        throw new Error(`RevenueCat package not found: ${pkgId} (set current offering + packages).`);
      }
      const { customerInfo: info } = await Purchases.purchasePackage(pkg);
      setCustomerInfo(info);
      return { cancelled: false };
    } catch (e: unknown) {
      // RevenueCat throws a typed error; keep this generic to avoid coupling on versions.
      const msg = e instanceof Error ? e.message : String(e);
      const cancelled =
        typeof msg === "string" &&
        (msg.toLowerCase().includes("cancel") || msg.toLowerCase().includes("user cancelled"));
      if (__DEV__ && !cancelled) {
        console.warn("[habitPro] purchase failed:", msg);
      }
      return { cancelled };
    }
  };

  const hasCommunityAccess = Boolean(customerInfo?.entitlements?.active?.[ENTITLEMENT_ID]);

  const value = useMemo<BillingContextValue>(
    () => ({
      configured,
      ready,
      customerInfo,
      hasCommunityAccess,
      refresh,
      purchaseCommunity,
      restore,
    }),
    [configured, ready, customerInfo, hasCommunityAccess],
  );

  return <BillingContext.Provider value={value}>{children}</BillingContext.Provider>;
}

export function useBilling(): BillingContextValue {
  const v = useContext(BillingContext);
  if (!v) throw new Error("useBilling must be used within BillingProvider");
  return v;
}

