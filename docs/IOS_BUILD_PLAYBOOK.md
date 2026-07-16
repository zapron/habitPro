# iOS Build Playbook

Use this when preparing HabitPro for iPhone testing or TestFlight.

## Current Project Facts

- Expo SDK 54.
- EAS project id: `cdfc2b93-f246-47b6-94ca-6a816ffda876`.
- iOS bundle id: `com.rakti.habitpro`.
- iOS build number in `app.json`: `32`.
- EAS profiles: `development`, `preview`, `production`.

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
2. Create App Store Connect app record.
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

## App Store Review Readiness

Before production App Review, plan for:

- Sign in with Apple if Google sign-in remains enabled.
- Privacy policy URL.
- Support URL.
- Account deletion flow.
- App privacy questionnaire.
- Screenshots.
- In-app purchase/subscription products if RevenueCat is live.
- Demo account or review notes.

