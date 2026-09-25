# Group Challenge Governance — kick-out, room rules, premium tiers

Living architecture + progress doc for this specific feature. Read this before
writing any code that touches it — don't re-derive the design from chat
history. General session handoff still lives in `docs/CURRENT_WORK.md` /
`docs/WORK_HISTORY.md`; this file is the feature-specific technical detail
those two don't need to carry.

## Status

**Phases 1, 2, and 3 are all built, committed, pushed, migrated to
production, and OTA'd** (commits `9b7aba4`, `b85e5ad`, `820e83e`, `4a72df6`;
migration pushed via `npm run db:push`; OTA update group
`1ac83fee-d03e-46ef-bce3-6da3eb172c96`, runtime `1.1.36`). Phase 1
(kick-out) is verified at the database level with one UI path (re-invite)
deliberately deferred to a real-device test, not chased further blind on
the simulator — see that phase's log entry below before touching it
again. Phases 2+3 (room rules, both preset and premium-custom) are built
and verified live (the tier pill + commitment step were confirmed working
by the user on a real invite before this shipped).
**Confirmed scope:** Phases 0–3 are in. Phase 4 (automated auto-kick) is
explicitly deferred — not even the dry-run version yet.

**Phase 3's UI is de-scoped for this release, but the code is not deleted.**
The user decided today/note+photo toggles alone aren't a strong enough
"Community-Pro" pitch — Hard already covers both, so Custom today only adds
one thin combination ("photo required, note optional"). Real premium
granularity (streak minimums, photo-memory rules, etc.) is wanted later, so
rather than ship a weak version now, the "Customize rules" UI in
`GroupChallengeSheet.tsx` is hidden behind `const CUSTOM_ROOM_RULES_ENABLED
= false`. See the Phase 3 section and the Progress log entry below before
touching this again — **don't delete the custom-rule code or the two-boolean
model to "clean up"; it's intentionally live, typechecked, and dark.**

**Important model correction, made mid-build:** the original plan (see the
Phase 2/3 sections below, now updated) called for a single `roomRule:
"easy"|"medium"|"hard"|"custom"` enum. Building Phase 3 exposed why that's
wrong: a 3-way enum can't express "photo required, note optional" — a real,
plausible combination — so Phase 3's "custom" mode would have been fake
granularity bolted onto a preset field. Reworked to **two independent
booleans, `requireNote`/`requirePhoto`**, stored as two plain nullable
columns (`habits.require_note`, `habits.require_photo`) instead of one text
column. Presets (Easy/Medium/Hard) are now just fixed combinations of the
same two booleans, computed client-side in `GroupChallengeSheet.tsx` — there
is no `room_rule`/`roomRule` field anywhere in the codebase, don't
reintroduce one.
**Testing:** local Supabase only for this entire feature. Nothing in this
plan touches production directly; the user runs `db:push` themselves per
`pre_migration.md`, same as every other migration in this repo.

