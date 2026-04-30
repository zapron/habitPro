# Solved Issue: Google Play Purchase Sheet Did Not Open

Date solved: 2026-05-01 IST

## Summary

The Google Play purchase sheet was not opening because RevenueCat's SDK-facing offerings endpoint was returning the current offering with `packages: []`.

The app code, Play Store install path, package name, and embedded RevenueCat Play public SDK key were not the root cause. The issue was server-side RevenueCat offering/product configuration and/or a stale RevenueCat offerings publish/cache state.

The same already-installed Play build started working after the RevenueCat offering configuration was corrected. No new app build was required for the actual fix.

## User-visible symptom

- Non-premium tester opened the HabitPro Community upsell.
- Monthly and yearly buttons were enabled.
- Tapping a button did not open the Google Play purchase sheet.
- The app showed:

```text
There is an issue with your configuration. Check the underlying error for more details.
```

The in-app debug snapshot showed:

```text
stage: load offerings
configured: true
ready: true
key: goog
error: [ConfigurationError]
```

This meant the app failed before `Purchases.purchasePackage(...)`, while calling `Purchases.getOfferings()`.

## Critical log evidence

Logs were pulled from the already-installed build through ADB/logcat, avoiding another Play build.

Useful filter:

```powershell
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
& $adb -s RZCX118MW3T logcat -d -v time |
  Select-String -Pattern 'habitPro|BillingDebug|RevenueCat|Purchases|BillingClient|ConfigurationError|Offerings|ProductDetails|Google Play'
```

Important log line:

```text
Error fetching offerings - PurchasesError(
  code=ConfigurationError,
  underlyingErrorMessage=You have configured the SDK with a Play Store API key,
  but there are no Play Store products registered in the RevenueCat dashboard
  for your offerings.
)
```

This proved the Google Play sheet could not appear because RevenueCat was returning no purchasable packages to the SDK.

## ADB note

ADB initially failed with:

```text
adb server version (40) doesn't match this client (41)
```

Cause: another app had an older ADB server, likely `C:\Program Files\SuperDisplay\adb\adb.exe`.

Working ADB path:

```text
C:\Users\rakti\AppData\Local\Android\Sdk\platform-tools\adb.exe
```

The phone device ID during debugging was:

```text
RZCX118MW3T
```

## Key checks that ruled out app/build problems

1. RevenueCat MCP access was restored and showed project:

```text
project: proj782c83b1 / habitPro
Play app: app222a860547 / habitPro (Play Store)
package: com.rakti.habitpro
public key: goog_FLwt...MVP
```

2. The installed APK was pulled from the phone and searched for `goog_`.

The embedded public key matched the RevenueCat Play app key:

```text
goog_FLwt...MVP
```

3. RevenueCat dashboard/MCP showed the expected Play products existed:

```text
monthly:monthly-base
yearly:yearly-base
```

4. Google Play subscriptions had already been checked earlier and were active:

```text
monthly / monthly-base
yearly / yearly-base
```

## The decisive test

Query the same RevenueCat public offerings endpoint the SDK uses.

PowerShell shape:

```powershell
$key = "<RevenueCat Play public SDK key starting with goog_>"
$uid = "<RevenueCat app user id>"
$headers = @{
  Authorization = "Bearer $key"
  "X-Platform" = "android"
  "X-Version" = "10.1.2"
}

Invoke-WebRequest `
  -Uri "https://api.revenuecat.com/v1/subscribers/$uid/offerings" `
  -Headers $headers `
  -UseBasicParsing
