import { Text } from "../src/components/AppText";
import {
  useCallback,
  useState } from "react";
import {
  View,
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
import { listNotifications, markAllNotificationsRead, markNotificationRead } from "../src/lib/groupChallengesApi";
import { parseCommunityWinCheerPayload } from "../src/lib/notificationPayloads";
import type { ChallengeNudgeKind, NotificationRow } from "../src/types/groupChallenge";

function groupMissionInviteSubtitle(n: NotificationRow): string {
  const p = n.payload ?? {};
  const u = p.inviter_username;
  const from =
    typeof u === "string" && u.trim().length > 0 ? `From @${u.trim().toLowerCase()}` : "Group mission";
  return `${from} · Tap to view in Compete`;
}

function inviteeLabel(p: Record<string, unknown>): string {
  const u = p.invitee_username;
  if (typeof u === "string" && u.trim().length > 0) return `@${u.trim().toLowerCase()}`;
  return "Someone";
}

function nudgeKindLabel(kind: unknown): string {
  const k = typeof kind === "string" ? kind : "";
  const map: Record<ChallengeNudgeKind, string> = {
    cheer: "Cheer",
    ping: "What's up?!",
    fire: "Fire",
    congrats: "Congrats",
    custom_note: "a custom note",
  };
  if (k in map) return map[k as ChallengeNudgeKind];
  return k.length > 0 ? k : "Nudge";
}

function notificationTitle(type: string, payload?: Record<string, unknown>): string {
  if (type === "streak_window_reminder") {
    const phase = payload?.reminder_phase;
    if (phase === "open") return "Streak window is open";
    if (phase === "closing") return "Almost time’s up";
    return "Streak window closing";
  }
  switch (type) {
    case "challenge_invite":
      return "Group mission invite";
    case "challenge_invite_accepted":
      return "Invite accepted";
    case "challenge_invite_declined":
      return "Invite declined";
    case "challenge_nudge":
      return "Squad nudge";
    case "challenge_squad_checkin":
      return "Squad streak";
    case "community_win_cheer": {
      const fs = payload?.feed_source;
      if (fs === "habit_streak") return "Love for your streak";
      return "Cheer on your win";
    }
    case "streak_repair_request":
      return "Streak repair request";
    case "streak_repair_result":
      return payload?.status === "applied" ? "Streak repaired! 🔥" : "Repair request declined";
    default:
      return type;
  }
}

function notificationSubtitle(n: NotificationRow): string | null {
  const p = n.payload ?? {};
  switch (n.type) {
    case "challenge_invite":
      return groupMissionInviteSubtitle(n);
    case "challenge_invite_accepted":
      return `${inviteeLabel(p)} joined your group mission · Tap to open`;
    case "challenge_invite_declined":
      return `${inviteeLabel(p)} declined · Tap to open`;
    case "challenge_nudge": {
      const from = p.from_username;
      const who =
        typeof from === "string" && from.trim().length > 0 ? `@${from.trim().toLowerCase()}` : "Someone";
      const kind = p.kind;
      if (kind === "custom_note") {
        const msg = typeof p.message === "string" ? p.message.trim() : "";
        const preview = msg.length > 80 ? `${msg.slice(0, 77)}…` : msg;
        return preview.length > 0
          ? `${who}: “${preview}” · Tap to open squad`
          : `${who} sent you a note · Tap to open squad`;
      }
      return `${who} sent you ${nudgeKindLabel(p.kind)} · Tap to open squad`;
    }
    case "challenge_squad_checkin": {
      const from = p.actor_username;
      const who =
        typeof from === "string" && from.trim().length > 0 ? `@${from.trim().toLowerCase()}` : "Someone";
      const mission =
        typeof p.habit_title === "string" && p.habit_title.trim().length > 0 ? p.habit_title.trim() : "Mission";
      return `${who} updated the streak on “${mission}” · Tap for squad`;
    }
    case "community_win_cheer": {
      const parsed = parseCommunityWinCheerPayload(p);
      if (!parsed) return "Someone cheered your Community win · Tap to view";
      const who =
        parsed.from_username && parsed.from_username !== "someone"
          ? `@${parsed.from_username.toLowerCase()}`
          : "Someone";
      const title = parsed.mini_mission_title;
      if (parsed.feed_source === "habit_streak") {
        return `${who} cheered your streak moment on “${title}” · Tap for Community`;
      }
      return `${who} cheered “${title}” · Tap for Community`;
    }
    case "streak_window_reminder": {
      const title = typeof p.habit_title === "string" ? p.habit_title : "Mission";
      const phase = p.reminder_phase;
      if (phase === "open") {
        return `You have 24 hours to finish today’s habit for “${title}” · Tap to open`;
      }
      if (phase === "closing") {
        return `You have almost an hour left. Complete your streak for “${title}” · Tap to open`;
      }
      return `About 1 hour left to mark today for “${title}” · Tap to open`;
    }
    case "streak_repair_request": {
      const dateStr = typeof p.date_str === "string" ? p.date_str : "a missed day";
      return `A squadmate needs approval to repair ${dateStr} · Tap to review`;
    }
    case "streak_repair_result": {
      const status = typeof p.status === "string" ? p.status : "";
      if (status === "applied") return "Your squad approved — streak is back! · Tap to view mission";
      if (p.reason === "insufficient_xp") return "Approved but insufficient XP · Earn more and retry";
      return "Your repair was declined by the squad · Tap to view";
    }
    default:
      return null;
  }
}

export default function NotificationsScreen() {
  const router = useRouter();
  const { theme, isDark } = useTheme();
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);

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
    const p = n.payload ?? {};
    const challengeId = typeof p.challenge_id === "string" ? p.challenge_id : "";

    if (n.type === "challenge_invite") {
      const iid = typeof p.invite_id === "string" ? p.invite_id : "";
      if (challengeId || iid) {
        router.push({
          pathname: "/(tabs)/compete",
          params: {
            ...(iid ? { inviteId: iid } : {}),
            ...(challengeId ? { challengeId } : {}),
            focusInvites: "1",
          },
        });
      } else {
        router.push({ pathname: "/(tabs)/compete", params: { focusInvites: "1" } });
      }
      return;
    }

    if (n.type === "challenge_invite_accepted" || n.type === "challenge_invite_declined") {
      if (challengeId) {
        router.push(`/challenge/${challengeId}`);
      } else {
        router.push("/(tabs)/compete");
      }
      return;
    }

    if ((n.type === "challenge_nudge" || n.type === "challenge_squad_checkin" || n.type === "streak_repair_request") && challengeId) {
      router.push(`/challenge/${challengeId}`);
      return;
    }

    if (n.type === "streak_repair_result") {
      const hid = typeof p.habit_id === "string" ? p.habit_id : "";
      if (hid) {
        router.push(`/habit/${hid}`);
      } else if (challengeId) {
        router.push(`/challenge/${challengeId}`);
      } else {
        router.push("/(tabs)/compete");
      }
      return;
    }

    if (n.type === "community_win_cheer") {
      router.push({ pathname: "/(tabs)/community" });
      return;
    }

    if (n.type === "streak_window_reminder") {
      const hid = typeof p.habit_id === "string" ? p.habit_id : "";
      if (hid) {
        router.push(`/habit/${hid}`);
      }
    }
  };

  const hasUnread = items.some((n) => !n.read_at);

  const onMarkAllRead = async () => {
    if (!hasUnread || markingAll) return;
    setMarkingAll(true);
    try {
      await markAllNotificationsRead();
      const nowIso = new Date().toISOString();
      setItems((prev) => prev.map((n) => (n.read_at ? n : { ...n, read_at: nowIso })));
    } finally {
      setMarkingAll(false);
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
        <TouchableOpacity
          style={[
            styles.markAllBtn,
            {
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.surface,
              opacity: !hasUnread || markingAll ? 0.55 : 1,
            },
          ]}
          onPress={() => void onMarkAllRead()}
          disabled={!hasUnread || markingAll}
          accessibilityRole="button"
          accessibilityLabel={markingAll ? "Marking all notifications read" : "Mark all notifications read"}
        >
          <Text style={[styles.markAllText, { color: theme.colors.indigo[400] }]}>
            {markingAll ? "Marking…" : "Mark all read"}
          </Text>
        </TouchableOpacity>
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
                    {notificationTitle(item.type, item.payload)}
                  </Text>
                  {notificationSubtitle(item) ? (
                    <Text style={{ color: theme.colors.cyan[400], fontSize: 13, marginTop: 4, fontWeight: "600" }}>
                      {notificationSubtitle(item)}
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
  markAllBtn: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 9999, borderWidth: 1 },
  markAllText: { fontWeight: "800", fontSize: 12, letterSpacing: 0.2 },
  row: { borderRadius: 12, borderWidth: 1, padding: 14, marginBottom: 10 },
  rowInner: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  unreadDot: { width: 10, height: 10, borderRadius: 9999, marginTop: 5 },
  unreadSpacer: { width: 10, marginTop: 5 },
});
