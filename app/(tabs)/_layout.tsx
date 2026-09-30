import { Tabs } from "expo-router";
import type { BottomTabBarButtonProps } from "@react-navigation/bottom-tabs";
import type { ReactNode } from "react";
import { Home, Swords, User, Users } from "lucide-react-native";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  TAB_BAR_BOTTOM_GAP,
  TAB_BAR_ROW_HEIGHT,
  tabBarOuterHeight,
} from "../../src/constants/tabBar";
import { useTheme } from "../../src/context/ThemeContext";
import { useInviteBadge } from "../../src/context/InviteBadgeContext";
import { PulsingBorder } from "../../src/components/PulsingBorder";
import { redesignPalette } from "../../src/styles/redesignPalette";

const TAB_BAR_TOP_PAD = 8;

function TabIconWithDot({
  children,
  showDot,
}: {
  children: ReactNode;
  showDot: boolean;
}) {
  const { theme } = useTheme();
  return (
    <View style={styles.tabIconWrap}>
      {children}
      {showDot ? (
        <View style={styles.tabDotAnchor}>
          <PulsingBorder active={showDot} color={theme.colors.red[500]} size={8}>
            <View style={[styles.tabDot, { backgroundColor: theme.colors.red[500] }]} />
          </PulsingBorder>
        </View>
      ) : null}
    </View>
  );
}

export default function TabLayout() {
  const { theme, isDark, themePack } = useTheme();
  const { pendingInviteCount } = useInviteBadge();
  const insets = useSafeAreaInsets();

  const paddingBottom = insets.bottom + TAB_BAR_BOTTOM_GAP;
  const tabBarHeight = tabBarOuterHeight(insets.bottom);

  // Dark-mode-minimalist only: icon+label stay neutral regardless of
  // selection, and the whole tab item (icon and label together, not just
  // the icon) gets a squarish maroon background when selected — light mode
  // (and the classic theme pack) render exactly as before, untouched.
  const rp = themePack === "minimalist" ? (isDark ? redesignPalette.dark : redesignPalette.light) : null;
  const neutralizeSelection = Boolean(rp && isDark);
  const activeTintColor = neutralizeSelection ? theme.colors.textPrimary : theme.colors.indigo[400];

  // Custom tabBarButton so the maroon selection is a tight chip around the
  // icon+label content, not react-navigation's default full-height/width
  // fill of the whole tab slot (which read as one big harsh rectangle).
  // Only swapped in for dark-mode-minimalist; other cases fall through to
  // undefined below so the library renders its normal default button.
  const renderNeutralTabButton = neutralizeSelection
    ? (props: BottomTabBarButtonProps) => {
        const { children, style, onPress, onLongPress, accessibilityState, accessibilityLabel, testID } = props;
        const focused = Boolean(accessibilityState?.selected);
        return (
          <Pressable
            onPress={onPress}
            onLongPress={onLongPress}
            accessibilityState={accessibilityState}
            accessibilityLabel={accessibilityLabel}
            testID={testID}
            style={style}
          >
            <View style={[styles.tabButtonChip, focused ? { backgroundColor: rp!.accentTint } : null]}>
              {children}
            </View>
          </Pressable>
        );
      }
    : undefined;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        lazy: true,
        tabBarActiveTintColor: activeTintColor,
        tabBarInactiveTintColor: theme.colors.textMuted,
        tabBarButton: renderNeutralTabButton,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
          borderTopWidth: 1,
          height: tabBarHeight,
          paddingTop: TAB_BAR_TOP_PAD,
          paddingBottom,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "700" },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, size }) => (
            <TabIconWithDot showDot={false}>
              <Home size={size ?? 22} color={color} />
            </TabIconWithDot>
          ),
        }}
      />
      <Tabs.Screen
        name="compete"
        options={{
          title: "Compete",
          tabBarIcon: ({ color, size }) => (
            <TabIconWithDot showDot={pendingInviteCount > 0}>
              <Swords size={size ?? 22} color={color} />
            </TabIconWithDot>
          ),
        }}
      />
      <Tabs.Screen
        name="community"
        options={{
          title: "Community",
          tabBarIcon: ({ color, size }) => (
            <TabIconWithDot showDot={false}>
              <Users size={size ?? 22} color={color} />
            </TabIconWithDot>
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, size }) => (
            <TabIconWithDot showDot={false}>
              <User size={size ?? 22} color={color} />
            </TabIconWithDot>
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabButtonChip: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 6,
    marginVertical: 4,
    borderRadius: 12,
  },
  tabIconWrap: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  tabDotAnchor: {
    position: "absolute",
    top: -2,
    right: -6,
  },
  tabDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
});
