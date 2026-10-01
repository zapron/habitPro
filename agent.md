## Cursor agent instructions (habitPro)

- On new sessions, read `docs/PROJECT_CONTEXT.md` and `docs/CURRENT_WORK.md` after this file.
- For longer sessions, also scan `docs/WORK_HISTORY.md` for the latest dated handoff.
- Before writing or applying any Supabase migration, read `pre_migration.md`. The short version: never run `npm run db:push`, the `apply_migration` MCP tool, or any writing/`execute_sql` call against production yourself — write the migration, test it locally (`npm run db:reset`), then tell the user to run `npm run db:push` themselves. Read-only `select` queries against production for diagnosis are fine.
- Do **not** create git commits unless the user explicitly approves first.
- When proposing a commit, show what will be included (staged diff/stat) and ask for approval.
- Do **not** push to remote unless the user explicitly asks.
- At the end of substantial development sessions, update `docs/CURRENT_WORK.md` and append to `docs/WORK_HISTORY.md`. Use the repo skill in `.codex/skills/habitpro-session-logger/SKILL.md` as the checklist.

## HabitPro UI preferences

- Do **not** use the `Sparkles` / magic-wand style icon in HabitPro UI. It gives the product an AI-first vibe; prefer habit, progress, mission, proof, or community metaphors instead.
- Do **not** hand-type a color as `isDark ? "rgba(...)" : "rgba(...)"`. Route it through `src/styles/theme.ts`: use an existing token (`theme.colors.indigo[500]`, `theme.colors.scrim`, etc.) and `withAlpha(hex, alphaPercent)` for any tinted/translucent variant. A repo-wide sweep (2026-07-31, see `docs/CURRENT_WORK.md`) found ~289 hand-typed instances, several silently off-palette (stock Tailwind hex instead of this app's actual token) — this is how that keeps happening. If a component receives `isDark` as a prop instead of calling `useTheme()` itself, import `darkTheme`/`lightTheme` directly from `theme.ts` rather than assuming a `theme` object is in scope — found and fixed this exact missing-scope bug four times in one session.

## Performance / time optimization

- When optimizing slow screens, timers, check-in timing, navigation latency, or perceived wait time, first add targeted temporary timer logs around the suspected path and use the timings to choose the fix.
- Remove temporary `console.log` / `console.info` instrumentation before handing back production-ready code, unless the user explicitly asks to keep a debug logger.

## Production version bumps

**Use `npm run version:sync -- --version X.Y.Z [--android-code N] [--ios-build N] [--no-runtime]`
instead of hand-editing these files.** Written 2026-10-01 after the manual checklist below
was followed *and still* drifted twice in one session: `android/app/build.gradle` was missed
after an app.json bump (that file is gitignored — `git diff` never flags it as a reminder),
and separately `package.json`/`package-lock.json` were left stale after a later bump that only
touched `app.json` + Gradle. The script updates all of these atomically from one invocation —
see the comment block at the top of `scripts/sync-app-version.mjs` for full usage, including
the Android-only (`--android-code` alone, e.g. a native-asset fix needing a new Play Console
upload with no semver change) and decoupled (`--no-runtime`, bump the semver label without
moving `runtimeVersion` — use when only one platform needs a new native build and the other
shouldn't be cut off from OTA updates on its current runtime) cases.

What it keeps in sync, for reference (manual fallback only if the script can't run):

- `app.json`: Expo `version`, `runtimeVersion`, `ios.buildNumber`, `android.versionCode`
- `package.json`: package `version`
- `package-lock.json`: root package `version` and `packages[""].version`
- `android/app/build.gradle`: native Android `versionCode` and `versionName`

The `android/` folder is ignored by Git, but `.easignore` deliberately still uploads it to EAS
for Android cloud builds — so `android/app/build.gradle` (and any other Android-native asset,
e.g. launcher icons under `android/app/src/main/res/mipmap-*`) must actually be correct on
disk, not just correct in `app.json`, or an Android build silently ships stale content with
nothing in `git diff` to catch it.
