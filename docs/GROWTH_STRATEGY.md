# Growth Strategy — 100 → 250 (2 months) → 1000 (6 months)

Started: 2026-09-20. Owner: Raktim. Budget: $0 (organic only). Android live on
Play Store (`com.rakti.habitpro`, real listing). iOS is TestFlight-only.
No dedicated social accounts yet for the app (personal accounts only).

## Ground truth this plan is built on (audited, not assumed)

- **habitPro-web** (`/habitPro-web`): decent bones already — solid OG/Twitter
  metadata, working store badges, FAQ, pricing tiers, feature grid. Gaps:
  no `sitemap.xml`/`robots.txt`, **no analytics at all** (grepped the repo,
  nothing — no GA/Vercel Analytics/PostHog), so today there is no way to see
  what's working.
- **Main app**: invites (Live Squad, challenges) are 100% in-app, user-to-user
  — grepped for referral/share/deep-link code, found none. A non-user cannot
  be invited by a HabitPro user today; there is no shareable link that
  survives someone not having the app installed. For a product whose entire
  pitch is "never do it alone," this is the single biggest gap between the
  product's real differentiator and its growth loop.
- **iOS**: TestFlight public links support up to 10,000 testers — this is a
  real distribution channel, not just a beta gate. Worth treating it that way
  instead of writing iOS off as "not launched."
- **README flag resolved**: the "Android launch placeholder" warning in
  `habitPro-web/README.md` is stale — `PLAY_STORE_URL` already points to the
  real `com.rakti.habitpro` listing.

## What this plan will NOT do

No mass automated messaging, fake engagement, bot signups, or anything that
reads as forcing installs — that risks Play/App Store policy strikes and
spam-law exposure (GDPR/CAN-SPAM), and would burn the account this app needs
to survive on. Everything below is either a real product change, a free
organic channel, or content prep — all of it requires a human (Raktim) to
actually post, submit, or approve, since that needs logged-in accounts I
don't have.

## Phase 1 (weeks 1–2): fix the loop before pushing traffic into it

Sending people to a funnel with no bottom is wasted effort. Ship these first:

1. **Shareable invite that works on non-users.** A Live Squad / challenge
   invite link that deep-links an installed user straight in, and falls back
   to the Play Store / TestFlight link (with the invite context preserved
   post-install if feasible) for someone who doesn't have the app yet. This
   is the highest-leverage single change — it turns the app's existing core
   mechanic (you need other people) into an acquisition channel for free.
2. **Post-completion share card.** After a finished mission/streak milestone,
   offer a shareable image (WhatsApp/Instagram-story shaped) — users already
   take streak photos, this just makes them exportable.
3. **Store review prompt** at a well-earned moment (first completed mini
   mission, or a streak milestone) — legitimate ASO lift, native
   `StoreReview`/in-app-review APIs only, no incentivized reviews.
4. **Marketing site**: add `sitemap.xml` + `robots.txt`, wire up free
   analytics (Vercel Web Analytics, free on the Hobby tier) so Phase 2+ has
   real numbers instead of guesses.
5. **Rewrite the Play Store listing copy** for keywords real searchers use
   ("accountability partner app", "habit tracker with friends", "streak
   tracker squad") — free, and the store's own ranking algorithm rewards it.
6. Set up the app's own dedicated handles (Instagram + X to start — TikTok/
   Reddit as Phase 2 needs them) so content isn't mixed into your personal
   accounts.

## Phase 2 (weeks 3–8): content + community, zero spend

- **Reddit**: genuine participation (not link-drops) in r/getdisciplined,
  r/DecidingToBeBetter, r/productivity, r/selfimprovement — "built this after
  X" posts do well in these communities specifically because they're
  accountability-minded already.
- **Short-form video** (Reels/TikTok, 15–30s): the demo-able hook is Live
  Squad's shared-pressure mechanic, not the checklist part — that's the
  differentiator versus Habitica/Streaks/every other habit app. I can script
  and storyboard these; you record/post.
- **Micro-creator seeding**: 10–20 DMs to small (1k–20k follower)
  productivity/accountability creators offering early access + a squad to do
  together on camera. $0, but needs a real person sending it.
- **Direct ask to your existing ~100 users**: a single well-placed in-app or
  personal message asking them to pull 1–2 friends into a squad — highest
  intent, lowest effort audience you have, and directly exercises the Phase 1
  invite loop.
- Recheck analytics every 2 weeks, cut what's not converting, double down on
  what is.

## Phase 3 (months 3–6): compound toward 1000

Scale whichever Phase 2 channel actually converted (don't guess in advance
which one that'll be — the whole point of Phase 1's analytics work is to let
the data decide). Revisit subscription pricing only after this stage, per
your original sequencing.

## Division of labor

- **I can do**: the Phase 1 code (invite links, share card, review prompt,
  sitemap/analytics), weekly content scripts/copy/ASO variants, reading
  analytics once connected and summarizing what's working, and — if wanted —
  a scheduled weekly job that drafts that week's post batch for you to review.
- **You have to do**: anything that touches a login — posting to social,
  submitting store updates, approving TestFlight builds. That's a hard
  platform constraint, not a corner being cut.

## Honest expectation-setting

250 in 2 months from $0 organic is plausible for a niche accountability app
with a genuine hook, but organic growth is lumpy — a Reddit post can spike 40
signups in a day and then nothing for a week. Treat the milestones as
checkpoints to reassess, not a guaranteed slope.
