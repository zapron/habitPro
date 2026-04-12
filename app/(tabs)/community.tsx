import { StatusBar, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Screen } from "../../src/components/Screen";
import { CommunityWinsFeed } from "../../src/components/CommunityWinsFeed";
import { useTheme } from "../../src/context/ThemeContext";

export default function CommunityScreen() {
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, 16) + 8;

  return (
    <Screen>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={theme.colors.background} />
      <Text style={[styles.title, { color: theme.colors.textPrimary, fontSize: theme.typography.h1 }]}>Community</Text>
      <Text style={[styles.subtitle, { color: theme.colors.textSecondary, fontSize: theme.typography.caption }]}>
        Cheer public mini wins and get seen. Post yours when you finish a public mini.
      </Text>
      <View style={styles.feedWrap}>
        <CommunityWinsFeed contentPaddingBottom={bottomPad} variant="feed" />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontWeight: "900", letterSpacing: -0.4, marginBottom: 6 },
  subtitle: { lineHeight: 18, marginBottom: 14 },
  feedWrap: { flex: 1, minHeight: 200 },
});
