import { Text } from "./AppText";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  InteractionManager,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import { MessageCircle, Send, Trash2, X } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../context/ThemeContext";
import { formatRelativeTime } from "../lib/communityWinFeedFormat";
import {
  deleteCommunityWinComment,
  fetchCommunityWinComments,
  postCommunityWinComment,
  type CommunityWinComment,
} from "../lib/communityWinsApi";

/**
 * POC: comment thread for a Community win. Structurally a clone of
 * CommunityWinCheerersModal (same sheet/grabber/KeyboardAvoidingView shell)
 * with a composer added and a delete affordance that's visible only to the
 * comment's own author or the win's owner — exactly the permission split
 * tested against RLS in the local migration.
 */

function initialsFromUsername(username: string | null): string {
  if (!username || !username.trim()) return "?";
  const u = username.trim().toLowerCase();
  const parts = u.replace(/_/g, " ").split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  if (u.length >= 2) return u.slice(0, 2).toUpperCase();
  return u[0].toUpperCase();
}

const SHEET_MAX_SCREEN_RATIO = 0.9;

type Props = {
  visible: boolean;
  winId: string | null;
  /** So the delete affordance can show for the win's owner, not just the comment's author. */
  winOwnerUserId: string | null;
  sessionUserId: string | null | undefined;
  onClose: () => void;
};

