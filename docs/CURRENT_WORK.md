# HabitPro Current Work

Last updated: 2026-09-26 (real incident: two `eas update` OTA publishes shipped the Android **test** RevenueCat key to production instead of the real one — root cause and fix below; read this before running `eas update` again). Full detail immediately below; the 2026-09-25 group-mission-governance entry follows after.

## Session Handoff (2026-09-26 — production incident: test RevenueCat key shipped via OTA, fixed)

**State: no git changes this entry — this was a deploy-process incident, not a code bug. Two prior OTA publishes (update groups `1ac83fee-d03e-46ef-bce3-6da3eb172c96` and `5db92263-d9f1-4ccf-b38f-eacb22deefe3`, both from this session) are superseded by a corrected republish, update group `afbcf601-f881-408c-92d6-07728f7d2b96`.**

**What happened:** user reported Android showing a "this build does not support payment" style error and asked whether a test API key had leaked into production. Investigated and confirmed: `.env` (local dev config, intentionally) has `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY=test_jkOIAHcareNiaouBbWabGEDfNZf`, while the real key lives in EAS's hosted "production" Environment (`goog_FLwtHCGUIagwfQwAoqRnmDRqMVP`, confirmed via `eas env:list --environment production`). `eas update` only pulls the EAS-hosted environment's vars when you pass `--environment <name>` explicitly; run without it (as both prior publishes in this session were), it silently falls back to whatever's in the local shell/`.env` files. Confirmed the actual live bug, not just the theory: extracted the previously-published Android `.hbc` bundle from a fresh `eas update` run's local `dist/` output and found the literal `test_jkOIAHcareNiaouBbWabGEDfNZf` string baked in, with no `goog_...` RevenueCat key present anywhere.

**iOS was never affected** — `.env`'s iOS key already happens to match the real production iOS key, so this only ever manifested for Android.

**Fix:** republished immediately with `npx eas update --branch production --environment production ...`. Verified the new bundle's `.hbc` contains the real `goog_...` key and no trace of the test key.

**Open question, not yet answered**: whether earlier sessions' OTA publishes (going back further than this session) also omitted `--environment production` and could have shipped this same test key at some point in the past — not checked, since older `dist/` output no longer exists locally to inspect. If Android purchase failures were reported before this session, they may share this root cause.

**The safeguard already existed and was bypassed, not missing.** `package.json` already has `"update:production": "eas update --channel production --environment production"` — the correct, safe command was sitting right there. Both broken publishes happened because the raw `eas update --branch production ...` was run directly instead of `npm run update:production`. **Lesson for every future session (and the user): always run `npm run update:production` for a real OTA push, never call `eas update` directly with hand-typed flags** — the command succeeds either way with no warning about which env vars it actually used, so a missing `--environment` flag fails silently, not loudly.

### Second issue, same session: spurious "Restore Backup" prompt, root cause found and fixed

User's report: "Restore Backup" (the "Recovery snapshots" card in `app/(tabs)/profile.tsx`) sometimes appears around login/logout for no reason, even when data is fine. Root cause: `hasRecoverableMissionData` (`profile.tsx:296-`) decides whether to offer a restore purely by comparing raw check-in/memory/completed-mini **counts** between a locally cached backup and whatever's currently in the store — no concept of *why* current might be smaller. That assumption broke on 2026-09-19's "hot-window cutoff" change (`489c640`): a normal sign-in now only eagerly loads active missions (unbounded) plus the most recent `HOT_WINDOW_HISTORY_PAGE_SIZE = 20` items per terminal bucket (completed/failed habits, completed/cancelled/missed minis) — see `pullWindowedFromSupabase` in `src/lib/sync.ts`. Any backup with more historical items than that window (completely normal — the rest is one "Load More" tap away, never lost) now looks like "recoverable data" and fires the prompt on a perfectly healthy account. This exact risk was flagged (and explicitly deferred) in the hot-window work's own plan doc at the time — it's now actually happened.

**Fix:** `hasRecoverableMissionData` now only compares **active** habits' check-in/memory counts (active missions are never windowed — `pullWindowedFromSupabase` loads them unbounded — so a mismatch there is a genuine signal). The completed-mini-count comparison was removed entirely — a completed mini has no "active" fallback the way a habit does, and its count is inherently part of the windowed/paginated bucket, so it can never be compared safely without a server-side lifetime-totals check (which doesn't exist yet). `countCompletedMinis` (now fully unused) was deleted.

**Trade-off, stated plainly:** this narrows what the recovery-snapshot safety net can catch — it no longer flags a loss confined to completed/historical missions, only to still-active ones. The right long-term fix is a lightweight server-side lifetime-totals RPC to compare against instead of the local windowed store (this was already independently proposed as "Phase A" of a hot-window follow-up plan, not yet built) — flagging here so a future session doesn't have to rediscover this.

**Verified:** `npx tsc --noEmit` clean. Not yet seen live — worth a real sign-out/sign-in cycle on an account with old completed missions to confirm the prompt no longer fires when nothing is actually wrong.

## Session Handoff (2026-09-25, second entry — group mission governance: kick-out, room rules, invite commitment step)

**State: `main` is 4 commits ahead of the previous entry's tip (`277ed3d`..`4a72df6`), pushed to `origin`. `npx tsc --noEmit` clean after every commit. Both new migrations pushed to production by the user via `npm run db:push`. Published to production OTA (see #4 below).**

Full technical detail lives in `docs/GROUP_CHALLENGE_GOVERNANCE.md` (new this session) — this entry is the condensed version.

**1. Group mission kick-out with sole-admin authority (`9b7aba4`).** Creator-only removal of a member from a public group mission, additive to the existing peer-vote join-request system (that stays for admission; this is moderation). Removing someone only clears `habits.challenge_group_id` (+ room-rule flags) — their own progress survives as a normal personal mission. New `challenge_removed_members` table permanently blocks re-joining/re-inviting. Non-creators get a private "Report member" instead. `ParticipantCard`'s moderation entry point iterated through several shapes (icon, pill, icon+text) before settling on a muted-outline pill — "Remove" plain text for the creator, amber-icon "Report" pill for everyone else.

**2. Preset room rules for group missions — Easy/Medium/Hard (`b85e5ad`).** Creator picks check-in strictness when starting a group mission: Easy (mark complete), Medium (a note **or** a photo), Hard (both). Stored as two plain booleans (`habits.require_note`/`require_photo`), not an enum — enforced client-side, matching this app's local-first trust model. Real bug caught by the user testing live: room rules survived being removed from the group; fixed at the source (removal RPC now also clears both flags) and defensively (`app/habit/[id].tsx` derives `effectiveRequireNote`/`effectiveRequirePhoto`, forced false whenever not in a group). Premium "Custom" room rules were built, then hidden behind `CUSTOM_ROOM_RULES_ENABLED = false` for this release — the user's call, since it has no distinct value over the presets today.

**3. Invite-time mission difficulty + a commitment step before Accept (`820e83e`).** Habit invite cards now show the mission's tier next to "Group". Accepting a habit invite (mini missions untouched) now requires one extra confirm step: a promise line plus the specific rule for that mission's tier, "I Accept" to actually join. Also fixed a real layout bug caught from a live screenshot: pills were fighting the title for the same row; moved to their own row at the bottom, unified to a muted-outline style except the one pill that's actually dynamic (Accepted/Declined/Action needed).

**4. Migrated, then pushed and OTA'd.** User ran `npm run db:push` (both migrations live in production) before anything shipped — critical because `sync.ts`'s `habitToRow` writes `require_note`/`require_photo` on **every** habit upsert, not just group missions, so OTA-ing the JS first would have broken habit sync for every user. Once the migration was confirmed live: `main` pushed to `origin` at `4a72df6` (`277ed3d`..`4a72df6`: the 4 commits above). Published to production OTA: update group `1ac83fee-d03e-46ef-bce3-6da3eb172c96`, runtime `1.1.36`, commit `4a72df6` — confirmed via `git diff e6deeaf..HEAD --stat -- package.json package-lock.json app.json eas.json` that the only diff since the last real native build is the already-vetted dev-tooling + pure-JS `react-native-qrcode-svg` change from a prior session, so this was safe to OTA.

**5. Follow-up fixes after live testing, pushed and OTA'd separately (`3e31f29`).** User tested live and reported two things: the invite card's Decline/Accept buttons sat flush against the new bottom pill row with no breathing room (`inviteActions` gained `marginTop: 14`, gap bumped to 12) — pushed to `origin`, OTA'd (update group `5db92263-d9f1-4ccf-b38f-eacb22deefe3`, commit `3e31f29`). Also manually granted `raktim_info` 3 months of Community/premium access via `community_access_grants` (`grant_type: 'promo'`, `source: 'manual_admin_grant'`), same durable pattern as the earlier `sudeshna` grant — their old 30-day trial had expired 2026-08-26, so the account's `profiles.is_premium = true` was stale and `profile_is_premium()` was actually returning `false` until this grant; verified it now returns `true`. This was a direct production data change, not a migration — no schema touched.

**Not yet done, explicitly next**: Phase 1's one open item (re-inviting a removed member showed no result on the simulator) is still parked for a physical-device test — see the governance doc's Status section before touching it again. Phase 4 (automated auto-kick) remains fully deferred. Premium "Custom" room rules exist in code but stay hidden behind `CUSTOM_ROOM_RULES_ENABLED = false` until richer premium controls are designed.

## Session Handoff (2026-09-25 — habit auto-share on complete, share card recolored to green)

**State: `main` is 2 commits ahead of the previous entry's tip (`6154ae9`..`b8c79af`), pushed to `origin`. `npx tsc --noEmit` clean after every commit. No new migrations. Published to production OTA (see below).**

**1. Habits now auto-open the share card after completing a day (`713031b`).** Mini missions already opened `ShareWinModal` automatically right after completion; habits only ever had the manual entry points (header button, gallery-viewer button) added in prior entries. Wired into all three ways a habit day can complete: the classic photo/note capture (`handleMemoryCommit`), a checklist day that auto-completes once its last task is logged, and the explicit "Mark Day Complete" button. Each reuses the already-existing `handleShareFromMemory(entry)` — no new share logic, just new call sites. Deliberately delayed 900ms behind the completion confetti (which runs ~1s) so the celebration animation gets to play before a modal covers the screen — copying it without the delay would have buried the confetti immediately.

**2. Share card recolored from indigo/navy to green, per direct design feedback (`b8c79af`).** User feedback verbatim: indigo "seems like very generic AI shit." Rather than guess at a replacement, built a preview artifact first (colors pulled from the app's real Minimalist-pack tokens, nothing invented) and only touched code after explicit approval — same discipline as every other visual decision this session (share-card layout, day-grid placement, all previewed before building).
- `ShareWinModal`'s Share button: was hardcoded to the primary indigo variant, now explicitly overridden to `theme.colors.green[600]`/`green[500]` (fill/border) — theme-aware, so it's a different real green in light vs. dark mode, same fill/border relationship the indigo button used.
- `MissionShareCard`'s plain (no-photo) card: tag color and day-grid `doneColor` were two different indigo/purple shades (`#8484e0`, `#5B5BD6`) — both now the single `#22c55e`.
- The photo card's bottom scrim: navy `rgb(2,2,63)` (originally sampled from the real logo) → forest `rgb(6,36,22)`, kept deliberately dark/desaturated so it still reads as a moody photo backdrop rather than a highlighter.

**3. Pushed and OTA'd.** `main` pushed to `origin` at `b8c79af` (`6154ae9`..`b8c79af`: the 2 commits above). Published to production OTA: update group `c8bc3d2f-6825-45a4-a8fd-28a1530fe5d4`, runtime `1.1.36`, commit `b8c79af` — confirmed via `git diff e6deeaf..HEAD --stat -- package.json package-lock.json app.json eas.json` that nothing native/config changed since the last real build, so this was safe to OTA.

**Not yet done, explicitly next**: two features discussed this session were deliberately deferred, not started — a streak-gated short-video reward (audited for Supabase cost/feasibility, verified real package versions for Expo SDK 54, but explicitly parked) and a drag-to-reorder UI for a mission's task/moment photos before publishing to Community (scoped, PanResponder-based approach recommended to stay OTA-safe, not started). A group-challenge "kick out member" mechanism was also designed (creator-authority removal + private report-to-creator flag, preserving the removed member's own progress as a personal mission) but not built.

## Session Handoff (2026-09-24, third entry — share picker replaced with in-viewer Share, moment-note truncation fixed)

**State: `main` is 2 commits ahead of the previous entry's tip (`1d1c5e8`..`b4a3e13`), pushed to `origin`. `npx tsc --noEmit` clean after every commit. No new migrations. Published to production OTA (see below).**

**1. The "Change photo" picker sheet from the previous entry never actually worked — found via real device testing on both platforms (`6ef6e02`).** User tried it on the iOS simulator: the share modal didn't come up at all. On Android: photos weren't appearing, and tapping "Change photo" landed on a blank screen. Root cause: the picker opened as a second native `Modal` while `ShareWinModal`'s own `Modal` was still `visible={true}` underneath it — the exact double-Modal-stacking pattern already found and fixed once before in this codebase (`MissionGalleryModal`'s description popup, logged 2026-09-16, where a second `Modal` opening while a `presentationStyle="fullScreen"` one was still open rendered behind it on iOS).

User's own suggested fix, unprompted: instead of a separate picker screen, put Share directly on the memory/moment viewers the user already opens — the habit honeycomb gallery's photo viewer, and the mini mission's per-task "moment" viewer. This is both simpler and structurally avoids the bug entirely, since there's never a reason for two Modals to be open at once.

Removed `SharePhotoPickerSheet` entirely (component deleted). Instead:
- **Habits**: `StreakMemoryGallery` gained an `onShare` prop — a Share button now sits in its existing fullscreen photo viewer, next to the close button. Sharing from a specific day's memory truncates the card's dot grid to completion **as of that day** (days after it show as not-yet-done even if they're actually complete now) — sharing an old day's photo next to today's full progress would misrepresent that moment. The header "Share" button (added in the previous entry) stays as the simple fast path: today's/most-recent photo, full live dot grid, no picker.
- **Mini missions**: the completed-mission's own per-task moment viewer (fullscreen `Modal`, already existed) gained a Share button. Then, per the user's follow-up observation that the moment carousel is already inline on the page (no tap needed to see it), **also** added a Share button directly in the "Your moment" section header — shares whichever moment is currently swiped to, no extra tap into the fullscreen viewer required. Both entry points call the same handler.

**2. Real bug found via a user screenshot while testing the above: mini mission moment notes were silently truncated (`b4a3e13`).** `MiniMomentCarousel`'s per-photo caption capped a moment's note at `numberOfLines={2}` (5 for a no-photo text-only slide) — for a real use case (a gym-workout mini mission logging several exercises with rep counts per moment), the actual data ran well past 2 lines and was lost to `...` with no way to read the rest, since the fullscreen viewer only ever showed the *photo* for a photo-bearing moment, never the note. Fixed: the caption now grows to fit its note in full (no cap); the no-photo slide (fixed-height frame) scrolls instead of clipping. Checked the other note-display spots in the app (habit's own memory viewer, mini mission's classic single-note view) — both were already unbounded; this was isolated to this one component.

**3. Pushed and OTA'd.** `main` pushed to `origin` at `b4a3e13` (`1d1c5e8`..`b4a3e13`: the 2 commits above). Published to production OTA: update group `b798af35-8316-4b55-83c6-bc834ef2608b`, runtime `1.1.36`, commit `b4a3e13` — confirmed via `git diff e6deeaf..HEAD --stat -- package.json package-lock.json app.json eas.json` that nothing native/config changed since the last real build, so this was safe to OTA.

**Not yet done, explicitly next**: nothing outstanding from this entry.

## Session Handoff (2026-09-24, second entry — share feature expansion, QR fix, local auth auto-seed)

**State: `main` is 3 commits ahead of the previous entry's tip (`29703b6`..`246f47d`), pushed to `origin`. `npx tsc --noEmit` clean after every commit. No new migrations this round. Published to production OTA (see #4 below).**

**1. Always-available Share button + habit streak-dot grid (`7c8ca68`).** Prior sessions only ever offered sharing right after a mini-mission completion. Both `app/mini/[id].tsx` and `app/habit/[id].tsx` now have a persistent Share icon in the header that opens the same `ShareWinModal` on demand, using whatever cover photo currently exists (mini mission: `completionMemory`; habit: most recent `streakMemories` entry with a photo).

Habit shares also get something mini missions don't: a compact streak-dot grid ("18/21 DAYS") rendered on the card, between the title and date. Explored three placements first via a design-comparison artifact (quiet strip under the title, a ring badge reusing the app's own streak-ring look, a tilted "graffiti stamp" over the photo) — user picked the strip. `MissionShareCard` gained `dayGrid`/`tagLabel` props (both optional, mini missions pass neither so their card is byte-for-byte the same as before); `app/habit/[id].tsx` computes `doneDays` from the habit's real `completedDates`/`totalDays` via the existing `calendarDateForHabitMissionDayIndex` helper — no new backend needed.

**2. Real bug found and fixed: the share card's QR code never actually worked, for either mission type (`1121d50`).** User reported it while testing #1. Decoded the bundled `assets/qr-get-habitpro.png` with OpenCV to check — it returned nothing at all, not even a wrong URL; the asset was simply corrupt (most likely from however it was downloaded from the QR-generator API originally). Since both mini-mission and habit cards share `MissionShareCard`, this had been broken for every share since it was introduced, never caught because no one had scanned one.

Fixed by generating the QR **live at render time** with `react-native-qrcode-svg` instead of shipping a static image — confirmed via `npm view` that its only non-JS dependency is `react-native-svg`, already linked in this app, so this needed no native rebuild, unlike most new-package additions. Verified the fix for real, not just by reading code: generated a QR with the same underlying `qrcode` library the component uses, decoded it independently with OpenCV, confirmed it resolves to the right URL, and confirmed it still decodes after simulating the downscaling a real device would apply. Deleted the now-dead asset.

**Also fixed in the same commit, per explicit user ask**: the footer's "habitpro-web.vercel.app" text (and now the QR's actual payload) had been hardcoded, despite `getHabitProWebUrl()`/`EXPO_PUBLIC_HABITPRO_WEB_URL` already existing and being used elsewhere in the app. Both the display text and the QR itself now call `getHabitProWebUrl()`, so changing that one env var (confirmed already set in both `.env` and EAS production) updates every card everywhere, no code change needed.

