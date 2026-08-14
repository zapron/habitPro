# HabitPro App Architecture

Last updated: 2026-07-31

This document is a practical map of the HabitPro mobile app for future AI agents and developers. It describes what the app does, where important behavior lives, how data moves between local state and Supabase, and which files are risky to change.

Use this as orientation before editing. The code and Supabase migrations remain the source of truth.

## Product Summary

HabitPro is an Expo/React Native habit, mission, and social accountability app. The core user experience is:

- Create main missions/habits with daily streak grids.
- Mark days complete, optionally attaching a note/photo memory.
- Create time-boxed mini missions.
- Join group habit challenges/cohorts and compare squad streaks.
- Nudge squad members with preset actions or custom notes.
- Request and vote on streak repairs.
- Publish public memories into a Community feed.
- View a player's public journey and journey view count.
- Compete on weekly leaderboards.
- Subscribe to premium/community features through RevenueCat.

The app is mobile-first and uses Expo Router routes under `app/`.

## Tech Stack

- Framework: Expo SDK 54, React 19, React Native 0.81.
- Routing: `expo-router`.
- State: Zustand with persisted local store.
- Backend: Supabase Auth, Postgres, Storage, RPCs, Realtime, Edge Functions.
- Lists: `@shopify/flash-list` for larger lists.
- Billing: RevenueCat via `react-native-purchases`.
- Notifications: `expo-notifications`, Supabase `notifications`, push Edge Function.
- OTA updates: `expo-updates` with EAS update channels.
- Network reachability: `@react-native-community/netinfo` for the app-wide internet-required gate.
- Styling: app-local theme in `src/styles/theme.ts`, React Native StyleSheet, lucide icons, SVG, LinearGradient, Lottie.

Important config files:

- `package.json`: scripts and dependencies.
- `app.config.js`: loads `.env`, injects Supabase/RevenueCat/web URLs into Expo `extra`, conditionally adds `google-services.json`.
- `app.json`: Expo metadata, manually pinned `runtimeVersion`, `updates.url`, Android edge-to-edge, portrait orientation.
- `eas.json`: EAS build profiles and update channels.
- `tsconfig.json`: TypeScript settings.

## Environment And Runtime Config

Runtime environment helpers live in `src/lib/env.ts`.

