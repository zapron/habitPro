# HabitPro — Planned, Not Started

Backlog of features/fixes that were discussed and scoped but not yet built.
Cross-reference `docs/CURRENT_WORK.md` for session-by-session history of what
*has* shipped.

## Deferred deep linking for invite links (not started)

Today's invite links (Live Squad + group challenges) all round-trip through
`habitPro-web/app/invite/page.tsx` — a new user installs the app from the
store badge, opens it cold, and has to open the link again to land on the
right screen. True deferred deep linking (install → land straight in the
squad/challenge on first open, no second tap) needs a third-party
attribution SDK or a custom install-referrer token scheme, plus new native
config (`associatedDomains`/`intentFilters`, AASA/`assetlinks.json`) —
confirmed via investigation that none of this exists in either repo today.
Materially bigger lift than the link-join feature itself; worth it only if
the "open link again after install" step turns out to be a real funnel
leak.

## Invite-link sharing is not tap-friendly on every channel (scoped, not built)

Real user report: AirDropping a Live Squad invite link handed the receiver
inert plain text — no tappable link — and pasting that text into Google
made it search the text instead of opening the URL. Root cause:
`shareInviteLink()` (`src/lib/inviteShare.ts`) intentionally sends only a
`message` string with the URL embedded in a sentence (a prior deliberate
choice, to avoid iOS showing a duplicate raw-link preview alongside the
text). That makes iOS hand the payload over as plain text
(`public.plain-text`), not a URL-typed item, so AirDrop/Notes/etc. can't
recognize it as a link.

**Scoped fix, OTA-safe:** on iOS, pass `url` and `message` as separate
fields to `Share.share()` (trim the link out of `message` itself so it
isn't duplicated) so the OS shares a real `NSURL` item — tappable via
AirDrop, Notes, Messages. Android stays as-is; its share intent already
auto-linkifies a URL inside plain text. User has not yet said go.

## Share-a-moment card has no real link in the share payload (needs a native dep, not started)

The "share your win" card (`ShareWinModal.tsx` → `MissionShareCard.tsx`)
sends only a captured PNG via `expo-sharing`'s `shareAsync()` — that API
has no caption/text parameter on either platform, so today literally no
real link is ever transmitted with the image. The "Get HabitPro" text and
QR code on the card are just pixels, not an actual clickable/copyable link
anywhere in the share payload.

**No way to make pixels clickable** — needs a library that can attach an
image + a text caption together in one share action (`react-native-share`'s
`Share.open({url: fileUri, message: captionWithLink})` is the standard tool
for this; RN's built-in `Share` has no file/image support on Android, and
`expo-sharing` has no caption support on either platform). Not currently a
dependency — adding it means a new native module, so it needs a real
rebuild + store release, not an OTA. Worth doing since a share card with no
real link undercuts the acquisition case, but should wait for the next
native-build cycle rather than being bolted on standalone.

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
