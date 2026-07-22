---
name: ios-iap-troubleshooting
description: Use when an iOS in-app purchase or subscription paywall doesn't work — "Purchase could not start", empty/no offerings, CONFIGURATION_ERROR, MISSING_METADATA, RevenueCat offerings empty, or any StoreKit/App Store Connect purchase failure on iOS. Applies to any Expo/React Native app using RevenueCat, not just HabitPro.
---

# iOS In-App Purchase Troubleshooting

## First, split the problem in two

A broken iOS paywall is almost always one of two unrelated things. Diagnose which one before doing anything else:

1. **The paywall never appears at all** (tap does nothing, screen "feels stuck") → this is a **code/UI bug**. Go to "Nested Modal Bug" below.
2. **The paywall appears, but tapping Subscribe fails** ("Purchase could not start...", empty offerings, CONFIGURATION_ERROR) → this is an **App Store Connect / account configuration issue**, almost never app code. Go to "Config Checklist" below.

Don't assume a code fix or a rebuild will solve #2. In one full investigation of this class of bug, every single blocker was App Store Connect / Apple account state — the app code was correct from the start.

## Nested Modal Bug (symptom #1)

React Native's `<Modal>` renders as its own native window on iOS. Presenting a **second** `<Modal>` while a first one is still open is unreliable on iOS specifically — it frequently fails to render or isn't interactive. Android's `Modal` (backed by a `Dialog`) tolerates this stacking far better, so this bug is iOS-only and often invisible during Android testing.

This happens whenever a "sheet" component that wraps its own content in `<Modal>` (an invite sheet, a completion/memory sheet, a custom-note modal, etc.) calls the paywall's `openUpsell()`-style trigger from inside a handler — while its own `<Modal>` is still `visible={true}`.

**Fix**: close the enclosing sheet (`onClose()` / the relevant `set...(false)` or `set...(null)`) immediately before opening the paywall. Do this at every call site where the paywall can be triggered from inside another already-open `<Modal>`-wrapped component — audit systematically:

```bash
grep -rl "<Modal" src/components/*.tsx app/**/*.tsx   # find modal-owning components
grep -rn "openUpsell(\|showPaywall(\|<paywall trigger>" src app  # cross-reference call sites
```