Expected public env/config values:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY`
- `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY`
- `EXPO_PUBLIC_HABITPRO_WEB_URL` or `EXPO_PUBLIC_SITE_URL`

Android release billing requires the RevenueCat Play Store public SDK key (`goog_...`). A RevenueCat Test Store key (`test_...`) is intentionally treated as unconfigured in Android release builds.

Supabase is optional at runtime. Many helpers call `isSupabaseConfigured()` and return local-only fallbacks if missing.

Supabase client:

- `src/lib/supabase.ts`
- Uses AsyncStorage-backed Supabase auth persistence.
- Uses PKCE auth flow.
- Exposes `getSupabase()` and `clearSupabaseAuthStorage()`.

## Builds, Channels, And OTA Updates

Expo updates are now an explicit part of the app shell.

Files:

- `src/components/OtaUpdateManager.tsx`
- `src/components/AnimatedSplashOverlay.tsx`
- `src/components/SplashGate.tsx`
- `app.json`
- `eas.json`
- `package.json`

Current build/update model:

- Runtime version is manually pinned in `app.json` (currently `1.1.35` — this drifts with every native/config bump; verify against `app.json` directly rather than trusting this number). This is required because the project has native Android code / bare workflow behavior, so runtime version policies are not supported.
- EAS channels are `development`, `preview`, and `production`.
- Build profiles `apk` and `preview` both publish Android APKs on the `preview` channel.
- Production builds use the `production` channel.
- Scripts:
  - `npm run build:apk`
  - `npm run build:aab`
  - `npm run update:preview`
  - `npm run update:production`
- OTA scripts explicitly pass EAS environments:
  - preview uses `--environment preview`
  - production uses `--environment production`
  This prevents local `.env` values from leaking into release OTA bundles.

`OtaUpdateManager` behavior:

- Disabled in development and when `expo-updates` is not enabled.
- Skips OTA checks while the force-update policy says a native update is required.
- Checks once after launch and again when the app returns to foreground, with a cooldown.
- Downloads available JS/assets update, then prompts the user to restart now or later.

Launch splash behavior:

- `SplashGate` hides the native splash once the custom overlay is laid out.
- `AnimatedSplashOverlay` animates the habitPro lockup and shows a deterministic daily wisdom quote below it.
- For signed-in users, `SplashGate` waits for local store hydration plus auth sync readiness when available, with a short max cap.
- Home still owns the visible dashboard; do not add a second post-splash overlay unless the Home flash behavior is explicitly solved.

OTA-safe changes:

- JavaScript/TypeScript UI, logic, copy, styles, and bundled assets that do not require native config changes.

New build required:

- Native modules/dependencies, Android/iOS config, permissions, app version/runtime version, package name, RevenueCat native SDK changes, notification native config, splash/icon native config, and anything that changes the native binary contract.

Important caution:

- Preview and production channels are separate, but they both receive whatever source state is used when `eas update` runs. Keep Git branches/commits clean before publishing an OTA update so preview-only changes do not accidentally go to production.

## App Shell And Provider Tree

Root layout:

- `app/_layout.tsx`

Provider order:

1. `ThemeProvider`
2. `AppDialogProvider`
3. `ToastProvider`
4. `AuthProvider`
5. `InviteBadgeProvider`
6. `UsernameGateProvider`
7. `NotificationGateProvider`
8. `BillingProvider`
9. `PremiumProvider`
10. `PlusUpsellProvider`
11. `AppVersionProvider`
12. `SplashGate`
13. `RootLayoutNav`

`RootLayoutNav` handles:

- Font-gated stack rendering.
- Auth routing.
- Password recovery deep links.
- Remote push notification response routing.
- App launch notification nudge.
- Sync manager/toasts.
- Force update modal.
- Internet-required overlay via `NetworkRequiredGate`.
- OTA update check/download/restart prompt.
- Mini mission local notification reconciliation.
- Supabase Realtime subscription for applied squad streak repairs.

`SplashGate` now handles:

- Custom habitPro splash overlay.
- Daily Wisdom launch copy.
- Minimum display timing and signed-in startup readiness handoff.

Avoid casually reordering providers. Billing depends on auth, premium depends on billing/auth, username and notification gates depend on theme/auth, and app version wraps the force-update UI.

`NetworkRequiredGate`:

- File: `src/components/NetworkRequiredGate.tsx`.
- Uses `@react-native-community/netinfo`.
- Renders last in `RootLayoutNav` so it blocks all app screens when internet is unavailable.
- Shows `No internet connection`, explains internet is required, swallows touches, and offers `Try Again`.
- Refreshes NetInfo when the app returns active and delays confirmed offline display, because iOS can briefly report stale reachability after backgrounding.
- Because NetInfo is native, changes involving this dependency require a native build, not only OTA.

## Navigation Structure

Main tabs live under `app/(tabs)/`.

Tabs:

- `app/(tabs)/index.tsx`: Home.
- `app/(tabs)/compete.tsx`: Challenges and leaderboard.
- `app/(tabs)/community.tsx`: Community feed.
- `app/(tabs)/profile.tsx`: Profile/settings/journey entry.

Auth routes:

- `app/(auth)/login.tsx`
- `app/(auth)/forgot-password.tsx`
- `app/(auth)/reset-password.tsx`
- `app/auth/callback.tsx`

Important full-screen routes:

- `app/create.tsx`: Create main mission.
- `app/habit/[id].tsx`: Main mission detail.
- `app/mini/index.tsx`: Mini mission hub.
- `app/mini/create.tsx`: Create mini mission.
- `app/mini/[id].tsx`: Mini mission detail/timer.
- `app/live-mini/[id].tsx`: Live mini squad screen.
- `app/challenge/[id].tsx`: Group challenge/cohort screen.
- `app/challenge-memory.tsx`: Specific squad check-in memory/detail page.
- `app/my-journey.tsx`: Own private/public journey.
- `app/community-player/[id].tsx`: Another player's public journey.
- `app/journey-moment/[id].tsx`: Community moment detail.
- `app/notifications.tsx`: In-app notification inbox.
- `app/membership.tsx`: Premium/paywall screen.

Notification routing appears in both:

- `app/_layout.tsx`: remote push response routing.
- `app/notifications.tsx`: in-app notification row routing.

Keep these route mappings aligned.

## Local State Model

Main local state lives in:

- `src/store/habitStore.ts`

Types live in:

- `src/types/habit.ts`

The persisted Zustand store contains:

- `habits`
- `miniMissions`
- `xp`
- `dirtyHabitIds`
- `dirtyMiniMissionIds`
- `pendingDeleteHabitIds`
- `pendingDeleteMiniMissionIds`
- `pendingResetHabitIds`
- `username`

It intentionally does not persist read-only cohort peer habits.

Remote mutation queues:

- `dirtyHabitIds` / `dirtyMiniMissionIds` mean local rows need to be pushed.
- `pendingDeleteHabitIds` / `pendingDeleteMiniMissionIds` mean local deletes must be retried until Supabase confirms them.
- `pendingResetHabitIds` means reset-related remote artifacts must be cleaned up before the reset habit row is pushed again.
- These queues are part of the sync contract. Do not remove an ID from them until the matching remote operation succeeds.

Persistence:

- Uses `createChunkedHabitPersistStorage()` in `src/lib/chunkedHabitPersistStorage.ts`.
- Persist name is `habit-storage`.
- Writes are delayed/chunked to avoid blocking older devices.

Dirty sync:

- Store mutations call `noteLocalStoreMutation()`.
- Changed habit/mini IDs are tracked by reference comparison.
- Deletes and resets are tracked as pending remote operations, not just dirty row updates.
- Remote sync is debounced through `src/lib/syncQueue.ts`.

Important local data types:

- `Habit`
  - Main mission/habit.
  - Can be solo or public.
  - Can be linked to a group challenge via `challengeGroupId`.
  - Has `completedDates`, `streak`, `totalDays`, `status`, `missionReport`.
  - Has `streakMemories` for actual note/photo/check-in details.
  - Has `streakMemoryMarkers` for lightweight remote cohort marker flags.
  - Has `repairedDates` for streak repair.
  - Has reminder settings.

- `StreakMemory`
  - Optional note.
  - Optional local `imageUri`.
  - Optional synced `imageUrl`.
  - Community feed flags.
  - Repair/check-in-only flags.

- `StreakMemoryMarker`
  - Lightweight booleans for cohort dots.
  - Does not contain actual image/note content.
  - Used so group streak rows can show photo/note indicators without loading full memories.

- `MiniMission`
  - Time-boxed mission.
  - Has local timer status, completion memory, optional live squad linkage.

## Sync Architecture

Sync files:

- `src/lib/sync.ts`
- `src/lib/syncQueue.ts`
- `src/components/SyncManager.tsx`
- `src/components/SyncToast.tsx`

High-level flow:

1. Local store mutates.
2. `syncQueue` notes the mutation and schedules a remote push.
3. `pushFullState()` sends local dirty state to Supabase.
4. Pending remote deletes/resets are pushed first through RPCs.
5. Auth hydration pulls remote state and applies remote snapshot.
6. Dirty local changes and pending local deletes are merged into remote data to avoid losing offline changes.

Important sync functions:

- `hydrateStoreAfterAuth()`
- `pullFromSupabase()`
- `pullFocusDeltaFromSupabase()`
- `pushFullState()`
- `upsertRemoteHabit()`
- `deleteRemoteHabit()`
- `resetRemoteHabitArtifacts()`
- `deleteRemoteMiniMission()` (there is no standalone `upsertRemoteMiniMission()` —
  mini missions only get pushed in bulk via `pushFullState()`'s single
  `rpc_sync_dirty_state` call, no per-mini upsert function exists)
- `pullCohortPeerHabitsFromSupabase()`

Performance notes:

- Focus delta RPCs reduce full-state pulls.
- Focus delta payloads can include deleted habit/mini IDs; client filters those from the partial remote snapshot.
- Pending local deletes are also applied to remote snapshots before merge so an offline delete does not reappear after reconnect.
- Remote focus refreshes are coordinated by `src/lib/remoteFocusRefreshCache.ts` and `src/lib/remoteRefreshCoordinator.ts`.
- Memory image uploads happen before pushing memory state when possible.
- `src/lib/accountBackup.ts` saves throttled account snapshots around remote pushes and focus refreshes.

**Gotcha (found 2026-07-23, cost real debugging time — read before adding any new
synced habit/mini field):** `pushFullState()` does not do a plain Supabase
`.upsert()`. It calls the RPC `rpc_sync_dirty_state`, which parses the client's JSON
via `jsonb_to_recordset(payload) as x(id text, title text, ...)` — an **explicit
column list** in the RPC's own SQL. Any field the client sends that isn't named in
that list is silently dropped by `jsonb_to_recordset` — no error, nothing in any log.
A new column can exist on the table, be read/written correctly by every client
function, be fully `tsc`-clean, and still never reach the database, because the RPC
in between never learned about it. When adding a new synced field: update the table,
update `habitFromRow`/`habitToRow` (or the mini-mission equivalents) in `sync.ts`,
**and** add the field to `rpc_sync_dirty_state`'s recordset column list + insert
column list + `on conflict do update set` clause (new migration). Separately check
`rpc_focus_delta_v1` (the read/pull side) — that one uses `to_jsonb(h)` on the whole
row, so it does *not* need a matching update, but don't assume every RPC behaves the
same way; verify each one. See `supabase/migrations/20260723090000_sync_dirty_state_task_checklist.sql`
for the real fix and `docs/CATALOG_ARCHITECTURE.md` §2.5/Phase 2 for the full story.

**Gotcha (found 2026-08-14): a "local-only, never synced" field is still vulnerable
to being silently dropped.** `MiniMission.draftTasks` (in-progress checklist logging,
deliberately never pushed to or pulled from Supabase — see Mini Missions section) was
being lost mid-run on the *same* device intermittently. Root cause: the generic
remote-snapshot-apply logic in `hydrateStoreAfterAuth()`'s `mergeDirtyLocalIntoRemote()`
and `useRemoteStoreRefreshOnFocus.ts`'s `preserveLocalMiniProgress()` both decide
whether to keep a local record's data by checking that record's **dirty flag** —
the same flag used for every synced field on that record. Pushing any *other* field
on the same mini mission (a timer tick, a fuel extend, anything) clears the dirty
flag even though `draftTasks` itself was never included in what got pushed, so the
next remote-snapshot merge silently overwrote it with nothing. Fixed by adding a
dedicated carry-forward check in both functions that preserves `draftTasks`
independent of dirty status whenever the mission is still `in_progress`. **The
general lesson: any future local-only field needs its own explicit
preserve-on-merge check — it cannot piggyback on the dirty-flag mechanism just
because it lives on a synced record.**

## Auth

Auth context:

- `src/context/AuthContext.tsx`

Responsibilities:

- Supabase email/password auth.
- Google OAuth.
- Password recovery state.
- Session persistence and auth listener.
- Store hydration after auth.
- Sign-out cleanup.
- Enabling/disabling remote sync.

Important behavior:

- On sign-out, local habit/challenge store is reset and persisted storage is cleared.
- Cross-account leaks are guarded by sync/hydration logic.
- Password recovery routes are protected from being redirected back to Home.

## Home Screen

File:

- `app/(tabs)/index.tsx`

Purpose:

- Main dashboard.
- Shows user's level/XP, current missions, reports, live minis entry, notification bell, and create actions.

Important behavior:

- Uses `FlashList` for mission cards.
- Mission cards are rendered by `src/components/HabitCard.tsx`.
- Home filters habits based on active segment and mission/report state.
- Home has animated indicators for live minis and available check-ins.
- Home notification bell uses cached unread notification count first, then refreshes from Supabase.
- `HabitCard` currently uses a segmented SVG streak/progress ring (`RingDayArcs`) that creates one `Circle` per mission day. This is useful visually but is a current Android performance suspect for long missions such as 75-day challenges.

Notification count helpers:

- `getCachedUnreadNotificationCount()`
- `countUnreadNotificationsCached()`
- `setCachedUnreadNotificationCount()`
- `adjustCachedUnreadNotificationCount()`

These live in `src/lib/groupChallengesApi.ts`.

Why this exists:

- On older devices, a backend count refresh during Home focus can make animations/touches feel stuck.
- The cached count gives instant UI while the backend remains the source of truth.

## Main Mission Detail

File:

- `app/habit/[id].tsx`

Purpose:

- Shows one main mission's grid, streak memory capture, repair controls, reminders, visibility/community controls, and mission history/moments.

Important related components:

- `src/components/StreakMemorySheet.tsx`
- `src/components/StreakMemoryGallery.tsx`
- `src/components/StreakRepairSheet.tsx`
- `src/components/MissionDetailsSheet.tsx`
- `src/components/StreakProgressCard.tsx` (merged streak-intensity + progress-ring card; replaced the old `StreakBanner.tsx`, which was deleted)
- `src/components/ChecklistDaySheet.tsx` (multi-task checklist missions only — see `docs/CATALOG_ARCHITECTURE.md`)

Important helpers:

- `src/utils/missionDaySlots.ts`
- `src/utils/habitMissionWindow.ts`
- `src/utils/habitDerived.ts`
- `src/utils/streakRepairEligibility.ts`
- `src/lib/streakMemoryStorage.ts`
- `src/lib/communityWinsApi.ts`

Memory behavior:

- Completing a day can attach a memory note/photo or a check-in-only marker.
- Public/community memories can become `community_wins`.
- Image uploads are coordinated during sync.
- Saved moments render above the Active Trail/grid through `src/components/StreakMemoryGallery.tsx`.
- Missions with a non-empty `habit.taskChecklist` use a separate, opt-in path: tapping
  a day opens `ChecklistDaySheet` instead of the classic `StreakMemorySheet`, each
  task logs into `streak_memories[date].tasks` (not the flat `note`/`imageUrl`
  fields), and the day completes on the *first* task logged, not when every task is
  done. Every mission without a checklist is completely unaffected — see
  `docs/CATALOG_ARCHITECTURE.md` for the full design and phased rollout status.
- The moment gallery is a two-row wide rounded hex/honeycomb strip. It uses horizontal `FlashList` columns so only nearby SVG/image tiles mount.
- Each honeycomb tile may use SVG clipping (`ClipPath` + `SvgImage`) and storage thumbnails. This is visually heavier on Android than ordinary rectangular `Image` cards, so keep virtualization and batching intact.
- The gallery uses React Native's built-in `Animated` API for its subtle build-in animation. Avoid importing `react-native-reanimated` into this component for Expo Go testing unless Worklets native and JS versions match.
- The moment viewer modal is aspect-aware and presents photo plus note/meta as one card. It should avoid letterbox/black-bar presentation for normal memories.

Mission detail performance behavior:

- Long missions use staged marker rendering with `INITIAL_GRID_RENDER_DAYS`, `GRID_RENDER_BATCH_DAYS`, and `visibleGridDayCount`.
- Active Trail must also respect marker staging through `visibleActiveTrailDays`; do not render every reached marker immediately on long missions.
- Moments should be allowed to render after `detailHeavyContentReady`. They should not wait for `visibleGridDayCount >= totalDays`.
- Decorative animations in this path should use `isInteraction: false` when they are not part of a tap/gesture. This keeps `InteractionManager.runAfterInteractions()` from being delayed, especially on Android.
- `optimizeGridScrollForLongGrid` is intentionally platform-neutral for long marker lists.
- The old mission detail `QuoteCard` was removed; Daily Wisdom is now a launch-splash experience.

## Mini Missions

Routes:

- `app/mini/index.tsx`
- `app/mini/create.tsx`
- `app/mini/[id].tsx`

Purpose:

- Create and complete time-boxed mini missions.
- Timer can be started immediately or scheduled.
- Finish rule can be manual or solo Timer Check-In. Missing/old `completionMode` values default to manual.
- Manual Finish minis can add reserve fuel/extended minutes. Timer Check-In minis hide reserve fuel and run to their planned timer.
- Completion can include memory/photo.
- Completion can publish to Community if visibility is public.
- Timer expiry is derived while the row remains `in_progress`. Manual minis show as failed after zero. Solo Timer Check-In minis show as needing review/check-in after zero.
- If the user explicitly chooses `Fail` from a Timer Check-In review, the mini persists `status === "missed"` and moves into the failed/missed bucket. `Retry` restarts it with a fresh timer.
- Live Mini Squads remain race/manual-timer semantics for now; expired live minis sync as missed.

Important helpers:

- `src/utils/miniMissionTime.ts`
- `src/constants/miniMission.ts`
- `src/constants/miniMissionKeepAwake.ts`
- `src/utils/miniMissionNotifications.ts`
- `src/components/SplitFlapTimeDisplay.tsx`
- `src/components/MiniMissionFlightCountdown.tsx`
- `src/components/MiniMissionFireProgressBar.tsx`

Local notification reconciliation:

- `app/_layout.tsx` watches mini mission store changes and calls `syncMiniMissionNotifications()`.

## Live Mini Squads

Routes and APIs:

- `app/live-mini/[id].tsx`
- `src/lib/liveMiniMissionsApi.ts`
- `src/types/liveMiniMission.ts`

Purpose:

- Allows users to do mini missions with others asynchronously.
- A creator can create a live mini squad and invite others.
- Invitees can accept/decline.
- Participants have statuses such as invited, joined, in_progress, completed, missed.
- Invite expiry is part of the participant model and should be respected in UI and RPC handling.
- Local mini mission state is synced to the live board through `syncLiveMiniFromLocalMission()`.
- `LiveMiniInviteSheet` uses a keyboard-aware scroll container so iPhone username search/results stay above the keyboard.
- Live Mini board cards use Supabase render thumbnails for inline memory images while preserving full-size tap-to-view.
- **A peer's `in_progress` status is not trustworthy on its own (fixed 2026-08-14).**
  The DB row only flips to `"missed"` when the mission owner's own device pushes
  that update via a one-shot `setTimeout` scheduled for the exact deadline moment
  (`app/mini/[id].tsx`) — if that device is backgrounded/killed right then, the row
  stays `"in_progress"` forever from every other participant's point of view, with
  elapsed time counting up unbounded on their screens. `app/live-mini/[id].tsx` now
  derives the effective status locally via `effectiveParticipantStatus()` (compares
  `deadline_at` against a live-ticking `now`) instead of trusting the raw `status`
  column for display, and calls the previously-unused `refreshLiveMiniMissed()` →
  `rpc_refresh_live_mini_missed` on every board load so the DB row self-heals too.

Backend:

- Uses RPCs such as `rpc_create_live_mini_squad_v2`, `rpc_accept_live_mini_invite_v2`, `rpc_sync_live_mini_progress`, and `rpc_live_mini_snapshot_v1`.
- Snapshot caching exists in `liveMiniMissionsApi.ts`.
- Realtime subscription helper exists for live mini squads.

## Compete Screen

File:

- `app/(tabs)/compete.tsx`

Segments:

- `Challenges`
- `Leaderboard`

Challenges sub-tabs:

- Group missions.
- Invites.

Leaderboard:

- Weekly ranks from `src/lib/weeklyLeaderboardApi.ts`.
- Search by username uses `searchWeeklyLeaderboard()`.
- Rows navigate to public player journey.

Invites:

- Mixes group challenge invites and live mini invites.
- Uses paginated loading and load-more.
- Reconciles accepted live minis with local mini mission state.

Performance notes:

- Uses conditional Zustand selection so local habits/minis are only read heavily when needed.
- Uses in-flight guards for invite loading and leaderboard loading.

## Group Challenges / Cohorts

Main screen:

- `app/challenge/[id].tsx`

Related components:

- `src/components/CohortPeerStreakDots.tsx`
- `src/components/CohortNudgeChips.tsx`
- `src/components/CohortMasthead.tsx`
- `src/components/CohortLeaderHero.tsx`
- `src/components/SquadActivitySection.tsx`
- `src/components/CustomNudgeModal.tsx`

API:

- `src/lib/groupChallengesApi.ts`
- `src/lib/challengeCohort.ts`
- `src/lib/streakRepairApi.ts`

Tabs:

- `streaks`
- `activity`
- `repairs`

Streaks tab:

- Loads initial member cards first.
- Load More adds more members.
- Members are sorted descending by rank/streak logic.
- Dots use lightweight memory markers initially.
- Actual memory content is fetched only when tapping a dot.
- For community/image memory details, `challenge-memory.tsx` is used.
- Participant dots render newest/current-first and omit future/unreached dots so users do not scroll to the far end to see the latest state.

Activity tab:

- Shows milestone accordion.
- Shows recent nudges/activity.
- Supports congrats action.
- Nudge rows include day context (`target_date_str` and `target_mission_day`) when available.

Repairs tab:

- Shows streak repair requests and statuses.
- Supports paginated loading.
- Uses Supabase Realtime and local update logic for applied repairs.

Important backend/RPC surface:

- `rpc_challenge_snapshot_v1`
- `rpc_challenge_streak_members_page_v1`
- `rpc_challenge_activity_page_v1`
- `rpc_challenge_pending_repairs_v1`
- `rpc_request_streak_repair`
- `rpc_vote_streak_repair`
- `rpc_send_challenge_nudge_v2`
- `rpc_send_challenge_custom_nudge`
- `rpc_leave_challenge`
- `rpc_challenge_memory_detail_v1` style memory detail RPCs from migrations.

Group challenge caution:

- Do not load full peer memories into list rows.
- Use marker booleans for dots and fetch real memory only on tap.
- Activity and repairs are tab-specific and should not block initial streaks rendering.
- Notification deep links may open directly to `activity` or `repairs`; ensure tab-specific loaders run even when not visiting `streaks` first.
- Leaving a challenge or deleting a group-linked habit is lifecycle-sensitive. Use the backend RPC path so membership rows, habit rows, activity, nudges, memory comments/likes, and repairs stay consistent.

## Challenge Memory Detail

File:

- `app/challenge-memory.tsx`

Purpose:

- Dedicated detail page for a squad member's check-in/memory.
- Handles photo, note, check-in-only, community badge, like pill, squad actions, open squad button.
- Marks a notification read when entered from a notification.

Important helpers:

- `src/lib/challengeMemoryDetail.ts`
- `src/lib/challengeCohort.ts`
- `src/lib/communityWinsApi.ts`

Fallback behavior:

- If no memory data exists, show check-in-only.
- If viewer is not a member or detail cannot resolve, show unavailable state.
- Be careful with habit IDs/user IDs/date IDs; remote markers and actual details must match.

Catalog feature status: this screen **does** show multi-task catalogs now (a
`MemoryPhotoCarousel` fed by `galleryImages` derived from `detail.tasks`) — this was
done as of `docs/CATALOG_ARCHITECTURE.md` §9. It reads `streak_memories[date]`
through its own dedicated fetch (`challengeMemoryDetail.ts`), separate from
`communityWinsApi.ts` / `community_wins` entirely, so it needed its own gallery
wiring rather than automatically inheriting the main Community feed's carousel work.

## Community Feed

Screen:

- `app/(tabs)/community.tsx`

Main component:

- `src/components/CommunityWinsFeed.tsx`

API:

- `src/lib/communityWinsApi.ts`

Purpose:

- Public feed of mini completions and public habit streak memories.
- Supports pagination.
- Supports likes/cheers.
- Supports opening detail moments and public player journeys.
- Multi-task catalog posts (`memory_gallery` on the `community_wins` row) render as
  an inline swipeable carousel (`PhotoCarousel`, defined inside
  `CommunityWinFeedPost.tsx`) with a dot indicator and a per-slide task-name/note
  caption, instead of a single static photo. Single-photo posts — everything that
  predates this feature — are completely unaffected; they never reach that code path.
  Tapping still opens `CommunityWinImageLightbox` full-screen, now gallery-capable
  and landing on the exact photo swiped to. Its prop shape has since changed again
  from the original `images: string[]` to `slides: CommunityLightboxSlide[]` (each
  slide carries its own caption/note, not just a URL) — check the component's
  actual type definition before assuming either shape. `my-journey.tsx` and
  `community-player/[id].tsx` were upgraded to this gallery-capable lightbox too
  (each has its own gallery-slide builder — `journeySlidesForPost()` /
  `gallerySlidesForPost()`); this is done, not deferred.

Important tables:

- `community_wins`
- `community_win_cheers`
- `profiles`

Important helpers:

- `postCommunityWin()`
- `deleteCommunityWin()`
- `fetchCommunityWinsFeedPage()`
- `fetchCommunityWinMoment()`
- `toggleCheer()`
- `listCommunityWinCheerers()`

## Journey Screens

Own journey:

- `app/my-journey.tsx`

Public player journey:

- `app/community-player/[id].tsx`

Moment detail:

- `app/journey-moment/[id].tsx`

Purpose:

- Show mission and mini history as a "journey".
- Own journey can toggle private/public mode.
- Public journey shows only community/public posts.
- Player journey records journey views when someone else opens it.
- Journey view count is shown near level/league as plain "N views" styling.

Important APIs:

- `fetchCommunityPlayerProfile()`
- `fetchCommunityPlayerStory()`
- `fetchCommunityPlayerStoryPage()`
- `fetchCommunityPlayerMissionJourneyPage()`
- `recordCommunityJourneyView()`
- View count is not a standalone fetch — it's bundled inside
  `fetchCommunityPlayerProfile()`'s return value (`journeyViewsCount`), backed by
  an internal (non-exported) `countCommunityJourneyViews()` helper calling
  `rpc_community_journey_view_count_v1`.

Important UI logic:

- Missions and minis have responsive grid counts.
- Minis should use the same responsive grid philosophy as missions.
- Public journey views should not count self-views.
- Repeated views by another user are allowed.

## Notifications

Files:

- `app/notifications.tsx`
- `src/lib/notificationPayloads.ts`
- `src/utils/notifications.ts`
- `src/lib/pushTokens.ts`
- `supabase/functions/notify-push/index.ts`

Notification sources:

- Supabase `notifications` table.
- RPC `rpc_insert_notification`.
- Push Edge Function sends remote pushes.
- Expo notification response routing handled by `app/_layout.tsx`.

Notification types currently handled include:

- `challenge_invite`
- `challenge_invite_accepted`
- `challenge_invite_declined`
- `challenge_nudge`
- `challenge_squad_checkin`
- `streak_repair_request`
- `streak_repair_result`
- `community_win_cheer`
- `live_mini_invite`
- `live_mini_accepted`
- `live_mini_declined`
- `live_mini_completed`
- `streak_window_reminder`

Unread count:

- Home uses cached unread count for instant display.
- Backend remains source of truth.
- Reading one notification decrements cached count if available.
- Mark-all-read sets cached count to zero and rolls back on failure.

Keep in-app notification routing and remote push routing aligned.

**Visual design (as of 2026-08-14):** each row shows a small tone-tinted icon badge
instead of coloring the whole subtitle. `notificationVisual(n)` maps `type` (and
`challenge_nudge`'s `kind`/`streak_window_reminder`'s `reminder_phase`) to an
`{ Icon, tone }` pair; `notificationToneColors(tone, theme, isDark)` resolves the
tone (`"positive" | "urgent" | "social" | "muted"`) to a fixed, deliberately small
palette (green/amber/indigo/gray). Subtitle text itself is plain `textSecondary` —
color lives only in the badge. When adding a new notification `type`, add a case to
`notificationVisual()` or it silently falls back to a generic `Bell`/`"social"`.

## Streak Repairs

Files:

- `src/lib/streakRepairApi.ts`
- `src/components/StreakRepairSheet.tsx`
- `app/challenge/[id].tsx`
- Realtime handler in `app/_layout.tsx`

Purpose:

- User can request a repair for a missed streak day.
- Squad members vote.
- When enough approvals are reached, repair may be applied.
- Some repairs may be declined depending on backend status and edge cases.

Important concepts:

- Status can be pending/applied/declined.
- Approval count alone is not the only display condition; backend `status` determines final wording.
- Repaired dates merge into local habit state and streak memory.
- Squad repairs deduct XP when applied through Realtime.
- Solo repairs update locally in the sheet to avoid double XP deduction.

## Premium / Billing

Files:

- `src/context/BillingContext.tsx`
- `src/context/PremiumContext.tsx`
- `src/context/PlusUpsellContext.tsx`
- `src/lib/communityAccessApi.ts`
- `src/hooks/useRefreshPremiumAccess.ts`
- `src/constants/revenueCat.ts`
- `app/membership.tsx`
- `supabase/functions/revenuecat-webhook/index.ts`

Billing provider:

- Configures RevenueCat when native keys are available.
- Handles Expo Go as unavailable/browser-like mode.
- Loads RevenueCat offerings/products and exposes localized store price strings.
- Provides purchase, restore, diagnostics, subscription management link.

Premium provider:

- Combines backend effective Community access and local RevenueCat entitlement state.
- Backend effective access can come from paid/admin access or an active backend trial grant.
- Local RevenueCat entitlement still grants immediate in-device access while the webhook/backend state catches up.
- Subscribes to `profiles` and `community_access_grants` changes for the current user and refreshes access.
- Entitlement ID: `habitpro_community`.

Community trial/access model:

- `community_access_config` stores global access config such as `trial_enabled` and `trial_days`.
- `community_access_grants` stores per-user grants such as one-time trials or promo access.
- `rpc_get_community_access_status()` returns effective access, trial availability, trial days, trial expiry, and source.
- `rpc_start_community_trial()` starts a backend-controlled no-payment trial exactly once per user when enabled.
- `profile_is_premium(uid)` is the effective server gate. It should return true for paid/admin access or active Community grants.
- The app should not hardcode trial length. The upsell uses `accessStatus.trialDays` from Supabase.
- Paid plan price strings come from RevenueCat/store products, not static app copy.

Upsell/paywall:

- `PlusUpsellProvider` owns the compact HabitPro Community upsell modal.
- The modal can start the backend trial, purchase yearly/monthly RevenueCat packages, restore purchases, and show dev-only billing diagnostics.
- Purchase UX has explicit phases such as opening store, restoring, and applying membership/subscription.
- Community-gated screens call `openUpsell(reason)` instead of surfacing raw RLS or premium errors.

Important constraints:

- RevenueCat keys must be present for real purchases in builds.
- EAS build must include correct Play Store SDK key, not a test key.
- Production OTA must use EAS `--environment production` so the same correct RevenueCat key is embedded in updates.
- Supabase migrations include premium sync and premium social RLS.
- Backend trial config changes are database-only; plan pricing comes from RevenueCat/Play/App Store configuration.

## App Version / Force Update

Files:

- `src/context/AppVersionContext.tsx`
- `src/lib/appVersionPolicyApi.ts`
- `src/lib/appVersionMeta.ts`
- `src/components/ForceUpdateModal.tsx`
- `src/components/OtaUpdateManager.tsx`

Purpose:

- Fetch app version policy/releases from Supabase.
- Compare runtime version/build.
- Show force update modal when needed.
- Coordinate with OTA update checks so a required native update is not masked by an OTA refresh.

## Internet Required Gate

Files:

- `src/components/NetworkRequiredGate.tsx`
- `app/_layout.tsx`

Purpose:

- Block app usage when internet is unavailable.
- Prevent stale/offline interactions from competing with Supabase sync, billing, squads, version policy, and updates.
- Keep the UI recoverable through a manual `Try Again` NetInfo refresh.

## Push And Local Notifications

Remote push:

- `src/lib/pushTokens.ts`
- `src/utils/notifications.ts`
- `supabase/functions/notify-push/index.ts`

Local reminders:

- `src/utils/miniMissionNotifications.ts`
- `supabase/functions/process-streak-reminders/index.ts`

Important notes:

- Expo Go intentionally skips some notification module behavior.
- FCM requires `google-services.json` for Android EAS builds.
- Push token registration uses Supabase RPC.
- Streak reminders depend on timezone and reminder settings.

## Backend / Supabase

Migrations:

- `supabase/migrations/`

Edge Functions:

- `supabase/functions/notify-push/index.ts`
- `supabase/functions/process-streak-reminders/index.ts`
- `supabase/functions/revenuecat-webhook/index.ts`

Important table families:

- `profiles`
- `habits`
- `mini_missions`
- `challenge_groups`
- `challenge_members`
- `challenge_invites`
- `challenge_nudges`
- `challenge_activity`
- `challenge_memory_comments`
- `challenge_memory_likes`
- `streak_repairs`
- `streak_repair_votes`
- `notifications`
- `community_wins`
- `community_win_cheers`
- `community_access_config`
- `community_access_grants`
- `live_mini_squads`
- `live_mini_participants`
- `push_tokens`
- app version policy/release tables

Important backend design points:

- RLS is active and many reads require RPCs to avoid recursion or visibility problems.
- Several migrations exist purely for performance indexes and RPC grants.
- Do not assume direct table reads are equivalent to existing RPCs.
- Keep migrations additive and named with timestamp prefix.
- When changing payload shape, update both insertion RPC/client parsing and notification routing.
- Destructive lifecycle operations should go through RPCs, not direct client deletes, so related community wins, repairs, challenge membership/activity, and social artifacts are cleaned consistently.

## Performance Patterns Already Used

Several flows were optimized for older phones:

- Use lightweight markers instead of full memory payloads in cohort streak dots.
- Paginate group streak members.
- Load initial few items first, then explicit Load More.
- Use `InteractionManager.runAfterInteractions()` to defer non-critical work.
- Add in-flight guards to prevent duplicate requests.
- Use module-level caches for recently fetched pages/snapshots.
- Avoid setting React state when the value did not change.
- Use `FlashList` for larger lists.
- Keep expensive store selections conditional on visible tab/segment.
- Use skeletons/shimmers for perceived speed.
- Use native-driver animations where possible.
- Mark decorative/looping animations with `isInteraction: false` when they should not delay `InteractionManager` work.
- For mission detail, preserve staged marker rendering and virtualized honeycomb moments; Android navigation can regress if all markers or all SVG image tiles mount at once.

Current Android performance status:

- Prior Android logs isolated expensive sync/date-map and mission-detail memory/day lookup paths.
- Fixes now include Android long-mission Home ring fallback, fast mission date maps, Active Trail batching, and virtualized honeycomb moments.
- Temporary `console.log` / `console.info` instrumentation has been removed for production readiness.
- For future time/performance work, use `.codex/skills/habitpro-performance-investigation/SKILL.md`: add targeted timer logs, measure, fix, re-measure, then remove logs.

Important performance files:

- `src/lib/perfTrace.ts`
- `src/lib/jsThreadProbe.ts`
- `src/lib/remoteFocusRefreshCache.ts`
- `src/lib/remoteRefreshCoordinator.ts`

## Styling And UI System

Theme:

- `src/styles/theme.ts`
- `src/context/ThemeContext.tsx`

Common components:

- `src/components/Screen.tsx`
- `src/components/Button.tsx`
- `src/components/AppText.tsx`
- `src/components/ProgressRing.tsx`
- `src/components/LevelXpRing.tsx`
- `src/components/ShimmerBlock.tsx`
- `src/components/ConfirmDialog.tsx`
- `src/components/OperationProgressDialog.tsx`
- `src/components/SettingsModal.tsx`
- `src/components/OtaUpdateManager.tsx`

General UI conventions in this app:

- Rounded cards with subtle borders/shadows.
- Indigo/cyan/amber accent colors.
- Gradient primary actions in key flows.
- Compact pills for metadata such as XP, approvals, rank, level.
- Lucide icons for actions.
- Avoid huge decorative UI in operational screens.

Color token discipline (as of 2026-07-31):

- Every color goes through `src/styles/theme.ts` — an existing token
  (`theme.colors.indigo[500]`, `theme.colors.green[600]`, etc.) plus
  `withAlpha(hex, alphaPercent)` for any tinted/translucent variant. Never
  hand-type `isDark ? "rgba(...)" : "rgba(...)"` — a repo-wide sweep found
  ~289 of these, several silently off-palette (stock Tailwind hex instead of
  this app's actual token), fixed across commits `9226085`, `0783dfe`,
  `1a1df99`, `587461d`. A handful of genuinely one-off colors (not repeated
  anywhere else) were deliberately left as hand-typed literals rather than
  forced into a token that would only ever have one caller.
- Two color tokens exist for jobs that aren't a brand-hue tint:
  `theme.colors.scrim` (modal/sheet backdrop dimming — always a dark tint
  regardless of app theme) and `theme.colors.sheen` (the glass-highlight
  flip — white in dark mode, dark ink in light mode).
- `green`/`red`/`amber` each gained a `900` step (2026-08-06): a deliberately
  dulled/muted shade of the same hue for contexts that want the semantic
  meaning (streak broken, day repaired, notable streak) without reading as
  a bright alert next to an otherwise-neutral card — `red[900]` #6B1E1E and
  `amber[900]` #6B4413 are the same value in both light and dark. `green[900]`
  is the **exception**: it started that way (#1B4332 both themes) but the
  same near-black value read as too heavy against a white background, so
  light mode got its own lighter step (#2D6A4F, 2026-08-06) — dark mode kept
  #1B4332. **Don't assume a `900` token is theme-invariant just because
  most of them are** — check `theme.ts` directly. (A 2026-08-08 session
  experiment tried swapping `green[900]` for the brighter `green[500]` in
  one specific component — the habit-detail/cohort day-grid's completed
  circle, light mode only — rather than changing the shared token; that
  stayed local to those call sites, `green[900]` itself is unchanged since
  08-06.) This is the first `900` step added to the palette; only these
  three hues have one so far. If a future ask wants "the dull/muted version
  of X," reach for a `900` step on that hue first — add one the same way if
  it doesn't exist yet, rather than hand-picking a fresh hex.
- `GlassTopHighlight.tsx` (the shared glass-sheen top highlight) renders
  **nothing in light mode** — a first attempt at a light-mode tint (a
  slate-colored version of the same gradient) read as a flat gray smudge
  across the top of a white card, rejected on sight. Dark mode is
  unchanged. All 6 previously-duplicated inline copies of this gradient
  (`HabitCard.tsx`, `StreakProgressCard.tsx`, `Timer.tsx`, Home ×2, habit
  detail's mission controls card) now render through this one component.
- A component that takes `isDark` as a **prop** instead of calling
  `useTheme()` itself has no `theme` object in scope by default — found
  this exact bug (a hardcoded color masking a reference to `theme.colors.*`
  that would otherwise crash) in `ShimmerBlock.tsx`,
  `src/components/fuel/FuelQuickMinutesStrip.tsx`, and
  `src/components/fuel/FuelTimePresetButton.tsx`. Fix: import
  `darkTheme`/`lightTheme` directly from `theme.ts`, select per the `isDark`
  prop — don't assume a hook call exists just because the file imports
  `useTheme`'s type or a sibling component calls it. A related but distinct
  bug in the same sweep: `FocusMissionControlModal` (`app/mini/[id].tsx`)
  *does* call `useTheme()`, but only ever destructured `{ isDark }` from it,
  never `theme` — so `theme.colors.*` references there would still crash
  despite the hook call being present. Fix was just adding `theme` to the
  destructure. Moral either way: don't assume `theme` is in scope just
  because `isDark` clearly is — check what's actually destructured.
- `AppDialogContext.tsx`'s shared `showAppAlert` supports a `"neutral"`
  button style (2026-08-08) — same quiet bordered look as `"cancel"`, plus
  an optional `icon` slot on `AppDialogButton` — for dialogs where every
  option should read as an equal-weight choice (e.g. a photo-source
  picker) rather than one filled primary CTA. Purely additive: existing
  callers that don't set either field are unaffected. Reach for this
  before hand-rolling a bespoke dialog when the ask is "make this alert's
  buttons quieter/equal-weight."
- `CohortStreakPill` (`src/components/CohortStreakPill.tsx`, 2026-08-08) is
  a small shared building block — colorless filled flame icon immediately
  followed by "Xd", no pill/border/background — for showing a streak count
  inline anywhere in the app. Used in the cohort screen (leader card +
  participant rows) and the Community feed's post header. Check both
  families of call sites before changing its shape/props.

### Theme Packs (on `main`; Minimalist-only as of 2026-08-12)

A second, orthogonal preference alongside light/dark/system:
`themePack: 'classic' | 'minimalist'` (`src/context/ThemeContext.tsx`).
**As of 2026-08-12, Minimalist is hardcoded as the only reachable pack** —
`ThemeContext`'s default is `'minimalist'` and it deliberately does not
restore any pack previously saved to AsyncStorage (`@habitpro_theme_pack`,
still read/written by the untouched `setThemePack`/storage plumbing, just
never called from any UI), and the Classic/Minimalist picker was removed
from `SettingsModal`'s "APPEARANCE" section entirely. Classic's theme
objects and all the `themePack === 'minimalist'` branches below are still
in the codebase, just permanently unreachable — nothing was deleted, so a
picker could be reintroduced later without rebuilding anything (check with
the user first). `useTheme()` resolves one of four full `AppTheme` objects
based on `(themePack, isDark)`: `darkTheme`/`lightTheme` (Classic, the
original palette, unchanged) or `minimalistDarkTheme`/`minimalistLightTheme`
(`src/styles/theme.ts`).

- **Minimalist pack**: warm neutral ground (not cool slate-blue), a single
  accent (`#5B5BD6`) instead of the classic indigo ramp, flat bordered
  cards (shadow set to zero opacity/elevation — `GlassTopHighlight` renders
  nothing for this pack, same as its existing light-mode no-op), Manrope
  (display) + DM Sans (body) instead of Plus Jakarta Sans. Semantic colors
  (cyan/amber/yellow/red/green) are unchanged from the matching Classic
  palette.
