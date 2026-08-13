import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { InteractionManager, Platform } from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import * as WebBrowser from "expo-web-browser";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { useHabitStore, retryPendingMemoryUploads } from "../store/habitStore";
import { useChallengeStore } from "../store/challengeStore";
import { isSupabaseConfigured, logSupabaseEnvHint } from "../lib/env";
import {
  buildSupabaseOAuthBrowserUrl,
  getOAuthRedirectUri,
  getOAuthReturnUrl,
} from "../lib/oauthRedirect";
import { extractOAuthCodeFromUrl } from "../lib/oauthExchange";
import { getSignupConfirmationRedirectUrl } from "../lib/authRedirects";
import { isPasswordRecoverySession } from "../lib/passwordRecovery";
import { clearSupabaseAuthStorage, getSupabase } from "../lib/supabase";
import { saveAccountSnapshotBackup } from "../lib/accountBackup";
import { hydrateStoreAfterAuth, updateCachedAuthSession } from "../lib/sync";
import { disableAndCancelRemoteSync } from "../lib/syncQueue";
import {
  clearPushTokenForCurrentUser,
  registerPushTokenForCurrentUser,
  setActivePushUserId,
  subscribePushAndTimezoneOnAppActive,
  syncProfileTimezone,
} from "../lib/pushTokens";
import { syncMiniMissionNotifications } from "../utils/miniMissionNotifications";
import { markRemoteFocusRefreshFresh } from "../lib/remoteFocusRefreshCache";

const CHALLENGE_STORAGE_KEY = "challenge-storage";