```

Before the fix, this returned:

```json
{
  "current_offering_id": "default",
  "offerings": [
    {
      "identifier": "default",
      "packages": []
    }
  ]
}
```

This proved the failure was not caused by app UI, button taps, or Google Play purchase launching. RevenueCat itself was telling the SDK that the current offering had no Play packages.

## RevenueCat config before fixing

Current offering:

```text
offering id: ofrng6f8c846313
lookup_key: default
is_current: true
state: active
```

Packages:

```text
monthly package: pkgeac1e321d00 / $rc_monthly
annual package: pkge9b1b04ead9 / $rc_annual
```

The packages had both Test Store products and Play Store products attached. The correct entitlement was active:

```text
entitlement id: entl722b972c21
lookup_key: habitpro_community
```

There was also an old active empty entitlement:

```text
lookup_key: habitPro Community
display_name: ZZZ (ARCHIVE ME) habitPro Community
```

That old entitlement was dashboard clutter; the app uses `habitpro_community`.

## RevenueCat changes made

The current production offering packages were changed to use only the Play Store products.

Detached Test Store products from the current offering packages:

```text
monthly package pkgeac1e321d00:
  detached prod8e53128ed8

annual package pkge9b1b04ead9:
  detached proddaff9901ad
```

Kept/re-attached Play Store products:

```text
monthly package pkgeac1e321d00:
  product prodf0900d4993
  store_identifier monthly:monthly-base
  eligibility_criteria google_sdk_ge_6

annual package pkge9b1b04ead9:
  product prod925afc8849
  store_identifier yearly:yearly-base
  eligibility_criteria google_sdk_ge_6
```

Important: after only detaching Test Store products and changing eligibility, the public SDK endpoint still returned `packages: []` for a short time.

To force a clean RevenueCat offerings response, a temporary debug offering was created and assigned to the test customer:

```text
temporary offering id: ofrng56ccb2545d
lookup_key: play_debug_20260501
monthly package: pkge8fa656534b
annual package: pkgefa55947814
```

That temporary offering used the same Play products. After assigning it to the test customer, the public endpoint returned packages for both the temporary offering and the default offering.

The customer override was then cleared. After clearing it, the normal default offering still returned packages for both the real test user and fresh subscriber IDs.

Final successful public endpoint response shape:

```json
{
  "current_offering_id": "default",
  "offerings": [
    {
      "identifier": "default",
      "packages": [
        {
          "identifier": "$rc_monthly",
          "platform_product_identifier": "monthly",
          "platform_product_plan_identifier": "monthly-base"
        },
        {
          "identifier": "$rc_annual",
          "platform_product_identifier": "yearly",
          "platform_product_plan_identifier": "yearly-base"
        }
      ]
    }
  ]
}
```

The installed app was then force-stopped so it would refetch offerings:

```powershell
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
& $adb -s RZCX118MW3T shell am force-stop com.rakti.habitpro
```

After reopening the same installed build, tapping Monthly/Yearly opened the Google Play purchase flow.

## Temporary cleanup note

The temporary offering `play_debug_20260501` is not current and does not affect normal users. An MCP attempt to archive it failed with:

```text
Content-Type not application/json
```

If desired, archive `play_debug_20260501` manually in the RevenueCat dashboard later. Do not change the `default` current offering unless the public SDK endpoint is checked again afterwards.

## Future debugging checklist

Before making another Play build for purchase-sheet issues:

1. Capture ADB logcat from the installed build.
2. Look for RevenueCat `ConfigurationError` and the `underlyingErrorMessage`.
3. Verify the installed APK contains the expected `goog_` public SDK key.
4. Query RevenueCat MCP:
   - `list_apps`
   - `list_app_public_api_keys`
   - `list_offerings` with package/product expansion
   - `list_entitlements`
   - `list_products` for the Play app
5. Query the public offerings endpoint used by the SDK.
6. If MCP/dashboard shows products but the public endpoint returns `packages: []`, fix RevenueCat offering/package/product associations or force a RevenueCat offering refresh. Do not rebuild the app until the public endpoint returns packages.

Useful RevenueCat doc:

```text
https://www.revenuecat.com/docs/offerings/troubleshooting-offerings
```

## Final root cause

RevenueCat's dashboard/MCP product configuration and RevenueCat's SDK-facing offerings response were out of sync or filtered incorrectly for the Play Store app. The SDK-facing endpoint returned an empty `packages` array, so `Purchases.getOfferings()` failed with `ConfigurationError` before any Google Play billing UI could open.

Correcting the RevenueCat offering package associations to the Play Store products and verifying the SDK-facing endpoint fixed the issue without another app build.