- **Why this scales with almost no per-screen work**: `AppText`'s `Text`
  component resolves `fontWeight` -> font file via `theme.fontFamily` (from
  `useTheme()`) at render time instead of a static import — every screen's
  text switches families automatically when the pack changes. Any screen
  already reading `theme.colors.*`/`theme.shadow.*` (the large majority of
  the app) inherits the new palette/flat-shadow for free the same way.
- **Extra hand-authored flourishes, not automatic**: Home (`index.tsx`),
  Compete (`compete.tsx`), and `HabitCard.tsx` each derive a local `rp`
  value (`themePack === 'minimalist' ? redesignPalette.dark/light : null`,
  from the new `src/styles/redesignPalette.ts`) for things the automatic
  token swap doesn't reach — recolored streak-ring track, tab-tray
  backgrounds, chip fills, etc. `HabitCard` takes an optional
  `redesignPalette` prop for the same purpose, passed non-null only by Home
  when the pack is minimalist.
- **Sliding tab indicator**: introduced alongside the theme pack (though
  independent of it — applies in Classic too). Every segmented control in
  the app (Home's Main Missions/Reports, Compete's Challenges/Leaderboard,
  Challenge detail's Streaks/Activity/Repairs, Mini Missions'
  Active/Queued/Completed/Failed, the Missions/Minis + Public/Private
  controls shared by `community-player/[id].tsx`/`my-journey.tsx`) now
  animates an `Animated.spring`-driven indicator behind the tabs instead of
  swapping each tab's background instantly. Each instance measures its own
  track width via `onLayout` and respects `reduceMotion`.
