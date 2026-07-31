# HabitPro Work History

This is a concise chronological log for future sessions. Keep secrets out of this file.

## 2026-07-31

### UI/UX Audit Pass, Production OTA, and a Full Color-Token Sweep

Started from an open-ended "audit the app's UI like a design lead" request.
Produced two artifacts (a written audit with a prioritized punch list, and a
palette-directions mockup — Night Ops / Ember & Ash / Field Log, grounded in
real research on Duolingo's color strategy, aviation HUD color coding, and
expedition-journal palettes). Then implemented the punch list's low-effort
items, shipped them as a production OTA, and did a large follow-up color-token
refactor sweep.

**Shipped and OTA'd** (commit `7322dec`, runtime `1.1.35`, both platforms):

- `HabitCard`'s Quick Complete button (checklist missions) now confirms
  before completing a day with unlogged tasks — copy adapts to whether
  zero or some tasks are logged, with "I'll log my tasks" (primary,
  navigates to mission detail) vs "Yes, mark complete" (secondary) per
  explicit user direction on which should read as the default action.
- `src/components/XpGainBadge.tsx`: floating "+N XP · Day D" badge at the
  exact grid cell tapped, using the previously-unused `AnimatedCountText`.
  Found and fixed a left-edge clipping bug (fixed centering offset pushed
  the badge off-screen for column 0) by adding an `align` prop driven by
  column position.
- Leaderboard: medal-disc icons for rank #2/#3 (a first attempt using
  lucide's `Medal` icon with `fill` equal to `color` collapsed into an
  illegible flat blob — replaced with a small colored circle + white star)
  plus a live "Resets in Xh Ym" weekly countdown in `app/(tabs)/compete.tsx`.
