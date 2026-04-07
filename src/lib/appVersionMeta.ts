import Constants from "expo-constants";

/** Marketing / semver version from app config (e.g. app.json `expo.version`). */
export function getRuntimeAppVersion(): string {
  const v = Constants.expoConfig?.version;
  if (typeof v === "string" && v.trim().length > 0) return v.trim();
  return "0.0.0";
}

/** Native build number when running a standalone/dev build (often empty in Expo Go). */
export function getRuntimeNativeBuildLabel(): string | null {
  const c = Constants as {
    nativeBuildVersion?: string | null;
    expoConfig?: { ios?: { buildNumber?: string }; android?: { versionCode?: number } };
  };
  if (typeof c.nativeBuildVersion === "string" && c.nativeBuildVersion.trim().length > 0) {
    return c.nativeBuildVersion.trim();
  }
  return null;
}