- **`HabitCard.tsx`'s streak badge**: the old fire-icon streak ring
  (`RingDayArcs`/`LightweightMissionRing`, SVG arcs) was replaced by
  `MiniDayGrid` — a small top-right badge, one circle per mission day
  (GitHub-contributions style), the day open for check-in blinking red, a
  repair-eligible day showing a muted hammer icon instead of a colored
  circle. `RingDayArcs`/`LightweightMissionRing` are still defined in the
  file but are now dead code (nothing calls them) — safe to delete next
  time that file is touched.
- **Habit detail day grid** (`app/habit/[id].tsx`): the old
  `HabitGridBrandRing` (multi-arc SVG ring + milestone star + generic
  ambiguous "has a memory" dot) was replaced by `CompletedDayDot` — plain
  circle + day number, with a small camera/message-square corner badge only
  when that day has a photo/text memory, mirroring the cohort screen's own
  per-day dot design (`CohortPeerStreakDots`) rather than inventing new
  glyphs. Every grid cell (locked/current/completed/plain) is now circular,
  not a rounded square. Milestone/repaired-day-specific treatment is
  deferred, not dropped — the user has separate plans for that.
- **Not visually confirmed on-device**: most of this pass was verified by
  `npx tsc --noEmit` plus whatever screen happened to already be open in
  the simulator — the session's environment had no tap-automation
  available. See `docs/CURRENT_WORK.md`'s 2026-08-04 entry for the specific
  list of what still needs a manual look before this is considered
  production-ready or merged into `main`.

