/**
 * Loads .env at config time so Supabase URL/anon key are available via
 * expo-constants `extra` on device (fixes empty EXPO_PUBLIC_* in some Metro setups).
 *
 * EAS Build: .env is not uploaded (gitignored). Set project secrets so Metro embeds them:
 *   eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_URL --value https://YOUR_PROJECT.supabase.co
 *   eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value YOUR_ANON_KEY
 * Secrets become env vars during `eas build` (dotenv does not override existing vars).
 */
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });

const appJson = require("./app.json");

const supabaseUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? "").trim();
const supabaseAnonKey = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();

if (process.env.EAS_BUILD === "true" && (!supabaseUrl || !supabaseAnonKey)) {
  console.warn(
    "[habitPro] EAS build: EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY are missing. " +
      "The release APK will not sync to Supabase until you add EAS project secrets (see app.config.js header).",
  );
}

module.exports = {
  expo: {
    ...appJson.expo,
    extra: {
      ...appJson.expo.extra,
      supabaseUrl,
      supabaseAnonKey,
    },
  },
};
