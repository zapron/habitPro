# Mini Mission Multi-Task Catalog — Feasibility & Rollout Plan

## ⚠ Status correction (2026-07-31) — read this before anything below

Everything in this document, including the "Status as of 2026-07-24: planned,
not started" line right below and every §3 subsection's "no code exists yet" /
"net-new work" / "would need to" language, describes a **pre-implementation
plan**. The plan was written and then **immediately built**: git history shows
the whole feature shipped in commit `80d2ef2` ("feat: multi-task checklist
support for mini missions + Live Squad wiring", 2026-07-26 03:00), **12 minutes
before this very document's own commit** (`bcee5ff8`, 2026-07-26 03:12) — the
doc was simply never updated to say "done" afterward.
`docs/PROJECT_CONTEXT.md`'s "Multi-Task Checklist Missions / Community Catalog"
entry already correctly labels this "(main + mini, shipped)" and describes it as
"fully built, migrated, and confirmed working end-to-end by the user on iOS and
Android."

**Treat every claim below as a historical design-rationale / feasibility-analysis
record, not a current status report.** Concretely, as of 2026-07-31, all of the
following are shipped (verified against the actual code, not assumed):

| §  | This doc's framing | Actual current status |
|---|---|---|
| 3.1 | "No `taskChecklist` field exists" | Exists on `MiniMission` — `src/types/habit.ts` |
| 3.3 | Creation UI is "zero existing... net-new work" | Built — `app/mini/create.tsx` |
| 3.4 | `LiveMiniParticipantRow` has "no gallery/JSON shape"; RPC has "no array/JSON param" | Both exist — `memory_gallery` field on the type (`src/types/liveMiniMission.ts`), `p_memory_gallery` param on `rpc_sync_live_mini_progress` (migration `20260724100000_mini_mission_task_checklist_and_gallery.sql`) |
| 3.6 | Task-scoped upload framed as future work; per-task delete "not yet existing even on the habit side" | `uploadMiniStreakTaskMemoryImage` implemented (`src/lib/streakMemoryStorage.ts`) |
| 3.7 | Journey/player-profile tiles have "no carousel logic" | Both branch on `memoryGallery` now (`app/my-journey.tsx`, `app/community-player/[id].tsx`) |
| 3.8 | "Nothing was added to `mini_missions` or `live_mini_participants`" | Both got schema additions — see migrations `20260724100000` and `20260724130000` |
| 5 | Phase 0–4 rollout table, framed as not-yet-started | All five phases shipped in the single commit above |

**A real gap this plan never anticipated and still doesn't document**:
invite-time checklist propagation — an invitee sees the checklist *before*
accepting a Live Squad invite, not just after joining (`app/live-mini/[id].tsx`,
backed by a new `live_mini_squads.task_checklist` column). This was added as a
post-hoc bug fix once real usage surfaced the gap, and isn't covered by
anything in §3–§5 below. If extending Live Squad checklist behavior further,
read the actual current code rather than this plan's data model in §3.4.

Also note: every `app/mini/[id].tsx:NNNN` / `app/live-mini/[id].tsx:NNNN` line
citation below has drifted since the referenced files grew substantially in the
shipping commit — treat line numbers in this document as approximate/historical,
grep for the actual symbol before trusting a specific line.

The rest of this document is preserved as-written below for its design
reasoning (why each phase was scoped the way it was, what alternatives were
considered) — that reasoning is still generally sound, only the "not built yet"
framing is wrong.

---

Status as of 2026-07-24: **planned, not started.** No code or migrations for this
feature exist yet. This document is the single source of truth for it, the same
role `docs/CATALOG_ARCHITECTURE.md` plays for the main-mission version of this
feature — read that doc too, since this one deliberately reuses its patterns
rather than re-deriving them.

## 1. Problem statement / use case

Main missions (habits) already support an optional per-task checklist: a mission
can have several named sub-tasks, each logged independently with its own
note+photo, and sharing a day to Community renders it as a swipeable catalog
instead of one photo. Mini missions do not have this — a mini mission is strictly
single-shot today: one note, one photo, one `completionMemory`.

The motivating use case: two people doing a mini mission together via Live Squad
(e.g. someone being live-instructed through a multi-step task by another person)
want to log several distinct sub-tasks with their own proof, the same way a main
mission's checklist works, not just one flat completion photo.

Explicit scope boundary from the user: mini missions do **not** need their own
version of the squad-cohort-dots machinery (`CohortPeerStreakDots.tsx`) — that's
confirmed structurally true (see §3.5). The live/social surface for a mini
mission is much smaller: just the mini mission's own detail screen
(`app/mini/[id].tsx`) and its Live Squad board (`app/live-mini/[id].tsx`).

## 2. Non-negotiable design principles (inherited from the main-mission build)

Same rules as `docs/CATALOG_ARCHITECTURE.md` §2 — repeated here because they
apply just as strictly to this build:

1. Nothing existing breaks. Every schema change is additive (new nullable
   columns/params). A mini mission with no checklist behaves exactly as today,
   forever.
2. Opt-in per mini mission, not a global mode switch.
3. One unified checklist, no separate "manual" vs "routine" system — same
   pattern as main missions: an empty seed list means free-add-as-you-go, a
   populated one means pre-planned tasks; same UI either way.
4. Ship in small tested phases, migration-first and inert before any UI reads it.
5. All migrations go through tracked files under `supabase/migrations/`, applied
   manually by the user — the agent never runs `apply_migration` directly. This
   rule was violated once early in the main-mission build; do not repeat that.

## 3. Current architecture (confirmed by reading the code, not assumed)

### 3.1 `MiniMission` type — strictly single-completion today

`src/types/habit.ts:127-150`:

```ts
export type MiniMissionLiveRole = "creator" | "member";
export type MiniMissionCompletionMode = "manual" | "timer_check_in";

export interface MiniMission {
  ownerUserId?: string | null;
  id: string;
  title: string;
  objective?: string;
  visibility: MissionVisibility;
  communityFeedRevoked?: boolean;
  estimatedMinutes: number;
  extendedMinutes: number;
  completionMode?: MiniMissionCompletionMode;
  status: MiniMissionStatus;
  createdAt: string;
  scheduledStartAt?: string;
  startedAt?: string;
  completedAt?: string;
  completionMemory?: StreakMemory;
  liveSquadId?: string | null;
  liveSquadRole?: MiniMissionLiveRole | null;
}
```

No `taskChecklist` field exists. `completionMemory` is the same `StreakMemory`
type main missions use (`habit.ts:31-54`, includes a `tasks?: StreakMemoryTaskEntry[]`
field already) — but nothing in the mini-mission code path ever populates
`.tasks`. Confirmed via a repo-wide grep: `taskChecklist`/`TaskChecklistItem`/
`StreakMemoryTaskEntry` only appear in habit-mission files, never in any `mini*`
file.

### 3.2 Completion flow — reuses `StreakMemorySheet`, single commit only

`app/mini/[id].tsx:1873-1888` mounts the same `StreakMemorySheet` component
habits use, with `variant="mini"`. `StreakMemorySheet`'s own prop type
(`src/components/StreakMemorySheet.tsx:35-40`) only knows `variant?: "habit" |
"mini"` — there is no checklist-aware variant, and **it doesn't need one**: the
checklist logic for habits lives entirely in the *caller*
(`app/habit/[id].tsx`), not inside the sheet. The sheet is a dumb note+photo
capture surface; `app/habit/[id].tsx`'s `onCommit` handler
(`app/habit/[id].tsx:1004-1051`) is what opens it once per task and routes the
result into `streakMemories[date].tasks`. This means the same "open the sheet
once per task, route the commit into a task entry" pattern is directly portable
to minis with zero changes to `StreakMemorySheet` itself.

`handleCompleteCommit` (`app/mini/[id].tsx:1553-1631`) is today's single commit
path: one `uploadMiniStreakMemoryImage` call, one `StreakMemory`, one
`completeMiniMission(...)` call.

### 3.3 Creation — no checklist scaffolding exists at all

`app/mini/create.tsx` is a flat single-screen form (title, objective, duration,
finish-rule mode, start-now/start-later). Unlike `app/create.tsx` (main mission
creation, which already builds a `checklistItems` → `taskChecklist` array),
there is zero existing UI to build from for minis — this phase is net-new work,
not a port.

### 3.4 Live Squad — async/observational co-presence, not a shared live session

Each participant runs their **own independent local `MiniMission` + timer**.
"Live" means Supabase Realtime pushes near-real-time status snapshots between
participants, not a shared editable session.

- Client types: `src/types/liveMiniMission.ts:1-56` —
  `LiveMiniSquadRow` (one row per squad) and `LiveMiniParticipantRow` (one row
  per user-in-squad, with **flat** `memory_note: string | null` /
  `memory_image_url: string | null` columns, no gallery/JSON shape).
- Schema: `supabase/migrations/20260625123000_live_mini_missions.sql` —
  `public.live_mini_squads`, `public.live_mini_participants` (flat memory
  columns, line ~32-33), and two columns added to `public.mini_missions`
  (`live_squad_id`, `live_squad_role`) — the "live" attachment is just an FK on
  the same mission row, not a separate mission-content table.
- Realtime: `subscribeLiveMiniSquad` (`src/lib/liveMiniMissionsApi.ts:437-463`),
  wired in `app/live-mini/[id].tsx:1038`, re-fetches a full snapshot RPC
  (`rpc_live_mini_snapshot_v1`) on change.
- All writes go through security-definer RPCs, not raw table writes:
  `rpc_create_live_mini_squad(_v2)`, `rpc_invite_live_mini_participant`,
  `rpc_accept_live_mini_invite(_v2)`, `rpc_decline_live_mini_invite`,
  `rpc_sync_live_mini_progress`, `rpc_refresh_live_mini_missed`,
  `rpc_live_mini_snapshot_v1` (`src/lib/liveMiniMissionsApi.ts:87-260`).
- **The single write path for completion memory** is
  `rpc_sync_live_mini_progress` (`supabase/migrations/20260625123000_live_mini_missions.sql:452-567`),
  which takes flat `p_memory_note text` / `p_memory_image_url text` params and
  writes them only `when v_final_status = 'completed'`. No array/JSON param
  exists — this RPC's signature (or a new RPC) needs to grow a gallery
  parameter for this feature.
- Live Squad is premium-gated (`rpc_create_live_mini_squad` requires
  `public.profile_is_premium(uid)`).

### 3.5 No squad/cohort-dots analog for minis — confirmed structurally separate

`CohortPeerStreakDots` is used in exactly one place outside its own file:
`app/challenge/[id].tsx`. It is never imported by any `mini`/`live-mini` file.
`app/live-mini/[id].tsx` is its own fully self-contained squad screen
(`LiveSquadHero`, `ParticipantCard`, `StatusLegend`, etc.) with no shared code
with `CohortPeerStreakDots`. This confirms the user's framing: extending
multi-task support to minis touches `ParticipantCard`'s rendering inside
`app/live-mini/[id].tsx`, not the main-mission squad machinery at all — a small,
isolated surface, not a second copy of the whole cohort-dots viewer stack.

### 3.6 Image upload — task-scoped variant is a direct port of an existing pattern

`src/lib/streakMemoryStorage.ts`:
- `uploadHabitStreakMemoryImage` (177-205) — single-photo habit path, path
  `{uid}/habits/{habitId}/{date}.{ext}`.
- `uploadHabitStreakTaskMemoryImage` (221-249) — **the exact template to
  mirror** — task-scoped, path `{uid}/habits/{habitId}/{date}/{taskId}.{ext}`,
  so multiple tasks on the same day don't overwrite each other's photo.
- `uploadMiniStreakMemoryImage` (259-286) — fixed single filename
  `{uid}/mini-missions/{miniMissionId}/memory.{ext}`; a re-upload always
  overwrites the same file, no `taskId` concept.
- Call sites needing updates for a task-scoped variant:
  `app/mini/[id].tsx:1564` (`handleCompleteCommit`) and `src/lib/sync.ts:215`
  (offline→cloud backfill sync).
- `deleteMiniStreakMemoryImage` (297-333) currently deletes the single fixed
  path; would need a per-task-aware delete, mirroring (not yet existing even on
  the habit side — noted as a small pre-existing gap, not blocking) how
  `deleteHabitStreakMemoryImages` handles multiple per-date paths.

### 3.7 Display surfaces — one already gallery-ready, two are not

- **`CommunityWinFeedPost.tsx`'s `PhotoCarousel`** (main Community feed) is
  already generic on `win.memory_gallery` regardless of `feed_source` — it
  would render a swipeable catalog for a mini-mission win today if
  `memory_gallery` were populated for it. **No feed UI work needed here**, only
  a data-path change.
- **`MiniPostCard`/`MiniPostRow`** (`app/my-journey.tsx:981-1131`) and
  **`MiniPostTile`** (`app/community-player/[id].tsx:1137+`) render
  `post.memoryImageUrl`/`post.memoryNote` as a single image+note — no carousel
  logic exists here. These need the same carousel treatment the main-mission
  Journey work already built (reuse the pattern, not the exact component).
- **`app/mini/[id].tsx`** itself shows `mission.completionMemory` post-completion
  as a single note/photo; no per-task list anywhere (3000+ line file, confirmed
  via grep — no `Task`/`taskChecklist` symbols present).
- **`app/live-mini/[id].tsx`**'s `ParticipantCard` reads `row.memory_image_url`
  directly as a single thumbnail per squad member — needs gallery-aware
  rendering.

### 3.8 Schema — nothing checklist/gallery-shaped exists for minis yet

- `public.mini_missions` (`supabase/migrations/20260406120000_initial.sql:52-65`)
  — base columns, no checklist.
- `supabase/migrations/20260410120000_mini_completion_memory.sql` — adds
  `completion_memory jsonb`, a single blob, not an array.
- `public.community_wins` (`supabase/migrations/20260417120000_community_wins.sql`,
  extended by `20260501120000_community_wins_streak_feed.sql`) already has a
  `feed_source` column (`'mini' | 'habit_streak'`) — this is the existing
  mechanism that lets one table serve both post types.
- `supabase/migrations/20260722181133_add_task_checklist_and_memory_gallery.sql`
  (the migration that shipped the main-mission catalog feature) added exactly
  two columns, **both scoped to the main-mission side only**:
  `habits.task_checklist` and `community_wins.memory_gallery`. **Nothing was
  added to `mini_missions` or `live_mini_participants`.**
- `community_wins.memory_gallery` itself needs **no new column** for this
  feature — it's schema-generic already; it's simply never written for
  `feed_source = 'mini'` rows yet (`src/lib/communityWinsApi.ts:31-49` types it
  on the shared row, nothing in the mini completion path sets it).

## 4. Feasibility verdict

**Doable, medium scope.** Smaller UI surface than the main-mission build (no
cohort-dots equivalent needed for minis — confirmed in §3.5), but it touches one
more system layer end-to-end than a typical client-only change: client types →
creation UI → completion flow → storage → RPC/schema → Realtime sync → three
separate display surfaces (mini detail, Live Squad board, Journey/player
profile, Community feed). Nothing found here is architecturally risky or
blocked; it is a mechanical extension of patterns already proven in production
by the main-mission build.

## 5. Rollout plan — phased, each step tested before the next starts

Mirrors `docs/CATALOG_ARCHITECTURE.md` §8's phased approach.

| Phase | What ships | How it's verified before moving on |
|---|---|---|
| **0** | Migrations only, applied manually by the user, never pushed directly by the agent: `mini_missions.task_checklist jsonb`; a gallery-capable column for completion memory (`mini_missions.completion_memory` already jsonb — extend its shape client-side, no column needed there); `live_mini_participants` gains a gallery column (e.g. `memory_gallery jsonb`) alongside its existing flat `memory_note`/`memory_image_url`; `rpc_sync_live_mini_progress` gets a new optional gallery parameter (additive, existing callers unaffected). No app code reads/writes any of it yet. | Confirm via Supabase advisors/logs nothing broke; existing single-photo mini flow (manual + Live Squad) re-tested end to end with zero behavior change. |
| **1** | Client types + API round-trip: `MiniMission.taskChecklist`, `LiveMiniParticipantRow.memory_gallery`, `liveMiniMissionsApi.ts` wrappers updated for the new RPC param. Still inert — no mini mission has a checklist yet. | `tsc` clean; existing classic mini completion (solo and Live Squad) manually re-tested, zero regression. |
| **2** | Checklist-creation UI in `app/mini/create.tsx` (opt-in, new mini missions only) + per-task logging in `app/mini/[id].tsx` (port the `ChecklistDaySheet`/per-task-`StreakMemorySheet`-invocation pattern from `app/habit/[id].tsx`) + `uploadMiniStreakTaskMemoryImage`. | Create one real test mini mission with a checklist, log every task solo (no Live Squad yet), confirm each save lands correctly in `completion_memory`/task storage paths. |
| **3** | Live Squad wiring: `handleCompleteCommit`'s Live Squad sync path sends the task gallery through the extended `rpc_sync_live_mini_progress`; `ParticipantCard` in `app/live-mini/[id].tsx` renders it. | Two real test accounts (one per platform, matching how the main-mission squad bugs were caught) do a Live Squad checklist mini together, confirm each side sees the other's task gallery via Realtime. |
| **4** | Display: Journey (`MiniPostCard`/`MiniPostRow`) and player-profile (`MiniPostTile`) get carousel support, mirroring the main-mission Journey work; `communityWinsApi.ts`'s mini-completion write path starts populating `memory_gallery` for `feed_source = 'mini'` posts. | View a checklist mini's catalog from Journey (own + someone else's via player profile) and from the main Community feed (which needs no UI changes, only data) — confirm identical swipe/caption behavior to the main-mission catalog posts. |

**Explicitly deferred, not in this plan unless raised again**: any visual
redesign (the hex-within-hex/mosaic idea raised alongside this request was
explicitly deprioritized by the user — "there are other functionalities that we
should do"); per-task removal/edit-after-share parity with §4.3 of the
main-mission doc — reassess once Phase 4 is stable, since Live Squad completion
is one-shot (`completeMiniMission`) rather than main missions' any-time
re-editable daily entry, so "editing a shared mini catalog" may not even be a
real use case worth building; the "×N" photo-count badge (already deferred on
the main-mission side too).

## 6. Known risks carried over from the main-mission build

Read `app-architecture.md`'s Known Caution Points before starting Phase 1 —
these bit the main-mission build and are equally applicable here:

1. **`rpc_sync_dirty_state` silently drops any habit field not in its explicit
   column list.** Not directly relevant to minis (minis sync through different
   RPCs), but the same class of bug is worth checking for whatever RPC
   currently pushes `mini_missions` rows — confirm `task_checklist` gets added
   to its column list, not just the table, before assuming it round-trips.
2. **iOS embeds a wide-gamut ICC color profile in uploaded photos that some
   Android decoders can't render.** Already fixed at the shared
   `streakMemoryStorage.ts` upload layer (`stripIccProfile`), so any new
   mini-mission upload path automatically inherits the fix — no new work
   needed, just don't bypass `readImageBytesForUpload`.
3. **A `<Modal>`'s content can silently fail to render on Android if it's
   swapped in after the Modal is already open** (loading→content transition
   driven by an async fetch). If Phase 3's Live Squad gallery viewer opens
   inside a Modal that shows a loading state before the Realtime snapshot
   resolves, do not open the Modal until the data is ready — this exact bug
   was hit and fixed for the main-mission squad-dots viewer; do not reintroduce
   it here.
