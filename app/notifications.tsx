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

function groupMissionInviteSubtitle(n: NotificationRow): string {
  const p = n.payload ?? {};
  const u = p.inviter_username;
  const from =
    typeof u === "string" && u.trim().length > 0 ? `From @${u.trim().toLowerCase()}` : "Group mission";
  return `${from} · Tap to view in Compete`;
}

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
      const p = n.payload ?? {};
      const cid = typeof p.challenge_id === "string" ? p.challenge_id : "";
      const iid = typeof p.invite_id === "string" ? p.invite_id : "";
      if (cid || iid) {
        router.push({
          pathname: "/(tabs)/compete",
          params: {
            ...(iid ? { inviteId: iid } : {}),
            ...(cid ? { challengeId: cid } : {}),
            focusInvites: "1",
          },
        });
      } else {
        router.push({ pathname: "/(tabs)/compete", params: { focusInvites: "1" } });
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
              <View style={styles.rowInner}>
                {!item.read_at ? (
                  <View style={[styles.unreadDot, { backgroundColor: theme.colors.indigo[500] }]} />
                ) : (
                  <View style={styles.unreadSpacer} />
                )}
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.colors.textPrimary, fontWeight: "700" }}>
                    {item.type === "challenge_invite" ? "Group mission invite" : item.type}
                  </Text>
                  {item.type === "challenge_invite" ? (
                    <Text style={{ color: theme.colors.cyan[400], fontSize: 13, marginTop: 4, fontWeight: "600" }}>
                      {groupMissionInviteSubtitle(item)}
                    </Text>
                  ) : null}
                  <Text style={{ color: theme.colors.textSecondary, fontSize: 13, marginTop: 4 }}>
                    {new Date(item.created_at).toLocaleString()}
                  </Text>
                </View>
              </View>
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
  rowInner: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  unreadDot: { width: 10, height: 10, borderRadius: 9999, marginTop: 5 },
  unreadSpacer: { width: 10, marginTop: 5 },
});
