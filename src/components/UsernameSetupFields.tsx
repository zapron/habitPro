import { useCallback, useEffect, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from "react-native";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";
import { isSupabaseConfigured } from "../lib/env";
import { getSupabase } from "../lib/supabase";
import { validateUsername } from "../lib/profileUsername";
import { useHabitStore } from "../store/habitStore";

type Props = {
  /** Tighter layout for Profile hero vs Settings sheet */
  compact?: boolean;
};

export function UsernameSetupFields({ compact = false }: Props) {
  const { theme } = useTheme();
  const { session } = useAuth();
  const username = useHabitStore((s) => s.username);
  const setUsername = useHabitStore((s) => s.setUsername);
  const xp = useHabitStore((s) => s.xp);
  const [usernameDraft, setUsernameDraft] = useState("");
  const [usernameSaving, setUsernameSaving] = useState(false);

  useEffect(() => {
    setUsernameDraft(username ?? "");
  }, [username]);

  const handleSaveUsername = useCallback(async () => {
    if (!session?.user?.id) return;
    if (username) return;
    const supabase = getSupabase();
    if (!supabase) return;

    const v = validateUsername(usernameDraft);
    if (v.ok === false) {
      Alert.alert("Invalid username", v.message);
      return;
    }

    setUsernameSaving(true);
    try {
      const { error } = await supabase.from("profiles").upsert(
        { id: session.user.id, xp, username: v.value },
        { onConflict: "id" },
      );
      if (error) {
        const code = (error as { code?: string }).code;
        const taken =
          code === "23505" ||
          error.message.toLowerCase().includes("duplicate") ||
          error.message.toLowerCase().includes("unique");
        Alert.alert("Could not save username", taken ? "That username is already taken." : error.message);
        return;
      }
      setUsername(v.value);
    } finally {
      setUsernameSaving(false);
    }
  }, [session?.user, username, usernameDraft, xp, setUsername]);

  if (!isSupabaseConfigured() || !session?.user || username) {
    return null;
  }

  return (
    <View style={[styles.block, compact && styles.blockCompact]}>
      <Text style={[styles.hint, { color: theme.colors.textMuted }, compact && styles.hintCompact]}>
        Set a public username (once) for group missions and invites
      </Text>
      <View style={[styles.row, compact && styles.rowCompact]}>
        <TextInput
          value={usernameDraft}
          onChangeText={setUsernameDraft}
          placeholder="your_handle"
          placeholderTextColor={theme.colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={20}
          style={[
            styles.input,
            compact && styles.inputCompact,
            {
              color: theme.colors.textPrimary,
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.background,
            },
          ]}
        />
        <TouchableOpacity
          style={[
            styles.saveBtn,
            compact && styles.saveBtnCompact,
            { backgroundColor: theme.colors.indigo[600], opacity: usernameSaving ? 0.7 : 1 },
          ]}
          onPress={() => void handleSaveUsername()}
          disabled={usernameSaving}
          activeOpacity={0.88}
        >
          {usernameSaving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Save</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { marginTop: 10, gap: 8 },
  blockCompact: { marginTop: 8, gap: 6 },
  hint: { fontSize: 12, lineHeight: 16 },
  hintCompact: { fontSize: 11, lineHeight: 15 },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  rowCompact: { gap: 8 },
  input: {
    flex: 1,
    minWidth: 0,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    fontWeight: "600",
  },
  inputCompact: {
    paddingVertical: 8,
    fontSize: 14,
    borderRadius: 10,
  },
  saveBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    minWidth: 76,
    alignItems: "center",
    justifyContent: "center",
  },
  saveBtnCompact: {
    paddingVertical: 8,
    borderRadius: 10,
    minWidth: 68,
  },
  saveText: { color: "#fff", fontWeight: "800", fontSize: 14 },
});
