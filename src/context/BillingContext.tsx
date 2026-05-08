import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Linking, Platform } from "react-native";
import Constants from "expo-constants";
import Purchases, { type CustomerInfo, LOG_LEVEL } from "react-native-purchases";
import { HABITPRO_COMMUNITY_ENTITLEMENT_ID } from "../constants/revenueCat";
import { getRevenueCatConfig, logRevenueCatEnvHint } from "../lib/env";
import { useAuth } from "./AuthContext";

type PlanId = "monthly" | "yearly";
type PurchaseStage = "diagnostics" | "load offerings" | "load store products" | "start purchase";

export type BillingDebugSnapshot = {
  at: string;
  appUserId: string | null;
  platform: string;
  appOwnership: string | null;
  appVersion: string | null;
  nativeAppVersion: string | null;
  nativeBuildVersion: string | null;
  configured: boolean;
  ready: boolean;
  isExpoGo: boolean;
  apiKeyKind: "goog" | "test" | "other" | "missing";
  plan?: PlanId;
  stage?: PurchaseStage;
  error?: {
    code?: string;
    message: string;
    underlying?: string;
    userCancelled?: boolean | null;
  };
  offerings?: BillingOfferingDebug | null;
  offeringsError?: string;
  storeProducts?: BillingProductDebug[];
  storeProductsError?: string;
  customerInfo?: {
    originalAppUserId?: string | null;
    activeEntitlements: string[];
    allEntitlements: string[];
  };
  customerInfoError?: string;
  recentLogs: string[];
};

type BillingOfferingDebug = {
  currentIdentifier: string | null;
  allIdentifiers: string[];
  currentPackages: BillingPackageDebug[];
};

type BillingPackageDebug = {
  identifier: string;
  packageType?: string;
  offeringIdentifier?: string | null;
  product: BillingProductDebug;
};

type BillingProductDebug = {
  identifier: string;
  title?: string;
  priceString?: string;
  productType?: string;
  productCategory?: string | null;
  subscriptionPeriod?: string | null;
  defaultOption?: BillingSubscriptionOptionDebug | null;
  subscriptionOptions?: BillingSubscriptionOptionDebug[];
};

type BillingSubscriptionOptionDebug = {
  id?: string;
  storeProductId?: string;
  productId?: string;
  isBasePlan?: boolean;
  billingPeriod?: string | null;
  pricingPhases?: string[];
};

type BillingContextValue = {
  /** True when an API key is present for this platform. */
  configured: boolean;
  /** True once Purchases.configure has been called (or we intentionally skipped). */
  ready: boolean;
  /** True when running in Expo Go (native billing not available). */
  isExpoGo: boolean;
  /** Most recent CustomerInfo fetched from the SDK. */
  customerInfo: CustomerInfo | null;
  /** True when the entitlement is active in current CustomerInfo. */
  hasCommunityAccess: boolean;
  refresh: () => Promise<CustomerInfo | null>;
  purchaseCommunity: (
    plan: PlanId,
  ) => Promise<{
    cancelled: boolean;
    purchaseFailed?: boolean;
    message?: string;
    stage?: PurchaseStage;
    debug?: BillingDebugSnapshot;
  }>;
  restore: () => Promise<void>;
  /** Open OS subscription management. */
  openManageSubscriptions: () => Promise<void>;
  billingDebug: BillingDebugSnapshot | null;
  runBillingDiagnostics: (plan?: PlanId) => Promise<BillingDebugSnapshot>;
};

const BillingContext = createContext<BillingContextValue | null>(null);

/**
 * RevenueCat wiring note:
 * - Create an entitlement in RevenueCat: `habitpro_community`
 * - Map it to Play subscription products (monthly + yearly)
 * - Create an Offering in RevenueCat and set it as the current offering
 * - Ensure monthly/yearly packages exist (RevenueCat default IDs: `$rc_monthly`, `$rc_annual`)
 */
const ENTITLEMENT_ID = HABITPRO_COMMUNITY_ENTITLEMENT_ID;
const PACKAGE_BY_PLAN: Record<PlanId, string> = {
  monthly: "$rc_monthly",
  yearly: "$rc_annual",
};

const STORE_PRODUCT_IDS: Record<PlanId, string> = {
  monthly: "monthly",
  yearly: "yearly",
};

const MAX_REVENUECAT_LOGS = 40;
const BILLING_APP_ACTIVE_REFRESH_IDLE_MS = 5 * 60 * 1000;

