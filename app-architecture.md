# HabitPro App Architecture

Last updated: 2026-07-16

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
- `app.json`
- `eas.json`
- `package.json`

Current build/update model:

- Runtime version is manually pinned in `app.json` as `1.1.31`. This is required because the project has native Android code / bare workflow behavior, so runtime version policies are not supported.
- EAS channels are `development`, `preview`, and `production`.
- Build profiles `apk` and `preview` both publish Android APKs on the `preview` channel.
- Production builds use the `production` channel.
- Scripts:
  - `npm run build:apk`
  - `npm run build:aab`
  - `npm run update:preview`
  - `npm run update:production`

`OtaUpdateManager` behavior:

- Disabled in development and when `expo-updates` is not enabled.
- Skips OTA checks while the force-update policy says a native update is required.
- Checks once after launch and again when the app returns to foreground, with a cooldown.
- Downloads available JS/assets update, then prompts the user to restart now or later.

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
- OTA update check/download/restart prompt.
- Mini mission local notification reconciliation.
- Supabase Realtime subscription for applied squad streak repairs.

Avoid casually reordering providers. Billing depends on auth, premium depends on billing/auth, username and notification gates depend on theme/auth, and app version wraps the force-update UI.

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
- `upsertRemoteMiniMission()`
- `deleteRemoteMiniMission()`
- `pullCohortPeerHabitsFromSupabase()`

Performance notes:

- Focus delta RPCs reduce full-state pulls.
- Focus delta payloads can include deleted habit/mini IDs; client filters those from the partial remote snapshot.
- Pending local deletes are also applied to remote snapshots before merge so an offline delete does not reappear after reconnect.
- Remote focus refreshes are coordinated by `src/lib/remoteFocusRefreshCache.ts` and `src/lib/remoteRefreshCoordinator.ts`.
- Memory image uploads happen before pushing memory state when possible.
- `src/lib/accountBackup.ts` saves throttled account snapshots around remote pushes and focus refreshes.

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
- `src/components/StreakBanner.tsx`

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
- `fetchCommunityJourneyViewCount()`

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
- Notification routes exist in two places and must stay aligned.
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

## Where To Start For Common Changes

- Home performance or dashboard UI: `app/(tabs)/index.tsx`, `src/components/HabitCard.tsx`.
- Main mission completion/memory: `app/habit/[id].tsx`, `src/components/StreakMemorySheet.tsx`, `src/lib/streakMemoryStorage.ts`.
- Group challenge screen: `app/challenge/[id].tsx`.
- Cohort dots: `src/components/CohortPeerStreakDots.tsx`.
- Squad activity: `src/components/SquadActivitySection.tsx`, `src/lib/challengeCohort.ts`.
- Repairs: `src/lib/streakRepairApi.ts`, `src/components/StreakRepairSheet.tsx`.
- Community feed: `src/components/CommunityWinsFeed.tsx`, `src/lib/communityWinsApi.ts`.
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