**Open item, deliberately parked (see Phase 1 log below for the full
investigation):** re-inviting a removed member from `GroupChallengeSheet`
(creator's side) produces no visible result on the simulator, and
`challenge_invites` shows zero new rows even after retry — meaning the
client never reaches `rpc_send_challenge_invite_v1` at all in this path. The
underlying guard itself is proven correct independent of any UI (see the
scripted RPC-level test), and the *other* Phase 1 UI path (the actual
removal, and the removed member's own device correctly showing their habit
as personal again) both checked out fine live. Only this one re-invite path
is unresolved. Ruled out: LAN IP drift (checked, correct), premium status
(confirmed `true` server-side), local sync staleness on `challengeGroupId`
(user confirmed the sheet correctly shows "group mission", not "create
group mission"). Suspected but unconfirmed: something in
`useRefreshPremiumAccess`'s client-side caching (`accessStatus`/`isPremium`/
`cache.lastSnapshot` interplay) short-circuiting to the upsell branch before
`sendChallengeInvite` is ever called — added and then removed temporary
`console.log` instrumentation at each branch in `GroupChallengeSheet.tsx`'s
`handleInvite`/search effect to narrow this down, but the user preferred to
defer to a real physical-device test rather than keep debugging blind on
the simulator. **Pick this up again with a physical device before
considering Phase 1 fully closed** — don't re-guess from scratch, re-read
this paragraph first.

## Phase 0 — the one open boundary question (RESOLVED)

**Decision (user-confirmed):** coexistence, not replacement.
- The existing peer-vote join-request system (`challenge_join_requests` /
  `challenge_join_request_votes`, any member can vote, one decline vetoes,
  2 approvals passes) stays exactly as-is for **admission** decisions.
- Creator-only authority is **new and additive**, scoped specifically to
  **moderation** decisions: removing a member, and (Phase 2/3) setting or
  editing room rules. These are different kinds of decisions with different
  actors — this was the reasoning that led to recommending coexistence over
  folding kick-out into the existing vote mechanism.
- Practical implication: `challenge_groups.creator_id` remains the single
  source of truth for "who has moderation authority," independent of
  `challenge_members.role` (which isn't reliably populated for older
  challenges — see the join-request migration's own note about creators
  missing from `challenge_members` on old data). Any new RPC checking
  creator authority must check `challenge_groups.creator_id = auth.uid()`
  directly, never rely on `role`.

## Phase 1 — Kick-out + sole admin

### Data model

New table `challenge_removed_members`:
```sql
create table public.challenge_removed_members (
  challenge_id uuid not null references public.challenge_groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  removed_at timestamptz not null default now(),
  removed_by uuid not null references public.profiles(id),
  primary key (challenge_id, user_id)
);
```
This is the re-join blocklist — permanent, not cleared by anything short of
a manual DB fix. Checked by both the join-request RPC and the invite-accept
path.

### RPC: `rpc_remove_challenge_member_v1(p_challenge_id uuid, p_target_user_id uuid)`

`security definer`, `auth.uid()` guard. Logic:
1. Verify caller is `challenge_groups.creator_id` for `p_challenge_id` — reject otherwise.
2. Reject if `p_target_user_id = creator_id` (can't remove yourself this way — creator removal is explicitly out of scope, see "Explicitly out of scope" below).
3. Delete the `challenge_members` row for `(p_challenge_id, p_target_user_id)`.
4. Update the target's `habits` row (matched by `challenge_group_id = p_challenge_id and user_id = p_target_user_id`): set `challenge_group_id = null`. **Nothing else touched** — `completed_dates`, `streak_memories`, `streak`, `visibility` all survive exactly as they were. This is the "their 10-out-of-40 days become their own personal mission" requirement — verify this specifically in local testing, it's the part most likely to get quietly broken by an unrelated future change to habit sync.
5. Insert into `challenge_removed_members`.
6. Insert one notification row, **to the removed user only** — never broadcast to the rest of the group. Reuse whatever shape existing notification inserts use (check `challenge_join_request` type's payload shape as the closest precedent) with a new type, e.g. `challenge_removed`.

### Guards to add to existing RPCs

- `rpc_request_join_challenge_v1`: if `(challenge_id, requester)` exists in `challenge_removed_members`, reject with an explicit reason (not the generic "already a member" path) — e.g. `reason := 'previously_removed'`, so the client can show a clear, honest message instead of a confusing generic failure.
- The invite-accept flow: same check, same treatment — block before an invite can even be sent if the invitee is on that challenge's removed list (friendlier than letting the invite through and failing at accept time).

### Client work

- A member-list UI probably doesn't fully exist yet as a standalone surface — check `GroupChallengeSheet.tsx` first; if it only shows a count today, this phase needs to build the actual roster view.
- Per-row action: **creator** sees "Remove from mission" (confirm dialog spelling out the consequence, per the earlier design conversation). **Any other member** sees "Report member" instead — private notification to the creator only, no vote, no group-visible trace. Reuses the existing private in-app notification path, new payload shape only.
- `rpc_remove_challenge_member_v1` call site: on success, if the removed user is the *current device's own account* being viewed from their own side (i.e. this device just got removed elsewhere and is re-syncing), the local `habitStore` needs the same `challengeGroupId → null` transition applied locally, not just server-side — check how `synchronizeHabitWithChallengeGroup`/the focus-delta pull path handles a habit whose `challenge_group_id` disappeared server-side, since this is a new case that pull-merge logic hasn't had to handle before.

### Explicitly out of scope for Phase 1

- Removing the creator themselves — ownership transfer is a separate, harder feature.
- Any limit on how often a creator can remove people (abuse-of-power-by-creator) — the private report trail is the only accountability signal for now.
- Scrubbing a removed member's *past* posts/notifications from group history — left as-is, normal moderation practice.

## Phase 2 — Preset room rules (Easy / Medium / Hard) — BUILT

### Storage (as actually built — see the model-correction note in Status)

`challenge_groups.habit_template` (already free-form `jsonb`) gets two new
optional keys, not one enum:
```jsonc
{ "requireNote": true, "requirePhoto": true }
```
Both absent/false = `easy` (today's actual behavior). Cloned onto each
participant's own `habits` row via two new plain columns —
`habits.require_note boolean`, `habits.require_photo boolean` — added in
`supabase/migrations/20260925130000_habit_room_rule.sql`. `Habit.requireNote`/
`Habit.requirePhoto` on the client type; `RoomRule = "easy"|"medium"|"hard"`
still exists as a **UI-only preset label** for the creation picker, never
stored on `Habit` itself.

- `easy` (both false): no memory required — today's existing behavior, unchanged.
- `medium` (`requireNote` true, `requirePhoto` false): **either** a note or a
  photo satisfies the day — not a note specifically. See "Semantics
  correction" below; this was wrong in the first build and fixed same-day
  after the user caught it in the taglines/behavior.
- `hard` (both true): a note **and** a photo are both required.
- Because a single true flag now means "either," the fourth combination
  (`requirePhoto` true, `requireNote` false) is semantically identical to
  Medium — there's no longer a distinct "photo only, note doesn't count"
  meaning anywhere in this model. This is exactly why Phase 3's Custom
  toggle has zero distinct value today (see Phase 3's de-scope note) — not
  just "one thin combination," actually **no** combination once this
  correction landed.

### Semantics correction, made the same day the presets first got tested

**Original bug**: Medium was built as "a note is specifically required"
(`requireNote` true forced a note; a photo alone did not satisfy it). The
user's own words: "if a user uploads a photo but no note, and we're asking
them for a note, then in that case it's basically Hard — needing a note
too." Correct intent: Medium = **either** a note or a photo; Hard = **both**.
**Fix**: no schema/migration change — the two boolean columns already
express this once the *enforcement* code stops treating a lone `requireNote`
as "note specifically" and instead treats **exactly one flag true** as
"either satisfies" and **both flags true** as "both required
independently." Changed in `StreakMemorySheet.tsx` (`handleSave`'s
validation, and the empty-state hint text), `app/habit/[id].tsx`
(`handleMarkChecklistDayComplete`'s bypass guard, and `effectiveRequireNote`/
`effectiveRequirePhoto` — the OR-into-`requireNote` quirk that used to fold
`requirePhoto` into `requireNote` was removed; the two raw flags now pass
through untouched and `StreakMemorySheet` derives the tri-state itself), and
`GroupChallengeSheet.tsx`'s preset taglines/hint copy.

### Enforcement — client-side, and that's a deliberate, not lazy, choice

This app's whole sync model is client-authoritative (local-first, server is a
sync target, not a validating gatekeeper) — every other rule in this app
(streak logic, XP, milestones) is enforced the same way. A server-side check
would be inconsistent with that trust model and adds real complexity for a
case with a low-stakes downside (worst case: someone's client is hacked to
skip a note requirement — not a security or data-integrity issue, just a
missed product nudge). **Decision: enforce in the UI only, matching the
codebase's existing trust model.** Revisit only if real abuse shows up.

### Where it plugs in (as built)

- `StreakMemorySheet` got `requireNote?: boolean` / `requirePhoto?: boolean`
  props (alongside its existing `plusCommunityOk`/`habitPublishAvailable`
  pattern). When either is true: "Just mark done" is hidden entirely (not
  just discouraged). `handleSave` only adds an extra block when **both**
  flags are true (Hard) — a clear alert per missing type ("Photo
  required"/"Note required"); when exactly one flag is true (Medium), the
  pre-existing "nothing to save" check already guarantees at least a note
  or a photo exists, so no separate check is needed. The empty-state hint
  text branches three ways (none/either/both) so it never tells someone
  about a bypass option that doesn't exist, and never claims a note is
  needed when a photo alone would do.
- Both `<StreakMemorySheet>` call sites in `app/habit/[id].tsx` (classic
  day capture, and the per-task checklist capture) pass
  `requireNote={effectiveRequireNote}` / `requirePhoto={effectiveRequirePhoto}`
  — the two raw flags, unmodified (see the semantics-correction note above
  for why these are no longer OR'd together).
- **Real gap found and fixed while building this**: `handleMarkChecklistDayComplete`
  (the explicit "Mark Day Complete" button) can finish a checklist day with
  *zero* tasks logged at all, by design (backfills a bare check-in) — which
  would have silently bypassed Medium/Hard entirely for checklist missions.
  Fixed by requiring at least one already-logged task to satisfy the rule
  before that button's bypass is allowed.
- Creation UI: a 3-way picker (Easy/Medium/Hard) in `GroupChallengeSheet.tsx`'s
  create step, defaulting to Easy, with a one-line plain-language description
  under the row that updates per selection.

## Phase 3 — Premium custom room rules — BUILT, UI DE-SCOPED FOR THIS RELEASE

Not "same mechanism, generalized via a 4th enum value" as originally
planned — see the Status section's model-correction note. Built as: the
same two booleans Phase 2 already introduced, editable independently
instead of only through the 3 fixed preset combinations.

**De-scope decision:** the user's call, after seeing what Custom actually
does today — note+photo independently is fine as a foundation but not a
compelling premium tier on its own (Hard already gives note+photo together;
Custom's only real addition is "photo only, no note," a thin combination).
Richer premium controls (minimum streak, photo-memory requirements, etc.)
are wanted before shipping a "Custom" tier for real. Rather than delete the
code or literally comment it out (bit-rots, stops typechecking, easy to
silently break), it's gated behind one constant:
```ts
const CUSTOM_ROOM_RULES_ENABLED = false;
```
in `src/components/GroupChallengeSheet.tsx`, wrapping the entire "Customize
rules" row + premium upsell branch + two `Switch` rows in
`{CUSTOM_ROOM_RULES_ENABLED ? (<>...</>) : null}`. Everything else from
Phase 2/3 stays exactly as built and live:
- The two-boolean data model (`habits.require_note`/`require_photo`,
  `habit_template.requireNote`/`requirePhoto`) is unchanged and still fully
  exercised by Easy/Medium/Hard.
- `createGroupChallengeFromHabit`'s `roomRule` param shape is unchanged.
- Enforcement (`StreakMemorySheet`, `handleMarkChecklistDayComplete`,
  `effectiveRequireNote`/`effectiveRequirePhoto`) is unchanged — it doesn't
  know or care whether the value came from a preset or a custom toggle.
- Only the **UI entry point** for setting a *custom* combination is hidden;
  Easy/Medium/Hard remain fully selectable and are now the only room-rule
  UI a creator sees.
**To re-enable later:** flip the constant back to `true` — no other
migration or data change needed, since the columns/RPCs never assumed
Custom was UI-reachable. If/when richer premium controls are designed, they
most likely replace this toggle block rather than extend it — see the
Status section's pointer back to this note.

Original Phase 3 design (still accurate for what's built, minus the UI
gate above):

- `GroupChallengeSheet.tsx` gained a "Customize rules" row (with a
  `PlusBadge`) below the preset chips. Tapping it while **not** premium
  calls the existing `openUpsell("group_mission")` path — same upsell every
  other premium gate in this file already uses, no new paywall UI. While
  premium, it reveals two independent `Switch` rows ("Require a note" /
  "Require a photo"), seeded from whatever preset was selected at the
  moment Custom was turned on (so turning it on doesn't silently reset to
  Easy).
- Selecting a preset chip always turns Custom back off (mutually exclusive
  — you're either using a preset or overriding it, not both at once); the
  preset chips visually dim while Custom is active.
- Premium check reuses `usePremium()`'s existing `isPremium`/`plusOk` in
  this same file — no new premium-check RPC, no second gate to keep in sync
  with the one `profile_is_premium()` already used for join-request voting.
- `createGroupChallengeFromHabit`'s signature changed from
  `roomRule?: "medium"|"hard"` to `roomRule?: { requireNote?: boolean;
  requirePhoto?: boolean }` — the caller (`GroupChallengeSheet`) resolves
  either the active preset or the custom switches into this shape before
  calling it, so the function itself doesn't need to know which UI path
  produced the values.
- **`minStreakDays`/auto-kick-after-N-days are explicitly not stored yet** —
  those are Phase 4, still fully deferred; don't add columns for them
  speculatively before Phase 4's own design is actually picked up.

## Phase 4 — Auto-kick automation (DEFERRED, not started, dry-run only when picked up)

Left here for continuity, not being built now:
- `pg_cron` **is already installed on this Supabase project** (confirmed via
  `list_extensions`, version 1.6.4) — no new extension to provision when this
  is eventually picked up.
- The sweep job would call the same `rpc_remove_challenge_member_v1` from
  Phase 1 on a schedule — no second removal code path to keep in sync.
- First version, whenever it's built, must be **dry-run**: compute who
  *would* be removed, notify the creator with that list, remove no one.
  Only after that's watched against real data with zero surprises does
  "actually execute the removal" get turned on. This is a deliberate safety
  gate, not a nice-to-have — see the main conversation's reasoning: this is
  the one piece where a bug's blast radius is a real person silently
  removed from their own community with no human in the loop at the moment
  it happens.

## Testing strategy for this whole feature

- Everything against local Supabase (`npm run db:reset` after each new
  migration) — never production, for any phase in this doc.
- Need more than the two existing seeded test accounts (`raktim24@gmail.com`
  / `test_friend`) to actually exercise multi-member group scenarios —
  **local signup needs no email confirmation**
  (`supabase/config.toml`'s `[auth.email] enable_confirmations = false`), so
  just sign up normally in the app pointed at local Supabase
  (`.env.local`'s `EXPO_PUBLIC_SUPABASE_URL`) with any email/password — the
  account is immediately usable, no Mailpit-checking needed. Use this to
  create 2–3 more throwaway test creators/members as needed; no script
  required unless a *specific fixed* user id matters (in which case, extend
  `scripts/seed-local-dev-users.mjs`, don't hand-roll a one-off).
- Phase 1's must-verify case: kick a member with partial progress (e.g. 10 of
  40 days), then confirm from *their* device/account: their habit is still
  there, still shows 10 completed days, `challengeGroupId` is gone, they can
  still post it to Community, and attempting to re-join the same challenge
  is rejected with the specific `previously_removed` reason.
- Phase 2/3's must-verify case: a Hard-rule mission genuinely blocks the
  "just mark done" fast path in the UI until a note+photo exist, and an
  Easy-rule (or pre-existing, no-`roomRule`) mission is completely unaffected.

## Progress log

(Append entries here as phases complete — commit hashes, what was verified
locally, what's still open. Don't duplicate this into `WORK_HISTORY.md`
verbatim; that file gets the condensed version, this file keeps the detail.)

### Phase 1 — built and verified locally, uncommitted

**Files:** `supabase/migrations/20260925120000_challenge_removed_members.sql`
(new table + `rpc_remove_challenge_member_v1` + guards added to
`rpc_request_join_challenge_v1` and `rpc_send_challenge_invite_v1`),
`src/lib/groupChallengesApi.ts` (`removeChallengeMember`,
`reportChallengeMember`), `app/challenge/[id].tsx` (originally a "⋮"
button on each `ParticipantCard` that isn't your own — superseded by the
labeled pill below; still wired to `handleRemoveMember`/`handleReportMember`
via `onModerateMember`, only the entry point changed).

**Verified locally** (`db:reset` applied clean, then a real scripted test
against local Supabase with two authenticated accounts — not just reasoning
about the SQL):
- Non-creator calling the removal RPC → rejected (`creator_only`).
- Creator attempting to remove themselves → rejected (`cannot_remove_creator`).
- Creator removes a real member → succeeds; `challenge_members` row gone.
- The removed member's own `habits` row: `challenge_group_id` is `null`,
  **`completed_dates` (all 9 seeded days), `streak` (9), and `visibility`
  (`public`) all survived untouched** — confirms the "becomes their own
  personal mission" requirement actually holds, not just in theory.
- `challenge_removed_members` row inserted correctly.
- Removed member re-requesting to join the same challenge → rejected
  (`previously_removed`), not the generic "already a member" message.
- Creator attempting to re-invite the removed member → rejected
  (`previously_removed`) — required adding a `challenge_members` row for
  the creator in the test fixture first; the pre-existing `not a member`
  check on that RPC fired before reaching the new guard otherwise (a known
  old quirk — some challenges' creators aren't in `challenge_members` — not
  something this phase introduced or needed to fix).
- The removed member got exactly one private notification
  (`challenge_removed` type); confirmed via direct query as *that user*,
  not the creator.
- `npx tsc --noEmit` clean after the client-side wiring.

**Not yet verified on a real device/simulator** — only via the scripted
local-Supabase test above. Worth a real on-device pass (create a group with
2+ real signed-up test accounts per this doc's "Testing strategy" section,
kick one, confirm the UI updates and the kicked account's own app reflects
the change after its next sync) before calling Phase 1 fully done.

**Not committed to git yet** — `app/challenge/[id].tsx`,
`src/lib/groupChallengesApi.ts`, and the new migration are all currently
uncommitted working-tree changes. `.claude/skills/habitpro-governance-tracker/`
is also new but — consistent with how `.claude/` has been treated all
session — was not committed either; flagging this explicitly since this
skill only exists on this machine unless that's revisited.

**Open item carried into Phase 2/3, not forgotten:** local sync-path
verification (`habitFromRow` mapping `challenge_group_id: null` straight
through with no special-casing) was checked by reading the code, not by an
on-device two-account test — the on-device pass above should specifically
confirm the *removed device* actually sees its habit convert to solo after
a normal pull, not just that the server-side row is correct.

**Follow-up, same session:** the re-invite UI gap (see Status section at
the top of this doc) was investigated further with the user live —
confirmed NOT a LAN-IP-drift issue (checked directly, correct), confirmed
premium is genuinely `true` server-side, confirmed the creator's local
`habit.challengeGroupId` sync is correct (sheet showed "group mission", not
"create group mission" — user verified this directly). Added, used, then
removed temporary `console.log` instrumentation in
`GroupChallengeSheet.tsx`'s `handleInvite` and its search effect to narrow
down which branch was firing — the user chose to defer finishing this
diagnosis to a real physical device rather than continue on the simulator.
**Still genuinely unresolved** — re-read the Status section's paragraph on
this before picking it up again, don't restart the investigation from zero.

### Phase 2 + 3 — built locally, sanity-checked at the database level, uncommitted

**Files:** `supabase/migrations/20260925130000_habit_room_rule.sql` (adds
`habits.require_note`/`require_photo`, two plain nullable booleans — see
the Status section's model-correction note for why this isn't the single
enum column originally planned), `src/types/habit.ts` (`Habit.requireNote`/
`requirePhoto`, `AddHabitInput` same, `RoomRule` kept as a UI-only preset
label), `src/store/habitStore.ts` (`addHabit` sets both from input;
`synchronizeHabitWithChallengeGroup` reads both from the group's
`habit_template` onto the creator's own habit), `src/lib/sync.ts`
(`habitFromRow`/`habitToRow`/`HABIT_ROW_SELECT` all updated),
`src/lib/groupChallengesApi.ts` (`createGroupChallengeFromHabit`'s third
param is now `{requireNote?, requirePhoto?}`, not a string enum),
`app/(tabs)/compete.tsx` (accept-invite flow reads both booleans off the
template and passes them into `addHabit`), `app/habit/[id].tsx` (both
`<StreakMemorySheet>` call sites wired; `handleMarkChecklistDayComplete`
gated — see Phase 2's "real gap found" note above), `src/components/GroupChallengeSheet.tsx`
(Easy/Medium/Hard preset chips + premium-gated "Customize rules" toggle
with two independent switches).

**Verified locally at the database level:**
- `db:reset` applies the new migration cleanly, no errors.
- The CHECK-constraint-free plain boolean columns accept `true`/`false`/`null`
  correctly (tested by direct insert).
- **Specifically tested the combination the old enum design couldn't have
  expressed** — `require_photo: true, require_note: false` — inserted and
  read back correctly, confirming the two-boolean rework actually delivers
  the granularity Phase 3 was supposed to add, not just a relabeled preset.

**Not yet verified:** the actual client enforcement UI (StreakMemorySheet
blocking "Just mark done", the ChecklistDaySheet path, the
`GroupChallengeSheet` Custom toggle) has only been read/typechecked, not
exercised on a simulator/device — `npx tsc --noEmit` is clean but that's
the only validation so far for the UI half of Phases 2/3. Worth a real
on-device pass before considering these phases done: create a Medium and a
Hard mission, confirm "Just mark done" is genuinely absent (not just
disabled) on both, confirm a premium account can reach the Custom switches
and a non-premium one hits the upsell instead.

**Not committed to git yet** — same as Phase 1, everything from this
session remains uncommitted working-tree changes as of this entry.

### Real bug found by the user testing, fixed and verified

**Room rules survived removal, still applying to a mission that's no
longer grouped.** The user noticed: after being kicked, a member's mission
correctly becomes their own personal mission (`challenge_group_id` cleared)
— but `require_note`/`require_photo` were left untouched on that same row,
so it kept demanding a note/photo on a mission that isn't part of any
group anymore. Fixed two ways, deliberately not just one:
1. **Data fix**: `rpc_remove_challenge_member_v1` now clears
   `require_note`/`require_photo` to `null` in the same `UPDATE` that clears
   `challenge_group_id`.
2. **Defensive fix, the more important one**: `app/habit/[id].tsx` no
   longer trusts `habit.requireNote`/`requirePhoto` directly — added
   `effectiveRequireNote`/`effectiveRequirePhoto`, both forced `false`
   whenever `habit.challengeGroupId` is falsy, and every enforcement site
   reads through these instead of the raw fields. Room rules are a
   group-mission-only concept by definition, so this invariant is now
   enforced at the point of use, not just hoped for at every write site —
   a future code path that clears `challengeGroupId` and forgets the room-
   rule fields (exactly what just happened) can no longer resurrect stale
   rules.

**Also fixed while at it**: `20260925130000_habit_room_rule.sql` (adds
`require_note`/`require_photo`) was timestamped *after*
`20260925120000_challenge_removed_members.sql` (the RPC that references
those columns) — migrations apply in filename order, so the removal
migration would have failed outright on a clean `db:reset` once it started
referencing columns that didn't exist yet. Renamed to
`20260925110000_habit_room_rule.sql` so it runs first.

**Verified end-to-end with a real scripted test** (not just read the SQL):
seeded a Hard-rule mission with the member's habit having
`require_note=true, require_photo=true`, called the real removal RPC as
the creator, then read the habit back *as the removed member* — confirmed
`challenge_group_id`, `require_note`, and `require_photo` are all `null`
afterward. `npx tsc --noEmit` clean after the client-side change.

### Phase 3 UI de-scoped behind a feature flag, same session

User's call after reviewing what Custom actually delivers today: not a
strong enough premium tier on its own (Hard already covers note+photo;
Custom's only real addition is one thin combination), and richer premium
controls (streak minimums, photo-memory rules) are wanted before shipping a
"Custom" tier for real. User's literal instruction was to "comment out" the
custom-rules code as a future entry point — pushed back on that in favor of
a feature flag instead (comment-outs stop typechecking and bit-rot silently;
a flag keeps the code live, tested, and equally inert), which the user did
not object to.

**Change:** added `const CUSTOM_ROOM_RULES_ENABLED = false;` to
`src/components/GroupChallengeSheet.tsx`, wrapping the "Customize rules"
row, its premium-upsell branch, and the two `Switch` rows in
`{CUSTOM_ROOM_RULES_ENABLED ? (<>...</>) : null}`. Nothing else changed —
no migration, no data-model change, no changes to enforcement. See the
Phase 3 section above for the full "what's preserved / how to re-enable"
breakdown.

**Verified:** `npx tsc --noEmit` clean; re-read the surrounding JSX to
confirm only the Easy/Medium/Hard preset row, the hint text, and "Start
group mission" render now. `npm run db:reset` re-run after this change as
part of the standard local-verification pass (no migration touched by this
change, so this was a sanity re-check, not a required step).

### Medium/Hard semantics correction — "either" vs "both", same session

User caught this by reasoning through it, not by hitting the bug live:
Medium was built as "a note is specifically required," so a member who
diligently attached a photo but no note would still get blocked — which
is actually Hard's behavior wearing Medium's label. Correct intent,
user's words: Easy = mark complete, note/photo optional; Medium = **either**
a note or a photo; Hard = **both**.

**No migration needed.** The two boolean columns already had enough
information — the bug was entirely in how the *enforcement* code
interpreted them. Fixed by changing "exactly one flag true" to mean
"either satisfies" instead of "this specific one is mandatory":
- `StreakMemorySheet.tsx`: `handleSave`'s extra validation now only fires
  when **both** `requireNote` and `requirePhoto` are true; a lone true
  flag relies on the pre-existing "nothing to save" check (which already
  requires at least a note or a photo) and needs no separate block. Hint
  text now has three branches (none/either/both) instead of two.
- `app/habit/[id].tsx`: `handleMarkChecklistDayComplete`'s bypass guard
  now computes `bothRequired = requireNote && requirePhoto` and checks
  `note || photo` when not both-required, `note && photo` when both are.
  `effectiveRequireNote`/`effectiveRequirePhoto` no longer OR `requirePhoto`
  into `requireNote` (that quirk existed only to force Medium into
  "note-specifically" under the old, wrong semantics) — the two raw flags
  now pass straight through, and `StreakMemorySheet` derives the
  none/either/both split itself.
- `GroupChallengeSheet.tsx`: Medium's chip hint and description copy now
  say "a note or a photo," Easy's description now explicitly says notes
  and photos are optional (not just "no note/photo required"). Also
  updated the file-header comment about Custom's value: since a lone true
  flag always now means "either," independently toggling the two switches
  can no longer produce any combination Easy/Medium/Hard don't already
  cover — Custom has **zero** distinct value today, not just one thin
  combination as originally noted (see Phase 2's "fourth combination" note
  and Phase 3's de-scope section, both updated to match).

**One side effect worth flagging explicitly**: the previously-unreachable
"photo required, note optional" meaning (a specific-type requirement, as
opposed to "either") no longer exists anywhere in this model. If a future
Custom redesign wants that specific-type semantic back, it needs a third
signal (e.g. a distinct `requireEither` flag or a small mode column) — the
current two booleans can no longer express it now that a lone flag means
"either." Flagging this here so a future session doesn't reintroduce the
old bug while trying to make Custom useful again.

**Verified:** `npx tsc --noEmit` clean after all four files. Not yet
re-verified against a live local-Supabase round-trip (this was a pure
client-side enforcement/copy fix, no server data shape changed) — worth a
quick on-device sanity check (Medium mission: photo-only completes it;
Hard mission: photo-only still blocks, asks for the note too) before
calling this fully closed.

**Not committed to git yet** — same as every other entry in this log.

**Not committed to git yet** — same as every other phase this session.

### Moderation entry point redesigned — "⋮" replaced with a labeled pill

The user disliked the three-dot (`MoreVertical`) icon on `ParticipantCard`
as the moderation entry point: too generic ("more options" reads as any
menu, not specifically as remove/report), not intuitive, and not visible
enough. Iterated through several design directions as HTML mockups
(published as an Artifact, not committed anywhere in the repo) before
landing on the final shape — same slot in the header row, next to the
streak pill, same tap target, same `onModerateMember` callback and confirm
dialog as before, only the visual changed:
- A small pill, outlined (not filled), sitting where the icon used to be.
- The word spelled out — **"Remove"** for the creator, **"Report"** for
  everyone else — instead of an icon-only affordance.
- Border and text both the card's plain muted grey (`theme.colors.border` /
  `theme.colors.textMuted`) — no red/amber anywhere on the pill itself, so
  it doesn't compete with the name, level, or streak pill for attention at
  rest.
- One small colored icon inside the pill, ahead of the word, carries the
  only color: a red `X` (`theme.colors.red[500]`) for Remove, an amber
  `AlertCircle` (`theme.colors.amber[500]`) for Report. This was a
  deliberate middle ground reached over a few iterations — fully colored
  text+border read as too loud/generic-AI for this app's minimalist look;
  fully gray with no color at all lost the "this one's destructive" signal
  entirely; a small colored icon keeps that signal without recoloring the
  whole pill.

**Change:** `app/challenge/[id].tsx` — swapped the `MoreVertical` import
for `AlertCircle` (kept the already-imported `X`), replaced the icon-only
`Pressable` with one that renders `X`/`AlertCircle` + a `Text` label side
by side, and reshaped `participantModerateBtn` from a bare icon-padding
box into a bordered pill (`flexDirection: "row"`, `borderRadius: 999`,
`borderWidth: 1.4`, small horizontal/vertical padding), plus a new
`participantModerateBtnText` style. No change to `handleModeratePress`,
`onModerateMember`, or anything server-side — purely the entry point's
appearance.

**Verified:** `npx tsc --noEmit` clean (confirms `AlertCircle` exists in
the installed `lucide-react-native` version). Not yet seen live on a
simulator/device — worth a quick visual check (both the creator's "Remove"
pill and a member's "Report" pill, in both light and dark) before calling
this done.

**Not committed to git yet** — same as everything else in this log.

**Follow-up, same session — asymmetric final shape.** Asked directly
whether icon-only (no label) would have been intuitive enough on its own:
the answer was "depends which one" — a red `X` for Remove is close to a
universal "remove this" symbol, but the amber `AlertCircle` for Report
isn't self-evident the same way (a flag icon would read as "report" more
clearly than a generic alert glyph, and even that's weaker than the word
itself). The user's call: **drop the text for Remove, keep it for Report.**
- Creator's affordance is now icon-only — a bare `X` (`size={16}`,
  `theme.colors.red[500]`), no border, no pill, no label — using the new
  `participantModerateIconBtn` style (same shape/padding as the original
  pre-redesign `MoreVertical` button).
- Member's "Report" affordance is unchanged from the previous entry:
  amber `AlertCircle` + "Report" text inside the muted-outline pill.
- Both still call the same `handleModeratePress` → `onModerateMember` →
  the same confirm dialogs as before; only the two affordances' shapes
  diverged, not the logic.

**Verified:** `npx tsc --noEmit` clean. Still not seen live on a
simulator/device.

**Reverted after seeing it rendered (screenshot, not just reasoning).**
The bare red `X` next to the nudge-chip row looked out of place in
practice — visually it read as an error/close glyph floating in the
header, not as a moderation action. User's call: **for Remove, drop the
icon too — just the word, in the same muted-outline pill as Report.**
Final settled shape:
- **Remove** (creator): plain muted pill, `theme.colors.border` outline,
  `theme.colors.textMuted` text, word "Remove" only — no icon, no color
  beyond the shared muted tone. Deliberately less visually loud than a
  destructive action might otherwise warrant, but the user's own
  reasoning: the creator won't be confused by an undecorated label for
  their own moderation action, and the confirm dialog is still the real
  safety net either way.
- **Report** (everyone else): unchanged — amber `AlertCircle` + "Report"
  text, same muted pill shape.
- Removed the now-unused `participantModerateIconBtn` style; both
  affordances share `participantModerateBtn` again.

**Verified:** `npx tsc --noEmit` clean. This is the shape to check live
on a simulator/device next — three iterations in on styling alone, so
worth actually seeing it before any further tweaking from reasoning
alone.

### Confirm-dialog copy: highlighted names, no more em dashes

The two `showAppAlert` confirm dialogs behind the pills (Remove / Report)
got a copy pass: the target member's name is now colored inside the
message (red for Remove, amber for Report, matching each pill's icon
color), the word "creator" in the Report dialog is bold and
`textPrimary` (so it reads as a distinct role reference, not just prose),
and both messages dropped their em dashes in favor of a second sentence
(split as its own paragraph) instead of a dash-joined clause.

**This required a small, backward-compatible change to the shared dialog
system**, not just this one screen: `AppDialogContext.tsx`'s `message`
field was `string`-only, which can't carry per-segment styling.
Widened `DialogState.message`, `AppDialogContextValue.showAlert`'s
`message` param, and the exported `showAppAlert(...)`'s `message` param
to `string | ReactNode` — every existing plain-string call site is still
valid (a string is a valid `ReactNode`), so nothing else in the app
changes behavior. The one thing that does need to degrade gracefully:
`showAppAlert`'s native-`Alert.alert` fallback path (only reachable
before `AppDialogProvider` mounts) can't render a rich node, so it now
passes `undefined` instead of a `ReactNode` in that case — practically
unreachable for these two dialogs since the provider is already mounted
by the time a challenge screen exists.

`onModerateMember` in `app/challenge/[id].tsx` now builds each message as
a `<>...</>` fragment of nested `<Text>` runs (colored/bold segments plus
plain-color segments that inherit the dialog's default text color from
the outer `<Text>` in `AppDialogContext`), with a literal `{"\n\n"}`
between the two sentences for paragraph spacing instead of one dense
run-on line.

**Verified:** `npx tsc --noEmit` clean; grepped the file afterward to
confirm no em dash survived in either message. Still needs an on-device
look — this is the first place in the app rendering a rich (non-string)
`AppDialogContext` message, worth confirming the nested `<Text>` spacing
and colors actually render as intended before treating this pattern as
reusable elsewhere.

### Audited, not a bug: removed member's Community post can't portal back into the old group

User's concern: after removal, a habit keeps its original title and can
still be posted to Community — does tapping that post anywhere let a
viewer (or the removed member themselves) navigate back into the
original `challenge_groups` row, or "join" it as if the post still
belonged to that group? Traced the actual code paths (not just reasoned
about it) rather than assuming Phase 1's `challenge_group_id = null` fix
was sufficient on its own:

- `community_wins` (`src/lib/communityWinsApi.ts`'s `CommunityWinRow`)
  never stores a `challenge_group_id` snapshot at all — there's nothing
  on the post itself that could go stale.
- The one door from Community into `/challenge/[id]` — tapping a mission
  line in the feed or in a player's journey — calls
  `fetchChallengeGroupIdForHabit` (`groupChallengesApi.ts:357-366`), which
  hits `rpc_challenge_group_id_for_habit_v1`
  (`supabase/migrations/20260921130000_challenge_group_id_for_habit.sql`):
  a live `select challenge_group_id from habits where id = ...`, the
  exact column the removal RPC already nulls. Post-removal this
  correctly resolves to `null`, and the UI shows "This mission isn't
  part of a group — nothing to join" instead of navigating anywhere.
  Same RPC, same behavior in both `CommunityWinsFeed.tsx` and
  `app/community-player/[id].tsx` — no separate/older code path in
  either that might have been missed.
- No other tap target in Community (avatar, name, win detail) routes to
  `/challenge/[id]` at all — only that one mission-line tap, and it's
  gated by the live check above.

**No fix needed** — Phase 1's `challenge_group_id = null` on removal was
already sufficient, because every "should this route into a group"
decision in the app re-checks that live column at the moment of the tap
rather than trusting anything cached earlier. Recorded here so a future
session doesn't re-audit this from scratch if the same question comes up
again.

### New: room-rule tier now shown at invite time, plus a commitment step before Accept — habits only

User's pitch had three parts; only two were built, one was deliberately
skipped after discussion:

1. **Skipped, by agreement**: an Easy/Medium/Hard badge on every habit
   card on Home. The level is set once at creation and essentially never
   changes, so it's not a per-glance decision the way it is at accept
   time — it would have been a permanent extra badge on an already busy
   card for information that matters exactly once. Not built.
2. **Built**: the invite screen (`app/(tabs)/compete.tsx`) now shows the
   mission's tier next to the existing "Group" pill on a pending/accepted
   invite card, via `InviteMissionHeader`.
3. **Built**: accepting a habit invite now has one extra step — a
   `ConfirmDialog` ("Accept & join this mission?") with a fixed promise
   line plus one tier-specific rule bullet, and an "I Accept" button that
   actually runs the existing accept flow. "Not now" just closes it,
   changing nothing.

**New shared helper**: `src/lib/roomRules.ts` — `roomRuleTierFromFlags`
(the reverse of `GroupChallengeSheet.tsx`'s forward preset→booleans
mapping; nothing like this existed before, since every prior use of
`requireNote`/`requirePhoto` needed the raw booleans, not a named tier),
`roomRuleTierLabel` ("Easy"/"Medium"/"Hard"), and
`roomRuleTierCommitmentLine` (the first-person rule sentence shown in the
commitment dialog).

**Why this only touches habit invites, not mini missions, with zero new
gating logic needed**: `InviteMissionHeader`/`InviteCardMeta` are shared
by both `renderGroupInviteCard` (habits) and `renderLiveMiniInviteCard`
(mini missions) in `compete.tsx`, but only `parseInviteCardMeta` (the
habit-invite path) sets the new optional `roomRuleTier` field —
`liveMeta` (the mini-mission path, built inline where `InviteMissionHeader`
is used for live minis) never sets it, so the pill and the whole
confirmation step naturally only activate for habit invites. No mini
mission code path was touched at all.

**Implementation note**: the commitment step sits at the UI layer only —
tapping "Accept" now sets `pendingRuleConfirmInvite` instead of calling
`handleAcceptGroupInvite` directly; the dialog's "I Accept" button is the
only thing that still calls it. `handleAcceptGroupInvite` itself
(premium check, `addHabit`, `acceptInviteAndJoin`, etc.) is completely
unchanged — this only moved when it fires, by exactly one extra tap and
one dialog. One minor, accepted UX reordering: a non-premium user now
sees the rules-confirmation dialog before hitting the premium upsell
(previously the upsell fired immediately on the first Accept tap) — the
"Group missions need Community" hint text on the card itself still shows
before either dialog, so nothing is hidden from them.

**Verified:** `npx tsc --noEmit` clean. Not yet seen live on a
simulator/device — worth confirming the pill wraps correctly next to the
existing "Group" pill on a narrow phone, and that the commitment dialog's
bullet text matches the actual mission (test with an Easy, a Medium, and
a Hard invite, not just one).

**Not committed to git yet** — same as everything else in this log.

### Invite card layout fix — real bug caught by the user testing the tier pill live

Confirmed working (both a Hard invite and a real accepted invite showed
up correctly with the new tier pill and the commitment dialog), but the
user flagged a real layout problem from the screenshots: the title now
had to fight the "Group"/tier/status pills for the same row, wrapping
badly on a long title and looking crowded even on a short one — three
different pill treatments (filled indigo, muted outline, filled color)
side by side didn't read as one family either. Iterated with an artifact
(mockups of the actual bug plus three fix options) before touching code;
user picked **Option A**.

**Change, `app/(tabs)/compete.tsx`:**
- `InviteMissionHeader` no longer renders any pills at all — it's just
  the title (now full-width, its own line) and description. Dropped its
  `isDark`/`statusPill` props, no longer needed.
- New `InvitePillRow` component renders the pill strip at the **bottom**
  of the card, after the description/from/status-text/View-Group-Streaks
  content: "Group"/"Live Mini" and the room-rule tier are now both
  plain muted-outline pills (`theme.colors.border`/`textMuted`, same
  family as the Remove/Report pills from earlier), while the
  Accepted/Declined/"Action needed" status pill keeps its existing
  filled color — that's the one pill that's actually dynamic, so it's
  the only one still meant to catch the eye.
- Placement differs slightly by card state, matching what the user asked
  for directly: on the pending card, the pill row sits right before the
  Decline/Accept buttons (folding the old separate "Action needed"/
  "Joining..." row into it); on resolved (accepted/declined) cards, it
  sits after the existing `resolvedBlock` (status text + View Group
  Streaks / sync hint) — title → description → from → status text → View
  Group Streaks → pills, exactly the order requested.
- The Live Mini invite card shares `InviteMissionHeader`/`InviteCardMeta`
  but never sets `roomRuleTier` — its own `InvitePillRow` call only ever
  renders the "Live Mini" pill (no tier), added right before its action
  buttons for the same reason; its existing status/timer pill row was
  untouched.
- Removed now-dead `inviteTitleRow`/`invitePillsCol` styles; added
  `invitePillRow`.

**Verified:** `npx tsc --noEmit` clean. Not yet seen live after this
specific change — the tier pill itself was already confirmed working
live before this layout fix; this pass hasn't been re-screenshotted yet.

**Not committed to git yet** — same as everything else in this log.
