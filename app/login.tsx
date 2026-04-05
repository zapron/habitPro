import { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
  StatusBar,
} from "react-native";
import { useRouter } from "expo-router";
import { Eye, EyeOff } from "lucide-react-native";
import { Screen } from "../src/components/Screen";
import { useTheme } from "../src/context/ThemeContext";
import { useAuth } from "../src/context/AuthContext";
import { Button } from "../src/components/Button";

type FocusKey = "email" | "password" | "confirmPassword" | null;

const FORM_MAX_WIDTH = 400;

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
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState<FocusKey>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

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
    if (isSignUp) {
      if (password !== confirmPassword) {
        Alert.alert("Passwords do not match", "Enter the same password in both fields.");
        return;
      }
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

  const borderFor = (key: Exclude<FocusKey, null>) =>
    focused === key ? theme.colors.indigo[500] : theme.colors.border;

  return (
    <Screen plain>
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor={theme.colors.background}
      />
      <ScrollView
        style={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={[styles.form, { maxWidth: FORM_MAX_WIDTH }]}>
          <View style={styles.header}>
            <Text style={styles.titleWordmark}>
              <Text style={{ color: theme.colors.indigo[500] }}>habit</Text>
              <Text style={{ color: isDark ? theme.colors.textPrimary : "#000000" }}>
                Pro
              </Text>
            </Text>
            <Text
              style={[styles.subtitle, { color: theme.colors.textSecondary }]}
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
              <View
                style={[
                  styles.passwordOuter,
                  {
                    backgroundColor: theme.colors.surface,
                    borderColor: borderFor("password"),
                  },
                ]}
              >
                <TextInput
                  style={[styles.passwordInput, { color: theme.colors.textPrimary }]}
                  placeholder="••••••••"
                  placeholderTextColor={theme.colors.textMuted}
                  secureTextEntry={!showPassword}
                  value={password}
                  onChangeText={setPassword}
                  onFocus={() => setFocused("password")}
                  onBlur={() => setFocused(null)}
                  autoCapitalize="none"
                />
                <TouchableOpacity
                  style={styles.eyeButton}
                  onPress={() => setShowPassword((v) => !v)}
                  accessibilityLabel={showPassword ? "Hide password" : "Show password"}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  {showPassword ? (
                    <EyeOff size={20} color={theme.colors.textMuted} />
                  ) : (
                    <Eye size={20} color={theme.colors.textMuted} />
                  )}
                </TouchableOpacity>
              </View>

              {isSignUp && (
                <>
                  <Text style={[styles.label, { color: theme.colors.textSecondary }]}>
                    Confirm password
                  </Text>
                  <View
                    style={[
                      styles.passwordOuter,
                      {
                        backgroundColor: theme.colors.surface,
                        borderColor: borderFor("confirmPassword"),
                      },
                    ]}
                  >
                    <TextInput
                      style={[styles.passwordInput, { color: theme.colors.textPrimary }]}
                      placeholder="••••••••"
                      placeholderTextColor={theme.colors.textMuted}
                      secureTextEntry={!showConfirmPassword}
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      onFocus={() => setFocused("confirmPassword")}
                      onBlur={() => setFocused(null)}
                      autoCapitalize="none"
                    />
                    <TouchableOpacity
                      style={styles.eyeButton}
                      onPress={() => setShowConfirmPassword((v) => !v)}
                      accessibilityLabel={
                        showConfirmPassword ? "Hide confirm password" : "Show confirm password"
                      }
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      {showConfirmPassword ? (
                        <EyeOff size={20} color={theme.colors.textMuted} />
                      ) : (
                        <Eye size={20} color={theme.colors.textMuted} />
                      )}
                    </TouchableOpacity>
                  </View>
                </>
              )}

              <TouchableOpacity
                style={styles.switchRow}
                onPress={() => {
                  setIsSignUp(!isSignUp);
                  setConfirmPassword("");
                }}
                activeOpacity={0.8}
              >
                <Text style={[styles.switchText, { color: theme.colors.textSecondary }]}>
                  {isSignUp ? "Already have an account? " : "New here? "}
                </Text>
                <Text style={[styles.switchAction, { color: theme.colors.indigo[500] }]}>
                  {isSignUp ? "Sign in" : "Create account"}
                </Text>
              </TouchableOpacity>

              {loading ? (
                <ActivityIndicator
                  color={theme.colors.indigo[500]}
                  style={styles.loader}
                />
              ) : (
                <Button
                  title={isSignUp ? "Create account" : "Sign in"}
                  onPress={onSubmit}
                  style={{ marginTop: 4 }}
                />
              )}
            </>
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    width: "100%",
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingVertical: 32,
    width: "100%",
    alignItems: "center",
  },
  form: {
    width: "100%",
    alignSelf: "center",
  },
  header: {
    marginBottom: 28,
    alignItems: "center",
  },
  titleWordmark: {
    fontSize: 40,
    fontWeight: "800",
    letterSpacing: -0.5,
    marginBottom: 10,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    paddingHorizontal: 8,
  },
  banner: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    gap: 12,
  },
  bannerText: { fontSize: 13, lineHeight: 19, textAlign: "center" },
  label: { fontSize: 12, fontWeight: "600", marginBottom: 8, alignSelf: "flex-start", width: "100%" },
  input: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 14,
    fontSize: 16,
    width: "100%",
  },
  passwordOuter: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 14,
    marginBottom: 14,
    paddingRight: 4,
    width: "100%",
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  eyeButton: {
    padding: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  switchRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 16,
    marginBottom: 4,
  },
  switchText: {
    fontSize: 14,
  },
  switchAction: {
    fontSize: 14,
    fontWeight: "700",
  },
  loader: { marginTop: 16 },
});
