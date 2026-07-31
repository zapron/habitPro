# HabitPro Project Context

Use this file as the first stop when resuming work on HabitPro in a new chat.
It is intentionally compact. For deeper details, read `app-architecture.md`.

## What HabitPro Is

HabitPro is a React Native / Expo app for personal development missions:

- Main missions / streak challenges.
- Mini missions with time-boxed timers.
- Community feed and public proof moments.
- Group missions, Live Squad mini missions, invites, nudges, repairs, XP, and premium/community access.

The product direction is mission-first, dark-mode-friendly, polished on iPhone and Android, and optimized for real daily use rather than a marketing-style interface.

## Current Stack

- Expo SDK 54, React Native 0.81, React 19.
- Expo Router.
- Zustand local store in `src/store/habitStore.ts`.
- Supabase auth, remote sync, RPCs, storage, edge functions, and migrations.
- EAS Build / Update.
- RevenueCat for subscriptions.
- `expo-notifications`, `expo-image-picker`, `expo-secure-store`, `expo-updates`.
- `@react-native-community/netinfo` for the app-level internet-required gate.

Important config:

- App config: `app.json`, `app.config.js`.
- EAS profiles: `eas.json`.
- Bundle id: `com.rakti.habitpro`.
- Android package: `com.rakti.habitpro`.
- Current app version at time of writing: `1.1.34`.
- Runtime version is pinned manually in `app.json`.

## Must-Read Files

Read these in this order for future work:

1. `agent.md`
2. `docs/PROJECT_CONTEXT.md`
3. `docs/CURRENT_WORK.md`
4. `app-architecture.md`
5. Feature-specific files from the request.

## Developer Preferences

- Do not create git commits unless the user explicitly asks.
- If the user asks for phased commits, show staged scope clearly.
- Do not push unless explicitly asked.
- Keep UI polished and compact, especially on iPhone.
- Avoid AI/magic styling and avoid the `Sparkles` / magic-wand style icon.
- Avoid em dash in user-facing text when the user asks for concise copy.
- Prefer direct implementation once the request is clear.
- Colors go through `src/styles/theme.ts` — an existing token plus `withAlpha(hex, alphaPercent)` for tints, never a hand-typed `isDark ? "rgba(...)" : "rgba(...)"` literal. See "Color Token Sweep" below.

## Recent Product Decisions

### Daily Wisdom Launch

- Daily Wisdom is no longer a mission detail card.
- `src/components/AnimatedSplashOverlay.tsx` now shows daily wisdom under the habitPro launch lockup.
- `src/components/SplashGate.tsx` owns launch timing and waits for signed-in startup readiness when available.
- `src/components/AppLaunchNotificationNudge.tsx` waits longer so notification permission prompts do not collide with launch wisdom.
- The user clarified the Android performance issue begins after Home appears, not in splash itself.

### iOS Optimization

- The app is being actively tested on a physical iPhone 17.
- Target should also remain reasonable for iPhone 14 and newer.
- Safe area, image picker/photo flows, bottom tab behavior, scroll performance, and horizontal marker scrolling need iOS attention.
- Sign in with Apple is now enabled for the iOS bundle and wired through Supabase native Apple auth.
- RevenueCat has an App Store app for `com.rakti.habitpro`; monthly/yearly App Store products are attached to the same `habitpro_community` entitlement and default offering packages as Android.

### Mission Detail UI

- Mission detail was made more compact.
- The old `QuoteCard` was removed from mission detail to keep the screen focused on check-in/progress.
- Daily grid now shows only current active day and completed days in reverse-style progress rather than rendering all locked future days.
- Moments/memories were moved above the grid so users see proof before progress markers.
- Mission type and daily reminder controls were compressed into a compact card, with iOS-specific layout fixes.
- Moments now use a two-row honeycomb/hex strip rather than side-by-side rectangular cards.
- The honeycomb strip must remain virtualized. It currently uses horizontal `FlashList` columns in `src/components/StreakMemoryGallery.tsx`.
- Moment lightbox is an aspect-aware photo card with note/meta below it, intended to avoid black bars and feel like a scrapbook/Instax card.
- The honeycomb build-in animation uses React Native `Animated`, not Reanimated, because Expo Go hit a Worklets native/JS version mismatch when Reanimated was imported in the gallery.
- Long mission detail performance is sensitive on Android. Active Trail batching, non-blocking decorative animations (`isInteraction: false`), and decoupling moments from full marker rendering are intentional.

