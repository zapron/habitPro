import { Text } from "../../src/components/AppText";
import {
  useEffect,
  useState } from "react";
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  StatusBar,
} from "react-native";
import { useRouter } from "expo-router";
import { Screen } from "../../src/components/Screen";
import { useTheme } from "../../src/context/ThemeContext";
import { useAuth } from "../../src/context/AuthContext";
import { Button } from "../../src/components/Button";
import { getPasswordResetRedirectUrl } from "../../src/lib/authRedirects";
import { backOrReplace } from "../../src/lib/navigation";
import { getSupabase } from "../../src/lib/supabase";
import { showAppAlert } from "../../src/context/AppDialogContext";

const FORM_MAX_WIDTH = 400;

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { theme, isDark } = useTheme();
  const { supabaseConfigured, session } = useAuth();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (supabaseConfigured && session) {
      router.replace("/");
    }
  }, [supabaseConfigured, session, router]);

  const onSend = async () => {
    const trimmed = email.trim();
    if (!trimmed) {
      showAppAlert("Email required", "Enter the email you used to sign up.");
      return;
    }
    const supabase = getSupabase();
    if (!supabase) {
      showAppAlert("Not configured", "Supabase is not configured.");
      return;
    }
    setSubmitting(true);
    const redirectTo = getPasswordResetRedirectUrl();
    const { error } = await supabase.auth.resetPasswordForEmail(trimmed, { redirectTo });
    setSubmitting(false);
    if (error) {
      showAppAlert("Could not send email", error.message);
      return;
    }
    showAppAlert(
      "Check your inbox",
      "If an account exists for that email, we sent reset instructions. Open the link on this device to choose a new password.",
      [{ text: "OK", onPress: () => backOrReplace(router, "/login") }],
    );
  };

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
          <Text style={[styles.kicker, { color: theme.colors.cyan[400] }]}>Account recovery</Text>
          <Text style={[styles.title, { color: theme.colors.textPrimary }]}>Forgot password</Text>
          <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]}>
            Enter your email and we will send a link to reset your password.
          </Text>

          {!supabaseConfigured && (
            <View
              style={[
                styles.banner,
                { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
              ]}
            >
              <Text style={[styles.bannerText, { color: theme.colors.textSecondary }]}>
                Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY, then restart Expo.
              </Text>
            </View>
          )}

          {supabaseConfigured && (
            <>
              <Text style={[styles.label, { color: theme.colors.textSecondary }]}>Email</Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: theme.colors.surface,
                    borderColor: focused ? theme.colors.indigo[500] : theme.colors.border,
                    color: theme.colors.textPrimary,
                  },
                ]}
                placeholder="you@example.com"
                placeholderTextColor={theme.colors.textMuted}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                value={email}
                onChangeText={setEmail}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                editable={!submitting}
              />

              {submitting ? (
                <ActivityIndicator color={theme.colors.indigo[500]} style={styles.loader} />
              ) : (
                <Button title="Send reset link" onPress={() => void onSend()} style={{ marginTop: 8 }} />
              )}

              <TouchableOpacity
                style={styles.backRow}
                onPress={() => backOrReplace(router, "/login")}
                activeOpacity={0.8}
                disabled={submitting}
              >
                <Text style={[styles.backText, { color: theme.colors.indigo[500] }]}>
                  Back to sign in
                </Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, width: "100%" },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingVertical: 32,
    width: "100%",
    alignItems: "center",
  },
  form: { width: "100%", alignSelf: "center" },
  kicker: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
    marginBottom: 8,
    alignSelf: "flex-start",
    width: "100%",
  },
  title: { fontSize: 26, fontWeight: "800", marginBottom: 10, alignSelf: "flex-start", width: "100%" },
  subtitle: { fontSize: 14, lineHeight: 20, marginBottom: 24, alignSelf: "flex-start", width: "100%" },
  banner: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
  },
  bannerText: { fontSize: 13, lineHeight: 19, textAlign: "center" },
  label: { fontSize: 12, fontWeight: "600", marginBottom: 8, alignSelf: "flex-start", width: "100%" },
  input: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 16,
    fontSize: 16,
    width: "100%",
  },
  loader: { marginTop: 16 },
  backRow: { marginTop: 24, alignItems: "center", paddingVertical: 8 },
  backText: { fontSize: 15, fontWeight: "700" },
});
