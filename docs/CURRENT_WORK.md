# HabitPro Current Work

Last updated: 2026-07-16.

This file captures the current working state so future chats do not need the full conversation.

## Current Worktree State

There are intentional uncommitted changes. Do not revert them unless the user explicitly asks.

Recent code commits already created:

- `1c5d5a3 feat: add mini mission timer check-in state`
- `6197f56 feat: update mini mission check-in UI`
- `c3b1bdf feat: revamp mission moment gallery`

Key current uncommitted code areas:

- Mission detail spacing polish.
- Mission moment honeycomb optimization and build-in animation.
- Android mission-detail performance fixes for marker batching and non-blocking decorative animations.
- Home habit-card check-in pulse animation marked non-blocking.

Known untracked docs/workspace files may exist:

- `.claude/`
- `app-architecture.md`
- `docs/CURRENT_WORK.md`
- `docs/FUTURE_AGENT_HANDOFF.md`
- `docs/PROJECT_CONTEXT.md`
- `docs/IOS_BUILD_PLAYBOOK.md`
- `habitPro-latest.code-workspace`
- `habitPro.code-workspace`
- `habitPro_tryItFirst.code-workspace`
- `neededpoints.md`

Do not include unrelated workspace files in commits unless the user asks. If committing docs, include only the docs explicitly intended for that phase.

## Mini Mission Timer Check-In Work

Implemented direction:

- `MiniMissionCompletionMode = "manual" | "timer_check_in"`.
- `completionMode` added to mini mission data.
- `MiniMissionStatus` now includes `missed`.
- Timer Check-In can expire into a review/check-in state instead of auto-failing.
- Review actions are concise:
  - `Complete`
  - `Retry`
  - `Fail`
- `Fail` persists `status: "missed"`.
- `Retry` restarts the timer.
- Existing mini missions default to manual behavior when `completionMode` is missing.

Important files:

- `src/types/habit.ts`
- `src/store/habitStore.ts`
- `src/utils/miniMissionTime.ts`
- `src/utils/miniMissionNotifications.ts`
- `app/mini/create.tsx`
- `app/mini/[id].tsx`
- `app/mini/index.tsx`
- `src/components/HubListModal.tsx`
- `src/components/MissionDetailsSheet.tsx`
- `src/lib/sync.ts`
- `src/hooks/useRemoteStoreRefreshOnFocus.ts`
- `src/lib/liveMiniMissionProgress.ts`

## Mini Mission UI Decisions

- Timer Check-In is the default creation mode.
- Manual Finish is available as the stricter mode.
- Timer Check-In is currently solo-only.
- Timer Check-In no longer shows the Live Squad invite card.
- Timer Check-In no longer shows reserve fuel controls or reserve copy.
- Manual Finish keeps Live Squad and reserve fuel.
- The create screen no longer has a separate `Create Mini Mission` button.
- `Let's Go Now` creates and starts immediately.
- `Start Later` creates in waiting state.

## Supabase Migration

Current migration file:

- `supabase/migrations/20260715120000_mini_timer_check_in.sql`

Purpose:

- Adds `completion_mode` to `public.mini_missions`.
- Defaults old/missing values to `manual`.
- Updates sync RPC behavior to accept/write `completion_mode`.

Before testing a cloud-synced build with current mini mission changes, apply the migration to the target Supabase project.

## iOS UI / Performance Fixes In Progress

Recent iOS issues addressed or partially addressed:

- Image picker/photo modal stuck behavior after marker broadsheet.
- Community feed image blank space after image changes.
- iOS compact mission control row overlap.
- iOS group streak horizontal marker scrolling.
- Mission detail long grid render pressure.

Important file for group streak marker scroll:

- `src/components/CohortPeerStreakDots.tsx`

## Mission Detail Honeycomb And Android Performance Work

Recent mission detail direction:

- Moments stay above the Active Trail/grid.
- `src/components/StreakMemoryGallery.tsx` now uses a two-row wide rounded hex/honeycomb strip.
- The honeycomb is virtualized as horizontal `FlashList` columns, with two hexes per column, instead of a single `ScrollView` that mounts every SVG/image tile at once.
- Hexes have a subtle build-in animation using React Native's built-in `Animated` API.
- Do not reintroduce `react-native-reanimated` in `StreakMemoryGallery` for this animation while testing in Expo Go. It caused a Worklets native/JS mismatch in Expo Go (`0.7.3` JS vs `0.5.1` native).
- Moment tap opens an aspect-aware photo-card modal, closer to an Instax/scrapbook card. The modal uses the real image aspect ratio and `resizeMode="cover"` to avoid black bars.

Recent Android performance fixes:

- Active Trail now respects marker batching through `visibleActiveTrailDays`; it no longer renders every reached marker immediately.
- `memoryGalleryEntries` no longer waits for `visibleGridDayCount >= totalDays`; moments can render after `detailHeavyContentReady` instead of waiting for every marker batch.
- Long-grid clipping now uses `optimizeGridScrollForLongGrid` across platforms, not iOS-only.
- Decorative animations use `isInteraction: false` so they do not block `InteractionManager.runAfterInteractions()`:
  - Home habit-card check-in pulse in `src/components/HabitCard.tsx`.
  - Mission detail current-day pulse and milestone shimmer in `app/habit/[id].tsx`.
  - Streak banner entrance/glow in `src/components/StreakBanner.tsx`.
  - Honeycomb build animation in `src/components/StreakMemoryGallery.tsx`.

Important files:

- `app/habit/[id].tsx`
- `src/components/StreakMemoryGallery.tsx`
- `src/components/HabitCard.tsx`
- `src/components/Timer.tsx`
- `src/components/QuoteCard.tsx`
- `src/components/StreakBanner.tsx`

If Android still feels delayed when opening a 75-day mission:

- First test disabling the honeycomb build animation only on Android.
- Then test lowering `HONEYCOMB_BUILD_STAGGER_CAP_MS`.
- Avoid increasing initial marker batch size until Android navigation is confirmed smooth.

## Validation Already Run Recently

The following commands have passed after the latest mission-detail performance changes:

```bash
npx tsc --noEmit
git diff --check
```

Also run before handing off a release build:

```bash
git diff --check
npx tsc --noEmit
```

## Suggested Test Checklist

Mini mission create:

- Create Timer Check-In with `Let's Go Now`.
- Create Timer Check-In with `Start Later`.
- Create Manual Finish with `Let's Go Now`.
- Create Manual Finish with `Start Later`.

Timer Check-In detail:

- Confirm no Live Squad invite card.
- Confirm no reserve fuel button.
- Let timer expire.
- Confirm modal shows Complete, Retry, Fail.
- Complete with memory.
- Retry from review state.
- Fail and confirm it lands in failed/missed bucket.

Manual Finish detail:

- Confirm reserve fuel still appears.
- Confirm Live Squad invite still appears.
- Confirm expiry still fails/misses.

iOS specific:

- Photo picker from mission/memory flows.
- Close image modal and continue scrolling.
- Group streak marker horizontal scroll.
- Mission detail scroll jank on 75-day mission with many marked cells.
- Bottom tab safe area.

Android specific:

- Open a 75-day mission from a habit card and confirm the route transition does not pause for 1-3 seconds.
- Confirm the home habit-card check-in pulse does not freeze during navigation.
- Confirm moments appear shortly after the detail handoff, not only after all marker batches finish.
- Confirm Active Trail initially renders the staged marker count and then fills in batches.
- Confirm honeycomb horizontal scrolling remains smooth with many image moments.

## Current Product Backlog Notes

Possible future work:

- Live Squad Timer Check-In with `awaiting_check_in`.
- Sign in with Apple for App Store Review.
- iOS build/TestFlight setup.
- Further iOS/Android scroll performance pass for long mission detail screens.
- Commit current changes in phases if user asks.