## Important User Flows

### Create A Main Mission

1. User opens Home.
2. Taps create.
3. `app/create.tsx` creates a local `Habit` through `useHabitStore.addHabit()`.
4. Store persists locally and schedules sync.
5. If public/group flow is used, challenge metadata may be attached later.

### Complete A Main Mission Day

1. User opens `app/habit/[id].tsx` or taps current-day marker.
2. Eligibility is computed by mission day/window helpers.
3. User can save note/photo/check-in-only.
4. Store updates `completedDates`, `streakMemories`, XP.
5. Sync uploads memory images and pushes state.
6. Optional community publish creates/updates `community_wins`.

### View Group Streaks

1. Home/Compete navigates to `app/challenge/[id].tsx`.
2. Primary challenge snapshot loads.
3. Initial member rows load.
4. Streak dots show marker flags only.
5. Tapping a dot fetches detail and may navigate/show memory detail.
6. Activity/repairs load only when needed or when tab is deep-linked.

### Send Squad Nudge

1. User taps squad action from cohort card/detail.
2. Preset nudges go through `sendChallengeNudge()`.
3. Custom note goes through `sendChallengeCustomNudge()`.
4. Backend records nudge and inserts notification.
5. Activity tab can show the nudge with day context.

### Streak Repair

1. User opens repair UI.
2. Client checks repair eligibility.
3. Request is created via RPC.
4. Squad votes via RPC.
5. Backend applies/declines.
6. Client updates via reload/Realtimes and local repair merge.

