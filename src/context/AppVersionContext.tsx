import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Platform } from "react-native";
import { isSupabaseConfigured } from "../lib/env";
import {
  fetchAppVersionPolicy,
  fetchAppVersionReleases,
  type AppVersionPolicyRow,
  type AppVersionReleaseRow,
} from "../lib/appVersionPolicyApi";
import { getRuntimeAppVersion, getRuntimeNativeBuildLabel } from "../lib/appVersionMeta";
import { compareSemver } from "../lib/semverCompare";

type AppVersionContextValue = {
  policy: AppVersionPolicyRow | null;
  releases: AppVersionReleaseRow[];
  currentVersion: string;
  nativeBuildLabel: string | null;
  needsForceUpdate: boolean;
  softUpdateAvailable: boolean;
  latestVersion: string | null;
  downloadUrl: string | null;
  forceMessage: string | null;
  softUpdateUrl: string | null;
  softUpdateMessage: string | null;
  loading: boolean;
  refresh: () => Promise<void>;
};

const AppVersionContext = createContext<AppVersionContextValue | null>(null);

function appPlatform(): "android" | "ios" {
  return Platform.OS === "ios" ? "ios" : "android";
}

function pickLatestRelease(
  releases: AppVersionReleaseRow[],
  platform: "android" | "ios",
): AppVersionReleaseRow | null {
  const matching = releases.filter((release) => release.platform === platform || release.platform === "all");
  if (matching.length === 0) return null;
  return [...matching].sort((a, b) => compareSemver(b.version, a.version))[0] ?? null;
}

export function AppVersionProvider({ children }: { children: React.ReactNode }) {
  const [policy, setPolicy] = useState<AppVersionPolicyRow | null>(null);
  const [releases, setReleases] = useState<AppVersionReleaseRow[]>([]);
  const [loading, setLoading] = useState(true);

  const currentVersion = useMemo(() => getRuntimeAppVersion(), []);
  const nativeBuildLabel = useMemo(() => getRuntimeNativeBuildLabel(), []);

  const refresh = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      setPolicy(null);
      setReleases([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [p, r] = await Promise.all([fetchAppVersionPolicy(), fetchAppVersionReleases(8)]);
      setPolicy(p);
      setReleases(r);
    } catch (e) {
      if (__DEV__) console.warn("[habitPro] app version check failed", e);
      setPolicy(null);
      setReleases([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const {
    needsForceUpdate,
    softUpdateAvailable,
    latestVersion,
    downloadUrl,
    forceMessage,
    softUpdateUrl,
    softUpdateMessage,
  } = useMemo(() => {
    if (!policy) {
      return {
        needsForceUpdate: false,
        softUpdateAvailable: false,
        latestVersion: null as string | null,
        downloadUrl: null as string | null,
        forceMessage: null as string | null,
        softUpdateUrl: null as string | null,
        softUpdateMessage: null as string | null,
      };
    }
    const platform = appPlatform();
    const min = platform === "ios" ? policy.min_ios_version : policy.min_android_version;
    const policyLatest = platform === "ios" ? policy.latest_ios_version : policy.latest_android_version;
    const latestRelease = pickLatestRelease(releases, platform);
    const latestFromPolicy = typeof policyLatest === "string" && policyLatest.trim().length > 0
      ? policyLatest.trim()
      : null;
    const latestFromRelease = latestRelease?.version?.trim() || null;
    const latest = latestFromPolicy ?? latestFromRelease;
    const url = platform === "ios" ? policy.ios_download_url : policy.android_download_url;
    const trimmedUrl = typeof url === "string" && url.trim().length > 0 ? url.trim() : null;
    const msg = typeof policy.force_update_message === "string" ? policy.force_update_message : null;
    const releaseUrl =
      latestRelease && latestRelease.version === latest && typeof latestRelease.download_url === "string"
        ? latestRelease.download_url.trim()
        : "";
    const softUrl = releaseUrl.length > 0 ? releaseUrl : trimmedUrl;
    const notes =
      latestRelease && latestRelease.version === latest && typeof latestRelease.notes === "string"
        ? latestRelease.notes.trim()
        : "";
    const softMessage =
      notes.length > 0
        ? notes
        : latest
          ? `Version ${latest} is available. Update when you have a minute.`
          : null;
    if (!min || !min.trim()) {
      return {
        needsForceUpdate: false,
        softUpdateAvailable: latest ? compareSemver(currentVersion, latest) < 0 : false,
        latestVersion: latest,
        downloadUrl: trimmedUrl,
        forceMessage: msg,
        softUpdateUrl: softUrl,
        softUpdateMessage: softMessage,
      };
    }
    const cmp = compareSemver(currentVersion, min.trim());
    const force = cmp < 0;
    const newerAvailable = latest ? compareSemver(currentVersion, latest) < 0 : false;
    return {
      needsForceUpdate: force,
      softUpdateAvailable: !force && newerAvailable,
      latestVersion: latest,
      downloadUrl: trimmedUrl,
      forceMessage: msg,
      softUpdateUrl: softUrl,
      softUpdateMessage: softMessage,
    };
  }, [policy, releases, currentVersion]);

  const value = useMemo(
    () => ({
      policy,
      releases,
      currentVersion,
      nativeBuildLabel,
      needsForceUpdate,
      softUpdateAvailable,
      latestVersion,
      downloadUrl,
      forceMessage,
      softUpdateUrl,
      softUpdateMessage,
      loading,
      refresh,
    }),
    [
      policy,
      releases,
      currentVersion,
      nativeBuildLabel,
      needsForceUpdate,
      softUpdateAvailable,
      latestVersion,
      downloadUrl,
      forceMessage,
      softUpdateUrl,
      softUpdateMessage,
      loading,
      refresh,
    ],
  );

  return <AppVersionContext.Provider value={value}>{children}</AppVersionContext.Provider>;
}

export function useAppVersion(): AppVersionContextValue {
  const ctx = useContext(AppVersionContext);
  if (!ctx) {
    throw new Error("useAppVersion must be used within AppVersionProvider");
  }
  return ctx;
}
