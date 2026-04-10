# Remote push notifications (habitPro)

## What works where

| Environment | Remote push (Expo) |
|-------------|----------------------|
| **Production / dev client / EAS builds** | Yes (Android + iOS when Apple push is configured) |
| **Expo Go on Android** | **No** — Expo removed remote push; the app **skips** token registration (`shouldSkipRemotePushRegistration()`). Use a **development build** or **production APK/AAB**. |
| **Expo Go on iOS** | May work for testing; use a dev client for reliability. |

Local **mini mission** timers (`expo-notifications` local schedules) follow the same Expo Go Android skip in `src/utils/notifications.ts`.

## Architecture

1. **`push_tokens`** — one row per `(user_id, device_install_id)` with `expo_push_token`. Upserted after login; **deleted on logout** for this device.
2. **`profiles.timezone`** — IANA string (e.g. `Europe/London`) updated on login so server-side date keys match the mission grid (`getDayDate` labels) on the device.
3. **`notify-push` Edge Function** — receives **Database Webhook** `INSERT` on `public.notifications`, loads tokens for `user_id`, sends to **Expo Push API**.
4. **`process-streak-reminders` Edge Function** — run on a **schedule** (e.g. every 15 minutes). Each mission **day** is a **rolling 24 hours from `habits.start_date`** (same as `getActiveMissionDaySlot` in the app — not calendar midnight). During the **last hour** before that 24h window ends, if the check-in for that day’s `YYYY-MM-DD` key is still missing from `completed_dates`, it inserts `streak_window_reminder` + inbox row; webhook then sends push. The local clock time varies with mission start (e.g. mission created at noon → reminder about **11:00** the next day, not 23:00).

## One-time Supabase setup

### 1. Apply migration

```bash
cd habitPro
npx supabase db push
```

### 2. Deploy Edge Functions

```bash
npx supabase functions deploy notify-push --no-verify-jwt
npx supabase functions deploy process-streak-reminders --no-verify-jwt
```

Set secrets (Dashboard → Project Settings → Edge Functions, or CLI):

- `NOTIFY_PUSH_SECRET` — long random string; must match webhook header below.
- `CRON_SECRET` — long random string; used when invoking the streak cron.
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are usually injected automatically; confirm in the dashboard.

### 3. Database Webhook (notify inbox → push)

In Supabase Dashboard → **Database** → **Webhooks** → Create:

- **Table**: `notifications`
- **Events**: Insert
- **HTTP Request**: POST to your deployed `notify-push` URL  
  `https://<project-ref>.supabase.co/functions/v1/notify-push`
- **HTTP Headers**: `x-notify-secret: <same as NOTIFY_PUSH_SECRET>`

### 4. Schedule streak reminders

Dashboard → **Edge Functions** → **Cron Jobs** (or Supabase scheduled functions), or an external cron hitting:

`POST https://<project-ref>.supabase.co/functions/v1/process-streak-reminders`  
Header: `x-cron-secret: <CRON_SECRET>`

Recommended: every **15 minutes** so the rolling “last hour before slot end” window is hit reliably.

### 5. iOS (when you have a device)

- Configure **Apple Push Notification** in your Apple Developer account.
- In **Expo / EAS**, add the push key and rebuild; **no separate RN module** — same `getExpoPushTokenAsync` + Expo Push service.

## Security

- Do **not** commit `NOTIFY_PUSH_SECRET`, `CRON_SECRET`, or service role keys.
- Logged-out users: client calls `clearPushTokenForCurrentUser` so this device no longer receives pushes.
