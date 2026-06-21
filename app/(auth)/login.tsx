import { Text } from "../../src/components/AppText";
import { useEffect, useState } from "react";
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
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
import { showAppAlert } from "../../src/context/AppDialogContext";

type FocusKey = "email" | "password" | "confirmPassword" | null;

const FORM_MAX_WIDTH = 400;
const AUTH_BG_LIGHT = require("../../assets/auth-bg-light.png");
const AUTH_BG_DARK = require("../../assets/auth-bg-dark.png");

function AuthImageBackdrop({ isDark }: { isDark: boolean }) {
  return (
    <View pointerEvents="none" style={styles.backdropLayer}>
      <Image
        source={isDark ? AUTH_BG_DARK : AUTH_BG_LIGHT}
        resizeMode="cover"
        style={[styles.backdropImage, { opacity: isDark ? 0.72 : 0.9 }]}
        accessibilityIgnoresInvertColors
      />
      <View
        style={[
          styles.backdropWash,
          { backgroundColor: isDark ? "rgba(2,6,14,0.2)" : "rgba(248,250,252,0.18)" },
        ]}
      />
    </View>
  );
}

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
        showAppAlert("Google sign-in failed", error.message);
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  const onSubmit = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      showAppAlert("Missing email", "Enter your email.");
      return;
    }
    if (password.length < 6) {
      showAppAlert("Password", "Use at least 6 characters.");
      return;
    }
    if (isSignUp) {
      if (password !== confirmPassword) {
        showAppAlert("Passwords do not match", "Enter the same password in both fields.");
        return;
      }
    }
    setLoading(true);
    if (isSignUp) {
      const { error, needsEmailConfirmation } = await signUp(trimmedEmail, password);
      setLoading(false);
      if (error) {
        showAppAlert("Sign up failed", error.message);
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
      showAppAlert("Sign in failed", error.message);
      return;
    }
  };

  const busy = loading || googleLoading;
  const glassSurface = isDark ? "rgba(15,23,42,0.74)" : "rgba(248,250,252,0.96)";
  const glassBorder = isDark ? "rgba(148,163,184,0.26)" : "rgba(100,116,139,0.28)";
  const focusedBorder = isDark ? "rgba(129,140,248,0.84)" : "rgba(79,70,229,0.62)";
  const fieldTextColor = isDark ? "#F8FAFC" : theme.colors.textPrimary;
  const fieldMutedColor = isDark ? "rgba(203,213,225,0.62)" : "rgba(71,85,105,0.62)";
  const labelColor = isDark ? "rgba(226,232,240,0.8)" : theme.colors.textSecondary;
  const linkColor = isDark ? "#A5B4FC" : theme.colors.indigo[500];
  const borderFor = (key: Exclude<FocusKey, null>) => (focused === key ? focusedBorder : glassBorder);

  return (
    <Screen plain>
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor={theme.colors.background}
      />
      <AuthImageBackdrop isDark={isDark} />
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
              <Text style={[styles.label, { color: labelColor }]}>Email</Text>
              <View
                style={[
                  styles.fieldShell,
                  {
                    backgroundColor: glassSurface,
                    borderColor: borderFor("email"),
                  },
                  focused === "email" && { borderColor: focusedBorder },
                ]}
              >
                <TextInput
                  style={[styles.fieldInput, { color: fieldTextColor }]}
                  placeholder="you@example.com"
                  placeholderTextColor={fieldMutedColor}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  value={email}
                  onChangeText={setEmail}
                  onFocus={() => setFocused("email")}
                  onBlur={() => setFocused(null)}
                  editable={!busy}
                  underlineColorAndroid="transparent"
                />
              </View>

              <Text style={[styles.label, { color: labelColor }]}>Password</Text>
              <View
                style={[
                  styles.fieldShell,
                  styles.passwordOuter,
                  {
                    backgroundColor: glassSurface,
                    borderColor: borderFor("password"),
                  },
                  focused === "password" && { borderColor: focusedBorder },
                ]}
              >
                <TextInput
                  style={[styles.fieldInput, styles.passwordInput, { color: fieldTextColor }]}
                  placeholder="••••••••"
                  placeholderTextColor={fieldMutedColor}
                  secureTextEntry={!showPassword}
                  value={password}
                  onChangeText={setPassword}
                  onFocus={() => setFocused("password")}
                  onBlur={() => setFocused(null)}
                  autoCapitalize="none"
                  editable={!busy}
                  underlineColorAndroid="transparent"
                />
                <TouchableOpacity
                  style={styles.eyeButton}
                  onPress={() => setShowPassword((v) => !v)}
                  accessibilityLabel={showPassword ? "Hide password" : "Show password"}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  {showPassword ? (
                    <EyeOff size={20} color={fieldMutedColor} />
                  ) : (
                    <Eye size={20} color={fieldMutedColor} />
                  )}
                </TouchableOpacity>
              </View>

              {isSignUp && (
                <>
                  <Text style={[styles.label, { color: labelColor }]}>
                    Confirm password
                  </Text>
                  <View
                    style={[
                      styles.fieldShell,
                      styles.passwordOuter,
                      {
                        backgroundColor: glassSurface,
                        borderColor: borderFor("confirmPassword"),
                      },
                      focused === "confirmPassword" && { borderColor: focusedBorder },
                    ]}
                  >
                    <TextInput
                      style={[styles.fieldInput, styles.passwordInput, { color: fieldTextColor }]}
                      placeholder="••••••••"
                      placeholderTextColor={fieldMutedColor}
                      secureTextEntry={!showConfirmPassword}
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      onFocus={() => setFocused("confirmPassword")}
                      onBlur={() => setFocused(null)}
                      autoCapitalize="none"
                      editable={!busy}
                      underlineColorAndroid="transparent"
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
                      <EyeOff size={20} color={fieldMutedColor} />
                    ) : (
                      <Eye size={20} color={fieldMutedColor} />
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
                  <Text style={[styles.forgotText, { color: linkColor }]}>
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
                <Text style={[styles.switchText, { color: labelColor }]}>
                  {isSignUp ? "Already have an account? " : "New here? "}
                </Text>
                <Text style={[styles.switchAction, { color: linkColor }]}>
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
                <View style={[styles.dividerLine, { backgroundColor: glassBorder }]} />
                <Text style={[styles.dividerOr, { color: labelColor }]}>or</Text>
                <View style={[styles.dividerLine, { backgroundColor: glassBorder }]} />
              </View>

              {googleLoading ? (
                <ActivityIndicator color={theme.colors.indigo[500]} style={{ marginBottom: 8 }} />
              ) : (
                <TouchableOpacity
                  style={[
                    styles.googleBtn,
                    {
                      borderColor: glassBorder,
                      backgroundColor: isDark ? "rgba(15,23,42,0.68)" : "rgba(248,250,252,0.96)",
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
                    <Text style={[styles.googleBtnText, { color: fieldTextColor }]}>
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
  backdropLayer: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
  },
  backdropImage: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
  },
  backdropWash: {
    ...StyleSheet.absoluteFillObject,
  },
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
    shadowColor: "#020617",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 18,
    elevation: 1,
  },
  googleBtnContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    backgroundColor: "transparent",
  },
  googleBtnText: { fontSize: 16, fontWeight: "700", backgroundColor: "transparent" },
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
    shadowColor: "#020617",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 18,
    elevation: 1,
  },
  fieldShell: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 14,
    marginBottom: 14,
    width: "100%",
    shadowColor: "#020617",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 18,
    elevation: 1,
    overflow: "hidden",
  },
  fieldInput: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: "transparent",
  },
  passwordOuter: {
    paddingRight: 4,
  },
  passwordInput: {
    minWidth: 0,
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