type AuthContextValue = {
  session: Session | null;
  initializing: boolean;
  /** True after first hydrate from Supabase for this session (safe to push). */
  syncReady: boolean;
  /** Hydrate failure blocks remote writes until retry succeeds. */
  syncError: string | null;
  retryHydrate: () => void;
  supabaseConfigured: boolean;
  /** True after PASSWORD_RECOVERY until password is updated or cleared — used to avoid routing recovery to home. */
  passwordRecoveryPending: boolean;
  clearPasswordRecovery: () => void;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (
    email: string,
    password: string,
  ) => Promise<{ error: Error | null; needsEmailConfirmation: boolean }>;
  /** Google OAuth (PKCE + system browser). Configure provider + redirect URLs in Supabase. */
  signInWithGoogle: () => Promise<{ error: Error | null }>;
  /** Native Sign in with Apple. Enable Apple provider in Supabase Auth before release. */
  signInWithApple: () => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const supabaseConfigured = isSupabaseConfigured();
  const [session, setSession] = useState<Session | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [syncReady, setSyncReady] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [hydrateAttempt, setHydrateAttempt] = useState(0);
  const [passwordRecoveryPending, setPasswordRecoveryPending] = useState(false);
  const prevAuthUserIdRef = useRef<string | null>(null);
  const activeAuthUserIdRef = useRef<string | null>(null);

  const clearPasswordRecovery = useCallback(() => {
    setPasswordRecoveryPending(false);
  }, []);

  const clearLocalAccountState = useCallback(async () => {
    disableAndCancelRemoteSync();
    useHabitStore.getState().resetStore();
    useChallengeStore.getState().reset();
    setSyncReady(false);
    setSyncError(null);
    setPasswordRecoveryPending(false);

    await Promise.allSettled([
      useHabitStore.persist.clearStorage(),
      AsyncStorage.removeItem(CHALLENGE_STORAGE_KEY),
      syncMiniMissionNotifications([]),
    ]);
  }, []);

  useEffect(() => {
    const uid = session?.user?.id ?? null;
    activeAuthUserIdRef.current = uid;
    setActivePushUserId(uid);
    updateCachedAuthSession(uid);
  }, [session?.user?.id]);

  useEffect(() => {
    logSupabaseEnvHint();
    const supabase = getSupabase();
    if (!supabase) {
      setSession(null);
      setPasswordRecoveryPending(false);
      setInitializing(false);
      return;
    }

    let sub: { unsubscribe: () => void } | void;

    void supabase.auth
      .getSession()
      .then(({ data: { session: s } }) => {
        setSession(s);
        if (isPasswordRecoverySession(s)) {
          setPasswordRecoveryPending(true);
        }
      })
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn(
          "[habitPro] getSession failed (check .env URL/key, device internet, restart with npx expo start -c):",
          msg,
        );
        setSession(null);
      })
      .finally(() => {
        setInitializing(false);
      });

    const { data } = supabase.auth.onAuthStateChange((event: AuthChangeEvent, s) => {
      setSession(s);
      if (!s) {
        setPasswordRecoveryPending(false);
        return;
      }
      if (event === "PASSWORD_RECOVERY") {
        setPasswordRecoveryPending(true);
        return;
      }
      if (event === "USER_UPDATED") {
        if (!isPasswordRecoverySession(s)) {
          setPasswordRecoveryPending(false);
        }
        return;
      }
      /** PKCE recovery uses exchangeCodeForSession → SIGNED_IN; detect via JWT amr. */
      if (isPasswordRecoverySession(s)) {
        setPasswordRecoveryPending(true);
      } else {
        setPasswordRecoveryPending(false);
      }
    });
    sub = data.subscription;

    return () => {
      sub?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!supabaseConfigured) return;
    const uid = session?.user?.id ?? null;
    if (!uid) {
      prevAuthUserIdRef.current = null;
      return;
    }
    if (prevAuthUserIdRef.current !== null && prevAuthUserIdRef.current !== uid) {
      void clearLocalAccountState();
    }
    prevAuthUserIdRef.current = uid;
  }, [clearLocalAccountState, session?.user?.id, supabaseConfigured]);

  useEffect(() => {
    if (!supabaseConfigured || !session?.user) {
      setSyncReady(false);
      setSyncError(null);
      return;
    }

    let cancelled = false;
    const uid = session.user.id;
    setSyncReady(false);
    setSyncError(null);

    void hydrateStoreAfterAuth(
      uid,
      () => useHabitStore.getState(),
      (next) => {
        if (!cancelled && activeAuthUserIdRef.current === uid) {
          useHabitStore.setState(next);
          void saveAccountSnapshotBackup(uid, next, "auth-hydrate");
        }
      },
    )
      .then(() => {
        if (!cancelled && activeAuthUserIdRef.current === uid) {
          markRemoteFocusRefreshFresh(uid);
          setSyncReady(true);
          // Catch up any memory/task photo whose upload failed or never finished in a
          // previous session (and was never retried since nothing re-dirtied it) — see
          // retryPendingMemoryUploads for why this can't just rely on the opportunistic
          // per-push scheduling in sync.ts.
          retryPendingMemoryUploads();
        }
      })
      .catch((e) => {
        console.warn("[habitPro] hydrate failed", e);
        if (!cancelled && activeAuthUserIdRef.current === uid) {
          const msg = e instanceof Error ? e.message : String(e);
          setSyncReady(false);
          setSyncError(msg || "Could not load your cloud data.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [hydrateAttempt, session?.user?.id, supabaseConfigured]);

  const retryHydrate = useCallback(() => {
    setSyncReady(false);
    setSyncError(null);
    setHydrateAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!supabaseConfigured || !session?.user || !syncReady) return;
    const uid = session.user.id;
    const task = InteractionManager.runAfterInteractions(() => {
      void Promise.allSettled([
        syncProfileTimezone(uid),
        registerPushTokenForCurrentUser(uid),
      ]);
    });
    const unsub = subscribePushAndTimezoneOnAppActive(uid);
    return () => {
      task.cancel?.();
      unsub();
    };
  }, [session?.user?.id, syncReady, supabaseConfigured]);

  const signIn = useCallback(async (email: string, password: string) => {
    const supabase = getSupabase();
    if (!supabase) {
      return { error: new Error("Supabase is not configured.") };
    }
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (data.session) setSession(data.session);
    return { error: error ?? null };
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    const supabase = getSupabase();
    if (!supabase) {
      return { error: new Error("Supabase is not configured."), needsEmailConfirmation: false };
    }
    const emailRedirectTo = getSignupConfirmationRedirectUrl();
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo },
    });
    if (data.session) setSession(data.session);
    return { error: error ?? null, needsEmailConfirmation: !data.session };
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase) {
      return { error: new Error("Supabase is not configured.") };
    }
    const redirectTo = getOAuthRedirectUri();
    const returnUrl = getOAuthReturnUrl();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
        skipBrowserRedirect: true,
      },
    });
    if (error) return { error };
    if (!data?.url) {
      return { error: new Error("Could not start Google sign-in.") };
    }

    const browserUrl = buildSupabaseOAuthBrowserUrl(data.url);
    const result = await WebBrowser.openAuthSessionAsync(browserUrl, returnUrl);
    if (result.type !== "success" || !result.url) {
      if (result.type === "cancel" || result.type === "dismiss") {
        return { error: null };
      }
      return { error: new Error("Google sign-in was cancelled.") };
    }

    let parsed: URL;
    try {
      parsed = new URL(result.url);
    } catch {
      return { error: new Error("Invalid OAuth response URL.") };
    }

    const oauthErr =
      parsed.searchParams.get("error_description") ?? parsed.searchParams.get("error");
    if (oauthErr) {
      return { error: new Error(oauthErr) };
    }

    const code = extractOAuthCodeFromUrl(result.url);
    if (!code) {
      return { error: new Error("No authorization code returned from Google.") };
    }

    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    return { error: exchangeError ?? null };
  }, []);

  const signInWithApple = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase) {
      return { error: new Error("Supabase is not configured.") };
    }
    if (Platform.OS !== "ios") {
      return { error: new Error("Apple sign-in is only available on iOS.") };
    }

    const available = await AppleAuthentication.isAvailableAsync();
    if (!available) {
      return { error: new Error("Apple sign-in is not available on this device.") };
    }

    let credential: AppleAuthentication.AppleAuthenticationCredential;
    try {
      credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
    } catch (e) {
      const code = typeof e === "object" && e !== null && "code" in e ? String(e.code) : "";
      if (code === "ERR_REQUEST_CANCELED") {
        return { error: null };
      }
      const msg = e instanceof Error ? e.message : "Apple sign-in was cancelled.";
      return { error: new Error(msg) };
    }

    if (!credential.identityToken) {
      return { error: new Error("No identity token returned from Apple.") };
    }

    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: "apple",
      token: credential.identityToken,
    });
    if (data.session) setSession(data.session);
    return { error: error ?? null };
  }, []);

  const signOut = useCallback(async () => {
    const supabase = getSupabase();
    const uid = activeAuthUserIdRef.current ?? session?.user?.id ?? undefined;

    activeAuthUserIdRef.current = null;
    setActivePushUserId(null);
    prevAuthUserIdRef.current = null;
    setSession(null);

    const localCleanup = clearLocalAccountState();

    if (uid) {
      try {
        await clearPushTokenForCurrentUser(uid);
      } catch (e) {
        if (__DEV__) console.warn("[habitPro] push token cleanup failed", e);
      }
    }

    const authCleanup = supabase
      ? supabase.auth
          .signOut()
          .then(async ({ error }) => {
            if (error) {
              if (__DEV__) console.warn("[habitPro] signOut failed", error.message);
              await clearSupabaseAuthStorage();
            }
          })
          .catch(async (e) => {
            if (__DEV__) console.warn("[habitPro] signOut failed", e);
            await clearSupabaseAuthStorage();
          })
      : clearSupabaseAuthStorage();

    await Promise.allSettled([localCleanup, authCleanup]);
  }, [clearLocalAccountState, session?.user?.id]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      initializing,
      syncReady,
      syncError,
      retryHydrate,
      supabaseConfigured,
      passwordRecoveryPending,
      clearPasswordRecovery,
      signIn,
      signUp,
      signInWithGoogle,
      signInWithApple,
      signOut,
    }),
    [
      session,
      initializing,
      syncReady,
      syncError,
      retryHydrate,
      supabaseConfigured,
      passwordRecoveryPending,
      clearPasswordRecovery,
      signIn,
      signUp,
      signInWithGoogle,
      signInWithApple,
      signOut,
    ],
  );

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
