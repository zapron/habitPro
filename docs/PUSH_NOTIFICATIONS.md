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
4. **`process-streak-reminders` Edge Function** — run on a **schedule** (e.g. every 15 minutes). Each mission **day** is a **rolling 24 hours from `habits.start_date`** (same as `getActiveMissionDaySlot`). **Mission day 1 is skipped** (user just started). From **day 2 onward**, if that day’s check-in is still missing: (a) during the **first hour** after the day opens — `reminder_phase: open`; (b) during the **last hour** before the day ends — `reminder_phase: closing`. Payload `reminder_phase` drives push/in-app copy. Deduped per `(user, habit, reminder_date, reminder_kind)` in `streak_reminder_log`.

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

### 5. Android: FCM (system tray on real devices)

Remote pushes use **Expo’s service**, which talks to **FCM** on Android. You do **not** add FCM keys to Supabase; you configure **Firebase + EAS**.

1. **Firebase** ( [console.firebase.google.com](https://console.firebase.google.com/) )  
   - Create or open a project → **Add app** → **Android** → package name **`com.rakti.habitpro`** (must match `app.json`).  
   - Download **`google-services.json`** and put it in the **repo root** next to `app.json`.  
   - `app.config.js` picks it up automatically and sets `android.googleServicesFile` (builds work without it, but **FCM will not** until the file exists).

2. **FCM v1 for Expo** (server-side delivery through Expo)  
   - Firebase → **Project settings** → **Service accounts** → **Generate new private key** (JSON).  
   - **Do not commit** that JSON.  
   - Upload it to **EAS**: [FCM credentials](https://docs.expo.dev/push-notifications/fcm-credentials/) — e.g. `eas credentials` → Android → **Google Service Account Key for Push Notifications (FCM V1)**.

3. **Rebuild** an APK/AAB with EAS after `google-services.json` is in place.

4. **Test** — [expo.dev/notifications](https://expo.dev/notifications) with a device **ExpoPushToken** from your dev/production build, or trigger a real `notifications` insert + webhook.

The app registers a **`default`** notification channel (high importance) and `notify-push` sends `channelId: "default"` so remote pushes use that channel.

### 6. iOS (when you have a device)

- Configure **Apple Push Notification** in your Apple Developer account.
- In **Expo / EAS**, add the push key and rebuild; **no separate RN module** — same `getExpoPushTokenAsync` + Expo Push service.

## Security

- Do **not** commit `NOTIFY_PUSH_SECRET`, `CRON_SECRET`, or service role keys.
- Logged-out users: client calls `clearPushTokenForCurrentUser` so this device no longer receives pushes.
