# HabitPro Current Work

Last updated: 2026-07-31 (UI/UX audit pass: XP completion badge, leaderboard medals + weekly countdown, nudge send feedback, pulsing tab-bar invite dot, iOS nudge-scroll fix, Quick Complete confirmation dialog — all shipped to production OTA on runtime 1.1.35. Followed by a full off-palette color-token sweep across the app, landed in three commits, then a full docs-vs-code audit that found and fixed real drift in five Markdown files. An experimental "Apple Glass" Home revamp exists, fully isolated on branch `experiment/glass-home`, not merged.).

## Session Handoff (2026-07-31, end of session)

**State: clean.** Everything from this session is committed on `main`, nothing
mid-flight, nothing uncommitted except the pre-existing untracked `.mcp.json`
(unrelated to any of this work). `npx tsc --noEmit` and `git diff --check` clean
as of the last commit below.

Commits this session, oldest to newest:
1. `7322dec` — Quick Complete confirmation dialog (checklist missions) + the
   rest of the UI-audit punch list (XP badge, leaderboard medals/countdown,
   nudge feedback, pulsing invite dot, iOS nudge-scroll fix). **OTA'd to
   production**, runtime `1.1.35`.
2. `9226085` — light-mode glass-sheen fix (`GlassTopHighlight` theme-aware,
   de-duplicated across 6 call sites; renders nothing in light mode after a
   tinted attempt looked like "a flat gray smudge" and was rejected).
3. `0783dfe` — `withAlpha()` token helper + manual off-palette fix on Home/
   HabitCard/SettingsModal (the first, smallest slice of the color sweep).
4. `1a1df99` — `scrim`/`sheen` semantic color tokens (foundation only).
5. `587461d` — the rest of the color-token sweep, 47 files, automated via a
   scratch script with a hand-reviewed mapping table; caught 4 real "no
   `theme` in scope" latent-crash bugs along the way.
6. `1322de8` — session log (`docs/CURRENT_WORK.md`, `docs/WORK_HISTORY.md`,
   `docs/PROJECT_CONTEXT.md`, `docs/FUTURE_AGENT_HANDOFF.md`,
   `app-architecture.md`, `agent.md`).
7. **`af4e713` — docs audit**: user asked to verify every Markdown doc against
   actual code/migrations/live EAS+Supabase state. Found and fixed real drift:
   stale runtime/app versions, two features wrongly marked "not yet done" that
   had shipped, two cited functions that don't exist, a live-verified Android
   production-build correction (via `eas build:list`, not guessed), and
   — the big one — `docs/MINI_MISSION_CATALOG_ARCHITECTURE.md` reading as a
   pre-implementation plan for a feature that actually shipped 12 minutes
   before the doc's own commit. Full breakdown of every finding is in that
   commit's message and in `app-architecture.md` / `docs/CATALOG_ARCHITECTURE.md`
   / `docs/MINI_MISSION_CATALOG_ARCHITECTURE.md` themselves (each now has
   inline corrections rather than rewritten history).

**Explicitly deferred, not forgotten — pending decisions for the user, not
open bugs:**
- Un-paywalling community cheering (`canCheer` gate) — proposed during the
  UI audit as a low-effort/high-impact change. User said "let me think, skip
  for now" — genuinely undecided, not declined. Revisit only if the user
  raises it again; don't assume either direction.
- `experiment/glass-home` branch — a from-scratch "Apple Glass" Home revamp
  (real `BlurView` frosted glass, animated ambient background), built as an
  explicit throwaway/revertible experiment. Fully isolated, one commit, never
  merged into `main`. Known limitation if resumed: Android's `BlurView` has
  no real blur (flat tint only) unless `experimentalBlurMethod` is set, which
  Expo's docs flag as risky. Don't merge or continue this without the user
  explicitly asking to pick it back up.
- ~50 remaining hardcoded `isDark ? rgba(...) : rgba(...)` color instances,
  deliberately left unconverted (mostly genuinely one-off colors that would
  gain nothing from becoming a token, plus a couple of legitimately-ambiguous
  cases — see `app-architecture.md`'s "Color token discipline" note and the
  `af4e713` commit message for the full reasoning). Not a to-do list to
  clear — most of what's left shouldn't be tokenized at all.

**If starting a fresh chat from here**: read `agent.md`,
`docs/PROJECT_CONTEXT.md`, this file, and `app-architecture.md` in that order
(the standing convention for this repo), then this section for what just
happened. No need to re-verify anything above — it was tested (`tsc`, `git
diff --check`, a live simulator visual pass on Home in light mode, and a live
EAS/Supabase check for the version-drift finding) before being committed.

## Latest Feature: Off-Palette Color Token Sweep (2026-07-31)

A repo-wide grep found ~289 hardcoded `isDark ? "rgba(...)" : "rgba(...)"`
color decisions scattered across the app instead of going through
`theme.ts`. Several of the most-repeated ones were silently off-palette —
stock Tailwind hex values (e.g. `rgba(99,102,241,...)`) instead of this
app's actual indigo token (`#7C5CF2`/`#5B3FDE`) — the same bug class
`SettingsModal`'s theme-chip fix caught once already, just recurring in
many more places. Swept in phases, each its own commit:

1. **`src/styles/theme.ts`**: added `withAlpha(hex, alphaPercent)` — derives
   a tinted rgba-equivalent directly from a real theme token instead of a
   hand-typed literal. Manually fixed the two most central files (Home,
   `HabitCard`) plus tidied `SettingsModal`'s earlier fix to use it.
2. Automated the rest with a small Node script (not committed to the repo,
   scratch-only) that only converts a pattern when *both* sides of the
   ternary confidently match a known token — anything ambiguous was left
   untouched rather than guessed. Caught two real bugs along the way: a
   corrupted multi-line `import` the script's first version introduced in
   `app/mini/index.tsx` (fixed), and a genuine latent bug in
   `app/mini/[id].tsx`'s `FocusMissionControlModal`, which referenced
   `theme.colors.*` without ever destructuring `theme` from `useTheme()`
   (only `isDark`) — invisible before because the color was a hardcoded
   string, would have been a hard crash once that code path lit up.
3. Added two new semantic tokens, `theme.colors.scrim` (modal/sheet
   backdrop dimming, always dark regardless of app theme) and
   `theme.colors.sheen` (the glass-highlight flip `GlassTopHighlight`
   already used — white in dark mode, dark ink in light mode), then swept
   the neutral black/white/slate backdrop colors the same way. Caught the
   same "component takes `isDark` as a prop, never calls `useTheme()`,
   has no `theme` in scope" bug three more times: `ShimmerBlock.tsx`,
   `fuel/FuelQuickMinutesStrip.tsx`, `fuel/FuelTimePresetButton.tsx` — all
   fixed by importing `darkTheme`/`lightTheme` directly.

**Deliberately left alone**: ~50 remaining instances — mostly genuinely
one-off colors (a teal accent, a custom periwinkle) that appear exactly
once each and don't correspond to any real token, plus one case
(`CohortPeerStreakDots.tsx`'s loading-skeleton background) where only one
side of the ternary matched a token and the other was a deliberate pale
indigo tint, not drift. Converting either would mean guessing at intent.

Commits: `1a1df99` (scrim/sheen tokens), `587461d` (the sweep). Both
follow `9226085` (light-mode glass-sheen fix — GlassTopHighlight is now
theme-aware and de-duplicated across 6 call sites, but renders nothing
in light mode after a first attempt at a light-mode tint looked like "a
flat gray smudge") and `0783dfe` (the `withAlpha()` helper's first use).

Also shipped and OTA'd this session (commit `7322dec`, before the sweep):
`HabitCard`'s Quick Complete button now confirms before completing a
checklist day with unlogged tasks, with copy that adapts to how many are
still pending, and two options — "I'll log my tasks" (primary, navigates
to the mission detail screen) or "Yes, mark complete" (secondary,
proceeds as before). Bundled in the same OTA: an XP-gain floating badge
on habit completion (`src/components/XpGainBadge.tsx`, with a left-edge
clipping fix for the leftmost grid column), leaderboard medal icons for
rank #2/#3 plus a live weekly-reset countdown (`app/(tabs)/compete.tsx`),
matching haptic+flourish feedback on squad nudge sends
(`src/components/CohortNudgeChips.tsx`), a pulsing tab-bar invite dot
(generalized `PulsingBorder` to support a fixed `size` for compact
circular badges), and a real bug fix unrelated to the OTA's main
purpose: `CohortNudgeChips.tsx`'s horizontal `ScrollView` had
`canCancelContentTouches={false}` (iOS-only prop) which made it
impossible to drag-scroll the nudge chip row on iOS specifically —
removed.

**Not merged, fully isolated**: branch `experiment/glass-home` has a
from-scratch "Apple Glass" Home revamp (`GlassPanel.tsx`,
`HomeGlassBackdrop.tsx` — real `BlurView` frosted glass, warm gold/indigo
tint, animated ambient background blobs reacting to scroll and tap) built
at the user's explicit request as a throwaway, revertible experiment.
`main` never had these changes merged in; the branch exists purely to be
revisited later if the direction is wanted. Known limitation if revisited:
Android's `BlurView` renders as a flat tint with zero blur unless
`experimentalBlurMethod` is set (which Expo's own docs flag as
performance/graphics-risky) — the ambient background blobs currently show
as plain unblurred circles on Android.

`npx tsc --noEmit` clean throughout every phase. Visually spot-checked
Home in the iOS simulator (light mode) before committing — no regressions
observed.

## Latest Feature: Day-Grid Checklist Progress Arc (2026-07-27)

Multi-task checklist day in `app/habit/[id].tsx`'s "N-Day Grid": 0/1-task or
nothing-logged-yet days are untouched (same pulsing cyan square). Once some
(not all) of 2+ tasks are logged, the same pulsing square gains a green ratio
arc (`TaskProgressArc`, new). Once all tasks are logged — or the day is
genuinely marked complete — the cell shows the exact same pre-existing
completed-day ring (`HabitGridBrandRing`, cyan/indigo, untouched) as a preview,
before the pulse stops. An earlier attempt at a two-tone concentric-circle
redesign (blue outer / green inner, flipping fully green at 100%) was tried,
rejected, and fully reverted per explicit feedback — this simpler arc-inside-
the-existing-square approach is what shipped.

**Real bug found and fixed during testing**: `effectiveCompletedDates`
(line ~743) unioned `habit.completedDates` with *every date that has any
`streakMemories` entry at all* — a pre-existing mechanism from before the
checklist feature existed, when logging a memory and completing the day were
the same action. For a checklist mission, logging just the *first* task now
creates a tasks-only `streakMemories` entry, which this code silently treated
as "completed" — making the whole grid (and the new arc feature) show every
checklist day as instantly done the moment any task was logged, regardless of
Mark Day Complete. Fixed with the same guard already used elsewhere in this
file (`hasMissingMemoryCompletion`): a memory only counts toward "effectively
completed" if it has real completion evidence (`note`/`imageUrl`/`imageUri`/
`checkInOnly`/`repairSource`), not just the presence of `.tasks`. Classic
(non-checklist) missions are unaffected, since saving a memory there already
is the completing action. `npx tsc --noEmit` and `git diff --check` clean.

This file captures the current working state so future chats do not need the full conversation.

## Latest Feature: Lightbox Carousel Indicator + Captions, Everywhere (2026-07-27)

Two follow-up requests after the bare-task/stack-badge work above:

1. **Stack badge should also appear inside the "View journey" gallery modal**
   (`MissionGalleryModal`/`GalleryMomentCard`), not just the main scrolling cards —
   previously deliberately excluded from that modal per an earlier, unrelated scope
   boundary (glass shimmer/entrance). This is a different, purely informational
   feature, so it now applies there too. `StoryPhotoTile` in both
   `app/my-journey.tsx` and `app/community-player/[id].tsx` lost its
   circle-shape-only gate; the badge now renders in rounded/masonry mode as well,
   repositioned to bottom-left in my-journey.tsx's rounded case (bottom-right is
   already the like-badge's corner there) and bottom-right in community-player's
   `GalleryMomentCard` (its cheer pill sits top-right there, so no clash).

2. **No visual "this is a carousel" cue, and captions never showed.** Tapping a
   multi-photo card opened a swipeable lightbox with only a small "N / M" text
   counter (or nothing, depending on which lightbox) — no dots — and a task's
   `note` was silently dropped before ever reaching the lightbox on every path
   except `my-journey.tsx`'s already slide-aware one.

   Fixed by making **every** full-screen photo lightbox in the app slide-aware
   with a dot row:
   - `src/components/CommunityWinImageLightbox.tsx` — the shared lightbox used by
     `CommunityWinsFeed`/`CommunityWinFeedPost`, `app/journey-moment/[id].tsx`,
     `app/community-player/[id].tsx`, and `app/challenge-memory.tsx`'s photo-zoom.
     Prop changed from `images: string[]` to `slides: CommunityLightboxSlide[]`
     (`{ imageUrl: string | null; note?: string | null }`) — a photo+note slide now
     shows the note as a caption bar over the bottom of the photo; a note-only
     slide (no photo at all) renders as a centered text card; a dot row appears
     under the counter whenever there's more than one slide. All 4 call sites
     updated to build slides instead of bare URL arrays, preserving each task's
     `note` (previously discarded via `.map(g => g.imageUrl)`) —
     `community-player/[id].tsx`'s `galleryImagesForPost` renamed
     `gallerySlidesForPost` and now keeps `note` while still requiring `imageUrl`
     (public-feed policy: photo-only, but photo+text tasks keep their caption).
     `challenge-memory.tsx`'s own call wraps its (deliberately photo-only, since
     its inline carousel already shows notes) `lightboxImages` as
     `{ imageUrl, note: null }` — no behavior change there beyond gaining dots.
   - `app/my-journey.tsx`'s local `JourneyMemoryLightbox` (already slide-aware for
     text-only entries) gained the same caption-bar-over-photo treatment (it
     previously only showed `note` in the no-photo fallback branch, never
     alongside an actual photo) plus the same dot row.

   `app/habit/[id].tsx`, `app/mini/[id].tsx`, and `app/challenge/[id].tsx` don't
   use any lightbox component at all, so nothing to change there.

