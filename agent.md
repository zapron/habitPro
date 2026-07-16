## Cursor agent instructions (habitPro)

- On new sessions, read `docs/PROJECT_CONTEXT.md` and `docs/CURRENT_WORK.md` after this file.
- Do **not** create git commits unless the user explicitly approves first.
- When proposing a commit, show what will be included (staged diff/stat) and ask for approval.
- Do **not** push to remote unless the user explicitly asks.

## HabitPro UI preferences

- Do **not** use the `Sparkles` / magic-wand style icon in HabitPro UI. It gives the product an AI-first vibe; prefer habit, progress, mission, proof, or community metaphors instead.

## Production version bumps

When the user asks to bump the app version for a production build, update all release-version sources together:

- `app.json`: Expo `version` and Android `android.versionCode`
- `package.json`: package `version`
- `package-lock.json`: root package `version` and `packages[""].version`
- `android/app/build.gradle`: native Android `versionCode` and `versionName`

The `android/` folder may be ignored by Git, but still check and update `android/app/build.gradle` because local/native production builds can read from it.

