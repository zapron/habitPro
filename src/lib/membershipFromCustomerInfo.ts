import type { CustomerInfo, PurchasesEntitlementInfo } from "react-native-purchases";
import { HABITPRO_COMMUNITY_ENTITLEMENT_ID } from "../constants/revenueCat";
import { formatDateDisplay } from "../utils/dateDisplay";

export type MembershipPlanKind = "monthly" | "yearly" | "unknown";

export type MembershipSummary =
  | { kind: "none" }
  | {
      kind: "active";
      planKind: MembershipPlanKind;
      productIdentifier: string;
      productPlanIdentifier: string | null;
      periodLabel: string;
      periodType: string;
      expiresAt: Date | null;
      willRenew: boolean;
      startedAt: Date | null;
      latestPurchaseAt: Date | null;
      store: string;
      unsubscribeDetectedAt: Date | null;
      billingIssueDetectedAt: Date | null;
      isSandbox: boolean;
    };

function parseIso(value: string | null | undefined): Date | null {
  if (value == null || value === "") return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function planKindFromProductId(id: string): MembershipPlanKind {
  const lower = id.toLowerCase();
  if (lower.includes("month")) return "monthly";
  if (lower.includes("year") || lower.includes("annual")) return "yearly";
  return "unknown";
}

function periodTitle(plan: MembershipPlanKind): string {
  if (plan === "monthly") return "Monthly";
  if (plan === "yearly") return "Yearly";
  return "HabitPro Community";
}

export function buildMembershipSummary(info: CustomerInfo | null): MembershipSummary {
  const raw = info?.entitlements?.active?.[HABITPRO_COMMUNITY_ENTITLEMENT_ID] as PurchasesEntitlementInfo | undefined;
  if (!raw || !raw.isActive) {
    return { kind: "none" };
  }

  const planKind = planKindFromProductId(raw.productIdentifier);
  const pt = String(raw.periodType ?? "").toUpperCase();
  const isTrial = pt === "TRIAL";
  const isIntro = pt === "INTRO";
  const baseTitle = periodTitle(planKind);
  const periodLabel = isTrial ? `${baseTitle} · trial` : isIntro ? `${baseTitle} · intro` : baseTitle;

  return {
    kind: "active",
    planKind,
    productIdentifier: raw.productIdentifier,
    productPlanIdentifier: raw.productPlanIdentifier,
    periodLabel,
    periodType: pt || "NORMAL",
    expiresAt: parseIso(raw.expirationDate),
    willRenew: raw.willRenew,
    startedAt: parseIso(raw.originalPurchaseDate),
    latestPurchaseAt: parseIso(raw.latestPurchaseDate),
    store: raw.store,
    unsubscribeDetectedAt: parseIso(raw.unsubscribeDetectedAt),
    billingIssueDetectedAt: parseIso(raw.billingIssueDetectedAt),
    isSandbox: raw.isSandbox,
  };
}

export function storeDisplayName(store: string): string {
  switch (store) {
    case "PLAY_STORE":
      return "Google Play";
    case "APP_STORE":
    case "MAC_APP_STORE":
      return "App Store";
    case "TEST_STORE":
      return "RevenueCat Test Store";
    case "STRIPE":
      return "Stripe";
    case "AMAZON":
      return "Amazon Appstore";
    default:
      return store.replace(/_/g, " ").toLowerCase() || "Unknown store";
  }
}

export function formatMembershipDate(d: Date | null, locale?: string): string {
  if (!d) return "—";
  void locale;
  return formatDateDisplay(d, "â€”");
}
