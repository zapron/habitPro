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

- **Most current, as of 2026-07-26**: the checklist catalog feature (main +
  mini) is fully shipped, including the Mark Day Complete notification-timing
  redesign (2026-07-25). The active thread now is a **Home Screen Premium UI
  Pass** — an explicit, iterative "go screen by screen" visual overhaul,
  keeping the app's existing flavor. Read `docs/CURRENT_WORK.md`'s top section
  first for exactly what's shipped (glass card highlights, spring stack-up
  entrance, living-memory hex animations) and what's next — the user said
  they'd describe the next screen/idea when ready, so don't invent scope here.
- Continue the multi-task checklist mission / community catalog feature. Read
  `docs/CATALOG_ARCHITECTURE.md` first, then `docs/CURRENT_WORK.md` "Latest Feature"
  section for current status. Rollout is deliberately phased and tested step by
  step at the user's explicit request — do not jump ahead to a later phase without
  the user confirming the current one works on-device first.
- User's explicit priority ordering as of 2026-07-23: functionality first, visual
  design later — "if we now start on UI, it might take a very long time." Do not
  start the dedicated visual design pass (`docs/CATALOG_ARCHITECTURE.md` §7) until
  the user says core functionality is settled.
- Explicit handoff note from the user: the "×N" photo-count badge on Journey grid
  tiles (`app/my-journey.tsx`, `app/community-player/[id].tsx`) is a known gap —
  "we can come back to it later," not forgotten, just deliberately deferred behind
  functionality work.
- Migrations `20260723120000_challenge_memory_detail_task_gallery.sql`,
  `20260723130000_cohort_peer_streak_task_markers.sql`, and
  `20260723140000_challenge_memory_detail_text_only_tasks.sql` have been applied
  and confirmed working end-to-end (squad memory view, streak-dots viewer, and
  text-only tasks all tested successfully by the user on 2026-07-24). Still worth
  double-checking with `list_migrations`/querying the live RPC definition before
  relying on them on a *different* Supabase project (e.g. a fresh branch/env),
  since this project's standing rule is every migration is applied manually by
  the user, never assumed.
- The main Community feed, Journey tab, and the Community-sharing gallery itself
  (`handleChecklistDayShare` in `app/habit/[id].tsx`) still silently drop text-only
  tasks (no photo) from their galleries — this was deliberately scoped out of the
  squad-viewer text-only fix above as a larger, separate follow-up. See
  `docs/CATALOG_ARCHITECTURE.md` §11 before starting that work.
- **Runtime `1.1.35` — update as of 2026-07-26, this changed since it was first written**:
  verified directly via `eas build:list`/`eas channel:view preview`, not assumed.
  iOS's `production`-channel binary has been on runtime `1.1.35` since a build on
  2026-07-23 (unrelated to this feature — an IAP/account-setup build) — so iOS
  `production` **is** a live cohort, and every OTA pushed to `production` this
  week (Mark Day Complete redesign, hex gallery animations, Home UI pass, and
  their follow-up fixes) has gone to it, each time after the user explicitly
  asked for a production push (sometimes right away, sometimes only after
  confirming on preview first — both patterns occurred, follow the user's
  cue each time rather than assuming one or the other). **Android's
  `production`-channel binary is still on runtime `1.1.34`** (built 2026-07-22)
  and cannot receive any `1.1.35` OTA at all — EAS Update only serves updates
  matching the installed binary's exact runtime version. There has also **never
  been an iOS build on the `preview` channel** — every iOS build ever produced
  is `production`/TestFlight, so iOS preview-only testing has never actually
  been possible; Android's `preview`/`apk` profile builds are the only genuine
  preview vehicle on either platform. Don't assume "pushed to preview" means an
  iOS tester actually receives it.
- Four OTA rounds went out today fixing a squad-photo-viewing saga end to end:
  (1) the original `onLayout`-race blank-carousel bug, (2) image-compression
  fallback silently uploading uncompressed originals, (3) iOS embedding an ICC
  color profile Android can't decode, (4) an Android-only Modal content-swap bug
  whose *first* fix attempt (forcing a `key`-based Modal remount) broke iOS
  instead — reverted in favor of never opening the Modal until data is ready. All
  confirmed fixed by the user on both platforms as of 2026-07-24. Full chain in
  `docs/WORK_HISTORY.md` 2026-07-24 and `app-architecture.md` Known Caution
  Points — worth reading before touching any Modal whose content depends on an
  async fetch, or any image-upload code path.
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

- **The agent must never run `apply_migration` (or any other direct-to-database
  write) against Supabase.** Every schema change is a new file under
  `supabase/migrations/`, reviewed and applied by the user manually. This was
  violated once (see `docs/WORK_HISTORY.md` 2026-07-23) before the user made it an
  explicit standing rule — do not repeat it, even for additive/safe-looking changes.
- `rpc_sync_dirty_state` (the habit/mini push RPC) parses the client's JSON via an
  explicit `jsonb_to_recordset(...) as x(col type, ...)` column list. A new synced
  field that isn't added to that list (migration required) is silently dropped —
  no error, nothing in any log, and everything upstream of the RPC (types, `tsc`,
  `sync.ts` mapping) looks completely correct. See `app-architecture.md` Sync
  Architecture section before adding any new field to `habits`/`mini_missions` sync.
- **iOS can't reliably present a second native `<Modal>` while one is already
  open** — it silently fails, no error, no crash, nothing in logs; Android
  tolerates it. This is bigger than just `openUpsell`/the paywall: `showAppAlert`
  (`src/context/AppDialogContext.tsx`) also renders through a real `<Modal>`, not a
  native OS alert. Found and fixed 3 separate times across this session so far (see
  `docs/WORK_HISTORY.md` 2026-07-22 and 2026-07-23) — including once in
  **pre-existing** code that had never been caught. One known instance is still
  open and unfixed: `handleMemoryCommit` in `app/habit/[id].tsx` (~lines 886-963).
  Full pattern writeup in `app-architecture.md` Known Caution Points — when adding
  any new confirm/error dialog inside a sheet, default to assuming this bug applies.
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

If the user asks to continue the checklist mission / community catalog feature:

1. Read `docs/CATALOG_ARCHITECTURE.md` in full first — do not reconstruct the design
   from code alone, several decisions (day-completion semantics, unshare being a
   one-way door, the unified include/exclude mechanism) aren't obvious from reading
   the components.
2. Read `docs/CURRENT_WORK.md` "Latest Feature" section for exactly what's built vs.
   deferred as of the last session.
3. Confirm current uncommitted state matches `git status --short` before assuming
   anything — this feature has not been committed yet.
4. If adding any new field that needs to sync to Supabase, remember
   `rpc_sync_dirty_state`'s explicit column list (see Technical Risk Areas above) —
   write the migration for both the table and the RPC, don't just add the column.
5. Any new migration is a new file under `supabase/migrations/` for the user to
   apply manually — never call `apply_migration` directly.
6. Test each phase on-device before moving to the next one; the user has been
   explicit that this rollout is deliberately incremental.

If ending a long session:

1. Read `.codex/skills/habitpro-session-logger/SKILL.md`.
2. Audit all Markdown files with `rg --files -g '*.md' -g '!node_modules'`.
3. Update `docs/CURRENT_WORK.md`.
4. Append a dated entry to `docs/WORK_HISTORY.md`.
5. Update affected architecture/context/playbook docs only when their scope changed.
