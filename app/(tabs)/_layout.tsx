import { Tabs } from "expo-router";
import { Home, Swords, User, Users } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../../src/context/ThemeContext";

const TAB_BAR_ROW_HEIGHT = 49;
const TAB_BAR_BOTTOM_GAP = 14;
const TAB_BAR_TOP_PAD = 8;

export default function TabLayout() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  const paddingBottom = insets.bottom + TAB_BAR_BOTTOM_GAP;
  const tabBarHeight = TAB_BAR_ROW_HEIGHT + insets.bottom + TAB_BAR_BOTTOM_GAP;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
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
          tabBarIcon: ({ color, size }) => <Swords size={size ?? 22} color={color} />,
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