### Community Like

1. User taps like/cheer on community feed or moment.
2. `toggleCheer()` inserts/deletes `community_win_cheers`.
3. Backend may insert notification.
4. Owner can open liked moment from notification.

### Public Journey View

1. User B opens User A's public journey.
2. `recordCommunityJourneyView()` is called when not self.
3. Repeated views are allowed.
4. View count is displayed beside league/level as plain gray "N views".

## Known Caution Points

- Do not commit unless explicitly asked.
- Do not reset/revert unrelated local changes.
- Treat Supabase migrations and RPCs as part of the app contract.
- `rpc_sync_dirty_state` (the habit/mini push RPC) parses an explicit column list via `jsonb_to_recordset` — a new synced field needs a migration to add it there too, or it's silently dropped with no error. See the Sync Architecture section above.
- Notification routes exist in two places and must stay aligned.
- **On Android, `KeyboardAvoidingView behavior="height"` inside a `<Modal>` can visibly jitter/flicker as the keyboard dismisses.** Android reports the keyboard's frame in several rapid steps during the dismiss animation; `"height"` mode resizes the component's actual `height` style on every one of those steps, forcing a full re-layout each time. `behavior="padding"` (animating `paddingBottom` instead) is far cheaper and doesn't thrash layout the same way. Found 2026-08-14 in `GroupChallengeSheet.tsx`/`LiveMiniInviteSheet.tsx` (both `<Modal>`-based invite-search sheets that had switched Android from no `behavior` at all to `"height"` on 2026-08-12 to fix the keyboard covering the search input — that fix was correct in principle but picked the wrong mode). Fixed by switching both to `behavior="padding"` on both platforms with `keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 12}`, matching `CustomNudgeModal.tsx`'s already-shipped, stable pattern for the same `<Modal>` + `KeyboardAvoidingView` structure. Default to `"padding"` over `"height"` for any new Modal-hosted keyboard-avoiding view in this app.
- Cohort dot markers are intentionally lightweight; do not reintroduce full memory payload loading into member list rows.
- Repairs can show declined even with enough approvals if backend `status` is declined; display must follow backend state.
- Auth/sign-out cleanup is security-sensitive.
- Store persistence/sync is performance-sensitive on older devices.
- Billing code must handle Expo Go, missing keys, user cancellation, and store diagnostics.
- Community access checks mean "premium" is effective access: paid/admin access, active backend trial/grant, or immediate local RevenueCat entitlement.
- Trial duration and trial enablement are Supabase config; price strings are RevenueCat/store data.
- App version gating should never trap password recovery/auth routes incorrectly.
- OTA updates must match the installed binary runtime version; native/config changes require a new build.
- Realtime subscriptions should use unique channel names where needed and be removed on cleanup.
- Pending delete/reset queues are intentional sync state. Do not clear them until the matching remote operation succeeds.
- **iOS cannot reliably present a second native `<Modal>` while one is already open** — it silently fails (no crash, no error, the second modal just never appears); Android's Dialog-backed `Modal` tolerates it, which is why this class of bug is always reported as "works on Android, not on iOS." This is not just about `openUpsell`/the paywall (the original fix, 8 files/12 call sites — see `docs/WORK_HISTORY.md` 2026-07-22): `showAppAlert` (`src/context/AppDialogContext.tsx`) also renders through a real `<Modal>`, not a native OS alert as the name might suggest, so calling `showAppAlert(...)` from inside a handler while any sheet/modal is still open hits the exact same bug. Found and fixed twice more on 2026-07-23 (catalog "Remove from Community," and a latent pre-existing bug in the classic single-memory revoke flow, `handleHabitMemoryCommunityChange` in `app/habit/[id].tsx`) — both fixed the same way: close the enclosing Modal immediately before calling `showAppAlert`/`openUpsell`, capture what was open so it can be reopened afterward if appropriate. **Known still-open instance, not yet fixed**: `handleMemoryCommit` in `app/habit/[id].tsx` (starting at line 938 — line-number citations in this doc drift as the file grows, verify with a fresh grep before trusting an exact range) calls `showAppAlert` for several publish-time validation errors while `StreakMemorySheet`'s Modal is still open (it only auto-closes after `onCommit` resolves) — structurally trickier to fix than the others since closing the sheet early, mid-async-operation, could look premature; needs its own careful pass. When adding any new confirm/error dialog inside a sheet: default to assuming this bug applies and close-before-open, don't assume `showAppAlert` is safe just because it isn't literally named `Modal`.

