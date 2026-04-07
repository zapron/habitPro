import { Modal, View, Text, TouchableOpacity, StyleSheet, StatusBar, Platform, Linking } from "react-native";
import { useTheme } from "../context/ThemeContext";

type Props = {
  visible: boolean;
  message: string | null;
  downloadUrl: string | null;
};

export function ForceUpdateModal({ visible, message, downloadUrl }: Props) {
  const { theme, isDark } = useTheme();

  const openDownload = () => {
    if (!downloadUrl) return;
    void Linking.openURL(downloadUrl).catch(() => {});
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      presentationStyle="fullScreen"
      transparent={false}
      onRequestClose={() => {}}
    >
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={theme.colors.background} />
      <View style={[styles.center, { backgroundColor: theme.colors.background }]}>
        <Text style={[styles.title, { color: theme.colors.textPrimary }]}>Update required</Text>
        <Text style={[styles.body, { color: theme.colors.textSecondary }]}>
          {message?.trim().length
            ? message
            : "A newer version of habitPro is required. Download the latest APK to continue."}
        </Text>
        <TouchableOpacity
          style={[styles.btn, { backgroundColor: theme.colors.indigo[600] }, !downloadUrl && { opacity: 0.45 }]}
          onPress={openDownload}
          disabled={!downloadUrl}
          activeOpacity={0.85}
        >
          <Text style={styles.btnText}>{downloadUrl ? "Download update" : "No download link set"}</Text>
        </TouchableOpacity>
        {Platform.OS === "android" ? (
          <Text style={[styles.hint, { color: theme.colors.textMuted }]}>
            Install the new APK over this one, then reopen the app.
          </Text>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, paddingHorizontal: 28, justifyContent: "center" },
  title: { fontSize: 22, fontWeight: "800", marginBottom: 12, textAlign: "center" },
  body: { fontSize: 15, lineHeight: 22, marginBottom: 24, textAlign: "center" },
  btn: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 14,
    alignItems: "center",
  },
  btnText: { color: "#ffffff", fontWeight: "800", fontSize: 16 },
  hint: { marginTop: 18, fontSize: 13, lineHeight: 18, textAlign: "center" },
});