### Mini Missions

- Timer Check-In is now the humane default direction.
- Manual Finish remains the stricter race-style option.
- Creation UI labels use straight mode pills: `SOLO` for Timer Check-In and `SOLO / COMMUNITY` for Manual Finish.
- Timer Check-In lets the timer end and then asks the user to choose Complete, Retry, or Fail.
- Timer Check-In is solo-only for now.
- Timer Check-In hides Live Squad invite card and reserve fuel.
- Manual Finish mini missions can still use reserve fuel and Live Squad.
- Start controls on mini mission create are now direct actions:
  - `Let's Go Now` creates and starts.
  - `Start Later` creates a waiting mini.
  - The old extra `Create Mini Mission` button was removed.

### Live Squad Timer Check-In

Live Squad Timer Check-In has not been implemented yet.
It needs a shared participant state such as `awaiting_check_in`.

Recommended V1:

- Invitee accepts and starts timer.
- Timer ends.
- Participant becomes `Awaiting Check-In`.
- Participant chooses Complete or Fail.
- No reserve fuel.
- No speed ranking for Timer Check-In squads.

Do not treat this as a tiny UI toggle. It touches local state, Supabase RPCs, Live Squad participant statuses, notifications, and board UI.

### Cohort Timeline

- Group/cohort participant dots now show current/reached day first and walk backward to day 1.
- Future/unreached dots are omitted.
- The row still uses lightweight memory markers and fetches full memory detail only on tap.

### Android Performance Investigation

- S24 Ultra previously showed Home jank after splash and delayed touches in mission detail.
- Performance work added Android long-mission Home ring fallback, mission-detail date-map reuse, Active Trail batching, and virtualized honeycomb moments.
- Temporary performance logs have been removed for production readiness.
- For future time/performance optimization, use `.codex/skills/habitpro-performance-investigation/SKILL.md`: add targeted timer logs, use the measurements, then remove logs before handoff.

### Internet Required

- `src/components/NetworkRequiredGate.tsx` blocks app usage when NetInfo reports no internet.
- It is mounted globally in `app/_layout.tsx`.
- The gate uses a full-screen `No internet connection` overlay and a `Try Again` action.
- iOS can briefly report stale reachability while returning from background; the gate refreshes NetInfo on foreground and delays confirmed offline display to avoid false blockers.
- Because NetInfo is a native dependency, this requires a native build and cannot be shipped by OTA alone.

### Live Mini iOS Polish

- Live Mini invite sheet content is keyboard-scrollable so iPhone keyboards do not cover username search/results.
- Live Mini board cards use Supabase render thumbnails for inline memory images; tap-to-view still opens the full image.

### Multi-Task Checklist Missions / Community Catalog (main + mini, shipped)

- `docs/CATALOG_ARCHITECTURE.md` (main missions) and
  `docs/MINI_MISSION_CATALOG_ARCHITECTURE.md` (mini missions/Live Squad) are the
  single sources of truth for design decisions — read them first, don't
  reconstruct from code alone.
- A mission (main or mini) can optionally have a task checklist (e.g. "get up
  early," "eat healthy," "gym"); each task logs its own note+photo. Both the
  main-mission and mini-mission versions are fully built, migrated, and
  confirmed working end-to-end by the user on iOS and Android, including Live
  Squad checklist propagation to invited members and a task-checklist preview
  before accepting an invite.
- **Revised 2026-07-25** — day/mission completion is no longer implied by the
  first task logged. See "Mark Day Complete" below; this is the current
  behavior, not the original Phase-2 decision documented in
  `CATALOG_ARCHITECTURE.md`'s earlier sections (that doc has an addendum at the
  bottom recording the change).
