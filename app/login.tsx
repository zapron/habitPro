import { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
} from "react-native";
import { useRouter } from "expo-router";
import { Screen } from "../src/components/Screen";
import { useTheme } from "../src/context/ThemeContext";
import { useAuth } from "../src/context/AuthContext";
import { Button } from "../src/components/Button";

export default function LoginScreen() {
  const router = useRouter();
  const { theme, isDark } = useTheme();
  const {
    supabaseConfigured,
    signIn,
    signUp,
    session,
  } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState<"email" | "password" | null>(null);

  useEffect(() => {
    if (supabaseConfigured && session) {
      router.replace("/");
    }
  }, [supabaseConfigured, session, router]);

  const onSubmit = async () => {
    if (!email.trim()) {
      Alert.alert("Missing email", "Enter your email.");
      return;
    }
    if (password.length < 6) {
      Alert.alert("Password", "Use at least 6 characters.");
      return;
    }
    setLoading(true);
    const { error } = isSignUp
      ? await signUp(email, password)
      : await signIn(email, password);
    setLoading(false);
    if (error) {
      Alert.alert(isSignUp ? "Sign up failed" : "Sign in failed", error.message);
      return;
    }
    if (isSignUp) {
      Alert.alert(
        "Check your inbox",
        "If email confirmation is enabled in Supabase, confirm your email before signing in.",
      );
    }
  };

  return (
    <Screen>
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor={theme.colors.background}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        <View style={styles.header}>
          <Text
            style={[
              styles.title,
              { color: theme.colors.textPrimary, fontSize: theme.typography.h2 },
            ]}
          >
            habitPro
          </Text>
          <Text
            style={[
              styles.subtitle,
              { color: theme.colors.textSecondary },
            ]}
          >
            Sign in to sync missions, streaks, and XP across devices.
          </Text>
        </View>

        {!supabaseConfigured && (
          <View
            style={[
              styles.banner,
              { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
            ]}
          >
            <Text style={[styles.bannerText, { color: theme.colors.textSecondary }]}>
              Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY (.env or EAS
              secrets), then restart Expo.
            </Text>
            <Button title="Continue offline" onPress={() => router.replace("/")} />
          </View>
        )}

        {supabaseConfigured && (
          <>
            <Text style={[styles.label, { color: theme.colors.textSecondary }]}>
              Email
            </Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.border,
                  color: theme.colors.textPrimary,
                },
                focused === "email" && { borderColor: theme.colors.indigo[500] },
              ]}
              placeholder="you@example.com"
              placeholderTextColor={theme.colors.textMuted}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              value={email}
              onChangeText={setEmail}
              onFocus={() => setFocused("email")}
              onBlur={() => setFocused(null)}
            />

            <Text style={[styles.label, { color: theme.colors.textSecondary }]}>
              Password
            </Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.border,
                  color: theme.colors.textPrimary,
                },
                focused === "password" && { borderColor: theme.colors.indigo[500] },
              ]}
              placeholder="••••••••"
              placeholderTextColor={theme.colors.textMuted}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              onFocus={() => setFocused("password")}
              onBlur={() => setFocused(null)}
            />

            <TouchableOpacity
              style={[styles.tabRow, { borderColor: theme.colors.border }]}
              onPress={() => setIsSignUp(!isSignUp)}
              activeOpacity={0.8}
            >
              <Text style={[styles.tabText, { color: theme.colors.textMuted }]}>
                {isSignUp ? "Already have an account?" : "New here?"}
              </Text>
              <Text style={[styles.tabText, { color: theme.colors.indigo[400] }]}>
                {isSignUp ? "Sign in" : "Create account"}
              </Text>
            </TouchableOpacity>

            {loading ? (
              <ActivityIndicator
                color={theme.colors.indigo[400]}
                style={styles.loader}
              />
            ) : (
              <Button
                title={isSignUp ? "Create account" : "Sign in"}
                onPress={onSubmit}
                style={styles.primaryButton}
              />
            )}
          </>
        )}
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { marginBottom: 24 },
  title: { fontWeight: "800", marginBottom: 8 },
  subtitle: { fontSize: 14, lineHeight: 20 },
  banner: { borderWidth: 1, borderRadius: 20, padding: 16, marginBottom: 20, gap: 12 },
  bannerText: { fontSize: 13, lineHeight: 19 },
  label: { fontSize: 12, fontWeight: "600", marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 14,
    fontSize: 16,
  },
  tabRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    marginBottom: 8,
    borderTopWidth: 1,
    borderBottomWidth: 1,
  },
  tabText: { fontSize: 13, fontWeight: "600" },
  primaryButton: { marginTop: 8 },
  loader: { marginTop: 16 },
});
