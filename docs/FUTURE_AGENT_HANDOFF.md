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
- Android performance must stay smooth on modern phones, not only older-device fallback paths.
- Compact but clear mission detail UI.
- Reliable photo picker and memory flows on iOS.
- Mission moments should feel visually special, but not at the cost of habit-card-to-detail navigation.
- Mini missions that are humane for real workouts/timed tasks.
- Build path for iOS physical device and TestFlight.

## Current Technical Risk Areas

- Supabase migrations must be applied before testing synced mini mission changes.
- Timer Check-In local behavior and Live Squad manual behavior must stay separate for now.
- iOS and Android scroll/navigation performance can regress on long mission detail screens.
- The mission moment honeycomb uses SVG clipping and image thumbnails. Keep it virtualized; do not return to mounting every moment in a horizontal `ScrollView`.
- Do not use `react-native-reanimated` in `src/components/StreakMemoryGallery.tsx` while testing with Expo Go unless the native Worklets version is known to match. A previous Reanimated import caused a Worklets mismatch crash.
- Decorative animations that should not block navigation or `InteractionManager` should use `isInteraction: false`.
- Active Trail marker batching is intentional. `visibleActiveTrailDays` should continue to limit initially rendered markers for long missions.
- Moments should not be gated on every marker batch completing. `memoryGalleryEntries` should depend on `detailHeavyContentReady`, not `visibleGridDayCount >= totalDays`.
- App Store Review will likely require Sign in with Apple because Google sign-in exists.

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

If the user asks for iOS build:

1. Confirm Apple Developer enrollment is active.
2. Confirm EAS env vars are set.
3. Confirm Supabase migration is applied.
4. Use `npm run build:ios:preview` for physical iPhone ad hoc test.
5. Use `npm run build:ios` plus `eas submit --platform ios` for TestFlight.
