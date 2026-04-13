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
import { X } from "lucide-react-native";
import { useTheme } from "../context/ThemeContext";
import type { CommunityWinFeedItem } from "../lib/communityWinsApi";

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
            <Text style={[styles.title, { color: theme.colors.textPrimary }]}>{win.title}</Text>

            {win.memory_image_url ? (
              <Pressable
                onPress={() => onPressImage(win.memory_image_url!)}
                style={({ pressed }) => [pressed && { opacity: 0.92 }]}
                accessibilityRole="image"
                accessibilityLabel="View full photo"
              >
                <Image
                  source={{ uri: win.memory_image_url }}
                  style={[styles.heroImg, { backgroundColor: isDark ? "rgba(255,255,255,0.06)" : theme.colors.surface }]}
                  resizeMode="cover"
                />
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
  title: { fontSize: 20, fontWeight: "800", marginBottom: 14, lineHeight: 26 },
  heroImg: {
    width: "100%",
    height: 220,
    borderRadius: 14,
    marginBottom: 6,
  },
  tapHint: { fontSize: 11, fontWeight: "600", marginBottom: 16 },
  note: { fontSize: 16, lineHeight: 24 },
  noNote: { fontSize: 14, fontStyle: "italic" },
});