For each `openUpsell`-style call, check whether it fires while a sibling `<Modal>` in the same component (or a parent component whose `onCommit`/`onSubmit` prop it's called from) is still open. If so, close that Modal first.

Trade-off: subscribing now closes the underlying sheet along with the paywall, rather than returning to it. Minor UX cost, but it's the version that actually works on iOS.

## Config Checklist (symptom #2)

Work through these in order. Each one is a real, independent gate — clearing one doesn't mean the others are also clear.

### 0. Get the real error, not the generic fallback

Many apps only show detailed RevenueCat/StoreKit error text in dev builds (`__DEV__`), not in TestFlight/production installs — so a TestFlight tester only ever sees a generic fallback message. To see the actual underlying error:
- Test on a local Simulator/dev-client build (`npx expo run:ios`) where debug info is visible.
- If a RevenueCat MCP server is connected, query the product directly instead of guessing from client-side messages:
  ```
  mcp__revenuecat__get-product-store-state  (project_id, product_id)
  ```
  Check `store_status.raw_store_status` — `MISSING_METADATA` means Apple hasn't received everything it requires; `READY_TO_SUBMIT` means product-level metadata is fine (see step 3 for what else could still block it).

Note: Simulator has its own separate limitation — it can't always complete real StoreKit purchases without a Sandbox Apple ID signed in via the Simulator's own Settings app. Use Simulator to confirm offerings/paywall load correctly; verify actual purchase completion on a real device/TestFlight.

### 1. Product screenshot dimensions (App Store Connect → product → Review Information → Screenshot)

A missing or wrong-dimension screenshot is a common `MISSING_METADATA` cause. Required sizes are device-specific and exact — a physical-device screenshot that's been through AirDrop/Messages/Markup can be silently re-encoded and fail validation even when it looks like the right size.

**Reliable fix**: capture directly from Simulator, which produces pixel-perfect native-resolution output with zero editing:
```bash
xcrun simctl list devices | grep Booted   # confirm a simulator is running
xcrun simctl io booted screenshot output.png
sips -g pixelWidth -g pixelHeight output.png   # verify exact dimensions
```
Use a Simulator device that's in Apple's currently-accepted screenshot size list for App Store Connect (check the size requirements shown on the upload page itself — they change as Apple adds device classes).

### 2. Subscription group localization (separate from each product's own localization)

Each individual subscription product's localization (name/description) is different from the **subscription group's** own localization (its display name + app name, shown to users in Settings → Subscriptions). The group's localization is easy to miss — App Store Connect shows it as its own empty "Create" section on the subscription group page, not the individual product pages. An empty group localization is a commonly-cited hidden cause of persistent `MISSING_METADATA`.

### 3. Privacy Policy URL (App Store Connect → General → App Privacy → "Edit" next to Privacy Policy — not the general "App Information" page)

Must be a real, live, hosted URL. Required for any app with subscriptions.

### 4. Account-level: Paid Apps Agreement + Tax + Banking (App Store Connect → Business → Agreements)

This is the one most likely to be missed, because it's account-wide, not product-specific — fixing every product's own metadata will not unblock this. Check:
- **Paid Apps Agreement** status is **Active** (the separate **Free Apps Agreement** being Active is not sufficient for paid products).
- **Tax** forms are complete (for a non-US individual, typically includes a W-8BEN — see below).
- **Banking**: a linked bank account with status **Clear**/**Active**.

If "Paid Apps Agreement" shows **New** or **Processing**, no in-app purchase product can be fetched via StoreKit at all — in Sandbox or production — regardless of how complete individual product metadata is. Apple's own reference: [TN3186 — Troubleshooting In-App Purchases availability in the sandbox](https://developer.apple.com/documentation/technotes/tn3186-troubleshooting-in-app-purchases-availability-in-the-sandbox).

Signing the Paid Apps Agreement may require completing **Legal Entity** information first, and may trigger a **W-8BEN** (non-US individuals) or equivalent tax form. For a W-8BEN specifically: Part I is identification (name/country/address auto-filled, foreign tax ID = home-country tax ID e.g. Indian PAN, US TIN left blank for most individuals); Part II lets you claim a reduced-withholding tax treaty rate if one applies to your country (for India, commonly Article 12 / 15% / "Income from the sale of applications" — verify the correct article/rate for your own country's treaty, this varies by country); Part III is the perjury certification, required to submit. This is a real legal/tax document — get the specific numbers confirmed for your situation, don't copy someone else's country's rate.

### 5. Do not skip to production App Review

App Store Connect shows a banner: *"Your first auto-renewable subscription must be submitted with a new app version."* This is a **production approval requirement only** — Apple's own documentation confirms sandbox testing works before submission, once the metadata/agreement gates above are cleared. Don't submit for App Review just to try to unblock Sandbox testing — it won't help, and commits you to an App Review cycle you may not be ready for.

### 6. Expect a propagation delay after step 3 or 4 changes — don't rebuild

App Store Connect's UI shows changes as saved/Active quickly, but the backend systems that actually serve products to StoreKit can lag behind by hours. Commonly reported window: **~24 hours**, especially right after linking a new bank account or first activating the Paid Apps Agreement. If everything above checks out but purchases still fail immediately after making a change, the most likely explanation is propagation lag, not a remaining config error — wait and retest rather than rebuilding the app (there is almost never a code change that fixes this class of issue) or re-submitting anything.

## Useful RevenueCat MCP tools for this whole flow

- `list-products` / `get-product` — confirm products exist and are attached to the right app.
- `list-offerings` (with `expand: ["items.package", "items.package.product"]`) — confirm the current offering has both platforms' products attached to the right packages.
- `get-product-store-state` — the most useful one: live, direct-from-Apple product status (`MISSING_METADATA` / `READY_TO_SUBMIT` / etc.), including which specific review-information fields are present.
- `get-customer` / `list-purchases` / `list-subscriptions` — check a specific test user's actual purchase history to rule out account-fragmentation or stale-entitlement theories before assuming a billing bug.
