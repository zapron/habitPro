# HabitPro Mac Setup Handoff

Use this when moving development from Windows to Mac. Keep secrets out of Git.

## Clone And Install

```bash
git clone <repo-url>
cd habitPro
npm install
npx tsc --noEmit
```

## Required Local Files / Secrets

Recreate or copy privately. Do not commit these:

- `.env`
- Supabase URL / anon key
- RevenueCat Android and iOS public SDK keys
- EAS/Expo login session
- Supabase CLI login
- Apple Developer / App Store Connect access
- Any private certs, provisioning profiles, `.p8`, `.p12`, `.mobileprovision`

Firebase Android client config:

- `google-services.json` exists in the repo now. Treat it as Firebase client config, not a server secret.
- Never commit Firebase Admin/service-account JSON files.

RevenueCat caution:

- For Android release/Play Store builds, `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY` must be the Play Store public SDK key that starts with `goog_`.
- Do not use a RevenueCat Test Store `test_...` key for Android release. The app intentionally treats that as unconfigured in release builds.
- Production OTA scripts use EAS `--environment production`; keep that flag so local Mac `.env` values cannot override production billing config.

## Tooling

Install on Mac:

- Node compatible with the current project.
- Xcode and iOS Simulator if doing local iOS runs.
- EAS CLI through `npx eas ...` or global install if preferred.
- Supabase CLI if managing migrations — always through `npx supabase@2` (v3 can't read our `config.toml`).
- Docker Desktop for the local Supabase stack.
- Android Studio with an emulator, for local Android runs.
- Maestro (UI test flows in `.maestro/`), installed outside the project: `curl -fsSL "https://get.maestro.mobile.dev" | bash`.
- Xcode 27 note: there is no Simulator.app (use DeviceHub), `npx expo run:ios` fails, and its builds crash on iOS 27 simulators — use an iOS 26 simulator. `npm run dev:local` handles all of this.

Login:

```bash
eas login
npx supabase@2 login
```

## Common Commands

```bash
npx tsc --noEmit
npm run dev:local          # local Supabase + iOS Simulator + Android Emulator, both apps opened
npm run dev:local -- --rebuild-ios   # after a native change (also --rebuild-android)
npx expo start -c
npm run build:ios:preview
npm run build:ios
npm run update:preview
npm run update:production
```

`npm run update:production` maps to `eas update --channel production --environment production`.

## Resume Context

Start each new Codex session by asking the agent to read:

1. `agent.md`
2. `docs/PROJECT_CONTEXT.md`
3. `docs/CURRENT_WORK.md`
4. `docs/WORK_HISTORY.md`
5. `app-architecture.md`

For end-of-session logging, use:

- `.codex/skills/habitpro-session-logger/SKILL.md`

If the skill is not auto-discovered on Mac, copy or symlink `.codex/skills/habitpro-session-logger` into `~/.codex/skills/`.
