# HabitPro Work History

This is a concise chronological log for future sessions. Keep secrets out of this file.

## 2026-07-22

### iOS Paywall Stuck Behind Sheets (nested Modal fix)

- User reported iOS-only "stuck" behavior: tapping Invite in Live Squad, completing a mini mission with Community publish, and (per Supabase/RevenueCat investigation) other premium-gated actions did nothing visible on iOS while working fine on Android.
- Investigated via RevenueCat MCP and Supabase MCP (both newly connected this session): confirmed RevenueCat webhook delivery has a real reliability bug (crashes on events with `$RCAnonymousID:...` as `app_user_id` instead of a UUID, ~30-40% of deliveries failing in edge function logs) but this was a red herring for the reported "stuck" behavior — the actual affected test user (`thategolifter` / `0367c122-a375-48aa-8a09-f1f4c8dbe1a1`) had zero purchase/subscription history in RevenueCat, so `is_premium: false` was correct, not stale.
- Root cause: components that wrap themselves in their own `<Modal>` (Live Squad invite, streak repair, group mission, completion memory sheets, custom nudge note, community-player journey drawer) call `openUpsell(...)` from inside a handler while that Modal is still open. iOS frequently fails to present a second native `<Modal>` over a still-open one; Android's `Dialog`-backed `Modal` stacks more forgivingly, so this was iOS-only.
- Fix: close the enclosing sheet before calling `openUpsell(...)`, in 8 files / 12 call sites — see `docs/CURRENT_WORK.md` "Latest Fix" section for the full file list.
- Validated locally: `npm run android` (Android emulator, required `JAVA_HOME` pointed at Android Studio's bundled JDK and `android/local.properties` with `sdk.dir`, both local-machine setup, not committed) and `npx expo run:ios` (iOS Simulator, required adding `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY` to local `.env`, pulled from RevenueCat via MCP). Both platforms confirmed working by the user after the fix.
- Test account `raktim24@gmail.com` had `is_premium` manually set to `false` in Supabase during testing (to validate the free-user paywall path on a real linked Apple+Google+email account); not yet restored to premium.
- Not fixed, deferred by user: the RevenueCat webhook anonymous-ID crash bug in `supabase/functions/revenuecat-webhook/index.ts`. Real bug, independent of the modal fix, still open.
- Validation: `npx tsc --noEmit` clean.
- Published to production OTA after user approval (see command/output logged at time of publish).

## 2026-07-21

### iOS Apple Login / RevenueCat Billing Prep

- Added native Sign in with Apple support through `expo-apple-authentication`.
- Updated `app.json` for iOS Apple sign-in capability, encryption compliance metadata, and the release bump to version/runtime `1.1.34`, iOS build `35`, Android versionCode `35`.
- Updated `package.json` and `package-lock.json` to version `1.1.34`.
- Updated ignored native Android file `android/app/build.gradle` to `versionName "1.1.34"` and `versionCode 35`.
- Regenerated the iOS provisioning profile through EAS credentials after enabling the Apple sign-in capability.
- User reported the TestFlight Apple sign-in flow works on iPhone.
- Created and configured the RevenueCat App Store app for bundle id `com.rakti.habitpro`.
- App Store Connect subscriptions `monthly` and `yearly` were created under the `habitPro Community` subscription group.
- Imported both App Store products into RevenueCat, attached them to entitlement `habitpro_community`, and attached them to default offering packages `$rc_monthly` and `$rc_annual`.
- Added/verified EAS production env `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY`; no private Apple `.p8` contents were recorded in docs.

### Validation

- RevenueCat MCP audit confirmed:
  - App Store Connect API key and in-app purchase key are configured for the RevenueCat App Store app.
  - App Store products `monthly` and `yearly` are active in RevenueCat.
  - Both products are attached to entitlement `habitpro_community`.
  - Default offering package `$rc_monthly` contains Android `monthly:monthly-base` and iOS `monthly`.
  - Default offering package `$rc_annual` contains Android `yearly:yearly-base` and iOS `yearly`.
- `npx tsc --noEmit` passed.
- `git diff --check` passed.
- `npx eas env:list --environment production` confirmed production env includes the iOS RevenueCat public SDK key.

### Open Risks / Next Steps

- A new iOS TestFlight build is still needed to embed the iOS RevenueCat key and test the App Store paywall flow.
- Do not click App Store Connect `Add for Review` for subscriptions until the new build is uploaded and the paywall/products are smoke-tested on TestFlight.
- RevenueCat may continue showing `Missing Metadata` for App Store products until Apple metadata/status fully settles.

## 2026-07-20

### Commits

- `cbb5a37 fix: polish iOS live mini experience`
- `c8a29bf db: persist habit visibility in sync rpc`
- `e002f35 chore: use eas environments for ota scripts`

### iOS TestFlight / Push Milestone

- Created iOS production/TestFlight build for `com.rakti.habitpro`, version `1.1.32`, build `33`.
- Submitted binary to App Store Connect app id `6792545017`.
- Completed App Store Connect encryption compliance with standard/exempt encryption.
- Internal TestFlight group `Team (Expo)` has the user invited and build available.
- Created and assigned Apple Push Notifications key for `com.rakti.habitpro`.
- Verified iPhone push delivery using Expo's notification tester and the device Expo push token.

### Production OTAs

- Published `00fdba0a-081e-4347-af3f-cdb04f51c472` to `production`: `Fix iOS network gate foreground refresh`.
- Published `e36a7398-10f9-44d7-abad-c750ba03c664` to `production`: `Fix iOS live mini invite and image performance`.
- Discovered Mac local `.env` had a RevenueCat Android `test_...` key. Android release intentionally treats `test_` keys as missing, so a production OTA made from local env could break billing configuration.
- Published corrective OTA `97cb22c0-2958-402d-8dc2-cde2fb5b4d73` with `--environment production`: `Fix Android RevenueCat production key`.
- Updated `package.json` OTA scripts so future preview/production updates explicitly use EAS environments.

### Fixes

- `NetworkRequiredGate` now refreshes NetInfo on app foreground and waits briefly before showing the offline blocker, avoiding false iOS offline overlays after returning from background.
- Live Mini board inline memory images now use Supabase render thumbnails while full-size images remain available in the tap-to-view modal.
- Live Mini invite sheet is keyboard-scrollable on iPhone so username search/results are not covered by the keyboard.
- Added migration `supabase/migrations/20260720110000_fix_habit_visibility_sync_rpc.sql` to restore main habit `visibility` writes in `rpc_sync_dirty_state`.

### Validation

- `npx tsc --noEmit` passed before commits.
- `git diff --check` passed before commits.
- `package.json` JSON parse sanity check passed after OTA script update.

### Open Risks / Next Steps

- User reported `supabase/migrations/20260720110000_fix_habit_visibility_sync_rpc.sql` was applied after creation. Retest synced main mission Solo/Public persistence on device.
- Other previously noted live migrations may still need applying before synced marker/group retesting:
  - `supabase/migrations/20260719120000_backfill_completed_dates_from_streak_memories.sql`
  - `supabase/migrations/20260719121000_focus_delta_group_creator_timezone.sql`
- Mac `.env` should be updated privately so `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY` uses the real Play Store `goog_...` public SDK key.
- External TestFlight beta remains to be configured after smoke testing.

## 2026-07-19

### Commits

- `61e035c fix: repair mission marker date mapping`
- `c41cc69 db: add marker progress repair migrations`
- `4acde02 docs: record marker regression recovery`

### Release Boundaries

- No push was run.
- No Supabase migration was applied.
- Preview OTA was published to the `preview` channel.
- User added a standing rule: never commit, push, apply migrations, build, publish OTA, or deploy unless explicitly asked for that exact action.
- Added local skill `.codex/skills/habitpro-deployment-guard/` to preserve that rule for future HabitPro sessions.

### Preview OTA

- Command: `npx --yes eas-cli@latest update --channel preview --message "Preview mission marker date fix"`
- Branch/channel: `preview`
- Runtime version: `1.1.31`
- Update group ID: `683beb51-84b0-4bb8-aa2d-8572757e4bea`
- Android update ID: `019f7711-2b55-7b40-bd1b-7f03cf79e188`
- iOS update ID: `019f7711-2b55-7980-bf35-7175c3aacb09`
- Commit published by EAS: `4acde0277ec4025c82b36edc0a6073628555dc85`
- Dashboard: `https://expo.dev/accounts/raktim24/projects/habitPro/updates/683beb51-84b0-4bb8-aa2d-8572757e4bea`

### Marker Regression Investigation

- User reported a major marker unlock regression: campaign progress stayed at `66/75`, moments showed up to `D68`, Active Trail showed `Day 68/75 | 66 done | 7 left`, and the unlock pill still said `Day 68 opens in 21h...` after midnight.
- Added marker diagnostics in `app/habit/[id].tsx` (`[habitPro:marker] detailState`, `dayPress`, `memoryCommitRejected`, `storeToggleRejected`) to inspect active slot/date, mission timezone, raw creation key, rolling slot, stored/effective completed counts, and memory tails.
- Logs exposed the root bug: the performance optimization in `37f723e` changed canonical date mapping so legacy UTC keys could overwrite correct timezone calendar keys.
- Example from logs: mission start `2026-07-18T20:47:13.379Z`, timezone `Asia/Kolkata`, canonical Day 1 `2026-07-19`.
- Broken optimized map shifted dates forward:
  - `2026-07-19 -> 2026-07-20`
  - `2026-07-20 -> 2026-07-21`
  - `2026-07-21 -> 2026-07-22`
- This matched logs where `storedCompletedTail` shifted after sync from `["2026-07-19","2026-07-20"]` to `["2026-07-20","2026-07-21"]`.

### Fixes

- `src/utils/missionCalendarKeys.ts`: canonical mission-calendar dates now win map collisions; legacy UTC keys only fill missing entries.
- `src/utils/groupMissionClock.ts`: same collision fix for group mission remapping; group start alignment now falls back to `challengeCreatorTimezone` when `missionTimezone` is missing.
- `src/utils/missionDaySlots.ts`: calendar-day mission mode now activates when either `missionTimezone` or `challengeCreatorTimezone` exists.
- `supabase/functions/process-streak-reminders/index.ts`: server reminder calendar-day detection mirrors the client fallback.
- `app/habit/[id].tsx`: detail clock/display uses an effective completed-date set from `completedDates + streakMemories`, preventing `66/75` from displaying when saved memories prove later completed days exist.
- `src/store/habitStore.ts` / `src/types/habit.ts`: added `repairHabitCompletedDatesFromMemories()` to self-heal local progress and queue remote sync.
- `src/lib/sync.ts`: remote hydrate treats canonicalized streak memory keys as completion evidence.
- `src/components/StreakMemorySheet.tsx`: image loading now clears on error/timeout and shows a fallback instead of spinning forever.
- Manual missions now always use reverse Active Trail (`isManual || totalDays > INITIAL_GRID_RENDER_DAYS`), fixing inconsistent 30-day manual vs 75-day manual grid behavior.
- Added migrations:
  - `supabase/migrations/20260719120000_backfill_completed_dates_from_streak_memories.sql`
  - `supabase/migrations/20260719121000_focus_delta_group_creator_timezone.sql`

### Validation

- `git diff --check` passed.
- `npx tsc --noEmit` passed.
- Node sanity script verified the collision fix:

```text
2026-07-19 old=> 2026-07-20 new=> 2026-07-19
2026-07-20 old=> 2026-07-21 new=> 2026-07-20
2026-07-21 old=> 2026-07-22 new=> 2026-07-21
```

### Open Risks / Next Steps

- Preview OTA is published; no production OTA was run.
- Live data still needs the backfill migration to repair existing rows in Supabase.
- If testing still shows marker mismatch, capture the full `[habitPro:marker] detailState` line.
- Skill validator for `.codex/skills/habitpro-deployment-guard/` could not run because the local Python environment is missing the `yaml` module.

### Production Build Prep / Connectivity Layer

- `460f366` bumped the app to `1.1.32`: Expo/package version `1.1.32`, runtime `1.1.32`, iOS build `33`, Android versionCode `33`.
- `eb9dcbd` made mini mission finish rules clearer: `Timer Check-In` now shows a straight `SOLO` pill and `Manual Finish` shows `SOLO / COMMUNITY`.
- `60b53f2` removed temporary `console.log` / `console.info` instrumentation from app code and added `.codex/skills/habitpro-performance-investigation/` plus `agent.md` guidance: use targeted timer logs for performance work, then remove them before production handoff.
- `11eb8f0` added the internet-required layer:
  - installed `@react-native-community/netinfo`
  - added `src/components/NetworkRequiredGate.tsx`
  - mounted it globally in `app/_layout.tsx`
  - removed login's `Continue offline` action
  - blocks app usage with `No internet connection` when connectivity is unavailable.
- User reported they triggered a production EAS Android build themselves.
- Codex started a local Gradle APK build only after the user asked for help creating a local APK, then stopped it immediately when the user clarified they wanted guidance only. `git status --short` was clean after interruption.
- Local APK guidance retained for future reference:

```bash
cd android
JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" ./gradlew assembleRelease
```

- Validation for the connectivity/logging work:

```bash
npx tsc --noEmit
git diff --check
```

### Handoff / Skill Maintenance

- Audited repo Markdown files for whether they should move into `.codex/skills`; most should remain as docs. Potential future skill candidates are RevenueCat debugging and release/build playbooks.
- Updated `.codex/skills/habitpro-session-logger/SKILL.md` so future end-of-session logging audits all Markdown files and updates affected docs.
- `git diff --check` passed after the skill edit.
- Skill validator still cannot run because local Python lacks `yaml`.

## 2026-07-17

### Commits

- `075cabe feat: add daily wisdom launch splash`
- `5131c7a feat: show cohort streak dots newest first`

### What Changed

- Daily Wisdom moved from mission detail into the existing habitPro launch splash.
- `AnimatedSplashOverlay` now shows a deterministic daily quote below the habitPro lockup.
- `SplashGate` waits for a short minimum launch window and signed-in startup readiness when available.
- Notification permission nudge delay was increased to avoid colliding with launch wisdom.
- Mission detail `QuoteCard` was removed.
- Cohort participant dots now show current/reached day first and omit future/unreached dots.

### Validation

- `npx tsc --noEmit` passed.
- `git diff --check` passed.
- `cmd /c npx expo export --platform ios --output-dir .expo-export-check` passed and the export folder was removed.

### OTA

- Preview OTA command attempted:

```bash
cmd /c npm run update:preview -- --message "Preview daily wisdom splash and cohort timeline"
```

- The sandbox blocked the EAS publish/network escalation. Run locally when needed.

### Open Investigation

- Android S24 Ultra shows Home jank after splash and delayed mission-detail touches.
- User clarified splash itself is not the visible problem; the issue starts after Home appears.
- Current suspected Home culprit: `src/components/HabitCard.tsx` `RingDayArcs`, which renders one SVG `Circle` per mission day.
- Current suspected detail culprits: Active Trail cells and `StreakMemoryGallery` honeycomb SVG/image mounting.
- Recommended next step: run an Android-only experiment replacing long-mission Home segmented rings with a lightweight progress ring/text.

### Documentation / Handoff Audit

- Updated `agent.md`, `docs/CURRENT_WORK.md`, `docs/FUTURE_AGENT_HANDOFF.md`, `docs/PROJECT_CONTEXT.md`, `docs/IOS_BUILD_PLAYBOOK.md`, and `app-architecture.md`.
- Added `docs/MAC_SETUP_HANDOFF.md` for Windows-to-Mac migration.
- Added this `docs/WORK_HISTORY.md` file for chronological session history.
- Added repo-local skill `.codex/skills/habitpro-session-logger/` for end-of-session handoff logging.

### Documentation Validation

- `npx tsc --noEmit` passed.
- `git diff --check` passed at that checkpoint; a later Mac audit found no project markdown line-ending warnings.
- Skill validator was attempted, but `quick_validate.py` could not run because the local Python environment is missing the `yaml` module.

### Mac Markdown / Handoff Follow-Up

- Checked all project markdown files for CRLF line endings, conflict markers, Windows-only paths, and stale handoff/untracked-file notes.
- Project markdown files are LF-normalized; CRLF matches were only in `node_modules` README/CHANGELOG files and were left untouched.
- Updated `docs/CURRENT_WORK.md` to reflect the clean committed handoff state after `4a078b7`.
- `git diff --check` passed with no warnings.

### Android Home Performance Follow-Up

- Updated `src/components/HabitCard.tsx` so Android long missions use a lightweight aggregate progress ring on Home instead of one `react-native-svg` `Circle` per mission day.
- iOS and shorter Android missions keep the segmented day ring.
- Added dev-only `[habitPro:perf]` timing logs around splash dismissal, Supabase hydrate/pull phases, and Home first card commit.
- Added migration `supabase/migrations/20260717120000_focus_delta_group_meta.sql` so `rpc_focus_delta_v1` returns challenge group metadata with the delta payload and the client can avoid a slow launch-time `challenge_groups` fetch.
- Added a fast path in `src/utils/groupMissionClock.ts` to skip expensive group habit remapping when the habit already matches the canonical challenge start/end.
- Optimized mission date-key canonicalization/remapping in `src/utils/missionCalendarKeys.ts` and `src/utils/groupMissionClock.ts` by precomputing date maps instead of scanning every mission day for each completed/memory key.
- Follow-up Expo Go Android logs showed the date-map optimization reduced `sync.mapDelta.habitsFromRows` to about 240-430ms and `sync.mapDelta.alignOwnHabitsTotal` to about 650-1200ms.
- Added dev-only mission detail and memory gallery timing logs to isolate Android detail navigation, heavy-content readiness, Active Trail batching, memory entry construction, gallery commit, and JS thread stalls.
- Mission detail logs identified repeated mission-day date lookup as the Android blocker. Added `missionDayNumberMapForHabit()` and switched detail Active Trail / memory gallery entry construction to one shared date-to-day map.
- Follow-up Android logs showed mission detail first commit around 232-336ms and memories ready around 120-182ms, replacing the previous multi-second Active Trail / memory entry stalls.
- Validation: `npx tsc --noEmit` and `git diff --check` passed.

## 2026-07-16

### Commits

- `1ecb823 feat: virtualize mission moment honeycomb`
- `f94bacf perf: smooth mission detail rendering`
- `d1fc011 style: compact mission detail cards`
- `2884de9 docs: add project handoff context`

### What Changed

- Mission moment gallery became a virtualized two-row honeycomb using horizontal `FlashList` columns.
- Mission detail performance was improved through Active Trail batching and non-blocking decorative animations.
- Supporting mission detail cards were made more compact.
- Core handoff docs were added to make future sessions resumable.

### Cautions

- Avoid reintroducing `react-native-reanimated` in `StreakMemoryGallery` while Expo Go Worklets versions may mismatch.
- Keep honeycomb virtualized; do not return to mounting every moment in a plain horizontal `ScrollView`.

## Earlier July 2026

- Mini Mission Timer Check-In was added as the humane default.
- Timer Check-In expires into Complete / Retry / Fail review rather than immediately failing.
- Manual Finish remains the stricter mode and keeps reserve fuel / Live Squad behavior.
- Supabase migration `20260715120000_mini_timer_check_in.sql` must be applied before synced testing of those changes.
