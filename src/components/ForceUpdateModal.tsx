import { Text } from "./AppText";
import {
  Modal,
  View,
  Image,
  Pressable,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  StatusBar,
  Platform,
  Linking,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "../context/ThemeContext";
import { GlassTopHighlight } from "./GlassTopHighlight";

type Props = {
  visible: boolean;
  message: string | null;
  downloadUrl: string | null;
  /** Version string to display prominently below the hero card, e.g. "1.3.0". */
  version?: string | null;
  /** Optional hero image for the card; falls back to a gradient when absent. */
  imageUrl?: string | null;
  /** Structured bullet-point changelog; falls back to `message` as a paragraph when empty. */
  changelog?: string[];
  /** Optional "See full changelog" link. */
  changelogUrl?: string | null;
};

export function ForceUpdateModal({
  visible,
  message,
  downloadUrl,
  version,
  imageUrl,
  changelog = [],
  changelogUrl,
}: Props) {
  const { theme, isDark } = useTheme();

  const openDownload = () => {
    if (!downloadUrl) return;
    void Linking.openURL(downloadUrl).catch(() => {});
  };

  const openChangelog = () => {
    if (!changelogUrl) return;
    void Linking.openURL(changelogUrl).catch(() => {});
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
      <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <Text style={[styles.eyebrow, { color: theme.colors.amber[500] }]}>UPDATE REQUIRED</Text>

          <View
            style={[
              styles.heroCard,
              { borderColor: theme.colors.border, borderRadius: theme.radius.lg, ...theme.shadow.card },
            ]}
          >
            {imageUrl ? (
              <Image source={{ uri: imageUrl }} style={styles.heroImage} resizeMode="cover" />
            ) : (
              <LinearGradient
                colors={isDark ? ["#4338ca", "#0e7490"] : ["#6366f1", "#0891b2"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.heroImage}
              />
            )}
            <GlassTopHighlight radius={theme.radius.lg} />
          </View>

          {version ? (
            <Text style={[styles.versionText, { color: theme.colors.textPrimary }]}>Version {version}</Text>
          ) : null}

          {changelog.length > 0 ? (
            <View style={styles.changelogList}>
              {changelog.map((line, index) => (
                <View key={`${index}-${line}`} style={styles.changelogRow}>
                  <View style={[styles.bulletDot, { backgroundColor: theme.colors.indigo[400] }]} />
                  <Text style={[styles.changelogText, { color: theme.colors.textSecondary }]}>{line}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={[styles.body, { color: theme.colors.textSecondary }]}>
              {message?.trim().length
                ? message
                : "A newer version of HabitPro is required to continue."}
            </Text>
          )}

          {changelogUrl ? (
            <Pressable onPress={openChangelog} hitSlop={8} accessibilityRole="link" accessibilityLabel="See full changelog">
              <Text style={[styles.changelogLink, { color: theme.colors.indigo[400] }]}>See full changelog →</Text>
            </Pressable>
          ) : null}
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: theme.colors.indigo[600] }, !downloadUrl && { opacity: 0.45 }]}
            onPress={openDownload}
            disabled={!downloadUrl}
            activeOpacity={0.85}
          >
            <Text style={styles.btnText}>{downloadUrl ? "Update" : "No download link set"}</Text>
          </TouchableOpacity>
          {Platform.OS === "android" ? (
            <Text style={[styles.hint, { color: theme.colors.textMuted }]}>
              Install the new APK over this one, then reopen the app.
            </Text>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 24, paddingTop: 24 },
  scrollContent: { flexGrow: 1, justifyContent: "center", paddingBottom: 24 },
  eyebrow: { fontSize: 12, fontWeight: "900", letterSpacing: 1.6, textAlign: "center", marginBottom: 14 },
  heroCard: {
    width: "100%",
    aspectRatio: 16 / 10,
    borderWidth: 1,
    overflow: "hidden",
    marginBottom: 18,
  },
  heroImage: { width: "100%", height: "100%" },
  versionText: { fontSize: 24, fontWeight: "900", textAlign: "center", marginBottom: 18, letterSpacing: -0.3 },
  body: { fontSize: 15, lineHeight: 22, textAlign: "center" },
  changelogList: { gap: 12 },
  changelogRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  bulletDot: { width: 6, height: 6, borderRadius: 3, marginTop: 7, flexShrink: 0 },
  changelogText: { flex: 1, fontSize: 15, lineHeight: 22, fontWeight: "600" },
  changelogLink: { fontSize: 14, fontWeight: "800", textAlign: "center", marginTop: 16 },
  footer: { paddingTop: 12, paddingBottom: 8 },
  btn: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 14,
    alignItems: "center",
  },
  btnText: { color: "#ffffff", fontWeight: "800", fontSize: 16 },
  hint: { marginTop: 14, fontSize: 13, lineHeight: 18, textAlign: "center" },
});