type RevenueCatErrorLike = {
  code?: string | number;
  message?: string;
  readableErrorCode?: string;
  underlyingErrorMessage?: string;
  userCancelled?: boolean | null;
  userInfo?: {
    readableErrorCode?: string;
  };
};

function stringFromUnknown(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function apiKeyKind(apiKey: string): BillingDebugSnapshot["apiKeyKind"] {
  if (!apiKey) return "missing";
  if (apiKey.startsWith("goog_")) return "goog";
  if (apiKey.startsWith("test_")) return "test";
  return "other";
}

function getPurchaseErrorDetails(error: unknown): {
  code?: string;
  message: string;
  underlying?: string;
  userCancelled?: boolean | null;
  userDismissed: boolean;
} {
  const e = error as RevenueCatErrorLike;
  const message = e?.message ?? (error instanceof Error ? error.message : String(error));
  const code = e?.userInfo?.readableErrorCode ?? e?.readableErrorCode ?? e?.code;
  const underlying = e?.underlyingErrorMessage;
  const userDismissed =
    e?.userCancelled === true ||
    String(code ?? "").includes("PURCHASE_CANCELLED") ||
    message.toLowerCase().includes("cancel") ||
    message.toLowerCase().includes("user cancelled");

  const parts = [code ? `[${String(code)}]` : null, message, underlying].filter(
    (part): part is string => Boolean(part && part.trim()),
  );

  return {
    code: code == null ? undefined : String(code),
    message: parts.join(" "),
    underlying,
    userCancelled: e?.userCancelled,
    userDismissed,
  };
}

function summarizeSubscriptionOption(value: unknown): BillingSubscriptionOptionDebug {
  const option = asRecord(value);
  const billingPeriod = asRecord(option.billingPeriod);
  const phases = Array.isArray(option.pricingPhases) ? option.pricingPhases : [];
  return {
    id: stringFromUnknown(option.id),
    storeProductId: stringFromUnknown(option.storeProductId),
    productId: stringFromUnknown(option.productId),
    isBasePlan: typeof option.isBasePlan === "boolean" ? option.isBasePlan : undefined,
    billingPeriod: stringFromUnknown(billingPeriod.iso8601) ?? null,
    pricingPhases: phases.map((phase) => {
      const p = asRecord(phase);
      const period = asRecord(p.billingPeriod);
      const price = asRecord(p.price);
      return [
        stringFromUnknown(period.iso8601),
        stringFromUnknown(price.formatted),
        stringFromUnknown(p.offerPaymentMode),
      ].filter(Boolean).join(" ");
    }),
  };
}

function summarizeProduct(value: unknown): BillingProductDebug {
  const product = asRecord(value);
  const options = Array.isArray(product.subscriptionOptions) ? product.subscriptionOptions : [];
  return {
    identifier: stringFromUnknown(product.identifier) ?? "unknown",
    title: stringFromUnknown(product.title),
    priceString: stringFromUnknown(product.priceString),
    productType: stringFromUnknown(product.productType),
    productCategory: stringFromUnknown(product.productCategory) ?? null,
    subscriptionPeriod: stringFromUnknown(product.subscriptionPeriod) ?? null,
    defaultOption: product.defaultOption ? summarizeSubscriptionOption(product.defaultOption) : null,
    subscriptionOptions: options.map(summarizeSubscriptionOption),
  };
}

function summarizePackage(value: unknown): BillingPackageDebug {
  const pkg = asRecord(value);
  return {
    identifier: stringFromUnknown(pkg.identifier) ?? "unknown",
    packageType: stringFromUnknown(pkg.packageType),
    offeringIdentifier: stringFromUnknown(pkg.offeringIdentifier) ?? null,
    product: summarizeProduct(pkg.product),
  };
}

function summarizeOfferings(value: unknown): BillingOfferingDebug | null {
  const offerings = asRecord(value);
  const current = offerings.current ? asRecord(offerings.current) : null;
  const all = asRecord(offerings.all);
  return {
    currentIdentifier: current ? stringFromUnknown(current.identifier) ?? null : null,
    allIdentifiers: Object.keys(all),
    currentPackages:
      current && Array.isArray(current.availablePackages)
        ? current.availablePackages.map(summarizePackage)
        : [],
  };
}

function summarizeCustomerInfo(value: unknown): BillingDebugSnapshot["customerInfo"] {
  const info = asRecord(value);
  const entitlements = asRecord(info.entitlements);
  const active = asRecord(entitlements.active);
  const all = asRecord(entitlements.all);
  return {
    originalAppUserId: stringFromUnknown(info.originalAppUserId) ?? null,
    activeEntitlements: Object.keys(active),
    allEntitlements: Object.keys(all),
  };
}

function shouldSkipNativePurchases(): boolean {
  // Expo Go doesn't include native billing modules; skip to avoid crashes.
  return Constants.appOwnership === "expo";
}

export function BillingProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const [ready, setReady] = useState(false);
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [customerInfoUserId, setCustomerInfoUserId] = useState<string | null>(null);
  const [billingDebug, setBillingDebug] = useState<BillingDebugSnapshot | null>(null);
  const configuredRef = useRef(false);
  const logBufferRef = useRef<string[]>([]);
  const activeBillingUserIdRef = useRef<string | null>(null);
  const identitySyncRef = useRef<Promise<void>>(Promise.resolve());
  const lastInactiveAtRef = useRef<number | null>(null);
  const isExpoGo = shouldSkipNativePurchases();

  const { androidApiKey, iosApiKey } = getRevenueCatConfig();
  const apiKey = Platform.OS === "android" ? androidApiKey : iosApiKey;
  const configured = Boolean(apiKey);
  const userId = session?.user?.id ?? null;

  useEffect(() => {
    activeBillingUserIdRef.current = userId;
    setCustomerInfo(null);
    setCustomerInfoUserId(null);
    lastInactiveAtRef.current = null;
  }, [userId]);

  const appendRevenueCatLog = useCallback((level: unknown, message: unknown) => {
    const entry = `${new Date().toISOString()} [${String(level)}] ${String(message)}`;
    logBufferRef.current = [...logBufferRef.current, entry].slice(-MAX_REVENUECAT_LOGS);
  }, []);

  const createDebugSnapshot = useCallback(
    (plan?: PlanId, stage?: PurchaseStage): BillingDebugSnapshot => ({
      at: new Date().toISOString(),
      appUserId: userId,
      platform: Platform.OS,
      appOwnership: Constants.appOwnership ?? null,
      appVersion: Constants.expoConfig?.version ?? null,
      nativeAppVersion: Constants.nativeAppVersion ?? null,
      nativeBuildVersion: Constants.nativeBuildVersion ?? null,
      configured,
      ready,
      isExpoGo,
      apiKeyKind: apiKeyKind(apiKey),
      plan,
      stage,
      recentLogs: logBufferRef.current.slice(-12),
    }),
    [apiKey, configured, isExpoGo, ready, userId],
  );

  const enrichDebugSnapshot = useCallback(
    async (snapshot: BillingDebugSnapshot): Promise<BillingDebugSnapshot> => {
      if (!configured || !ready || isExpoGo) {
        const next = { ...snapshot, recentLogs: logBufferRef.current.slice(-12) };
        setBillingDebug(next);
        return next;
      }

      const next: BillingDebugSnapshot = { ...snapshot };
      try {
        const offerings = await Purchases.getOfferings();
        next.offerings = summarizeOfferings(offerings);
      } catch (e) {
        next.offeringsError = getPurchaseErrorDetails(e).message;
      }

      try {
        const products = await Purchases.getProducts(
          Object.values(STORE_PRODUCT_IDS),
          Purchases.PRODUCT_CATEGORY.SUBSCRIPTION,
        );
        next.storeProducts = products.map(summarizeProduct);
      } catch (e) {
        next.storeProductsError = getPurchaseErrorDetails(e).message;
      }

      try {
        await Purchases.invalidateCustomerInfoCache();
        const info = await Purchases.getCustomerInfo();
        next.customerInfo = summarizeCustomerInfo(info);
      } catch (e) {
        next.customerInfoError = getPurchaseErrorDetails(e).message;
      }

      next.recentLogs = logBufferRef.current.slice(-12);
      setBillingDebug(next);
      return next;
    },
    [configured, isExpoGo, ready],
  );

  const runBillingDiagnostics = useCallback(
    async (plan?: PlanId) => enrichDebugSnapshot(createDebugSnapshot(plan, "diagnostics")),
    [createDebugSnapshot, enrichDebugSnapshot],
  );

  const runRevenueCatIdentityTask = useCallback(
    async <T,>(task: () => Promise<T>): Promise<T> => {
      const previous = identitySyncRef.current.catch(() => {});
      const next = previous.then(task);
      identitySyncRef.current = next.then(
        () => undefined,
        () => undefined,
      );
      return next;
    },
    [],
  );

  const ensureRevenueCatUser = useCallback(
    async (requestedUserId: string): Promise<CustomerInfo | null> => {
      if (!ready || !configured || isExpoGo || !requestedUserId) return null;
      return runRevenueCatIdentityTask(async () => {
        if (activeBillingUserIdRef.current !== requestedUserId) return null;

        const currentAppUserId = await Purchases.getAppUserID();
        if (currentAppUserId !== requestedUserId) {
          const { customerInfo: info } = await Purchases.logIn(requestedUserId);
          if (activeBillingUserIdRef.current !== requestedUserId) return null;
          setCustomerInfo(info);
          setCustomerInfoUserId(requestedUserId);
          return info;
        }

        return null;
      });
    },
    [configured, isExpoGo, ready, runRevenueCatIdentityTask],
  );

  useEffect(() => {
    logRevenueCatEnvHint();
  }, []);

  useEffect(() => {
    if (isExpoGo) return;
    Purchases.setLogHandler((level, message) => {
      appendRevenueCatLog(level, message);
      console.log("[habitPro][RevenueCat]", level, message);
    });
    void Purchases.setLogLevel(LOG_LEVEL.DEBUG);
  }, [appendRevenueCatLog, isExpoGo]);

  useEffect(() => {
    if (!configured || !apiKey) {
      setReady(false);
      setCustomerInfo(null);
      setCustomerInfoUserId(null);
      configuredRef.current = false;
      return;
    }

    if (isExpoGo) {
      // In Expo Go we intentionally no-op; keep app usable.
      setReady(true);
      return;
    }

    if (configuredRef.current) return;
    configuredRef.current = true;

    Purchases.configure({ apiKey });
    setReady(true);
  }, [apiKey, configured, isExpoGo]);

  useEffect(() => {
    if (!ready || !configured || isExpoGo) return;
    let cancelled = false;
    const requestedUserId = userId;

    void (async () => {
      try {
        if (!requestedUserId) {
          await runRevenueCatIdentityTask(async () => {
            await Purchases.logOut();
          });
          if (!cancelled && activeBillingUserIdRef.current === null) {
            setCustomerInfo(null);
            setCustomerInfoUserId(null);
          }
          return;
        }
        await ensureRevenueCatUser(requestedUserId);
        if (cancelled || activeBillingUserIdRef.current !== requestedUserId) return;
        await Purchases.invalidateCustomerInfoCache();
        const info = await Purchases.getCustomerInfo();
        if (!cancelled && activeBillingUserIdRef.current === requestedUserId) {
          setCustomerInfo(info);
          setCustomerInfoUserId(requestedUserId);
        }
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
  }, [configured, ensureRevenueCatUser, isExpoGo, ready, runRevenueCatIdentityTask, userId]);

  const refresh = useCallback(async () => {
    if (!ready || !configured || isExpoGo || !userId) {
      setCustomerInfo(null);
      setCustomerInfoUserId(null);
      return null;
    }
    const requestedUserId = userId;
    await ensureRevenueCatUser(requestedUserId);
    if (activeBillingUserIdRef.current !== requestedUserId) return null;
    await Purchases.invalidateCustomerInfoCache();
    const info = await Purchases.getCustomerInfo();
    if (activeBillingUserIdRef.current !== requestedUserId) return null;
    setCustomerInfo(info);
    setCustomerInfoUserId(requestedUserId);
    return info;
  }, [configured, ensureRevenueCatUser, isExpoGo, ready, userId]);

  const restore = async () => {
    if (!ready || !configured || isExpoGo || !userId) return;
    const requestedUserId = userId;
    await ensureRevenueCatUser(requestedUserId);
    if (activeBillingUserIdRef.current !== requestedUserId) return;
    const info = await Purchases.restorePurchases();
    if (activeBillingUserIdRef.current !== requestedUserId) return;
    setCustomerInfo(info);
    setCustomerInfoUserId(requestedUserId);
  };

  const purchaseCommunity = async (plan: PlanId) => {
    if (!ready || !configured || isExpoGo || !userId) {
      return { cancelled: true };
    }
    const requestedUserId = userId;

    const snapshot = createDebugSnapshot(plan, "load offerings");
    let stage: PurchaseStage = "load offerings";
    try {
      await ensureRevenueCatUser(requestedUserId);
      if (activeBillingUserIdRef.current !== requestedUserId) {
        return { cancelled: true };
      }

      const offerings = await Purchases.getOfferings();
      snapshot.offerings = summarizeOfferings(offerings);

      try {
        stage = "load store products";
        snapshot.stage = stage;
        const products = await Purchases.getProducts(
          Object.values(STORE_PRODUCT_IDS),
          Purchases.PRODUCT_CATEGORY.SUBSCRIPTION,
        );
        snapshot.storeProducts = products.map(summarizeProduct);
      } catch (e) {
        snapshot.storeProductsError = getPurchaseErrorDetails(e).message;
      }

      stage = "load offerings";
      snapshot.stage = stage;
      const current = offerings.current;
      const pkgId = PACKAGE_BY_PLAN[plan];
      const pkg = current?.availablePackages?.find((p) => p.identifier === pkgId);
      if (!pkg) {
        throw new Error(`RevenueCat package not found: ${pkgId} (set current offering + packages).`);
      }
      stage = "start purchase";
      await Purchases.invalidateCustomerInfoCache();
      const { customerInfo: info } = await Purchases.purchasePackage(pkg);
      if (activeBillingUserIdRef.current !== requestedUserId) {
        return { cancelled: true };
      }
      setCustomerInfo(info);
      setCustomerInfoUserId(requestedUserId);
      snapshot.customerInfo = summarizeCustomerInfo(info);
      snapshot.recentLogs = logBufferRef.current.slice(-12);
      setBillingDebug(snapshot);
      return { cancelled: false };
    } catch (e: unknown) {
      // RevenueCat throws a typed error; keep this generic to avoid coupling on versions.
      const { code, message, underlying, userCancelled, userDismissed } = getPurchaseErrorDetails(e);
      snapshot.stage = stage;
      snapshot.error = {
        code,
        message,
        underlying,
        userCancelled,
      };
      snapshot.recentLogs = logBufferRef.current.slice(-12);
      setBillingDebug(snapshot);
      console.warn("[habitPro][BillingDebug]", JSON.stringify(snapshot));
      // Any throw is a non-purchase: do not report cancelled:false (that showed a false "trial started"
      // toast for Test Store "failed purchase" and other errors whose message omits "cancel").
      if (__DEV__ && !userDismissed) {
        console.warn("[habitPro] purchase failed:", stage, message);
      }
      return {
        cancelled: true,
        purchaseFailed: !userDismissed,
        message: userDismissed ? undefined : message,
        stage,
        debug: snapshot,
      };
    }
  };

  const visibleCustomerInfo = customerInfoUserId === userId ? customerInfo : null;
  const hasCommunityAccess = Boolean(visibleCustomerInfo?.entitlements?.active?.[ENTITLEMENT_ID]);

  useEffect(() => {
    if (!ready || !configured || isExpoGo) return;
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        const lastInactiveAt = lastInactiveAtRef.current;
        lastInactiveAtRef.current = null;
        if (
          lastInactiveAt != null &&
          Date.now() - lastInactiveAt >= BILLING_APP_ACTIVE_REFRESH_IDLE_MS
        ) {
          void refresh();
        }
        return;
      }
      if (state === "inactive" || state === "background") {
        lastInactiveAtRef.current ??= Date.now();
      }
    });
    return () => sub.remove();
  }, [configured, isExpoGo, ready, refresh]);

  const openManageSubscriptions = async () => {
    // Prefer RevenueCat helper if available; otherwise fall back to store URLs.
    const anyPurchases = Purchases as unknown as { showManageSubscriptions?: () => Promise<void> | void };
    if (typeof anyPurchases.showManageSubscriptions === "function" && !isExpoGo) {
      await anyPurchases.showManageSubscriptions();
      return;
    }
    if (Platform.OS === "android") {
      await Linking.openURL("https://play.google.com/store/account/subscriptions");
      return;
    }
    if (Platform.OS === "ios") {
      await Linking.openURL("https://apps.apple.com/account/subscriptions");
    }
  };

  const value = useMemo<BillingContextValue>(
    () => ({
      configured,
      ready,
      isExpoGo,
      customerInfo: visibleCustomerInfo,
      hasCommunityAccess,
      refresh,
      purchaseCommunity,
      restore,
      openManageSubscriptions,
      billingDebug,
      runBillingDiagnostics,
    }),
    [
      billingDebug,
      configured,
      hasCommunityAccess,
      visibleCustomerInfo,
      refresh,
      isExpoGo,
      ready,
      runBillingDiagnostics,
      userId,
    ],
  );

  return <BillingContext.Provider value={value}>{children}</BillingContext.Provider>;
}

export function useBilling(): BillingContextValue {
  const v = useContext(BillingContext);
  if (!v) throw new Error("useBilling must be used within BillingProvider");
  return v;
}

