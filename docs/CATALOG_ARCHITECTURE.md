# Multi-Task Daily Catalog — Architecture & Rollout Plan

## 1. Problem statement

Today, logging progress on a long mission (a "main mission" / habit) means tapping one
marker for the day, writing one note, attaching one photo, and optionally posting that
single memory to the community feed. That's fine for a single-task habit ("read 10
pages"), but it doesn't fit a mission built from several distinct daily tasks — e.g.
**"Follow a healthy routine for 21 days"**: get up early, eat healthy, go to the gym, do
yoga, drink water. A user doing that wants to log each task independently, with its own
proof photo, at whatever point in the day they actually did it — and when they share
that day to the community, the post should read as a **catalog**: a swipeable set of
photos for that day, not one flat image.

This document is the single source of truth for how that feature is built. It exists so
that if this kind of "extend an existing single-value record into a multi-item one,
safely, without breaking anyone on an old client" problem comes up again for another
app, the same pattern applies.

## 2. Non-negotiable design principles

1. **Nothing existing breaks.** Every schema change is additive (new nullable columns),
   never a rename/removal/type-change of anything already in use. Old app binaries
   (including whatever's still on the Play Store) must keep working untouched against
   the new schema, forever, even if they never update.
2. **Opt-in per mission, not a global mode switch.** A mission only gets the multi-task
   flow if it actually has a task checklist attached. Every mission created before this
   feature — and every mission a user chooses not to add tasks to — keeps using the
   exact single note+photo flow that exists today, same code path, unmodified.
3. **One unified checklist, not two parallel systems.** We explicitly rejected building
   separate "manual logging" and "pre-planned routine" modes as distinct features — that
   was assessed as needless complexity. Instead there's one flexible task list per
   mission that can start empty (pure manual, user free-adds tasks as they go) or
   pre-seeded (a routine template) — and either way, the *same* screen lets the user add
   an ad-hoc task on top at any time. The "mode" is just a property of whether the
   template happens to be empty, not a fork in the UI or data model.
4. **Ship silently, in small tested steps.** Each phase below should be deployed and
   verified before the next one starts. The migration in particular should be applied
   and left completely inert (nothing reads/writes the new columns) before any UI work
   begins, so there's a clean checkpoint where "did the migration break anything" can be
   answered with certainty before more complexity is layered on.
5. **All migrations go through tracked files, applied manually — never pushed directly
   to the database by the agent.** Every schema change for this feature lives in
   `supabase/migrations/*.sql`, is reviewed before running, and is applied by hand from
   the terminal (e.g. `npx supabase db push` or via the Dashboard), never executed
   directly against production as a side effect of a conversation.
6. **Visually, this has to be genuinely distinctive.** Not a reskinned version of the
   existing single-photo memory card. The explicit goal is for this to feel like nothing
   else in the category — this is called out again in §7.

## 3. Data model

### 3.1 `habits.task_checklist` (new column)

```sql
alter table public.habits add column if not exists task_checklist jsonb;
```

- Nullable, no default (`null` = classic single-memory mission, unchanged behavior).
- Shape when present: `[{ id: string, label: string, order: number }]`.
- This is the optional *seed list* for a mission's daily tasks. Empty/null means the
  day starts with zero tasks and the user free-adds them ("manual"). Populated means the
  day starts pre-filled with those tasks waiting to be logged ("routine"). Same UI
  either way (§2.3).

### 3.2 `habits.streak_memories[dateStr]` (existing jsonb column, extended shape)

No migration needed here — `streak_memories` is already `jsonb`, so this is purely a
client-side shape addition:

```ts
type StreakMemoryDay = {
  // Existing fields — untouched, still written/read exactly as today:
  note?: string;
  imageUrl?: string;
  postedToCommunity?: boolean;
  // ... any other existing fields stay exactly as-is

  // New, optional:
  tasks?: Array<{
    taskId: string;
    label: string;       // snapshot at logging time — survives later template edits
    note?: string;
    proofUrls: string[];  // array from day one, even though v1 UI only ever writes one —
                           // this is the seam that lets "multiple proofs per task" or
                           // "log a task more than once a day" slot in later without
                           // another migration
    loggedAt: string;     // ISO timestamp
  }>;
};
```

Old app versions that only know about `note`/`imageUrl` simply never see `tasks` and
keep working. New app versions can write both the legacy flat fields *and* `tasks` for
a given day, so anything still reading only the old fields (there is nothing left that
does, but hypothetically) still gets a sane cover note/photo.

### 3.3 `community_wins.memory_gallery` (new column)

```sql
alter table public.community_wins add column if not exists memory_gallery jsonb;
```

- Nullable. Shape: `[{ taskId: string, label: string, note?: string, imageUrl: string }]`.
- `memory_note` / `memory_image_url` (existing columns) keep being populated exactly as
  today (first/cover task's note+photo) whenever `memory_gallery` is written — so every
  existing reader of those two columns (feed cards, notifications, profile stats,
  whatever we haven't audited) keeps rendering correctly without modification.
- New client code checks `memory_gallery` first; if present and non-empty, renders a
  swipeable catalog; otherwise falls back to the single image exactly like today.

### 3.4 Explicitly not doing a separate `task_memories` table

Considered and rejected: a fully normalized table (`habit_task_logs` or similar) with
one row per task-log. The jsonb-in-existing-column approach was chosen because (a) it
requires zero new tables/RLS policies/indexes, (b) `streak_memories` and
`community_wins` are already the load-bearing records for "a day's memory" everywhere
else in the codebase (comments/likes key off `(challenge_id, subject_user_id, date_str)`
— a *day*, never a row id for an individual task), and (c) the data volume per user is
small enough that jsonb blobs are not a performance concern here.

## 4. Behavior design

### 4.1 Logging a task (local, no community involvement)

Tapping a task in the checklist opens the same memory-capture sheet used today (note +
photo), and on save it appends/updates that task's entry in
`streak_memories[dateStr].tasks`. This can happen in any order, any number of times
during the day (v1: once per task per day — see §6 deferred scope), independent of
whether anything has been shared publicly yet.

### 4.2 Sharing to the community — one growing post per day, not one post per share

This is the important behavioral decision from our discussion:

- The first time the user shares a given day, it creates the `community_wins` row for
  `(habit, date)` — even if only 1 of 5 tasks are logged so far.
- Every subsequent share for that *same date* **updates that same row** rather than
  creating a new feed entry. This already falls out of existing code, not something new
  to build: `postCommunityWin` upserts on `(user_id, mini_mission_id)`, and for
  habit-streak posts `mini_mission_id` is the deterministic `habitwin:<habitId>:<date>`
  string — so two calls for the same day always hit the same row.
- Critically, that upsert never touches `created_at`, and every feed/journey query in
  the codebase orders by `created_at desc` — so updating a day's catalog **does not
  bump it back to the top of anyone's feed**. It updates in place, at its original
  position in the timeline. This matches the intent: it reads as "this post got a new
  photo added," not "a new post appeared."
- UI-wise: no interruptive "do you have more tasks?" prompt. The mission screen shows
  an ambient, persistent state ("2 of 5 tasks logged today") with a "Share catalog"
  action that's always available, not gated on finishing the checklist.

### 4.3 Selecting which tasks are shared — one mechanism for "before" and "after"

**Superseded design.** The original plan here was a dedicated narrow `UPDATE` for
per-task removal, separate from sharing. Built instead, and simpler: each
`StreakMemoryTaskEntry` carries an `includedInShare?: boolean` flag (absent = true).
"Share catalog" always sends whatever's currently checked — nothing more. This single
flag + button covers both:
- **Before the first share** — uncheck a task, tap Share, only the checked ones go
  out (answers "share 3 of 4 tasks").
- **After sharing** — uncheck a task, tap "Update shared catalog" — same flag, same
  button, updates the same post in place (`postCommunityWin` replaces
  `memory_gallery` wholesale each call, so resending a smaller set *is* removal).

Toggling the flag is local-only and never auto-publishes — the explicit
Share/Update tap remains the only thing that talks to the network, so checking boxes
doesn't cause surprise requests.

Re-saving an already-logged task (new photo/note) preserves its existing
`includedInShare` value rather than resetting it — otherwise editing a task you'd
deliberately excluded would silently re-include it.

**Edge case, decided:** unchecking every task on an already-shared day doesn't error
— `handleChecklistDayShare` detects the resulting gallery is empty and routes to
§4.5's whole-day removal instead, rather than leaving a zero-photo post published.

### 4.5 Removing a day's catalog from Community entirely

Same one-way-door semantics as the classic flow's revoke
(`handleHabitMemoryCommunityChange`): `deleteCommunityWin` + `communityFeedRevoked:
true` on that day's memory. Once revoked, sharing that day again is permanently
blocked (checked in `handleChecklistDayShare`, enforced in the UI by hiding the
share button and showing an explanatory note instead) — same reasoning as the
classic flow: a post that can flip in and out of existence makes cheers/comments and
feed position ambiguous, so once it's gone, it's gone. Local task logging is
unaffected either way — revoking only blocks *Community* actions for that day, not
the ability to keep logging/editing tasks privately.

### 4.4 Likes/cheers — already correct, zero changes needed

`toggleCheer(winId, ...)` operates purely on the win row's id — it has no concept of
"which photo." Since a multi-task day is still exactly one row, the cheer button that
already sits inline on grid tiles (in both the viewer's own journey and someone else's)
needs no changes at all. Liking a whole day's catalog from the grid, without opening it,
is already the only granularity that mechanism supports, and that's correct.

## 5. Journey tab integration (own journey + viewing someone else's)

Confirmed by reading the actual code, not assumed: `app/my-journey.tsx` (your own
journey) and `app/community-player/[id].tsx` (viewing someone else's) already share:

- The same types: `CommunityPlayerMissionStory`, `CommunityPlayerStoryPost`.
- The same fetch functions: `fetchCommunityPlayerStory`, `fetchCommunityPlayerStoryPage`.
- The same responsive grid layout util: `getJourneyMiniGridLayout` — a mission "story"
  card containing a grid of day-tiles, each currently backed by one `memoryImageUrl`.

So this is **one piece of work, not two**:

1. Add `memoryGallery` to the shared `CommunityPlayerStoryPost` type, populated from the
   new `memory_gallery` column in the one row-mapping function both screens read
   through (`src/lib/communityWinsApi.ts`).
2. The grid itself does not change — cover thumbnail stays `memoryImageUrl` (the
   first/cover photo), same layout, zero visual change for every existing single-photo
   day, past or future. Optionally: a small "×N" badge on tiles where the day has more
   than one task logged.
3. `CommunityWinImageLightbox` (currently hard-coded to a single `imageUri`) is the one
   component that needs new capability — a swipeable-gallery variant, used whenever
   `memoryGallery.length > 1`, falling back to today's single-image behavior otherwise.
   It's reused across `community-player/[id].tsx` (3 call sites), `my-journey.tsx`, and
   `journey-moment/[id].tsx` — build it once, it lights up everywhere.

## 6. Explicitly deferred (not in v1, schema allows it later)

- **Logging the same task more than once in a day.** The `proofUrls: string[]` shape
  and the general append-based model support this later, but the interaction design
  ("which tap logs which instance?") hasn't been designed and isn't part of this build.
- **Per-photo likes/comments.** Cheering/comments stay at the day/row granularity (§4.4).
- ~~**Squad memory viewing** (`app/challenge-memory.tsx`) doesn't show catalogs yet.~~
  **Done — see §9.** This was a genuinely separate surface from everything else in
  this doc: it reads a squad member's `streak_memories[date]` through its own
  dedicated RPC (`rpc_challenge_memory_detail_v1` via
  `src/lib/challengeMemoryDetail.ts`), not through `communityWinsApi.ts` /
  `community_wins` at all, so none of the Phase 4 client work reached it
  automatically.

## 7. Visual design ambition — open, to be designed deliberately

The user's explicit bar for this feature: it should feel like nothing else in the
category, not a reskinned version of the existing single-photo memory card. This has
**not** been designed yet — everything above is data/behavior architecture. Before
building the checklist-logging sheet, the catalog card, and the gallery/slider UI, we
need a dedicated visual design pass, informed by what this session already learned:

- A full app-wide re-theme (tried: matte-metallic-green, then a VIBGYOR spectrum
  palette) was explored and rolled back — not because the direction was wrong, but
  because it wasn't validated as *this specific feature's* identity. The catalog can
  have its own strong visual language without requiring another app-wide palette
  change.
- Reuse what's proven in this codebase rather than reinvent: the `AnimatedFire`
  component, gradient CTA treatments (`LinearGradient` accent bars/buttons), and the
  subtle glass-highlight card shim (top-edge white-to-transparent gradient) already
  applied to `StreakProgressCard`, `Timer`, and the mission-controls card are all
  reasonable building blocks for a distinctive catalog card — but the actual layout
  concept for "a catalog of today's tasks" has not been designed yet and deserves its
  own pass, not a bolt-on of existing components.
- A full custom illustration style (explored: anime-inspired revamp) was shelved as too
  large a scope for now, but the appetite for something illustrated/characterful rather
  than purely icon-and-gradient-driven is worth keeping in mind for this feature
  specifically, since it's a smaller, contained surface than a full app reskin.

## 8. Rollout plan — phased, each step tested before the next starts

| Phase | What ships | How it's verified before moving on |
|---|---|---|
| **0** | Migration only (file: `supabase/migrations/20260722181133_add_task_checklist_and_memory_gallery.sql`, applied manually by the user, never pushed directly by the agent — see §2.5): `habits.task_checklist`, `community_wins.memory_gallery`. No app code reads/writes them yet. | Confirm via Supabase advisors/logs that nothing broke, existing screens behave identically. Pure no-op from the app's perspective. |
| **1** | Client types + API functions updated to read/write the new fields (still behind the fact that no mission has a `task_checklist` yet, so no user-visible change). | `tsc` clean, existing single-memory flow manually re-tested end to end (log a memory, post it, see it in feed and journey) to prove zero regression. |
| **2** | Checklist-creation UI, opt-in, on **new missions only**. Multi-task logging sheet. | Create one real test mission with a checklist, log every task, confirm each save is correct in `streak_memories`. |
| **3** | "Share catalog" wired to the upsert-per-day behavior (§4.2), including the ambient progress indicator. | Share partway through a day, log another task, share again — confirm it updates the *same* feed post and does not move in the timeline. |
| **4** | Journey tab: `memoryGallery` on the shared type, grid badge, gallery-capable lightbox. **Done except the grid badge** — see Status narrative below. | View the test mission's catalog day from both "my journey" and (using a second test account) "someone else's journey" — confirm identical behavior since it's the same underlying code path. Not yet retested on-device after this increment. |
| **5** | Per-task removal + the empty-gallery-auto-delete edge case (§4.3). | Remove one task from a shared catalog, confirm the post updates; remove the last one, confirm the whole post is gone, not an empty card. |
| **6** | Dedicated visual design pass (§7) on the catalog card + logging sheet + gallery UI. | Design review against the "nothing else looks like this" bar before wide exposure. |
| **7** | Expose checklist-creation broadly (not just internally) in the mission-creation flow. Production rollout. | Everything above has already been tested; this is just flipping visibility. |

**Status:** Phase 0 (migration) and Phase 1 (client types/API round-trip) are done and
regression-tested clean. Phase 2's creation UI (`app/create.tsx`) and logging UI
(`ChecklistDaySheet` + `handleTaskMemoryCommit` in `app/habit/[id].tsx`) are built.

**Gotcha hit and fixed during Phase 2** — worth remembering for the next feature that
adds a column to `habits` or `mini_missions`: this app's habit push does **not** go
through a plain Supabase `.upsert()`. It goes through a custom RPC,
`rpc_sync_dirty_state`, which parses the client's JSON via
`jsonb_to_recordset(payload) as x(id text, title text, ...)` — an **explicit column
list**. Any field not named in that list is silently dropped by
`jsonb_to_recordset`, no error, nothing in the logs. `task_checklist` was added to the
table (Phase 0) and to the client's push payload (Phase 1) correctly, but the RPC's
column list predated it, so every checklist mission was pushed with the field silently
stripped before it ever reached the table — confirmed directly against production data
(`task_checklist` was `null` on every test mission despite every other field saving
correctly). Fixed in
`supabase/migrations/20260723090000_sync_dirty_state_task_checklist.sql`. **Lesson**:
when adding a column that needs to sync, check both the RPC that *reads* it back
(`rpc_focus_delta_v1` — turned out fine here, it uses `to_jsonb(h)` on the whole row,
not an explicit list) and the RPC that *writes* it (`rpc_sync_dirty_state` — did not,
this is where the bug was). A `tsc`-clean client and a correct migration are not
enough to prove a field round-trips — the RPC layer in between has to be checked too.

Phase 2 is fully verified: retested end-to-end after the migration fix (fresh test
mission, 3 tasks logged, nested-modal bug on iOS also found and fixed — see below),
and confirmed directly against production data — `task_checklist`, `completed_dates`,
and `streak_memories[date].tasks` (three distinct entries, each with its own
correctly task-scoped photo URL, no collisions) all landed exactly right.

**Second gotcha hit and fixed during Phase 2** — tapping a task opened
`StreakMemorySheet` while `ChecklistDaySheet`'s Modal was still open underneath it.
Same bug class as the original iOS paywall nested-modal issue (see
`.codex/skills/ios-iap-troubleshooting/SKILL.md`): Android's Dialog-backed Modal
tolerates a second native Modal stacking on top of an already-open one; iOS does not.
Fixed by closing `checklistDayUi` before opening `taskMemoryUi`, and reopening the
checklist from the task sheet's `onClose` (which fires after a successful save too,
so closing/saving a task returns to the task list instead of dropping out to the
mission screen — makes logging several tasks in a row feel continuous).

Phase 3 is now built: `handleChecklistDayShare` in `app/habit/[id].tsx` and the
"Share catalog" footer button in `ChecklistDaySheet`. Only tasks with an
already-uploaded (https) photo are included in the shared gallery — a task whose
photo is still local-only (upload failed when it was logged) is silently left out of
the share rather than blocking it; reopening that task retries the upload. Re-sharing
the same day reuses `postCommunityWin`'s existing upsert behavior from Phase 1 — it
updates the same feed post in place, at its original position, rather than creating a
duplicate or bumping it to the top. Confirmed working on-device: a task's catalog
posts and re-shares update the same feed post correctly. Confirmed by the user's own
test, though, that the post rendered as a single photo, not a catalog — expected, and
exactly what led into Phase 4 below sooner than planned.

**Phase 4 scope correction**: the original plan named only "Journey tab." Testing
surfaced a third rendering path the doc hadn't accounted for —
`src/components/CommunityWinsFeed.tsx`, the main scrolling Community tab — which also
needed this work. All of these share one component, `CommunityWinImageLightbox`,
which was upgraded from a single `imageUri: string | null` prop to `images: string[]`
(swipeable via a paged `FlatList` + a "1/N" counter when `images.length > 1`; renders
identically to the old single-image version when there's just one). Done and wired
end-to-end:
- **Main feed** (`CommunityWinsFeed.tsx` + `CommunityWinFeedPost.tsx`) — full gallery
  support, plus a small photo-count badge on the thumbnail for multi-photo posts.
- **Single-post deep link** (`journey-moment/[id].tsx`) — full gallery support.

**Journey tab (`my-journey.tsx` + `community-player/[id].tsx`) — now done.** Both
screens prop-drilled the image-open callback as a single URI through several nested
leaf/forwarding components (`StoryPhotoTile`, `RecentProofBadge`,
`MissionProofTile`/`MiniPostTile` or `MiniPostCard`/`MiniPostRow`, and the
`MissionStoryCard`/`GalleryMomentCard`/`MissionGalleryModal` chain above them). Both
were refactored the same way: every leaf `onPress`/`onOpenImage` signature became
`(images: string[], initialIndex?: number) => void`, backed by a per-file
`galleryImagesForPost(post)` helper (prefers `post.memoryGallery`, falls back to
`[post.memoryImageUrl]`, matching the pattern already used in the main feed and
`journey-moment/[id].tsx`). Top-level `lightboxUri: string | null` state was replaced
with `lightboxImages: string[]` / `lightboxIndex: number`, feeding
`CommunityWinImageLightbox`'s real `images`/`initialIndex` props directly — the old
TODO-wrapped single-item-array workaround is gone from both files.

While doing this, found and fixed a **third and fourth instance** of the iOS
nested-modal bug (see `app-architecture.md` Known Caution Points for the full list):
in both files, `MissionGalleryModal` is itself a full-screen `<Modal>`, and tapping a
photo tile inside it opened the lightbox `<Modal>` on top without closing it first —
silently broken on iOS, fine on Android, exactly the same failure shape as every prior
instance. Fixed identically in both files with a small
`missionBeforeLightboxRef` + unified `openLightbox`/`closeLightbox` pair: opening the
lightbox closes `MissionGalleryModal` first (remembering which mission was open),
closing the lightbox reopens it.

Both files verified with `npx tsc --noEmit` — clean, no errors.

**Still open, not yet done**: the "×N" photo-count badge on Journey grid tiles
(mentioned in §5 as optional) was not added to either file — grid thumbnails still show
just the cover photo with no indication a day has multiple task photos behind it.

**Design upgrade beyond the original Phase 4 plan**: the doc's original spec was
tap-to-open-lightbox. User feedback pushed this further — the main feed card itself
is now an inline, swipeable Instagram-style carousel (`PhotoCarousel` in
`CommunityWinFeedPost.tsx`, a horizontal paged `FlatList` with a dot-position
indicator), not just a static cover photo you tap into a modal. As you swipe within
the card, the streak-kicker's day/streak stay constant (they're day-level, not
per-task) but a new task-name row and the note text below update to match the
currently-visible task — swiping the photos re-captions the post live. Tapping still
opens the full-screen `CommunityWinImageLightbox`, now at the exact photo you'd swiped
to (`initialIndex` threaded through `onOpenLightbox`). Single-photo posts (the vast
majority, every post that predates this feature) are entirely unaffected — they still
render as a plain static image, never touching `PhotoCarousel` at all. Slide width is
measured via `onLayout` rather than assumed, so paging stays correct across both the
full-width feed and the narrower "cards" variant.

## 9. Squad memory viewing (`app/challenge-memory.tsx`) — a genuinely separate surface

This screen is what a squad member sees when they tap a squad-mate's day (from a
notification or the squad roster) — it's a **read-only viewer for someone else's day**,
not the memory owner's own logging/editing screen. It never went through
`communityWinsApi.ts` / `community_wins` at all: it reads straight off the subject's
`habits.streak_memories[date]` via a dedicated RPC,
`rpc_challenge_memory_detail_v1` (`src/lib/challengeMemoryDetail.ts`). Because of that,
none of the Phase 4 client-side gallery work (which all lived downstream of
`communityWinsApi.ts`'s row mapping) reached this screen automatically — it needed its
own, symmetrical fix.

**The bug, found by reading the RPC's actual SQL, not by guessing**: checklist-mission
days never write the legacy top-level `streak_memories[date].note` /
`.imageUrl` fields — `handleTaskMemoryCommit` in `app/habit/[id].tsx` only ever writes
`streak_memories[date].tasks`. The RPC only ever read those two legacy fields. Net
effect: a squad member opening a checklist day's memory saw "Day marked complete" with
no photo, even when the day had several logged task photos — exactly the same class of
"new field, old reader never updated" gap as the `rpc_sync_dirty_state` bug from Phase
2, just on the read side this time instead of the write side.

**Fix**: `supabase/migrations/20260723120000_challenge_memory_detail_task_gallery.sql`
(new file, not yet applied — the user applies every migration manually, same standing
rule as the rest of this feature). It extracts `streak_memories[date].tasks` (when
present) into a new `tasks` array in the RPC's jsonb response — one entry per task that
has a synced (already-uploaded, `https`) photo, in logged order, each
`{taskId, label, note, imageUrl, loggedAt}`. Local-only (not-yet-uploaded) task photos
are left out, matching how local-only photos already behave for the classic path. When
the legacy top-level `note`/`imageUrl` are empty (true for every checklist mission) but
a task photo or note is available, the first task with a synced photo becomes the
"cover" `note`/`imageUrl`, so every existing reader of those two fields (this screen's
classic single-photo layout, notifications, etc.) still gets a sane fallback. `tasks` is
gated by the exact same visibility check that already gates `note`/`imageUrl` — it's
`null` whenever the day would already read as "private" to this viewer. Classic
single-memory missions are completely unaffected: they have no `tasks` in
`streak_memories`, so every new branch in the function is a no-op for them.

**Client side, done**:
- `src/lib/challengeMemoryDetail.ts` — new `ChallengeMemoryTaskEntry` type
  (`{taskId, label, note, imageUrl, loggedAt}`), `ChallengeMemoryDetail.tasks` field,
  and a defensive `normalizeTaskGallery` parser (drops any entry missing
  `taskId`/`label`/`imageUrl`).
- `app/challenge-memory.tsx` — `galleryImages` derived from `detail.tasks` when
  present, else the single `detail.imageUrl` (zero change for classic missions). A new
  local `MemoryPhotoCarousel` (horizontal paged `FlatList`, dot indicator, same shape
  as `PhotoCarousel` in `CommunityWinFeedPost.tsx` but sized to this screen's existing
  `photoWrap` container) renders in place of the single `<Image>` whenever
  `galleryImages.length > 1`; the single-photo path is untouched otherwise. A
  `ListChecks`-icon task-name row shows the currently-visible task's label, and the
  note text below swaps to that task's note as you swipe — the same "live caption"
  behavior as the main feed carousel. The screen's bespoke fullscreen `<Modal>` +
  `<Image>` viewer was replaced with the shared `CommunityWinImageLightbox` (same
  component every other surface uses), now opening at the exact slide that was tapped.
- `npx tsc --noEmit` clean.

**Not yet done / next**: the migration needs to be applied by the user before any of
this is testable end-to-end (`npx supabase db push`, or run the file's SQL via the
Dashboard) — until then, `rpc_challenge_memory_detail_v1` still returns the old shape
and every checklist-day squad view still falls back to "Day marked complete." After
applying, retest: open a squad-mate's checklist day (2+ synced task photos) via the
squad roster or a notification, confirm the carousel swipes, the task name/note updates
per slide, and the fullscreen lightbox opens at the right photo; then confirm a classic
single-memory squad day still renders exactly as before (no regression).

## 10. Group mission checklist propagation (invite → join)

Raised by the user testing a real scenario: "if I create a mission with multiple tasks
and invite someone, will they automatically be able to log multiple tasks?" Checked the
actual join flow (not assumed) and confirmed: **no, not until this fix.** A group
mission's shared config lives in `challenge_groups.habit_template` (jsonb), built by
`createGroupChallengeFromHabit` in `src/lib/groupChallengesApi.ts` — it only carried
`title`/`mode`/`totalDays`/`description`/`endDate`. When someone accepts an invite,
`handleAcceptGroupInvite` in `app/(tabs)/compete.tsx` reads that template and calls the
local `addHabit(...)` to create the joiner's own (separate) `habits` row — since
`taskChecklist` was never in the template, every joiner got a classic single-photo
mission regardless of what the creator configured, with no error or indication
anything was missing.

**Decision (asked the user, given options):** auto-copy the creator's checklist
verbatim to every joiner, rather than letting each person customize their own list.
Simpler, ships now, and matches how title/duration already propagate — matching task
IDs across squad members isn't actually required by anything downstream (each member's
`streak_memories[date].tasks` is scoped to their own `habits` row, so identical task
`id`s across different members' rows never collide). Per-joiner customization was
explicitly deferred as a possible future follow-up, not built now.

**Fix, done**:
- `createGroupChallengeFromHabit` (`src/lib/groupChallengesApi.ts`) now includes
  `habit.taskChecklist` in `habitTemplate` when non-empty.
- `parseTaskChecklist` (the same defensive jsonb parser `sync.ts` already used for the
  `habits.task_checklist` column) was exported from `src/lib/sync.ts` and reused in
  `handleAcceptGroupInvite` (`app/(tabs)/compete.tsx`) to parse
  `habit_template.taskChecklist` back out, then passed into the joiner's `addHabit(...)`
  call.
- No new migration needed — `habit_template` is untyped jsonb, and the joiner's habit
  still syncs to Supabase through the existing `rpc_sync_dirty_state`, which already
  carries `task_checklist` in its column list (fixed in Phase 2, see above). This is
  purely a client-side wiring fix.
- `npx tsc --noEmit` and `git diff --check` clean.

**Not yet tested on-device**: create a group mission with a checklist, invite a second
test account, accept the invite, and confirm the joiner's mission opens
`ChecklistDaySheet` with the same tasks as the creator's, and that both can log/share
independently.

## 11. Squad streak-dots viewer (`CohortPeerStreakDots.tsx`) — a third, separate viewer

After testing §10, the user found a third bug: in the group screen's streak-dots row
(the small dot-per-day timeline shown for each squad member — a completely different,
self-contained UI from both `challenge-memory.tsx` and the RPC it calls directly),
tapping a public checklist day's dot just showed "Day marked complete," never the
catalog. This is a **third, independent code path** from everything in §9 — it's not
reached by tapping a dot at all; `app/challenge-memory.tsx` is only reachable via a
push-notification deep link. `CohortPeerStreakDots.tsx` has its own bespoke fetch call
and its own bespoke fullscreen modal.

**Two stacked bugs, found by reading the actual SQL, not guessing:**

1. Before the dot's tap handler ever calls anything, it decides client-side whether a
   day is worth fetching, using a precomputed `streak_memory_markers` map
   (`hasPhoto`/`hasNote`/`checkInOnly` per date) that's synced down alongside each
   squad member's peer habit data. Two RPCs build that map —
   `rpc_cohort_peer_habits_v1` and `rpc_challenge_streak_members_page_v1` — and
   **both** only ever looked at the legacy `streak_memories[date].imageUrl`/
   `.imageUri`/`.note` fields, never `.tasks`. So every checklist day's marker came
   back `hasPhoto: false, hasNote: false`, and the tap handler short-circuited
   straight to the "check-in only" modal — never even calling
   `rpc_challenge_memory_detail_v1` (the RPC §9 already fixed).
2. Even on the days where the handler *does* call through (classic single-memory
   missions, or if bug 1 weren't there), the modal itself only ever rendered
   `detail.note`/`detail.imageUrl` — a single image, no gallery. `detail.tasks` was
   discarded entirely, so this third viewer would still show one photo, not a catalog,
   even after §9's RPC fix.

**Fix, done:**
- New migration
  `supabase/migrations/20260723130000_cohort_peer_streak_task_markers.sql`
  (`create or replace` on both RPCs, based on their live definitions pulled directly
  from Supabase, not the original migration files, to avoid drifting from whatever's
  actually running) — `hasPhoto` now also true when any task has a synced (`https`)
  photo, `hasNote` also true when any task has a note, and the day-inclusion filter
  also matches a non-empty `tasks` array. Classic missions have no `tasks`, so this is
  a no-op for them. **Not yet applied** — same standing rule, user applies manually.
- `src/components/CohortPeerStreakDots.tsx`: `openRemoteMemory` now maps
  `detail.tasks` into `StreakMemory.tasks` (reusing the existing client type — each
  task's single `imageUrl` becomes a one-item `proofUrls` array, matching the shape
  `StreakMemoryTaskEntry` already expects). A new local `DotViewerCarousel` (same
  paged-`FlatList`-plus-dots shape as the other two carousels this feature already
  built, sized to this modal's existing fixed-height `imgContainer`) replaces the
  single `<Image>` whenever there's more than one task photo; single-photo/classic
  days render exactly as before. A `ListChecks` task-name row plus the active task's
  note were added to the meta panel below the photo, matching the "live caption"
  pattern from every other carousel in this feature.
- `npx tsc --noEmit` and `git diff --check` clean.

**Not yet testable**: needs both this migration and §9's applied before it can be
verified end-to-end. After applying, retest: a squad-mate's checklist day should now
show the carousel from the dots row directly, not just from a notification deep link.

**Follow-up fix #1 — still not swiping after the first Pressable fix**: converting
`viewerInner` alone wasn't enough — the *outer* `viewerBackdrop` (covering the entire
screen, `onPress={handleClose}`) is also a `Pressable`, and it still wrapped the
carousel as a descendant. Same mechanism: a `Pressable` claims the touch responder on
press-down, which can prevent a native horizontal scroll gesture inside it from ever
being recognized, regardless of how many layers deep it is. Fixed by changing
`viewerBackdrop` from `Pressable` to a plain `View` too — this modal now has no
backdrop-tap-to-close at all (matching `CommunityWinImageLightbox`, which never had
one either), relying solely on explicit close affordances. Since the "loading" state
previously had no close button of its own (backdrop-tap was its only dismiss path),
one was added there too so every state remains dismissible.

**Follow-up fix #2 — text-only tasks were invisible everywhere**: user pointed out
that a task logged with just a note and no photo never showed up in any of these
carousels — not because of a UI bug, but because the gallery-building query in
`rpc_challenge_memory_detail_v1` only ever included tasks with a synced photo
(`proofUrls[0] like 'http%'`). This wasn't limited to this one screen; it's the same
filter that would eventually need fixing anywhere a task gallery is built. Asked the
user how a text-only task should appear in an inherently photo-swiping carousel;
decided (of 3 options) to make it a **mixed carousel**: swipeable text-card slides
sit alongside photo slides in the same strip, applied to both squad-facing viewers
(the main feed / Journey tab / Community-sharing gallery equivalent was intentionally
left out of this pass — see below).
- New migration
  `supabase/migrations/20260723140000_challenge_memory_detail_text_only_tasks.sql`
  (not yet applied) — `tasks` now includes a task if it has a synced photo **or** a
  note; `imageUrl` is `null` for note-only entries. Cover-field selection (the legacy
  `note`/`imageUrl`) now explicitly prefers the first task with an actual photo,
  falling back to the first task's note — previously it just took array index 0,
  which could have picked a text-only task and left the legacy `imageUrl` field
  unset even when a later task did have a photo.
- `src/lib/challengeMemoryDetail.ts`: `ChallengeMemoryTaskEntry.imageUrl` is now
  `string | null`; `normalizeTaskGallery` keeps an entry if it has either an image or
  a note (previously required an image).
- `app/challenge-memory.tsx`: `MemoryPhotoCarousel` now takes the raw
  `ChallengeMemoryTaskEntry[]` (`slides`, not `images: string[]`) and renders a
  photo `<Image>` or a text card (icon + note, styled to match the photo slide's
  dimensions) per slide. The photo block now renders whenever there's *any* task
  gallery (`hasTaskGallery`), not just when `status === 'photo'` — a purely-text
  checklist day now shows the swipeable text-card carousel instead of falling back
  to the generic single-icon state panel. The full-screen lightbox only opens for
  photo slides (tapping a text card does nothing — nothing to zoom into); a new
  `lightboxIndex` state maps the tapped task's position into the photo-only subset
  passed to `CommunityWinImageLightbox`.
- `src/components/CohortPeerStreakDots.tsx`: identical treatment —
  `DotViewerCarousel` takes `slides: StreakMemoryTaskEntry[]` and renders the same
  mixed photo/text-card pattern; the modal now shows the carousel whenever
  `taskGallery.length > 0`, covering pure-text checklist days too.
- **Explicitly not done in this pass**: the main Community feed (`PhotoCarousel` in
  `CommunityWinFeedPost.tsx`), the Journey tab's galleries, and the sharing gallery
  itself (`handleChecklistDayShare` in `app/habit/[id].tsx`, which still only
  includes photo tasks in `community_wins.memory_gallery`) still drop text-only
  tasks. Same gap, larger surface area — left for a dedicated follow-up rather than
  bundled into this squad-focused fix.
- `npx tsc --noEmit` and `git diff --check` clean. Needs the new migration (plus the
  two from earlier today) applied before end-to-end testable.

**Follow-up fix #3 — the viewer's own row didn't match their own mission detail
screen.** User asked why their own data looked wrong in the squad screen "as it does
in normal cases." Root cause, found by tracing the actual data flow rather than
guessing: `CohortPeerStreakDots` is used for **every** member's row in
`app/challenge/[id].tsx`, including the viewer's own — there was no self-awareness at
all. Two compounding effects:
- Tapping *any* dot — including your own — always called
  `fetchChallengeMemoryDetail` (a Supabase RPC round-trip reflecting only
  already-synced server data), never the local Zustand `habit.streakMemories` the
  mission detail screen (`app/habit/[id].tsx`) reads directly. Anything just logged
  and not yet synced (or genuinely different from what's landed on the server) would
  silently not show, or show stale data.
- The dot's own badge detection (`hasPhoto`/`hasNoteOnly`, the camera/note icons)
  never looked at `memory.tasks` at all — only the legacy `imageUrl`/`imageUri`/
  `note` fields and a server-computed `marker` (which is never populated for the
  self row, since the self row's `habit` object bypasses the peer RPC entirely and
  is built straight from local store state). For a checklist mission, that meant the
  viewer's own dots never showed photo/note badges and never routed taps to
  `openRemoteMemory` at all — they fell straight to "check-in only."
- Fixed: added an `isSelf` prop, threaded from `app/challenge/[id].tsx` (which
  already computes `myUserId` for other purposes) as
  `isSelf={myUserId === memberId}`. When `isSelf` and the gate has already passed
  (i.e. `visibility === 'public'`): `openRemoteMemory` reads
  `habit.streakMemories[dateStr]` directly and synchronously instead of calling the
  RPC; badge detection also checks `memory.tasks` for any photo/note; `remotePeer`
  is forced to `false` internally so local, not-yet-synced `file://` photos render
  immediately instead of waiting on `uriLoadsForRemoteViewer`'s http(s)-only gate.
- **Correction (user caught this)**: the first pass of this fix also made `isSelf`
  bypass the `isPublic` visibility gate entirely, on the assumption there's
  "nothing to hide from yourself." User clarified that's wrong: visibility gates
  squad-facing content uniformly, including for the owner's own row — a "solo"
  mission's daily content should stay hidden from everyone in this squad-cohort
  view, even its own owner, exactly matching how the classic single-memory flow
  already behaves. Being part of a public *group mission* is a separate concept
  from a *member's own* visibility toggle; the former doesn't imply the latter.
  Reverted: `isPublic` is back to depending only on `habit.visibility`, never
  `isSelf`. The local-read/RPC-bypass behavior above still only ever applies once
  that gate has legitimately passed.
- `npx tsc --noEmit` and `git diff --check` clean.
- **Not checked**: whether `app/challenge-memory.tsx` (the notification-deep-link
  viewer) has the same self-vs-peer gap. It's reached from squad notifications about
  someone else's activity, so it's a much rarer path for viewing your own day, but
  hasn't been specifically verified either way.

## 12. Private Journey mode never learned about checklist days

User caught this: `app/my-journey.tsx` has a `journeyMode: "public" | "private"`
toggle (`ModeToggle`). "Public" shows only what's been posted to Community
(`community_wins`-backed data). **"Private" is not a filtered-down view — it shows
everything**, merging Public with a second, purely local story built by
`buildPrivateStory(habits, minis)` straight from `useHabitStore` (so it can show days
that were never shared at all). This local path was never touched during the original
Phase 4 Journey-tab work — that work only ever talked about the shared
`communityWinsApi.ts` fetch path, so `buildPrivateStory` was a blind spot neither
`docs/CATALOG_ARCHITECTURE.md` nor `docs/CURRENT_WORK.md` mentioned until now.

**Root cause, found by reading `buildPrivateStory` directly**: its per-day inclusion
check only looked at the legacy `memory.imageUrl`/`.imageUri`/`.note` fields —
`if (isPublicCommunityMemory(memory) || (!imageUri && !note && !repair)) continue;`.
A checklist day never writes those legacy fields (only `.tasks`, per
`handleTaskMemoryCommit`), so **every checklist-only day that was never shared to
Community was silently dropped from Private entirely** — not rendered wrong, just
never included at all. A habit that's 100% checklist-based and never shared would
show zero posts and not even appear in the Private mission list (`postCount` gates
inclusion).

Even after fixing the inclusion check, a second gap: `privatePostFromMemory` built
`memoryImageUrl`/`memoryNote` only from those same legacy fields — never falling back
to the task gallery the way the Community-share path already does when posting
(`app/habit/[id].tsx` backfills `memoryImageUrl` from the first task's photo at share
time). Every downstream consumer in this file (grid tiles, `photoCount`,
`StoryPhotoTile`, `allPhotoPosts`, etc.) keys off `post.memoryImageUrl` — without the
fallback, a checklist day would be *included* but render as a blank tile.

**Fix, done, `app/my-journey.tsx` only**:
- Inclusion check now also treats a non-empty `memory.tasks` as "has content."
- `privatePostFromMemory` now derives `memoryImageUrl` from the first task-gallery
  photo when the legacy field is empty (mirrors the share-time backfill and the
  squad detail RPC's cover-selection logic), and `memoryNote` from a new
  `firstTaskNote()` helper (first task with a note, in log order) when the legacy
  note is empty — this covers a checklist day where *every* task is text-only, no
  photo anywhere: it now renders as a text-only post using the exact same
  text-only-card rendering path classic missions already had (no new UI, just
  correct data flowing into it).
- The full `memoryGallery` (photo tasks only, same as everywhere else this session)
  is still attached, so the existing carousel/lightbox wiring from the earlier
  Journey-tab work picks it up automatically — no changes needed there.
- No migration needed — this is a pure local-data bug, `buildPrivateStory` never
  touches Supabase.
- `npx tsc --noEmit` and `git diff --check` clean.
- **Not checked**: whether `app/community-player/[id].tsx` has an equivalent
  "show everything" mode for viewing someone else's journey, or whether it's
  Public-only by design (viewing a stranger's fully-private data wouldn't make
  sense, so this is plausibly intentional — not assumed, just not verified).

## 13. Journey tab: text-only tasks in the swipeable gallery (private only)

Direct follow-up to §12. User confirmed Community sharing intentionally never
includes text-only tasks (no change needed there — a deliberate product decision,
not a gap), but was explicit that the private Journey view is different: "private is
for the user's own private journey... technically everything is visible... if a post
had text memory also, we are supposed to show the text memory also in the scroll,
just like we did it in the squad." So this is scoped to `app/my-journey.tsx`'s
private-sourced posts specifically — Public-sourced posts (`community_wins`-backed,
used both by "Public" mode here and by `app/community-player/[id].tsx` entirely) can
never contain a text-only gallery entry in the first place, since sharing never
produces one.

**What "the scroll" means here**: unlike the squad viewers (which have an inline
mixed carousel *and* a separate fullscreen zoom), the Journey tab's grid tiles only
ever show a single cover thumbnail — swiping through a day's full catalog happens
entirely inside the fullscreen lightbox opened on tap. That's the "scroll" the user
means, and it's powered by the shared `CommunityWinImageLightbox` component
(`images: string[]`, photo-only, used by 5+ screens app-wide).

**Design decision**: rather than change `CommunityWinImageLightbox`'s shared
contract (touching every one of its callers for a capability only one screen's one
mode needs), built a new **`JourneyMemoryLightbox`**, local to `app/my-journey.tsx`
— same chrome (dark backdrop, X close, "N / M" counter, paged `FlatList` swipe) as
`CommunityWinImageLightbox`, but slide-aware: a `CommunityMemoryGalleryItem` with
`imageUrl: null` renders as a text card (icon + note) instead of being skipped. This
is the 4th local carousel-family component built this session (main feed's
`PhotoCarousel`, `challenge-memory.tsx`'s `MemoryPhotoCarousel`,
`CohortPeerStreakDots.tsx`'s `DotViewerCarousel`) — kept local and separate rather
than extracted into one shared component, consistent with how the other three were
each kept scoped to their own screen.

**Changes**:
- `src/lib/communityWinsApi.ts`: `CommunityMemoryGalleryItem.imageUrl` relaxed from
  `string` to `string | null`. `storyMemoryGallery` (the Community-sourced parser)
  is untouched — still requires a real `imageUrl`, since that path should never
  produce a text-only entry anyway; the nullability only matters for the local
  builder below.
- `app/my-journey.tsx`'s `memoryTaskGallery()` (the "local-only mirror" for private
  posts) now keeps a task with only a note (`imageUrl: null`) instead of dropping
  it — this is the one and only place in the codebase that actually produces a
  `null` `imageUrl`.
- `privatePostFromMemory`'s cover-photo fallback was already picking `gallery[0]`
  (from §12's fix); tightened to `gallery?.find((g) => g.imageUrl)` since index 0
  can now legitimately be a text-only entry that comes before a later photo task in
  log order.
- Every leaf component's `onPress`/`onOpenImage` callback changed from
  `(images: string[], initialIndex?: number)` to
  `(slides: CommunityMemoryGalleryItem[], initialIndex?: number)` — a mechanical
  rename of the same refactor done for the Journey tab earlier this session, just
  carrying the full slide (with note) instead of a flattened URL. `galleryImagesForPost`
  was replaced by `journeySlidesForPost`, same fallback logic (gallery when present,
  else a single synthetic slide wrapping the classic cover photo).
- `app/community-player/[id].tsx` and the main feed were **not** touched — both are
  Public-only surfaces where this can never trigger, per the decision above.
- `npx tsc --noEmit` and `git diff --check` clean.

## 14. Sporadic blank/black carousel — root cause and fix (all three carousels)

User reported, with screenshots: a squad-mate viewing another member's day sometimes
saw a solid black square where a photo should be (task had a real photo), and a
*separate* task with only a note (no photo) *also* rendered the same solid black
square instead of showing the note — plus intermittently, even the **owner's own**
view of their own data went blank the same way. Worried it might be related to the
Supabase Storage free-tier quota (0.86 GB of 1 GB used at the time).

**Investigated rather than guessed.** The Storage-quota theory didn't hold up: the
owner's own blank-outs happen through the `isSelf` path (§12), which reads
`habit.streakMemories` straight from the local device — no network call, no Storage
read involved at all. Something reading purely local, already-known-good data
shouldn't be affected by remote quota. That pointed at a rendering bug instead, and
reading `DotViewerCarousel` (`CohortPeerStreakDots.tsx`) and `MemoryPhotoCarousel`
(`challenge-memory.tsx`) confirmed it — both had **the identical bug**, introduced
when they were first built earlier in this session:

```
const [slideWidth, setSlideWidth] = useState(0);
...
{slideWidth > 0 ? <FlatList ... /> : null}
```

The container's width isn't known synchronously (it resolves from a `"100%"`
layout), so it's measured via `onLayout` — but the entire `FlatList` was gated
behind `slideWidth > 0`, with `0` as the starting value and no fallback. On the rare
occasion `onLayout` fired late, fired once with a stale `0` (a known React Native
quirk specifically inside `<Modal>` content — the first layout pass can measure
before the modal has actually taken its final size) — or simply didn't fire again —
the gate never opened, and the carousel rendered **nothing at all**, forever, for
that open. Since the same gate covered *every* slide type, a photo slide and a
text-only slide failed identically: a plain black square (the always-black
`imgContainer`/`photoWrap` backdrop showing through, nothing on top of it). This
also explains why it looked "sporadic" — it's a timing race, not a deterministic
failure, and why it hit the owner's own local data just as easily as a squad-mate's
remote data — the bug has nothing to do with what the image data actually is.

`app/my-journey.tsx`'s `JourneyMemoryLightbox` (§13) does **not** have this bug — it
was built to read `useWindowDimensions().width` directly rather than an
`onLayout`-gated state, so it never blocks on a measurement at all. That's the
pattern the other two should have used from the start.

**Fix, all three carousels**:
- `DotViewerCarousel` and `MemoryPhotoCarousel`: `slideWidth` now seeds from
  `useWindowDimensions()` (minus this card's own known insets, where applicable)
  instead of `0`, and the `FlatList` always renders — no more gate. `onLayout`
  still refines the value if the real measurement differs; it just no longer blocks
  the first render.
- Added `onError` handling to the `<Image>` in all three carousels (previously
  zero error handling anywhere) — a genuinely broken/inaccessible photo URL (expired
  signed URL, RLS denial, whatever) now falls back to a small "Photo unavailable"
  state instead of the same silent black square. This is a real, separate failure
  mode from the layout race above and is now guarded against too, even though it
  wasn't confirmed to be what the user hit.
- **Design fix, same pass**: user separately pointed out the text-only slide's
  boxed/tinted card look ("only the text should appear at the center, not like this
  card") didn't match what they wanted. Removed the rounded, tinted background and
  icon from all three carousels' text-only slides — now just the note, centered,
  white text directly on the existing black photo-row backdrop, no separate card
  drawn on top.
- `npx tsc --noEmit` and `git diff --check` clean across all three files.

**Follow-up fix #4 — visual polish, matched to the existing "own view" card.** User
sent a screenshot of the memory-viewer card from their own mission's day grid
(`app/habit/[id].tsx`, honeycomb tile tap → `StreakMemoryGallery.tsx`'s modal) and
asked for `CohortPeerStreakDots`'s squad-dot modal — the screen the last several
fixes were on — to match that look, since it's the same category of card but had
drifted visually. Ported the exact style values rather than eyeballing the
screenshot: outer card `borderRadius: 24` (was 20), `borderWidth: 1` +
`padding: 10` (was edge-to-edge), so the photo now sits inset in a "mat" like the
reference instead of touching the card edges; meta panel background now matches the
card instead of a separate `surfaceElevated` panel; added a `viewerMetaTop` row
placing the date (left, cyan) and a new **"Day N" badge** (right, indigo, bold) side
by side — previously this modal never showed the mission day number at all. Threading
`dayNum` into the `open` state (now required, not optional) touched every `setOpen(...)`
call site in the file — `npx tsc --noEmit` confirms none were missed. `challenge-memory.tsx`
(the notification-deep-link viewer, structurally different — full-screen backdrop, no
inset mat) was intentionally left as-is; matching it too would be a separate pass if
wanted. `npx tsc --noEmit` and `git diff --check` clean.

## Addendum (2026-07-25): day completion moved off first-task-logged

Earlier phases above shipped with "the first task logged for a day completes it,
exactly like the classic flow" — that's now superseded. Logging a task only writes
into `streakMemories[date].tasks`; a checklist day's streak/XP/squad-notification
now fires **only** from an explicit "Mark Day Complete" action (a button in
`ChecklistDaySheet`, plus a quick one-tap equivalent on the Home mission card),
and tasks stay editable/re-fillable until that action is taken. Full design
rationale and implementation detail is in `docs/CURRENT_WORK.md` under
"Latest Feature: Mark Day Complete (Checklist Notification-Timing Redesign,
2026-07-25)" rather than duplicated here. Nothing else in this document (schema,
sharing/catalog behavior, gallery rendering) changed.
