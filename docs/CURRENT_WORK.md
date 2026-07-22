# HabitPro Current Work

Last updated: 2026-07-22.

This file captures the current working state so future chats do not need the full conversation.

## Current Worktree State

Recent local commits:

- `e002f35 chore: use eas environments for ota scripts`
- `c8a29bf db: persist habit visibility in sync rpc`
- `cbb5a37 fix: polish iOS live mini experience`
- `b8c6d46 feat: implement internet-required gate with NetworkRequiredGate component and update related documentation`
- `11eb8f0 feat: add NetworkRequiredGate component and integrate it into layout for internet connectivity checks`
- `60b53f2 feat: add performance investigation documentation and optimize logging practices`
- `eb9dcbd feat: enhance finish section with mode tags for Timer Check-In and Manual Finish`
- `460f366 chore: update version to 1.1.32 in app.json, package.json, and package-lock.json`

Uncommitted at handoff:

- Apple login, iOS RevenueCat setup, and the `1.1.34` release bump are currently uncommitted:
  - `app.json`
  - `app/(auth)/login.tsx`
  - `package.json`
  - `package-lock.json`
  - `src/context/AuthContext.tsx`
- `android/app/build.gradle` was also updated locally to `versionName "1.1.34"` / `versionCode 35`; this path may be ignored by Git, so verify it manually before a local native Android build.

Release/build boundaries:

- Do not commit, push, apply Supabase migrations, run EAS builds/updates, publish OTA, or deploy unless the user explicitly asks for that exact action.
- User explicitly asked for iOS/TestFlight guidance and later OTA publishes. Production OTA actions were run only after those explicit requests.
- No git push was requested or run.

Current app version/build:

- Expo/package version: `1.1.34`
- Runtime version: `1.1.34`
- iOS build number: `35`
- Android versionCode: `35`

## Latest Fix: iOS Paywall Stuck Behind Sheets

Root cause found and fixed:

- Any component that wraps itself in its own `<Modal>` (Live Squad invite, streak repair, group mission, mission/mini completion memory sheet, custom nudge note, community-player mission journey drawer) and calls `openUpsell(...)` from inside a handler while that Modal is still open hits a known iOS limitation: a second native `<Modal>` presented while a first is still visible frequently fails to render/interact on iOS. Android's `Dialog`-backed `Modal` stacks more forgivingly, so this only showed up on iOS. It looked like tapping Invite/Complete/etc. did nothing ("stuck").
- Fix: close the enclosing sheet (`onClose()` / the relevant `set...(false)` or `set...(null)`) immediately before calling `openUpsell(...)`, so only one native modal is ever presented at a time.
- Fixed in 8 files, 12 call sites:
  - `src/components/LiveMiniInviteSheet.tsx` (create + invite premium checks)
  - `src/components/StreakRepairSheet.tsx` (group repair premium checks)
  - `src/components/GroupChallengeSheet.tsx` (create + invite premium checks)
  - `app/mini/[id].tsx` (`handleCompleteCommit`, mini mission completion + Community publish)
  - `app/habit/[id].tsx` (`handleMemoryCommit`, `handleHabitMemoryCommunityChange`, `squadShareProp.onToggle` — main mission completion + Community publish + squad visibility, all rendered inside `StreakMemorySheet`)
  - `app/challenge/[id].tsx` (`onSubmitCustomNote`, the `CustomNudgeModal` send handler)
  - `app/challenge-memory.tsx` (same `CustomNudgeModal` pattern)
  - `app/community-player/[id].tsx` (`MissionJourneyDrawer` cheer/like handler)
