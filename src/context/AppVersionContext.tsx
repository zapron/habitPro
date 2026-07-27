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
  /** Premium force-update card content, sourced from the matching release row. */
  forceImageUrl: string | null;
  forceChangelog: string[];
  forceChangelogUrl: string | null;
  softUpdateUrl: string | null;
  softUpdateMessage: string | null;
  loading: boolean;
  refresh: () => Promise<void>;
  // TEMP-DEV-SIM: __DEV__-only override so the force-update block screen can be
  // previewed live without touching the real Supabase policy row (which would
  // block real users). Remove once the premium force-update visual is done.
  devSimulateForceUpdate: boolean;
  setDevSimulateForceUpdate: (value: boolean) => void;
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

/**
 * Fallback for release rows without a structured `changelog` array yet (or
 * before that column exists in the DB at all) — turns a free-text notes/
 * force_update_message string into bullet lines by splitting on newlines and
 * stripping common list-item prefixes ("1) ", "2. ", "- ", "* ").
 */
function parseChangelogFallback(text: string | null): string[] {
  if (!text) return [];
  return text
    .split("\n")
    .map((line) => line.trim().replace(/^(\d+[).]|[-*])\s*/, ""))
    .filter((line) => line.length > 0);
}

export function AppVersionProvider({ children }: { children: React.ReactNode }) {
  const [policy, setPolicy] = useState<AppVersionPolicyRow | null>(null);
  const [releases, setReleases] = useState<AppVersionReleaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  // TEMP-DEV-SIM: see devSimulateForceUpdate on AppVersionContextValue above.
  const [devSimulateForceUpdate, setDevSimulateForceUpdateState] = useState(false);
  const setDevSimulateForceUpdate = useCallback((value: boolean) => {
    if (!__DEV__) return;
    setDevSimulateForceUpdateState(value);
  }, []);

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
    needsForceUpdate: computedNeedsForceUpdate,
    softUpdateAvailable,
    latestVersion,
    downloadUrl,
    forceMessage,
    forceImageUrl,
    forceChangelog,
    forceChangelogUrl,
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
        forceImageUrl: null as string | null,
        forceChangelog: [] as string[],
        forceChangelogUrl: null as string | null,
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
    const matchingRelease = latestRelease && latestRelease.version === latest ? latestRelease : null;
    const releaseUrl =
      matchingRelease && typeof matchingRelease.download_url === "string" ? matchingRelease.download_url.trim() : "";
    const softUrl = releaseUrl.length > 0 ? releaseUrl : trimmedUrl;
    const notes = matchingRelease && typeof matchingRelease.notes === "string" ? matchingRelease.notes.trim() : "";
    const softMessage =
      notes.length > 0
        ? notes
        : latest
          ? `Version ${latest} is available. Update when you have a minute.`
          : null;
    const imageUrl =
      matchingRelease && typeof matchingRelease.image_url === "string" && matchingRelease.image_url.trim().length > 0
        ? matchingRelease.image_url.trim()
        : null;
    const structuredChangelog =
      matchingRelease && Array.isArray(matchingRelease.changelog)
        ? matchingRelease.changelog.filter((line): line is string => typeof line === "string" && line.trim().length > 0)
        : [];
    const changelog = structuredChangelog.length > 0 ? structuredChangelog : parseChangelogFallback(notes || msg);
    const changelogUrl =
      matchingRelease && typeof matchingRelease.changelog_url === "string" && matchingRelease.changelog_url.trim().length > 0
        ? matchingRelease.changelog_url.trim()
        : null;
    if (!min || !min.trim()) {
      return {
        needsForceUpdate: false,
        softUpdateAvailable: latest ? compareSemver(currentVersion, latest) < 0 : false,
        latestVersion: latest,
        downloadUrl: trimmedUrl,
        forceMessage: msg,
        forceImageUrl: imageUrl,
        forceChangelog: changelog,
        forceChangelogUrl: changelogUrl,
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
      forceImageUrl: imageUrl,
      forceChangelog: changelog,
      forceChangelogUrl: changelogUrl,
      softUpdateUrl: softUrl,
      softUpdateMessage: softMessage,
    };
  }, [policy, releases, currentVersion]);

  // TEMP-DEV-SIM: __DEV__-only override, layered on top of the real computed
  // value rather than threaded into the memo above — see devSimulateForceUpdate.
  const needsForceUpdate = __DEV__ && devSimulateForceUpdate ? true : computedNeedsForceUpdate;

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
      forceImageUrl,
      forceChangelog,
      forceChangelogUrl,
      softUpdateUrl,
      softUpdateMessage,
      loading,
      refresh,
      devSimulateForceUpdate,
      setDevSimulateForceUpdate,
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
      forceImageUrl,
      forceChangelog,
      forceChangelogUrl,
      softUpdateUrl,
      softUpdateMessage,
      loading,
      refresh,
      devSimulateForceUpdate,
      setDevSimulateForceUpdate,
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
