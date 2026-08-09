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

- **Most current, as of 2026-08-09**: `experiment/glass-redesign-v2`
  (everything below — the 2026-08-08, 2026-08-06, and 2026-08-04 sessions)
  was **merged into `main` via PR #1, merge commit `0a52ef7`**. Local
  `main` confirmed identical to `origin/main`, `npx tsc --noEmit` clean
  post-merge. No `package.json`/lockfile/`app.json`/`eas.json` changes
  anywhere in the merged history, so it's OTA-safe per
  `app-architecture.md` — no version bump/force-update needed to ship it.
  **Not pushed as an OTA update yet** — that hasn't been requested. If
  you're picking up work now, you should be on `main`, not the experiment
  branch (check `git branch --show-current` before assuming otherwise).
- **As of 2026-08-08**: a large minimalist pass across the
  cohort/squad screen, the Leaderboard, and the Community feed, plus a
  Community card *structural* restructure (header/photo/footer). Full
  detail in `docs/CURRENT_WORK.md`'s 2026-08-08 entry and
  `docs/WORK_HISTORY.md`. **Now merged into `main`, see the bullet above.**
  Two things worth knowing before touching this area again:
  - The Community feed card's elevated-card treatment (background/border/
    shadow) was built, iterated on extensively (fixing real iOS shadow-
    clipping and Android elevation bugs along the way), then **deleted
    entirely** in favor of a flat, chrome-free card per an explicit "let's
    try that" experiment. If the user says "go back" on this, it needs to
    be rebuilt from `docs/CURRENT_WORK.md`'s 2026-08-08 entry (which has
    the specifics) — it is not toggled behind a flag, it's gone.
  - `CohortStreakPill` (`src/components/CohortStreakPill.tsx`) is now a
    shared "colorless flame + Xd" building block reused in the cohort
    screen *and* the Community feed's post header — if it changes, check
    both call sites.
  Same sandbox limitation as every prior session — none of this was
  confirmed live on-device; see `docs/CURRENT_WORK.md` for the specific
  spots most worth a real look.
