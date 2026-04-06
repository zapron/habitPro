import { useCallback, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { ArrowLeft } from "lucide-react-native";
import { Screen } from "../src/components/Screen";
import { useTheme } from "../src/context/ThemeContext";
import { listNotifications, markNotificationRead } from "../src/lib/groupChallengesApi";
import type { NotificationRow } from "../src/types/groupChallenge";

export default function NotificationsScreen() {
  const router = useRouter();
  const { theme, isDark } = useTheme();
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await listNotifications(50);
      setItems(rows);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const onPressRow = async (n: NotificationRow) => {
    if (!n.read_at) {
      await markNotificationRead(n.id);
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)));
    }
    if (n.type === "challenge_invite") {
      const cid = n.payload?.challenge_id;
      if (typeof cid === "string") {
        router.push("/(tabs)/compete");
      }
    }
  };

  return (
    <Screen>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={theme.colors.background} />

      <View style={styles.header}>
        <TouchableOpacity
          style={[styles.iconButton, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
          onPress={() => router.back()}
        >
          <ArrowLeft size={theme.icon.xl} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.colors.textPrimary, fontSize: theme.typography.h1 }]}>Notifications</Text>
      </View>

      {loading ? (
        <ActivityIndicator color={theme.colors.indigo[400]} style={{ marginTop: 24 }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: 32, flexGrow: 1 }}
          ListEmptyComponent={
            <Text style={{ color: theme.colors.textMuted, marginTop: 14 }}>Nothing here yet.</Text>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[
                styles.row,
                {
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.surface,
                  opacity: item.read_at ? 0.72 : 1,
                },
              ]}
              onPress={() => void onPressRow(item)}
            >
              <Text style={{ color: theme.colors.textPrimary, fontWeight: "700" }}>
                {item.type === "challenge_invite" ? "Challenge invite" : item.type}
              </Text>
              <Text style={{ color: theme.colors.textSecondary, fontSize: 13, marginTop: 4 }}>
                {new Date(item.created_at).toLocaleString()}
              </Text>
            </TouchableOpacity>
          )}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 },
  iconButton: { padding: 8, borderRadius: 9999, borderWidth: 1 },
  title: { fontWeight: "800", flex: 1 },
  row: { borderRadius: 12, borderWidth: 1, padding: 14, marginBottom: 10 },
});
