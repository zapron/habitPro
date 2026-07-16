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

Important config:

- App config: `app.json`, `app.config.js`.
- EAS profiles: `eas.json`.
- Bundle id: `com.rakti.habitpro`.
- Android package: `com.rakti.habitpro`.
- Current app version at time of writing: `1.1.31`.
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

## Recent Product Decisions

### iOS Optimization

- The app is being actively tested on a physical iPhone 17.
- Target should also remain reasonable for iPhone 14 and newer.
- Safe area, image picker/photo flows, bottom tab behavior, scroll performance, and horizontal marker scrolling need iOS attention.

### Mission Detail UI

- Mission detail was made more compact.
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

## Build And Release Direction

Immediate iOS testing path:

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

Supabase:

```bash
npm run db:login
npm run db:link
npm run db:push
```

## How To Resume In A New Chat

Tell the new agent:

> Read `agent.md`, `docs/PROJECT_CONTEXT.md`, `docs/CURRENT_WORK.md`, and `app-architecture.md` before making changes. Continue from the current working tree. Do not revert uncommitted user changes.
