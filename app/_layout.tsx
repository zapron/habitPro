import { useEffect } from "react";
import { View } from "react-native";
import { Stack, useRouter, useSegments } from "expo-router";
import { ThemeProvider } from "../src/context/ThemeContext";
import { AuthProvider, useAuth } from "../src/context/AuthContext";
import { SyncManager } from "../src/components/SyncManager";
import { SyncToast } from "../src/components/SyncToast";
import { setupNotifications } from "../src/utils/notifications";
import { isSupabaseConfigured } from "../src/lib/env";

function RootLayoutNav() {
  const { session, initializing } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const requireAuth = isSupabaseConfigured();

  useEffect(() => {
    void setupNotifications();
  }, []);

  useEffect(() => {
    if (!requireAuth || initializing) return;
    const inAuth = segments[0] === "login";
    if (!session && !inAuth) {
      router.replace("/login");
    }
    if (session && inAuth) {
      router.replace("/");
    }
  }, [requireAuth, initializing, session, segments, router]);

  if (requireAuth && initializing) {
    return null;
  }

  return (
    <View style={{ flex: 1 }}>
      <SyncManager />
      <Stack screenOptions={{ headerShown: false }} />
      <SyncToast />
    </View>
  );
}

export default function Layout() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <RootLayoutNav />
      </AuthProvider>
    </ThemeProvider>
  );
}