- Trade-off: subscribing from inside one of these sheets now closes the sheet along with the paywall (previously intended to show the paywall on top and return to the same sheet). User must reopen the sheet after subscribing. Small UX cost for the flow actually working on iOS.
- Validated: tested on Android emulator (`npm run android`, JDK via Android Studio's bundled `jbr`, `ANDROID_HOME`/`sdk.dir` configured locally) and iOS Simulator (`npx expo run:ios`, local `.env` needed `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY` added — it was missing before). Both platforms confirmed working after the fix.
- Not fixed in this session, still open: `supabase/functions/revenuecat-webhook/index.ts` crashes (~30-40% of webhook deliveries observed failing in Supabase edge function logs) when a RevenueCat event's `app_user_id` is a `$RCAnonymousID:...` string instead of a real UUID, because the webhook does `UPDATE profiles ... WHERE id = appUserId` without validating it's a UUID first. This can leave `profiles.is_premium` stale in either direction for any user whose event happens to hit it. Deferred; not yet fixed.
- Test account note: `raktim24@gmail.com` (`f90d8ca4-ad7c-4ca8-9646-4633af4a53b3`) had `is_premium` manually set to `false` in Supabase during this session to test the free-user paywall path on a real linked account. Not yet restored as of this entry.

## Latest Fix: iOS Purchase Could Not Start (App Store Connect Account Setup)

After the code fix above, the paywall opened correctly but tapping Subscribe still failed with "Purchase could not start. Make sure this app was installed from TestFlight or the App Store with a tester account." on a real TestFlight build. This was entirely App Store Connect / Apple account configuration, not app code. Diagnosed live via RevenueCat MCP (`get-product-store-state`) rather than guessing from the generic client error. Chain of blockers found and fixed, in order:

1. Both `monthly`/`yearly` products showed `store_status.raw_store_status: MISSING_METADATA`.
2. Missing Review Information screenshot on both products — physical-device screenshots kept failing App Store Connect's exact-dimension check (likely transfer/edit re-encoding). Fixed by capturing directly from a booted Simulator: `xcrun simctl io booted screenshot output.png` — guaranteed pixel-perfect native resolution.
3. Still `MISSING_METADATA` after the screenshot — the **subscription group's own Localization** (display name/app name, separate from each product's own localization) was empty. Filled in via the group page's Localization section.
4. Still `MISSING_METADATA` — **Privacy Policy URL** was empty under App Store Connect → General → App Privacy → "Edit" next to Privacy Policy (not the "App Information" page, which has no such field). Set to `https://habitpro-web.vercel.app/privacy`.
5. Status changed to `READY_TO_SUBMIT` after those three, but purchases still failed. Root cause: **Business → Agreements, Tax and Banking** — the `Paid Apps Agreement` was still status `New` (only the `Free Apps Agreement` was Active, which doesn't cover paid subscriptions). Required completing Legal Entity info, signing the Paid Apps Agreement, a `W-8BEN` tax form (non-US individual — India/US treaty Article 12, 15% rate, "Income from the sale of applications"), and linking a bank account.
6. Even after Agreements/Banking/Tax all showed Active, purchases still failed for a period — this was propagation delay (commonly ~24h reported for this class of Apple account change, not officially documented but consistent with real-world reports). Resolved on its own without any further changes once enough time had passed.
7. The EU Digital Services Act "trader" compliance banner on the same Business page is unrelated/separate — safe to ignore for this issue.

Full reusable checklist for this class of problem (any app, not just HabitPro) now lives in `.codex/skills/ios-iap-troubleshooting/SKILL.md` — read that first if this happens again here or on a different app.

## Latest Product / Release Prep Changes

iOS/TestFlight setup:

- First iOS TestFlight-capable production build was created and submitted through EAS/App Store Connect.
- App Store Connect app id: `6792545017`.
- First iOS build: version `1.1.32`, build `33`.
- Latest local build target: version `1.1.34`, build `35`.
- Bundle id: `com.rakti.habitpro`.
- Internal TestFlight group `Team (Expo)` has the user invited and the build available.
- App encryption compliance was answered as standard/exempt encryption.
- Apple Push Notifications key was created and assigned to `com.rakti.habitpro`.
- Expo push tester successfully delivered a notification to the iPhone TestFlight build.
- Sign in with Apple is enabled in `app.json`, wired in `app/(auth)/login.tsx`, and was reported working on the iPhone TestFlight build after the provisioning profile was regenerated with the Apple sign-in entitlement.
- EAS production env includes `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY`.
- RevenueCat App Store app `habitPro (App Store)` exists for bundle id `com.rakti.habitpro`; its App Store Connect API key and in-app purchase key configuration were verified as present by MCP.
- App Store products `monthly` and `yearly` were imported into RevenueCat, attached to `habitpro_community`, and attached to default offering packages `$rc_monthly` and `$rc_annual`.

Production OTAs published:

- `00fdba0a-081e-4347-af3f-cdb04f51c472` — `Fix iOS network gate foreground refresh`.
- `e36a7398-10f9-44d7-abad-c750ba03c664` — `Fix iOS live mini invite and image performance`.
- `97cb22c0-2958-402d-8dc2-cde2fb5b4d73` — `Fix Android RevenueCat production key`, published with `--environment production`.

Important OTA/env lesson:

- This Mac's local `.env` had a RevenueCat Android `test_...` key. Android release builds intentionally treat `test_` keys as missing.
- Production OTA scripts now include explicit EAS environments:
  - `npm run update:preview` -> `eas update --channel preview --environment preview`
  - `npm run update:production` -> `eas update --channel production --environment production`
- Keep the Mac `.env` updated privately with the real RevenueCat Android `goog_...` key, or rely on EAS `--environment production` for production OTA.

Live Mini / iOS fixes:

- `src/components/NetworkRequiredGate.tsx` now refreshes NetInfo on foreground and waits briefly before confirming offline, preventing false iOS `No internet connection` overlays after returning from background.
- `app/live-mini/[id].tsx` now uses Supabase render thumbnails for inline Live Squad memory images while keeping full-size tap-to-view.
- `src/components/LiveMiniInviteSheet.tsx` wraps invite content in a keyboard-aware scroll container so iPhone keyboards do not cover username search/results.

Main mission visibility sync:

- `supabase/migrations/20260720110000_fix_habit_visibility_sync_rpc.sql` fixes `rpc_sync_dirty_state` so main habit `visibility` is inserted/updated.
- User reported they applied this migration after it was created. Synced Solo/Public mission visibility should be retested on device.

Internet-required app layer:

- Added `@react-native-community/netinfo`.
- Added `src/components/NetworkRequiredGate.tsx`.
- Wired `NetworkRequiredGate` at the end of `RootLayoutNav` in `app/_layout.tsx` so it overlays all screens and swallows touches.
- When internet is unavailable, the app shows a full-screen `No internet connection` blocker with a `Try Again` action.
- Removed the old `Continue offline` button from `app/(auth)/login.tsx`.
- Because NetInfo is a native dependency, this requires a new native build; OTA alone is not enough.

Mini mission finish rule labels:

- `app/mini/create.tsx` keeps clean titles: `Timer Check-In` and `Manual Finish`.
- Added straight pill-style tags: `SOLO` for Timer Check-In and `SOLO / COMMUNITY` for Manual Finish.
- Timer Check-In remains solo-only; Manual Finish can be solo or Live Squad/community.

Logging cleanup and future performance workflow:

- Temporary `console.log` / `console.info` instrumentation was removed from `app` and `src`.
- `src/lib/perfTrace.ts`, `src/lib/jsThreadProbe.ts`, and `src/lib/sync.ts` were quieted.
- Real `console.warn` / `console.error` paths remain.
- Added `.codex/skills/habitpro-performance-investigation/SKILL.md`.
- `agent.md` now says time/performance optimization should use targeted temporary timer logs first, then remove them before production handoff.

Session logging skill:

- `.codex/skills/habitpro-session-logger/SKILL.md` now includes a Markdown audit step:
  - run `rg --files -g '*.md' -g '!node_modules'`
  - review all repo Markdown files against session changes
  - update affected docs only

## Prior Important State

Mission marker regression recovery:

- Preview OTA was published to `preview` from commit `4acde0277ec4025c82b36edc0a6073628555dc85`.
- EAS update group: `683beb51-84b0-4bb8-aa2d-8572757e4bea`.
- Runtime version for that OTA: `1.1.31`.
- Live data still needs these migrations applied before synced retesting:
  - `supabase/migrations/20260719120000_backfill_completed_dates_from_streak_memories.sql`
  - `supabase/migrations/20260719121000_focus_delta_group_creator_timezone.sql`
- User reported `supabase/migrations/20260720110000_fix_habit_visibility_sync_rpc.sql` has been applied.
- The marker fix itself is committed in `61e035c`, `c41cc69`, and `4acde02`.

Mini Mission Timer Check-In:

- `MiniMissionCompletionMode = "manual" | "timer_check_in"`.
- Timer Check-In expires into Complete / Retry / Fail review instead of auto-failing.
- `Fail` persists `status: "missed"`.
- `Retry` restarts the timer.
- Existing mini missions default to manual behavior when `completionMode` is missing.
- Supabase migration for synced mini timer check-in:
  - `supabase/migrations/20260715120000_mini_timer_check_in.sql`

Mission detail / Android performance:

- Active Trail batching and virtualized honeycomb moments are intentional. Do not revert them casually.
- `src/components/StreakMemoryGallery.tsx` uses horizontal `FlashList` columns and React Native `Animated`, not Reanimated.
- Avoid reintroducing `react-native-reanimated` in the gallery while testing with Expo Go unless native Worklets and JS versions are known to match.
- Decorative animations should use `isInteraction: false` when they should not block `InteractionManager`.

## Validation Already Run Recently

After the internet-required layer:

```bash
npx tsc --noEmit
git diff --check
```

After logging cleanup / performance skill:

```bash
npx tsc --noEmit
git diff --check
```

After updating `.codex/skills/habitpro-session-logger/SKILL.md`:

```bash
git diff --check
```

Skill validator note:

- `python3 /Users/raktimmacbook/.codex/skills/.system/skill-creator/scripts/quick_validate.py ...` still fails because local Python is missing the `yaml` module.

## Suggested Test Checklist

Internet-required layer:

- Test in Android emulator/dev build by disabling Wi-Fi/data.
- Confirm full-screen `No internet connection` appears.
- Confirm underlying app buttons do not respond.
- Re-enable network and tap `Try Again`; blocker should disappear.
- Test on a native build, not only Expo Go, because NetInfo is a native dependency.

Mini mission create:

- Confirm Timer Check-In title shows straight `SOLO` pill.
- Confirm Manual Finish title shows straight `SOLO / COMMUNITY` pill.
- Confirm Timer Check-In still hides Live Squad and reserve fuel.
- Confirm Manual Finish still allows Live Squad and reserve fuel.

Release/build:

- Production Android build should include version/runtime `1.1.34` and Android versionCode `35`.
- Production OTA should use `npm run update:production -- --message "<message>"` so EAS uses the `production` environment.
- If building a local APK, use Android Studio's bundled JDK via `JAVA_HOME` unless system Java is installed.
- For Play Store style production Android release, prefer the EAS production AAB path.

## Current Product Backlog Notes

Possible future work:

- Live Squad Timer Check-In with `awaiting_check_in`.
- Sign in with Apple for App Store Review.
- iOS build/TestFlight setup.
- More real-device Android/iOS testing for `NetworkRequiredGate`.
- Further iOS/Android scroll performance pass for long mission detail screens.
- Commit current docs/skill changes if user asks.