- **As of 2026-08-06**: continued the minimalist redesign with
  a "dull it down further" pass — Home's XP-bar dot, FAB fill, notification
  badge, and streak/status colors across `HabitCard`/`StreakProgressCard`
  all moved from vivid to muted, plus a new `900`-level dulled shade added
  to `green`/`red`/`amber` in `theme.ts` to back that consistently instead
  of one-off hex picks (see app-architecture.md's "Color token discipline").
  The habit detail day grid was reworked from a two-ring "double circle"
  into one solid `green[900]` circle with an icon-priority system (camera >
  hammer-for-repaired > message-square > plain number), and the in-progress
  day's checklist indicator changed from a stroked ring-arc to an actual
  filled pie-slice. The Reminder/Type card lost its colored icon chips.
  `Timer.tsx` gained a minimalist-only "fire holds, then collapses so the
  digits grow into the space" mount animation, lost its elapsed/remaining
  toggle pill (the whole digit block is the tap target now), and the
  memory-capture honeycomb (`StreakMemoryGallery.tsx`) had its wave
  cross-fade, quote glyph, and 4-color kicker system stripped entirely,
  keeping only the hex silhouette (a "Concept B" redesign chosen after
  reviewing a published audit artifact against real minimalist references).
  Also fixed a real bug: reminder "Lock time" silently did nothing in Expo
  Go (push permission is always `"unavailable"` there) — the lock-in is now
  decoupled from notification-permission success entirely. Full detail in
  `docs/CURRENT_WORK.md`'s 2026-08-06 entry and `docs/WORK_HISTORY.md`.
  **Now merged into `main`, see the 2026-08-09 bullet above.** Most of
  this was again verified only by
  `tsc`/`git diff --check`, not live on-device interaction (same sandbox
  limitation as the prior session) — see `docs/CURRENT_WORK.md` for what
  specifically still needs a real look.
- **As of 2026-08-04**: a Classic/Minimalist theme-pack system
  (new `themePack` preference, Settings-selectable) plus a large iterative
  visual-redesign pass — Home/Compete tab restyle with an animated sliding
  indicator (rolled out to every other segmented control in the app too),
  a from-scratch `HabitCard` redesign (circular day-grid badge replacing the
  fire-icon streak ring, colorless mission-type pills, repair-as-hammer-icon
  instead of a separate button), the habit detail screen's day grid and
  repair-banner redesign, and a `StreakMemorySheet` restyle against a Claude
  Design mockup read via the `claude_design` MCP. Full detail in
  `docs/CURRENT_WORK.md`'s 2026-08-04 entry and `docs/WORK_HISTORY.md`.
  **Now merged into `main`, see the 2026-08-09 bullet above.** Most of it
  was **not visually confirmed on-device** (the session's environment had no
  tap-automation available) — see `docs/CURRENT_WORK.md` for exactly what
  still needs a manual look. Also: `HabitCard.tsx` now has two dead
  components (`RingDayArcs`, `LightweightMissionRing`) left over from the
  old fire-ring design, no longer called anywhere — worth removing next
  time that file is touched, not urgent on its own.
- **As of 2026-07-31**: a design-lead-style UI/UX audit pass
  shipped (XP-gain badge, leaderboard medals + countdown, nudge feedback,
  pulsing invite dot, Quick Complete confirmation dialog — OTA'd, runtime
  `1.1.35`, commit `7322dec`), followed by a full color-token sweep (see
  `docs/CURRENT_WORK.md` top section and `docs/PROJECT_CONTEXT.md`'s "UI/UX
  Audit Pass + Color Token Sweep" entry for full detail; commits `9226085`,
  `0783dfe`, `1a1df99`, `587461d`). An experimental from-scratch "Apple Glass"
  Home revamp exists on branch `experiment/glass-home`, explicitly **not**
  merged into `main` — a throwaway/revertible exploration the user asked for
  directly, not abandoned or forgotten work. Don't try to reconcile or merge
  it without the user asking; it's parked there on purpose.
- **As of 2026-07-26**: the checklist catalog feature (main +
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
- **Runtime `1.1.35` — update as of 2026-07-31, re-verified via `eas build:list
  --platform android --status finished`, this changed again since it was first
  written on 2026-07-26**: iOS's `production`-channel binary has been on
  runtime `1.1.35` since a build on 2026-07-23. **Android's `production`-channel
  binary is no longer stuck on `1.1.34`** as this note previously said — a newer
  Android production build (`buildProfile: production`, `distribution: STORE`)
  landed 2026-07-27 at runtime `1.1.35`, superseding the 2026-07-22 build this
  note originally referenced. Both platforms' `production` channels are on
  `1.1.35` as of this correction, so both are now live cohorts for any
  `1.1.35` OTA — don't assume Android still needs a version-mismatched OTA
  skipped for it without re-checking `eas build:list` first, since this exact
  assumption just went stale once already. There has also **never been an iOS
  build on the `preview` channel** — every iOS build ever produced is
  `production`/TestFlight, so iOS preview-only testing has never actually been
  possible; Android's `preview`/`apk` profile builds are the only genuine
  preview vehicle on either platform. Don't assume "pushed to preview" means an
  iOS tester actually receives it. **This whole bullet is exactly the kind of
  fact that goes stale within days — always re-verify with `eas build:list`
  before trusting it, rather than trusting this note itself.**
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
- Production Android build/testing (version drifts — check `eas build:list --platform android` for the actual current production build rather than trusting a hardcoded number here) and the internet-required gate, which has since shipped (`src/components/NetworkRequiredGate.tsx`, mounted globally in `app/_layout.tsx`).
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
- Do not hand-type `isDark ? "rgba(...)" : "rgba(...)"`. Use a `theme.colors.*`
  token plus `withAlpha(hex, alphaPercent)` from `src/styles/theme.ts`. A
  2026-07-31 sweep found ~289 hand-typed instances, several silently
  off-palette (stock Tailwind hex instead of this app's actual token) — see
  `docs/CURRENT_WORK.md` for the full list of what was and wasn't converted
  (genuinely one-off colors were deliberately left alone, not guessed into a
  token).
- A component that receives `isDark` as a **prop** (rather than calling
  `useTheme()` itself) has no `theme` object in scope — referencing
  `theme.colors.*` there is a silent bug until something actually exercises
  that code path (found 4 times in one session: `FocusMissionControlModal` in
  `app/mini/[id].tsx`, `ShimmerBlock.tsx`, `fuel/FuelQuickMinutesStrip.tsx`,
  `fuel/FuelTimePresetButton.tsx`). Fix is to import `darkTheme`/`lightTheme`
  directly from `theme.ts` and select per the `isDark` prop.
- A `ScrollView`/`FlatList` where every pixel is covered by tappable children
  must never set `canCancelContentTouches={false}` (iOS-only prop) — per
  React Native's own doc comment ("once tracking starts, won't try to drag if
  the touch moves"), this makes the row unscrollable on iOS specifically,
  since a touch always starts tracking on a child first. Found and fixed in
  `CohortNudgeChips.tsx` 2026-07-31; Android was unaffected since the prop
  doesn't apply there.
- `expo-blur`'s `BlurView` renders as a flat tinted view with zero actual
  blur on Android unless `experimentalBlurMethod` is explicitly set, which
  Expo's own docs flag as performance/graphics-risky. Relevant if/when
  `experiment/glass-home` (real frosted-glass Home revamp) is ever revisited.

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
3. As of 2026-08-04, the per-card streak indicator is `MiniDayGrid` (a
   circle-grid badge), not the old `RingDayArcs`/`LightweightMissionRing`
   SVG ring (both now dead code, unused) — if Android is slow rendering the
   grid on a long mission, look there first instead of the old ring code.
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
