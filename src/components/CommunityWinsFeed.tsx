import { useCallback, useState } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  Image,
  ActivityIndicator,
  RefreshControl,
  ListRenderItem,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import * as Haptics from "expo-haptics";
import { Eye, Sparkles, ThumbsUp } from "lucide-react-native";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";
import { isSupabaseConfigured } from "../lib/env";
import {
  fetchCommunityWinsFeed,
  toggleCheer,
  type CommunityWinFeedItem,
} from "../lib/communityWinsApi";
import { CommunityWinDetailModal } from "./CommunityWinDetailModal";
import { CommunityWinImageLightbox } from "./CommunityWinImageLightbox";

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

type Props = {
  contentPaddingBottom?: number;
};

export function CommunityWinsFeed({ contentPaddingBottom = 24 }: Props) {
  const { theme, isDark } = useTheme();
  const { session } = useAuth();
  const [items, setItems] = useState<CommunityWinFeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [detailWin, setDetailWin] = useState<CommunityWinFeedItem | null>(null);
  const [lightboxUri, setLightboxUri] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured() || !session) {
      setItems([]);
      setLoading(false);
      return;
    }
    const data = await fetchCommunityWinsFeed(40);
    setItems(data);
    setLoading(false);
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const openDetail = useCallback((win: CommunityWinFeedItem) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setDetailWin(win);
  }, []);

  const handleCheer = useCallback(
    async (win: CommunityWinFeedItem) => {
      if (!session?.user) return;
      const res = await toggleCheer(win.id, win.viewerHasCheered);
      if (!res.ok) return;
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setItems((prev) =>
        prev.map((w) =>
          w.id === win.id
            ? {
                ...w,
                viewerHasCheered: !w.viewerHasCheered,
                cheerCount: w.viewerHasCheered ? Math.max(0, w.cheerCount - 1) : w.cheerCount + 1,
              }
            : w,
        ),
      );
    },
    [session?.user],
  );

  const renderItem: ListRenderItem<CommunityWinFeedItem> = useCallback(
    ({ item: win }) => {
      const isOwn = session?.user?.id === win.user_id;
      const handle = win.username ? `@${win.username}` : "Someone";
      return (
        <View
          style={[
            styles.card,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
              ...theme.shadow.card,
            },
          ]}
        >
          <View>
            <View style={styles.cardTop}>
              <Text style={[styles.handle, { color: theme.colors.cyan[400] }]} numberOfLines={1}>
                {handle}
              </Text>
              <View style={styles.cardTopRight}>
                <Text style={[styles.time, { color: theme.colors.textMuted }]}>{formatRelativeTime(win.created_at)}</Text>
                <Pressable
                  onPress={() => openDetail(win)}
                  style={({ pressed }) => [
                    styles.viewDetailsPill,
                    {
                      borderColor: theme.colors.border,
                      backgroundColor: isDark
                        ? "rgba(99,102,241,0.18)"
                        : "rgba(79,70,229,0.1)",
                      opacity: pressed ? 0.88 : 1,
                    },
                  ]}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel={`View details, ${win.title}`}
                >
                  <Eye size={16} color={theme.colors.indigo[400]} strokeWidth={2.2} />
                  <Text style={[styles.viewDetailsPillText, { color: theme.colors.indigo[400] }]}>View details</Text>
                </Pressable>
              </View>
            </View>
            <Text style={[styles.missionTitle, { color: theme.colors.textPrimary }]} numberOfLines={2}>
              {win.title}
            </Text>
            {win.memory_image_url ? (
              <Image
                source={{ uri: win.memory_image_url }}
                style={styles.memImg}
                resizeMode="cover"
                accessibilityIgnoresInvertColors
              />
            ) : null}
            {win.memory_note ? (
              <Text style={[styles.memNote, { color: theme.colors.textSecondary }]} numberOfLines={6}>
                {win.memory_note}
              </Text>
            ) : null}
          </View>
          <View style={styles.cheerRow}>
            <Pressable
              onPress={() => void handleCheer(win)}
              disabled={isOwn}
              style={({ pressed }) => [
                styles.cheerTap,
                { opacity: isOwn ? 0.55 : pressed ? 0.7 : 1 },
              ]}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel={
                isOwn
                  ? `${win.cheerCount} cheers on your win`
                  : win.viewerHasCheered
                    ? "Unlike, remove cheer"
                    : "Cheer"
              }
              accessibilityState={{ disabled: isOwn, selected: win.viewerHasCheered }}
            >
              <ThumbsUp
                size={17}
                color={win.viewerHasCheered ? theme.colors.indigo[400] : theme.colors.textMuted}
                fill={win.viewerHasCheered ? theme.colors.indigo[400] : "transparent"}
                strokeWidth={2}
              />
              <Text
                style={[
                  styles.cheerCount,
                  { color: win.viewerHasCheered ? theme.colors.indigo[400] : theme.colors.textMuted },
                ]}
              >
                {win.cheerCount}
              </Text>
            </Pressable>
            {isOwn ? (
              <Text style={[styles.ownHint, { color: theme.colors.textMuted }]}>Your win</Text>
            ) : null}
          </View>
        </View>
      );
    },
    [session?.user?.id, theme, isDark, openDetail, handleCheer],
  );

  if (!isSupabaseConfigured()) {
    return (
      <View style={[styles.emptyCard, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
        <Text style={[styles.emptyTitle, { color: theme.colors.textPrimary }]}>Community wins</Text>
        <Text style={[styles.emptyBody, { color: theme.colors.textSecondary }]}>
          Connect the app to your account to see community wins.
        </Text>
      </View>
    );
  }

  if (!session) {
    return (
      <View style={[styles.emptyCard, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
        <Text style={[styles.emptyTitle, { color: theme.colors.textPrimary }]}>Sign in</Text>
        <Text style={[styles.emptyBody, { color: theme.colors.textSecondary }]}>
          Sign in to browse wins and cheer others on.
        </Text>
      </View>
    );
  }

  if (loading && items.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={theme.colors.indigo[500]} />
      </View>
    );
  }

  return (
    <>
      <FlatList
        style={{ flex: 1 }}
        data={items}
        keyExtractor={(w) => w.id}
        renderItem={renderItem}
        contentContainerStyle={{ paddingBottom: contentPaddingBottom, flexGrow: 1 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.indigo[400]} />
        }
        ListEmptyComponent={
          <View style={[styles.emptyCard, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
            <Sparkles size={28} color={theme.colors.amber[500]} />
            <Text style={[styles.emptyTitle, { color: theme.colors.textPrimary, marginTop: 12 }]}>No wins yet</Text>
            <Text style={[styles.emptyBody, { color: theme.colors.textSecondary }]}>
              Complete a public mini mission and choose to post it here. Pull to refresh.
            </Text>
          </View>
        }
        showsVerticalScrollIndicator={false}
      />
      <CommunityWinDetailModal
        visible={detailWin !== null}
        win={detailWin}
        onClose={() => setDetailWin(null)}
        onPressImage={(uri) => setLightboxUri(uri)}
      />
      <CommunityWinImageLightbox
        visible={lightboxUri !== null}
        imageUri={lightboxUri}
        onClose={() => setLightboxUri(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  centered: { paddingVertical: 40, alignItems: "center" },
  emptyCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    alignItems: "center",
  },
  emptyTitle: { fontSize: 18, fontWeight: "800", textAlign: "center" },
  emptyBody: { fontSize: 14, lineHeight: 20, marginTop: 8, textAlign: "center" },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 14,
  },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  cardTopRight: { flexDirection: "row", alignItems: "center", gap: 6 },
  handle: { fontSize: 14, fontWeight: "800", flex: 1, marginRight: 8, minWidth: 0 },
  time: { fontSize: 12, fontWeight: "600" },
  viewDetailsPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 9999,
    borderWidth: 1,
  },
  viewDetailsPillText: { fontSize: 13, fontWeight: "800" },
  missionTitle: { fontSize: 17, fontWeight: "800", marginBottom: 10 },
  memImg: { width: "100%", height: 140, borderRadius: 12, marginBottom: 10 },
  memNote: { fontSize: 14, lineHeight: 20, marginBottom: 12 },
  cheerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  cheerTap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 2,
    paddingRight: 4,
  },
  cheerCount: {
    fontSize: 12,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
    minWidth: 14,
  },
  ownHint: { fontSize: 12, fontWeight: "600" },
});