- Still deferred, not forgotten: the Journey grid's "×N" photo-count badge, and
  a dedicated visual design pass beyond what's shipped so far (see "Home Screen
  Premium UI Pass" below, which is a separate, later initiative).
- One real bug worth knowing about generally, not just for this feature: the
  habit/mini push RPC (`rpc_sync_dirty_state`) parses an explicit column list
  and silently drops any field not named in it. See `app-architecture.md` Sync
  Architecture section before adding any new synced field to `habits` or
  `mini_missions`.
- Durable patterns from this feature's build, documented in full in
  `app-architecture.md` Known Caution Points: (1) iOS embeds a wide-gamut ICC
  color profile in uploaded photos that some Android decoders can't render —
  stripped at upload time in `streakMemoryStorage.ts`; (2) on Android, a
  `<Modal>`'s content can silently fail to render if it's swapped in *after*
  the Modal is already open — never open the Modal until data is ready, don't
  force a remount via `key`; (3) changing what a data field *means* (e.g. "a
  memory entry exists" no longer implying "the day is complete") requires
  auditing every reader of the old meaning, not just the writer — this exact
  gap re-broke the Mark Day Complete redesign below via three unrelated
  pre-existing self-heal call sites; (4) a ref/array sized to a prop that can
  grow while a component stays mounted must be resized synchronously in the
  render body, not inside a `useEffect` (effects run after render, so the
  in-between render can index a too-short array and crash).

### Mark Day Complete (Checklist Notification-Timing Redesign, shipped 2026-07-25)

- Checklist main missions only. Logging a task no longer completes the day or
  fires the squad notification by itself — tasks stay editable (re-opening a
  logged-but-unlocked task pre-fills it) until the user taps the explicit
  **Mark Day Complete** button in `ChecklistDaySheet`, or the quick one-tap
  "MARK COMPLETE" action on the Home mission card (`HabitCard.tsx`). That
  action is the only thing that now advances streak/XP and fires the squad
  notification. Full design rationale and negotiation history in
  `docs/CURRENT_WORK.md`; no backend/DB changes were needed (confirmed by
  reading `tg_habits_notify_challenge_squad_checkin`,
  `rpc_challenge_memory_detail_v1`, and `process-streak-reminders` in full —
  all react purely to `completed_dates`, which is unaffected by *when* that
  array gets written).
- A real regression surfaced during on-device testing right after this shipped
  (see the caution-point cross-reference above) — already found and fixed, not
  an open issue.

### Home Screen Premium UI Pass (in progress, started 2026-07-26)

- User wants a full visual overhaul, screen by screen, toward a more premium
  finish while keeping the app's existing flavor — iterative and turn-by-turn
  right now, not yet formalized into `app-architecture.md` (user said they'll
  ask for that when ready).
- Shipped so far (Home tab): a static glass top-highlight (ported from the
  mission detail screen's Timer/StreakProgressCard cards) on every Home card,
  and a spring "stack up from below" mount animation for mission cards with a
  per-card stagger. Also shipped, separately, on the mission detail screen's
  honeycomb memory gallery: living-memory hex animations (see
  `docs/CURRENT_WORK.md` for the fan-stack → spring-squish → wave-timing
  iteration history) — arguably part of the same "make it feel alive" design
  direction, done slightly earlier the same day.
- Full detail, including a bug where the entrance animation played invisibly
  behind the splash screen on cold start (fixed via `src/lib/appReadySignal.ts`),
  in `docs/CURRENT_WORK.md`'s top section.

### Main Mission Visibility Sync

- Main mission Solo/Public visibility is sent by the client and must be persisted by `rpc_sync_dirty_state`.
- Migration `supabase/migrations/20260720110000_fix_habit_visibility_sync_rpc.sql` restores habit `visibility` writes in that RPC.
- User reported this migration has been applied; retest toggling a main mission to Public, leaving, and reopening.

### UI/UX Audit Pass + Color Token Sweep (shipped 2026-07-31)

- Started from an open-ended design-lead-style audit of the whole app; produced
  a written punch list and implemented its low-effort items — XP-gain badge on
  completion (`src/components/XpGainBadge.tsx`), leaderboard medal icons +
  weekly countdown, nudge send haptic/flourish, a pulsing tab-bar invite dot
  (`PulsingBorder` generalized with a `size` prop), a Quick Complete
  confirmation dialog for checklist missions, and a real iOS-only bug fix
  (`CohortNudgeChips.tsx`'s chip row was unscrollable on iOS because of a
  `canCancelContentTouches={false}` ScrollView prop — removed). Shipped as a
  production OTA, commit `7322dec`, runtime `1.1.35`.
- Followed by a full **color token sweep**: ~289 hand-typed
  `isDark ? "rgba(...)" : "rgba(...)"` color decisions found across the app,
  several silently off-palette. Added `withAlpha(hex, alphaPercent)` plus two
  new semantic tokens (`theme.colors.scrim`, `theme.colors.sheen`) to
  `src/styles/theme.ts`, then converted the confidently-matched instances
  across 47 files. Caught four real latent bugs (components referencing
  `theme.colors.*` with no `theme` in scope) along the way. Full detail in
  `docs/CURRENT_WORK.md`; commits `9226085`, `0783dfe`, `1a1df99`, `587461d`.
- **Not merged**: an experimental "Apple Glass" Home revamp
  (`GlassPanel.tsx`, `HomeGlassBackdrop.tsx` — real `BlurView` frosted glass,
  animated ambient background) lives entirely on branch
  `experiment/glass-home`, built as an explicitly throwaway/revertible
  exploration at the user's request. `main` never had it merged in. If
  revisiting: Android's `BlurView` renders as a flat tint with no actual blur
  unless `experimentalBlurMethod` is set, which Expo's own docs flag as
  performance/graphics-risky.

## Build And Release Direction

Current iOS testing status:

- First iOS TestFlight build was submitted for `com.rakti.habitpro`, version `1.1.32`, build `33`.
- App Store Connect app id is `6792545017`.
- Internal TestFlight testing is enabled for `Team (Expo)`.
- Apple Push Notifications key was created and Expo push tester delivery worked on the iPhone build.

Immediate iOS testing path for future builds:

1. Apple Developer Program enrollment.
2. EAS env setup.
3. Ad hoc internal iOS build with `npm run build:ios:preview`.
4. Install on iPhone.
5. Test before TestFlight.

Proper beta path:

1. App Store Connect app record.
2. Production iOS build with `npm run build:ios`.
3. Submit with `eas submit --platform ios`.
4. Internal TestFlight testing.

Because Google sign-in exists, App Store Review will likely require Sign in with Apple before production release.

## Common Commands

```bash
npx tsc --noEmit
npm run build:ios:preview
npm run build:ios
npm run build:apk
npm run build:aab
npm run update:preview
npm run update:production
```

OTA scripts include EAS environments:

- `npm run update:preview` uses `--environment preview`.
- `npm run update:production` uses `--environment production`.
- This prevents local `.env` values, such as a Mac RevenueCat `test_...` key, from leaking into production OTA bundles.

Supabase:

```bash
npm run db:login
npm run db:link
npm run db:push
```

## How To Resume In A New Chat

Tell the new agent:

> Read `agent.md`, `docs/PROJECT_CONTEXT.md`, `docs/CURRENT_WORK.md`, and `app-architecture.md` before making changes. Continue from the current working tree. Do not revert uncommitted user changes.

For longer work sessions, also read `docs/WORK_HISTORY.md` and use `.codex/skills/habitpro-session-logger/SKILL.md` before ending the session.
