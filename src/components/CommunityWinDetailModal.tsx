import { Text } from "./AppText";
import {
  Modal,
  View,
  ScrollView,
  Pressable,
  Image,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Radio, X } from "lucide-react-native";
import { useTheme } from "../context/ThemeContext";
import type { CommunityWinFeedItem } from "../lib/communityWinsApi";
import { buildStreakCelebrationKicker } from "../lib/communityStreakFeedCopy";

function formatRelativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatCompletedAt(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

type Props = {
  visible: boolean;
  win: CommunityWinFeedItem | null;
  onClose: () => void;
  onPressImage: (uri: string) => void;
};

export function CommunityWinDetailModal({ visible, win, onClose, onPressImage }: Props) {
  const insets = useSafeAreaInsets();
  const { theme, isDark } = useTheme();

  if (!win) return null;

  const handle = win.username ? `@${win.username}` : "Someone";
  const streakKicker =
    win.feed_source === "habit_streak" &&
    typeof win.streak_mission_day === "number" &&
    typeof win.streak_count_at_post === "number"
      ? buildStreakCelebrationKicker({
          displayName: handle,
          missionTitle: win.title,
          missionDay: win.streak_mission_day,
          streakCount: win.streak_count_at_post,
        })
      : null;
  const isLiveSquadWin = win.feed_source === "mini" && Boolean(win.live_squad_id);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <Pressable style={styles.backdropDim} onPress={onClose} accessibilityLabel="Dismiss" />
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          pointerEvents="box-none"
          style={[styles.kav, { paddingTop: insets.top }]}
        >
          <View
            style={[
              styles.sheet,
              {
                backgroundColor: theme.colors.surfaceElevated,
                borderColor: theme.colors.border,
                paddingBottom: Math.max(insets.bottom, 12),
                ...theme.shadow.card,
              },
            ]}
          >
          <View style={styles.sheetHeader}>
            <View style={styles.headerTextCol}>
              <Text style={[styles.handle, { color: theme.colors.cyan[400] }]} numberOfLines={1}>
                {handle}
              </Text>
              <Text style={[styles.metaLine, { color: theme.colors.textMuted }]}>
                Posted {formatRelativeTime(win.created_at)} · Completed {formatCompletedAt(win.completed_at)}
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              hitSlop={12}
              style={[styles.closeBtn, { backgroundColor: theme.colors.surface }]}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <X size={22} color={theme.colors.textMuted} />
            </Pressable>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator
            nestedScrollEnabled
          >
            {streakKicker ? (
              <View
                style={[
                  styles.streakBanner,
                  {
                    borderLeftColor: theme.colors.amber[500],
                    backgroundColor: isDark ? "rgba(245, 158, 11, 0.12)" : "rgba(234, 88, 12, 0.09)",
                  },
                ]}
              >
                <Text style={[styles.streakLine1, { color: theme.colors.textPrimary }]}>{streakKicker.line1}</Text>
                <Text style={[styles.streakMission, { color: theme.colors.amber[500] }]} numberOfLines={2}>
                  {streakKicker.missionLine}
                </Text>
              </View>
            ) : null}
            <Text style={[styles.title, { color: theme.colors.textPrimary }]}>{win.title}</Text>

            {win.memory_image_url ? (
              <Pressable
                onPress={() => onPressImage(win.memory_image_url!)}
                style={({ pressed }) => [styles.heroImgWrap, pressed && { opacity: 0.92 }]}
                accessibilityRole="image"
                accessibilityLabel="View full photo"
              >
                <Image
                  source={{ uri: win.memory_image_url }}
                  style={[styles.heroImg, { backgroundColor: isDark ? "rgba(255,255,255,0.06)" : theme.colors.surface }]}
                  resizeMode="cover"
                />
                {isLiveSquadWin ? (
                  <View
                    pointerEvents="none"
                    style={[
                      styles.liveSquadPhotoBadge,
                      {
                        backgroundColor: isDark ? "rgba(8, 47, 73, 0.88)" : "rgba(236, 254, 255, 0.94)",
                        borderColor: isDark ? "rgba(34, 211, 238, 0.42)" : "rgba(6, 182, 212, 0.28)",
                      },
                    ]}
                  >
                    <Radio size={12} color={theme.colors.cyan[400]} strokeWidth={2.4} />
                    <Text style={[styles.liveSquadPhotoBadgeText, { color: theme.colors.cyan[400] }]} numberOfLines={1}>
                      Live Squad
                    </Text>
                  </View>
                ) : null}
                <Text style={[styles.tapHint, { color: theme.colors.textMuted }]}>Tap for full screen</Text>
              </Pressable>
            ) : null}

            {win.memory_note ? (
              <Text style={[styles.note, { color: theme.colors.textSecondary }]}>{win.memory_note}</Text>
            ) : (
              <Text style={[styles.noNote, { color: theme.colors.textMuted }]}>No note with this win.</Text>
            )}
          </ScrollView>
        </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdropDim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  kav: {
    flex: 1,
    justifyContent: "flex-end",
    maxHeight: "100%",
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
    maxHeight: "92%",
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 12,
  },
  headerTextCol: { flex: 1, minWidth: 0 },
  handle: { fontSize: 16, fontWeight: "800" },
  metaLine: { fontSize: 12, fontWeight: "600", marginTop: 4, lineHeight: 17 },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  scroll: { flexGrow: 0 },
  scrollContent: { paddingBottom: 20 },
  streakBanner: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderLeftWidth: 4,
    borderRadius: 12,
    marginBottom: 14,
  },
  streakLine1: { fontSize: 15, fontWeight: "800", lineHeight: 21 },
  streakMission: { fontSize: 13, fontWeight: "700", marginTop: 4, lineHeight: 18 },
  title: { fontSize: 20, fontWeight: "800", marginBottom: 14, lineHeight: 26 },
  heroImgWrap: {
    position: "relative",
  },
  heroImg: {
    width: "100%",
    height: 220,
    borderRadius: 14,
    marginBottom: 6,
  },
  liveSquadPhotoBadge: {
    position: "absolute",
    left: 12,
    top: 12,
    maxWidth: 142,
    minHeight: 28,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 9999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  liveSquadPhotoBadgeText: {
    flexShrink: 1,
    fontSize: 12,
    lineHeight: 14,
    fontWeight: "900",
  },
  tapHint: { fontSize: 11, fontWeight: "600", marginBottom: 16 },
  note: { fontSize: 16, lineHeight: 24 },
  noNote: { fontSize: 14, fontStyle: "italic" },
});