`npx tsc --noEmit` and `git diff --check` clean across all 9 touched files.

## Latest Fix: Bare Checklist Tasks Missing From Squad Carousel + My Journey (2026-07-26)

Audited a reported gap against an explicit three-tier policy: (1) squad/notification
carousel should show all 4 ways a checklist task can be logged — photo, photo+note,
note-only, or "bare" (opened the task, attached nothing, just committed); (2) the
public Community feed should show only photo-bearing tasks (confirmed already
correct, no change); (3) private My Journey should show photo/photo+note/note-only,
excluding only bare. Found two real, separate bugs against that policy:

- **Squad carousel dropped bare tasks.** `rpc_challenge_memory_detail_v1`'s
  `v_task_gallery` query required `proofUrls[0] like 'http%' OR note is not null` —
  a bare task (neither) matched nothing and silently never reached the client, even
  though every array element in `streakMemories[date].tasks` already represents a
  deliberate user action (only tasks never opened at all are absent — confirmed via
  `handleTaskMemoryCommit` in `app/habit/[id].tsx`, which always appends an entry on
  commit regardless of content). Fixed via new migration
  `supabase/migrations/20260726090000_challenge_memory_detail_bare_tasks.sql`
  (removes the WHERE filter entirely — every logged task is now included) plus the
  matching redundant client-side filter in `src/lib/challengeMemoryDetail.ts:105`
  (`normalizeTaskGallery`), relaxed to only require `taskId`/`label`. The carousel
  renderer (`app/challenge-memory.tsx:187-198`) already falls back to the task's own
  `label` when both `imageUrl` and `note` are null, so no renderer change was needed.
  **Migration written but NOT applied** — needs `supabase db push` or an explicit
  request to apply via MCP.

