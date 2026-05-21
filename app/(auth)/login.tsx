import { Text } from "../../src/components/AppText";
import {
  useEffect,
  useState } from "react";
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
  StatusBar,
  Image,
} from "react-native";
import { useRouter } from "expo-router";
import { Eye, EyeOff, MailCheck } from "lucide-react-native";
import { Screen } from "../../src/components/Screen";
import { useTheme } from "../../src/context/ThemeContext";
import { useAuth } from "../../src/context/AuthContext";
import { Button } from "../../src/components/Button";
import { GoogleGIcon } from "../../src/components/GoogleGIcon";
import {
  SPLASH_WORDMARK_HABIT_COLOR,
  SPLASH_WORDMARK_PRO_COLOR,
} from "../../src/constants/splash";

type FocusKey = "email" | "password" | "confirmPassword" | null;

const FORM_MAX_WIDTH = 400;

export default function LoginScreen() {
  const router = useRouter();
  const { theme, isDark } = useTheme();
  const { supabaseConfigured, signIn, signUp, signInWithGoogle, session } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [focused, setFocused] = useState<FocusKey>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [pendingSignupEmail, setPendingSignupEmail] = useState<string | null>(null);

  useEffect(() => {
    if (supabaseConfigured && session) {
      setPendingSignupEmail(null);
      router.replace("/");
    }
  }, [supabaseConfigured, session, router]);

  const onGoogle = async () => {
    setGoogleLoading(true);
    try {
      const { error } = await signInWithGoogle();
      if (error) {
        Alert.alert("Google sign-in failed", error.message);
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  const onSubmit = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
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
    if (isSignUp) {
      const { error, needsEmailConfirmation } = await signUp(trimmedEmail, password);
      setLoading(false);
      if (error) {
        Alert.alert("Sign up failed", error.message);
        return;
      }
      setEmail(trimmedEmail);
      setPassword("");
      setConfirmPassword("");
      setShowPassword(false);
      setShowConfirmPassword(false);
      if (needsEmailConfirmation) {
        setPendingSignupEmail(trimmedEmail);
      }
      return;
    }
    const { error } = await signIn(trimmedEmail, password);
    setLoading(false);
    if (error) {
      Alert.alert("Sign in failed", error.message);
      return;
    }
  };

  const borderFor = (key: Exclude<FocusKey, null>) =>
    focused === key ? theme.colors.indigo[500] : theme.colors.border;

  const busy = loading || googleLoading;

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
            <View style={styles.brandRow}>
              <View
                style={[
                  styles.logoWrapper,
                  {
                    backgroundColor: isDark ? "rgba(255, 255, 255, 0.03)" : "rgba(108, 114, 255, 0.05)",
                    borderColor: isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(108, 114, 255, 0.12)",
                  },
                ]}
              >
                <Image
                  source={require("../../assets/habitpro-logo-transparent-v3.png")}
                  style={styles.brandLogo}
                  resizeMode="contain"
                  accessibilityLabel="habitPro brand logo"
                />
              </View>
              <Text style={styles.titleWordmark}>
                <Text style={{ color: isDark ? SPLASH_WORDMARK_HABIT_COLOR : "#000000", fontWeight: "900" }}>habit</Text>
                <Text style={{ color: SPLASH_WORDMARK_PRO_COLOR, fontWeight: "900" }}>Pro</Text>
              </Text>
            </View>
            <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]}>
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

          {supabaseConfigured && pendingSignupEmail ? (
            <View
              style={[
                styles.confirmCard,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.border,
                },
              ]}
            >
              <View
                style={[
                  styles.confirmIcon,
                  { backgroundColor: isDark ? "rgba(34, 211, 238, 0.14)" : "#e6fbff" },
                ]}
              >
                <MailCheck size={30} color={theme.colors.cyan[500]} />
              </View>
              <Text style={[styles.confirmTitle, { color: theme.colors.textPrimary }]}>
                Check your email
              </Text>
              <Text style={[styles.confirmBody, { color: theme.colors.textSecondary }]}>
                We sent a verification link to{" "}
                <Text style={{ color: theme.colors.textPrimary, fontWeight: "900" }}>
                  {pendingSignupEmail}
                </Text>
                . After verifying, come back and sign in with your password.
              </Text>
              <Button
                title="I verified, sign in"
                onPress={() => {
                  setPendingSignupEmail(null);
                  setIsSignUp(false);
                }}
                style={{ marginTop: 8 }}
              />
              <TouchableOpacity
                style={styles.confirmSecondary}
                onPress={() => {
                  setPendingSignupEmail(null);
                  setIsSignUp(true);
                  setEmail("");
                }}
                activeOpacity={0.8}
                accessibilityRole="button"
              >
                <Text style={[styles.confirmSecondaryText, { color: theme.colors.indigo[500] }]}>
                  Use another email
                </Text>
              </TouchableOpacity>
            </View>
          ) : supabaseConfigured && (
            <>
              <Text style={[styles.label, { color: theme.colors.textSecondary }]}>Email</Text>
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
                editable={!busy}
              />

              <Text style={[styles.label, { color: theme.colors.textSecondary }]}>Password</Text>
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
                  editable={!busy}
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
                      editable={!busy}
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

              {!isSignUp && (
                <TouchableOpacity
                  style={styles.forgotRow}
                  onPress={() => router.push("/forgot-password")}
                  activeOpacity={0.8}
                  disabled={busy}
                  accessibilityRole="button"
                  accessibilityLabel="Forgot password"
                >
                  <Text style={[styles.forgotText, { color: theme.colors.indigo[500] }]}>
                    Forgot password?
                  </Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={styles.switchRow}
                onPress={() => {
                  setIsSignUp(!isSignUp);
                  setConfirmPassword("");
                }}
                activeOpacity={0.8}
                disabled={busy}
              >
                <Text style={[styles.switchText, { color: theme.colors.textSecondary }]}>
                  {isSignUp ? "Already have an account? " : "New here? "}
                </Text>
                <Text style={[styles.switchAction, { color: theme.colors.indigo[500] }]}>
                  {isSignUp ? "Sign in" : "Create account"}
                </Text>
              </TouchableOpacity>

              {loading ? (
                <ActivityIndicator color={theme.colors.indigo[500]} style={styles.loader} />
              ) : (
                <Button
                  title={isSignUp ? "Create account" : "Sign in"}
                  onPress={onSubmit}
                  style={{ marginTop: 4 }}
                  disabled={busy}
                />
              )}

              <View style={styles.dividerRow}>
                <View style={[styles.dividerLine, { backgroundColor: theme.colors.border }]} />
                <Text style={[styles.dividerOr, { color: theme.colors.textMuted }]}>or</Text>
                <View style={[styles.dividerLine, { backgroundColor: theme.colors.border }]} />
              </View>

              {googleLoading ? (
                <ActivityIndicator color={theme.colors.indigo[500]} style={{ marginBottom: 8 }} />
              ) : (
                <TouchableOpacity
                  style={[
                    styles.googleBtn,
                    {
                      borderColor: theme.colors.border,
                      backgroundColor: theme.colors.surface,
                    },
                  ]}
                  onPress={() => void onGoogle()}
                  disabled={busy}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel="Continue with Google"
                >
                  <View style={styles.googleBtnContent}>
                    <GoogleGIcon size={22} />
                    <Text style={[styles.googleBtnText, { color: theme.colors.textPrimary }]}>
                      Continue with Google
                    </Text>
                  </View>
                </TouchableOpacity>
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
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    marginBottom: 10,
  },
  logoWrapper: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#6c72ff",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 4,
  },
  brandLogo: {
    width: 36,
    height: 36,
  },
  titleWordmark: {
    fontSize: 40,
    fontWeight: "900",
    letterSpacing: -0.5,
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
  confirmCard: {
    alignItems: "center",
    borderRadius: 18,
    borderWidth: 1,
    gap: 12,
    padding: 20,
    width: "100%",
  },
  confirmIcon: {
    alignItems: "center",
    borderRadius: 999,
    height: 62,
    justifyContent: "center",
    width: 62,
  },
  confirmTitle: {
    fontSize: 24,
    fontWeight: "900",
    textAlign: "center",
  },
  confirmBody: {
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 21,
    textAlign: "center",
  },
  confirmSecondary: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  confirmSecondaryText: {
    fontSize: 14,
    fontWeight: "800",
  },
  googleBtn: {
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  googleBtnContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  googleBtnText: { fontSize: 16, fontWeight: "700" },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 18,
    gap: 12,
  },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth },
  dividerOr: { fontSize: 12, fontWeight: "700" },
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
  forgotRow: {
    alignSelf: "flex-end",
    marginBottom: 8,
    paddingVertical: 4,
  },
  forgotText: { fontSize: 14, fontWeight: "700" },
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
