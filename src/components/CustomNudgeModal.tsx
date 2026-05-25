import { Text } from "./AppText";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../context/ThemeContext";
import { Button } from "./Button";

const MAX_LEN = 200;

type Props = {
  visible: boolean;
  onRequestClose: () => void;
  recipientLabel: string;
  busy: boolean;
  onSend: (text: string) => void;
};

export function CustomNudgeModal({ visible, onRequestClose, recipientLabel, busy, onSend }: Props) {
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [text, setText] = useState("");

  useEffect(() => {
    if (!visible) setText("");
  }, [visible]);

  const len = text.length;
  const canSend = len >= 1 && len <= MAX_LEN && !busy;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={busy ? undefined : onRequestClose}
      statusBarTranslucent
      accessibilityViewIsModal
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 12}
      >
        <View style={styles.root}>
          <Pressable
            style={[styles.backdrop, { backgroundColor: isDark ? "rgba(0,0,0,0.55)" : "rgba(15,23,42,0.45)" }]}
            onPress={busy ? undefined : onRequestClose}
            accessibilityRole="button"
            accessibilityLabel="Dismiss"
          />
          <View
            style={[
              styles.sheet,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
                borderRadius: theme.radius.lg,
                ...theme.shadow.card,
                marginBottom: Math.max(insets.bottom, 16),
              },
            ]}
          >
            <Text style={[styles.title, { color: theme.colors.textPrimary }]}>Custom note</Text>
            <Text style={[styles.sub, { color: theme.colors.textMuted }]}>
              One message to {recipientLabel} in this squad (HabitPro Community). You can only send this once per
              person.
            </Text>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Your message…"
              placeholderTextColor={theme.colors.textMuted}
              multiline
              maxLength={MAX_LEN}
              editable={!busy}
              style={[
                styles.input,
                {
                  color: theme.colors.textPrimary,
                  borderColor: theme.colors.border,
                  backgroundColor: isDark ? theme.colors.surfaceElevated : theme.colors.surfaceElevated,
                },
              ]}
              textAlignVertical="top"
            />
            <Text style={[styles.counter, { color: len > MAX_LEN ? theme.colors.red[500] : theme.colors.textMuted }]}>
              {len}/{MAX_LEN}
            </Text>
            <View style={styles.actions}>
              <Button title="Cancel" variant="secondary" onPress={onRequestClose} disabled={busy} />
              <View style={styles.sendWrap}>
                {busy ? (
                  <ActivityIndicator color={theme.colors.indigo[400]} />
                ) : (
                  <Button
                    title="Send"
                    variant="primary"
                    onPress={() => onSend(text.trim())}
                    disabled={!canSend}
                  />
                )}
              </View>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  root: {
    flex: 1,
    justifyContent: "flex-end",
    paddingHorizontal: 20,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    padding: 20,
    borderWidth: 1,
    maxHeight: "86%",
    maxWidth: 420,
    width: "100%",
    alignSelf: "center",
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: -0.2,
    marginBottom: 8,
  },
  sub: {
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 14,
  },
  input: {
    minHeight: 100,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    lineHeight: 22,
  },
  counter: {
    fontSize: 11,
    fontWeight: "600",
    alignSelf: "flex-end",
    marginTop: 6,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 16,
    gap: 12,
  },
  sendWrap: { minWidth: 100, alignItems: "flex-end" },
});