- **My Journey's public/private merge silently dropped private text-only tasks.**
  `app/my-journey.tsx`'s `dedupeStoryPostsPreferPublic` fully replaced a private
  post with its public counterpart whenever the same day existed in both (to pick up
  real cheer counts/social metadata) — but the public post's `memoryGallery` is
  intentionally photo-only by design (see `CommunityMemoryGalleryItem` doc comment
  in `communityWinsApi.ts`), so any note-only tasks that day had privately vanished
  from the merged "complete" view the moment that same day was also shared
  publicly. Fixed by adding `mergeMemoryGalleries()` — unions both galleries by
  `taskId` (public wins on overlap, private's extra note-only entries are kept) —
  and using it instead of a full replace. Private-only days (never shared) were
  already unaffected; this only bit on days that existed in both public and private
  form. `npx tsc --noEmit` and `git diff --check` clean for both fixes.
## Latest Feature: Player Story Screen — Glass Shimmer + Entrance (2026-07-26)

Same premium-UI pass applied to `app/community-player/[id].tsx` — the screen
reached by tapping a username (public "player story" equivalent of My
Journey). Plain `ScrollView`, not FlashList, so mount-based entrance is the
right and safe choice here (no recycling/viewability risk like My Journey's
masonry tab).

Shimmer added to: `statPanel`, `segmentRow` (Missions/Minis tabs), both
`storyEmptyState` cards ("no public missions/minis yet"), `MissionStoryCard`
(missions list), and `MiniPostTile` (minis grid). `MissionGalleryModal`/
`GalleryMomentCard` (the "View journey" modal opened from a mission card)
deliberately left untouched, mirroring the same scoping the user set for My
Journey's equivalent modal.

Entrance: `MissionStoryCard` uses the existing slide-up `useListCardEntrance`
(per user request — "stack animation on public"), wrapped in its own
`Animated.View` since each card is the sole item in its row (vertical list,
no sibling-stretch risk). `MiniPostTile` uses the fade+scale
`useCardMaterialize` ("appearance animation on minis"), merged directly onto
the tile's own styled element rather than wrapped in an extra `Animated.View`
— `miniGrid` has no `alignItems` override (defaults to `stretch`), and an
extra wrapper level would break that the same way it did on My Journey's
mini-grid earlier this session. `npx tsc --noEmit` and `git diff --check`
clean.

## Reverted: My Journey — Viewport-Triggered Card Entrance (2026-07-26)

Attempted, pushed to preview + production, then **reverted** after the user's
on-device screenshots showed a real regression, not just a missed nicety.

The change below ("Viewport-Triggered Card Entrance") replaced the mount-based
entrance with FlashList's `onViewableItemsChanged`/`viewabilityConfig`, so
cards would start hidden (opacity 0) until they scrolled into view. On
real-device testing (both the Missions and the masonry Minis tab, on initial
load, no scrolling yet), this produced a large blank gap between the header
and the first visibly-animated card — several card-heights of empty space,
with the first "revealed" card sitting well below where it should render.
Since this happened on **both** tabs (masonry and plain list alike), it isn't
a masonry-specific bug — most likely the initial viewability pass is computed
against transient/stale layout metrics (this screen's `ListHeaderComponent`
height changes after async data loads: XP ring, recent-photos strip, stats),
so the first check misjudges which rows are actually on-screen and never
correctly retriggers for the ones near the top. Whatever the precise
mechanism, it made real content invisible/mispositioned on a normal cold
open — worse than the "everything animates on mount, before you scroll"
cosmetic issue it was meant to fix.

**Reverted in full**: `MissionStoryCard`/`MiniPostCard` are back to calling
`useListCardEntrance(index)`/`useCardMaterialize(index)` directly (mount-based,
as before), `my-journey.tsx` no longer has the `Map`-based entrance-value
registries, `onViewableItemsChanged`, or `viewabilityConfig`, and the two hook
files no longer export the standalone `listCardEntranceStyle`/
`cardMaterializeStyle` helper functions added for this attempt (removed as
dead code once no longer used). `npx tsc --noEmit` and `git diff --check`
clean. **Needs to be pushed as an OTA to undo the still-live broken preview/
production update** (update groups `1333a7ab-8c2b-42ea-9f9c-654d4231488c` /
`d5ba591a-b9fa-45fc-84bd-dc1a469d5142`) before this note is fully resolved.

True scroll-triggered entrance (only animate a card the first time it's
actually visible, not on mount) is still a valid, unfulfilled request — a
future attempt should look at manually tracking each cell's `onLayout`
position against the list's own scroll offset instead of relying on
FlashList's built-in viewability callback, given the bug just found here.

## My Journey — Viewport-Triggered Card Entrance (2026-07-26, reverted above)

The true-masonry + materialize entrance above was pushed to `production` as
well as `preview` (update group `1beaaf7e-f697-421e-9fd5-deba9a4b9f13`) after
the user asked to ship it. Immediately after, the user reported the entrance
animation didn't feel connected to scrolling: it looked like every card had
already finished animating by the time they scrolled to see it, rather than
each card animating in as it entered the viewport.

Root cause: both entrance hooks (`useListCardEntrance` on the Missions tab,
`useCardMaterialize` on the Minis tab) fired their animation in a `useEffect`
on **mount** — but FlashList mounts/pre-renders rows ahead of the visible
window (draw-distance/overscan), so most rows had already finished animating
before the user ever scrolled to them. Worse, since FlashList recycles cell
component instances, a recycled cell reused for a *different* item would keep
whatever `Animated.Value` its previous occupant left at `1`, so newly-scrolled
items appearing in a recycled slot wouldn't animate at all — a second,
independent reason the animation only seemed to "happen at load."

Fix: replaced mount-triggered animation with FlashList's native
`onViewableItemsChanged`/`viewabilityConfig` (`itemVisiblePercentThreshold:
15`). Each entrance hook was split into a plain style function
(`listCardEntranceStyle`/`cardMaterializeStyle`, exported from the existing
hook files) that just renders from an externally-supplied `Animated.Value`,
with no internal effect. `my-journey.tsx` now owns two `Map<string,
Animated.Value>` registries (mission-story-key and mini-post-id, in a
screen-level `useRef` so recycling-safe — keyed by stable data id, not
component instance) plus a `Set` of already-fired keys. `onViewableItemsChanged`
starts the spring/timing animation the first time a given key is reported
viewable, and never replays it once fired — so switching tabs back and forth,
pull-to-refresh on already-seen items, and "Load more" pagination (new keys
just aren't in the registry yet, so they animate in normally when scrolled to)
all behave correctly. A small capped stagger (40ms/item, 160ms cap) still
ripples across items that become viewable in the same batch (e.g. the initial
screenful, or a fast scroll). `viewabilityConfig` is a module-level constant
(FlashList warns against changing it on the fly).

`npx tsc --noEmit` and `git diff --check` clean. **Not yet pushed as an
OTA** — this needs on-device confirmation that scroll-triggered entrance
actually feels right (and that viewability tracking doesn't fight masonry's
own measurement pass) before shipping.

## Latest Feature: My Journey Mini-Grid — True Masonry Layout (2026-07-26)

Fourth round of back-and-forth on the same mini-grid entrance animation (see
the three follow-up entries directly below this one for the earlier attempts
and why each fell short). User's final ask: keep cards sized to their own
content (no stretch), pack them Lego-tight with **zero wasted space**
between rows in different columns, and replace the slide-up entrance with a
non-directional "materialize" appearance instead, specifically because a
synchronized slide between differently-sized siblings is what caused the
earlier "leveling" illusion in the first place.

- **True masonry**: `@shopify/flash-list` v2.0.2 (already in use) has a
  native `masonry: true` mode built exactly for this — independent per-column
  packing, requires React Native's New Architecture (already on via
  `app.json`'s `newArchEnabled: true`). Removed `MiniPostRow` and
  `chunkPosts` entirely (no more pre-grouping posts into fixed-size pairs);
  `StoryRow`'s `"mini-row"` variant became a flat `"mini"` variant (one post
  per row item), and `MiniPostCard` is now FlashList's direct `renderItem`
  result for the Minis tab, with `numColumns={miniColumnCount}` and
  `masonry={activeTab === "minis"}` (Missions tab keeps `numColumns={1}`,
  masonry off, unaffected). Deliberately did **not** set
  `optimizeItemArrangement` — it rebalances column heights by reordering
  items, which would break this feed's chronological order; slightly uneven
  columns are the right trade-off, not shuffled dates.
- Masonry's column slot width is computed by FlashList as a *raw*
  `availableWidth / columnCount` — it does not know about the existing
  `getJourneyMiniGridLayout` gap-aware `tileWidth` (which assumes a
  `flexDirection: "row"` layout). Computed a separate `masonrySlotWidth`
  locally in `my-journey.tsx` and left `miniGridGap` as each card's own
  `marginRight`/`marginBottom` instead, so packed cards don't touch. Scope
  stayed limited to `my-journey.tsx` — `community-player/[id].tsx` (a
  different screen, out of scope per the user's earlier explicit
  instruction) still uses the original `getJourneyMiniGridLayout` tileWidth
  and row-pairing, untouched.
- **New entrance animation**: `src/hooks/useCardMaterialize.ts` — opacity +
  scale (0.88→1) via `Animated.timing`/ease-out, no translateY, no spring
  overshoot. Used only by `MiniPostCard`; `MissionStoryCard` and every other
  screen keep the existing slide-up `useListCardEntrance` untouched, since
  only the mini-grid ever had the differently-sized-siblings problem that
  motivated the change.

**Not yet tested on-device** — flagged to the user ahead of time as the real
risk here: FlashList's masonry mode is called out in its own type definitions
as "New arch only," a newer code path than the plain list used everywhere
else, and this is its first use in the app. Needs real verification of
scrolling, "Load more" pagination, and pull-to-refresh interacting correctly
with masonry before calling this done — a clean `tsc`/diff-check does not
cover any of that. `npx tsc --noEmit` and `git diff --check` clean.

## Latest Feature: Premium UI Pass — My Journey Screen (2026-07-26)

Fourth screen in the iterative UI pass. Scope explicitly limited by the user
to `app/my-journey.tsx` itself (the Private/Public + Missions/Minis screen) —
explicitly **excluding** `MissionGalleryModal` and `GalleryMomentCard` (the
full-screen gallery that opens after tapping a mission's "View journey"),
since that's a different "screen" in the user's mental model even though it's
technically a Modal within the same file, not a separate route.

Shimmer added to: `statPanel` (the rank/photos/cheers stats card),
`modeToggle` (`StoryToggle`, the Private/Public tab control), `missionCard`
(`MissionStoryCard`, the main per-mission feed card), `miniCard`
(`MiniPostCard`, the mini-mission grid card), and both `emptyState` cards
(public-error and no-memories-yet). No stack-up entrance animation this
round — only shimmer was requested for this screen. `segmentRow` (the
Missions/Minis tab row) was deliberately skipped: unlike `modeToggle`, it has
no shared card-like background/border, just two independently-styled pill
buttons — nothing to put a card highlight on.

`npx tsc --noEmit` and `git diff --check` clean; confirmed via diff inspection
that nothing near `MissionGalleryModal`/`GalleryMomentCard` was touched.

**Follow-up, same day**: user asked for the stack-up entrance here too — it
had been deliberately left off in the pass above since only shimmer was
requested, but that scope call wasn't surfaced to the user at the time, so it
read as a miss rather than a choice. Added to `MissionStoryCard` and
`MiniPostCard` (both already proper `memo`'d components — hooks-safe). Since
this is now the third place needing the exact same "stack up from below"
math (`HabitCard.tsx` inline, `compete.tsx`'s local `useListCardEntrance`, now
this), extracted a shared `src/hooks/useListCardEntrance.ts` — used here, but
`compete.tsx`'s already-shipped local copy was deliberately left alone rather
than retrofitted (same "don't touch working, already-pushed code without a
reason" call as `GlassTopHighlight` not being retrofitted into Timer.tsx).
`MiniPostRow` (wraps up to 2 `MiniPostCard`s per row) passes its own row
index to every card in the row, so cards animate row-by-row rather than each
individually staggering — a deliberate simplification since column count
isn't available inside the row component. `renderRow`'s `ListRenderItem`
callback threads the FlashList-provided `index` through to both card types.
`npx tsc --noEmit` and `git diff --check` clean.

**Bug found via screenshot, fixed same day (two-part)**: `MiniPostCard`'s
cards sit two per row inside `MiniPostRow`. First issue — wrapping each card
in a separate `<Animated.View>` (the same pattern used everywhere else) made
the *wrapper*, not the actual bordered card, the row's direct flex child; the
card inside only sized to its own content, leaving a gap in the taller
wrapper for any shorter card. Fixed by applying `entranceStyle` directly on
the same element that already carries `styles.miniCard` (making it an
`Animated.View` in place, rather than adding a wrapping level).

Second issue, found only after that fix: `styles.miniGridRow` had
`alignItems: "stretch"` (true original, predates this session's changes) —
with the wrapper bug fixed, stretch now correctly force-matched both cards in
a row to the taller one's height. User clarified that was never actually
wanted: the original "Lego" intent was for each card to size to its *own*
content (title + 0-2 line caption) independent of its row sibling, not
matched/stretched. Changed `miniGridRow` to `alignItems: "flex-start"` so
each card sits at its own natural height, cards starting flush at the same
top edge and ending wherever their own content ends. General lesson: an
entrance-animation wrapper is only layout-transparent when the parent uses
plain top-to-bottom flow — inside any `alignItems`-sensitive row, animate the
actual sized element in place instead of adding a wrapper around it; and
"stretch" vs "flex-start" is a real product decision, not a default to leave
unquestioned. `npx tsc --noEmit` and `git diff --check` clean.

**Third round, same day — perception issue, not a layout bug**: user reported
that even with correctly-different resting heights, the two cards in a
`MiniPostRow` still *looked* the same size while the stack-up animation was
actually playing, only showing their real distinct heights once it settled.
Root cause: both cards in a row were passed the same `index`, so both ran the
identical `Animated.spring` curve — same delay, same start/end values, frame-
for-frame identical motion. Two elements moving in perfect lockstep get
grouped by the eye into one implied shape ("common fate" — a real Gestalt
grouping effect), so the pair reads as a uniform block while moving even
though neither card's actual height ever changed. Fixed by giving each card
in the row its own stagger step (`index * 2 + i`, i.e. true reading-order
position) instead of sharing the row's index — the two cards no longer
animate in perfect sync, so each one's real size stays legible throughout
the motion, not just at rest. `npx tsc --noEmit` and `git diff --check`
clean.

## Latest Feature: Premium UI Pass — Compete Screen (2026-07-26)

Third screen in the iterative UI pass, after Home and squad/cohort. Extended
the glass top-highlight across `app/(tabs)/compete.tsx` — the top
Challenges/Leaderboard segment control, `LeagueRow` (weekly leaderboard rows,
+ its loading skeleton), `ActiveChallengeCard` (active-challenge cards),
`catalogCard` (browse-templates cards), both invite card renderers
(`renderGroupInviteCard`/`renderLiveMiniInviteCard`, + their skeleton), the
recent-wins card, and every generic empty/error-state card.

`LeagueRow` and `ActiveChallengeCard` also got the stack-up spring entrance —
both are proper components (`LeagueRow` already `memo`'d, rendered via
FlashList `renderItem` with `index`; `ActiveChallengeCard` a plain function
component rendered via `.map()`, also given an `index` prop), so unlike the
squad screen's repair cards, hooks are safe here. Extracted a reusable
`useListCardEntrance(index)` hook (same math as `ParticipantCard`'s inline
version) shared by both. `LeagueRow`'s entrance replays for newly-appended
rows after "Load more" on the leaderboard, same mechanism as the squad
screen's "Load more members."

**Same scope note as the squad screen**: `catalogCard`, and both invite-card
renderers, are rendered inline (`.map()`/plain helper functions, not their own
components) — static shimmer only, no entrance, for the same hooks-safety
reason documented there. Extracting them would be a bigger follow-up if full
parity is wanted.

`npx tsc --noEmit` and `git diff --check` clean.

## Premium UI Pass — Squad/Cohort Screen (2026-07-26)

Second screen in the iterative UI pass, after Home. Extended the glass
top-highlight to every card on `app/challenge/[id].tsx` (the squad/cohort
detail screen — Streaks/Activity/Repairs tabs): the tab bar itself
(`detailTabs`), `CohortLeaderHero` (leaderboard spotlight card), every
`ParticipantCard` row (+ its loading skeleton), `SquadActivitySection`'s
accordion card, and both repair-request card states (skeleton + real).
Extracted a shared `src/components/GlassTopHighlight.tsx` for this and all
future additions (existing Home/mission-detail cards left as-is, already
shipped — only new additions use the shared component going forward).

`ParticipantCard` also got the Home screen's spring "stack up from below"
mount animation, staggered by list position — replays for newly-appended rows
after "Load more members" since each gets a genuinely fresh mount/key, giving
the requested "stack up on Load More" feel for the leaderboard specifically.

**Scope note, not done**: the Repairs tab's individual request cards are
rendered inline inside a `.map()` in the screen component itself (not their
own component like `ParticipantCard`), so they can't safely use per-item
`useRef`/`useEffect` hooks — only the static shimmer was added there, not the
stack-up entrance. Extracting them into a `RepairRequestCard` component would
be needed for parity; not attempted without being asked, given the size of
that block (~300 lines of tightly-coupled inline logic).

`npx tsc --noEmit` and `git diff --check` clean.

## Home Screen Premium UI Pass (started 2026-07-26)

User wants a full visual overhaul, screen by screen, evolving toward a more
premium finish while keeping the app's existing flavor — explicitly asked to be
told when this is ready to formalize into `app-architecture.md`, but for now
it's an iterative, screen-by-screen pass driven turn-by-turn, not a planned
architecture doc yet.

Done so far (Home tab, `app/(tabs)/index.tsx` + `src/components/HabitCard.tsx`):

1. **Glass top-highlight on every Home card.** The mission detail screen's
   Timer and StreakProgressCard cards already had a subtle static glass sheen —
   a `LinearGradient` from `rgba(255,255,255,0.10)` to transparent, positioned
   absolute across just the top ~18px, rounded to match the card's own top
   corners (no `overflow: hidden` needed — the gradient never extends past the
   card bounds). Ported the *exact* same treatment (same colors/height) to the
   Home screen's three card surfaces for visual consistency: the XP/Level bar,
   the Mini Missions banner, and every `HabitCard` (main mission card). New
   shared `styles.cardTopHighlight` in `index.tsx`; `HabitCard.tsx` gained its
   own `styles.topHighlight` (mirrors Timer.tsx/StreakProgressCard.tsx) plus a
   new `expo-linear-gradient` import.
2. **"Stack up from below" mount animation for mission cards.** Each
   `HabitCard` now springs in from below (`translateY` starting at +54px,
   opacity 0 → 1) via `Animated.spring` on mount, with a per-card stagger
   (`index * 70ms`, capped at 480ms so a long list's later cards don't wait
   forever) so cards visibly cascade into place rather than all popping at
   once. Deliberately uses the spring's natural overshoot (not clamped on the
   translateY interpolation) for a "punched up by force" feel rather than a
   plain ease-in. `HabitCard` gained a new required `index` prop (its position
   in the currently rendered list — same `index` FlashList's `renderItem`
   already provides, now threaded through from `renderHabitCard`); fully
   skipped when `useReducedMotion()` is on. This is mount-only (empty effect
   dep array) so it does not replay on the once-per-second `nowMs` re-renders —
   it replays on tab switches / list reloads (fresh mounts) and, as a natural
   consequence of FlashList mounting not-yet-seen rows while scrolling, gives
   at least an approximation of "appears as you scroll" for cards further down
   a long list (not true viewability-tracked reveal — that would need
   `onViewableItemsChanged`, not attempted here).

`npx tsc --noEmit` and `git diff --check` both clean.

**Follow-up fix (same day)**: user reported the stack-up entrance never played
on a real cold start — only after navigating to another screen and back. Root
cause: `SplashGate.tsx` mounts the real app content (Home tab included)
*underneath* its splash overlay immediately, well before the overlay actually
dismisses (`MIN_DISPLAY_MS` 2400ms+) — so `HabitCard`'s mount-triggered spring
was running to completion invisibly behind the still-opaque splash, and the
user only ever saw it on a later remount. Fixed with a tiny new one-shot signal,
`src/lib/appReadySignal.ts` (`markAppReady()` / `onAppReady(callback)`), wired
into `SplashGate.tsx`'s `onDismissed` (fires right when the overlay's fade-out
actually finishes). `HabitCard`'s entrance effect now starts its spring inside
`onAppReady(...)` instead of immediately — on the very first launch this waits
for the real reveal; every mount after that (tab switches, scrolling to a new
row) fires synchronously since the signal has already latched, so behavior
elsewhere is unchanged. `npx tsc --noEmit` and `git diff --check` clean. Pushed
to preview (`768640ee-1541-4341-ac25-c0704518570e`) then production
(`1cfb160f-c727-475d-a932-e017ee105243`) at the user's request; no explicit
visual confirmation yet on the shimmer/stagger feel itself (only the splash-race
bug fix was specifically requested and pushed) — worth asking before assuming
the whole Home UI pass is signed off.

## Current Worktree State

Recent local commits:

- `5d6aaa1 feat: integrate StreakProgressCard component and remove StreakBanner for improved UI`
- `0aa0bd7 feat: premium UI pass — palette, touch physics, avatar identity, paywall`
- `cbaf93c docs: log iOS IAP account-setup saga and add reusable troubleshooting skill`
- `82873e2 feat: add live progress sheen and memory formation haptics`
- `664bd13 fix: close sheet before opening upsell paywall to fix iOS stuck state`
- `25efb4e feat: enhance community story fetching with pagination support for missions and minis`
- `63f2b38 docs: log ios revenuecat release prep`
- `fff150f feat: add ios apple login and billing config`

Uncommitted at handoff (this is the whole multi-task checklist mission / community
catalog feature — see "Latest Feature" section immediately below for what it is and
`docs/CATALOG_ARCHITECTURE.md` for full design detail; not yet committed because the
user has not asked for a commit):

- `app/(tabs)/compete.tsx`, `app/challenge/[id].tsx`, `app/challenge-memory.tsx`,
  `app/community-player/[id].tsx`, `app/create.tsx`, `app/habit/[id].tsx`,
  `app/journey-moment/[id].tsx`, `app/my-journey.tsx`
- `src/components/CohortPeerStreakDots.tsx`, `src/components/CommunityWinFeedPost.tsx`,
  `src/components/CommunityWinImageLightbox.tsx`, `src/components/CommunityWinsFeed.tsx`,
  `src/components/Timer.tsx`
- `src/lib/challengeMemoryDetail.ts`, `src/lib/communityWinsApi.ts`,
  `src/lib/groupChallengesApi.ts`, `src/lib/streakMemoryStorage.ts`, `src/lib/sync.ts`
- `src/store/habitStore.ts`, `src/types/habit.ts`
- New, untracked: `docs/CATALOG_ARCHITECTURE.md`, `src/components/ChecklistDaySheet.tsx`,
  `supabase/migrations/20260722181133_add_task_checklist_and_memory_gallery.sql`,
  `supabase/migrations/20260723090000_sync_dirty_state_task_checklist.sql`,
  `supabase/migrations/20260723120000_challenge_memory_detail_task_gallery.sql`,
  `supabase/migrations/20260723130000_cohort_peer_streak_task_markers.sql`,
  `supabase/migrations/20260723140000_challenge_memory_detail_text_only_tasks.sql`
- `.mcp.json` is also untracked — local MCP server config (RevenueCat + Supabase),
  intentionally not committed.
- `npx tsc --noEmit` and `git diff --check` both clean as of this entry.

All five migrations above have been applied by the user to the live database
(`npx supabase db push`) and confirmed working end-to-end as of 2026-07-24 — squad
memory view, streak-dots viewer, and text-only tasks all tested successfully on
both iOS and Android. See "Latest Feature" section for exactly what each one fixes.

Release/build boundaries:

- Do not commit, push, apply Supabase migrations, run EAS builds/updates, publish OTA, or deploy unless the user explicitly asks for that exact action.
- Explicit standing rule as of 2026-07-23: the agent must never run `apply_migration` (or any other direct-to-database write) against Supabase, even for additive/safe-looking changes. Every schema change is a new file under `supabase/migrations/`, reviewed and applied by the user manually (`npx supabase db push`). This was violated once early in the catalog feature work (applied directly, then had to retroactively create a matching tracked file and fix a migration-history version mismatch) — do not repeat that.
- User explicitly asked for iOS/TestFlight guidance and later OTA publishes. Production OTA actions were run only after those explicit requests.
- No git push was requested or run.

Current app version/build:

- Expo/package version: `1.1.35`
- Runtime version: `1.1.35`
- iOS build number: `36`
- Android versionCode: `36`
- **This bump is deliberate and currently isolates all of today's OTA fixes from
  real production users.** Bumped from `1.1.34` specifically so `eas update`
  publishes to `production`/`preview` only reach the user's own test builds (iOS
  TestFlight Internal + Android `preview` APK, both rebuilt at `1.1.35`) — existing
  production users on both platforms are still on `1.1.34` and have received none
  of today's fixes. `1.1.35` is **not** "the current production version" yet; see
  `docs/FUTURE_AGENT_HANDOFF.md` for what's required to actually promote it.

## Next Feature (Planned, Not Started): Mini Mission Multi-Task Catalog

Read `docs/MINI_MISSION_CATALOG_ARCHITECTURE.md` first — it is the source of
truth for this feature (architecture findings, feasibility verdict, phased
rollout table). This is a status pointer only.

What it is: extend the same multi-task-checklist-with-photo-catalog pattern
(built for main missions, see the section immediately below) to Mini Missions —
motivated by two people doing a mini mission together via Live Squad (e.g. one
person live-instructing another through several sub-tasks) wanting to log each
sub-task with its own proof, not just one flat completion photo.

Status as of this entry — Phase 0 and Phase 1 done, Phase 2 (creation UI +
solo logging) not started:

- **Phase 0** (migrations, applied by the user, confirmed clean with zero
  regression to existing single-photo mini flow): `supabase/migrations/20260724100000_mini_mission_task_checklist_and_gallery.sql`
  adds `mini_missions.task_checklist jsonb` and `live_mini_participants.memory_gallery jsonb`,
  and gives `rpc_sync_live_mini_progress` a new optional `p_memory_gallery jsonb`
  param (old 8-arg signature dropped first, not just `create or replace`, to
  avoid Postgres holding two ambiguous overloads).
- **Phase 1** (client types + API round-trip, still inert — no mini mission has
  a checklist yet; `tsc` clean): `MiniMission.taskChecklist` (`src/types/habit.ts`),
  `LiveMiniParticipantRow.memory_gallery` + new `LiveMiniMemoryGalleryItem` type
  (`src/types/liveMiniMission.ts`), `sync.ts`'s `miniFromRow`/`miniToRow`/legacy
  select column list, and `liveMiniMissionsApi.ts`'s `syncLiveMiniMissionProgress`
  now accepts/sends `memoryGallery`. **Second migration found and written during
  this phase, not anticipated by the original investigation**:
  `supabase/migrations/20260724110000_sync_dirty_state_mini_task_checklist.sql`
  fixes `rpc_sync_dirty_state`'s `p_dirty_minis` branch, which has its own
  explicit `jsonb_to_recordset` column list (separate from the habits branch
  already fixed for this same bug class) that predated `task_checklist` and
  would have silently dropped it on every mini-mission push — caught
  proactively by checking this RPC before assuming the round-trip worked,
  exactly the risk the architecture doc flagged in its §6/Known Risks.
- Original investigation context (still accurate): `StreakMemorySheet` needs
  zero changes (checklist logic already lives in the caller, portable as-is);
  Live Squad is async/observational (each participant runs their own local
  mission+timer, synced via Supabase Realtime + `rpc_sync_live_mini_progress`);
  `app/live-mini/[id].tsx` is fully self-contained and never touches
  `CohortPeerStreakDots`/`app/challenge/[id].tsx`, confirming minis don't need a
  cohort-dots equivalent; `CommunityWinFeedPost`'s carousel already renders
  `memory_gallery` generically regardless of `feed_source`, so Community-feed
  display needs no UI work, only a data-path change.
- **Phase 2** (checklist-creation UI + solo per-task logging, `tsc` clean, not
  yet tested on-device): `app/mini/create.tsx` gets the same opt-in checklist
  builder UI as `app/create.tsx` (add/edit/remove task rows), passed through
  `addMiniMission({ taskChecklist })` (`src/types/habit.ts`,
  `src/store/habitStore.ts`). New `src/components/MiniChecklistSheet.tsx` —
  ported from `ChecklistDaySheet`'s pattern but adapted for a mini mission's
  single-session shape (no calendar day, no share/unshare step — Community
  publish for checklist minis is Phase 4, not this phase). In
  `app/mini/[id].tsx`, tapping "Mark Complete" on a checklist mini now opens
  `MiniChecklistSheet` instead of the classic `StreakMemorySheet`; tasks are
  logged one at a time into local draft state via a task-scoped
  `StreakMemorySheet` (reused as-is, same as the habit pattern) and new
  `uploadMiniStreakTaskMemoryImage` (`src/lib/streakMemoryStorage.ts`, mirrors
  `uploadHabitStreakTaskMemoryImage`'s per-task storage path); "Complete
  Mission" aggregates whatever was logged into `completionMemory.tasks` and
  always completes solo (`communityFeedRevoked: true` — same default a classic
  unpublished solo completion already gets).
  - **Two additional bugs found and fixed while wiring this, not anticipated
    by the phase table** — both would have silently dropped every checklist
    mini's task data, the same bug class as the two RPC column-list gotchas
    found in Phases 0/1, just one layer up the stack: (1)
    `completeMiniMission` in `habitStore.ts` rebuilt `completionMemory` from
    an explicit `note`/`imageUri`/`imageUrl` whitelist with no `tasks` case —
    a checklist mini with only task entries and no top-level cover note/photo
    would have produced `completionMemory: undefined` entirely. (2)
    `miniCompletionMemoryFromRow` in `sync.ts` (the read/pull-side parser for
    the `completion_memory` jsonb column) had the identical narrow whitelist
    — tasks would survive the initial local completion but vanish after any
    remote pull (re-login, multi-device, focus-delta refresh). Both fixed
    additively; new `parseStreakMemoryTaskEntries` helper added to `sync.ts`
    for the second fix.
  - **Confirmed working on-device by the user 2026-07-24**: created a
    checklist mini, logged tasks, completed solo, and the task survived an
    emulator refresh — validates both round-trip fixes above. User also
    flagged (not a bug, a scope gap): the mini's own detail screen
    (`app/mini/[id].tsx`) shows no carousel/multi-task indicator after
    completion — the rollout plan never actually assigned that surface to any
    phase (Phase 4 only covers Journey/player-profile/Community feed). User
    chose to skip it for now and continue to Phase 3; revisit later if raised
    again.
- **Phase 3** (Live Squad wiring, `tsc` clean, **not yet tested on-device —
  needs two real accounts, one per platform, matching how the main-mission
  squad bugs were caught**): `syncLiveMiniFromLocalMission`
  (`src/lib/liveMiniMissionProgress.ts`) now builds a `memoryGallery` from
  `completionMemory.tasks` (new `buildLiveMiniMemoryGallery` helper — keeps
  text-only tasks, mirroring the squad-viewer precedent from the main-mission
  build, not the Community-share precedent that drops them) and sends it
  through `rpc_sync_live_mini_progress`'s Phase-0 param. No changes needed in
  `app/mini/[id].tsx` itself — it already re-fetches the completed mission
  from the store before calling this, so `completionMemory.tasks` is already
  present. `ParticipantCard` in `app/live-mini/[id].tsx` now renders
  `row.memory_gallery` as a horizontal thumbnail strip (text-only tasks show
  as a small note card) when present, falling back to the existing
  single-photo block unchanged for classic minis; tapping a tile reuses the
  existing single-image viewer modal as-is. No RPC/migration changes needed
  for the read side — confirmed `_hp_live_mini_snapshot_json`'s `to_jsonb(p)`
  and `normalizeLiveMiniSnapshot`'s pass-through both already carry the new
  column automatically once populated.
  - **Confirmed working on-device by the user 2026-07-24** (two accounts, one
    Live Squad checklist mini together) — one follow-up fix needed and shipped
    same day: `buildLiveMiniMemoryGallery` was filtering out tasks logged with
    neither a note nor a photo ("just mark done"), and `ParticipantCard`'s
    gallery tiles only responded to taps when a photo existed. Fixed: every
    logged task is kept in the gallery now, and the image viewer was
    generalized into one Modal that also renders a full text card for
    no-photo tiles — every tile is tappable.
- **Phase 4** (display + Community publish for checklist minis, `tsc` clean,
  **not yet tested on-device**): user chose full scope (private-Journey fixes
  + Community publish support) over the smaller private-Journey-only option.
  - **Investigation finding, not expected**: most of Phase 4's "display"
    requirement was already built during the main-mission catalog work — it's
    fully generic (`journeySlidesForPost`/`galleryImagesForPost` +
    `CommunityPlayerStoryPost.memoryGallery`, source-agnostic), and
    `MiniPostCard` (`app/my-journey.tsx`)/`MiniPostTile`
    (`app/community-player/[id].tsx`) already call into it. `MiniPostTile`
    needed zero changes. Only two real bugs found and fixed in
    `app/my-journey.tsx`: (1) `buildPrivateStory`'s mini-inclusion filter only
    checked `note`/`imageUrl`, not `.tasks` — silently dropped any
    checklist-only mini from Journey entirely (same bug class found
    repeatedly this session, just never hit minis before this feature
    existed). (2) `MiniPostCard`'s all-text-only branch (no cover photo)
    wasn't wrapped in a tappable `Pressable` — an all-text checklist mini
    couldn't be opened. Fixed with a `hasTextOnlySlides` guard so classic
    note-only minis (which have no gallery to open) don't become falsely
    tappable into an empty lightbox.
  - **Community publish for checklist minis** (previously blocked entirely in
    Phase 2, pending this phase): `MiniChecklistSheet` gained a "Publish to
    Community" toggle (mirrors the classic single-photo mini's toggle;
    enabled only with Community access + at least one task photo). No
    per-task include/exclude — deliberately deferred, matches the
    architecture doc's own note that "editing a shared mini catalog" may not
    be a real use case for a one-shot completion, reassess once this phase is
    stable. `handleChecklistCompleteCommit` (`app/mini/[id].tsx`) now mirrors
    the classic path's premium/publish flow, sends a photo-only gallery
    (text-only tasks dropped, matching the established Community-share
    convention — the opposite of Phase 3's squad-viewer convention, which
    keeps them) through `postCommunityWin`. Written to close the sheet
    *before* any `showAppAlert`/`openUpsell` call from the start, rather than
    repeating the still-open gap already documented for the classic path in
    `app-architecture.md` Known Caution Points.
  - `postCommunityWin` (`communityWinsApi.ts`) needed zero changes — its
    `memoryGallery` param was already generic, not habit-only (stale comment
    fixed). Also found and fixed a second stale/incorrect comment claiming
    `rpc_community_feed_page_v1` doesn't select `memory_gallery` yet — verified
    directly against the migration SQL that it uses `to_jsonb(w)` on the whole
    row, so the column already flows through automatically, same pattern as
    the other "row-based, no update needed" RPCs found in Phase 0.
  - Next action when resumed: on-device test — publish a checklist mini to
    Community at completion, confirm the gallery renders correctly in the
    main Community feed, your own Journey (public and private), and someone
    else's player profile.

## Latest Feature (In Progress): Multi-Task Checklist Missions / Community Catalog

**Read `docs/CATALOG_ARCHITECTURE.md` first — it is the source of truth for this
feature's data model, every design decision, and the phased rollout table. This
section is a status snapshot, not a replacement for that doc.**

What it is: a mission can optionally have a task checklist (e.g. "get up early,"
"eat healthy," "gym") instead of the classic single note+photo per day. Each task
logs its own note+photo. Sharing a day to Community shows it as a swipeable catalog
(inline carousel with a per-slide caption) instead of one static photo.

Status as of this entry — built and working on-device:

- **Migration** (Phase 0): `habits.task_checklist`, `community_wins.memory_gallery`,
  both nullable jsonb, zero effect on any existing row/mission. Applied by the user
  via `npx supabase db push`.
- **Client round-trip** (Phase 1): types, `sync.ts` habit row mapping,
  `communityWinsApi.ts` types/selects/mappers all updated to carry the new fields.
- **Checklist creation**: opt-in section in `app/create.tsx` (new missions only,
  empty by default = classic mission unaffected).
- **Per-task logging**: tapping a day on a checklist mission opens
  `src/components/ChecklistDaySheet.tsx` instead of the classic `StreakMemorySheet`;
  each task reuses `StreakMemorySheet` scoped to itself. **Revised 2026-07-25** —
  logging a task no longer completes the day by itself. Tasks stay editable
  (re-opening a logged-but-unlocked task pre-fills the sheet) until the user taps
  the explicit **Mark Day Complete** button, which is the one thing that now
  advances the streak/XP and fires the squad notification. See "Mark Day Complete"
  entry below for full detail — this replaces the "first task logged completes the
  day" decision that was here previously.
- **Sharing/unsharing**: "Share catalog" / "Update shared catalog" in
  `ChecklistDaySheet`, backed by `handleChecklistDayShare` in `app/habit/[id].tsx`.
  Re-sharing updates the same feed post in place (upsert, doesn't duplicate or bump
  position). "Remove from Community" is a one-way door, same semantics as the
  existing classic-mission revoke.
- **Per-task include/exclude**: each logged task has an eye/eye-off toggle
  (`StreakMemoryTaskEntry.includedInShare`); the Share/Update button always sends
  whichever tasks are currently checked — same mechanism whether picking what to
  share the first time or editing what's already shared.
- **Main Community feed carousel**: multi-photo posts render as an inline swipeable
  carousel (`PhotoCarousel`, inside `src/components/CommunityWinFeedPost.tsx`) with a
  dot indicator and a live per-slide task-name/note caption. Single-photo posts are
  completely unaffected. `CommunityWinImageLightbox.tsx` was upgraded from a single
  `imageUri` to `images: string[]` for full-screen viewing.
- **Journey tab** (`app/my-journey.tsx`, `app/community-player/[id].tsx`): both now
  fully wired for real galleries. Every leaf component's image-open callback
  (`StoryPhotoTile`, `RecentProofBadge`, `MissionProofTile`/`MiniPostTile` in the
  player screen, `MiniPostCard` in the own-journey screen) now passes
  `(images: string[], initialIndex?: number)` via a per-file `galleryImagesForPost`
  helper, feeding real `lightboxImages`/`lightboxIndex` state into
  `CommunityWinImageLightbox`. `npx tsc --noEmit` clean on both files. Not yet
  retested on-device after this specific increment.
  - **Follow-up**: this earlier pass only ever touched the shared
    `communityWinsApi.ts`/`community_wins` fetch path. `app/my-journey.tsx` also has
    a separate `journeyMode: "public" | "private"` toggle — "Private" merges Public
    with a second, purely local story (`buildPrivateStory`, built straight from
    `useHabitStore`, showing days never shared to Community at all). That local path
    was never updated for checklist missions: its inclusion filter only checked the
    legacy note/imageUrl fields, so any checklist-only day that was never shared was
    silently dropped from Private entirely (not misrendered — just absent). Fixed:
    the filter now also treats non-empty `memory.tasks` as content, and
    `privatePostFromMemory` backfills `memoryImageUrl`/`memoryNote` from the task
    gallery the same way the Community-share path already does, including a
    text-only fallback (`firstTaskNote`) for a checklist day where every task has a
    note but no photo. No migration needed, `app/my-journey.tsx` only, `npx tsc
    --noEmit` clean.
  - **Follow-up**: user confirmed Community sharing is fine never including
    text-only tasks (deliberate, not a gap) — but private Journey is meant to show
    "everything," so its swipeable gallery needed the same treatment as the squad
    viewers. Built `JourneyMemoryLightbox` (local to `app/my-journey.tsx`, same
    chrome as `CommunityWinImageLightbox` but slide-aware — a `null` `imageUrl`
    renders as a text card instead of being skipped). `memoryTaskGallery()` now
    keeps text-only tasks; `CommunityMemoryGalleryItem.imageUrl` relaxed to
    `string | null` (Community-sourced data never actually populates null — only
    the local private-story builder does). Every leaf component's image-open
    callback now carries the full slide, not a flattened URL. Deliberately not
    applied to `app/community-player/[id].tsx` or the main feed — both are
    Public-only, where this can never trigger. `npx tsc --noEmit` clean.
  - **Bug found and fixed, all three carousels**: user reported (with screenshots)
    sporadic solid-black squares in place of both photos *and* text-only slides,
    including sometimes for their own local data — worried it was a Supabase
    Storage quota issue (0.86/1 GB free tier). It wasn't. Root cause: both
    `DotViewerCarousel` (`CohortPeerStreakDots.tsx`) and `MemoryPhotoCarousel`
    (`challenge-memory.tsx`) gated their entire `FlatList` behind
    `slideWidth > 0`, seeded from `useState(0)` and only ever set via `onLayout` —
    a known React Native quirk (layout inside a `<Modal>` can measure `0` once and
    never re-fire) meant the gate could stay closed forever, rendering nothing at
    all regardless of slide type. `JourneyMemoryLightbox` didn't have this bug (it
    reads `useWindowDimensions()` directly, no gate). Fixed: both now seed
    `slideWidth` from `useWindowDimensions()` so something always renders
    immediately; `onLayout` only refines it. Also added `onError` handling to the
    `<Image>` in all three carousels (previously none anywhere) for the separate,
    genuine "broken URL" failure mode. Also redesigned the text-only slide in all
    three per user feedback — removed the tinted/boxed card look, now just
    centered white text on the existing black backdrop. `npx tsc --noEmit` and
    `git diff --check` clean.

- **Squad memory view** (`app/challenge-memory.tsx`): now shows catalogs too. This
  screen is a read-only viewer for a squad-mate's day (opened from a notification or
  the squad roster) and reads through its own RPC
  (`rpc_challenge_memory_detail_v1` via `src/lib/challengeMemoryDetail.ts`), a
  completely separate path from `communityWinsApi.ts` — so none of the earlier gallery
  work reached it automatically; it needed its own fix, symmetrical to the
  `rpc_sync_dirty_state` gap but on the read side. New migration:
  `supabase/migrations/20260723120000_challenge_memory_detail_task_gallery.sql`
  **(written, not yet applied by the user)** — adds a `tasks` gallery array to the
  RPC's response, derived from `streak_memories[date].tasks`, synced-photos only.
  Client: `challengeMemoryDetail.ts` types/normalizer, and
  `app/challenge-memory.tsx` renders a new local `MemoryPhotoCarousel` (same shape as
  the main feed's `PhotoCarousel`, with a live task-name/note caption per slide) in
  place of the single photo whenever a day has more than one synced task photo;
  single-photo days are unaffected. The old bespoke fullscreen photo `Modal` was
  swapped for the shared `CommunityWinImageLightbox`. `npx tsc --noEmit` clean.
  **Needs the migration applied before it's testable** — until then this screen still
  falls back to its old "Day marked complete, no photo" behavior for checklist days.
- **Group mission checklist propagation**: creating a group mission with a task
  checklist and inviting someone now auto-copies that checklist to the joiner's own
  mission (previously it silently didn't — the joiner always got a classic
  single-photo mission). Fixed in `src/lib/groupChallengesApi.ts`
  (`createGroupChallengeFromHabit` includes `taskChecklist` in the shared
  `habit_template`) and `app/(tabs)/compete.tsx` (`handleAcceptGroupInvite` reads it
  back out via the now-exported `parseTaskChecklist` from `src/lib/sync.ts`). No
  migration needed, client-side only. `npx tsc --noEmit` clean. Not yet tested
  on-device.
- **Squad streak-dots viewer** (`CohortPeerStreakDots.tsx`, the dot-per-day row shown
  for each squad member in the group screen): a third, separate viewer from the two
  above — user found tapping a public checklist day's dot still just said "Day marked
  complete." Two stacked bugs: (1) the RPCs that precompute the dot's has-photo/
  has-note flags (`rpc_cohort_peer_habits_v1`,
  `rpc_challenge_streak_members_page_v1`) never looked at `tasks`, so the tap handler
  short-circuited before ever calling the detail RPC; (2) the modal itself discarded
  `detail.tasks` even on the success path. Fixed: new migration
  `supabase/migrations/20260723130000_cohort_peer_streak_task_markers.sql`
  **(not yet applied)** patches both marker RPCs; client fix adds a `DotViewerCarousel`
  to the modal, same shape as the other carousels this feature built. `npx tsc
  --noEmit` clean. **Needs both this migration and the previous one applied** before
  it's testable.
  - Follow-up: carousel rendered but didn't swipe — a second ancestor `Pressable`
    (`viewerBackdrop`, the full-screen tap-to-close layer) was still stealing the
    touch responder from the nested `FlatList`. Fixed by making it a plain `View`
    (this modal no longer closes on backdrop tap; a close button was added to the
    "loading" state, which had relied on backdrop-tap before).
  - Follow-up: text-only tasks (note, no photo) were silently dropped from every
    carousel. New migration
    `supabase/migrations/20260723140000_challenge_memory_detail_text_only_tasks.sql`
    **(not yet applied)** makes `rpc_challenge_memory_detail_v1` include note-only
    tasks in `tasks` with `imageUrl: null`; both squad viewers now render a
    text-card slide for those instead of a photo. Main feed / Journey tab /
    Community-sharing gallery still don't — scoped out of this pass, see
    `docs/CATALOG_ARCHITECTURE.md` §11.
  - Follow-up: the viewer's own row in the squad screen didn't match their own
    mission detail screen. `CohortPeerStreakDots` had no self-awareness — tapping
    your own dot always hit the remote detail RPC instead of local state, and badge
    detection never checked `memory.tasks`, so a checklist mission's own dots never
    showed photo/note badges or opened the catalog at all. Fixed with a new
    `isSelf` prop (`app/challenge/[id].tsx` passes `isSelf={myUserId === memberId}`):
    once the visibility gate has already passed (`habit.visibility === 'public'`),
    the self row's memory now reads straight from local
    `habit.streakMemories[dateStr]` (matching `app/habit/[id].tsx` exactly,
    including anything not yet synced), and local `file://` photos render without
    waiting on http(s)-only gating. **Correction**: `isSelf` does *not* bypass the
    visibility gate itself — a "solo" mission stays hidden from its own owner in
    this squad view too, matching the classic single-memory flow exactly (an
    earlier version of this fix bypassed the gate for self; the user caught that
    as wrong and it was reverted). No migration needed, client-side only.
    `npx tsc --noEmit` clean.

Explicitly **not** done yet (tracked in `docs/CATALOG_ARCHITECTURE.md`, not
forgotten):

- The "×N" photo-count badge on Journey grid tiles (both `my-journey.tsx` and
  `community-player/[id].tsx`) — grid thumbnails still show only the cover photo with
  no indicator that a day has more than one task photo behind it.
- Dedicated visual design pass — current UI reuses existing app patterns
  (functional, not yet "industry-best" polished per the user's explicit bar for this
  feature).

Two real bugs found and fixed during this work, worth knowing generally:

1. `rpc_sync_dirty_state` (the habit push RPC) parses an explicit column list via
   `jsonb_to_recordset` — a new synced field is silently dropped if not added there
   too, no error anywhere. Fixed in
   `supabase/migrations/20260723090000_sync_dirty_state_task_checklist.sql`. Full
   writeup in `app-architecture.md` Sync Architecture section — read it before adding
   any new field to `habits`/`mini_missions` sync.
2. Same class of nested-`<Modal>`-on-iOS bug as the original paywall fix below:
   `ChecklistDaySheet`'s Modal was left open when the task's `StreakMemorySheet`
   Modal tried to open on top of it. Worked on Android (Dialog-backed Modal
   tolerates it), silently failed to open on iOS. Fixed by closing one Modal before
   opening the other.

User then reported the catalog's "Remove from Community" confirm dialog specifically
not appearing on iOS (worked on Android) — same nested-Modal bug, different call
site, plus a broader discovery while fixing it:

- `showAppAlert` (`src/context/AppDialogContext.tsx`) renders through a real
  `<Modal>`, not a native OS alert — so it's subject to the exact same "can't stack a
  second Modal on iOS" bug as `openUpsell`. Not previously documented anywhere.
- Fixed: `handleChecklistDayUnshare` (new catalog unshare flow) and every
  `showAppAlert` call inside `handleChecklistDayShare` — all now close
  `checklistDayUi`'s Modal first and reopen it afterward (Cancel/error/success)
  using a captured context, except the two premium-required paths, which
  deliberately don't reopen (matches the existing "closes along with the paywall"
  trade-off from the original fix).