Also not limited to `showAppAlert`/`openUpsell` — any two full-screen `<Modal>`s stacking has the same problem. Found (and fixed) a third and fourth instance on 2026-07-23 in `app/my-journey.tsx` and `app/community-player/[id].tsx`: each has a `MissionGalleryModal` (a full-screen photo-gallery `<Modal>`) that opened `CommunityWinImageLightbox` (another `<Modal>`) on top of itself when a photo tile inside it was tapped. Fixed identically in both files with a `missionBeforeLightboxRef` + unified `openLightbox`/`closeLightbox` handler pair: opening the lightbox closes `MissionGalleryModal` first (remembering which mission story was open), closing the lightbox reopens it.

- **A horizontal swipe carousel that gates rendering behind an `onLayout`-measured width, starting from `useState(0)`, can render nothing at all, forever.** Found in `DotViewerCarousel` (`src/components/CohortPeerStreakDots.tsx`) and `MemoryPhotoCarousel` (`app/challenge-memory.tsx`) on 2026-07-24 — both used `{slideWidth > 0 ? <FlatList .../> : null}` with `slideWidth` seeded at `0`. Content inside a `<Modal>` can get a layout pass measured before the Modal has actually taken its final size (a known RN quirk), and if `onLayout` never fires again with a corrected value, the gate never opens. Reported by the user as a sporadic solid-black card. Fix: seed the width from `useWindowDimensions()` (with known insets subtracted where relevant) instead of `0`, and never gate the `FlatList` on the measurement — let `onLayout` only refine an already-valid value. `app/my-journey.tsx`'s `JourneyMemoryLightbox` never had this bug, because it reads `useWindowDimensions()` directly instead of measuring via `onLayout` — prefer that pattern for any new full-bleed horizontal carousel.
- **`maybeCompressImageForUpload` (`src/lib/streakMemoryStorage.ts`) can silently upload a full, uncompressed camera original.** It resizes to 1280px width + JPEG quality 0.82 via `expo-image-manipulator`, but the resize step can throw on some Android `content://` URIs; before 2026-07-24 the `catch` had no retry and no logging, silently falling back to the raw picked file (several MB). Confirmed via direct Supabase Storage query: 16% of uploaded files were over 1 MB and accounted for 52% of total bucket bytes. Fixed with a compress-only retry tier plus `console.warn` logging on both failure tiers — but if Storage usage climbs unexpectedly again, check these logs first before assuming the compression settings themselves need changing.
- **A photo uploaded from an iOS device can render as a blank/black image specifically on Android viewers, while working everywhere else.** Root cause, confirmed by downloading real uploaded files from both platforms and parsing their raw JPEG markers directly (not guessed): iOS's native image encoder (via `expo-image-manipulator`'s iOS-native implementation) embeds a wide-gamut ICC color profile (JPEG `APP2` markers, commonly Display P3) in its output; Android's native encoder does not. Some Android image decoders fail to render a JPEG with that profile embedded at all, while iOS decodes either version — with or without the profile — fine natively. `expo-image-manipulator`'s `SaveOptions` has no option to control this (checked its type definitions directly — only `compress`/`format`/`base64` exist). Fixed in `readImageBytesForUpload` (`src/lib/streakMemoryStorage.ts`) with a hand-rolled `stripIccProfile()` byte-level pass that removes `APP2` segments from any JPEG before upload, applied to every upload path. This only removes the color-space *hint*; pixel data is untouched, verified by re-parsing a stripped real file and confirming identical dimensions with zero `APP2` markers remaining. If a future report says "photo works on iOS but not Android" (or the reverse) for any image-serving feature, check for this exact pattern before assuming a networking/permissions issue.
- **On Android, content that gets mounted into an already-open native `<Modal>` can silently fail to render, even though the exact same content mounts fine when it's present from the Modal's first visible frame.** Found in `CohortPeerStreakDots.tsx`'s memory viewer on 2026-07-24: opening your *own* day's memory resolves synchronously (local state), so the Modal opens with final content already in place, and always worked. Opening a *peer's* day goes through an async RPC — the Modal opened first showing a "Loading moment…" state, then the same already-open Modal swapped in the real photo once the fetch resolved. On Android specifically, that in-place content swap silently failed to render at all (solid black), for every peer, every mission type, regardless of who captured the photo or what platform they were on — confirmed by testing the same account on iOS (worked) vs. Android (failed) and by confirming the image URL loads fine in a browser on the same Android device (ruling out network/file/server issues entirely). iOS's modal presentation doesn't have this quirk.
  - **First fix attempt, tried and reverted**: keying the `<Modal>` on a content-category string (`loading-<date>` / `content-<date>` / etc.) so React fully unmounts/remounts the native modal window when the category changes. This "fixed" Android but broke iOS the same way — rapidly tearing down and re-presenting a native `<Modal>` in the same instant is itself a source of glitches on *both* platforms, since native modal presentation/dismissal takes real wall-clock time and isn't synchronized with React's reconciliation. Do not use `key`-forced remounts on `<Modal>` as a fix for this class of problem.
  - **Actual fix**: never open the Modal until the async data is fully ready — matching the `isSelf` pattern that never had this problem on either platform. The loading state moved *outside* the Modal entirely (a small `ActivityIndicator` shown on the tapped dot itself, via a `pendingTap` state), and `setOpen(...)` is only ever called once, with complete data. The Modal now only ever mounts with final content already in place, on both the peer and self paths alike — it never needs to update or remount mid-flight at all. When a Modal's content depends on an async fetch, prefer delaying the Modal's `visible` transition until the data is ready over trying to show/swap a loading state inside an already-open Modal — that in-between state is what caused both the original bug and the failed first fix attempt.
