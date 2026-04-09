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
import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import { Eye, EyeOff } from "lucide-react-native";
import { Screen } from "../../src/components/Screen";
import { useTheme } from "../../src/context/ThemeContext";
import { useAuth } from "../../src/context/AuthContext";
import { Button } from "../../src/components/Button";
import { getSupabase } from "../../src/lib/supabase";
import { tryCompleteAuthFromUrl } from "../../src/lib/oauthExchange";

const FORM_MAX_WIDTH = 400;
const MIN_LEN = 6;

export default function ResetPasswordScreen() {
  const router = useRouter();
  const { theme, isDark } = useTheme();
  const { supabaseConfigured, session, clearPasswordRecovery } = useAuth();
  const linkingUrl = Linking.useURL();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [focused, setFocused] = useState<"p" | "c" | null>(null);

  const borderFor = (key: "p" | "c") =>
    focused === key ? theme.colors.indigo[500] : theme.colors.border;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = getSupabase();
      if (!supabase) {
        if (!cancelled) setBootstrapping(false);
        return;
      }
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        if (!cancelled) setBootstrapping(false);
        return;
      }
      const url = linkingUrl ?? (await Linking.getInitialURL());
      await tryCompleteAuthFromUrl(url);
      if (!cancelled) setBootstrapping(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [linkingUrl]);

  const onSubmit = async () => {
    if (password.length < MIN_LEN) {
      Alert.alert("Password", `Use at least ${MIN_LEN} characters.`);
      return;
    }
    if (password !== confirm) {
      Alert.alert("Mismatch", "Enter the same password in both fields.");
      return;
    }
    const supabase = getSupabase();
    if (!supabase) {
      Alert.alert("Not configured", "Supabase is not configured.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      Alert.alert("Could not update password", error.message);
      return;
    }
    clearPasswordRecovery();
    Alert.alert("Password updated", "You can continue with your new password.", [
      { text: "OK", onPress: () => router.replace("/") },
    ]);
  };

  if (!supabaseConfigured) {
    return (
      <Screen plain>
        <View style={[styles.centered, { padding: 24 }]}>
          <Text style={{ color: theme.colors.textSecondary, textAlign: "center" }}>
            Configure Supabase in .env to reset your password.
          </Text>
          <Button title="Back to sign in" onPress={() => router.replace("/login")} style={{ marginTop: 20 }} />
        </View>
      </Screen>
    );
  }

  if (bootstrapping) {
    return (
      <Screen plain>
        <View style={[styles.centered, { padding: 24 }]}>
          <ActivityIndicator color={theme.colors.indigo[500]} />
          <Text style={[styles.hint, { color: theme.colors.textMuted, marginTop: 16 }]}>
            Opening reset link…
          </Text>
        </View>
      </Screen>
    );
  }

  if (!session) {
    return (
      <Screen plain>
        <StatusBar
          barStyle={isDark ? "light-content" : "dark-content"}
          backgroundColor={theme.colors.background}
        />
        <View style={[styles.centered, { padding: 24 }]}>
          <Text style={[styles.title, { color: theme.colors.textPrimary, textAlign: "center" }]}>
            Link invalid or expired
          </Text>
          <Text style={[styles.hint, { color: theme.colors.textSecondary, textAlign: "center", marginTop: 12 }]}>
            Request a new reset link from the sign-in screen.
          </Text>
          <Button title="Back to sign in" onPress={() => router.replace("/login")} style={{ marginTop: 24 }} />
        </View>
      </Screen>
    );
  }

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
          <Text style={[styles.title, { color: theme.colors.textPrimary }]}>Set new password</Text>
          <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]}>
            Choose a new password for your account.
          </Text>

          <Text style={[styles.label, { color: theme.colors.textSecondary }]}>New password</Text>
          <View
            style={[
              styles.passwordOuter,
              {
                backgroundColor: theme.colors.surface,
                borderColor: borderFor("p"),
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
              onFocus={() => setFocused("p")}
              onBlur={() => setFocused(null)}
              autoCapitalize="none"
              editable={!loading}
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

          <Text style={[styles.label, { color: theme.colors.textSecondary, marginTop: 4 }]}>
            Confirm password
          </Text>
          <View
            style={[
              styles.passwordOuter,
              {
                backgroundColor: theme.colors.surface,
                borderColor: borderFor("c"),
              },
            ]}
          >
            <TextInput
              style={[styles.passwordInput, { color: theme.colors.textPrimary }]}
              placeholder="••••••••"
              placeholderTextColor={theme.colors.textMuted}
              secureTextEntry={!showConfirm}
              value={confirm}
              onChangeText={setConfirm}
              onFocus={() => setFocused("c")}
              onBlur={() => setFocused(null)}
              autoCapitalize="none"
              editable={!loading}
            />
            <TouchableOpacity
              style={styles.eyeButton}
              onPress={() => setShowConfirm((v) => !v)}
              accessibilityLabel={showConfirm ? "Hide confirm password" : "Show confirm password"}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              {showConfirm ? (
                <EyeOff size={20} color={theme.colors.textMuted} />
              ) : (
                <Eye size={20} color={theme.colors.textMuted} />
              )}
            </TouchableOpacity>
          </View>

          {loading ? (
            <ActivityIndicator color={theme.colors.indigo[500]} style={styles.loader} />
          ) : (
            <Button title="Update password" onPress={() => void onSubmit()} style={{ marginTop: 12 }} />
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
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
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
  hint: { fontSize: 14, lineHeight: 20 },
  label: { fontSize: 12, fontWeight: "600", marginBottom: 8, alignSelf: "flex-start", width: "100%" },
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
  loader: { marginTop: 16 },
});
