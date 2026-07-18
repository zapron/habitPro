---
name: habitpro-deployment-guard
description: Enforce HabitPro deployment safety. Use before any HabitPro git commit, git push, Supabase migration push, EAS build, EAS update/OTA publish, production deploy, preview deploy, or release-channel action.
---

# HabitPro Deployment Guard

## Rule

Never commit, push, apply migrations, run builds, publish OTA updates, or deploy anything for HabitPro unless the user's latest relevant message explicitly asks for that exact action.

## Required Behavior

- Treat prior broad permission as expired when the user later says not to commit, push, migrate, build, OTA, or deploy.
- Do not infer permission from phrases like "fix it", "ready", "continue", "do necessary things", or "make it live".
- If a deployment action would help but was not explicitly requested, stop after local validation and explain the exact command the user can ask you to run.
- Before any allowed deployment action, state what will be run and what environment/channel it targets.
- If an attempted deployment command is interrupted or denied, immediately check `git status --short` and report whether anything was staged or changed.

## Protected Actions

- `git add`, `git commit`, `git push`, tag creation, branch publication.
- `npx supabase db push`, migration repair against remote databases, or edge-function deploys.
- `eas build`, `eas update`, `npm run update:*`, `npm run build:*`, app store submission, or release promotion.
- Any command that changes production, preview, remote database, remote hosting, or release-channel state.
