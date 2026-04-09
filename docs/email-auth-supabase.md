# Email confirmation + Supabase (habitPro)

## Why email links failed on `auth.expo.io`

The Expo Auth Session proxy (`https://auth.expo.io/@…/habitPro`) is only for **Google OAuth** (browser flow + `/start` handoff). **Email confirmation** must redirect into your app with a **custom scheme** (`habitpro://…`) so Supabase can complete **PKCE** with `exchangeCodeForSession`.

If **Site URL** or the confirmation `redirect_to` is `auth.expo.io`, the browser shows: *Something went wrong trying to finish signing in.*

## Dashboard steps (required once)

### 1. Site URL

**Authentication → URL Configuration → Site URL**

Set to a **custom scheme** (pick one and stay consistent):

- Recommended: `habitpro://auth/callback`
- Or: `habitpro://`

Do **not** use `https://auth.expo.io/@raktim24/habitPro` as Site URL.

### 2. Redirect URLs

Include at least:

| URL | Purpose |
|-----|---------|
| `habitpro://**` | Wildcard for standalone builds |
| `habitpro://auth/callback` | Email confirm + Google PKCE return |
| `habitpro://reset-password` | Password reset email (`resetPasswordForEmail`) |
| `exp://**` | Expo Go (dev) |
| `https://auth.expo.io/@raktim24/habitPro` | Google OAuth (keep) |
| `https://auth.expo.io/@raktim24/habitPro/**` | Google OAuth (if you use it) |

Add any **exact** `exp://192.168.x.x:8081/--/auth/callback` URL if you test without wildcards (optional if `exp://**` is allowed).

### 3. SMTP

**Authentication → Providers → Email** + **Custom SMTP** (e.g. Resend) so messages are delivered.

### 4. After changing Site URL

Old confirmation emails may still contain the previous `redirect_to`. **Sign up again** or resend confirmation to test.

## What the app sends

- `signUp` uses `emailRedirectTo` = `Linking.createURL('/auth/callback')` (native), same route as Google PKCE completion (`src/lib/authRedirects.ts`).
- **Forgot password** (`app/(auth)/forgot-password.tsx`) calls `resetPasswordForEmail` with `redirectTo` = `Linking.createURL('/reset-password')`. Add that URL (or `habitpro://**`) to **Redirect URLs**.

## Password reset UX

After the user taps the email link, the app opens `reset-password`, establishes the recovery session from the URL, then `updateUser({ password })` on submit.

### PKCE + mobile (`detectSessionInUrl: false`)

Supabase’s JS client emits **`SIGNED_IN`** (not `PASSWORD_RECOVERY`) after **`exchangeCodeForSession`** for PKCE recovery links. habitPro detects recovery sessions by decoding the access token’s **`amr`** claim (`method: "recovery"` or `"recovery"` in the array) — see `src/lib/passwordRecovery.ts`.
