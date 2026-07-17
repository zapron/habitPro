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

## Tooling

Install on Mac:

- Node compatible with the current project.
- Xcode and iOS Simulator if doing local iOS runs.
- EAS CLI through `npx eas ...` or global install if preferred.
- Supabase CLI if managing migrations.

Login:

```bash
eas login
npx supabase login
```

## Common Commands

```bash
npx tsc --noEmit
npx expo start -c
npm run build:ios:preview
npm run build:ios
npm run update:preview
npm run update:production
```

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
