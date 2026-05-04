/**
 * Loads .env at config time so Supabase URL/anon key are available via
 * expo-constants `extra` on device (fixes empty EXPO_PUBLIC_* in some Metro setups).
 *
 * EAS Build: .env is not uploaded (gitignored). Set project secrets so Metro embeds them:
 *   eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_URL --value https://YOUR_PROJECT.supabase.co
 *   eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value YOUR_ANON_KEY
 * Secrets become env vars during `eas build` (dotenv does not override existing vars).
 */
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });

const appJson = require("./app.json");

/** Firebase client config (public). Download from Firebase Console → Project settings. Enables FCM in EAS builds when present. */
const googleServicesPath = path.resolve(__dirname, "google-services.json");
const hasGoogleServices = fs.existsSync(googleServicesPath);

const supabaseUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? "").trim();
const supabaseAnonKey = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();
const revenuecatAndroidApiKey = (process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY ?? "").trim();
const revenuecatIosApiKey = (process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY ?? "").trim();
const habitProWebUrl = (
  process.env.EXPO_PUBLIC_HABITPRO_WEB_URL ??
  process.env.EXPO_PUBLIC_SITE_URL ??
  ""
).trim();

if (process.env.EAS_BUILD === "true" && (!supabaseUrl || !supabaseAnonKey)) {
  console.warn(
    "[habitPro] EAS build: EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY are missing. " +
      "The release APK will not sync to Supabase until you add EAS project secrets (see app.config.js header).",
  );
}
if (process.env.EAS_BUILD === "true" && !revenuecatAndroidApiKey) {
  console.warn(
    "[habitPro] EAS build: EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY is missing. " +
      "The release APK will show the paywall but cannot start Google Play purchases.",
  );
}
if (process.env.EAS_BUILD === "true" && revenuecatAndroidApiKey.startsWith("test_")) {
  console.warn(
    "[habitPro] EAS build: EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY looks like a RevenueCat Test Store key. " +
      "Use the Play Store public SDK key for release builds installed from Google Play.",
  );
}
if (process.env.EAS_BUILD === "true" && !hasGoogleServices) {
  console.warn(
    "[habitPro] EAS build: google-services.json not found. Android remote push (FCM) will not work until you add it (see docs/PUSH_NOTIFICATIONS.md).",
  );
}
if (process.env.EAS_BUILD === "true" && !habitProWebUrl) {
  console.warn(
    "[habitPro] EAS build: EXPO_PUBLIC_HABITPRO_WEB_URL is missing. Legal links will use the default Vercel URL until you set it.",
  );
}

module.exports = {
  expo: {
    ...appJson.expo,
    android: {
      ...appJson.expo.android,
      ...(hasGoogleServices ? { googleServicesFile: "./google-services.json" } : {}),
    },
    extra: {
      ...appJson.expo.extra,
      supabaseUrl,
      supabaseAnonKey,
      revenuecatAndroidApiKey,
      revenuecatIosApiKey,
      habitProWebUrl,
    },
  },
};
