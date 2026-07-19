# HabitPro Current Work

Last updated: 2026-07-19.

This file captures the current working state so future chats do not need the full conversation.

## Current Worktree State

Recent local commits:

- `11eb8f0 feat: add NetworkRequiredGate component and integrate it into layout for internet connectivity checks`
- `60b53f2 feat: add performance investigation documentation and optimize logging practices`
- `eb9dcbd feat: enhance finish section with mode tags for Timer Check-In and Manual Finish`
- `460f366 chore: update version to 1.1.32 in app.json, package.json, and package-lock.json`
- `4acde02 docs: record marker regression recovery`
- `c41cc69 db: add marker progress repair migrations`
- `61e035c fix: repair mission marker date mapping`

Uncommitted at handoff:

- `.codex/skills/habitpro-session-logger/SKILL.md` was updated so end-of-session logging audits all Markdown files and updates affected docs.
- This handoff update touches `docs/CURRENT_WORK.md`, `docs/WORK_HISTORY.md`, `docs/PROJECT_CONTEXT.md`, `docs/FUTURE_AGENT_HANDOFF.md`, `docs/IOS_BUILD_PLAYBOOK.md`, and `app-architecture.md`.

Release/build boundaries:

- Do not commit, push, apply Supabase migrations, run EAS builds/updates, publish OTA, or deploy unless the user explicitly asks for that exact action.
- User reported they triggered a production EAS Android build themselves from the terminal.
- Codex attempted to guide a local APK build, started `./gradlew assembleRelease`, then stopped it when the user clarified they wanted guidance only. `git status --short` was clean immediately after stopping.
- Local APK guidance: `cd android && JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" ./gradlew assembleRelease`; output path should be `android/app/build/outputs/apk/release/app-release.apk`.

Current app version/build:

- Expo/package version: `1.1.32`
- Runtime version: `1.1.32`
- iOS build number: `33`
- Android versionCode: `33`

## Latest Product / Release Prep Changes

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

- Production Android build should include version/runtime `1.1.32` and Android versionCode `33`.
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