**3. Local dev: permanent fix for local sign-in silently breaking after every `db:reset` (`246f47d`).** User reported "my local db not working" — traced to a long-standing, previously-manual gotcha: `supabase db reset` wipes `auth.users` every time (the seed data is a `--schema public` dump, so `profiles`/`habits` rows come back but the auth account they belong to doesn't), so both the real dev account and the second test account used for the request-to-join flow vanished from local auth on every reset, requiring a manual re-seed each session (logged repeatedly in earlier entries, e.g. 2026-09-19, 2026-09-20/21).

New `scripts/seed-local-dev-users.mjs`, wired as `postdb:reset` — runs automatically after every `db:reset`/`db:push` (which resets first), re-creating both accounts with their fixed real ids (so existing snapshot data still resolves correctly) and a year of premium. Also exposed as `db:seed-users` to re-run on demand. Confirmed working end-to-end, not just by reading the code: ran a real `db:reset`, watched the hook fire automatically, then did an actual password-grant login against local GoTrue for the real account and verified it succeeded.

**4. Pushed and OTA'd.** `main` pushed to `origin` at `246f47d` (`29703b6`..`246f47d`: the 3 commits above). Published to production OTA: update group `56df7a1c-9618-4e55-b0c1-ae7fe6be603e`, runtime `1.1.36`, commit `246f47d` — confirmed via `git diff e6deeaf..HEAD --stat -- package.json package-lock.json app.json eas.json` that the only changes since the last real native build were the new pure-JS `react-native-qrcode-svg` dependency and dev-only npm script hooks (never bundled into the app), so this was safe to OTA.

**Not yet done, explicitly next**: nothing outstanding from this entry. The habit share card's no-photo (plain/minimalist) variant reuses the same `dayGrid` prop and was verified via typecheck but not separately screenshot-tested; the mini-mission "long shot"/multi-photo collage idea discussed earlier the same day remains unstarted.

## Session Handoff (2026-09-24 — promo-grant billing bug found + fixed, real user support)

**State: `main` is 1 commit ahead of the previous session's tip (`b5dd213`..`89f1036`), committed, about to be pushed. `npx tsc --noEmit` clean. One new migration tested locally, not yet pushed to production — user runs `db:push` themselves.**

**1. Manually granted a real user (`sudeshna`) 3 months of Community/premium access**, on request, via `community_access_grants` (`grant_type: 'promo'`, `source: 'manual_admin_grant'`) rather than editing `profiles.is_premium` directly — deliberately chosen so it can never be clobbered by a future RevenueCat billing webhook and stays cleanly revocable/auditable. Confirmed via `profile_is_premium()` that this correctly grants access... **from every check *except* the one that actually gates the client's paywall** (see #3).

**2. Audited a separate real report — a specific user's real Play Billing purchase attempt failing** (app owner suspected a code-level "test key" mixup). Traced `BillingContext.tsx`'s entire key-resolution path and the actual production EAS environment variables (`EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY=goog_...`, confirmed real, not a test key) — ruled out a code/config bug definitively; there's no per-user billing-key branching anywhere in this codebase, it's a single global key per build. Checked her real RevenueCat customer record (`get-customer`/`list-subscriptions`/`list-purchases`/`list-customer-events`, all via the RevenueCat MCP) — found zero purchase events of any kind, which points to the failure happening *before* RevenueCat's SDK call ever resolves (a Play Store account/payment-method/region issue on her device, not this app's billing integration). Not fully resolvable without Play Console access, which the agent doesn't have; recommended asking her for the exact Play Store error text as the next step.

**3. Real bug found while checking why grant #1 wasn't visibly unblocking her (`89f1036`).** The client's actual paywall-gating call, `rpc_get_community_access_status()`, only ever looked at `community_access_grants` rows with `grant_type = 'trial'` when computing `hasAccess` — a `promo` grant (the only other value the table's check constraint allows) was structurally invisible to it, even though `profile_is_premium()`/`profile_has_active_community_grant()` (used by other RPCs, e.g. the join-request voting system) already correctly treat any non-revoked, non-expired grant as active regardless of type. This meant a promo grant would *never* unblock anyone client-side — the paywall would show "This account already used its free trial" and demand payment indefinitely, confirmed by the user's own screenshots of exactly that screen.

Fixed by adding a second, type-agnostic "any active grant" lookup alongside the existing trial-only one, mirroring `profile_has_active_community_grant()`'s exact logic — the two paths can no longer disagree. Trial-specific response fields (`trialActive`, `trialUsed`, etc.) are untouched, still meaning "used the trial specifically." Added `'promo'` to the client's `CommunityAccessSource` type (was silently coerced to `'none'` otherwise) — confirmed no other call site reads this field today, so this was a pure correctness fix with no other behavior change. Tested locally: seeded a fresh promo grant, confirmed `hasAccess` flips `false` → `true` and `accessSource` correctly reports `"promo"` while trial fields stay accurately `false`.

**Not yet done, explicitly next**: push this commit to `origin`; user runs `db:push` for the new migration — until then, sudeshna's grant exists in the database but the paywall will keep showing for her, since the fix that makes the RPC see it hasn't reached production yet. The client-side type addition (`communityAccessApi.ts`) is JS-only and safe to OTA independently of the migration's timing, but does nothing on its own until the RPC ships.

## Session Handoff (2026-09-23, end of session — Community mission entry point, share-card redesign, misc fixes)

## Session Handoff (2026-09-23, end of session — Community mission entry point, share-card redesign, misc fixes)

**State: `main` is 6 commits ahead of the previous session's tip (`37e40b3`..`d26ffc0` before this docs commit), all committed, about to be pushed to `origin`. `npx tsc --noEmit` clean throughout. Two new migrations tested locally (individually and together via a full `db:reset`), not yet pushed to production — user runs `db:push` themselves.**