- Fixed: found the identical latent bug already existed in the **pre-existing**
  classic single-memory revoke flow (`handleHabitMemoryCommunityChange` in
  `app/habit/[id].tsx`) — never caught before this session. Same fix pattern
  applied.
- **Not fixed, flagged, still open**: `handleMemoryCommit` in `app/habit/[id].tsx`
  (~lines 886-963) has several `showAppAlert` calls for publish-time validation
  errors ("Photo required," "Sign in to publish," etc.) that fire while
  `StreakMemorySheet`'s Modal is still open — it only auto-closes after `onCommit`
  resolves. Structurally trickier than the others: closing the sheet before the
  async operation (upload/publish) finishes could look premature/jarring. Needs its
  own careful pass, not a rushed fix. Full detail in `app-architecture.md` Known
  Caution Points.
- Full writeup of the pattern (why iOS vs. Android differ, all known instances) is
  now in `app-architecture.md` Known Caution Points — read it before adding any new
  confirm/error dialog inside a sheet.

While wiring the Journey tab gallery support, found a **third and fourth** instance
of the same nested-Modal bug, both pre-existing (not introduced this session):
`MissionGalleryModal` in both `app/my-journey.tsx` and `app/community-player/[id].tsx`
is itself a full-screen `<Modal>`, and tapping a photo tile inside it opened the
lightbox `<Modal>` on top without closing it first. Fixed identically in both files
with a `missionBeforeLightboxRef` + `openLightbox`/`closeLightbox` pair that closes
the gallery modal before showing the lightbox and reopens it after. Not yet retested
on a physical iPhone.