export function CommunityWinCommentsModal({ visible, winId, winOwnerUserId, sessionUserId, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const { theme, isDark } = useTheme();
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<CommunityWinComment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const bottomPad = Math.max(insets.bottom, theme.spacing.md);
  const sheetMaxPx = windowHeight * SHEET_MAX_SCREEN_RATIO;

  const load = async () => {
    if (!winId) return;
    setLoading(true);
    setError(null);
    const res = await fetchCommunityWinComments(winId);
    if (res.ok === false) {
      setError(res.error);
      setItems([]);
    } else {
      setItems(res.items);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!visible || !winId) return;
    let cancelled = false;
    const task = InteractionManager.runAfterInteractions(() => {
      void (async () => {
        if (cancelled) return;
        await load();
      })();
    });
    return () => {
      cancelled = true;
      task.cancel?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, winId]);

  const handleSend = async () => {
    if (!winId || posting) return;
    const body = draft.trim();
    if (!body) return;
    setPosting(true);
    const res = await postCommunityWinComment(winId, body);
    setPosting(false);
    if (res.ok === false) {
      Alert.alert("Couldn't post comment", res.error, [{ text: "OK" }]);
      return;
    }
    setDraft("");
    await load();
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  };

  const handleDelete = (comment: CommunityWinComment) => {
    Alert.alert(
      sessionUserId === comment.authorId ? "Delete comment?" : "Remove this comment from your post?",
      sessionUserId === comment.authorId
        ? "This removes your comment for everyone."
        : "This removes it for everyone, since it's on your post.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: sessionUserId === comment.authorId ? "Delete" : "Remove",
          style: "destructive",
          onPress: () => {
            void (async () => {
              setItems((prev) => prev.filter((c) => c.id !== comment.id));
              const res = await deleteCommunityWinComment(comment.id);
              if (res.ok === false) {
                Alert.alert("Couldn't remove comment", res.error, [{ text: "OK" }]);
                await load();
              }
            })();
          },
        },
      ],
    );
  };

  const headerCount = items.length;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <Pressable
          style={[StyleSheet.absoluteFillObject, { backgroundColor: isDark ? "rgba(0,0,0,.45)" : "rgba(0,0,0,.22)" }]}
          onPress={onClose}
          accessibilityLabel="Dismiss"
          accessibilityRole="button"
        />
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          pointerEvents="box-none"
          style={[styles.kav, { paddingTop: insets.top }]}
        >
          <View
            style={[
              styles.sheet,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
                paddingTop: theme.spacing.xs,
                maxHeight: sheetMaxPx,
                height: sheetMaxPx,
                ...theme.shadow.card,
              },
            ]}
          >
            <View style={styles.grabberHeaderRow}>
              <View style={styles.grabberHeaderSide} />
              <View style={styles.grabberWrap}>
                <View style={[styles.grabber, { backgroundColor: theme.colors.slate[600] }]} />
              </View>
              <Pressable
                onPress={onClose}
                hitSlop={12}
                style={[styles.closeBtn, { backgroundColor: theme.colors.surfaceElevated, borderColor: theme.colors.border }]}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <X size={theme.icon.lg} color={theme.colors.textSecondary} strokeWidth={2.2} />
              </Pressable>
            </View>

            <View style={[styles.headerRow, { paddingHorizontal: theme.spacing.md + 4 }]}>
              <MessageCircle size={18} color={theme.colors.textSecondary} />
              <Text style={[styles.headerTitle, { color: theme.colors.textPrimary }]}>
                {headerCount === 1 ? "1 comment" : `${headerCount} comments`}
              </Text>
            </View>

            <View style={[styles.listShell, { borderTopColor: theme.colors.border }]}>
              {loading ? (
                <View style={[styles.center, { paddingVertical: theme.spacing.lg }]}>
                  <ActivityIndicator size="small" color={theme.colors.textMuted} />
                </View>
              ) : error ? (
                <View style={[styles.center, { paddingVertical: theme.spacing.lg }]}>
                  <Text style={{ color: theme.colors.textSecondary, textAlign: "center" }}>{error}</Text>
                </View>
              ) : items.length === 0 ? (
                <View style={[styles.center, { paddingVertical: theme.spacing.lg }]}>
                  <Text style={{ color: theme.colors.textSecondary, fontWeight: "600" }}>
                    No comments yet. Be the first.
                  </Text>
                </View>
              ) : (
                <ScrollView
                  ref={scrollRef}
                  style={styles.listScroll}
                  contentContainerStyle={[
                    styles.list,
                    { paddingBottom: theme.spacing.sm, paddingHorizontal: theme.spacing.md + 4 },
                  ]}
                  keyboardShouldPersistTaps="handled"
                >
                  {items.map((c) => {
                    const canDelete = sessionUserId === c.authorId || sessionUserId === winOwnerUserId;
                    return (
                      <View key={c.id} style={styles.row}>
                        <View
                          style={[
                            styles.rowAvatar,
                            { backgroundColor: theme.colors.surfaceElevated, borderColor: theme.colors.border },
                          ]}
                        >
                          {c.avatarUrl ? (
                            <Image source={{ uri: c.avatarUrl }} style={styles.rowAvatarPhoto} resizeMode="cover" />
                          ) : (
                            <Text style={[styles.rowAvatarInitials, { color: theme.colors.textSecondary }]}>
                              {initialsFromUsername(c.username)}
                            </Text>
                          )}
                        </View>
                        <View style={styles.rowTextCol}>
                          <View style={styles.rowTop}>
                            <Text style={[styles.rowHandle, { color: theme.colors.textPrimary }]} numberOfLines={1}>
                              {c.username ?? "Someone"}
                            </Text>
                            <Text style={[styles.rowTime, { color: theme.colors.textMuted }]}>
                              {formatRelativeTime(c.createdAt)}
                            </Text>
                          </View>
                          <Text style={[styles.rowBody, { color: theme.colors.textPrimary }]}>{c.body}</Text>
                          {canDelete ? (
                            <Pressable
                              onPress={() => handleDelete(c)}
                              hitSlop={8}
                              style={styles.deleteBtn}
                              accessibilityRole="button"
                              accessibilityLabel="Remove comment"
                            >
                              <Trash2 size={13} color={theme.colors.maroon[500]} />
                              <Text style={[styles.deleteLabel, { color: theme.colors.maroon[500] }]}>
                                {sessionUserId === c.authorId ? "Delete" : "Remove"}
                              </Text>
                            </Pressable>
                          ) : null}
                        </View>
                      </View>
                    );
                  })}
                </ScrollView>
              )}
            </View>

            <View
              style={[
                styles.composer,
                { borderTopColor: theme.colors.border, paddingBottom: bottomPad, paddingHorizontal: theme.spacing.md + 4 },
              ]}
            >
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder="Add a comment…"
                placeholderTextColor={theme.colors.textMuted}
                style={[
                  styles.input,
                  {
                    color: theme.colors.textPrimary,
                    backgroundColor: theme.colors.surfaceElevated,
                    borderColor: theme.colors.border,
                  },
                ]}
                multiline
                maxLength={500}
                editable={!posting}
              />
              <Pressable
                onPress={handleSend}
                disabled={posting || !draft.trim()}
                style={[
                  styles.sendBtn,
                  { backgroundColor: draft.trim() ? theme.colors.green[500] : theme.colors.surfaceElevated },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Post comment"
              >
                {posting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Send size={16} color={draft.trim() ? "#fff" : theme.colors.textMuted} />
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: { flex: 1, justifyContent: "flex-end" },
  kav: { flex: 1, justifyContent: "flex-end", maxHeight: "100%" },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: 1 },
  grabberHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  grabberHeaderSide: { width: 40, height: 40 },
  grabberWrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingBottom: 4 },
  grabber: { width: 40, height: 5, borderRadius: 3 },
  closeBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingBottom: 10 },
  headerTitle: { fontWeight: "800", fontSize: 15 },
  listShell: { flex: 1, borderTopWidth: StyleSheet.hairlineWidth },
  listScroll: { flex: 1 },
  center: { paddingHorizontal: 16, alignItems: "center", justifyContent: "center" },
  list: { paddingTop: 12, gap: 16 },
  row: { flexDirection: "row", gap: 10 },
  rowAvatar: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, alignItems: "center", justifyContent: "center", flexShrink: 0, overflow: "hidden" },
  rowAvatarPhoto: { width: 34, height: 34 },
  rowAvatarInitials: { fontSize: 11, fontWeight: "800" },
  rowTextCol: { flex: 1, minWidth: 0 },
  rowTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  rowHandle: { fontWeight: "800", fontSize: 13 },
  rowTime: { fontSize: 11, fontWeight: "600" },
  rowBody: { fontSize: 13.5, lineHeight: 19, marginTop: 2 },
  deleteBtn: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4, alignSelf: "flex-start" },
  deleteLabel: { fontSize: 11.5, fontWeight: "700" },
  composer: { flexDirection: "row", alignItems: "flex-end", gap: 10, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10 },
  input: { flex: 1, borderWidth: 1, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10, fontSize: 13.5, maxHeight: 90 },
  sendBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", flexShrink: 0 },
});
