# Future Agent Handoff

This file is for future agents working on HabitPro.

## Start Here

Read in order:

1. `agent.md`
2. `docs/PROJECT_CONTEXT.md`
3. `docs/CURRENT_WORK.md`
4. `app-architecture.md`

Then inspect the files relevant to the user request.

## Do Not Do

- Do not revert uncommitted changes without explicit user approval.
- Do not create commits unless the user asks.
- Do not include unrelated workspace files in commits.
- Do not push.
- Do not treat Live Squad Timer Check-In as a small UI-only change.

## Current User Priorities

- iPhone-first polish and real-device testing.
- Android performance must stay smooth on modern phones, not only older-device fallback paths. The current pain point is S24 Ultra Home/detail jank after splash.
- Compact but clear mission detail UI.
- Reliable photo picker and memory flows on iOS.
- Mission moments should feel visually special, but not at the cost of habit-card-to-detail navigation.
- Mini missions that are humane for real workouts/timed tasks.
- Build path for iOS physical device and TestFlight.
- Mac migration so Windows and Mac can both continue from committed docs/history.
- Production Android build/testing around version `1.1.34` and the new internet-required gate.
- External TestFlight setup for friends after internal smoke testing.

## Current Technical Risk Areas

- Supabase migrations must be applied before testing synced mini mission changes.
- Timer Check-In local behavior and Live Squad manual behavior must stay separate for now.
- iOS and Android scroll/navigation performance can regress on long mission detail screens.
- The mission moment honeycomb uses SVG clipping and image thumbnails. Keep it virtualized; do not return to mounting every moment in a horizontal `ScrollView`.
- Do not use `react-native-reanimated` in `src/components/StreakMemoryGallery.tsx` while testing with Expo Go unless the native Worklets version is known to match. A previous Reanimated import caused a Worklets mismatch crash.
- Decorative animations that should not block navigation or `InteractionManager` should use `isInteraction: false`.
- Active Trail marker batching is intentional. `visibleActiveTrailDays` should continue to limit initially rendered markers for long missions.
- Moments should not be gated on every marker batch completing. `memoryGalleryEntries` should depend on `detailHeavyContentReady`, not `visibleGridDayCount >= totalDays`.
- Sign in with Apple is implemented and enabled for the iOS bundle; retest after any provisioning/profile or auth provider changes.
- RevenueCat iOS billing is configured in RevenueCat for App Store products `monthly` and `yearly`, entitlement `habitpro_community`, and the current `default` offering packages. EAS production env includes the iOS RevenueCat public SDK key.
- Daily Wisdom now lives in `AnimatedSplashOverlay`; do not re-add the mission detail quote card unless the product direction changes.
- Cohort dots now show newest/current first and omit future dots.
- Home `HabitCard` segmented `RingDayArcs` is a current Android performance suspect for long missions because it creates one SVG `Circle` per mission day.
- `NetworkRequiredGate` uses `@react-native-community/netinfo`; any change to it requires native-build awareness.
- iOS foreground reachability can be briefly stale; `NetworkRequiredGate` intentionally refreshes NetInfo and delays confirmed offline display.
- Live Mini invite sheet uses keyboard-aware scroll behavior for iPhone username search; preserve that when editing the sheet.
- Live Mini board inline memory photos should use thumbnails, not full public image URLs.
- Main habit visibility persistence depends on `rpc_sync_dirty_state` writing `visibility`; migration `20260720110000_fix_habit_visibility_sync_rpc.sql` restores this and the user reported it was applied.
- Production OTA scripts must keep `--environment production`; a Mac local `.env` once had a RevenueCat Android `test_...` key and caused Android release billing to look unconfigured until a corrective OTA was published.
- Temporary timer/performance logs should be added only for investigation and removed before production handoff.

## Good Next Actions

If the user asks to commit:

1. Run `git status --short`.
2. Separate unrelated files.
3. Commit in phases:
   - iOS UI/performance fixes.
   - Android mission-detail performance fixes.
   - Mission moment gallery UI/performance.
   - Mini mission Timer Check-In schema/store/sync.
   - Mini mission UI changes.
   - Docs.
4. Run `npx tsc --noEmit` before finalizing.

If the user reports mission-detail jank:

1. Inspect `app/habit/[id].tsx`, `src/components/StreakMemoryGallery.tsx`, and `src/components/HabitCard.tsx`.
2. Confirm Active Trail is still batched via `visibleActiveTrailDays`.
3. Confirm honeycomb moments are still virtualized by horizontal `FlashList` columns.
4. Confirm decorative animations have `isInteraction: false`.
5. If Android still lags, temporarily disable the honeycomb build animation on Android before changing the layout.

If the user reports Home jank after splash:

1. Inspect `app/(tabs)/index.tsx` and `src/components/HabitCard.tsx`.
2. Check how many `HabitCard` rows mount initially.
3. Temporarily replace Android long-mission `RingDayArcs` with a lightweight progress ring/text.
4. Confirm whether touch response improves before changing mission detail.
5. Keep splash out of the blame path unless profiling shows splash-specific stalls; the user clarified the jank starts on Home after splash.

If the user asks for iOS build:

1. Confirm Apple Developer enrollment is active.
2. Confirm EAS env vars are set.
3. Confirm Supabase migration is applied.
4. Confirm RevenueCat default offering still has both Android and iOS products in `$rc_monthly` and `$rc_annual`.
5. Use `npm run build:ios:preview` for physical iPhone ad hoc test.
6. Use `npm run build:ios` plus `eas submit --platform ios` for TestFlight.

If the user asks for production OTA:

1. Use the HabitPro deployment guard.
2. Run validation first.
3. Use `npm run update:production -- --message "<message>"` or `npx eas update --channel production --environment production --message "<message>"`.
4. Confirm the EAS output says production environment variables were loaded.

If the user reports internet/offline behavior:

1. Inspect `src/components/NetworkRequiredGate.tsx` and `app/_layout.tsx`.
2. Test in an Android emulator/dev build by disabling network.
3. Confirm the overlay blocks underlying app touches and disappears after connectivity returns plus `Try Again`.
4. Remember NetInfo is native; Expo Go may not be enough for release-confidence testing.

If the user reports Solo/Public mission visibility reverting:

1. Confirm migration `20260720110000_fix_habit_visibility_sync_rpc.sql` is applied on the target Supabase project.
2. Retest by toggling a main mission to Public, leaving the detail screen, reopening, and confirming it stays Public.
3. If it still reverts, inspect `rpc_sync_dirty_state` in the live database and verify the habit insert/update writes `visibility`.

If ending a long session:

1. Read `.codex/skills/habitpro-session-logger/SKILL.md`.
2. Audit all Markdown files with `rg --files -g '*.md' -g '!node_modules'`.
3. Update `docs/CURRENT_WORK.md`.
4. Append a dated entry to `docs/WORK_HISTORY.md`.
5. Update affected architecture/context/playbook docs only when their scope changed.
