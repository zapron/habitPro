# HabitPro Current Work

Last updated: 2026-07-17.

This file captures the current working state so future chats do not need the full conversation.

## Current Worktree State

There are no intentional uncommitted app code changes at this checkpoint. The worktree was clean before the current markdown / handoff audit. Do not revert unrelated local files unless the user explicitly asks.

Recent code commits already created:

- `1c5d5a3 feat: add mini mission timer check-in state`
- `6197f56 feat: update mini mission check-in UI`
- `c3b1bdf feat: revamp mission moment gallery`
- `1ecb823 feat: virtualize mission moment honeycomb`
- `f94bacf perf: smooth mission detail rendering`
- `d1fc011 style: compact mission detail cards`
- `2884de9 docs: add project handoff context`
- `075cabe feat: add daily wisdom launch splash`
- `5131c7a feat: show cohort streak dots newest first`
- `4a078b7 docs: add migration handoff context`

Latest committed product changes:

- Daily Wisdom moved out of mission detail and into the existing launch splash sequence.
- `SplashGate` now keeps the overlay through a short minimum display window and waits for signed-in startup data readiness or a max cap.
- `AppLaunchNotificationNudge` delay was increased so it does not collide with launch wisdom.
- Mission detail no longer renders `QuoteCard`.
- Group/cohort streak dots now render newest-first and omit future/unreached dots.

Current uncommitted Android performance fix:

- `src/components/HabitCard.tsx` now uses a lightweight aggregate progress ring on Android when a mission has more than 45 days.
- iOS and shorter Android missions still use the segmented per-day ring.
- This is intended to reduce Home jank after splash by avoiding dozens of tiny `react-native-svg` `Circle` nodes per long-mission card.
- Dev-only timing logs were added for launch/hydrate/Home readiness. Watch Android logs for `[habitPro:perf] splash.*`, `sync.pull.*`, `sync.authHydrate*`, and `home.firstCardsCommit`.
- Android timing logs showed `sync.mapDelta.alignGroups` taking 22-28s for 13 challenge groups, while Home card commit was only about 30-100ms and mini mapping was about 2-4ms.
- `supabase/migrations/20260717120000_focus_delta_group_meta.sql` updates `rpc_focus_delta_v1` to return challenge group alignment metadata in the same payload. Apply this migration before retesting; otherwise the client must still do the slow separate `challenge_groups` fetch.
- After applying the migration, logs showed `fetchedGroupIds: 0`, confirming the slow network query was removed. Remaining CPU time was in `habitsFromRows` / `alignOwnHabitsTotal`.
- `src/utils/groupMissionClock.ts` now skips expensive group date/memory remapping when the habit already matches the canonical challenge start/end.
- `src/utils/missionCalendarKeys.ts` and `src/utils/groupMissionClock.ts` now precompute date-key maps for mission-day canonicalization/remapping instead of scanning every mission day for every completed/memory key. This should reduce `sync.mapDelta.habitsFromRows` and `sync.mapDelta.alignOwnHabitsTotal` on 180-day missions.
- Latest Expo Go Android logs after date-map optimization showed `sync.mapDelta.habitsFromRows` down to about 240-430ms, `sync.mapDelta.alignOwnHabitsTotal` around 650-1200ms, and `sync.pull.total` often around 1.2-2.8s. Home card commit stayed under about 230ms.
- Dev-only mission detail logs were added to investigate Android detail navigation and delayed memories. Watch for `habit.card.openPress`, `habit.card.routerPush`, `habit.detail.mounted`, `habit.detail.firstCommit`, `habit.detail.heavyFocusStart`, `habit.detail.heavyReadyAfterInteractions`, `habit.detail.memoryEntriesReady`, `habit.detail.gridBatch`, `memory.gallery.firstCommit`, and `habit.detail.*` / `memory.gallery.*` JS sync/stall labels.
- Mission detail logs showed Android navigation was blocked by `habit.detail.activeTrailReachedDay` taking about 1.8-5.1s and `habit.detail.memoryGalleryEntries` taking about 0.9-2.5s on a 75-day mission with 65 memories.
- `src/utils/missionDaySlots.ts` now exports `missionDayNumberMapForHabit()`, and `app/habit/[id].tsx` reuses one date-to-day map for Active Trail and memory gallery entries instead of scanning all mission days for every memory/completion date.
- Follow-up Android logs after `missionDayNumberMapForHabit()` showed detail first commit around 232-336ms, `heavyReadyAfterInteractions` around 110-167ms, `memoryEntriesReady` around 120-182ms, and `memory.gallery.firstCommit` around 10-12ms. The previous multi-second Active Trail / memory entry stalls were gone.

Current documentation / handoff status:

