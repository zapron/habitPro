import { Text } from "../../src/components/AppText";
import { StatusBar, StyleSheet, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Screen } from "../../src/components/Screen";
import { CommunityWinsFeed } from "../../src/components/CommunityWinsFeed";
import { useTheme } from "../../src/context/ThemeContext";
import { useToast } from "../../src/context/ToastContext";
import { PlusBadge } from "../../src/components/PlusBadge";
import { usePremium } from "../../src/context/PremiumContext";
import { usePlusUpsell } from "../../src/context/PlusUpsellContext";
import { useRefreshPremiumAccess } from "../../src/hooks/useRefreshPremiumAccess";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback } from "react";

export default function CommunityScreen() {
  const { theme, isDark } = useTheme();
  const { showToast } = useToast();
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, 16) + 8;
  const { isPremium, loading: premiumLoading } = usePremium();
  const { openUpsell } = usePlusUpsell();
  const refreshPremiumAccess = useRefreshPremiumAccess();
  const socialLocked = !isPremium || premiumLoading;

  useFocusEffect(
    useCallback(() => {
      void refreshPremiumAccess();
    }, [refreshPremiumAccess]),
  );

  const validateCheerAccess = useCallback(async () => {
    const serverPremium = await refreshPremiumAccess({ force: true, serverOnly: true });
    if (serverPremium === true) return true;
    const freshPremium = await refreshPremiumAccess({ force: true, cachedAccessOk: true });
    if (freshPremium === true) {
      showToast("Membership is still activating. Try again in a moment.", "info", 4200);
      return false;
    }
    openUpsell("community");
    return false;
  }, [openUpsell, refreshPremiumAccess, showToast]);

  const header = (
    <View style={[styles.introInner, { paddingHorizontal: theme.spacing.sm }]}>
      <Text
        style={[
          styles.title,
          { color: theme.colors.textPrimary, fontSize: theme.typography.h1 },
        ]}
      >
        Community
      </Text>
      <View style={styles.plusRow}>
        <PlusBadge withFlame />
        <Text
          style={[
            styles.plusHint,
            { color: theme.colors.textMuted, fontSize: theme.typography.micro },
          ]}
        >
          Post, Cheer & Get seen
        </Text>
      </View>
      <Text
        style={[
          styles.subtitle,
          {
            color: theme.colors.textSecondary,
            fontSize: theme.typography.caption,
          },
        ]}
      >
        Cheer mission streaks and Public mini missions
      </Text>
      {socialLocked ? (
        <TouchableOpacity
          style={[
            styles.upsellBanner,
            {
              backgroundColor: isDark
                ? "rgba(99, 102, 241, 0.14)"
                : "rgba(79, 70, 229, 0.08)",
              borderColor: isDark
                ? "rgba(129, 140, 248, 0.35)"
                : "rgba(79, 70, 229, 0.25)",
            },
          ]}
          onPress={() => openUpsell("community")}
          activeOpacity={0.88}
          accessibilityRole="button"
          accessibilityLabel="Browse Community. Cheering and posting are HabitPro Community. Tap to learn more."
        >
          <Text
            style={[
              styles.upsellBannerTitle,
              { color: theme.colors.textPrimary },
            ]}
          >
            You're browsing Community
          </Text>
          <Text
            style={[
              styles.upsellBannerBody,
              { color: theme.colors.textSecondary },
            ]}
          >
            Cheering and posting wins are HabitPro Community. Tap to see what's
            included.
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );

  return (
    <Screen>
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor={theme.colors.background}
      />
      <View style={styles.feedWrap}>
        <CommunityWinsFeed
          contentPaddingBottom={bottomPad}
          variant="feed"
          canCheer={!socialLocked}
          onCheerBlocked={() => openUpsell("community")}
          validateCheerAccess={validateCheerAccess}
          listHeaderComponent={header}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  introInner: { paddingBottom: 2 },
  title: { fontWeight: "900", letterSpacing: -0.4, marginBottom: 6 },
  plusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  plusHint: { fontWeight: "700" },
  subtitle: { lineHeight: 18, marginBottom: 14 },
  upsellBanner: {
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  upsellBannerTitle: { fontWeight: "800", fontSize: 14, marginBottom: 4 },
  upsellBannerBody: { fontSize: 12, lineHeight: 17, fontWeight: "600" },
  feedWrap: { flex: 1, minHeight: 200 },
});
