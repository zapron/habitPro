import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Session } from "@supabase/supabase-js";
import { useHabitStore } from "../store/habitStore";
import { isSupabaseConfigured, logSupabaseEnvHint } from "../lib/env";
import { getSupabase } from "../lib/supabase";
import { hydrateStoreAfterAuth } from "../lib/sync";

const PERSIST_KEY = "habit-storage";

type AuthContextValue = {
  session: Session | null;
  initializing: boolean;
  /** True after first hydrate from Supabase for this session (safe to push). */
  syncReady: boolean;
  supabaseConfigured: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const supabaseConfigured = isSupabaseConfigured();
  const [session, setSession] = useState<Session | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [syncReady, setSyncReady] = useState(false);

  useEffect(() => {
    logSupabaseEnvHint();
    const supabase = getSupabase();
    if (!supabase) {
      setSession(null);
      setInitializing(false);
      return;
    }

    let sub: { unsubscribe: () => void } | void;

    void supabase.auth
      .getSession()
      .then(({ data: { session: s } }) => {
        setSession(s);
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

    const { data } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    sub = data.subscription;

    return () => {
      sub?.unsubscribe();
    };
  }, []);

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
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    });
    if (data.session) setSession(data.session);
    return { error: error ?? null };
  }, []);

  const signOut = useCallback(async () => {
    const supabase = getSupabase();
    useHabitStore.getState().resetStore();
    setSyncReady(false);
    try {
      await AsyncStorage.removeItem(PERSIST_KEY);
    } catch {
      /* ignore */
    }
    if (supabase) {
      await supabase.auth.signOut();
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      initializing,
      syncReady,
      supabaseConfigured,
      signIn,
      signUp,
      signOut,
    }),
    [
      session,
      initializing,
      syncReady,
      supabaseConfigured,
      signIn,
      signUp,
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
