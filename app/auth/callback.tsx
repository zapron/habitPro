import { useEffect, useState } from "react";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import * as Linking from "expo-linking";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Screen } from "../../src/components/Screen";
import { useTheme } from "../../src/context/ThemeContext";
import { getSupabase } from "../../src/lib/supabase";
import { extractOAuthCodeFromUrl } from "../../src/lib/oauthExchange";

/**
 * OAuth return: `habitpro://auth/callback?code=...`
 * Expo Router maps this URL to route `/auth/callback` (host `auth` + path `/callback` in
 * `expo-router`’s `extractPathFromURL` / `fromDeepLink`), so this file must live at `auth/callback`.
 */
export default function OAuthCallbackScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const params = useLocalSearchParams<{ code?: string; error?: string; error_description?: string }>();
  const linkingUrl = Linking.useURL();
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const paramErr =
        typeof params.error_description === "string"
          ? params.error_description
          : typeof params.error === "string"
            ? params.error
            : null;
      if (paramErr) {
        if (!cancelled) setMessage(paramErr);
        return;
      }

      const initial = await Linking.getInitialURL();
      const code =
        (typeof params.code === "string" && params.code.length > 0 ? params.code : null) ||
        extractOAuthCodeFromUrl(linkingUrl ?? "") ||
        extractOAuthCodeFromUrl(initial ?? "");

      if (!code) {
        router.replace("/login");
        return;
      }

      const supabase = getSupabase();
      if (!supabase) {
        router.replace("/login");
        return;
      }
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (cancelled) return;
      if (error) {
        setMessage(error.message);
        return;
      }
      router.replace("/");
    })();
    return () => {
      cancelled = true;
    };
  }, [params.code, params.error, params.error_description, linkingUrl, router]);

  return (
    <Screen plain>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
        {message ? (
          <View style={{ gap: 16, alignItems: "center" }}>
            <Text style={{ color: theme.colors.textSecondary, textAlign: "center" }}>{message}</Text>
            <TouchableOpacity onPress={() => router.replace("/login")} accessibilityRole="button">
              <Text style={{ color: theme.colors.indigo[500], fontWeight: "700" }}>Back to sign in</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <ActivityIndicator color={theme.colors.indigo[500]} />
        )}
      </View>
    </Screen>
  );
}
