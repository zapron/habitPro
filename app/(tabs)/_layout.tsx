import { Tabs } from "expo-router";
import type { ReactNode } from "react";
import { Home, Swords, User, Users } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  TAB_BAR_BOTTOM_GAP,
  TAB_BAR_ROW_HEIGHT,
  tabBarOuterHeight,
} from "../../src/constants/tabBar";
import { useTheme } from "../../src/context/ThemeContext";
import { useInviteBadge } from "../../src/context/InviteBadgeContext";

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
      {showDot ? <View style={[styles.tabDot, { backgroundColor: theme.colors.red[500] }]} /> : null}
    </View>
  );
}

export default function TabLayout() {
  const { theme } = useTheme();
  const { pendingInviteCount } = useInviteBadge();
  const insets = useSafeAreaInsets();

  const paddingBottom = insets.bottom + TAB_BAR_BOTTOM_GAP;
  const tabBarHeight = tabBarOuterHeight(insets.bottom);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        lazy: true,
        tabBarActiveTintColor: theme.colors.indigo[400],
        tabBarInactiveTintColor: theme.colors.textMuted,
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
          tabBarIcon: ({ color, size }) => <Home size={size ?? 22} color={color} />,
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
          tabBarIcon: ({ color, size }) => <Users size={size ?? 22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, size }) => <User size={size ?? 22} color={color} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabIconWrap: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  tabDot: {
    position: "absolute",
    top: -2,
    right: -6,
    width: 8,
    height: 8,
    borderRadius: 999,
  },
});
