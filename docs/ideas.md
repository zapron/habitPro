# HabitPro — Planned, Not Started

Backlog of features/fixes that were discussed and scoped but not yet built.
Cross-reference `docs/CURRENT_WORK.md` for session-by-session history of what
*has* shipped.

## Live mini-mission external invites (potential major USP)

Habits are an open-ended commitment that's hard to get someone else to join;
a live mini mission (short, timed) is a much easier ask — "join me for the
next 25 minutes." Could be a real differentiator if the invite/accept flow
were built out properly.

**Not scoped or built yet.** Open question that decides the whole
architecture: does an invite link need to work for someone who doesn't have
the app yet (deep-link → store → auto-join on first open), or only for
existing users? That fork decides auth-before-join vs join-before-auth,
guest state, etc. Needs a real planning pass before any code.

## Live mini-mission memory loss on timer expiry (confirmed bug, fix scoped)

A live (shared) mini mission whose timer expires loses its captured
photo/note memory — solo missions already preserve it correctly, live ones
don't.

**Root cause** (confirmed via code investigation): `syncLiveMiniFromLocalMission`
(`src/lib/liveMiniMissionProgress.ts`) nulls `memoryNote`/`memoryImageUrl`/
`memoryGallery` whenever the synced outcome isn't `"completed"`, so a
`"missed"` sync never sends the memory to the squad board even though it was
captured locally before expiry.

**Minimal fix**: have `syncLiveMiniFromLocalMission` transmit the
best-available captured memory on a `"missed"` outcome too, and extend the
`rpc_sync_live_mini_progress` RPC to accept/store it instead of discarding
it. Touches a sync RPC — needs explicit go-ahead before starting.

## Brand accent hierarchy — amber as a second accent

After the indigo → forest-green/maroon rebrand, the app currently leans on
one accent family. Worth revisiting: bring amber back as a genuine second
accent for non-success contexts (it's already used for warnings, and for the
splash mark's own "ignite" moment) so not everything visually competes for
the same hue register. No decision made yet.

## Custom Room Rules (Phase 3 of Group Challenge Governance)

De-scoped behind `CUSTOM_ROOM_RULES_ENABLED = false` — preset room rules
(Easy/Medium/Hard) shipped; letting a group creator define fully custom
verification rules did not. Flag exists in code; feature itself unbuilt.

## Per-message moderation in squad activity feed

No in-app control exists for a creator or the recipient to delete a single
`challenge_nudges` row (a squad's nudge/custom-note message) — every such
request today requires a manual DB deletion (see `docs/CURRENT_WORK.md`,
2026-09-27 entry, for the precedent). Worth a delete affordance on
`SquadActivitySection`'s own nudge, at minimum for the sender to retract
their own message; creator-deletes-others'-message is a moderation-authority
question in the same spirit as the kick-out design and should probably
follow that same pattern if built.

## Hot-window sync cutoff (bounded data load)

Phases 0-3 shipped (paginated history RPCs, Mini Missions search, My
Journey's public-side pagination). Phases A-F — lifetime-stats RPC,
by-id RPCs, routing the full pull through the existing safe-merge function,
actually windowing the default fetch, and paginating My Journey's private
side — are planned in detail but not started. Full plan:
`~/.claude/plans/reflective-baking-sparkle.md`. Explicit rule for this one:
every phase gets verified locally before any `db:push`, no exceptions.