## Latest Feature: Mark Day Complete (Checklist Notification-Timing Redesign, 2026-07-25)

Problem: for checklist main missions, the day used to complete (streak/XP + squad
notification) the instant the *first* task was logged. With multiple tasks per day
this meant a squad notification could fire after just one of several tasks, and
logging a second/third task later that day did nothing further — confusing, and
not what the user wanted once a day could have many tasks.

Negotiated design (explicitly rejected an automatic end-of-day safety-net
auto-finalize in favor of full user accountability, then added a low-friction quick
action instead):

- **Scope**: checklist main missions only (`habit.taskChecklist` non-empty).
  Classic single-photo/note missions and mini missions are completely untouched —
  zero prop/behavior changes on either path.
- **Tasks stay editable until the day is marked complete.** Re-tapping an
  already-logged task (while the day isn't locked) reopens `StreakMemorySheet`
  pre-filled with its existing note/photo instead of a blank form or a read-only
  view. Once the day *is* completed, tasks lock to view-only exactly as before.
- **New "Mark Day Complete" button** in `ChecklistDaySheet` (green, same visual
  language as `MiniChecklistSheet`'s "Complete Mission"). Works with zero, some, or
  all tasks logged. This is now the *only* thing that advances the streak/XP and
  fires the squad checklist notification for a checklist day — logging a task no
  longer does either. Replaced by a "Day complete" pill once the day is locked.
- **Quick "Mark Complete" action on the Home card** (`HabitCard.tsx`): a small green
  text CTA next to the existing amber REPAIR CTA, checklist missions only, visible
  only while today's check-in window is open and not yet completed. One tap
  finalizes with whatever's logged so far (or a bare check-in if nothing was
  logged) — the friction-reducing safety net the user asked for in place of
  automation, since "it should be the user's choice."
- **Share catalog stays fully independent** — can be used before or after Mark Day
  Complete, unaffected by any of this.

Implementation:

- New store action `markChecklistDayComplete(id, date, nowMs?)` in
  `src/store/habitStore.ts` — composes the existing `toggleCompletion` +
  `setStreakMemory` actions (reusing their guards: toggleable-date check,
  already-completed no-op), then backfills `{ checkInOnly: true }` only if no task
  was logged for that date. Shared by both the sheet button and the card's quick
  action so the two entry points can't drift.
- `handleTaskMemoryCommit` (`app/habit/[id].tsx`) no longer calls
  `toggleCompletion`/fires the celebration — it only writes/patches
  `streakMemories[date].tasks`. New `handleMarkChecklistDayComplete` calls the new
  store action and fires the confetti/haptic celebration exactly like the classic
  flow.
- `onSelectTask` now branches on whether the day is already completed
  (`habit.completedDates.includes(dateStr)`): locked → `StreakMemorySheet` in
  `view` mode (existing behavior); not locked → always `create` mode, with a new
  `prefill` prop carrying the existing entry's note/photo if there is one.
- `StreakMemorySheet` gained two new optional, backward-compatible props:
  `prefill?: { note?: string; imageUri?: string }` (seeds the form instead of
  blanking it; omitted everywhere else, so no behavior change elsewhere) and
  `noticeVariant?: "locks-on-save" | "editable-until-complete"` (swaps the
  "No edits after you Save" copy for "Editable until you mark the day complete" —
  defaults to the original copy). When editing a prefilled entry, the secondary
  "Just mark done" button is hidden (it would silently wipe the existing photo/note
  otherwise) and "Save" becomes the sole, full-width action.
- Verified no backend/DB changes needed: `tg_habits_notify_challenge_squad_checkin`,
  `rpc_challenge_memory_detail_v1`, and `process-streak-reminders` all react purely
  to `completed_dates` diffs/membership, so moving *when* that array gets written
  (task-time → Mark-Complete-time) is fully transparent to all three — confirmed by
  reading each one in full before implementing, not assumed.
- `npx tsc --noEmit` and `git diff --check` both clean.

**Status as of 2026-07-26 (superseded by events below — kept for the
completedDates/notification-timing detail, not for "what's currently
unconfirmed")**: the Mark Day Complete feature and its two follow-up fixes
(completedDates self-heal, hex-stack crash) all shipped to preview + production
and were confirmed working by the user before the session moved on to the
"living memory" hex animations and the Home Screen Premium UI Pass (both fully
described further down in this file and in `docs/PROJECT_CONTEXT.md`). If
picking this up fresh: read this file top-to-bottom once, since newer sections
were added above older ones as work progressed — the true "what's outstanding
right now" is whatever the *topmost* section says, not this one.

### Follow-up bug (found via on-device testing, fixed 2026-07-25): first task logged was silently re-completing the day

User tested the Mark Day Complete redesign above and hit exactly the bug it was
built to remove: logging the *first* task alone completed the day and fired the
squad notification, and the second task then appeared "stuck" (tapping it did
nothing visible). Root cause was **not** in any of the new code from this
redesign — it was three pre-existing, independent "self-heal" call sites that all
shared one flawed assumption: *any* `streakMemories[date]` entry existing at all
is proof the day should be in `completedDates`. That assumption was safe before
this feature (a memory was never written without also toggling completion in the
same action) and became actively wrong the moment `handleTaskMemoryCommit` started
writing a tasks-only memory entry *before* completion, by design:

1. `app/habit/[id].tsx`'s repair `useEffect` (~line 521) — ran on every `habit`
   change, called `repairHabitCompletedDatesFromMemories` whenever any memory date
   wasn't in `completedDates`.
2. `habitStore.ts`'s `completedDatesWithMemoryEvidence` helper — backing both
   `repairHabitCompletedDatesFromMemories` and `onRehydrateStorage` (runs on every
   app cold start).
3. `src/lib/sync.ts`'s `habitFromRow` (~line 297) — the mapper for every remote
   pull/delta sync; this is the one that made the bug reproduce so reliably and
   fast, since a pull sync shortly follows almost any local write.

All three unconditionally unioned "every memory date key" into `completedDates`.
Fixed by adding a `hasClassicCompletionEvidence` check (one copy in
`habitStore.ts`, one in `sync.ts` — can't share a module between them without a
bigger refactor, so both are commented as mirrors of each other) that only counts
a memory as completion evidence if it carries a **classic**
marker — `note`, `imageUrl`, `imageUri`, `checkInOnly`, or `repairSource` — never a
bare `{ tasks: [...] }`. A checklist day that's genuinely completed via Mark Day
Complete either gets `completedDates` set directly (the normal path — this
self-heal was never actually needed for it) or, when zero tasks were logged,
carries `checkInOnly: true` (still recognized). `app/habit/[id].tsx`'s repair
effect was updated with the identical check so it stops re-triggering the store
action on every keystroke-adjacent re-render while tasks are mid-logging.
`npx tsc --noEmit` and `git diff --check` clean.

### Follow-up feature + crash fix (2026-07-25/26): living hex-stack photo shuffle, then a crash it introduced

Separately from the Mark Day Complete work above: added a "living memory" idea to
`StreakMemoryGallery.tsx` — stacked-task hexes (2-3 photos already mounted behind
the cover) now periodically shuffle which photo reads as front, via a new
`HexPhotoStack` component. Deterministic rotation (front→back1→back2→front, not
random), pure `Animated` opacity/transform on native driver (no new image
requests — every stacked photo is fetched at one consistent, front-tier thumbnail
size up front specifically so a photo rotating to the front never needs a fresh,
differently-sized fetch), skipped entirely when `reduceMotion` is on.

User then hit a real crash, "constant on both Android and iOS," specifically when
logging a mission's **3rd** task photo for a day (and would have kept crashing at
any later growth too, per their report). Root cause: `HexPhotoStack` kept one
`Animated.Value` per stacked photo in a `useRef` array, and grew that array to
match a growing task count inside a `useEffect` — but effects run *after* render.
The render that first saw the day go from 2 to 3 stacked photos indexed
`posRefs.current[2]` before the effect had a chance to grow the array, got
`undefined`, and called `undefined.interpolate(...)` — a hard crash, same on both
platforms since it's a pure JS `TypeError`, not anything native. Only ever
triggered by an *update* to an already-mounted tile (task 2 → task 3 while that
day's hex was still on screen behind the sheet) — a fresh mount always sizes the
ref correctly from its initializer, which is why tasks 1 and 2 never showed it.
Fixed by moving the resize out of the `useEffect` into a plain, guarded `if`
block in the render body — mutating the ref during render takes effect
immediately for that same render, and the paired `setSlotOf` call uses React's
documented "adjust state while rendering" pattern (bounded by an `nRef` check, so
it can't loop). `npx tsc --noEmit` and `git diff --check` clean.

### Superseded (2026-07-26): fanned hex-stack replaced with a "spring squish" idle animation

User pitched a different take on the same "living memory" idea and asked for the
fan dropped entirely: `HexPhotoStack` (offset front + up to 2 rotated/scaled back
layers, always all mounted) is gone, replaced by `HexSpringStack` — a single flat
hex, identical at rest to a classic single-photo tile. At a random interval
(4-9s, and only ~70% of the time it comes due — `HEX_SPRING_TRIGGER_PROBABILITY`
— so it doesn't read as a metronome) it does a quick spring "squish": scale down
(170ms) → swap to the next photo in the stack at the smallest point → spring back
up (`Animated.spring`), with a light haptic timed to the swap. The haptic is
throttled globally (`triggerHexSpringHaptic` in `src/utils/hapticFeedback.ts`, a
900ms shared cooldown) so several hexes springing near-simultaneously can't pile
up into a buzz.

This is actually *cheaper* than the fan it replaced, not more expensive: only one
photo is ever mounted per tile (one `Animated.Value` for scale, one for opacity)
instead of up to three, and — since there's no longer a per-photo array sized to
a variable task count — the entire "stale ref array" crash class from the
previous section can't happen here at all. The one thing this version needs that
the fan didn't: prefetching every stacked photo into the native image cache on
mount (`Image.prefetch`, keyed off a joined-URI string so it doesn't refire on
every unrelated re-render) so the swap at the bottom of the squish is instant
rather than showing a load flash — since only one photo is rendered at a time,
the others would otherwise never have been fetched yet. `npx tsc --noEmit` and
`git diff --check` clean. Not yet seen on-device.

## Latest Fix: iOS Paywall Stuck Behind Sheets

Root cause found and fixed:

- Any component that wraps itself in its own `<Modal>` (Live Squad invite, streak repair, group mission, mission/mini completion memory sheet, custom nudge note, community-player mission journey drawer) and calls `openUpsell(...)` from inside a handler while that Modal is still open hits a known iOS limitation: a second native `<Modal>` presented while a first is still visible frequently fails to render/interact on iOS. Android's `Dialog`-backed `Modal` stacks more forgivingly, so this only showed up on iOS. It looked like tapping Invite/Complete/etc. did nothing ("stuck").
- Fix: close the enclosing sheet (`onClose()` / the relevant `set...(false)` or `set...(null)`) immediately before calling `openUpsell(...)`, so only one native modal is ever presented at a time.
- Fixed in 8 files, 12 call sites:
  - `src/components/LiveMiniInviteSheet.tsx` (create + invite premium checks)
  - `src/components/StreakRepairSheet.tsx` (group repair premium checks)
  - `src/components/GroupChallengeSheet.tsx` (create + invite premium checks)
  - `app/mini/[id].tsx` (`handleCompleteCommit`, mini mission completion + Community publish)
  - `app/habit/[id].tsx` (`handleMemoryCommit`, `handleHabitMemoryCommunityChange`, `squadShareProp.onToggle` — main mission completion + Community publish + squad visibility, all rendered inside `StreakMemorySheet`)
  - `app/challenge/[id].tsx` (`onSubmitCustomNote`, the `CustomNudgeModal` send handler)
  - `app/challenge-memory.tsx` (same `CustomNudgeModal` pattern)
  - `app/community-player/[id].tsx` (`MissionJourneyDrawer` cheer/like handler)
- Trade-off: subscribing from inside one of these sheets now closes the sheet along with the paywall (previously intended to show the paywall on top and return to the same sheet). User must reopen the sheet after subscribing. Small UX cost for the flow actually working on iOS.
- Validated: tested on Android emulator (`npm run android`, JDK via Android Studio's bundled `jbr`, `ANDROID_HOME`/`sdk.dir` configured locally) and iOS Simulator (`npx expo run:ios`, local `.env` needed `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY` added — it was missing before). Both platforms confirmed working after the fix.
- Not fixed in this session, still open: `supabase/functions/revenuecat-webhook/index.ts` crashes (~30-40% of webhook deliveries observed failing in Supabase edge function logs) when a RevenueCat event's `app_user_id` is a `$RCAnonymousID:...` string instead of a real UUID, because the webhook does `UPDATE profiles ... WHERE id = appUserId` without validating it's a UUID first. This can leave `profiles.is_premium` stale in either direction for any user whose event happens to hit it. Deferred; not yet fixed.
- Test account note: `raktim24@gmail.com` (`f90d8ca4-ad7c-4ca8-9646-4633af4a53b3`) had `is_premium` manually set to `false` in Supabase during this session to test the free-user paywall path on a real linked account. Not yet restored as of this entry.

## Latest Fix: iOS Purchase Could Not Start (App Store Connect Account Setup)

After the code fix above, the paywall opened correctly but tapping Subscribe still failed with "Purchase could not start. Make sure this app was installed from TestFlight or the App Store with a tester account." on a real TestFlight build. This was entirely App Store Connect / Apple account configuration, not app code. Diagnosed live via RevenueCat MCP (`get-product-store-state`) rather than guessing from the generic client error. Chain of blockers found and fixed, in order:

1. Both `monthly`/`yearly` products showed `store_status.raw_store_status: MISSING_METADATA`.
2. Missing Review Information screenshot on both products — physical-device screenshots kept failing App Store Connect's exact-dimension check (likely transfer/edit re-encoding). Fixed by capturing directly from a booted Simulator: `xcrun simctl io booted screenshot output.png` — guaranteed pixel-perfect native resolution.
3. Still `MISSING_METADATA` after the screenshot — the **subscription group's own Localization** (display name/app name, separate from each product's own localization) was empty. Filled in via the group page's Localization section.
4. Still `MISSING_METADATA` — **Privacy Policy URL** was empty under App Store Connect → General → App Privacy → "Edit" next to Privacy Policy (not the "App Information" page, which has no such field). Set to `https://habitpro-web.vercel.app/privacy`.
5. Status changed to `READY_TO_SUBMIT` after those three, but purchases still failed. Root cause: **Business → Agreements, Tax and Banking** — the `Paid Apps Agreement` was still status `New` (only the `Free Apps Agreement` was Active, which doesn't cover paid subscriptions). Required completing Legal Entity info, signing the Paid Apps Agreement, a `W-8BEN` tax form (non-US individual — India/US treaty Article 12, 15% rate, "Income from the sale of applications"), and linking a bank account.
6. Even after Agreements/Banking/Tax all showed Active, purchases still failed for a period — this was propagation delay (commonly ~24h reported for this class of Apple account change, not officially documented but consistent with real-world reports). Resolved on its own without any further changes once enough time had passed.
7. The EU Digital Services Act "trader" compliance banner on the same Business page is unrelated/separate — safe to ignore for this issue.

Full reusable checklist for this class of problem (any app, not just HabitPro) now lives in `.codex/skills/ios-iap-troubleshooting/SKILL.md` — read that first if this happens again here or on a different app.

## Latest Product / Release Prep Changes

iOS/TestFlight setup:

- First iOS TestFlight-capable production build was created and submitted through EAS/App Store Connect.
- App Store Connect app id: `6792545017`.
- First iOS build: version `1.1.32`, build `33`.
- Latest local build target: version `1.1.34`, build `35`.
- Bundle id: `com.rakti.habitpro`.
- Internal TestFlight group `Team (Expo)` has the user invited and the build available.
- App encryption compliance was answered as standard/exempt encryption.
- Apple Push Notifications key was created and assigned to `com.rakti.habitpro`.
- Expo push tester successfully delivered a notification to the iPhone TestFlight build.
- Sign in with Apple is enabled in `app.json`, wired in `app/(auth)/login.tsx`, and was reported working on the iPhone TestFlight build after the provisioning profile was regenerated with the Apple sign-in entitlement.
- EAS production env includes `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY`.
- RevenueCat App Store app `habitPro (App Store)` exists for bundle id `com.rakti.habitpro`; its App Store Connect API key and in-app purchase key configuration were verified as present by MCP.
- App Store products `monthly` and `yearly` were imported into RevenueCat, attached to `habitpro_community`, and attached to default offering packages `$rc_monthly` and `$rc_annual`.

Production OTAs published:

- `a2f91b4b-c0fe-4fd3-9bc5-ad6192c4e3ee` (preview) / `79e8c14e-6c93-40d8-980c-87618e9f39ec` (production) — "Mini mission task checklist + Live Squad task gallery (Phases 0-3)", runtime `1.1.35`, published 2026-07-24 at the user's explicit request for on-device testing of the mini-mission catalog Phases 0-3 work above. Only reaches devices already running a native build on runtime `1.1.35` (the user's own TestFlight Internal iOS build + Android `preview` APK) — real production users on `1.1.34` are unaffected, per the existing isolation strategy.
- `d60f4f1d-a8e0-4016-a755-ad75bce3f202` (preview) / `4fbcf0e3-fd24-4885-9cad-d7958fdf1ffe` (production) — follow-up fix found via the same on-device test: `buildLiveMiniMemoryGallery` (`src/lib/liveMiniMissionProgress.ts`) was filtering out any task logged with neither a note nor a photo ("just mark done"), silently dropping it from the Live Squad gallery entirely; and `ParticipantCard`'s gallery tiles (`app/live-mini/[id].tsx`) only responded to taps when a photo existed, so text-only/no-content tiles couldn't "enlarge." Fixed: gallery keeps every logged task now, and the image viewer was generalized into a single Modal that also renders a full text card for tiles with no photo — every tile is tappable.
- `8db157d4-4040-4cea-8db8-b156601613e0` (preview) / `ab61046a-dc58-4f6e-be4c-3114b091836e` (production) — Phase 4 (Journey display fixes + Community publish for checklist minis), confirmed working on-device by the user 2026-07-25.

**Follow-up (not part of the original 5-phase plan, raised by the user after Phase 4
was confirmed)**: Live Squad checklist propagation to joiners. Flagged as a known
gap during Phase 3 testing prep — `app/live-mini/[id].tsx`'s `handleAccept` created
a joiner's own local mini mission fresh, with no checklist at all, so an invitee
never followed the creator's task list, only a flat photo/note completion. Fixed:
new migration `supabase/migrations/20260724130000_live_mini_squad_task_checklist.sql`
**(written, not yet applied by the user)** adds `live_mini_squads.task_checklist
jsonb` and a matching optional param to both `rpc_create_live_mini_squad` and
`rpc_create_live_mini_squad_v2` (old signatures dropped first, same
overload-ambiguity reasoning as the Phase 0 RPC changes). No change needed to the
snapshot read side — `_hp_live_mini_snapshot_json` already uses `to_jsonb(v_squad)`
on the whole row. Client: `LiveMiniSquadRow.task_checklist` (raw jsonb),
`createLiveMiniSquad()` (`liveMiniMissionsApi.ts`) sends it,
`LiveMiniInviteSheet.tsx` passes `mission.taskChecklist` when creating a squad,
`handleAccept` (`app/live-mini/[id].tsx`) parses it via the existing
`parseTaskChecklist` (reused from `sync.ts`, same type as habits/mini missions) and
passes it to `addMiniMission` — mirrors the main-mission group-invite
checklist-propagation fix (`groupChallengesApi.ts`/`compete.tsx`), just for Live
Squad. `tsc` clean.
- OTA published ahead of migration application (user's explicit standing request
  this session to push after each unit of work): `5a16b8ed-25fa-4637-b0fc-6bc26a6fecec`
  (preview) / `c0925951-76fb-4096-a650-57eefb4a5c7b` (production). **Confirmed
  working end-to-end by the user 2026-07-25** (implicit in "we have achieved it...
  as a main mission and as a mini mission" before moving to the cross-flow audit).
- **UX follow-up (2026-07-25, user-requested)**: an invitee previously only
  discovered a Live Squad's task checklist after tapping "Mark Complete" — too late
  to factor into how much time they picked when accepting. Fixed:
  `app/live-mini/[id].tsx`'s accept card now shows a read-only preview of the
  squad's `task_checklist` (parsed via the existing `parseTaskChecklist`) above the
  timer picker, so the invitee sees what they're committing to before choosing a
  duration and accepting. No new migration — reuses the `task_checklist`
  column/RPC param already added for propagation. Hidden entirely for classic
  (non-checklist) Live Squads, zero visual change there. `tsc` clean.
  Published as OTA: `c203aec6-8d3a-4930-acd0-ce0a32a344a4` (preview) /
  `912b5726-44a8-4a30-bc6e-7fede0262d80` (production).
- **Own-detail carousel (2026-07-25, user-reported via screenshot)**: closes the
  exact gap flagged and deliberately skipped earlier in Phase 4 — a completed
  checklist mini's own detail screen (`app/mini/[id].tsx`, the "Your moment"
  section) still showed only a single cover photo, no indication multiple tasks
  were logged. New `src/components/MiniMomentCarousel.tsx` — ported from the main
  Community feed's `PhotoCarousel` pattern (seeds slide width from
  `useWindowDimensions`, not `onLayout`, per the documented bug class), swipeable,
  dot indicator, per-slide task-name/note caption; text-only tasks (no photo) render
  as a text card rather than being dropped, matching this session's "own private
  view shows everything" convention. The full-screen tap-to-enlarge viewer was
  extended the same way as the Phase 3 Live Squad fix — shows either the active
  task's photo or its text card. Classic (non-checklist) minis completely
  unaffected — `mission.completionMemory?.tasks` is `undefined` for them, so the
  existing single-photo path renders exactly as before. No migration. `tsc` clean.
  Published as OTA: `5013e39a-c47b-4a2f-b278-b9c1e8e9bad3` (preview) /
  `b0327ad9-dd57-4550-93fc-8a6d8a591bc9` (production).
- **Main-mission fanned-hex multi-task tile (2026-07-25)**: presented 4 visual concepts
  as an HTML artifact first (count badge / fanned stack / segmented mosaic / halo
  cluster), recommended the fanned stack on render-cost grounds specific to this exact
  gallery's documented Android history, user picked it to actually try. Implemented in
  `src/components/StreakMemoryGallery.tsx` (main missions' honeycomb strip):
  - **Bug found while implementing, more urgent than "no carousel"**: a checklist
    day's memory only ever writes `.tasks` (see `handleTaskMemoryCommit` in
    `app/habit/[id].tsx`) — `memory.imageUrl`/`.imageUri`/`.note` stay `undefined`
    forever for a checklist day. Every branch in this file's tile renderer only ever
    looked at those classic fields, so a checklist day's hex was rendering **blank**
    (just the day-number pill, no cover, no "NOTE" kicker) before this fix — not
    merely lacking a carousel.
  - Fix derives a cover photo/note from `memory.tasks` when the classic fields are
    empty, so single-photo-equivalent checklist days now show correctly again
    regardless of the stack treatment below.
  - Days with 2+ task photos render as a fanned hex stack (front + up to 2 back
    hexes — capped, so render cost never scales with true task count) with an amber
    `×N` chip; days with 0-1 photos render as a single hex, matching the "Cheap,
    recommended" concept's actual cost profile.
  - Tap opens the existing single-photo viewer Modal, now gallery-aware: a
    horizontal paging `ScrollView` across every logged task (fixed 4:5 mat per
    slide, not per-photo `Image.getSize`, to avoid layout jank mid-swipe and an
    aspect fetch per task) with a task-label + "X of N" caption and dot indicator.
    Text-only/no-content tasks render as a text card ("Marked complete — no note
    added." fallback) rather than being dropped — matches the "own private view
    shows everything" convention from `MiniMomentCarousel`, not the Community-share
    convention. Classic single-photo missions verified to fall through every
    branch unchanged (`hasTasks`/`isGalleryOpen` always `false` for them).
  - One implementation snag, not product-relevant: a `transform`-bearing style
    object inside the same large `StyleSheet.create({...})` call degraded
    TypeScript's inference for unrelated sibling keys elsewhere in that object
    (`viewerImg` started failing to typecheck). Fixed by moving the two
    transform-bearing hex-stack styles to plain typed constants outside
    `StyleSheet.create`.
  - No migration — pure client-side, reuses `memory.tasks` already synced by the
    shipped main-mission catalog feature. `tsc` clean.
    Published as OTA: `9143847f-efbc-45c5-8e9a-d988f83610ff` (preview) /
    `25b5a073-60e0-4a07-b0f1-dae2bd3f89f7` (production).
  - **Follow-up bug, user-reported (iOS only tested so far)**: the gallery opened and
    showed the first slide, but didn't swipe. Root cause: the exact same bug already
    documented in `app-architecture.md` Known Caution Points and fixed once before
    in `CohortPeerStreakDots.tsx`'s `DotViewerCarousel` — an ancestor `Pressable`
    (the modal backdrop, plus the inner card wrapper which called
    `e.stopPropagation()`) steals the touch responder from the nested `ScrollView`,
    so it renders but never scrolls. Should have checked that caution point before
    writing this. Fixed identically to the prior instance: both `viewerBackdrop`
    and `viewerInner` are now plain `View`s instead of `Pressable`, relying on the
    existing explicit X close button + the Modal's own `onRequestClose` (Android
    back gesture) instead of tap-to-close-on-backdrop. Also gave the `ScrollView`
    itself an explicit `style`/`contentContainerStyle` (it had none before, sized
    only by its wrapping `View` and each page) — a real gap even if not the root
    cause, matching how the original `PhotoCarousel` this was ported from is
    structured. `tsc` clean. Not yet verified on Android.
    Published as OTA: `c843568e-bac6-4ef8-872b-2974ce44c69e` (preview) /
    `48e6e6e3-a285-4483-94fc-a463d8cb9dab` (production).
  - **Second follow-up bug, user-reported via screenshot**: classic note-only and
    squad-repair hexes (no photo — the ones showing "SAVE"/repair text or a note
    quote before this feature) went completely blank — solid color fill, no text,
    no icon, no day-number pill. Self-inflicted regression, affects every hex, not
    just checklist ones: adding `zIndex: 2` to the shared `hexSvg` style (needed so
    the front stack layer sits above the back1/back2 stack layers) implicitly
    dropped every OTHER absolutely-positioned sibling that had no explicit zIndex —
    `hexOverlay` (the note/repair text+icon layer) and `hexDayPill` (the day-number
    pill) — behind it, since React Native stacks by zIndex first (treating unset as
    0) once *any* sibling declares one, no longer by JSX source order alone. Fixed
    by giving both explicit `zIndex: 3` (above the front hex, below the `zIndex: 5`
    count chip). `tsc` clean.
    Published as OTA: `005b63f4-7340-475f-af27-04820af5e00a` (preview) /
    `1e613726-8542-41ff-b706-767fc2cb6a3f` (production).

- `00fdba0a-081e-4347-af3f-cdb04f51c472` — `Fix iOS network gate foreground refresh`.
- `e36a7398-10f9-44d7-abad-c750ba03c664` — `Fix iOS live mini invite and image performance`.
- `97cb22c0-2958-402d-8dc2-cde2fb5b4d73` — `Fix Android RevenueCat production key`, published with `--environment production`.

Important OTA/env lesson:

- This Mac's local `.env` had a RevenueCat Android `test_...` key. Android release builds intentionally treat `test_` keys as missing.
- Production OTA scripts now include explicit EAS environments:
  - `npm run update:preview` -> `eas update --channel preview --environment preview`
  - `npm run update:production` -> `eas update --channel production --environment production`
- Keep the Mac `.env` updated privately with the real RevenueCat Android `goog_...` key, or rely on EAS `--environment production` for production OTA.

Live Mini / iOS fixes:

- `src/components/NetworkRequiredGate.tsx` now refreshes NetInfo on foreground and waits briefly before confirming offline, preventing false iOS `No internet connection` overlays after returning from background.
- `app/live-mini/[id].tsx` now uses Supabase render thumbnails for inline Live Squad memory images while keeping full-size tap-to-view.
- `src/components/LiveMiniInviteSheet.tsx` wraps invite content in a keyboard-aware scroll container so iPhone keyboards do not cover username search/results.

Main mission visibility sync:

- `supabase/migrations/20260720110000_fix_habit_visibility_sync_rpc.sql` fixes `rpc_sync_dirty_state` so main habit `visibility` is inserted/updated.
- User reported they applied this migration after it was created. Synced Solo/Public mission visibility should be retested on device.

Internet-required app layer:

- Added `@react-native-community/netinfo`.
- Added `src/components/NetworkRequiredGate.tsx`.
- Wired `NetworkRequiredGate` at the end of `RootLayoutNav` in `app/_layout.tsx` so it overlays all screens and swallows touches.
- When internet is unavailable, the app shows a full-screen `No internet connection` blocker with a `Try Again` action.
- Removed the old `Continue offline` button from `app/(auth)/login.tsx`.
- Because NetInfo is a native dependency, this requires a new native build; OTA alone is not enough.

Mini mission finish rule labels:

- `app/mini/create.tsx` keeps clean titles: `Timer Check-In` and `Manual Finish`.
- Added straight pill-style tags: `SOLO` for Timer Check-In and `SOLO / COMMUNITY` for Manual Finish.
- Timer Check-In remains solo-only; Manual Finish can be solo or Live Squad/community.

Logging cleanup and future performance workflow:

- Temporary `console.log` / `console.info` instrumentation was removed from `app` and `src`.
- `src/lib/perfTrace.ts`, `src/lib/jsThreadProbe.ts`, and `src/lib/sync.ts` were quieted.
- Real `console.warn` / `console.error` paths remain.
- Added `.codex/skills/habitpro-performance-investigation/SKILL.md`.
- `agent.md` now says time/performance optimization should use targeted temporary timer logs first, then remove them before production handoff.

Session logging skill:

- `.codex/skills/habitpro-session-logger/SKILL.md` now includes a Markdown audit step:
  - run `rg --files -g '*.md' -g '!node_modules'`
  - review all repo Markdown files against session changes
  - update affected docs only

## Prior Important State

Mission marker regression recovery:

- Preview OTA was published to `preview` from commit `4acde0277ec4025c82b36edc0a6073628555dc85`.
- EAS update group: `683beb51-84b0-4bb8-aa2d-8572757e4bea`.
- Runtime version for that OTA: `1.1.31`.
- Live data still needs these migrations applied before synced retesting:
  - `supabase/migrations/20260719120000_backfill_completed_dates_from_streak_memories.sql`
  - `supabase/migrations/20260719121000_focus_delta_group_creator_timezone.sql`
- User reported `supabase/migrations/20260720110000_fix_habit_visibility_sync_rpc.sql` has been applied.
- The marker fix itself is committed in `61e035c`, `c41cc69`, and `4acde02`.

Mini Mission Timer Check-In:

- `MiniMissionCompletionMode = "manual" | "timer_check_in"`.
- Timer Check-In expires into Complete / Retry / Fail review instead of auto-failing.
- `Fail` persists `status: "missed"`.
- `Retry` restarts the timer.
- Existing mini missions default to manual behavior when `completionMode` is missing.
- Supabase migration for synced mini timer check-in:
  - `supabase/migrations/20260715120000_mini_timer_check_in.sql`

Mission detail / Android performance:

- Active Trail batching and virtualized honeycomb moments are intentional. Do not revert them casually.
- `src/components/StreakMemoryGallery.tsx` uses horizontal `FlashList` columns and React Native `Animated`, not Reanimated.
- Avoid reintroducing `react-native-reanimated` in the gallery while testing with Expo Go unless native Worklets and JS versions are known to match.
- Decorative animations should use `isInteraction: false` when they should not block `InteractionManager`.

## Validation Already Run Recently

After the internet-required layer:

```bash
npx tsc --noEmit
git diff --check
```

After logging cleanup / performance skill:

```bash
npx tsc --noEmit
git diff --check
```

After updating `.codex/skills/habitpro-session-logger/SKILL.md`:

```bash
git diff --check
```

Skill validator note:

- `python3 /Users/raktimmacbook/.codex/skills/.system/skill-creator/scripts/quick_validate.py ...` still fails because local Python is missing the `yaml` module.

## Suggested Test Checklist

Internet-required layer:

- Test in Android emulator/dev build by disabling Wi-Fi/data.
- Confirm full-screen `No internet connection` appears.
- Confirm underlying app buttons do not respond.
- Re-enable network and tap `Try Again`; blocker should disappear.
- Test on a native build, not only Expo Go, because NetInfo is a native dependency.

Mini mission create:

- Confirm Timer Check-In title shows straight `SOLO` pill.
- Confirm Manual Finish title shows straight `SOLO / COMMUNITY` pill.
- Confirm Timer Check-In still hides Live Squad and reserve fuel.
- Confirm Manual Finish still allows Live Squad and reserve fuel.

Release/build:

- Production Android build should include version/runtime `1.1.34` and Android versionCode `35`.
- Production OTA should use `npm run update:production -- --message "<message>"` so EAS uses the `production` environment.
- If building a local APK, use Android Studio's bundled JDK via `JAVA_HOME` unless system Java is installed.
- For Play Store style production Android release, prefer the EAS production AAB path.

## Current Product Backlog Notes

Possible future work:

- Live Squad Timer Check-In with `awaiting_check_in`.
- Sign in with Apple for App Store Review.
- iOS build/TestFlight setup.
- More real-device Android/iOS testing for `NetworkRequiredGate`.
- Further iOS/Android scroll performance pass for long mission detail screens.
- Commit current docs/skill changes if user asks.

## Storage: Image Upload Compression (2026-07-24)

User was concerned Supabase Storage (0.86/1 GB free tier) was filling from
uncompressed camera uploads. It wasn't — `src/lib/streakMemoryStorage.ts` already
resizes to max width 1280px + JPEG quality 0.82 via `expo-image-manipulator` for
every upload path (classic and checklist both). But querying the live
`storage.objects` table showed 161 of 1020 files (16%) were over 1 MB and accounted
for **51.8% of total bytes** — caused by a silent `catch` in
`maybeCompressImageForUpload` that uploaded the full uncompressed original whenever
`ImageManipulator.manipulateAsync`'s resize step threw (known issue with some
Android `content://` URIs). Fixed: added a compress-only retry tier before falling
back to the original, plus `console.warn` logging on both failure tiers so this is
diagnosable going forward instead of silent. No migration, no UI change.
`npx tsc --noEmit` clean.

Both fixes above shipped as an OTA to `preview`/`production` (runtime `1.1.35`).
User re-tested immediately and found a **new, deterministic** issue: an iOS user's
uploaded photo rendered blank specifically when viewed by an Android device (worked
fine for the iOS owner's own view, and Android-uploaded photos worked fine for
everyone). Root cause, confirmed by downloading real uploaded files from both test
accounts and hand-parsing their JPEG markers: iOS's native `expo-image-manipulator`
embeds a wide-gamut ICC color profile (JPEG `APP2` segments, likely Display P3) in
its output; Android's does not. Some Android image decoders fail to render a JPEG
with that profile embedded at all, while iOS decodes either version fine natively.
`expo-image-manipulator`'s `SaveOptions` has no option to control this (checked its
type definitions directly). Fixed with a hand-rolled `stripIccProfile()` in
`src/lib/streakMemoryStorage.ts`'s `readImageBytesForUpload`, applied to every
upload path — removes `APP2` (ICC profile) segments from JPEG bytes before upload;
pixel data untouched. Verified against the actual downloaded file with the
confirmed profile: stripped exactly 664 bytes (matching the 3 `APP2` segments
found), re-parsed the output afterward and confirmed a valid JPEG, identical
dimensions, zero `APP2` markers remaining. `npx tsc --noEmit` clean. Pushed as an
OTA to `preview` and `production` (runtime `1.1.35`, update groups
`804a0934-0c95-48b8-84b7-a1f80879822a` / `69e456f9-a83e-40fc-993b-ece77f3f7591`).
**Only affects newly uploaded photos** — existing files already in Storage still
have the old embedded profile; retest with a freshly logged task, not the
already-uploaded "test1"/"Test 2" entries from earlier testing.

**This alone did not fix it.** User re-tested with a fresh task after the ICC fix
and confirmed via direct MCP inspection that the new upload was genuinely clean
(no `APP2` markers) — yet Android still showed a solid black square for that same,
confirmed-clean file. Escalating diagnosis: confirmed the URL loads fine in a
browser on the same Android device (rules out network/server/file entirely);
confirmed real physical device, not an emulator; confirmed the *same account*
(zapron) works fine when logged into on iOS, and every peer's photo fails on
Android regardless of who captured it — isolating this to Android's rendering of
the "peer" code path specifically, not the file, not the account, not the
network. **Actual root cause**: on Android, content mounted into an
already-presented native `<Modal>` can silently fail to render. Your own memory
resolves synchronously (Modal opens with final content already in place — always
worked). A peer's memory goes through an async RPC — the Modal opens first in a
"Loading moment…" state, then the *same already-open* Modal swaps in the real
photo once the fetch resolves, and that in-place swap is what silently failed on
Android. **First fix attempt** keyed the `<Modal>` on a content-category string
to force React to unmount/remount the native modal window on that transition —
pushed as a third OTA, user re-tested and reported this fixed Android but broke
the *same class* of glitch on iOS instead (rapidly tearing down and
re-presenting a native Modal in one instant is itself risky on both platforms,
not just Android). Reverted that approach. **Actual fix**: never open the Modal
until the async fetch is fully resolved — loading feedback moved to a small
`ActivityIndicator` on the tapped dot itself (`pendingTap` state), and `setOpen`
is only ever called once, with complete data, matching the `isSelf` pattern that
never had this problem on either platform. Pushed as a fourth OTA (update groups
`b30c2537-a3fd-4ccf-9d6d-b9d12be71e6b` / `f503277c-7368-4227-aaad-1bb6239b905e`).
**Confirmed fixed by the user on both Android and iOS** — this entire squad
photo-viewing saga (ICC profile strip + Modal-open-when-ready restructure) is
resolved as of this entry.