- **Changing what a data field *means* requires auditing every place that already derives from its old meaning, not just the place that writes it.** The "Mark Day Complete" redesign (2026-07-25, `docs/CATALOG_ARCHITECTURE.md` addendum) changed checklist missions so that logging a task writes a `streakMemories[date]` entry *before* the day is completed — breaking a previously-safe assumption ("any memory entry for a date is proof that date should be in `completedDates`") that three independent, pre-existing self-heal call sites all relied on: `habitStore.ts`'s `completedDatesWithMemoryEvidence` (backing both `repairHabitCompletedDatesFromMemories` and `onRehydrateStorage`, so it also refires on every app cold start), a matching `useEffect` in `app/habit/[id].tsx`, and `src/lib/sync.ts`'s `habitFromRow` (runs on every remote pull/delta sync — the one that made the bug reproduce fastest). All three force-added a date to `completedDates` the instant its first task was logged, silently re-completing the day and firing the squad notification early. Fixed by requiring a *classic* marker (`note`/`imageUrl`/`imageUri`/`checkInOnly`/`repairSource`) before counting a memory as completion evidence, not mere key presence. When changing an existing field/flag's meaning, grep for every reader of it first — the bug surfaces where the reader is, not where the writer changed.
- **`useEffect` runs after render — a ref sized to match a prop at render time, then "corrected" for a changed prop inside a `useEffect`, has a window where the render reads a too-short/stale ref.** Found in `StreakMemoryGallery.tsx`'s hex-stack shuffle animation (2026-07-26): one `Animated.Value` per stacked photo lived in a `useRef` array sized to the current photo count, resized inside a `useEffect` when the count grew. The render that *first* saw a 2-photo day gain a 3rd task (logging it while that day's hex tile was still mounted on screen) indexed the not-yet-resized array, got `undefined`, and called `undefined.interpolate(...)` — a hard crash, identical on iOS and Android since it's a plain JS `TypeError`, not anything native. Only triggered by an *update* to an already-mounted component; a fresh mount always sizes correctly from its `useState`/`useRef` initializer, which is why it only reproduced on a task's 3rd-and-later log, never the 1st or 2nd. Fixed by moving the resize into a plain, guarded `if` block in the render body (mutating a ref during render takes effect immediately for that same render; a paired `setState` call there is React's documented "adjust state while rendering" pattern, safe as long as it's guarded so it can't loop). When a ref/array needs to track a prop that can grow while the owning component stays mounted, do the resize synchronously in the render body, not in an effect.
- **`SplashGate` (`src/components/SplashGate.tsx`) mounts the real app content immediately, *underneath* its splash overlay** — the overlay is a separate absolutely-positioned layer on top (`AnimatedSplashOverlay`, z-index 9999), not something the real screens render behind a gate for. A mount-triggered animation (e.g. `HabitCard`'s stack-up entrance, added 2026-07-26) that starts immediately in a `useEffect` on mount will therefore run to completion *behind the still-opaque splash* on the very first cold launch (the overlay's minimum display time is 2.4s+), and the user only ever sees it play on a later remount (tab switch, navigating back) — never on actual app startup, which is usually the one moment it matters most. Fixed with a one-shot signal, `src/lib/appReadySignal.ts` (`markAppReady()` called from `SplashGate`'s `onDismissed`; `onAppReady(callback)` fires immediately if already latched, otherwise waits) — any "first impression" mount animation should start inside `onAppReady(...)`, not directly in its own effect, or check this pattern before assuming a "the animation isn't working" report is about the animation's tuning rather than its timing. Second confirmed instance (2026-08-06): the Home FAB's "forms and rises" entrance hit the exact same bug — worth checking for this pattern by default on any new mount-triggered Home-screen animation, not just re-discovering it each time.
- **A `ScrollView`/`FlatList` where every pixel is covered by tappable children must never set `canCancelContentTouches={false}`.** This is an iOS-only prop; React Native's own doc comment on it reads "When false, once tracking starts, won't try to drag if the touch moves." Found in `CohortNudgeChips.tsx`'s horizontal nudge-chip row (2026-07-31), reported by the user as "I can scroll on Android but not iOS" — exactly the signature of an iOS-only prop nobody remembered was there. Since the whole scrollable width is Pressable chips, a touch always starts tracking on a child first, and with this prop set, iOS never lets the ScrollView reclaim that touch to scroll no matter how far the finger drags. Android ignores the prop entirely, which is why it worked there. Fix: remove it, let it default to `true`. `directionalLockEnabled` (a different prop, just prevents diagonal drift once a direction is committed) is unrelated and fine to keep. When a scroll container feels frozen on iOS only and every child is tappable, check for this prop before assuming a gesture-responder conflict.
- **Off-palette color drift and a whole class of "no `theme` in scope" bugs, found via a repo-wide color-token sweep (2026-07-31).** A grep for `isDark ? "rgba(...)" : "rgba(...)"` turned up ~289 hand-typed color decisions instead of routing through `src/styles/theme.ts`; several of the most-repeated ones were confirmed off-palette — stock Tailwind hex (`rgba(99,102,241,...)`) instead of this app's actual indigo token (`#7C5CF2`/`#5B3FDE`), invisible because nothing ever compared the hand-typed literal against the real token. Fixed by adding `withAlpha(hex, alphaPercent)` to `theme.ts` (derives a tint directly from a real token) plus two new tokens for jobs that aren't a brand-hue tint — `scrim` (backdrop dimming, always dark) and `sheen` (the glass-highlight flip, white in dark mode / dark ink in light mode) — then converting every instance where both sides of the ternary confidently matched a known token. Separately, this surfaced a real latent-crash pattern in two related but distinct forms: (1) a component that receives `isDark` as a **prop** rather than calling `useTheme()` itself has no `theme` object in scope at all (`ShimmerBlock.tsx`, `fuel/FuelQuickMinutesStrip.tsx`, `fuel/FuelTimePresetButton.tsx`) — fixed by importing `darkTheme`/`lightTheme` directly and selecting per the `isDark` prop; (2) `FocusMissionControlModal` (`app/mini/[id].tsx`) does call `useTheme()`, but only ever destructured `{ isDark }` from it, never `theme` — fixed by adding `theme` to the destructure. When converting any hardcoded color to a theme reference, confirm `theme` (not just `isDark`) is actually in scope — check the destructure, don't assume it from the hook call alone. Full list of what was and wasn't converted (a handful of genuinely one-off colors were deliberately left as literals rather than forced into a token with exactly one caller) in `docs/CURRENT_WORK.md`.

## Where To Start For Common Changes

- Home performance or dashboard UI: `app/(tabs)/index.tsx`, `src/components/HabitCard.tsx`.
- Main mission completion/memory: `app/habit/[id].tsx`, `src/components/StreakMemorySheet.tsx`, `src/lib/streakMemoryStorage.ts`.
- Group challenge screen: `app/challenge/[id].tsx`.
- Cohort dots: `src/components/CohortPeerStreakDots.tsx`.
- Squad activity: `src/components/SquadActivitySection.tsx`, `src/lib/challengeCohort.ts`.
- Repairs: `src/lib/streakRepairApi.ts`, `src/components/StreakRepairSheet.tsx`.
- Community feed: `src/components/CommunityWinsFeed.tsx`, `src/lib/communityWinsApi.ts`.
- Multi-task checklist missions / community catalog (in progress): read `docs/CATALOG_ARCHITECTURE.md` first — it is the source of truth for this feature's data model, phased rollout, and open items. Key files: `app/create.tsx` (checklist creation), `src/components/ChecklistDaySheet.tsx` + `app/habit/[id].tsx` (`handleTaskMemoryCommit`, `handleChecklistDayShare`, `handleChecklistDayUnshare`, `handleToggleTaskInclusion`) for logging/sharing, `src/components/PhotoCarousel` (inline component inside `CommunityWinFeedPost.tsx`) + `CommunityWinImageLightbox.tsx` for the swipeable gallery.
- Public journey: `app/community-player/[id].tsx`, `app/my-journey.tsx`.
- Leaderboard/search: `app/(tabs)/compete.tsx`, `src/lib/weeklyLeaderboardApi.ts`.
- Live minis: `app/live-mini/[id].tsx`, `src/lib/liveMiniMissionsApi.ts`.
- Billing/payment: `src/context/BillingContext.tsx`, `src/context/PremiumContext.tsx`, `app/membership.tsx`, `supabase/functions/revenuecat-webhook/index.ts`.
- Community trial/access: `src/lib/communityAccessApi.ts`, `src/context/PremiumContext.tsx`, `src/context/PlusUpsellContext.tsx`, `supabase/migrations/20260712120000_community_trial_access.sql`.
- OTA updates: `src/components/OtaUpdateManager.tsx`, `app.json`, `eas.json`, `package.json`.
- Notifications: `app/notifications.tsx`, `app/_layout.tsx`, `src/lib/notificationPayloads.ts`.
- Auth/sync: `src/context/AuthContext.tsx`, `src/lib/sync.ts`, `src/lib/syncQueue.ts`.
- Supabase config: `src/lib/env.ts`, `src/lib/supabase.ts`, `app.config.js`.

## Verification Checklist For AI Agents

Before finishing code changes, usually run:

```powershell
npx tsc --noEmit
```

For UI/performance changes:

- Test on a slower Android device/emulator if possible.
- Check navigation animations and touch response.
- Check list pagination/load-more.
- Check direct notification deep links if touched.
- Check auth signed-out behavior if touching providers/routes.

For backend changes:

- Add a Supabase migration.
- Keep RPC grants/search paths/RLS in mind.
- Verify old app versions if payload or RPC signatures change.
- Update both client parsing and notification routing.

For OTA changes:

- Confirm the change is JS/assets-only and compatible with the installed `runtimeVersion`.
- Publish first to `preview` and test the installed preview build.
- Publish to `production` only from the intended source commit.