**1. Community → mission request-to-join entry point (`889ab4a`).** User's ask: tapping a mission's name directly from Community (main feed or a player's profile) should check membership and either open the cohort screen or the existing "Request to join" screen — without going through the player's journey first. Reused 100% of the request-to-join system built in the prior session; this was purely a missing entry point, not a new feature.

New migration `rpc_challenge_group_id_for_habit_v1` — single-habit lookup (bypasses RLS for this one narrow, non-sensitive field, same posture as the earlier by-id RPCs). habitId resolved from Community's existing `habitwin:<id>:<date>` synthetic-id convention rather than needing new tracking — exported the already-internal `habitIdFromStoryKey` and added a raw-`mini_mission_id` sibling, `habitIdFromHabitStreakMiniMissionId`.

**Design iteration, done deliberately rather than guessed at blind**: first attempt styled the tappable mission name in indigo bold text — user called this out as generic/AI-looking. Explored a full icon/badge comparison artifact (flag, wax-seal, squad-dot-stack, pennant, quiet-dot, plain-text — six options) for a *proactive* "Join" affordance. Landed on the pennant/"Join" direction conceptually, but then — asked directly to be honest about the cost — walked back to **plain, uncolored tappable text** for this trial: showing a "Join" badge *before* any tap requires resolving membership for every visible post ahead of time (a batch call per page load and pagination step, in two screens), which is real added complexity for a cosmetic affordance that might get abandoned after the trial. Built and tested the batch RPC (`rpc_community_habit_join_status_batch_v1`, confirmed correct against real mixed data — member/non-member/no-group cases all right) but deliberately left it unwired, in case the plain-text trial validates the interaction enough to invest in the proactive version properly later.

**Real bug found and fixed in the same file while wiring this** (`CommunityWinFeedPost.tsx`): swiping to a gallery photo with no note of its own was showing the *first* photo's note instead — `activeGalleryItem?.note ?? win.memory_note` fell through to the post-level "cover" note even when a real (just noteless) gallery item existed. Fixed so a real gallery item only ever shows its own note; the post-level fallback now only applies to the true single-photo/no-gallery case.

**2. Share-card redesign (`ffce87f`).** Replaced the flat indigo→cyan gradient (same "generic AI" feedback) with two real layouts: a photo fills the whole card Instagram-story style with a bottom scrim gradient sampled from the real logo's own navy, or — no photo — a plain neutral surface matching the app's actual Minimalist theme tokens instead of a placeholder checkmark on a gradient. Both now carry a QR-code + "Get HabitPro" footer baked into the image itself (bundled as a static local asset pointed at the public homepage, not fetched at render time, since the target never changes per-card) — so a shared card keeps a way back to the app regardless of how the image travels afterward. Landed on the photo-forward direction after a three-option comparison artifact.

**3. Live Squad share-link reverted (`94a20ac`).** Investigated what a non-member actually sees when tapping a Live Squad invite link (a real user flow question, not a hypothetical) — found a static "not found / your account cannot view it" dead end, since Live Squad has no request-to-join system (that only exists for Group Challenges). Rather than build a second full request/vote system for Live Squad in the same pass, removed the share-link button and reverted to the pre-existing host-searches-username invite flow. Live Squad request-to-join is a clean, scoped future task if ever wanted.

**4. Mini Missions status badge clipping, found via a real screenshot and fixed (`35b6d5a`).** `cardBadgeStack` had a hardcoded `maxWidth: 118`, sized for the common one-badge case. Whenever both the "Live" pill and the in-progress "🔥 On mission" badge needed to fit at once, the container was forced smaller than the text needed and the text clipped raw (no ellipsis) instead of wrapping. Removed the cap, gave the stack `flexShrink: 0` so it keeps its natural size, and let the title (already `numberOfLines={1}`) absorb the space pressure instead.

**5. Local dev: permanent fix for the recurring LAN-IP-drift issue (`d26ffc0`).** `.env.local` points at the Mac's LAN IP (not `127.0.0.1`) so one value works across iOS Simulator/Android Emulator/a physical device — but that IP drifted on WiFi reconnect **three separate times in this session alone**, each time surfacing as a generic, hard-to-diagnose "network request failed." New `scripts/sync-local-supabase-ip.mjs` detects the current LAN IP via Node's own network interface list and rewrites `.env.local` if stale; wired as `prestart`/`preandroid`/`preios` (npm's own pre-hook convention) so it self-heals automatically instead of needing a manual fix every time. Tested three ways (unchanged case, forced-mismatch case, actual npm-hook invocation) before considering it done.

**6. Pushed and OTA'd.** `main` pushed to `origin` at `8d14635` (`37e40b3`..`8d14635`: the 5 commits above + this docs entry). Published to production OTA: update group `61e3a8e5-6834-4345-994b-6f3e5f79906c`, runtime `1.1.36`, commit `8d14635` — confirmed via `git diff e6deeaf..HEAD --stat -- package.json package-lock.json app.json eas.json` that the only diff since the last native build (the new `pre*` script hooks, dev-tooling only, never bundled into the app) was safe to OTA.

**Not yet done, explicitly next**: user runs `db:push` for both new migrations (`rpc_challenge_group_id_for_habit_v1`, `rpc_community_habit_join_status_batch_v1`) once ready; the unwired batch join-status RPC is available whenever the proactive "Join" badge trial is revisited; Live Squad's own request-to-join system remains a clean, unstarted future task.

## Session Handoff (2026-09-21, end of session — growth Phase 1 + request-to-join)

**State: `main` is 3 commits ahead of the previous session's tip (`423b84b`..`84af185`), all committed, not yet pushed to `origin` as of writing this entry (pushed immediately after, see below). `npx tsc --noEmit` clean throughout. New migration tested locally via `db:reset`, not yet pushed to production — user runs `npm run db:push` themselves.** habitPro-web has its own 3 commits, already pushed (`ea7c5bd`..`3c9825a`), auto-deployed via Vercel.

**0. Preceding this session's code work: a full marketing/growth-strategy pass**, triggered by the user's explicit request to own PR/growth strategy for both the app and habitPro-web, targeting 250 users in 2 months and 1000 in 6 months. Declined to build anything resembling mass automated messaging/fake engagement/bot signups (Store policy + spam-law risk), and was explicit about the real boundary: can't run unattended automation for months, real execution (posting, store submissions) needs the user's own accounts. Audited both codebases before proposing anything — found habitPro-web had solid baseline SEO/OG metadata but zero analytics and no sitemap/robots.txt, and the app's invites were 100% host-initiated/in-app with no link that worked on a non-user. `docs/GROWTH_STRATEGY.md` (the full phased plan) and `docs/PLAY_STORE_LISTING.md` (rewritten listing copy targeting "accountability partner"-style searches) written and committed (`f479a05`).

**1. Growth Phase 1 shipped (`e6deeaf`, habitPro-web `a6ef620`+`086c4f4`).**
- **habitPro-web**: `app/sitemap.ts`, `app/robots.ts`, `@vercel/analytics` wired into `app/layout.tsx` — the site had none of this before. New `/invite` landing page (`app/invite/page.tsx`) — shows who invited you and to what, an "Open HabitPro" button (`habitpro://...` deep link), and Play Store/TestFlight badges for people who don't have the app yet. Icon badge went through one refinement pass (generic `Radio` lucide icon → the actual brand mark, per user feedback that it "needs some refinement").
- **App**: `src/lib/inviteShare.ts` builds the invite URL and calls `Share.share()` — wired into both `LiveMiniInviteSheet.tsx` and `GroupChallengeSheet.tsx` as a new "Share invite link" button alongside the existing username-search invite flow. **Real bug found via user testing and fixed**: `Share.share({ message, url })` — passing both fields made iOS attach `url` as its own share item, so recipients saw a raw, percent-encoded, unresolved link *ahead of* the actual message text ("gibberish link at the beginning," per the user's report). Fix: only pass `message` (URL already embedded in the text) — Android was unaffected since it only ever reads `message`.
- **Three new native modules** (`expo-store-review`, `expo-sharing`, `react-native-view-shot`) — confirmed with the user this means the next release is a real store build, not an OTA push, and the user explicitly chose to add all three now rather than defer:
  - `src/lib/reviewPrompt.ts` — fires at hand-picked engagement milestones (3rd/10th/30th/75th/150th mini-mission completion), min 21 days apart, AsyncStorage-backed. Correctly a no-op on TestFlight (Apple disables `StoreReview` there on purpose) until iOS actually ships to the App Store.
  - `src/components/MissionShareCard.tsx` + `src/components/ShareWinModal.tsx` — a branded gradient card (HabitPro mark, mission title, date, the completion photo if a *local* one exists — deliberately never a remote `imageUrl`, to avoid capturing a blank frame mid-load) shown after any of the three mini-mission completion paths, shareable as a real PNG via the native share sheet. User tested this on-device and confirmed it renders correctly.
- **Version bumped 1.1.35 → 1.1.36** (`buildNumber`/`versionCode` 36→37, `runtimeVersion` in lockstep, following this repo's established bump pattern exactly) — isolates the native-dependent release so it can never be OTA'd onto an existing 1.1.35 install that lacks these native modules.

**2. Request-to-join for group missions (`84af185`) — a bigger feature added mid-session per explicit user request**, after the user tested a real invite link and asked what happens to a non-member who opens one. Investigation found a genuinely undesigned dead-end: `challenge/[id].tsx` fetches the challenge group via RLS scoped to members only, so a non-member's query silently returns no row — no crash (the screen already used `group?.` optional chaining throughout), but no real messaging either, just a blank-feeling screen.

Design was walked through explicitly with the user rather than guessed: **who approves a join request**. First built creator-only approval, then the user asked for it to mirror the existing streak-repair squad-vote system instead (checked the real mechanism first rather than assuming — `rpc_vote_streak_repair`: any member except the requester can vote, one decline vetoes instantly, 2 approvals from anyone passes it, no special creator authority), with explicit note to leave room for a future creator-override + "remove member" feature without needing that to be built now.

New migration `supabase/migrations/20260920120000_challenge_join_requests.sql`:
- `challenge_join_requests` + `challenge_join_request_votes` tables, mirroring `streak_repairs`/`streak_repair_votes`'s shape and RLS pattern exactly.
- **Real bug found and fixed before shipping**: some older challenges never got their creator inserted into `challenge_members` (confirmed directly against local snapshot data — two of three sampled real challenges had zero `challenge_members` rows at all, including for the creator). The existing `challenge_groups_select_member` RLS policy already defensively special-cases `creator_id`, but nothing else in the codebase did. Added `user_is_challenge_participant()` (creator OR member) and used it everywhere a join-request RPC needs to check "is this uid part of the cohort" — without it, creators of older missions would have been locked out of voting on requests to their own mission.
- `rpc_challenge_public_preview_v1` — RLS-bypassing preview (title/host/member count/my request status) for a non-member, since `challenge_groups` itself is invisible to them.
- `rpc_request_join_challenge_v1` — creates a pending request (`approvals_required` scales to `least(2, member_count)`, so a lone-member mission only needs 1 vote), blocks self-requests and already-a-member, allows re-request after a decline.
- `rpc_list_pending_join_requests_v1` / `rpc_vote_challenge_join_request_v1` — the vote mechanism described above. On passing the threshold, **reuses the existing `challenge_invites` accept flow** (inserts a normal pending invite from creator→requester) instead of duplicating habit-creation/premium-gating logic — the requester then accepts it exactly like any host-sent invite, through already-tested code. One real bug fixed mid-build here too: the notification sent to the requester on approval was looking up the *requester's own* username for the `inviter_username` field instead of the creator's.
- One more real bug caught during local verification: the `challenge_invites` insert's `ON CONFLICT (challenge_id, invitee_id)` failed with `42P10` — that table's actual uniqueness is a *partial* index (`where status = 'pending'`, from a later migration than the one that created the plain constraint), not the plain unique constraint the original migration defined. Fixed by matching the `ON CONFLICT` target to the real partial-index predicate.
- **Verified locally end-to-end** via direct RPC calls with two real local accounts (host `raktim_24`, a seeded second account) before calling this done: request → duplicate-request rejected → host votes approve → resulting `challenge_invites` row + correctly-attributed notification both confirmed via direct queries; separately, request → decline → preview correctly shows "declined" → re-request succeeds.

**App-side UI**: `app/challenge/[id].tsx` gained a `NotAMemberScreen` (preview + Request to join / Request sent / re-request-after-decline) as a new early-return branch, and a "N PENDING TO JOIN" card (visible to current members) with inline Approve/Decline per request. `app/_layout.tsx` gained notification routing for `challenge_join_request`/`challenge_join_request_result` (the existing `challenge_invite` type already covered the approved case, unmodified).

**Also fixed, found while building this**: the deep-link target was silently discarded if you weren't signed in when a link fired — `app/_layout.tsx`'s auth guard did a bare `router.replace("/login")`, and `login.tsx` always resolved to `/` on success. Now the guard passes `next: <original path>` and `login.tsx` resumes there instead. The invite page's "search @username to join" copy (referring to a feature that never existed) was also corrected to describe the real request-to-join flow for challenges, and a different, honest line for Live Squad (which stays host-invite-only — this feature is Group Challenges only for now).

**Explicitly deferred, not started**: a second entry point the user asked for — tapping a habit name from someone's Community profile, not just an invite link — needs its own change first (`CommunityPlayerMissionStory`, the type backing that screen, carries no habit/challenge id at all today; would need a new RPC field before a tap handler is even possible). Scoped, not attempted, to avoid rushing a new schema surface without the same local-test rigor as everything else this session.

**3. Local dev-environment fixes, this session:**
- Android builds failed with "Unable to locate a Java Runtime" — `JAVA_HOME` wasn't set; fixed by pointing it at Android Studio's bundled JDK (`/Applications/Android Studio.app/Contents/jbr/Contents/Home`) in `~/.zprofile` (this machine has no `~/.zshrc`).
- Android Emulator couldn't reach local Supabase at `127.0.0.1` (which only ever means "this device itself" on Android, never the host Mac). Rather than juggling `127.0.0.1` (iOS Simulator) vs `10.0.2.2` (Android Emulator's fixed host alias) per platform, pointed `.env.local` at the Mac's LAN IP (`192.168.68.53`) instead — one value that works for iOS Simulator, Android Emulator, and a physical device on the same WiFi. Confirmed local Supabase's Docker container is already bound to `0.0.0.0:54321`, not just localhost, so this was just an env-value fix, nothing server-side.
- Local `auth.users` continues to get wiped by every `db:reset`/`db:snapshot` (documented gotcha from earlier sessions, hit again repeatedly this session) — re-seeded `raktim24@gmail.com` (real production user_id, so existing local habit data resolves correctly) each time, plus a new second test account (`requester@example.com` / username `test_friend`) specifically for exercising the request-to-join flow as a non-host user. Local premium also needs re-patching (`premium_expires_at`) after every reset since the snapshot carries the real, already-expired value, and both voting on and accepting a join request require premium.

**4. Real bug found via user testing, fixed and OTA'd (`e3acea6`).** Checklist and freeform mini-mission completions never showed a photo on the share-your-win card — user initially suspected it was gated on publishing to Community, but the actual cause was unconditional: both completion paths only ever populate `completionMemory.imageUrl`, never `.imageUri`, and the share-card wiring was reading the wrong field name — always `null`, publish status irrelevant. Only the plain timer-based completion path worked (genuinely uses `.imageUri`). Fixed via a shared `localCoverUriFrom()` helper that uses the photo only when it's still a local file (safe to capture instantly) and falls back to the placeholder for an already-uploaded remote URL, preserving the original capture-safety reasoning. JS-only.

**5. iOS/Android EAS production builds (1.1.36/37) triggered.** Real Android-specific build issue hit and fixed: the Android build kept picking up the *old* version (`1.1.35 (36)`) from the same commit that correctly gave iOS `1.1.36 (37)`. Root cause: `.easignore` deliberately includes `/android` in EAS uploads (unlike `/ios`, which is excluded and always gets a fresh native regen from `app.json`), so EAS was reading the version straight from the local, gitignored `android/app/build.gradle` — which still had the stale values from an earlier `npx expo run:android`, run before the version bump. `agent.md` already documents this exact requirement (bump `android/app/build.gradle` alongside `app.json`/`package.json`/`package-lock.json` on every version bump) — missed it this round, fixed by hand-editing the local file (gitignored, nothing to commit) once identified.

**6. Pushed and OTA'd.** `main` pushed to `origin` at `e3acea6` (`423b84b`..`e3acea6`: growth-strategy docs, growth Phase 1 + version bump, request-to-join, session log, share-card photo fix). habitPro-web pushed separately (`ea7c5bd`..`277a3c6`, includes the generated 1.1.36 force-update hero image). Published to production OTA: update group `9da187d4-e45a-402d-8082-1828220ec336`, runtime `1.1.36`, commit `e3acea6` — covers everything from `84af185` onward (request-to-join, notification routing, deep-link-resume fix, and the share-card photo fix); confirmed via `git diff e6deeaf..HEAD --stat -- package.json package-lock.json app.json eas.json` being empty that nothing native/config changed since the version-bump commit, so this was safe to OTA onto the `1.1.36` runtime.

**8. Second round of user testing found the share-card photo fix (#4/`e3acea6`) was still incomplete — fixed properly and OTA'd again (`511e246`, update group `957a0407-0fc0-4bc6-8561-3bc088a87e88`).** The field-name fix was correct but too conservative: freeform/checklist photo capture uploads to Supabase **immediately** on locking a moment (`handleFreeformMemoryCommit`/`handleTaskMemoryCommit` call `uploadMiniStreakTaskMemoryImage` right away), not deferred to publish time — so by mission completion the cover photo is *already* a remote URL in the normal case, and the previous "local files only" guard excluded almost every real photo, not just the genuinely unsafe ones. Worse, tracing this also found the plain timer-completion path (`handleCompleteCommit`) has the identical upload-then-clear-`imageUri` shape, meaning even the "known working" first path was likely never actually showing a photo either — never confirmed either way since the user's first test happened to use a mission with no photo at all.

Real fix: `coverUriFrom()` now prefers `imageUrl` (uploaded) and falls back to `imageUri` (upload failed/skipped) across all three completion paths; a new `prefetchCoverUriIfRemote()` calls `Image.prefetch()` on a remote URL before the share card mounts, so the capture reads from RN's image cache instead of racing a fresh download. `MissionShareCard`/`ShareWinModal`'s `localPhotoUri` prop renamed to `photoUri` throughout to reflect it's no longer local-only. JS-only, OTA-shippable — same `git diff e6deeaf..HEAD --stat` native/config check done again before publishing.

**9. Share-card redesign + link-embed request, scoped but deliberately not implemented yet — decision artifact built instead.** User flagged the card's indigo→cyan gradient as generic/AI-looking (fair — it was two arbitrary colors with no real connection to the brand) and asked for (a) real brand colors instead, (b) a way to embed a download link into the shared image itself so a non-user who sees it can find the app, (c) the website's "Open HabitPro" button restyled to look less like a generic SaaS CTA, and (d) the same share pattern extended to habit (not just mini-mission) completions. Rather than guess at a visual direction a third time, sampled the actual logo's real gradient stops via PIL, pulled the Minimalist theme pack's real accent (`#5B5BD6`) and the website's real green token (confirmed via its own CSS comment: "matches the mobile app's real green[600] token, not an invented brand color"), and built a comparison artifact (three card directions + a QR-code link-embed footer + a website button before/after) using only those real values: https://claude.ai/code/artifact/338c5dcf-f801-46ef-b11d-4307d1436743 — link-embedding via a printed QR code was chosen over trying to combine text+image in the share sheet, since a QR baked into the image itself survives however the card travels afterward (screenshot, repost, download), which a share-sheet-level caption wouldn't. Nothing implemented yet — waiting on the user to pick a direction; extending to habit completions is scoped as "mostly reuse, once the design is locked," not yet traced to its actual screen.

**10. Join-request notifications were both uninformative and non-actionable — found via user testing, fixed end to end (`def512d`).** Two separate real gaps: (a) neither `challenge_join_request` nor `challenge_join_request_result` existed in `notify-push`'s type switch (the actual push-notification text builder) or in `app/notifications.tsx`'s title/subtitle builders — both fell through to a generic fallback, so a host had no idea who was asking or for what; (b) `app/notifications.tsx`'s `onPressRow` had no branch for either type at all — tapping the notification in the in-app list was a genuine no-op (missed during the original build because testing happened by navigating to the mission manually, which masked it). New migration adds `challenge_title` to both notification payloads (`challenge_groups.habit_template->>'title'`, same lookup pattern used elsewhere) — tested locally end-to-end via direct RPC calls (request → host's payload → decline → requester's payload, both confirmed carrying the title) before considering it done. `notify-push` **deployed directly to production** (version 15→16, `verify_jwt: false` preserved) — confirmed safe to deploy independently of the migration's `db:push` timing, since the new code degrades gracefully (generic-but-still-sensible text) if `challenge_title` isn't present in the payload yet. `notifications.tsx`'s fix is JS-only, OTA'd separately (update group `e04e28f3-9a12-4c3a-bcbd-89086f0e2a62`).

**7. `app_version_releases`/`app_version_policy` SQL drafted for the user to run themselves** (not yet confirmed run) — changelog copy for 1.1.36 (share links, wider install reach, general fixes) plus a generated on-brand hero image (gradient matching `ForceUpdateModal`'s existing fallback colors + the real logo mark + a subtle share/connection motif, composed locally via PIL since Pollinations.ai's free tier produced an unusable generic result — same finding as earlier in this session's journey-visualization exploration). Hosted at `habitpro-web.vercel.app/assets/release-1.1.36-hero.jpg` — confirmed this needs zero app code changes, `ForceUpdateModal`/`AppVersionContext` already fully support `image_url` from the existing rich-changelog migration. Explicitly scoped to force on **Android only** (real Play Store listing to send people to) — iOS's `min_ios_version` deliberately left untouched since there's no public App Store listing yet, only TestFlight.

**Not yet done, explicitly next**: user runs `db:push` for the request-to-join migration once ready; user completes the EAS build/submit flow for 1.1.36 to Play Store + TestFlight; user runs the `app_version_releases`/`app_version_policy` SQL (the Android-force half specifically only after the Play Store listing has 1.1.36 live); the deferred Community habit-tap entry point is a clean next task whenever picked back up.

## Session Handoff (2026-09-19, end of session — hot-window plan shipped + freeform mini mission fixes)

**State: `main` is 2 commits ahead of the previous session's tip (`55249bf`..`ec3e1c9`), committed locally, not yet pushed to `origin` or OTA'd as of the start of this entry (see the end of this entry for the actual push/OTA outcome).** `npx tsc --noEmit` clean after every commit. Three new migrations tested locally via `db:reset` against real snapshot data; **not yet on production** — the user runs `npm run db:push` themselves per `pre_migration.md`.

**1. Hot-window cutoff, Phases A-F (`489c640`)** — the full plan from
`/Users/raktimmacbook/.claude/plans/reflective-baking-sparkle.md`, executed
end to end in one session:
- **Phase A**: `rpc_profile_lifetime_stats_v1` — Profile's lifetime stats
  (lifetime check-ins, best streak, memory proofs, repairs, mission totals)
  moved from client-side array scans to a server aggregate. Verified exact
  match against the real ~176-habit account. Safe fallback while
  loading/unavailable — never blocks rendering.
- **Phase B**: `rpc_habit_by_id_v1` / `rpc_mini_mission_by_id_v1` — direct
  fetch for a mission not in the local store (opened via search, a deep
  link, or an old mission outside the window). Wired as a fallback into
  `habit/[id].tsx` and `mini/[id].tsx`; merges into the store on success via
  two new store actions (`mergeFetchedHabit`/`mergeFetchedMiniMission`).
- **Phase C**: the full-pull and sign-in/cold-start hydrate paths now merge
  into the local store (`applyFocusDeltaToStore`, already-existing and
  already-safe) instead of replacing it — verified via standalone logic
  tests copied from the real code.
- **Phase D**: `pullFromSupabase` actually shrank — active habits/minis
  (unbounded, always current) + first history page per terminal bucket via
  the already-built history RPCs. **Real bug caught during verification**:
  the active-habits query (`is_completed = false`) was accidentally
  including every failed habit ever, since a failed habit also has
  `is_completed = false` — fixed by adding `status <> 'failed'`. "Load More"
  wired into Mini Missions (Completed/Failed), Home (Reports), and
  Profile's Hub modal (`HubListModal` gained `hasMore`/`onLoadMore` props).
- **Phase E**: My Journey's private mission list (fully-private, never
  shared to Community) now pages through the same history RPCs
  independently of the global store, so old private-only missions don't
  vanish from the list once the store is windowed.
- **Phase F fix**: verification found the original audit's "likely safe"
  call on `challenge/[id].tsx` and Compete's invite-accept flow was wrong —
  both look up "my habit for this challenge" from the local store, and for
  an old completed challenge outside the window that lookup could come back
  empty. In `challenge/[id].tsx` that just breaks the screen; in Compete's
  invite-accept flow it would have **created a duplicate habit**. New
  `rpc_habit_by_challenge_group_id_v1` closes both.

**2. Second real bug found post-hoc, by the user testing on-device
(fixed in the same commit)**: each screen's "has more" state was seeded
once via a `useState(() => ...)` initializer reading the store at mount —
but the store hadn't necessarily hydrated/synced yet at that instant, so it
could freeze at an empty-array snapshot and never update, permanently
hiding the Load More button. Fixed by deriving the pre-first-fetch guess
reactively instead of once. **Third bug**, found right after: the offset
sent on the first "Load More" tap used the local array's length as a proxy
for "how many pages have been fetched" — wrong on any device with
pre-existing full-sync data (i.e. every current user), since local array
size doesn't reflect real pagination progress. Fixed by anchoring the first
tap's offset at 0 (server-confirmed) instead of the local count.

**3. Local dev environment resynced with cloud mid-session** (`npm run
db:snapshot` + `db:reset`) — real data refreshed (177 habits, 372 mini
missions at sync time). Local Supabase Auth (`auth.users`/`auth.identities`)
had to be re-seeded for `raktim24@gmail.com` (local-only password) since
`db:snapshot` deliberately excludes the `auth` schema and wipes any
previous local-only auth seed — this needs redoing after any future
`db:snapshot`/`db:reset`.

**4. Investigated, found no bug: Live Squad freeform-capture inheritance.**
User reported a friend's device not receiving freeform capture mode via a
Live Squad invite. Traced the entire pipeline (invite creation, RPC
storage, snapshot, accept handler, store action, bidirectional sync
mapping, render branch) — all correct, and confirmed directly against
production that the relevant RPCs/columns are live. This exact bug was
already fixed 11 days earlier (`a798866`, 2026-09-08). Most likely
explanation: the friend's device hadn't picked up that OTA yet.

**5. Freeform mini mission timeout fix (`ec3e1c9`)** — found via user
testing, not part of the original plan:
- Freeform missions previously auto-failed the instant their timer hit
  zero (Manual Finish mode never got the "did you complete this?" review
  that Timer Check-In mode already had). Now gets the same Complete/Retry/
  Fail prompt (`mini/[id].tsx`'s `isTimerCheckInReview` widened).
- **Real data-loss bug**: both Fail and Retry unconditionally wiped
  `draftMemories`/`draftTasks` (every captured freeform moment, local-only,
  never synced). Fail now preserves them; Retry carries them forward into
  the new attempt (explicit user decision — retry is another shot at the
  same mission, not a wipe).
- **Separate bug found while verifying the above**: timer-expiry detection
  only re-ran on mount/focus-change, so sitting on the mission screen while
  the countdown hit zero never triggered anything until navigating away and
  back. Added a 1s live tick while a mission is genuinely in progress.

**6. Pushed and OTA'd.** `main` pushed to `origin` at `18c9e68`
(`55249bf`..`18c9e68`: `489c640` hot-window plan, `ec3e1c9` freeform fix,
`18c9e68` this docs entry). Published to production OTA: update group
`4fe50022-4c71-48cc-b3bc-b96e3e20ce80`, runtime `1.1.35` (unchanged),
commit `18c9e68`. JS/TS/TSX-only batch, no native/version changes.

**7. Migrations pushed to production by the user and verified live.** All
four new functions (`rpc_profile_lifetime_stats_v1`,
`rpc_habit_by_id_v1`, `rpc_mini_mission_by_id_v1`,
`rpc_habit_by_challenge_group_id_v1`) confirmed present via
`information_schema.routines`, then exercised with real read-only calls
against the user's own account: lifetime stats returned sane real numbers,
both by-id lookups returned the correct row (and correctly `null` for a
nonexistent id), and the challenge-group-id fallback resolved to the right
habit. Hot-window plan is now fully shipped end to end — code, OTA, and
database all live.

**Not yet done**: Profile's Hub modal load-more and Home/Mini Missions
load-more are UI-tested via the simulator but not yet exercised at true
scale (no account currently has enough history to trigger a second real
page beyond what's already cached).

## Session Handoff (2026-09-16, end of session — Phases 2 + 3 shipped)

**State: `main` is 2 commits ahead of the Phase 0+1 tip (`03c63a7`..`adc17ed`), pushed to `origin/main`.** `npx tsc --noEmit` clean after each commit.

**1. Phase 2 backend foundation (`0ec4ae6`) — habits history RPC, not wired to any UI yet.**
New migration `supabase/migrations/20260916120000_habits_history_page.sql`:
`rpc_habits_history_page_v1(p_offset, p_limit, p_status)`, mirroring Mini
Missions' history RPC shape, for Home's accomplished/failed reports
segment. No search param (explicit decision — main missions are far fewer
per user than mini missions, not judged worth building here).

Important nuance, decided explicitly with the user before writing this:
unlike `mini_missions.status`, a habit's effective accomplished/failed
report is *derived client-side* in `sync.ts`'s `habitFromRow()` (timezone
canonicalization, grid-completion math, streak-memory-marker evidence,
legacy repaired dates) — not a plain stored column. Reimplementing that
derivation in SQL was rejected as too risky/duplicative. The RPC instead
filters on the stored `mission_report`/`is_completed`/`status` columns
directly, accepting rare theoretical drift on old edge-case rows as a
deferred, documented limitation — nothing is actually lost today since
Home still loads every habit locally in parallel with this RPC.

**Tested locally** against the user's real ~176-habit snapshot before
being called "ready": accomplished count (18, including 2 edge-case rows
with `mission_report = null` but `is_completed = true`) and failed count
(9) matched the real data exactly; a 4-page pagination sweep returned all
31 of one user's habits with zero duplicates or drops; the unauthenticated
guard correctly rejected a call with no `auth.uid()`.

New `src/lib/habitsHistoryApi.ts` (mirrors `miniMissionsHistoryApi.ts`).
`habitFromRow` exported from `sync.ts` (was private) so the wrapper can
reuse it. **Not pushed to production yet — the user runs `npm run db:push`
themselves per `pre_migration.md`; the agent never runs it.**

**2. Phase 3 — My Journey's per-mission photo gallery, now really
paginated (`adc17ed`).** `MissionGalleryModal` (in `my-journey.tsx`)
previously dumped every post for a mission into an un-paginated
`ScrollView`. Investigation found the actual fetch-on-scroll pattern the
roadmap wanted **already existed and was already live** —
`fetchCommunityPlayerMissionJourneyPage` in `communityWinsApi.ts`, used by
`community-player/[id].tsx`'s own mission gallery for viewing *other*
players. No new migration needed; it queries the existing `community_wins`
table via plain PostgREST calls.

My Journey's gallery now calls that same function on open and via a
"Load more journey" button — confirmed with the user to match the
manual-button pattern already used everywhere else in this app (the
outer story list, and community-player's own gallery) rather than true
auto-scroll-to-bottom fetching, which would have been the only screen in
the app behaving that way. Private-only posts (never shared to Community,
always fully local already) are merged in via the existing
`dedupeStoryPostsPreferPublic` so nothing already known disappears while
the public portion paginates underneath.

**3. Bug found and fixed during manual testing: description popover
hidden behind the gallery on iOS (bundled into `adc17ed`).** Both
`MissionGalleryModal` implementations (My Journey and community-player)
showed a mission's description via `showAppAlert`, which renders its own
top-level native `Modal`. On iOS, presenting a second `Modal` while a
`presentationStyle="fullScreen"` one is already open stacks the new one
*behind* the current one — only revealed once the gallery closes.
Android's Modal windowing doesn't have this restriction, which is why it
only showed up on iOS. Fixed in both files by rendering the description
as a local overlay `View` inside the gallery's own `Modal` instead of a
second native `Modal` — mirroring the close-then-reopen trick this same
file already used for the photo lightbox. User confirmed fixed on device
in both places.

**4. OTA**: published to production. Update group
`d7fae201-f27e-4a91-b2bd-934d6dd4e121`, runtime version `1.1.35`
(unchanged), commit `715f609`. JS/TSX-only per `app-architecture.md`'s
OTA-safe criteria — no native module/config changes, no version bump.

**Not yet done, explicitly next**: Phase 2's RPC has no UI yet (Home's
reports segment "Load more" would still be a no-op today, same reasoning
as Mini Missions' deferred Load More — nothing is trimmed from
`pullFromSupabase()` yet). Phase 4 (Profile's Hub modal) and the "hot
window" cutoff are still fully unstarted. Plan file:
`/Users/raktimmacbook/.claude/plans/reflective-baking-sparkle.md`.

## Session Handoff (2026-09-16, proactive mid-session handoff — long conversation, compaction likely near)

**Note on why this entry exists**: written proactively because this session has run very long (local Supabase dev setup, a full migration-drift investigation, a perf-tracing investigation + real bug fix, and now the pagination/search feature) — not because all planned work is done. There is no precise way to measure remaining context; this is a best-effort judgment call, not a guaranteed trigger. If picking this up in a **new chat**, paste: *"Read `docs/CURRENT_WORK.md`'s 2026-09-16 entry and `/Users/raktimmacbook/.claude/plans/reflective-baking-sparkle.md`, then continue the Mini Missions/Home pagination-and-search roadmap from where Phase 1 left off."*

**State: `main` is clean, at `03c63a7`, pushed. Nothing uncommitted** except the usual untracked `.claude/`/`.mcp.json`. `npx tsc --noEmit` clean.

**1. Shipped Mini Missions search (Phase 0 + Phase 1 of the pagination/search plan).**
New migration `supabase/migrations/20260915120000_mini_missions_history_page.sql`
— `rpc_mini_missions_history_page_v1(p_offset, p_limit, p_status, p_query)`,
mirrors `rpc_challenge_streak_members_page_v1`'s shape (security definer,
`auth.uid()` guard, `limit+1`/`count(*) > limit` for `hasMore`, `to_jsonb(m)`
whole-row shaping to avoid the `jsonb_to_recordset` explicit-column-list
trap). **Tested locally first** (`npm run db:reset`, then direct
`docker exec ... psql` calls verifying pagination, title search, and — the
part the user specifically asked for — full **content** search via
`completion_memory::text ilike`, confirmed by finding a real mission
("Focus timer") matched by searching "cool", a word that only exists in its
memory note, not the title. Status filter and the auth-rejection guard also
verified. Only after all of that passed did the user run `npm run db:push`
themselves (per `pre_migration.md`); verified live on production afterward
via a read-only query.

New `src/lib/miniMissionsHistoryApi.ts` (mirrors `groupChallengesApi.ts`'s
paged-RPC client pattern, graceful fallback on a schema-cache miss). New
`upsertRemoteMiniMission` in `sync.ts` (mirrors `upsertRemoteHabit`) —
forward-looking infrastructure for editing a mission reached outside the
local store's array, not wired to any UI yet. Search box added to
`app/mini/index.tsx`, debounced, results kept in local component state
(never merged into `useHabitStore`) — purely additive, existing tabs/list
behavior unchanged when not searching. Commit `03c63a7`.

**Scope decision made and confirmed with the user mid-build**: the
Done/Failed tabs' "Load More" pagination UI was *not* built this round —
since `pullFromSupabase()` isn't trimmed yet, the local array already holds
100% of the user's mini-mission history, so a Load More button would be a
no-op today. Explicitly deferred to combine with the future "hot window"
phase, when it will actually do something. The RPC itself already accepts
`p_offset`/`p_limit` so no rework is needed when that phase lands.

**2. The full roadmap this is Phase 0+1 of** — approved plan lives at
`/Users/raktimmacbook/.claude/plans/reflective-baking-sparkle.md` (the
per-conversation plan-mode file; read it directly for the full writeup, not
just this summary):
- Phase 2 (not started): same RPC family for Home/main missions
  (`rpc_habits_history_page_v1`), applied to `app/(tabs)/index.tsx`.
- Phase 3 (not started): My Journey's `MissionGalleryModal` — currently
  reads `mission.posts` from the fully-loaded local array with zero
  pagination. User explicitly wants this converted to a real fetch-on-scroll
  pattern ("when reaching the end, trigger a second API fetch"), not just
  render-virtualization.
- Phase 4 (not started): Profile's "view all" Hub modal — reuses Phase 1/2's
  RPCs once they exist.
- The bigger "hot window" cutoff (actually shrinking what
  `pullFromSupabase()` loads by default, not just adding paginated *reach*
  beyond it) is a deliberate, separate decision point — revisit once
  Phases 1-4 are live. This is also what would finally make the deferred
  Load More UI meaningful.
- User's explicit standing scope: pagination belongs on every real list
  (main missions, mini missions, photo galleries) — a must-have, not a
  nice-to-have, specifically *because* local Supabase dev now exists to
  de-risk testing each step before it touches production. Search is not
  required everywhere, just where searching by name/content makes sense
  (Mini Missions was the motivating case).

**3. Earlier in this same session (already logged in the 2026-09-15 entry
below, still valid, not re-summarized here)**: `pre_migration.md`'s
never-apply-a-migration-yourself rule + `predb:push` hook, real `perfTrace`/
`jsThreadProbe` implementation (were no-op stubs), and the
`alignGroupHabitToChallengeStart` date-comparison bug fix (~185ms/sync).

**4. New this session, process/tooling (not app code)**:
- **`.claude/skills/habitpro-session-logger/SKILL.md`** — Claude Code
  equivalent of the existing `.codex/skills/habitpro-session-logger/
  SKILL.md`. Same target docs, same workflow, explicitly instructs
  proactively *offering* to log at natural checkpoints rather than waiting
  to be asked.
- **Two new persistent memories** (`/Users/raktimmacbook/.claude/projects/
  -Users-raktimmacbook-Desktop-personal-developemnt-habitPro/memory/`):
  `feedback_local_first_migration_testing.md` (always `db:reset` locally
  before ever saying a migration is ready for `db:push` — explicitly
  requested to never be missed) and `feedback_proactive_session_logging.md`
  (offer to log progress at checkpoints, mirroring the Codex habit). Both
  indexed in that directory's `MEMORY.md`.
- Discussed but not set up: `/loop`-based true timer automation for
  logging — user was told this needs them to explicitly start it; not
  configured this session.

**Not yet done, explicitly next**: nothing else was started for Phase 2-4 —
this handoff is the stopping point. If resuming fresh, start by re-reading
the plan file above before writing any code.

## Session Handoff (2026-09-15, end of session)

**State: `main` is 3 commits ahead of the previous session's tip
(`069cf50`..`62c1053`), all committed. Not pushed to `origin` (not
asked). Not OTA'd (no user-facing behavior changed — the fix is a pure
perf improvement to existing sync logic, nothing new to ship visually).**
`npx tsc --noEmit` clean after every commit.

**1. Codified the never-apply-a-migration-yourself rule (`5930dc8`).**
New `pre_migration.md` (repo root, alongside `agent.md`): the agent
writes and locally tests migrations, but only the user ever runs
`db:push` (or any write against production) — never the agent, even
though it has Bash permission to run it directly. Wired into `agent.md`,
`docs/PROJECT_CONTEXT.md`, and `docs/FUTURE_AGENT_HANDOFF.md`'s read
order and "Do Not Do" lists so no future session misses it. Also added
a `predb:push` npm hook that runs `db:reset` automatically before
`db:push` can execute — technical enforcement on top of the written
rule, so a migration that doesn't replay cleanly from empty structurally
cannot be pushed, by anyone.

**2. Implemented real perf tracing — `traceAsync`/`traceSync` had been
no-op stubs the whole time (`dd85dcd`).** Despite being called at dozens
of existing sites across the app (`CommunityWinsFeed.tsx`,
`compete.tsx`, `habit/[id].tsx`, etc.), `perfTrace.ts`'s `traceAsync`
and `jsThreadProbe.ts`'s `traceSync`/`startJsStallProbe` just called the
wrapped function and returned — every prior call site had silently been
measuring nothing since whenever it was added. Gave both a real body:
time the call, log under `__DEV__`, record into a shared 50-entry ring
buffer (`getRecentPerfTraces()`). `sync.ts`'s `logSyncPerf` (already
called at every pull/hydrate stage) started logging for free once its
body was implemented too.

Added new tracing at the specific suspects behind the user's "Mini
Missions/Home feel stuck at 130+ missions" report from earlier this
session: the focus-refresh full-pull/delta-pull/`setState` chain
(`useRemoteStoreRefreshOnFocus.ts`), `habitStore.ts`'s per-mutation
`mergeDirtyIdsByReference`, Mini Missions' unmemoized tab-count filters
(`app/mini/index.tsx`), the account-backup `JSON.stringify`
(`accountBackup.ts`), and cold-start's per-item read loop
(`chunkedHabitPersistStorage.ts`).

**Real numbers this produced on the user's actual account (31 habits,
200+ mini missions)**: cold-start hydrate (~35ms) and the Mini Missions
tab-count filters (0-5ms) are both already fast — the originally-planned
"Phase 1" fix (memoizing the tab counts) turned out to be unnecessary,
confirmed by measurement rather than assumption. The real cost was
`sync.mapDelta.alignOwnHabitsTotal` at **~230ms per sync** — wildly
disproportionate for only 31 habits (mini missions, 6x more of them,
parsed in 2-8ms), pointing at an algorithmic problem rather than data
volume.

**3. Found and fixed the actual bug (`62c1053`).**
`alignGroupHabitToChallengeStart` (`src/utils/groupMissionClock.ts`)
decides whether a group-challenge habit's dates need expensive per-day
remapping by comparing `habit.startDate === canonical` — but one side
is produced via `Date.toISOString()` (`"...T18:30:00.000Z"`) and the
other comes straight off a Postgres timestamp column
(`"...T18:30:00+00:00"`) — the *same instant*, spelled two different
ways. Confirmed live via temporary diagnostic logging before writing
any fix: **31/31 of the user's group-challenge habits hit the expensive
remap branch, on every single sync**, unconditionally — the "nothing
changed" fast path had never actually been reachable. Fixed with a new
`dateValueChanged()` comparing by actual epoch value, with an explicit
nullish short-circuit first (`new Date(undefined).getTime()` is `NaN`,
and `NaN !== NaN` in JS, which would otherwise flip "both sides missing
an end date" into a false "changed" — several of the user's real habits
hit exactly this shape).

**Measured impact, before/after, same account**:
`sync.mapDelta.alignOwnHabitsTotal` 229ms → **51ms**;
`sync.pull.total` 645ms → **460ms**. A genuine ~185ms-per-sync
improvement from a two-line fix, zero architecture change, zero risk to
the remap logic itself (untouched, still runs correctly on the rare
genuine date change — confirmed a handful of legacy habits with a real
~5.5h discrepancy, consistent with an old IST-offset handling
inconsistency, still correctly trigger it).

**Separate, smaller, not-yet-investigated finding surfaced by the same
instrumentation**: `sync.mapDelta.habitsFromRows` costs ~99ms for 31
habits, vs. ~8ms for 200+ mini missions in `minisFromRows` — habits are
still ~80x slower per row than minis. Might be a similar-shaped
inefficiency; not investigated this session.

**Next planned**: pagination + search for Mini Missions (and
potentially Home), explicitly picking back up from the audit earlier
this session (`docs/CURRENT_WORK.md`'s 2026-09-10 entry) that found
Mini Missions/Home/My Journey/Profile all share one fully-loaded local
array with no server-side pagination, while Compete's Leaderboard,
Community feed, Notifications, and Cohort detail already have the real
pattern to copy. Not started yet.

## Session Handoff (2026-09-13, end of session)

**State: `main` is clean going into this session's work; the local-dev
changes below are uncommitted** (`package.json`, `supabase/.gitignore`, two
edited migrations, one new migration, `supabase/seed.sql` untracked from
git) — not committed since the user didn't ask for a commit this round.
The one new migration (`20260913120000_drop_custom_note_once_ever_index.sql`)
**has already been pushed to production** by the user directly (`npm run
db:push`), independent of the local commit — confirmed by re-querying
production afterward that it changed nothing observable (all three
statements were no-ops against production's actual live state, as
designed).

**1. Built a local-only Supabase dev environment — no paid cloud
branching.** User explicitly ruled out Supabase's Branching feature
(Pro plan, $25/mo+ — org confirmed on Free plan) after a research pass
comparing it against local Docker-based dev. Landed on: Docker Desktop
(installed via `brew install --cask docker` after a false start with
`docker/tap/sbx`, an unrelated "Docker Sandboxes" cask) + the Supabase
CLI (already logged in and already linked to `habitPro` in this
environment, no setup needed there) + four new `package.json` scripts
mirroring the existing `db:*` naming:
   - `db:start` / `db:stop` — the local stack (Postgres/Auth/Storage/
     Studio/etc. in Docker, applies all local migrations fresh).
   - `db:reset` — wipes local, replays every migration + `seed.sql` from
     scratch. This is the new safety net for every future migration:
     test here before `db:push`.
   - `db:snapshot` — `supabase db dump --data-only --linked --schema
     public --exclude public.app_version_policy --exclude
     public.community_access_config -f supabase/seed.sql`. Pulls a full
     copy of production's `public` schema data (all 61 users, on user's
     explicit instruction — "जो server data है वो locally sync होता रहे",
     re-run this command anytime for a fresh pull) into the local seed
     file. The two `--exclude`s are singleton config tables a migration
     already seeds a default row into (see finding below).
   - `supabase/seed.sql` **untracked from git** (was committed with a
     placeholder `select 1;`) and gitignored — it now holds real
     production data (all users' habits/mini missions/community posts/
     streak repairs/etc.) and must never be committed. A short block is
     manually prepended to it (not part of the dump) creating a local-
     only `auth.users`/`auth.identities` row matching the user's real
     production `user_id` (`f90d8ca4-ad7c-4ca8-9646-4633af4a53b3`) with a
     fresh local-only password, so their real data is immediately visible
     signing in locally. New test users can be created freely (just sign
     up against local Supabase) with zero cost/setup.
   - `.env.local` created (gitignored, already covered by the repo's
     `.env*.local` pattern) pointing the app at
     `http://127.0.0.1:54321` with the local stack's legacy-JWT-format
     anon key (not the newer `sb_publishable_...` key this CLI version
     also prints — used the JWT format instead to avoid any
     `@supabase/supabase-js` version-compatibility risk). Verified
     end-to-end: app signed in locally, showed the user's real 31
     habits/201 mini missions, Level 18/93 notifications, matching
     production exactly.
   - **Real security incident caught and corrected mid-session**: the
     first `db:snapshot` attempt (`--data-only --linked`, no `--schema`
     flag) dumped the `auth` schema too, despite Supabase's own docs
     claiming `--data-only` excludes it — including real Google OAuth
     access/refresh tokens (`ya29....`) for real users, in plaintext, in
     `supabase/seed.sql`. Caught by inspecting the dump's actual content
     rather than trusting the docs/success message, before it was ever
     used for anything. Fixed by adding `--schema public` to the
     `db:snapshot` script and deleting/regenerating the file. Never
     reached git (was gitignored from the start), but was a real
     lesson: verify a dump's actual contents, don't trust a tool's own
     "succeeded" signal, especially crossing a schema/security boundary.

**2. Found and fixed three genuine, pre-existing production schema-drift
issues** — none introduced this session, all surfaced for the first
time by today's from-scratch migration replay (impossible to catch via
`db push` alone, which only applies against an already-live database and
never needs to verify replay-from-empty). All three are captured in one
new migration, `supabase/migrations/20260913120000_drop_custom_note_once_ever_index.sql`
(now pushed to production, confirmed no-op there):
   - `challenge_nudges_custom_note_once_idx` exists in migration files
     (`20260502120000_custom_nudge_premium.sql`) but not on production's
     actual live schema — evidently dropped directly on production,
     outside any migration, after that file ran. Production's real rule
     is "once per day" (`custom_note_one_per_day_idx`,
     `20260421120000_custom_note_daily_limit.sql`), not "once ever" —
     confirmed by finding real production rows with up to 14 duplicate
     custom notes for the same (challenge, sender, recipient) triple,
     which would be impossible if the "once ever" index were truly live.
   - `challenge_nudges_one_per_day_idx` — same drift shape: recreated by
     `20260502120000` after `20260427194500_challenge_congrats_unique_per_milestone.sql`
     had already correctly split it into
     `_one_per_day_non_congrats_idx` + `_congrats_once_per_activity_idx`,
     then evidently dropped again directly on production, untracked.
   - `streak_reminder_log_reminder_kind_check` — the migration files
     disagree with each other (`20260423131000` adds `'custom_time'`,
     `20260426120000` and `20260617124000` both later redefine it
     without `'custom_time'`), but production's actual live constraint
     currently allows `'custom_time'` — confirmed via
     `pg_get_constraintdef`. Reasserted production's real definition as
     the final word in the new migration, applied after every other
     migration touching this constraint.
   - Also fixed (narrower, no drift involved): two migrations
     (`20260416084341`, `20260423131000`) alter `streak_reminder_log`
     before the migration that creates it/its `reminder_kind` column —
     a real file-ordering bug (both are backfills of changes originally
     applied directly on production, given timestamps that don't match
     true dependency order). Guarded both with an `information_schema`
     existence check instead of renaming their timestamps — renaming
     would make `db push` think they're new, unapplied migrations
     relative to production's already-recorded history.
   - Also excluded two singleton config tables from `db:snapshot`
     (`app_version_policy`, `community_access_config`) — each has a
     migration-seeded default row (`id = 1`) that collided with the
     same row already present in the production dump.
   - **Why this couldn't have been caught earlier**: explained directly
     to the user mid-session. `db push` only checks "has this migration
     version been applied yet," never "does replaying everything from
     empty produce this file's assumed state" — that check is only
     possible with a full local teardown-and-replay, which didn't exist
     before this session. Not a process failure on the user's part;
     exactly the class of bug local dev exists to catch. See
     `app-architecture.md`'s new Local Development section and Known
     Caution Points entry for the durable writeup.

**3. Still pending from earlier this session, approved but not started**:
a phased perf-investigation plan for Mini Missions feeling "stuck" at
~130 missions (`/Users/raktimmacbook/.claude/plans/reflective-baking-sparkle.md`
— Phase 0 instrumentation for `perfTrace`/`jsThreadProbe`/`logSyncPerf`
plus Phase 1 cheap fixes: memoize `app/mini/index.tsx`'s tab-count
badges, add an O(1) fast path to `habitStore.ts`'s
`mergeDirtyIdsByReference` for the append-only case. User approved the
plan via `ExitPlanMode`, then redirected to committing already-done work
before this got implemented — no code written for it yet. A separate,
larger pagination/hot-window architecture discussion (fetch-level
pagination for Mini Missions/Home/Profile) was explicitly deferred
pending real numbers from that same Phase 0 instrumentation, and a
tabs-wide pagination/search audit (`docs/CURRENT_WORK.md`'s prior entry
already covers the initial findings) is still just a report, nothing
implemented.

**Not committed**: none of this session's local-dev files are committed
— user didn't ask. The one production-facing migration was pushed
directly by the user (`npm run db:push`), independent of any local git
commit state.

## Session Handoff (2026-09-10, end of session)

**State: `main` is 4 commits ahead of the previous session's tip
(`c7a2503`..`0834e62`), all pushed and OTA'd to production. One more fix
(`app/live-mini/[id].tsx`, perf + note-loss) is done and `tsc`-clean but
**uncommitted** — user is mid-live-mission and testing it in place before
it ships. `app-architecture.md` doc updates (this session, describing all
of the below) are also uncommitted alongside it.** `npx tsc --noEmit`
clean throughout.

**1. Freeform Mini Mission capture mode — solo (`330b2b2`).** New
`MiniMission.captureMode: "checklist" | "freeform"`, mutually exclusive
with `taskChecklist`, mini missions only (not Habits) — scoped from a
detailed audit artifact the user asked for first (solo + Live/shared
scenarios, no video, no cap on moment count, confirmed over several
rounds of Hinglish back-and-forth). No predefined task list: during the
run the user locks as many self-declared "moments" (photo/note) as they
want via the new `src/components/MiniFreeformSheet.tsx`, held in
`MiniMission.draftMemories` (local-only, array — same treatment as
checklist's `draftTasks`). At completion, kept entries populate the same
`StreakMemory.tasks` shape checklist uses, so every downstream display/
Community/gallery consumer needed zero new code. Migration:
`20260908120000_mini_missions_capture_mode.sql` (column +
`rpc_sync_dirty_state` column-list fix). Create screen got a two-card
"Capture mode" picker (Checklist vs Freeform) per a later request — see
#4.

**2. Real bug found and fixed before shipping Phase 1**: a fresh
freeform mission showed the classic single-photo sheet instead of the
freeform multi-capture sheet on "Mark Complete." Root cause: exactly the
silent-drop trap `app-architecture.md` already warns about for
`task_checklist` — `capture_mode` was missing from `sync.ts`'s pull
select-string/`miniFromRow`/`miniToRow`, so a background focus-refresh
pull silently reverted the field to `undefined` right after creation.
Fixed as part of the same migration/commit above.

**3. Freeform propagation to Live Squad invites (`a798866`).** User
tested the solo fix, confirmed it, then reported the *accepting*
participant in a Live Squad still got the classic flow, not freeform.
Root cause: `createLiveMiniSquad`/`rpc_create_live_mini_squad(_v2)` had a
`task_checklist` snapshot mechanism but nothing for `captureMode` at all.
Added `live_mini_squads.capture_mode` (migration
`20260908130000_live_mini_squad_capture_mode.sql`), threaded through both
RPCs (drop-then-recreate, same overload-ambiguity reasoning as the
existing `task_checklist` param), and `app/live-mini/[id].tsx`'s
`handleAccept` now reads `squad.capture_mode` off the snapshot alongside
`squad.task_checklist` — no accept-RPC change needed, since
`_hp_live_mini_snapshot_json` already returns the whole squad row via
`to_jsonb()`.

**4. Capture-mode picker redesign + no more Sparkles anywhere
(`330b2b2`, same commit as #1 since nothing had shipped yet).** User
feedback on the create screen: the original single "Freeform capture"
toggle-below-checklist read as an add-on, not a real either/or choice —
wanted a clearer visual distinction. Replaced with two side-by-side
selectable cards (Checklist / Freeform) with a check-badge on the
selected one; selecting Freeform now also clears any in-progress
checklist items. Separately, explicit standing instruction: **never use
the `Sparkles` icon anywhere in this app** ("बिल्कुल AI जैसा दिखता है")
unless a real AI feature is added later — it was the icon on the original
Freeform toggle (now `Camera`) and was confirmed to be the only use
anywhere in the codebase.

**5. Home screen indigo→green/amber accent swap (`56f813f`).** User
feedback: the Minimalist theme pack's `rp.accent` (indigo, `#5B5BD6`,
from `src/styles/redesignPalette.ts`) was used for the mission-card day
grid's "done" color and the level XP bar/LVL pill, while Classic already
used green for the grid and an orange/yellow gradient for the bar —
reading as "everything indigo" once Minimalist became the only active
pack. Grid now always uses `theme.colors.green[500]`/`green[900]` (light/
dark split, matching habit detail's day-dot pattern exactly, corrected
after an initial pass that flattened it to `green[900]` for both modes).
Level bar fill and LVL pill switched from flat indigo to a
`theme.colors.red[900]`→`amber[500]` gradient/tint — "dull amberish," per
explicit request, not the vivid Classic orange/yellow.

**6. Real bug found and fixed after shipping (`0834e62`, separate OTA).**
User reported freeform memories vanishing mid-run, including same-device
(not just the expected "not on this device yet" cross-device case) — on
an 8-hour Live Squad mission, captured photos disappeared "after some
time" repeatedly, on both iOS and Android. Root cause: the general
lesson from the 2026-08-14 `draftTasks` gotcha has *two* separate call
sites (sign-in hydrate's `mergeDirtyLocalIntoRemote` and every-focus's
`preserveLocalMiniProgress` in `useRemoteStoreRefreshOnFocus.ts`) and
Phase 1 only patched the first one. The second already had a `draftTasks`
branch but no `draftMemories` branch, so every background focus-refresh
pull during an active freeform run wiped locked-but-not-yet-completed
moments. Fixed by adding the matching branch; see
`app-architecture.md`'s Sync Architecture section for the full writeup
(this is now documented as a recurring gotcha, not just a one-off).

**7. Live Mini gallery perf + note-loss fix — done, `tsc`-clean,
uncommitted (user mid-mission, testing before it ships).** User reported
two issues in the shared Live Squad board screen after two participants
(11 and 9 freeform moments respectively) both completed: (a) the
per-participant memory strip froze the whole screen while dragging — it
was a plain `ScrollView` + `.map()`, no virtualization, nested inside the
outer vertical `ScrollView`; switched to a horizontal `FlatList` with
`getItemLayout` + `nestedScrollEnabled`, and wrapped the previously-
unmemoized `ParticipantCard` in `memo` so the once-a-second live timer
tick doesn't force every card's full photo strip to re-render; (b)
tapping a gallery tile with a photo to enlarge it never showed the
attached note — the tap handler routed photo tiles through a bare
`openImageUri` state with no note field at all, silently discarding it.
Unified into one `openGalleryTile` state carrying `{label, note, uri}`
always; the enlarged view now shows the note as a caption under the
photo when one exists. Both in `app/live-mini/[id].tsx` only.

**8. Checked, reported, not actioned: mini-mission list pagination.**
User asked whether the Active/Waiting/Done/Failed tabs
(`app/mini/index.tsx`) are paginated/optimized for long lists. Finding:
rendering is fine (`FlashList`, already virtualized), but the underlying
*fetch* is not — `sync.ts`'s `pullFromSupabase()` fetches the user's
entire `habits`/`mini_missions` table with no `.limit()` at all, every
cold-start/full-refresh. An offset/limit paging pattern already exists
elsewhere in this codebase (`src/types/paging.ts`, used for streak-repair
voters/group challenges/live-squad listings) but isn't applied to the
user's own personal sync. Flagged in `app-architecture.md`'s Sync
Architecture section as a known scalability gap; no fix requested or
started this session.

**OTA**: three separate production pushes this session (all
`npm run update:production`, runtime `1.1.35`, no native/config diff —
verified via `git diff <base>..HEAD --stat -- package.json
package-lock.json app.json eas.json` empty each time):
- Update group `a66e46c9-a263-446f-a096-e55c84041e8b` — commit `56f813f`
  (items #1-5 above, bundled as one push once the color-scheme fix
  landed on top).
- Update group `81c881a7-0249-4f58-ab10-3227045e9848` — commit `0834e62`
  (item #6, the focus-refresh fix, pushed alone once found).
- (Item #7 not yet OTA'd — pending user's live-mission test.)

**Not visually confirmed by the agent** — same sandbox limitation as
every prior session. Items #1-6 were user-tested live on real devices
across this session (that's how #2 and #6 were found in the first
place); item #7 is user-testing in progress as of this doc update.

## Session Handoff (2026-09-05, mid-session)

**Update: this branch was completed, merged to `main`, and OTA'd to
production later in this same multi-day session** (see the 2026-09-10
entry above and `docs/WORK_HISTORY.md` for the merge commit) — the
"mid-session, mostly uncommitted" framing below is a snapshot from partway
through, not the final state.

**State: on `experiment/profile-media`, mostly uncommitted.** This is a
mid-session snapshot, not an end-of-session wrap — logged now because the
storage cleanup below is a real, completed, verified change worth
capturing immediately, even though the feature branch itself is still
in flight.

**Branch/commit state** (important for whoever picks this up):
- `main`: 2 commits ahead of the previous session's tip — both migrations
  (`2000108` adds `profiles.avatar_url`, `2edf8de` adds `avatarUrl` to the
  shared `_hp_profile_label_json` RPC helper). Already pushed by the user.
- `experiment/profile-media`: branched from `main` at `2000108`, 3 commits
  (`afbe3e0`, `6ecd027`, `d719b65` — profile picture upload + My Journey +
  Community avatar wiring). Everything **after** those 3 commits (Live Mini
  leader avatar, Leaderboard avatar+level-pill, `streakRepairApi.ts`/
  `groupChallengesApi.ts`/`liveMiniMissionsApi.ts` plumbing) is
  **uncommitted in the working tree** — the user explicitly said not to
  auto-commit mid-work this round (see `docs/WORK_HISTORY.md` for the
  exact correction). `npx tsc --noEmit` is clean as of the last edit.
- **3 more migrations applied to the live DB but not yet committed to
  `main`**: `20260904140000_weekly_leaderboard_avatar_url.sql`,
  `20260904150000_live_mini_snapshot_avatar_url.sql`,
  `20260904160000_challenge_pending_repairs_avatar_url.sql` — all
  confirmed live via `list_migrations`, all applied by the user via
  `supabase db push` (not via the MCP `apply_migration` tool, per their
  explicit preference this round). Files exist on disk on
  `experiment/profile-media` right now; still need a `main`-branch commit
  like the earlier two.
- **A real footgun hit twice this round, worth remembering**: this repo's
  git checkout is the *same filesystem* the user's own terminal uses —
  every `git checkout <branch>` the agent runs also moves the user's
  terminal. Switching to `main` to add a migration, then back to the
  feature branch, left the user's terminal on the feature branch when
  they ran `supabase db push` — the CLI couldn't find the just-renamed/
  just-added migration files there (they only existed on `main`) and
  suggested `supabase migration repair --status reverted ...`, which
  would have been **actively wrong** (marks live, correctly-applied
  migrations as reverted). Always tell the user which branch you just
  left them on before they run a Supabase CLI command.

**Feature in progress — profile pictures, own + others' (not yet fully
committed, see above)**:
1. `profiles.avatar_url` (text, nullable) — own-upload flow on the
   Profile screen's level ring (tap to pick from library, square crop,
   compress via existing `streakMemoryStorage.ts` primitives, upload to
   `{uid}/avatar.jpg` in the existing `streak-memories` bucket, cache-
   busted with `?t=<timestamp>` since the path is reused on every
   re-upload). Synced as a plain direct `upsert` to `profiles` (not
   through the habits/mini-missions dirty-flag + `rpc_focus_delta_v1`
   sync machinery — deliberately simpler, fetched once on hydrate in
   `AuthContext.tsx`).
2. Ring redesign per explicit request: the center level-number badge
   was removed (level already shown beside the ring, redundant); center
   shows the photo once uploaded, or a bare camera icon as an empty-state
   prompt before that; a small camera badge protrudes just outside the
   ring's edge once a photo exists (rendered as a sibling inside
   `LevelXpRing`'s unclipped container, not inside the photo's own
   `overflow: hidden` box — that distinction matters, see the
   corresponding conversation turn if this needs revisiting).
3. **Real architectural find**: a shared Postgres helper,
   `public._hp_profile_label_json(uuid)`, already builds the
   username/displayName/xp payload for a large fraction of this app's
   "show another user's identity" RPCs (community feed, challenge
   snapshot, etc.). Adding `avatarUrl` to that **one** function
   (migration `2edf8de` on `main`) automatically propagated real avatars
   into: Community feed post authors (`CommunityWinFeedPost.tsx`),
   Community Player profile hero (`community-player/[id].tsx`), and the
   Group Challenge/Cohort member snapshot (data-ready now, no UI consumer
   yet — Cohort screens still show no avatar at all, confirmed absent).
   Three *other* RPCs build their own profile-label JSON inline instead
   of using the shared helper and needed their own migrations:
   `_hp_live_mini_snapshot_json` (Live Mini), `get_weekly_leaderboard_v2`/
   `get_weekly_leaderboard`/`search_weekly_leaderboard_v1` (Leaderboard —
   these three needed `drop function` + recreate, not `create or
   replace`, since `RETURNS TABLE`'s column list changed), and
   `rpc_challenge_pending_repairs_v1` (streak-repair voter list). A
   fourth inline builder, `get_community_player_profile`, was found and
   deliberately left alone — confirmed dead code, no client call site.
4. Live Mini race-leader hero avatar wired (`app/live-mini/[id].tsx`) —
   plain initials-circle swap, same pattern as everywhere else.
5. **Leaderboard got a custom treatment, not a plain swap** — its circle
   shows the entrant's *level number*, which is real information, not a
   decorative placeholder, so replacing it outright would have deleted
   that. Per explicit user direction: photo fills the circle when one
   exists, and the level number moves to a small opaque pill that
   protrudes just outside the circle's bottom-right edge, colored with
   the same per-user identity hue the plain circle used to be tinted
   with (`avatarIdentityFor`, `identity.foreground` as a *solid* fill —
   first pass used the existing translucent `identity.background`/
   `.border`, which read as "faded" against a photo; corrected to opaque
   solid + white text/border on explicit feedback, then shrunk again on
   a follow-up "make it a bit smaller"). No photo → orb looks exactly as
   before (level number + "LVL" caption, tinted background).
6. `ProfileLabel`/`LiveMiniProfileLabel`/`CommunityWinFeedItem`/
   `CommunityPlayerProfile`/`CommunityWinCheerer`/`WeeklyLeaderboardEntry`
   all gained a required `avatarUrl: string | null` field — every local
   fallback-object construction site that builds one of these shapes
   inline (own-user placeholder in `my-journey.tsx`, seed profile in
   `community-player/[id].tsx`, `CommunityPlayerDrawer.tsx`'s currently-
   unused seed mapper) was updated to match: own-user fallback uses the
   real `avatarUrl` already in the store; arbitrary-other-user fallbacks
   use `null` until their real profile loads.
7. **Not yet done, explicitly deferred**: the video-memory feature
   (5-second clips) the user asked about earlier this session — agreed
   plan was capture-time duration/quality capping via the already-
   installed `expo-image-picker`/`expo-av` (no new native dependency,
   stays OTA-shippable), own-mission-only for v1, Community feed video
   display deliberately deferred pending real usage data given the
   Storage headroom concern below. Not started — the storage cleanup
   below was done first, as agreed.

**Completed and verified this session — Supabase Storage cleanup (free
tier headroom)**:
- Live-queried actual usage (not estimated): before cleanup, `public`
  schema DB was 102MB/500MB (fine), but the `streak-memories` Storage
  bucket was **730MB/1GB — 73% of the free-tier cap**, with only ~270MB
  of headroom left. This was the direct trigger for pausing the video
  feature: a 5s video (~1-2MB even compressed) would have burned through
  that fast.
- Root cause of the bloat: `streakMemoryStorage.ts`'s documented fallback
  behavior (`maybeCompressImageForUpload`) — on certain Android
  `content://` sources, resize and even bare compression can fail, and
  the code falls back to uploading the **original, uncompressed** file
  rather than dropping the memory entirely. A size-bucketed query showed
  the failure mode clearly: 1485 of 1646 files sat in the expected
  100KB–1MB range (working as designed), but **161 files were 1-4.5MB
  each, totaling 275MB (38% of all storage) — a real bug's footprint, not
  legitimate content**.
- Built a one-off, non-app maintenance script (`scripts/
  compact-streak-memories.mjs` + a companion `.manifest.json` listing the
  exact 161 paths, both currently untracked on `experiment/profile-media`
  — not part of the app, never bundled, uses `sharp` as a throwaway
  `--no-save` dependency since `sharp` is Node-only and can't run in
  React Native). For each manifest entry: download → resize to max
  1280px width → re-encode JPEG quality 78 → upload back to the **same
  path** (`upsert: true`, so no DB/URL changes needed anywhere) → skip if
  the recompressed version isn't actually smaller. Needs
  `SUPABASE_SERVICE_ROLE_KEY` (deliberately never read from the app's own
  `.env` — that key must never be anywhere near the bundled app) and was
  run by the user directly from their terminal, not by the agent (no
  service-role credential available in this environment).
- **Result, independently verified by the agent via a direct SQL query
  against `storage.objects` after the user ran `--apply`** (not just
  trusting the script's own log): 161/161 processed, 0 skipped, 0 failed.
  Bucket total dropped from 730MB to **485MB** — a ~245MB reclaim,
  bringing free-tier storage usage from 73% down to **~47%**, with zero
  content deleted (object count unchanged at 1646; only the bytes behind
  each of those 161 paths got smaller).
- **Not fixed**: the underlying `streakMemoryStorage.ts` fallback bug
  itself is untouched — this cleanup treated the symptom (already-bloated
  files), not the cause. New uploads that hit the same
  resize/compress-failure path will still upload at original size going
  forward. Worth a proper fix (e.g. a lower-quality last-resort
  compression attempt before giving up entirely, or at least an upload
  size cap) before this recurs and erodes today's headroom again.

## Session Handoff (2026-09-04, end of session)

**State: clean, on `main`, pushed and OTA'd.** Two commits ahead of the
2026-08-21 session's tip (`2f953ad`..`1db64b8`), both JS/TSX only, shipped
to `preview` then `production` as one phased OTA push (same code, two
channels). Nothing mid-flight, nothing uncommitted except the pre-existing
untracked `.mcp.json`/`.claude/`. `npx tsc --noEmit` clean after both
commits.

1. **Fixed a live production bug: Android RevenueCat paywall buttons
   permanently disabled** (user-reported: "जब कोई उसमें दबा रहे हैं, जैसे
   कि paywall को जब वो दबा रहे हैं, तो वह response ही नहीं कर रहा है" —
   iOS unaffected). Root cause was **not** a hardcoded key — the code was
   already correct — but a real production-config gap:
   - `src/context/BillingContext.tsx`'s `isUnsafeAndroidTestStoreKey()`
     (lines ~309-314) deliberately zeroes out the Android RevenueCat key
     in non-dev builds if it starts with `test_` (RevenueCat Test Store
     key) — this is an intentional safety net, not the bug. When it
     fires, `configured` becomes `false`, `ready` never flips `true`, and
     every paywall button (`app/membership.tsx`,
     `src/context/PlusUpsellContext.tsx`) stays permanently `disabled`.
   - This exact failure mode already happened once before and is
     documented in this file's history (see the `97cb22c0` corrective OTA
     entry further below) — the fix at the time was **operational, not
     just code**: always publish OTAs via `npm run update:preview` /
     `update:production` (`eas update --environment ...`), which forces
     EAS to use its own **hosted** environment secrets instead of
     whatever's in the local dev machine's `.env` (which has a Test Store
     key for local development, by design).
   - Live-verified via `eas env:list`/`eas update:list` this session:
     production's hosted RevenueCat keys were correct
     (`goog_...`/`appl_...`), but the risk is any OTA published without
     an explicit `--environment` flag falls back to the local `.env`,
     silently re-embedding the stale `test_` key — most likely explanation
     for the live symptom.
   - **Fix applied**: republished a corrective production OTA
     (`npm run update:production`-equivalent, update group
     `1a6f1f07-b9f2-43c3-9ec3-5b8ae403642a`, no code change — same commit
     `2f953ad`, just re-bundled through the correct environment). Log
     output confirmed the fix: `Environment variables ... loaded from the
     "production" environment on EAS: EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY,
     EXPO_PUBLIC_REVENUECAT_IOS_API_KEY, ...`.
   - **Known remaining gap, not yet fixed**: EAS's **preview** environment
     has no `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY` entry at all (only
     Android is set there) — confirmed again live during this session's
     own preview OTA push, whose log shows only
     `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY` loading from the preview
     environment. Preview-channel builds' iOS paywall may be affected the
     same way; production is unaffected. Flagged to the user, not yet
     actioned (their call whether to fix).
2. `841e25c` — **Symmetric card spacing in My Journey's "Minis" masonry
   grid** (`app/my-journey.tsx`, user-reported via screenshot: right-side
   card padding visibly wider than left, only in the Minis tab, both
   Public and Private). Root cause: `MiniPostCard` only ever got
   `marginRight: gap` with no compensating `marginLeft` — masonry packs
   cards into whichever column is currently shortest (not a strict row
   grid), so there's no "skip the right margin on the last column" logic;
   every right-most-column card carried a trailing gap the left-most
   column never had. Split the gap evenly (`marginLeft: gap / 2,
   marginRight: gap / 2`) instead — same total per-card footprint, so no
   change to the existing `masonrySlotWidth`/`miniTileWidth` math, just
   symmetric placement. The Missions tab (single-column list, no masonry)
   was never affected.
3. `1db64b8` — **Cohort screen's per-participant streak-dots row now
   scrolls edge-to-edge** (`src/components/CohortPeerStreakDots.tsx` +
   `app/challenge/[id].tsx`, user-reported via screenshot + detailed
   description: dots "cutting off" well inside the card rather than at
   its actual edge). Root cause: the dots `ScrollView` was a direct child
   of the same `participantCard` `padding: 16` box as the name/level
   header row above it, so the scroll viewport's clip boundary sat 16px
   inside the card's true edge on both sides — a dot would visibly
   truncate into empty padding space rather than at the card boundary.
   Added a new optional `edgeToEdgeInset` prop to `CohortPeerStreakDots`:
   when set, the embedded-mode wrapper gets a matching negative
   `marginHorizontal` (bleeding past the parent's padding), and the same
   amount is re-added as the `ScrollView`'s own `contentContainerStyle`
   padding so the first dot still starts visually aligned with the name
   row above it — only the scroll/clip boundary moved, not the resting
   position. Call site passes `edgeToEdgeInset={16}`, matching
   `participantCard`'s own `padding: 16` (single source of truth stays in
   the screen's own stylesheet, not duplicated as a magic number in the
   shared component). The component's `showIdentityRow={true}` branch
   (unused by any current call site) is untouched.

**Also this session, no code produced**: a detailed feasibility/
architecture-mapping pass for two large features the user is considering
(explicitly deferred, not started, no decision requested yet):
- **Per-mission difficulty tiers** (Easy/Medium/Hard gating what's
  required to mark a day/task complete — no memory required, text
  required, or photo required). Finding: no gating exists at any layer
  today (store actions like `toggleCompletion`/`markChecklistDayComplete`/
  `completeMiniMission` all trust the caller unconditionally); the only
  content check anywhere is `StreakMemorySheet.handleSave`'s "note OR
  photo" rule, which doesn't distinguish which. `Habit.mode` and
  `MiniMission.completionMode` are both already taken by unrelated
  concepts — a difficulty field needs a different name. Adding a new
  synced `habits` column touches 5-6 spots (`sync.ts`'s pull/push
  functions plus three separate places inside `rpc_sync_dirty_state`) —
  this exact bug class (a field silently dropped because one of those
  spots was missed) has already bitten `task_checklist` twice, per that
  migration's own comments.
- **Kickout system for group challenges** (creator-initiated or
  auto-kick after N days inactive; ownership succession when a creator
  leaves, WhatsApp-admin-style). Finding: `challenge_groups.creator_id`
  and `challenge_members.role` exist in the schema but are never read
  anywhere in the client UI today; the existing "leave challenge" RPC
  (`rpc_leave_challenge`) **hard-deletes** the leaver's habit/memories/
  social rows, with no succession logic at all if the creator is the one
  leaving. `challenge_members` has no UPDATE/DELETE RLS policy, so kick
  and succession both require a new `SECURITY DEFINER` RPC (mirroring the
  existing leave RPC's pattern). No "last activity" column exists
  anywhere for an auto-kick threshold to check against — the closest
  precedent for a lazy (no-cron) staleness check is Live Mini Squads'
  `effectiveParticipantStatus()` + `rpc_refresh_live_mini_missed`
  self-heal-on-read pattern, which has not been ported to Group
  Challenges. Full breakdown of both features' current-state findings
  exists only in this conversation's history, not yet written to a
  standalone doc — worth capturing properly if either is greenlit.

**OTA**: phased — `npm run update:preview`-equivalent first (update group
`c8357b8f-2f3b-4157-895a-32364f7a839f`), then `npm run
update:production`-equivalent (update group
`d2dde12b-1230-4616-a40d-016f715ad257`), both runtime `1.1.35`, commit
`1db64b8`. Both JS/TSX-only changes — OTA-safe by the usual criteria (no
`package.json`/lockfile/`app.json`/`eas.json` diff).

**Not visually confirmed**: same sandbox limitation as every prior
session — no way to tap through the Android paywall fix, the My Journey
grid, or the cohort dots row on a real device/simulator. All three were
reasoned from code + `tsc`, and the paywall fix was additionally
cross-checked against live `eas env:list`/`eas update:list` output (not
just static code reading) — but none were tapped through.

## Session Handoff (2026-08-21, end of session)

**State: clean, on `main`, pushed and OTA'd.** Three commits ahead of the
2026-08-14 session's tip (`5f44d8d`..`2f953ad`), pushed to `origin/main`
and shipped as one production OTA update. Nothing mid-flight, nothing
uncommitted except the pre-existing untracked `.mcp.json`/`.claude/`.
`npx tsc --noEmit` clean after every commit below.

1. `5d5fb72` — **Mini missions FAB visibility fix.** The floating "+"
   button previously only hid itself on an empty Active tab; the Waiting/
   Queued tab could show both the FAB *and* the empty state's own
   "Create a Mini Mission" button at once — a real duplicate-CTA bug.
   Now: `hideFab = totalMiniMissionCount === 0 || (tab === "active" &&
   activeCount === 0) || (tab === "queued" && queuedCount === 0)`. The
   FAB also now hides outright for a brand-new account with zero missions
   anywhere (previously it still showed on the Completed/Failed tabs even
   then).
2. `e6d4656` — **Fixed iOS-only bold-looking timer digits in light mode**
   (user-reported: "the clock timer text looks very bold in case of iOS,
   make it look better like it does in Android"). Root cause:
   `SplitFlapDigit` (shared by `Timer.tsx` and
   `MiniMissionFlightCountdown.tsx`) applied a blurred colored text-shadow
   glow behind the digits on iOS only (`Platform.OS === "android" ?
   undefined : textShadowStyle` — Android never got one). In dark mode
   that reads as a glow; in light mode the same halo around near-black
   digits on white read as thick/blurry. Gated the shadow on `isDark` too
   (now `Platform.OS === "android" || !isDark ? undefined :
   textShadowStyle`), so iOS matches Android's crisp look in light mode
   and keeps the glow only in dark mode, where it was actually designed
   to read as one.
3. `2f953ad` — **Mini mission sound system + a "Reminder sounds" mute
   toggle**, built over several rounds of live back-and-forth (user
   confirmed the timer-end sound "is good" before the other two were
   built to match/complement it; three separate feasibility/design
   discussions preceded implementation — see `docs/WORK_HISTORY.md`'s
   2026-08-21 entry for the full discussion arc). Three synthesized
   (not licensed/stock — generated from scratch, sine-partial bell
   synthesis, no audio-licensing question) chimes in `assets/sounds/`:
   - `mini-mission-timer-end.wav` — plays when the countdown hits 0:00
     while the mission-detail screen is open (a calm two-note bell).
   - `mini-mission-completed.wav` — plays when a mission is actually
     marked complete, both classic and checklist paths (a brighter
     3-note ascending arpeggio + sparkle, deliberately more "rewarded"
     than the timer-end notice).
   - `mini-mission-reminder.wav` — plays in-app at the 2-minutes-
     remaining mark **in place of** the OS `mini_warn` notification's
     own sound, but only while that exact mission's detail screen is
     actively focused (a "ting-ting" double-strike, reads as a heads-up
     rather than a reward — deliberately not melodic like the other two).
   New files: `src/lib/completionSound.ts` (loads/caches/plays all
   three via `expo-av`, already a dependency — no native module change,
   no new build needed) and `src/lib/miniMissionFocusTracker.ts` (a tiny
   shared "which mission's screen is on-screen right now" flag — the
   bridge between the screen, which has navigation context, and the
   notification module, which doesn't).
   **Real correctness fix required by the reminder's on-screen
   suppression**: navigation focus (`useIsFocused`) alone isn't enough —
   Expo Router keeps a screen "focused" even while the whole app is
   backgrounded (phone locked, user switched apps), so suppressing the
   OS notification on navigation-focus alone would drop the warning
   entirely for a mission nobody's actually looking at. Combined
   `isFocused` with `AppState.currentState === "active"`, checked at
   the moment the reminder timer actually fires, not when it was
   scheduled. `shouldScheduleWarn`/`WARN_LEAD_SECONDS` were exported from
   `src/utils/miniMissionNotifications.ts` (previously module-private) so
   the screen's in-app reminder timer fires under the exact same
   threshold the OS notification would have, instead of a duplicated
   magic number.
   **Settings toggle**: "Reminder sounds" in `SettingsModal.tsx`
   (`AsyncStorage`-persisted, defaults on). Required one more correctness
   fix: the on-screen OS-notification suppression only makes sense
   *because* the in-app chime replaces it — so suppression now also
   checks `isMiniMissionSoundEnabled()`. Without that check, muting the
   toggle while on-screen would have silently dropped the reminder
   entirely (no chime *and* no banner, since both paths would've been
   gated off at once).
   **Scope note, asked explicitly and confirmed not needed**: the OS
   notifications' *own* sound (the "time's up"/"mission failed" system
   alerts when delivered off-screen or backgrounded) is untouched — the
   mute toggle only covers the three custom in-app chimes.

**OTA**: update group `56c8e871-91d2-42a1-91cd-4d8c7b85f9b1`, runtime
`1.1.35` (unchanged), commit `2f953ad`. Verified OTA-safe via `git diff
5f44d8d..HEAD --stat -- package.json package-lock.json app.json
eas.json` (empty) — the three new `.wav` files are ordinary bundled
assets, not a native module change, so this shipped as a normal OTA
with no new build.

**Not visually/audibly confirmed**: same sandbox limitation as ever —
no way to drive a real device's touch/keyboard/audio output from this
environment. The FAB and timer-text fixes were reasoned from code +
`tsc`, not tapped through; **the three chimes were never actually heard
by the agent** — their character (bell voicing, "ting-ting" vs. melodic
distinction, sparkle layer) was designed from the synthesis parameters
and the user's own live listening feedback across iterations, not
independently verified. If the user reports any of the three sounding
off, re-check `src/lib/completionSound.ts`'s volume (`0.85`) and the
three `.wav` files' synthesis scripts (kept only in this conversation's
history, not committed to the repo) before assuming a wiring bug.

## Session Handoff (2026-08-14, end of session)

**State: clean, on `main`, pushed and OTA'd.** Nine commits ahead of the
2026-08-12 session's tip (`308a3a6`..`87c4784`), all pushed to
`origin/main` and shipped via two separate production OTA updates.
Nothing mid-flight, nothing uncommitted except the pre-existing untracked
`.mcp.json`/`.claude/`. `npx tsc --noEmit` clean after every commit below.

**First OTA (update group `5e9b0adb-751b-4667-848a-366ce8780b72`, commit
`5277ad5`) — three commits, cross-device photo sync + mini-task editing:**

1. `f5837f4` — **Fixed memory/task photos not visible across devices on
   the same account.** Two bugs stacked: (a) `memoryForRemote()` in
   `sync.ts` had a premature `return next` in the deferred-upload path
   that skipped the local-path cleanup at the end of the function, so a
   device-local `file://` path could leak into the pushed Supabase row
   instead of being stripped/replaced by the upload; (b) checklist task
   photos had **no** background-upload/retry infrastructure at all (only
   classic per-day memory photos did) — task photos just stayed local
   forever. Fixed the premature return, and extended the full
   schedule/commit/retry pattern to task photos for both habits and mini
   missions (`scheduleHabitTaskMemoryUpload`/`scheduleMiniTaskMemoryUpload`,
   new `patchStreakMemoryTaskProof`/`patchMiniCompletionMemory`/
   `patchMiniCompletionMemoryTaskProof` store actions,
   `retryPendingMemoryUploads()` called from `AuthContext` after sign-in
   hydration). Also added `sanitizeRemoteMemory`/`sanitizeRemoteStreakMemories`
   to strip any already-corrupted local paths pulled from rows written
   before this fix.
2. `799c5d4` — **Mini-mission task photo editing before Mark Complete.**
   `app/mini/[id].tsx`'s `onSelectTask` now prefills the capture sheet
   from the task's existing draft entry (matching the main-mission
   behavior already in `habit/[id].tsx`) instead of only supporting
   view-after-complete.
3. `5277ad5` — **Fixed mini-mission draft task logs randomly disappearing
   mid-run**, found live via real-device testing (user reported the same
   mission showing different tasks checked on iPhone vs. Android, and
   intermittent same-device loss). Root cause and fix documented in
   `app-architecture.md`'s Sync Architecture section (new 2026-08-14
   gotcha) — short version: `draftTasks` is local-only but was still being
   dropped by the generic dirty-flag-gated remote-merge logic. **User
   explicitly deferred full cross-device `draftTasks` sync** ("same
   device persistence is fine for now") — only the same-device race was
   fixed this round.

**Second OTA (update group `40cf8603-08a7-4ce1-bf31-e1c997d2af11`, commit
`87c4784`) — six commits, one real bug fix + a minimalist visual pass
driven by live screenshots/simulator checks across this session:**

4. `866a26b` — **Fixed Live Squad peer status stuck "on mission" forever
   after their deadline passes** (user-reported via screenshot: a
   participant's elapsed time read "16h 44m of 45m"). Full root-cause and
   fix in `app-architecture.md`'s Live Mini Squads section (new
   2026-08-14 note) — short version: peer status only flipped server-side
   via a one-shot timer on the *other* device that had to be alive at the
   exact expiry moment; `app/live-mini/[id].tsx` now derives the correct
   status locally from `deadline_at` and also triggers the previously-
   unused `rpc_refresh_live_mini_missed` server reconciliation on board
   load.
5. `a85418d` — Mini Missions Done tab: replaced the inline "· Moment" text
   with a small camera glyph in the same top-right badge slot the Live
   pill uses (`app/mini/index.tsx`).
6. `4f57afb` — **Profile hero card minimized**, per explicit "if we had to
   minimise this what shall we do?" → "do it": collapsed the "Level N"
   pill + Community/Premium pill into one plain-text status line, dropped
   the XP progress bar (the ring already shows it) folding "Total XP"
   inline instead, and replaced the 3-color rainbow-gradient "View My
   Journey" CTA with a flat indigo outline button.
7. `e6f2baf` — Quieted the two notification-launch screens
   (`app/challenge-memory.tsx`'s "Open squad" screen,
   `app/journey-moment/[id].tsx`'s liked-moment screen): same
   gradient→flat-outline CTA treatment as #6, Squad Actions tiles shrunk
   from fully color-tinted cards to a neutral tile + a small translucent
   icon badge, and the redundant group icon dropped from the "Squad
   actions" section header.
8. `4a9491a` — **Notifications list redesign** (`app/notifications.tsx`):
   replaced the uniform bright-cyan subtitle on every row (regardless of
   what the notification actually meant) with a small per-type tone-
   tinted icon badge — `notificationVisual()`/`notificationToneColors()`,
   new note in `app-architecture.md`'s Notifications section. Dropped the
   "🔥" emoji from "Streak repaired!" now that the icon carries it. Went
   through two rounds of live-simulator feedback: badge repositioned from
   a reserved left dot-column (too much left gutter, badge pinned to the
   top of a multi-line row) to overlaying the unread dot on the badge
   itself and vertically centering the badge against the full text block.
9. `87c4784` — **Standardized on the Wrench icon for repair, everywhere.**
   User's first ask (notification "Streak repair request" row) used
   `Hammer`; user then asked to use `Wrench` there instead and replace
   every other `Hammer` repair icon in the app to match — Home
   `HabitCard.tsx`'s day-grid repair dot, `app/habit/[id].tsx`'s day-grid
   dot + Repair button, and `StreakMemoryGallery.tsx`'s repaired-day hex
   overlay. No `Hammer` references remain anywhere in the app.

**Third OTA (update group `e88ebfdb-b170-4edf-af9a-bbaa15e389cc`, commit
`35ff52b`) — one commit, a real regression from the Aug-12 session's own
Android keyboard fix:**

10. `35ff52b` — **Fixed Android keyboard-dismiss jitter on the invite
    search sheets**, user-reported: "after the user is able to find the
    person and the keyboard is removed, the invite screen literally
    jitters... only on Android." Root cause and fix documented in
    `app-architecture.md`'s Known Caution Points (new 2026-08-14 entry) —
    short version: the Aug-12 fix for the keyboard *covering* the search
    input (`baf216b`) switched Android's `KeyboardAvoidingView` from no
    `behavior` at all to `"height"`, which is correct in principle but the
    wrong mode — `"height"` forces a full re-layout on every one of the
    several rapid frame-size reports Android sends during the dismiss
    animation. Switched `GroupChallengeSheet.tsx`/`LiveMiniInviteSheet.tsx`
    to `behavior="padding"` on both platforms (mirroring
    `CustomNudgeModal.tsx`'s already-stable identical `<Modal>` +
    `KeyboardAvoidingView` structure) with `keyboardVerticalOffset={12}` on
    Android. **Not visually confirmed** — no way to drive an Android
    keyboard show/dismiss in this sandbox; diagnosis is root-caused from
    the known Android `behavior="height"` re-layout-thrash pattern plus an
    identical, already-working pattern elsewhere in this exact codebase,
    not from reproducing and re-testing the jitter directly. Worth a real
    check on a physical Android device before considering this fully
    closed.

**All three OTAs verified OTA-safe** the same way as every prior session:
`git diff <base>..HEAD --stat -- package.json package-lock.json app.json
eas.json` empty for all three ranges. `npx eas update` failed once on the
first attempt of the second OTA (`Asset processing timed out` — a
transient upload-timeout to EAS's servers, not a code/build problem; the
bundle itself had already exported cleanly) and succeeded on immediate
retry; the first and third OTAs each published cleanly on the first try.

**Visually confirmed live, unlike most prior sessions**: this session had
a booted iOS simulator with the dev server attached, so the Mini Missions
camera glyph fix, the Profile hero minimization, and all three rounds of
the Notifications redesign were screenshotted and iterated on live
in-session (including the user's own side-by-side iPhone+Android
screenshots that caught the Live/camera badge collision and drove the
centering fix). **Still not confirmed live**: the notification-launch
screens (`challenge-memory.tsx`/`journey-moment/[id].tsx`) are deep-link-
only (reachable by tapping a real push notification), and this session had
no way to fire one or drive taps — those two are code-reviewed and
`tsc`-clean but not eyeballed on-device this round.

## Session Handoff (2026-08-12)

**State: clean, on `main`, 7 commits ahead of the 2026-08-09 merge point.**
Nothing mid-flight, nothing uncommitted except the pre-existing untracked
`.mcp.json`/`.claude/`. `npx tsc --noEmit` clean after every commit below.
Commits, oldest to newest:

1. `5c37bad` — **Minimalist is now the app's only theme pack.** `ThemeContext.tsx`'s
   default flipped to `'minimalist'` and the AsyncStorage-saved pack is no longer
   restored on load (always resolves to minimalist regardless of any prior
   selection); the Classic/Minimalist picker removed from `SettingsModal.tsx`.
   Classic's theme code is untouched, just unreachable — nothing deleted.
2. `64d5cde` — **"@" prefix dropped from every displayed username.** 20
   occurrences across 14 files (helper functions in `notifications.tsx`,
   `my-journey.tsx`, `challenge-memory.tsx`, `community-player/[id].tsx`,
   `live-mini/[id].tsx`, `journey-moment/[id].tsx`, plus inline JSX in
   `profile.tsx`, `compete.tsx`, `GroupChallengeSheet.tsx`,
   `LiveMiniInviteSheet.tsx`, Community-feed/cohort components) — usernames
   render plain (`raktim_24`) everywhere now. `src/lib/oauthRedirect.ts`'s
   `@owner/slug` Expo project identifier was correctly left alone (not a
   username).
3. `baf216b` — **Fixed Android keyboard covering invite-search sheets.**
   `GroupChallengeSheet.tsx`/`LiveMiniInviteSheet.tsx` both hardcoded
   `behavior={Platform.OS === "ios" ? "padding" : undefined}` — Android got no
   behavior at all, so `KeyboardAvoidingView` did nothing. Switched Android to
   `"height"`.
4. `a6a1b23` — **Fixed streak-repair prompts firing for days before a user
   joined a group challenge mid-way.** Root cause: `Habit.startDate` is the
   cohort's shared day-1 anchor, not this participant's own tracking start, so
   completing your actual first tracked day (e.g. day 10 of 30) surfaced "you
   missed day 9." Added `Habit.joinedChallengeAt` (set only on accept-invite)
   and guarded `getEligibleStreakRepair` (`src/utils/streakRepairEligibility.ts`)
   so it never offers a repair before it. Includes the Supabase migration
   `supabase/migrations/20260812120000_habit_joined_challenge_at.sql` —
   **already applied by the user** (`supabase db push` succeeded) — which adds
   `habits.joined_challenge_at` and fixes `rpc_sync_dirty_state`'s
   `jsonb_to_recordset` column list to actually carry it through (the same bug
   class that silently dropped `task_checklist` twice before).
5. `8416991` — **Fixed mini-mission task logs being lost on app close/
   backgrounding.** Main-mission per-task logs persist into the store
   (`habit.streakMemories`); mini-mission drafts only ever lived in the
   screen's local React state. Added `MiniMission.draftTasks` (persisted on
   the mission record) plus `setMiniMissionDraftTask`/
   `removeMiniMissionDraftTask`/`clearMiniMissionDraftTasks` store actions;
   `app/mini/[id].tsx` now reads/writes through them. Local-only (not synced
   to Supabase) — survives close/background/resume on the same device, which
   is what was reported; full cross-device durability would need a schema
   migration like #4's.
6. `e12cb6b` — **Mini Missions screen minimalist redesign (list + detail).**
   FAB now hidden only when Active is empty; Waiting/Done/Failed cards
   flattened (redundant status pills dropped, Done's footer merged to one
   line, Failed's Retry became a text link and Open Squad a real elevated
   button); whole list moved from bordered per-row cards to a flat hairline-
   divided list; tabs rebuilt to match Home's segmented control exactly,
   including an always-visible count badge so a tab's footprint never changes
   on selection (fixing a real visual-inconsistency report). Detail screen's
   "waiting to start" state is now one composed card with a concrete "finish
   by ~HH:MM" estimate instead of three floating disconnected pieces. Took
   inspiration from a Claude Design mock (1a/2a "quiet mono" direction) via
   the `claude_design` MCP.
7. `fae0a49` — **Live Squad screen minimalist redesign**, explicitly mirroring
   `CohortLeaderHero`: rank badge → plain numbered circle (was amber Trophy +
   colored pill), hero pace rows → the identical 14-square grid/rank-palette
   Cohort uses (was a solid colored bar), level pill → transparent/bordered,
   "PARTICIPANTS" header + colored dot legend → plain "Participants" label,
   participant rows flattened to a hairline-divided list, "Invite more" card
   flattened to match Mini Missions' Keep-Screen-On row treatment, redundant
   fastest-time chip and animated progress-bar sheen removed. Status pill and
   cyan on tappable elements left untouched — genuinely informative/consistent
   signals, not decoration.

**Production OTA readiness**: all 7 commits are JS/TS/TSX only — confirmed via
`git diff 5c37bad..HEAD -- package.json package-lock.json app.json eas.json`
(empty). No native modules, no dependency changes, no version bump. The one
non-JS change (the Supabase migration) is a backend schema change already
applied directly to the database, independent of the app bundle/OTA
mechanism entirely. Per `app-architecture.md`'s OTA-safe criteria, this
batch is eligible to ship as a normal production OTA update, no
force-update/version bump needed. **Update (2026-08-14): this batch was
pushed and OTA'd in the 2026-08-14 session** (bundled together with that
session's own first three commits, as update group `5e9b0adb` — see the
handoff section at the top of this file), not in this Aug-12 session
itself.

## Session Handoff (2026-08-09, post-merge)

**State: clean, on `main`, merge complete.** `experiment/glass-redesign-v2`
(all commits from the 2026-08-04 / 2026-08-06 / 2026-08-08 sessions) is
merged into `main` via PR #1 (merge commit `0a52ef7`). `git log
origin/main..HEAD` and `HEAD..origin/main` are both empty — local `main`
exactly matches remote. Nothing mid-flight, nothing uncommitted except the
pre-existing untracked `.mcp.json` and `.claude/`. `npx tsc --noEmit`
clean on `main` post-merge. Every commit below is JS/TSX/style/doc only —
no `package.json`/lockfile/`app.json`/`eas.json` changes this session or
across the whole merged branch — so per `app-architecture.md`'s OTA-safe
criteria this is eligible to ship as a normal production OTA update, no
version bump/force-update needed. **Not pushed as OTA yet — that step
hasn't been requested.**

## Session Handoff (2026-08-08, end of session, historical — see merge note above)

**State: clean, still on the experiment branch.** Everything from this
session is committed on `experiment/glass-redesign-v2` (six commits ahead
of the previous session's `9743a6e`, `main` itself untouched). Nothing
mid-flight, nothing uncommitted except the pre-existing untracked
`.mcp.json` and `.claude/`. `npx tsc --noEmit` clean after every commit
below. **No merge to `main`, no push, no OTA/build.**

Commits this session, oldest to newest (all on `experiment/glass-redesign-v2`):

1. `9ebdc34` — **habit detail screen polish**: `Timer.tsx`'s digits enlarged
   via `SplitFlapTimeDisplay`'s existing `size="large"` variant (previously
   unused there, capped at the tiny `"normal"` size regardless of available
   width), HRS/MIN/SEC legend shrunk to compensate; a small top-right arrow
   (⬆ elapsed / ⬇ remaining) replaces the old "TIME LEFT" text label that
   used to shift the card's height on toggle; the fire icon's vertical
   alignment nudged (it was centering against the digit+legend block
   combined, not just the digits, so it sat visibly low once the digits
   grew); intro hold before the fire collapses raised from instant to 4s.
   Day-grid completed-day number now shares the same dulled gray
   (`#8b93a1`) as its camera/hammer/message icon instead of pure white —
   applied identically to both the habit-detail grid and (via a later
   commit) the cohort screen's copy of it. `green[900]` gained a doc-comment
   clarifying it's deliberately not identical across themes (light mode
   already had its own lighter step from a prior session). A same-file
   experiment — light mode's completed circle using `green[500]` (a
   brighter "simple" green) instead of the dulled `green[900]` — shipped
   with matching whiter text/icon color for that mode only; dark mode
   unchanged. `StreakMemoryGallery`'s bookmark section icon switched from
   filled to outline.
2. `a33f56d` — **Home habit card**: added a plain (no pill/border/gap)
   colorless flame icon + "Xd" streak indicator beside the mission-type
   tags; removed the "Public" pill entirely per explicit feedback that
   Squad already implies the relevant distinction and visibility-only
   doesn't need its own badge.
3. `d973c1c` — **neutral Android photo-picker dialog**: `AppDialogContext`
   gained an additive `"neutral"` button style (same quiet bordered look as
   `"cancel"`) and an optional `icon` slot on `AppDialogButton` — every
   other `showAppAlert` caller in the app is unaffected since neither field
   is set anywhere else. Used immediately in `StreakMemorySheet.tsx`'s
   Android "Add a photo" sheet: Take Photo / Photo Library now use muted
   Camera/Image icons instead of one indigo-filled primary button, so all
   three options (incl. Cancel) read as equal-weight choices.
4. `57598df` — **cohort/squad screen minimalist redesign, the big one**:
   - `CohortLeaderHero`: 1st/2nd/3rd rank text + colored progress bars
     replaced with neutral numbered circles + a 14-square dull-toned grid
     per rank (amber[900] / a local muted-indigo `#4B4BB0` / green[900] —
     picked over reusing red[900] to avoid the "3rd place = failure"
     connotation red carries elsewhere in the app). The redundant name/
     level/streak header row was removed outright (all of it duplicated
     info already in the ranked list directly below) in favor of a plain
     "Rankings" label — along with it went the avatar/initials circle and
     the `topTwoPaceLine`/"leads 2nd place by N days" narrative sentence.
   - `CohortStreakPill` (new shared shape, still same file): a colorless
     filled flame icon immediately followed by "Xd" (no gap, no pill/
     border/background) — reused as-is in the cohort leader card, cohort
     participant rows, and later in this same session, Community feed
     post headers.
   - `CohortPeerStreakDots`: completed dots now mirror the habit-detail
     day-grid exactly — one dull-green circle, camera/hammer/message icon
     priority, dashed red current-day ring, no pulse animation. The
     timeline legend simplified from 3 colored swatches (with-memory/
     check-in/current) to 2 (completed/current) since the memory-vs-
     check-in distinction now lives in the icon, not a color/border
     difference a 10px swatch could show.
   - `CohortNudgeChips`: horizontal `ScrollView` → non-scrolling flex row
     (`flex: 1` per chip) so all 4 nudges always fit without horizontal
     scroll, at any screen width.
   - Participant/leader cards: level pill shrunk and moved from a colored
     chip to a small neutral-bordered inline pill beside the eye icon
     (an earlier attempt overlaid it on the username's corner like a
     notification badge — reverted after it overlapped the card's own top
     edge); eye/visibility icon lost its circular border/background
     entirely (bare icon now, always reads as "private" styling regardless
     of actual state per request); "Day X of XX" pill and the Milestones
     accordion (in `SquadActivitySection`, shared by this screen's Activity
     tab) neutralized — no accent bar, no icon circle; forced first-letter
     capitalization removed from usernames in both files (real bug — a
     deliberately-lowercase username was being capitalized against the
     user's own choice); "X-day streak" copy → "X day streak" throughout.
   - Removed the fire Lottie animation from the masthead trophy row
     entirely (was already behind an easy off-switch from a prior session;
     this time removed for real, including the unused Sun-icon fallback
     and its pulse animation).
5. `4d288d2` — **Leaderboard minimalist redesign** (`app/(tabs)/compete.tsx`
   `LeagueRow`): dropped the per-league colored card background, crown/
   medal icons for ranks 1-3, the colored circular XP progress ring around
   the level avatar, the solid-filled "YOU" pill, and the filled yellow
   zap icon next to points. Replaced with: a plain neutral bordered row
   (uniform for every rank), plain "#N" text for every position, a flat
   bordered level circle (no ring), an outline "YOU" pill (border + colored
   text, no fill), and an unfilled zap icon (then removed the zap icon
   entirely per follow-up). Card chrome itself went through several
   rounds live in this session — background removed, border removed, a
   divider added/thickened/thinned/removed — **current shipped state has
   no card background, no border, and no divider between rows**; spacing
   alone separates them. Removed the now-dead `leaderboardAccent` helper,
   `medalDisc` style, and the `backgroundColor` field from
   `lifetimeLeagueForLevel`.
6. `833f1b8` — **Community feed card redesign** (`CommunityWinFeedPost`,
   `CommunityWinsFeed`, `CommunityWinCheerersModal`):
   - Restructured each post into **header** (avatar/name/league/mission-
     name subtitle + a `CohortStreakPill` or a "Mini Mission" text tag,
     top-right) → **photo** (internals unchanged, gained a bottom-right
     "Day N" badge) → **footer** (caption, cheer button, timestamp) —
     deleted the old streak-banner and mini-mission-banner gradient strips
     entirely, folding their content into the header instead. First
     attempt overlaid the header on top of the photo (gradient scrim +
     absolute position); reverted per explicit correction to a proper
     non-overlapping header row above the photo.
   - Stripped color from what's left: league pill, handle, task-name row
     icon, Live Squad photo badge, the "View more" control, and the
     Community empty-state flame icon.
   - **Real bug found and fixed**: "View more"/"View less" could silently
     fail to render at all. It was nested `<Text>` inside a parent `<Text
     numberOfLines={2}>` — RN's line-clamping measures the whole run
     including nested children, so once the note was long enough to
     overflow, RN's own truncation clipped the nested "View more" span
     away along with the excess text. Fixed by manually pre-truncating the
     caption to a ~90-char, word-boundary-aware budget *before* render
     (`truncateForCollapse`) so the combined "truncated text + View more"
     content is short enough to never need clipping in the first place.
     Also fixed a second, unrelated bug in the same area: the expanded and
     collapsed states used two different text styles (15px vs 13px, no
     shared weight), so the caption visibly jumped in size on every
     expand/collapse — now one shared style, only `numberOfLines` toggles.
   - Card chrome: went through the same "elevated card" exploration as the
     Leaderboard (background/border/shadow split into outer-shadow +
     inner-clipped views to fix iOS shadow clipping; Android's `elevation`
     needing an opaque background to render at all; a shadow-vs-edge-to-
     edge-photo conflict where the shadow needed horizontal bleed room the
     full-bleed layout doesn't have) — **ultimately removed entirely** per
     explicit "let's try the flat version" experiment: no background step
     off the screen, no border, no shadow, no rounded corners, no divider.
     **The prior elevated-card implementation was deleted, not hidden** —
     if asked to "go back," it needs to be rebuilt from this conversation's
     history/this doc, not toggled back on.
   - Photo overlay badges (Live Squad / gallery-count / Day N): smaller,
     always white text+icon with a text shadow (was flipping to dark text
     in light app-theme, which is a self-defeating combo against a
     translucent *white* chip in that same mode — the actual bug the user
     was hitting), background switched from app-theme-conditional to a
     fixed dark translucent chip (these overlay a *photo*, not the app
     surface, so app light/dark mode was never the right signal) at ~40%
     opacity (up from an initial ~16-18% that was reported as "text
     getting lost").
   - Cheer icon/count switch from `indigo[400]` to `amber[500]` when
     cheered (a real theme-varying token, not a hardcoded constant).
   - `CommunityWinCheerersModal`: hero circle no longer a solid indigo-
     filled glow circle (now a plain outline, `surfaceElevated` +
     `border`); level pill neutralized (transparent + border, muted text);
     `@handle` set to `textPrimary` rather than muted — this modal has no
     separate display-name field, so the handle *is* the row's primary
     label here, unlike every other "handle" fix this session where it was
     genuinely secondary to a display name; loading spinner muted.

`npx tsc --noEmit` clean after every commit above.

**Not yet visually confirmed on-device** — same sandbox limitation as
every prior session (no tap-automation). A few spots specifically worth a
real look given how much iteration happened purely from static
reasoning/screenshots the user provided mid-session:
- The Community feed's flat card treatment (no chrome at all) — confirm it
  actually reads as separate posts at real scroll speed, not just in a
  single static screenshot.
- The photo overlay badges' new ~40% dark chip + white text + shadow combo
  against a genuinely bright, high-key photo (only tested against the one
  photo the user screenshotted).
- The cohort screen's level pill position (inline beside the eye icon) and
  the participant card's overall vertical rhythm after all the spacing
  passes.
- Android specifically for the Leaderboard/Community shadow work — the
  Android `elevation`-needs-opaque-background fix was reasoned through, not
  confirmed against a real Android shadow render.

**If starting a fresh chat from here**: read `agent.md`,
`docs/PROJECT_CONTEXT.md`, this file, and `app-architecture.md` in that
order, then this section. Still on `experiment/glass-redesign-v2`, not
`main`. No decision has been made about merging into `main`.

## Session Handoff (2026-08-06, end of session)

**State: clean, still on the experiment branch.** Everything from this
session is committed on `experiment/glass-redesign-v2` (six commits ahead
of the previous session's `aa224a3`, `main` itself untouched). Nothing
mid-flight, nothing uncommitted except the pre-existing untracked
`.mcp.json` and a `.claude/` directory that appeared locally (neither
created by this session's feature work, both deliberately left out of any
commit). `npx tsc --noEmit` and `git diff --check` clean as of the last
commit below. **No merge to `main`, no push, no OTA/build** — purely local
commits on the experiment branch, same as every prior session on this
branch.

Commits this session, oldest to newest (all on `experiment/glass-redesign-v2`):
1. `09c781f` — **foundational**: added a `900`-level step to `green`/`red`/
   `amber` in `theme.ts`'s `ColorPalette` (`green[900]` `#1B4332`,
   `red[900]` `#6B1E1E`, `amber[900]` `#6B4413`) — a deliberately dulled/
   muted counterpart to the existing vivid 500-level values, same value in
   both light and dark (unlike the 500-steps, which differ per theme).
   Set once in `darkColors`/`lightColors`, inherited automatically by both
   minimalist palettes since they already reference those base objects.
   Everything downstream in this session's other commits routes through
   these instead of hand-picking fresh hex values.
2. `d9dba3a` — **Home screen decolorization + FAB entrance**: removed the
   small indigo dot next to "Level {level}" in the XP bar (minimalist
   only); FAB fill darkened from raw `rp.accent` to a muted
   `FAB_ACCENT_MUTED` (`#4B4BB0`); notification badge dulled from
   `theme.colors.red[500]` to a dull maroon (`#8B4048`) in minimalist mode;
   removed the unread-bell buzz/wiggle + punch-scale animation loop
   entirely. New "forms and rises" FAB mount animation (starts small/low
   as if surfacing from the tab bar, springs up with an asymmetric squash/
   stretch overshoot) — required two real fixes to actually play on cold
   launch: retrigger on `isFocused` (Expo Router keeps tab screens mounted
   after first visit, so a mount-only effect only fires once ever), and
   gate the very first play behind `onAppReady()` (`src/lib/
   appReadySignal.ts`, the same fix already used for `HabitCard`'s
   entrance — `SplashGate` mounts the app under its splash overlay well
   before that overlay dismisses, so an ungated mount animation completes
   invisibly behind it on the very first launch).
3. `6f9e9e4` — **HabitCard/StreakProgressCard color + copy polish**:
   mission-type context pills shrunk further (icon 10→8, text 9→8);
   removed the redundant green "ACCOMPLISHED" label on mission cards
   (kept "REVIEW DUE", which is actionable); `MiniDayGrid`'s completed-dot
   color now follows report status (Failed → `red[900]`, Accomplished →
   `green[900]`, Pending → `amber[500]`) instead of being flat always.
   `StreakProgressCard`'s streak-tier colors (title/bar/day-count)
   replaced with the new muted tokens instead of raw `yellow[400]`/
   `amber[500]`/`red[500]`; fixed a missing space in `"74/75d"` →
   `"74/75 d"`.
4. `16fe084` — **Timer redesign**: minimalist-only mount animation — the
   fire icon holds fully visible for 5s (tuned up from an initial 750ms
   that felt instant and got cut before it registered), then collapses to
   width 0 so the digit display's `flex: 1` content reflows into the
   freed space, with the digits themselves popping ~8% larger via a
   staggered spring for a "the fire clears, then this is your time" beat.
   Removed the amber-tinted chip background behind the fire icon entirely
   (bare icon now); unified the card border to `theme.colors.border`
   regardless of manual/autopilot mode or light/dark; removed the
   "MISSION ACTIVE" label (kept "TIME LEFT"/"TIME'S UP", which do convey
   real state); removed the bordered elapsed/remaining toggle pill in
   favor of making the whole digit block itself the tap target (reusing
   the existing fade cross-fade) — a one-time "tap to see time left" hint
   was added then removed again per follow-up ("unnecessary"). A separate
   experimental vertical-digit-elongation treatment in
   `SplitFlapTimeDisplay.tsx` was tried and **fully reverted** after
   producing a visible banding artifact on iOS (clip-boundary rounding
   mismatch with the scaled roll column) — no net diff in that file.
5. `ab7263e` — **habit detail screen, the big one**:
   - Day grid: collapsed the completed-day marker from two concentric
     ring outlines ("double circle") into one solid circle filled with
     `theme.colors.green[900]`. Icon priority inside, stacked above a
     thin-weight (300) white day number: camera (photo) > hammer
     (repaired day, no photo) > message-square (text-only) > plain
     number. Fixed a real logic bug found while wiring this up: a
     repaired day's auto-generated repair note was wrongly triggering the
     text icon instead of the hammer (`isRepaired` no longer excludes a
     day just because it has *a* note — only an actual photo takes
     priority over it now). Removed the milestone amber shadow-glow
     (looked mismatched against the new uniform green fill; milestone
     treatment explicitly deferred — "will decide something for that
     later").
   - Current (in-progress) day: border changed from solid bright red to
     dashed `theme.colors.red[900]`; the partial-checklist progress
     indicator rewritten from a stroked ring-arc (SVG `Circle` +
     `strokeDasharray` trick) to an actual filled pie-slice `Path`
     sweeping clockwise from 12 o'clock, reordered so the day-number text
     paints on top of the fill instead of underneath it (the wedge
     originates at the circle's center, so it would otherwise cover the
     number). Day-number text set to white. Removed the pulsing scale
     animation on this circle entirely, and the now-unused `isSheetOpen`
     prop that only existed to gate it.
   - Reminder/Type card: removed the colored circular icon chips behind
     Bell/Globe/User (bare icons now, neutral/muted colors after a few
     rounds of "dull it more"); removed the "Locked"/"Set" pill's
     border+background (plain `green[900]` text now); toggle switch
     softened to a muted `SWITCH_ACCENT_MUTED` (`#4B4BB0`, matching the
     Home FAB); fixed the card's border/padding to be consistent between
     light and dark (was `isDark`-conditional; the padding mismatch
     turned out to be the card's drop-shadow being far more visible in
     light mode, not an actual layout difference — dropped the shadow).
   - **Real bug fixed**: reminder "Lock time" silently did nothing in
     Expo Go. Root cause: `expo-notifications` is deliberately skipped
     there (`shouldSkipRemotePushRegistration()`), which makes permission
     status resolve to `"unavailable"` with zero UI shown. Fixed in two
     passes — first added a toast explaining why; then, per user
     clarification, decoupled the actual lock-in (`reminderTimeLocal`/
     `reminderLocked`/`reminderEnabled` on the habit) from notification-
     permission success entirely, since that's a local one-time-choice
     data change, not something that should depend on push capability.
     The chosen time now always locks in; the toast only describes
     whether the real push alert will fire.
   - Also fixed the repair button to `theme.colors.amber[900]` (was raw
     `amber[500]`), and removed six confirmed-dead styles left over from
     the pre-`CompletedDayDot` design (`completedDayText`,
     `completedDayTextMilestone`, `milestoneHalo`, `badgeCore`,
     `badgeCoreMilestone`, `badgeAccent`).
6. `6f1d36a` — **memory-grid redesign ("Concept B")**: published a design
   audit as an artifact first (current-state review + two mockup
   directions — "Circle system" vs "Quiet hex" — against real minimalist
   references: Apple Photos Memories, Apple Journal, BeReal, Linear/Arc,
   with Duolingo/Peloton cited as the contrast case for why a hex badge
   shape reads as gamified rather than premium-minimal). User picked
   Concept B: keep the hex silhouette, strip everything else. Removed
   entirely: the whole wave cross-fade subsystem for stacked days
   (`HexFadeStack`, `useHexWaveScheduler`, all `HEX_FADE_*`/`HEX_WAVE_*`
   constants — a stacked day now shows a single static cover, same as any
   other tile); the giant serif quote-mark glyph; the 4-color kicker text
   system (squad-repair tiles now show a plain `Hammer` icon, no colored
   chip/label — swapped from an initial `ShieldCheck` per follow-up
   feedback that repaired-by-squad days should read as repair days); the
   amber task-count chip and its brief stack-dot replacement (removed
   rather than repositioned after the dot's fixed top-right position
   didn't account for the hex's pointed-top silhouette and rendered
   floating in the gap between tiles). Fixed the border/fill from
   bespoke `isDark`-conditional literals to `theme.colors.border`/
   `surfaceElevated`; the day label moved from a floating pill to plain
   caption text.

`npx tsc --noEmit` and `git diff --check` clean after every commit above.

**Not yet visually confirmed on-device** — same sandbox limitation as the
previous session (no tap-automation, no accessibility permissions for
AppleScript). Everything above was verified by `tsc`/reasoning through the
change, not by tapping through the app. Specifically worth a real look:
- The habit-detail day grid's full redesign (§5) — the single-circle
  layout, the pie-slice progress fill's exact visual proportions, and
  the white day-number text's legibility in **light mode specifically**
  before any progress fill exists (flagged live during the session: the
  current-day circle's background is `theme.colors.surface`, which is
  plain white in light mode, so white text there could be invisible
  until the green wedge appears).
- The Timer's fire-collapse-then-digit-grow animation (§4) — the timing
  and easing were tuned by description only.
- The memory-grid redesign (§6) — particularly the squad-repair hammer
  icon and the plain-caption day label over varied photo content.
- The Home FAB's entrance animation (§2) on an actual cold app launch
  (not a Fast Refresh reload, which doesn't replay the splash sequence).

**If starting a fresh chat from here**: read `agent.md`,
`docs/PROJECT_CONTEXT.md`, this file, and `app-architecture.md` in that
order, then this section. Still on `experiment/glass-redesign-v2`, not
`main` — check `git branch`/`git status` before assuming otherwise. No
decision has been made about merging into `main`.

## Session Handoff (2026-08-04, end of session)

**State: clean, but on an experiment branch, not `main`.** Everything from
this session is committed on `experiment/glass-redesign-v2` (branches off
`main` at `dd6c66c`, the tip of the previous session — six commits ahead,
`main` itself untouched). Nothing mid-flight, nothing uncommitted except the
pre-existing untracked `.mcp.json` (unrelated to any of this work, same as
every prior session). `npx tsc --noEmit` and `git diff --check` clean as of
the last commit below. **No merge to `main`, no push, and no OTA/build have
been done or requested this session** — purely local commits on the
experiment branch.

Commits this session, oldest to newest (all on `experiment/glass-redesign-v2`):
1. `1bec56c` — moved the dev-only OTA/force-update simulation controls from
   a global floating overlay (`DevUpdateSimPanel`, deleted) into a
   `__DEV__`-gated "DEV TOOLS" section on the Profile screen; gave
   `Timer.tsx`'s card a transparent border in light mode (MD3 tonal
   elevation, matching a pattern used elsewhere).
2. `9d979fc` — **Classic/Minimalist theme-pack system** (the session's
   foundational change): a new `themePack` preference alongside light/dark/
   system, persisted separately, selectable from a new Settings
   "APPEARANCE" section. `src/styles/redesignPalette.ts` (new) holds the
   minimalist palette (warm neutral ground, single indigo accent, flat/
   zero-shadow); `AppText` now resolves font family from `theme.fontFamily`
   at render time so every screen's text switches automatically; adds the
   Manrope/DM Sans font packages.
3. `155c558` — Home + Compete adopt the minimalist palette via a local `rp`
   value where automatic token-swapping isn't enough; both screens' main
   segmented tabs (plus Compete's Weeklies/Invites row) redesigned with a
   fluid `Animated.spring` sliding indicator instead of an instant per-tab
   background swap. `HabitCard.tsx` redesigned: fire-icon streak ring
   replaced by a small top-right circle-grid badge (GitHub-contributions
   style, blinks red on the day open for check-in, shows a muted hammer
   icon on a repair-eligible day instead of a separate button), mission-type
   tags now shown as small colorless pills above the title, action buttons
   moved below the title. `StreakProgressCard`'s pulsing fire/crown icon
   removed.
4. `1e9bd5b` — same sliding-tab-indicator pattern rolled out to every other
   segmented control in the app: Challenge detail (Streaks/Activity/
   Repairs), Mini Missions (Active/Queued/Completed/Failed), and the
   Missions/Minis segment + Public/Private toggle shared by
   `community-player/[id].tsx` and `my-journey.tsx`.
5. `eeefd7c` — habit detail screen (`app/habit/[id].tsx`) redesign: every
   day-grid cell (both the fixed grid and "Active Trail" variant) changed
   from rounded-square to circular; the old multi-arc `HabitGridBrandRing`
   replaced by `CompletedDayDot` (plain circle + day number, with a small
   camera/message-square corner badge only when that day has a photo/text
   memory — mirrors the cohort screen's own dot design instead of new
   glyphs); header icons (group/delete/info) recolored to neutral muted;
   mode pill recolored neutral and changed from all-caps to sentence case;
   the actionable repair banner simplified to a plain card with only the
   "Repair" button + hammer icon keeping the amber accent.
6. `0012252` — `StreakMemorySheet.tsx`'s create/habit flow restyled against
   a Claude Design mockup ("Memory Drawer.dc.html", read via the
   `claude_design` MCP from the same design project as the theme pack):
   indigo "DAY N" label, semantically-corrected notice icon (square/
   checkbox vs lock, matching what the copy actually says), rounder/roomier
   photo slot and note field, "Save moment" changed to a subtle transparent
   indigo tint instead of a solid fill. Also, as an explicitly experimental
   follow-up: `StreakMemoryGallery.tsx`'s stacked-moment hex tiles ("Your
   moments" honeycomb) no longer transition on independent random timers —
   a shared turn-based scheduler now runs them as one wave, most-recent-day
   first, each hex handing off to the next once its own cycle is 60% done
   (overlapping, not a strict relay) rather than every tile flickering on
   its own clock.

**Not yet visually confirmed on-device/simulator for several of these** —
this session's environment had no tap-automation available (no `idb`, no
accessibility permissions for AppleScript), so most changes were verified by
`npx tsc --noEmit` plus static screenshots of whatever screen happened to
already be open, not by interactively navigating into every changed screen.
Specifically still needing a real look:
- The `StreakMemorySheet` restyle (Memory Drawer mockup) — never actually
  opened during the session.
- The `StreakMemoryGallery` wave transition — never seen live; the overlap-
  fraction pacing (60%, fade timings 700/120/800ms) is a best-guess tuned
  purely from the user's verbal feedback ("faster", "slower", "overlap
  instead of relay"), not from watching it render.
- The sliding tab indicators on Challenge/Mini/community-player/my-journey
  (Phase 4/commit `1e9bd5b`) — same story, typechecked and reasoned through
  but not tapped into.
- Android has not been checked at all this session (iOS simulator only).

**If starting a fresh chat from here**: read `agent.md`,
`docs/PROJECT_CONTEXT.md`, this file, and `app-architecture.md` in that
order, then this section. Remember this work is on
`experiment/glass-redesign-v2`, not `main` — check `git branch` /
`git status` before assuming which branch you're on. No decision has been
made yet about whether/when to merge this into `main`; don't merge without
the user explicitly asking.

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
