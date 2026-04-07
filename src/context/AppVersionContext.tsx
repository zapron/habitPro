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
  downloadUrl: string | null;
  forceMessage: string | null;
  loading: boolean;
  refresh: () => Promise<void>;
};

const AppVersionContext = createContext<AppVersionContextValue | null>(null);

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

  const { needsForceUpdate, downloadUrl, forceMessage } = useMemo(() => {
    if (!policy) {
      return { needsForceUpdate: false, downloadUrl: null, forceMessage: null as string | null };
    }
    const min =
      Platform.OS === "ios" ? policy.min_ios_version : policy.min_android_version;
    const url = Platform.OS === "ios" ? policy.ios_download_url : policy.android_download_url;
    const trimmedUrl = typeof url === "string" && url.trim().length > 0 ? url.trim() : null;
    const msg = typeof policy.force_update_message === "string" ? policy.force_update_message : null;
    if (!min || !min.trim()) {
      return { needsForceUpdate: false, downloadUrl: trimmedUrl, forceMessage: msg };
    }
    const cmp = compareSemver(currentVersion, min.trim());
    return {
      needsForceUpdate: cmp < 0,
      downloadUrl: trimmedUrl,
      forceMessage: msg,
    };
  }, [policy, currentVersion]);

  const value = useMemo(
    () => ({
      policy,
      releases,
      currentVersion,
      nativeBuildLabel,
      needsForceUpdate,
      downloadUrl,
      forceMessage,
      loading,
      refresh,
    }),
    [
      policy,
      releases,
      currentVersion,
      nativeBuildLabel,
      needsForceUpdate,
      downloadUrl,
      forceMessage,
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
