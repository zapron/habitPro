# iOS Build Playbook

Use this when preparing HabitPro for iPhone testing or TestFlight.

## Current Project Facts

- Expo SDK 54.
- EAS project id: `cdfc2b93-f246-47b6-94ca-6a816ffda876`.
- iOS bundle id: `com.rakti.habitpro`.
- iOS build number in `app.json`: `35`.
- EAS profiles: `development`, `preview`, `production`.
- First TestFlight build uploaded: version `1.1.32`, build `33`, App Store Connect app id `6792545017`.
- Internal TestFlight group `Team (Expo)` was created and the user was invited.
- Apple Push Notifications key was created and assigned to `com.rakti.habitpro`.
- Sign in with Apple is enabled for the iOS bundle and wired in the login UI.
- RevenueCat App Store products `monthly` and `yearly` are attached to entitlement `habitpro_community` and default offering packages `$rc_monthly` / `$rc_annual`.

The `development` profile currently has `ios.simulator: true`, so it is for simulator builds.
For a physical iPhone test, use `preview` or change/add a physical-device development profile.

## Before Building

Validate code:

```bash
npx tsc --noEmit
```

Apply Supabase migrations if testing features that changed the database:

```bash
npm run db:push
```

Set EAS env vars because `.env` is ignored by `.easignore`.

Required for sync:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`

Recommended for iOS billing:

- `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY`

Recommended for legal/site links:

- `EXPO_PUBLIC_HABITPRO_WEB_URL`

The project should add `environment` fields in `eas.json` if using named EAS environments.

## Fast Physical iPhone Test

Use ad hoc internal distribution:

```bash
eas device:create
npm run build:ios:preview
```

Let EAS manage Apple credentials unless there is a specific reason not to.
Install the build from the EAS build link on the registered iPhone.

## TestFlight Path

1. Enroll in Apple Developer Program.
2. Create App Store Connect app record. The user reported Apple Developer Program enrollment is active as of 2026-07-17.
3. Use bundle id `com.rakti.habitpro`.
4. Build production:

```bash
npm run build:ios
```

5. Submit:

```bash
eas submit --platform ios
```

6. Add internal testers in App Store Connect TestFlight.

For internal TestFlight, Sign in with Apple is not required just to install and test. It may still matter for external beta/App Review because Google sign-in exists.

External testing for friends requires an External Testing group and Beta App Review. Use a group such as `Friends Beta`, add the latest TestFlight build, fill Test Information, then submit for Beta App Review before sharing emails/public link.

## OTA Env Safety

Production OTA must use EAS production env vars, not local `.env`:

```bash
npm run update:production -- --message "Your message"
```

The script includes `--environment production`. This is important because one Mac local `.env` used a RevenueCat Android `test_...` key, which Android release treats as missing.

## App Store Review Readiness

Before production App Review, plan for:

- Sign in with Apple if Google sign-in remains enabled. This is now implemented, but still retest it on the build being submitted.
- Privacy policy URL.
- Support URL.
- Account deletion flow.
- App privacy questionnaire.
- Screenshots.
- In-app purchase/subscription products if RevenueCat is live.
- Demo account or review notes.