- `CohortNudgeChips.tsx`: nudge sends now get the same success haptic +
  scale-pop flourish cheering already had. Separately found and fixed a
  real iOS-only bug in the same file: the chip row's `ScrollView` had
  `canCancelContentTouches={false}`, an iOS-only prop that (per React
  Native's own doc comment) prevents the scroll view from ever taking
  over a touch that started on a child — since every pixel of the row is
  covered by tappable chips, this made the row un-scrollable on iOS only
  (Android ignores the prop). Removed.
- `PulsingBorder.tsx` generalized with an optional `size` prop (compact
  circular badges, not just card-shaped wraps) and wired onto the tab
  bar's unread-invite dot, previously static.

**Explored but explicitly not built into the app**: a from-scratch "Apple
Glass" Home revamp, done as a throwaway, fully-isolated experiment per
direct request ("something that can be reverted, I will not even push
it"). Lives entirely on branch `experiment/glass-home`
(`GlassPanel.tsx`, `HomeGlassBackdrop.tsx` — real `BlurView` frosted
glass, warm gold/indigo tint, animated ambient background reacting to
scroll and tap), one commit, never merged. `main` is unaffected. Also
explored but not committed anywhere: two artifact mockups on different
"glass" and "color identity" directions, for the user to review outside
the codebase.

**Color-token sweep** (three commits: `1a1df99`, `587461d`, plus the
earlier `9226085`/`0783dfe` from the same effort): a repo-wide grep found
~289 hardcoded `isDark ? "rgba(...)" : "rgba(...)"` decisions instead of
going through `theme.ts`, several silently off-palette (stock Tailwind
hex instead of this app's actual token). Added `withAlpha(hex, alphaPercent)`
to `theme.ts` plus two new semantic tokens (`scrim` for backdrop dimming,
`sheen` for the glass-highlight flip), then swept in phases — first two
files by hand, the rest via a scratch Node script that only converts a
pattern when both sides of the ternary confidently match a real token,
leaving ~50 genuinely one-off/ambiguous colors untouched rather than
guessed. Caught real latent bugs along the way, not just tidying: a
`FocusMissionControlModal` (`app/mini/[id].tsx`) referencing
`theme.colors.*` without `theme` ever being destructured from
`useTheme()`, and the same "isDark passed as a prop, no `useTheme()` call,
no `theme` in scope" bug independently in `ShimmerBlock.tsx` and both
`fuel/FuelQuickMinutesStrip.tsx` / `fuel/FuelTimePresetButton.tsx` — all
masked before because the colors were hardcoded literals. Full detail,
including the light-mode `GlassTopHighlight` fix that started this
effort (a first light-mode tint attempt looked like "a flat gray smudge"
and was reverted in favor of rendering nothing in light mode) in
`docs/CURRENT_WORK.md`.

**Validation**: `npx tsc --noEmit` clean after every phase. Visually
spot-checked Home (light mode) in the iOS simulator before the final
commits — no regressions observed. No backend/migration changes this
session.

## 2026-07-26

### Home Screen Premium UI Pass (started) + Living-Memory Hex Animations

User asked for a full, iterative visual overhaul, screen by screen, starting
with the Home tab, plus a "living memory" idea for the mission-detail
honeycomb gallery. Landed in three iterations, each replacing the last:

1. **Fanned hex stack**: stacked-task hexes (2-3 photos already logged for a
   day) rendered as an offset front+2-back-layer fan, periodically shuffling
   which photo read as front via opacity/transform crossfade.
2. **Crash found and fixed**: logging a 3rd task photo while that day's hex
   was on screen crashed the app on both platforms — a per-photo
   `Animated.Value` ref array was resized in a `useEffect` (runs after render),
   so the render that first saw the count grow indexed a not-yet-resized slot
   and called `undefined.interpolate(...)`. Fixed by resizing synchronously in
   the render body instead. See `app-architecture.md` Known Caution Points.
3. **Replaced with a "spring squish"** (user's own idea, judged actually
   *cheaper* than the fan since only one photo is ever mounted at a time):
   hexes render flat at rest and, on a repeating wave timed by grid position
   (not independent random delays), scale down, swap to the next stacked
   photo, and spring back up with a throttled haptic
   (`triggerHexSpringHaptic`, `src/utils/hapticFeedback.ts`). Photos are
   prefetched into the native image cache up front so the swap never shows a
   load flash.

Then started the Home screen pass (`app/(tabs)/index.tsx`,
`src/components/HabitCard.tsx`):

- Ported the mission-detail screen's static glass top-highlight gradient
  (already on Timer/StreakProgressCard) onto every Home card — XP bar, Mini
  Missions banner, mission cards — for visual consistency.
- Added a spring "stack up from below" mount animation to mission cards, with
  a per-card stagger by list position.
- **Bug found and fixed same day**: the entrance animation never played on a
  real cold start, only after switching tabs and back. Root cause:
  `SplashGate.tsx` mounts real app content immediately, underneath its splash
  overlay (a separate top layer, not a gate) — so the animation ran to
  completion invisibly behind the still-opaque splash. Fixed with a new
  one-shot signal, `src/lib/appReadySignal.ts`, that mount-triggered "first
  impression" animations should wait on instead of firing immediately in
  their own effect.

Full detail (constants, tuning numbers, exact call sites) in
`docs/CURRENT_WORK.md`'s top section. `npx tsc --noEmit` and
`git diff --check` clean throughout.

## 2026-07-25

### Mark Day Complete — Checklist Notification-Timing Redesign

User's core complaint: for checklist main missions, the day completed (and
the squad notification fired) the instant the *first* task was logged — made
no sense once a day could have several tasks, and gave no way to log more
than one before the squad was notified. Negotiated across several turns:
explicitly rejected an automatic end-of-day safety-net auto-finalize in favor
of full user accountability, then added a low-friction manual alternative.

Shipped:

- Logging a task now only writes/patches `streakMemories[date].tasks` — it no
  longer toggles completion. Tasks stay editable: re-opening an
  already-logged-but-unlocked task pre-fills `StreakMemorySheet` (new
  `prefill`/`noticeVariant` props, both optional and backward-compatible —
  the classic/mini flows are untouched).
- New explicit **"Mark Day Complete"** button in `ChecklistDaySheet`
  (replaced by a "Day complete" pill once locked), and a matching quick
  one-tap "MARK COMPLETE" action on the Home mission card
  (`HabitCard.tsx`) — both call a new shared store action,
  `markChecklistDayComplete`, so the two entry points can't drift.
  This is the only thing that now advances streak/XP and fires the squad
  notification for a checklist day.
- Verified, by reading the SQL/edge function in full rather than assuming,
  that zero backend changes were needed:
  `tg_habits_notify_challenge_squad_checkin`, `rpc_challenge_memory_detail_v1`,
  and `process-streak-reminders` all react purely to `completed_dates`
  diffs/membership — moving *when* that array gets written is fully
  transparent to all three.

### Follow-up bug (found via on-device testing, same day): first task logged was silently re-completing the day

User retested and hit exactly the bug the redesign above was built to
remove: logging the first task alone completed the day and notified the
squad; the second task then looked "stuck" (tapping it did nothing visible).
Root cause was **not** in the new code — three independent, pre-existing
"self-heal" call sites (`habitStore.ts`'s `completedDatesWithMemoryEvidence`,
a matching effect in `app/habit/[id].tsx`, and `src/lib/sync.ts`'s
`habitFromRow`, which runs on every remote sync) all shared the assumption
that *any* memory entry for a date proves that date should be in
`completedDates` — safe before this redesign, actively wrong the moment a
tasks-only memory could exist pre-completion by design. Fixed by requiring a
classic marker (`note`/`imageUrl`/`imageUri`/`checkInOnly`/`repairSource`)
before counting a memory as completion evidence, in all three places. See
`app-architecture.md` Known Caution Points for the generalized lesson.

`npx tsc --noEmit` and `git diff --check` clean for both the feature and the
fix. Pushed to preview and production (production explicitly requested by the
user after preview confirmation each time).

## 2026-07-24

### Sporadic Blank/Black Carousel — Root Cause and Fix (All Three Carousels)

User reported, with screenshots: viewing a squad-mate's checklist day sometimes
showed a solid black square where a photo should be, and a separate text-only task
*also* rendered the same solid black square instead of its note — plus, sometimes,
even their own local data went blank the same way. Worried it was related to the
Supabase Storage free-tier quota (0.86/1 GB used at the time). Full writeup in
`docs/CATALOG_ARCHITECTURE.md` §14.

- Investigated rather than guessed: the owner's own blank-outs go through the
  `isSelf` local-read path (no network/Storage involved at all), which ruled out
  the quota theory and pointed at a rendering bug instead.
- Root cause, confirmed by reading the code: `DotViewerCarousel`
  (`src/components/CohortPeerStreakDots.tsx`) and `MemoryPhotoCarousel`
  (`app/challenge-memory.tsx`) both gated their entire `FlatList` behind
  `slideWidth > 0`, seeded from `useState(0)` and only ever set via `onLayout`. A
  known React Native quirk — layout measurement inside a `<Modal>` can fire once
  with a stale `0` and never fire again — meant the gate could stay closed
  permanently, rendering nothing at all, for any slide type. `my-journey.tsx`'s
  `JourneyMemoryLightbox` didn't have this bug (reads `useWindowDimensions()`
  directly, no gate) — that's the pattern the other two should have used from the
  start.
- Fixed: both now seed `slideWidth` from `useWindowDimensions()` instead of `0`, so
  something always renders on the first frame; `onLayout` only refines it, never
  blocks it.
- Also added `onError` handling to the `<Image>` in all three carousels (there was
  none anywhere before) — a genuinely broken/inaccessible photo URL now falls back
  to a small "Photo unavailable" state instead of the same silent black square, a
  separate failure mode now guarded against too.
- Also, per direct user feedback on the same screenshots: removed the tinted/boxed
  card look from the text-only slide in all three carousels — just centered white
  text on the existing black backdrop now, no separate card drawn on top.
- `npx tsc --noEmit` and `git diff --check` clean across `CohortPeerStreakDots.tsx`,
  `challenge-memory.tsx`, and `my-journey.tsx`.

### Storage Usage Investigation — Real Bug Found, Not the One Suspected

User noticed Supabase Storage free tier (1 GB) was at 0.86 GB and asked whether the
app uploads full-size, uncompressed camera photos. Investigated both the classic and
checklist upload paths rather than assuming.

- The suspicion was wrong in the way expected: `src/components/StreakMemorySheet.tsx`
  (the one picker sheet shared by both flows) already passes `quality: 0.88` to
  `expo-image-picker`, and all three upload functions in
  `src/lib/streakMemoryStorage.ts` (`uploadHabitStreakMemoryImage`,
  `uploadHabitStreakTaskMemoryImage`, `uploadMiniStreakMemoryImage`) already route
  through `maybeCompressImageForUpload`, which resizes to max width 1280px and
  re-compresses to JPEG quality 0.82 via `expo-image-manipulator` before upload.
- But queried the actual `storage.objects` table for the `streak-memories` bucket
  (via Supabase MCP) rather than trusting the code alone, and found a real problem:
  1020 objects, 531 MB total, average 533 KB — well above what a clean
  1280px/q0.82 JPEG should average. 161 files (16% of objects) were over 1 MB
  (max 4.4 MB) and accounted for **51.8% of all bytes stored** — a majority of
  storage from a small minority of files.
- Root cause: `maybeCompressImageForUpload` had a silent `try { resize+compress }
  catch { return original }` — no logging, no retry. The comment even called out
  "some Android content URIs" as a known failure case for
  `ImageManipulator.manipulateAsync`'s resize step. Every failure there uploads
  the full, uncompressed camera original (several MB) with zero visibility that
  it happened.
- Fixed: added a middle retry tier — if resize+compress throws, retry
  compress-only (no resize), which is more tolerant of the problematic URI
  schemes; only if *that* also throws does it fall back to the original file. Both
  failure tiers now log via `console.warn` (`__DEV__`-gated, matching this
  codebase's convention) so future failures are diagnosable instead of silent.
- Also flagged for the user: "lossless" compression isn't actually what solves
  this — lossless formats (PNG) are *larger* than a well-tuned JPEG for
  photographic content; the existing resize+quality-0.82 approach is the correct
  standard technique for "looks the same, takes less space," already validated by
  the 64% of files landing under 400 KB.
- `npx tsc --noEmit` and `git diff --check` clean. No migration involved.

### iOS Photos Rendering Blank on Android Viewers — Real Root Cause Found

Both fixes above were pushed as an OTA to `preview` and `production` (runtime
`1.1.35`, matching the version-bump isolation strategy established earlier this
session). User re-tested immediately and reported a new, *deterministic* (not
sporadic) pattern: an Android device could see its own photos fine, and could see
an iOS squad-mate's photos fine on *that iOS user's own device* — but when the
Android device viewed the *iOS user's* uploaded photo in the squad dots screen, it
rendered blank, text-only. The reverse worked fine (iOS viewing Android's photos).

- Investigated with real data instead of guessing: downloaded actual uploaded files
  from both test accounts directly via `curl` against their public Supabase Storage
  URLs, then hand-parsed the raw JPEG marker structure with a small Python script
  (no PIL/ImageMagick available in this environment) to compare them byte-for-byte.
- First ruled out: HEIC-mislabeled-as-JPEG (checked — genuine baseline JPEG, valid
  SOI/SOF markers, no `ftyp` box) and stale local `file://` URIs leaking into
  `streak_memories[date].tasks[].proofUrls` server-side (checked via direct SQL
  query against `habits.streak_memories` — every task's stored proof URL was a
  legitimate `https://...supabase.co/storage/...` URL, nothing local).
- Found the actual difference: the iOS account's uploaded JPEGs carried three
  `APP2` marker segments (664 bytes total) — a genuine embedded ICC color profile,
  almost certainly Display P3 (Apple's default wide-gamut camera color space). The
  Android account's uploads had none. iOS's native `expo-image-manipulator`
  implementation embeds this profile when it re-encodes; Android's does not.
- This is a known, real-world compatibility gap: some Android image decoders
  (including React Native's default Android image pipeline in some configurations)
  fail to render a JPEG with an embedded wide-gamut ICC profile at all, while iOS
  decodes the exact same file — profile or no profile — natively either way. This
  fully explains every observed detail: deterministic per capture device (not
  random), works for the iOS owner's own view (iOS-side decode, unaffected), fails
  only for Android viewers of iOS-sourced photos.
- Checked `expo-image-manipulator`'s actual type definitions before assuming a fix
  path — `SaveOptions` only exposes `compress`/`format`/`base64`, no color-space or
  metadata-stripping option at all.
- Fixed with a hand-rolled `stripIccProfile()` in `src/lib/streakMemoryStorage.ts`,
  applied inside `readImageBytesForUpload` (so every upload path gets it for free):
  walks the JPEG's marker sequence and drops any `APP2` (ICC profile) segment
  before the bytes are uploaded. Only removes the color-space metadata hint —
  pixel/scan data is completely untouched. **Verified against the actual
  downloaded file with the confirmed profile**: stripped exactly 664 bytes
  (matching the three `APP2` segments found), output re-parsed afterward and
  confirmed to be a valid JPEG with identical dimensions and zero `APP2` markers
  remaining.
- `npx tsc --noEmit` and `git diff --check` clean.
- Full pattern now documented in `app-architecture.md` Known Caution Points so a
  future "works on one platform, not the other" photo report doesn't require
  rediscovering this from scratch.

### ...But the ICC Fix Wasn't the Actual Bug — Real Root Cause Was an Android Modal Quirk

User re-tested with a brand-new task after the ICC OTA and asked to verify via MCP
directly rather than take it on faith. Did: confirmed the new upload was genuinely
clean (zero `APP2` markers, byte-inspected directly) — and yet Android still
showed solid black for that same, confirmed-clean file. So the ICC fix was real
and correctly implemented, but it wasn't *this* bug.

Escalated the diagnosis with the user step by step rather than guessing at another
fix blind:
- Confirmed the failing photo's URL loads fine in a mobile browser on the same
  Android device — ruled out network, server, RLS/permissions, and the file
  itself all at once, in one test.
- Confirmed real physical device, not an emulator.
- User logged the *same account* (zapron) into an iOS device and confirmed it
  worked perfectly there — meaning the account/data itself was never the
  problem. Combined with "every peer's photo fails on Android, regardless of
  which platform captured it," this fully isolated the bug to Android's
  rendering of the *peer-viewing code path specifically* — nothing about the
  file, account, or network.
- Re-read the entire `CohortPeerStreakDots.tsx` component fresh, end to end,
  looking for what's structurally different between the "own memory" path (always
  worked) and the "peer memory" path (always failed) beyond just "one is
  synchronous, one is async."

**Actual root cause**: your own memory resolves synchronously from local state, so
the `<Modal>` opens with its final content already in place on the very first
frame it becomes visible — and that has always worked. A peer's memory requires
an async RPC round-trip: the Modal opens first showing a "Loading moment…" state,
then the *same already-open* Modal swaps in the real photo content once the fetch
resolves. On Android specifically, content mounted into an **already-presented**
native Modal window can silently fail to render at all, even though the exact
same content mounts fine when present from the Modal's first frame — a known
platform quirk, distinct from (though visually identical to, and easy to conflate
with) both bugs fixed earlier today. iOS's modal presentation doesn't have this
problem, which is exactly why this was Android-only across every test.

- Fixed by keying the `<Modal>` on a content-category string
  (`loading-<date>` / `error-<date>` / `content-<date>` / etc., computed from
  `open`'s current shape) so React fully unmounts and remounts the native modal
  window whenever that category changes, instead of trying to update content
  inside an already-open one. Covers both the checklist carousel and the older
  classic single-photo path, since both render inside this same Modal — matches
  the user's report that "older single mission" screens had the identical
  symptom.
- `npx tsc --noEmit` and `git diff --check` clean.
- Pushed as a third OTA today, same channels/runtime as before (update groups
  `62157324-b206-4303-b2ae-4935ea096afe` / `25812ee7-6112-41db-9ad6-659d7935762f`).

### The Modal-Remount Fix Was Itself Wrong — Fixed Android, Broke iOS

User re-tested immediately and reported the `key`-based remount fix flipped the
bug rather than solving it: Android peer photos now worked, but iOS — which had
never had *any* version of this problem — started showing the identical
"glitches and never loads" symptom for peer photos instead. Root cause of the
regression, reasoned through rather than re-guessed: forcing a `<Modal>` to
remount via a changing `key` tells React to fully unmount the old native modal
and mount a brand new one. Native modal presentation/dismissal takes real
wall-clock time on *both* platforms and isn't synchronized with React's
reconciliation — rapidly tearing one down and putting a new one up in the same
instant is its own source of glitches, just one that happened to manifest as
"now broken on iOS instead" rather than fixing anything cleanly.

- Reverted the `key`-remount approach entirely.
- Real fix: restructured `CohortPeerStreakDots.tsx` so the Modal is **never
  opened until the async RPC fully resolves** — matching the `isSelf` path,
  which has never had any version of this bug on either platform because it
  resolves synchronously and the Modal always opens with final content already
  in place. Loading feedback moved *outside* the Modal entirely: a new
  `pendingTap` state drives a small `ActivityIndicator` shown directly on the
  tapped dot while the fetch is in flight, and `setOpen(...)` is now called
  exactly once per interaction, always with the complete, final state. The
  Modal's own `isLoading` branch and the `key` prop were both removed as dead
  code.
- This is a more fundamental fix than either previous attempt: the Modal now
  never needs to update or remount content mid-flight at all, on either
  platform, for either the self or peer path.
- `npx tsc --noEmit` and `git diff --check` clean.
- Pushed as a fourth OTA today, same channels/runtime (update groups
  `b30c2537-a3fd-4ccf-9d6d-b9d12be71e6b` / `f503277c-7368-4227-aaad-1bb6239b905e`).
- Corrected `app-architecture.md` Known Caution Points to describe the actual
  working fix and explicitly call out the `key`-remount approach as tried and
  reverted, so it isn't mistaken for the right answer by a future agent reading
  the history.

### Confirmed Fixed — Squad Photo-Viewing Saga Closed Out

User tested the fourth OTA on both a physical Android device and a physical iOS
device (same account, zapron, tested on both) and confirmed: peer photos now
load correctly on both platforms, for both fresh and previously-affected
missions, with no glitching. This closes out the full chain from earlier
today — ICC color-profile stripping (fixed a real but different bug) through
two attempted Modal-timing fixes (one Android-only regression, one that broke
iOS) to the final working fix (never open the Modal until data is ready). No
further action needed on this specific issue; see `app-architecture.md` Known
Caution Points for the durable pattern write-ups if anything resembling this
resurfaces later.

## 2026-07-23

### Multi-Task Checklist Missions / Community Catalog (feature, in progress)

Full design lives in `docs/CATALOG_ARCHITECTURE.md` — this entry is a summary, not a
replacement. User-driven, built incrementally with an explicit "test each step before
the next" requirement; nothing here has been committed yet.

- User wanted missions that break into multiple daily tasks (e.g. "get up early,"
  "eat healthy," "gym"), each logged with its own note+photo, shared to Community as
  a swipeable catalog rather than one photo.
- Wrote `docs/CATALOG_ARCHITECTURE.md` capturing the full data model, every design
  decision, and a phased rollout table before writing any code.
- **Phase 0** (migration): `habits.task_checklist`, `community_wins.memory_gallery`,
  additive/nullable, zero effect on existing rows.
  - Applied directly via MCP the first time, before the user set a hard rule: the
    agent must never run `apply_migration` directly, every schema change goes
    through a tracked file the user applies manually. Had to retroactively create a
    matching migration file and rename it to match the version Postgres had already
    recorded, since `supabase db push` tracks migrations by version number and the
    directly-applied one didn't match any local file. Resolved; rule now
    documented in `docs/CURRENT_WORK.md` and `docs/PROJECT_CONTEXT.md`.
- **Phase 1** (client round-trip): types (`src/types/habit.ts`), `sync.ts` row
  mapping, `communityWinsApi.ts` types/selects/mappers. Verified `tsc` clean and a
  manual classic-mission regression pass (zero visible change, as intended).
- **Phase 2** (creation + logging UI): opt-in checklist section in `app/create.tsx`;
  `src/components/ChecklistDaySheet.tsx` (new) + `handleTaskMemoryCommit` in
  `app/habit/[id].tsx` for per-task logging, reusing the existing
  `StreakMemorySheet` component scoped to one task at a time.
  - **Bug found via direct production-data query, not guesswork**: a freshly
    created checklist mission always had `task_checklist: null` on the server
    despite the UI showing it correctly. Root cause: `rpc_sync_dirty_state` (the
    habit push RPC) parses the client's JSON via `jsonb_to_recordset(...) as
    x(id text, ...)` — an explicit column list that predated `task_checklist`.
    Extra fields not named in that list are silently dropped, no error anywhere.
    Fixed in `supabase/migrations/20260723090000_sync_dirty_state_task_checklist.sql`.
    Full explanation now in `app-architecture.md` Sync Architecture section — read
    it before adding any new synced field to `habits`/`mini_missions`.
  - **Second bug, same class as the original iOS paywall fix**: tapping a task
    opened `StreakMemorySheet` while `ChecklistDaySheet`'s Modal was still open
    underneath it — worked on Android (Dialog-backed Modal), silently failed on
    iOS (can't reliably stack a second native Modal over an open one). Fixed by
    closing one Modal before opening the other, and reopening the checklist from
    the task sheet's `onClose` so logging several tasks in a row feels continuous.
  - Verified end-to-end against live production data (not just UI): checklist,
    completed_dates, and streak_memories[date].tasks all confirmed correct via
    direct Supabase queries after the fixes.
- **Phase 3** (sharing): `handleChecklistDayShare` in `app/habit/[id].tsx` + "Share
  catalog" button in `ChecklistDaySheet`. Reuses `postCommunityWin`'s existing
  upsert-on-`(user_id, mini_mission_id)` behavior from Phase 1 — re-sharing updates
  the same feed post in place rather than duplicating or bumping it in the feed.
- **Unshare + per-task include/exclude** (user-requested follow-up questions,
  answered and built same session): "Remove from Community" is a one-way door,
  same semantics as the existing classic-mission revoke
  (`handleHabitMemoryCommunityChange`). Each logged task got an
  `includedInShare` flag (eye/eye-off toggle in `ChecklistDaySheet`) — the
  Share/Update button always sends whichever tasks are currently checked, so the
  same mechanism handles "share only 3 of 4" and "remove one after sharing." If
  unchecking everything empties an already-shared day, it auto-routes to the
  unshare flow instead of erroring.
- **Community feed carousel** (user-requested, Instagram-style): multi-photo posts
  in the main feed render as an inline swipeable carousel (`PhotoCarousel`, defined
  inside `src/components/CommunityWinFeedPost.tsx`) with a dot indicator, instead of
  requiring a tap to a separate lightbox. As you swipe, a task-name row and the note
  text below update live to match the visible photo. Tapping still opens
  `CommunityWinImageLightbox.tsx` full-screen (upgraded from a single `imageUri`
  prop to `images: string[]`), landing on the exact photo swiped to.
  - Scope correction: this surfaced that the main feed
    (`src/components/CommunityWinsFeed.tsx`) needed the same gallery work as the
    originally-planned "Journey tab" phase — the doc didn't originally account for
    it. Fixed for the main feed and the single-post deep link
    (`app/journey-moment/[id].tsx`) first; Journey tab (`my-journey.tsx` and
    `community-player/[id].tsx`) followed as its own increment, see below.
- **Journey tab gallery wiring** (`app/my-journey.tsx`,
  `app/community-player/[id].tsx`): both screens prop-drilled the image-open
  callback as a single URI through several nested leaf/forwarding components
  (`StoryPhotoTile`, `RecentProofBadge`, `MissionProofTile`/`MiniPostTile`/
  `MiniPostCard`, and the `MissionStoryCard`/`GalleryMomentCard`/
  `MissionGalleryModal` chain above them). Refactored both identically: every leaf
  callback signature became `(images: string[], initialIndex?: number) => void`,
  backed by a per-file `galleryImagesForPost(post)` helper (prefers
  `post.memoryGallery`, falls back to `[post.memoryImageUrl]`); top-level
  `lightboxUri: string | null` state replaced with `lightboxImages`/
  `lightboxIndex` feeding `CommunityWinImageLightbox`'s real props directly. The
  old TODO-wrapped single-item-array workaround is gone from both files.
  - Found (and fixed) a **third and fourth instance** of the iOS nested-modal bug
    while doing this: in both files, `MissionGalleryModal` is itself a full-screen
    `<Modal>`, and tapping a photo tile inside it opened the lightbox `<Modal>` on
    top without closing it first — same failure shape as every prior instance.
    Fixed with a `missionBeforeLightboxRef` + unified `openLightbox`/
    `closeLightbox` pair in both files: opening the lightbox closes
    `MissionGalleryModal` first, closing the lightbox reopens it.
  - `npx tsc --noEmit` clean on both files. Not yet retested on-device.
  - Still open: the "×N" photo-count badge on Journey grid tiles (mentioned as
    optional in the architecture doc §5) was not added to either file.
- Explicitly deferred, tracked in `docs/CATALOG_ARCHITECTURE.md` §6, not forgotten:
  logging the same task multiple times a day; squad memory view
  (`app/challenge-memory.tsx`) catalogs; Journey-tab grid photo-count badge; a
  dedicated visual design pass (current UI is functional, reusing existing app
  patterns, not yet the "industry-best" polish the user asked for as the eventual
  bar).
- Validation throughout: `npx tsc --noEmit` and `git diff --check` clean after every
  step; several steps additionally verified against live production Supabase data
  via direct read queries, not just UI observation.
- Nothing in this feature has been committed. Uncommitted file list is in
  `docs/CURRENT_WORK.md`.

### iOS Nested-Modal Bug — Found It's a Broader Pattern, Not Just the Paywall

- User reported the catalog's "Remove from Community" confirm dialog didn't appear
  on iOS (worked fine on Android) — recognized it as the same modal-over-modal class
  of bug from the original paywall fix and asked for a look.
- Confirmed and generalized: `showAppAlert` (`src/context/AppDialogContext.tsx`)
  renders through a real React Native `<Modal>`, not a native OS alert — so it hits
  the exact same "iOS can't stack a second Modal over an open one" limitation as
  `openUpsell` did. This had never been documented; the original fix only covered
  `openUpsell` call sites.
- Fixed: the new catalog unshare flow (`handleChecklistDayUnshare`) and every
  `showAppAlert` inside `handleChecklistDayShare` (`app/habit/[id].tsx`) — each now
  closes the enclosing sheet's Modal before showing the alert and reopens it
  afterward (Cancel, error, or success), except the premium-required paths, which
  intentionally stay closed (matches the original fix's "closes with the paywall"
  trade-off).
- Also fixed: discovered the identical bug already existed, latent, in the
  **pre-existing** classic single-memory revoke flow
  (`handleHabitMemoryCommunityChange`) — never caught before this session, same fix
  applied.
- Flagged but **not fixed**: `handleMemoryCommit`'s publish-time validation alerts
  (~lines 886-963 in `app/habit/[id].tsx`) fire while `StreakMemorySheet` is still
  open (it only closes after `onCommit` resolves) — structurally different from the
  other cases since closing early would interrupt an in-flight async operation.
  Needs its own pass.
- Documented the general pattern in `app-architecture.md` Known Caution Points so
  future dialog/confirm additions inside a sheet default to assuming this bug
  applies, rather than rediscovering it a fourth time.
- Validation: `npx tsc --noEmit` and `git diff --check` clean. Not yet confirmed
  fixed on the user's actual iPhone as of this entry — that's the next thing to
  verify.

### Squad Memory View (`app/challenge-memory.tsx`) Catalog Support

User confirmed Journey tab gallery wiring worked and asked to move on: deferred UI
polish (design pass comes later, once "core functionality" is settled) in favor of
the squad screen — "if somebody is in a mission with someone else, we need to check
and handle how we will take care of this." Full design/status writeup now lives in
`docs/CATALOG_ARCHITECTURE.md` §9.

- This screen (a squad member viewing a squad-mate's specific day, opened from a
  notification or the squad roster) is a genuinely separate code path from
  everything else in the catalog feature — it never touches
  `communityWinsApi.ts` / `community_wins`, it reads straight off the subject's
  `habits.streak_memories[date]` via its own RPC, `rpc_challenge_memory_detail_v1`.
  None of the earlier gallery work reached it automatically.
- **Bug found by reading the RPC's live SQL definition** (via Supabase MCP
  `execute_sql`, not guesswork): checklist-mission days never write the legacy
  top-level `streak_memories[date].note`/`.imageUrl` fields — only
  `.tasks`. The RPC only ever read those two legacy fields, so a squad member
  opening a checklist day saw "Day marked complete" with no photo, even with
  several logged task photos. Same class of bug as `rpc_sync_dirty_state`
  (Phase 2), same root cause shape, just the read side instead of the write side.
- Fixed in a new migration,
  `supabase/migrations/20260723120000_challenge_memory_detail_task_gallery.sql`
  (written this session, **not yet applied** — user applies every migration
  manually). Adds a `tasks` gallery array to the RPC's jsonb response (synced
  photos only, in logged order), and uses the first synced task as a fallback
  cover `note`/`imageUrl` so classic readers of those two fields still get a
  sane value. Gated by the same visibility check that already gated
  `note`/`imageUrl`. Classic single-memory missions get an all-null `tasks` and
  are otherwise untouched.
- Client: `src/lib/challengeMemoryDetail.ts` (new `ChallengeMemoryTaskEntry` type
  + normalizer), `app/challenge-memory.tsx` (new local `MemoryPhotoCarousel` —
  same shape as the main feed's `PhotoCarousel`, dot indicator, live task-name/
  note caption per slide — replaces the single `<Image>` only when a day has
  more than one synced task photo; single-photo days render exactly as before).
  Swapped the screen's bespoke fullscreen photo `Modal` for the shared
  `CommunityWinImageLightbox` used everywhere else in this feature.
- `npx tsc --noEmit` and `git diff --check` both clean.
- **Not yet testable**: the migration needs to be applied
  (`npx supabase db push` or via the Dashboard) before any of this can be
  verified on-device. Until then this screen keeps its old fallback behavior for
  checklist days.

### Group Mission Checklist Propagation (Invite → Join)

User asked a design question after the squad-view fix above: if they create a group
mission with a task checklist and invite someone, does the invitee automatically get
the same multi-task logging? Checked the real join flow rather than assuming — the
answer was no: `challenge_groups.habit_template` (the jsonb template a joiner's
mission is built from) only ever carried `title`/`mode`/`totalDays`/`description`/
`endDate`; `taskChecklist` was never included, so every joiner silently got a classic
single-photo mission. Full writeup in `docs/CATALOG_ARCHITECTURE.md` §10.

- Asked the user to choose between auto-copying the creator's checklist verbatim vs.
  letting each joiner customize their own. Decision: **auto-copy** — simpler, ships
  now, matches how title/duration already propagate; per-joiner customization
  deferred as a possible future follow-up.
- Fixed: `createGroupChallengeFromHabit` (`src/lib/groupChallengesApi.ts`) now
  includes `taskChecklist` in `habitTemplate` when non-empty. Exported the existing
  `parseTaskChecklist` defensive parser from `src/lib/sync.ts` and reused it in
  `handleAcceptGroupInvite` (`app/(tabs)/compete.tsx`) to read the checklist back out
  of the template and pass it into the joiner's `addHabit(...)` call.
- No new migration needed — this is client-side only; the joiner's habit already
  syncs `task_checklist` correctly through the existing (already-fixed)
  `rpc_sync_dirty_state`.
- `npx tsc --noEmit` and `git diff --check` clean. Not yet tested on-device (create a
  checklist group mission, invite a second test account, confirm the joiner gets the
  same tasks).

### Squad Streak-Dots Viewer (`CohortPeerStreakDots.tsx`) — Third Separate Viewer

User tested group mission checklist propagation ("it worked"), then reported: after
setting a group mission's visibility to public, tapping a squad-mate's day dot in the
group screen still just said "Day marked complete," not the catalog. Investigated
before assuming — confirmed this dot row is a **third, independent code path**, not
`app/challenge-memory.tsx` (only reachable via notification deep link) and not the RPC
`rpc_challenge_memory_detail_v1` fixed earlier today. `CohortPeerStreakDots.tsx` has
its own fetch call and its own bespoke modal. Full writeup in
`docs/CATALOG_ARCHITECTURE.md` §11.

- **Two stacked bugs, found by reading the live SQL**: (1) `rpc_cohort_peer_habits_v1`
  and `rpc_challenge_streak_members_page_v1` both precompute a `streak_memory_markers`
  map the dot's tap handler checks client-side *before* deciding whether to fetch full
  detail — both only ever looked at legacy `imageUrl`/`imageUri`/`note` fields, never
  `tasks`, so every checklist day's marker came back empty and the handler
  short-circuited to "check-in only" without ever calling the detail RPC. (2) Even
  when the handler does fetch (classic missions), the modal itself only ever rendered
  a single `note`/`imageUrl` — it discarded `tasks` entirely, so it would still show
  one photo, not a catalog, even after today's earlier RPC fix.
- Fixed in a new migration,
  `supabase/migrations/20260723130000_cohort_peer_streak_task_markers.sql`
  (**not yet applied**) — `create or replace` on both RPCs (pulled their live
  definitions directly from Supabase first, to patch what's actually running rather
  than the original migration files) so `hasPhoto`/`hasNote` also look inside
  `tasks`, and the day-inclusion filter also matches a non-empty `tasks` array.
- Client: `CohortPeerStreakDots.tsx` — `openRemoteMemory` now maps `detail.tasks`
  into the existing `StreakMemory.tasks` client type; a new local
  `DotViewerCarousel` (same paged-`FlatList`-plus-dots shape as the carousels built
  earlier today) replaces the single image when there's more than one task photo,
  plus a task-name/note row that updates per slide. Single-photo/classic days render
  exactly as before.
- `npx tsc --noEmit` and `git diff --check` clean. **Needs both this migration and
  `20260723120000_challenge_memory_detail_task_gallery.sql` applied** before testable.
- **Follow-up**: user reported the carousel appeared but didn't swipe. Root cause:
  `viewerInner` (the modal's content wrapper) was a `Pressable` used only to stop taps
  inside it from bubbling to the backdrop's tap-to-close — but `Pressable` claims the
  touch responder on press-down, which meant the nested horizontal `FlatList` never
  got a chance to claim the pan gesture. Fixed by changing it to a plain `View`
  (matches the other three carousels built earlier today, none of which had an
  ancestor `Pressable`). Minor UX side effect: tapping the photo/note area now also
  closes the modal, same as tapping the backdrop — previously it was swallowed.
  `npx tsc --noEmit` clean.
- **Follow-up 2**: still not swiping. The *outer* `viewerBackdrop` (full-screen,
  `onPress={handleClose}`) was still a `Pressable` and still wrapped the carousel —
  same responder-stealing mechanism, one layer further out. Fixed by making
  `viewerBackdrop` a plain `View` too; this modal now has no backdrop-tap-to-close at
  all (matches `CommunityWinImageLightbox`, which never had one), relying only on
  explicit close buttons — added one to the "loading" state, which had relied on
  backdrop-tap as its only dismiss path before.
- **Follow-up 3**: user separately pointed out text-only tasks (a note, no photo)
  never appeared in any of these carousels — the gallery-building query in
  `rpc_challenge_memory_detail_v1` only ever included tasks with a synced photo.
  Asked how a text-only task should render inside an inherently photo-swiping
  carousel; decided on a **mixed carousel** — text-card slides swipe alongside photo
  slides in the same strip. New migration
  `supabase/migrations/20260723140000_challenge_memory_detail_text_only_tasks.sql`
  (not yet applied) makes `tasks` include note-only entries with `imageUrl: null`,
  and fixes cover-field selection to prefer a task that actually has a photo rather
  than just array index 0. `src/lib/challengeMemoryDetail.ts` relaxed
  `ChallengeMemoryTaskEntry.imageUrl` to nullable. Both `app/challenge-memory.tsx`
  (`MemoryPhotoCarousel`) and `src/components/CohortPeerStreakDots.tsx`
  (`DotViewerCarousel`) now render a text card (icon + note) for slides without a
  photo, and both now show the carousel whenever there's any task gallery at all —
  not just when the day's overall status is "photo" — so a purely-text checklist day
  gets the swipeable treatment too, instead of falling back to a generic state panel.
  Full-screen zoom only opens for photo slides. Explicitly **not** extended to the
  main Community feed, Journey tab, or the sharing gallery itself in this pass — same
  gap exists there, scoped out as a larger, separate follow-up (see
  `docs/CATALOG_ARCHITECTURE.md` §11). `npx tsc --noEmit` and `git diff --check`
  clean.
- **Follow-up 4**: user asked why their own data wasn't showing "as it does in
  normal cases." Traced the actual data flow rather than guessing: `CohortPeerStreakDots`
  had no concept of "this row is mine" at all — it's used for every squad member's
  row in `app/challenge/[id].tsx`, self included. That meant tapping your own dot
  always went through the remote detail RPC (only reflecting already-synced server
  data) instead of local `habit.streakMemories` — the same local state
  `app/habit/[id].tsx` reads directly — and, separately, the dot's own badge
  detection never looked at `memory.tasks`, so a checklist mission's own dots never
  showed photo/note badges or opened the catalog at all (always fell to "check-in
  only"). Fixed with a new `isSelf` prop, passed as `isSelf={myUserId === memberId}`
  from the parent (which already computes `myUserId`). For the self row, once
  already past the visibility gate: memory reads straight from local state (no RPC
  round-trip, matches the mission detail screen exactly including anything not yet
  synced), and local `file://` photos render immediately instead of being gated
  behind the peer-only http(s) check. No migration needed, client-side only.
  `npx tsc --noEmit` and `git diff --check` clean.
- **Correction to Follow-up 4**: the first version of that fix also made `isSelf`
  bypass the visibility gate itself (`isPublic = isSelf || ...`), on the assumption
  there's nothing to hide from yourself. User corrected this: visibility gates
  squad-facing content uniformly, including your own row — a "solo" mission stays
  hidden even from its own owner in this squad-cohort view, exactly matching how
  the classic single-memory flow already works. Being part of a public *group
  mission* doesn't imply a member's individual visibility toggle is public — that's
  a separate, per-member setting. Reverted `isPublic` to depend only on
  `habit.visibility`, never `isSelf`; the local-read/RPC-bypass behavior above only
  ever applies once that gate has legitimately passed. `npx tsc --noEmit` and
  `git diff --check` clean.
- **Follow-up 5 (visual)**: user sent a screenshot of the memory card already used
  on their own mission's day grid (`app/habit/[id].tsx` → `StreakMemoryGallery.tsx`'s
  modal) and asked for `CohortPeerStreakDots`'s squad-dot modal to match it. Ported
  the exact style values rather than eyeballing: card `borderRadius: 24` + 1px
  border + 10px padding (photo now sits inset like a mat, not edge-to-edge); meta
  panel background matches the card instead of a separate panel; added a date +
  **"Day N"** row (the day number was never shown in this modal before) — required
  threading a new `dayNum` field through every `setOpen(...)` call site in the file.
  `app/challenge-memory.tsx` intentionally left unmatched (structurally different,
  no inset mat) — a separate pass if wanted later. `npx tsc --noEmit` and
  `git diff --check` clean.

### Private Journey Mode Never Learned About Checklist Days

User asked what was left in this direction, was told text-only-task support outside
the squad views is a known gap — user clarified that's fine, Community doesn't need
text-only posts. But separately flagged: `app/my-journey.tsx` has a
`journeyMode: "public" | "private"` toggle they'd asked about being confused why
checklist missions weren't showing up under "Private" at all. Investigated rather
than guessed: "Private" isn't a filtered view, it's Public **plus** a second, purely
local story (`buildPrivateStory`, straight from `useHabitStore`) showing days never
shared to Community. The original Journey-tab gallery work earlier this session only
ever touched the shared `communityWinsApi.ts` fetch path — `buildPrivateStory` was a
blind spot never mentioned in either doc.

- Root cause: `buildPrivateStory`'s per-day inclusion check only looked at the
  legacy `imageUrl`/`imageUri`/`note` fields. A checklist day never writes those
  (only `.tasks`), so any checklist-only day never shared to Community was silently
  dropped from Private — a fully-checklist habit that was never shared would show
  zero posts and not even appear in the Private mission list.
- Second gap once the filter was fixed: `privatePostFromMemory` built
  `memoryImageUrl`/`memoryNote` only from those same legacy fields, with no
  fallback to the task gallery — every downstream consumer in the file
  (`StoryPhotoTile`, `photoCount`, grid tiles) keys off `memoryImageUrl`, so a
  checklist day would be included but render blank.
- Fixed, `app/my-journey.tsx` only: inclusion check now also treats non-empty
  `memory.tasks` as content; `memoryImageUrl` falls back to the first task-gallery
  photo (mirrors the existing share-time backfill); new `firstTaskNote()` helper
  falls back `memoryNote` to a task's note for a checklist day where every task is
  text-only — renders through the exact same text-only-card path classic missions
  already use, no new UI needed. The full `memoryGallery` was already being
  attached correctly (from the earlier session's work), so carousel/lightbox
  behavior picks it up automatically once the day is actually included.
- No migration needed — pure local-data bug. `npx tsc --noEmit` and
  `git diff --check` clean.
- **Not checked**: whether `app/community-player/[id].tsx` (viewing someone else's
  journey) has an equivalent "everything" mode, or is intentionally Public-only
  (plausible by design — showing a stranger's private data wouldn't make sense).

### Journey Tab: Text-Only Tasks in the Swipeable Gallery (Private Only)

Direct follow-up. User confirmed Community sharing not including text-only tasks is
fine (deliberate, not a gap) — but was explicit that private Journey is different:
"private is for the user's own private journey... technically everything is
visible... if a post had text memory also, we are supposed to show the text memory
also in the scroll, just like we did it in the squad." Scoped to
`app/my-journey.tsx`'s private-sourced posts only — Public-sourced posts (used both
by "Public" mode here and by `app/community-player/[id].tsx` entirely) can never
contain a text-only entry, since sharing never produces one.

- The Journey tab's grid tiles only ever show a single cover thumbnail — the actual
  swipe-through-the-catalog experience lives entirely in the fullscreen lightbox
  opened on tap, currently the shared `CommunityWinImageLightbox` (`images:
  string[]`, photo-only, used by 5+ screens app-wide).
- Rather than change that shared component's contract for a capability only one
  screen's one mode needs, built **`JourneyMemoryLightbox`** — local to
  `app/my-journey.tsx`, same chrome (backdrop, X close, "N / M" counter, paged
  swipe) but slide-aware: a gallery item with `imageUrl: null` renders as a text
  card instead of being skipped. This is the 4th local carousel-family component
  built this session (main feed, `challenge-memory.tsx`, `CohortPeerStreakDots.tsx`)
  — kept local rather than extracted into a shared one, consistent with the other
  three.
- `src/lib/communityWinsApi.ts`: `CommunityMemoryGalleryItem.imageUrl` relaxed to
  `string | null`. The Community-sourced parser (`storyMemoryGallery`) is
  untouched — still requires a real photo; only the local private-story builder in
  `my-journey.tsx` actually produces a null.
- `memoryTaskGallery()` (the private-story builder's local mirror) now keeps a
  text-only task instead of dropping it. `privatePostFromMemory`'s cover-photo
  fallback tightened from `gallery[0]` to `gallery.find(g => g.imageUrl)`, since
  index 0 can now legitimately be a text-only entry logged before a later photo
  task.
- Every leaf component's image-open callback changed from `(images: string[],
  initialIndex?)` to `(slides: CommunityMemoryGalleryItem[], initialIndex?)` —
  mechanical, same shape of change as the earlier Journey-tab refactor, just
  carrying the note along instead of a flattened URL.
- `app/community-player/[id].tsx` and the main feed deliberately untouched — both
  Public-only, this can never trigger there.
- `npx tsc --noEmit` and `git diff --check` clean.

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

### iOS "Purchase Could Not Start" (App Store Connect account setup, not code)

- After the OTA above shipped the modal fix, the paywall opened correctly on TestFlight but tapping Subscribe still failed. This turned out to be entirely App Store Connect / Apple account configuration — no further app code changes were needed.
- Diagnosed live via RevenueCat MCP (`get-product-store-state`) instead of guessing from the app's generic client-side error message. Chain of blockers, each confirmed via the API before moving to the next:
  1. Both products (`monthly` id `prode4fcaf4068`, `yearly` id `prod44b7d98260`) showed `MISSING_METADATA`.
  2. Missing Review Information screenshot — physical-device screenshots kept failing App Store Connect's exact-dimension check. Fixed by capturing pixel-perfect from Simulator: `xcrun simctl io booted screenshot`.
  3. Still `MISSING_METADATA` — the subscription group's own Localization (separate from each product's localization) was empty. Filled in: display name "HabitPro Community", app name "HabitPro".
  4. Still `MISSING_METADATA` — Privacy Policy URL was empty (App Store Connect → General → App Privacy → Edit, not "App Information"). Set to `https://habitpro-web.vercel.app/privacy`.
  5. Status flipped to `READY_TO_SUBMIT`, but purchases still failed. Root cause: Business → Agreements, Tax and Banking — the `Paid Apps Agreement` was still `New` (only `Free Apps Agreement` was Active). Required Legal Entity info, signing the Paid Apps Agreement, a W-8BEN (India/US treaty, Article 12, 15%, "Income from the sale of applications"), and a linked bank account.
  6. Even after Agreements/Banking/Tax showed Active, purchases failed for a period — propagation delay, commonly ~24h reported for this class of change. Resolved on its own with no further changes.
- User confirmed working after the wait. No app code was touched in this part of the session.
- Wrote a reusable, app-agnostic troubleshooting skill for this whole class of issue: `.codex/skills/ios-iap-troubleshooting/SKILL.md`. Read that first if a similar "purchase could not start" / empty offerings / MISSING_METADATA issue comes up again, on this app or any other.
- RevenueCat MCP and Supabase MCP were connected mid-session (`.mcp.json`, not committed — local dev tooling config, intentionally left out of git) and were essential for diagnosing this without relying on the user manually screenshotting every dashboard page.

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
