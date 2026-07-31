## Cursor agent instructions (habitPro)

- On new sessions, read `docs/PROJECT_CONTEXT.md` and `docs/CURRENT_WORK.md` after this file.
- For longer sessions, also scan `docs/WORK_HISTORY.md` for the latest dated handoff.
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

When the user asks to bump the app version for a production build, update all release-version sources together:

- `app.json`: Expo `version` and Android `android.versionCode`
- `package.json`: package `version`
- `package-lock.json`: root package `version` and `packages[""].version`
- `android/app/build.gradle`: native Android `versionCode` and `versionName`

The `android/` folder may be ignored by Git, but still check and update `android/app/build.gradle` because local/native production builds can read from it.