- `agent.md` now tells future agents to read `docs/WORK_HISTORY.md` for longer sessions.
- `docs/WORK_HISTORY.md` records chronological development history.
- `docs/MAC_SETUP_HANDOFF.md` captures the Windows-to-Mac migration checklist.
- `.codex/skills/habitpro-session-logger/` adds a repo-local Codex skill for end-of-session logging.
- The repo markdown files have been checked on Mac for Windows CRLF line endings, conflict markers, Windows-only paths, and stale handoff/untracked-file wording.
- Project markdown files are LF-normalized; CRLF matches were only found under `node_modules` dependency README files and were left untouched.

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

- First test Android Home without the segmented per-day `RingDayArcs` in `src/components/HabitCard.tsx`.
- Then test mission detail with `StreakMemoryGallery` temporarily disabled on Android.
- Then test disabling the honeycomb build animation only on Android.
- Then test lowering `HONEYCOMB_BUILD_STAGGER_CAP_MS`.
- Avoid increasing initial marker batch size until Android navigation is confirmed smooth.

## Daily Wisdom Launch Splash

Implemented in commit:

- `075cabe feat: add daily wisdom launch splash`

Current behavior:

- `src/components/AnimatedSplashOverlay.tsx` displays a deterministic daily quote under the habitPro lockup.
- `src/components/SplashGate.tsx` waits for a minimum launch window and signed-in startup readiness when available.
- The old mission detail `QuoteCard` was removed from `app/habit/[id].tsx`.

Important caution:

- The user clarified that the Android issue is not the splash itself. The visible jank starts after Home appears.
- Do not spend more time blaming the splash unless profiling shows splash-specific stalls.

## Cohort Streak Dot Timeline

Implemented in commit:

- `5131c7a feat: show cohort streak dots newest first`

Current behavior:

- `src/components/CohortPeerStreakDots.tsx` renders each participant's dots from current/reached day back to day 1.
- Future/unreached dots are omitted.
- The legend now says `Current` instead of `Today` / `Upcoming`.
- Dot taps still fetch memory details lazily through `fetchChallengeMemoryDetail()`.

## Current Android Performance Investigation

User reports:

- S24 Ultra shows Home jank after splash and delayed touches.
- iPhone 17 is smooth.
- Mission detail touch responses can queue and fire after moments start appearing.

Current diagnosis, not yet fixed:

- Home card `RingDayArcs` rendered one SVG `Circle` per mission day. A 75-day card created about 75 SVG nodes for a tiny ring.
- Android `react-native-svg` node creation can be significantly heavier than iOS.
- Mission detail still has heavy Android surfaces: Active Trail cells, lock icons, honeycomb SVG clipping/images, and memory date mapping.

Recommended next experiments:

1. Apply `supabase/migrations/20260717120000_focus_delta_group_meta.sql`, then retest Android launch logs. Expected `sync.mapDelta.alignGroups` should show `payloadGroupIds` matching group count and `fetchedGroupIds: 0`.
2. Retest after the `groupMissionClock` fast path. Expected `sync.mapDelta.alignOwnHabitsTotal` should drop sharply for already-aligned group habits.
3. Test the Android long-mission Home ring fallback on S24 Ultra and an older Android device.
4. Test mission detail on Android and compare the new detail log timings. If memories are delayed, check whether the delay is before `heavyReadyAfterInteractions`, during `memoryEntriesReady`, or inside `memory.gallery.firstCommit` / JS stall logs.
5. Test the same flow on a physical older Android device. If it feels good, remove or gate the temporary perf logs before release.
6. If launch still feels slow on older Android devices, create a lighter launch/home payload that omits full `streak_memories` and fetches details only on mission detail open.

## Validation Already Run Recently

The following commands have passed after the latest mission-detail performance changes:

```bash
npx tsc --noEmit
git diff --check
```

After the Android Home long-mission ring fallback, these passed:

```bash
npx tsc --noEmit
git diff --check
```

After adding dev-only timing logs, rerun the same validation before commit.

Also run before handing off a release build:

```bash
git diff --check
npx tsc --noEmit
```

After commits `075cabe` and `5131c7a`, these passed:

```bash
npx tsc --noEmit
git diff --check
cmd /c npx expo export --platform ios --output-dir .expo-export-check
```

The export folder was removed after verification.

OTA update note:

- `npm run update:preview -- --message "Preview daily wisdom splash and cohort timeline"` was attempted from the sandbox.
- It failed due to Expo GraphQL/network/log write restrictions, and escalation was denied as external data export.
- User should run the command locally when ready.

After the documentation / handoff audit, these passed:

```bash
npx tsc --noEmit
git diff --check
```

The earlier skill validator command was attempted, but the local Python environment was missing the `yaml` module required by `quick_validate.py`.

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
- Mac migration setup and environment recreation.
