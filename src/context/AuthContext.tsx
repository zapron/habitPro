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
import * as WebBrowser from "expo-web-browser";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { useHabitStore } from "../store/habitStore";
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
import { getSupabase } from "../lib/supabase";
import { hydrateStoreAfterAuth } from "../lib/sync";
import {
  clearPushTokenForCurrentUser,
  registerPushTokenForCurrentUser,
  syncProfileTimezone,
} from "../lib/pushTokens";

const PERSIST_KEY = "habit-storage";
const CHALLENGE_STORAGE_KEY = "challenge-storage";

type AuthContextValue = {
  session: Session | null;
  initializing: boolean;
  /** True after first hydrate from Supabase for this session (safe to push). */
  syncReady: boolean;
  supabaseConfigured: boolean;
  /** True after PASSWORD_RECOVERY until password is updated or cleared — used to avoid routing recovery to home. */
  passwordRecoveryPending: boolean;
  clearPasswordRecovery: () => void;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>;
  /** Google OAuth (PKCE + system browser). Configure provider + redirect URLs in Supabase. */
  signInWithGoogle: () => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const supabaseConfigured = isSupabaseConfigured();
  const [session, setSession] = useState<Session | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [syncReady, setSyncReady] = useState(false);
  const [passwordRecoveryPending, setPasswordRecoveryPending] = useState(false);
  const prevAuthUserIdRef = useRef<string | null>(null);

  const clearPasswordRecovery = useCallback(() => {
    setPasswordRecoveryPending(false);
  }, []);

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
      useHabitStore.getState().resetStore();
      useChallengeStore.getState().reset();
      void AsyncStorage.removeItem(PERSIST_KEY);
      void AsyncStorage.removeItem(CHALLENGE_STORAGE_KEY);
    }
    prevAuthUserIdRef.current = uid;
  }, [session?.user?.id, supabaseConfigured]);

  useEffect(() => {
    if (!supabaseConfigured || !session?.user) {
      setSyncReady(false);
      return;
    }

    let cancelled = false;
    setSyncReady(false);

    void hydrateStoreAfterAuth(
      session.user.id,
      () => useHabitStore.getState(),
      (next) => {
        if (!cancelled) {
          useHabitStore.setState(next);
        }
      },
    )
      .then(() => {
        if (!cancelled) setSyncReady(true);
      })
      .catch((e) => {
        console.warn("[habitPro] hydrate failed", e);
        if (!cancelled) setSyncReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, [session?.user?.id, supabaseConfigured]);

  useEffect(() => {
    if (!supabaseConfigured || !session?.user || !syncReady) return;
    const uid = session.user.id;
    void (async () => {
      await syncProfileTimezone(uid);
      await registerPushTokenForCurrentUser(uid);
    })();
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
      return { error: new Error("Supabase is not configured.") };
    }
    const emailRedirectTo = getSignupConfirmationRedirectUrl();
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo },
    });
    if (data.session) setSession(data.session);
    return { error: error ?? null };
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
    if (__DEV__) {
      console.log("[OAuth] Supabase redirectTo:", redirectTo);
      console.log("[OAuth] WebBrowser returnUrl:", returnUrl);
      console.log(
        "[OAuth] browser opens:",
        browserUrl === data.url ? "raw Supabase authorize" : "auth.expo.io/start proxy",
      );
    }

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

  const signOut = useCallback(async () => {
    const supabase = getSupabase();
    let uid: string | undefined;
    if (supabase) {
      const { data } = await supabase.auth.getSession();
      uid = data.session?.user?.id;
    }
    if (uid) {
      await clearPushTokenForCurrentUser(uid);
    }
    useHabitStore.getState().resetStore();
    useChallengeStore.getState().reset();
    setSyncReady(false);
    try {
      await AsyncStorage.removeItem(PERSIST_KEY);
      await AsyncStorage.removeItem(CHALLENGE_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    if (supabase) {
      await supabase.auth.signOut();
    }
    setPasswordRecoveryPending(false);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      initializing,
      syncReady,
      supabaseConfigured,
      passwordRecoveryPending,
      clearPasswordRecovery,
      signIn,
      signUp,
      signInWithGoogle,
      signOut,
    }),
    [
      session,
      initializing,
      syncReady,
      supabaseConfigured,
      passwordRecoveryPending,
      clearPasswordRecovery,
      signIn,
      signUp,
      signInWithGoogle,
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
