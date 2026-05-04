import { Text } from "./AppText";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  View,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  ListRenderItem,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import * as Haptics from "expo-haptics";
import { Sparkles } from "lucide-react-native";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";
import { useUsernameGate } from "../context/UsernameGateContext";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { isSupabaseConfigured } from "../lib/env";
import {
  COMMUNITY_WINS_PAGE_SIZE,
  fetchCommunityWinsFeedPage,
  toggleCheer,
  type CommunityWinFeedItem,
} from "../lib/communityWinsApi";
import { CommunityWinFeedPost } from "./CommunityWinFeedPost";
import { CommunityWinFeedSkeletonRow } from "./CommunityWinFeedSkeleton";
import { CommunityWinImageLightbox } from "./CommunityWinImageLightbox";
import { CommunityWinCheerersModal } from "./CommunityWinCheerersModal";
import { CommunityPlayerDrawer, type CommunityPlayerDrawerSeed } from "./CommunityPlayerDrawer";
import { useCoachMark } from "../context/CoachMarkContext";

type CheerersSheetState = { winId: string; totalLikes: number };

type Props = {
  contentPaddingBottom?: number;
  /** `feed` = full-width photo, edge-to-edge; `cards` = bordered cards. */
  variant?: "feed" | "cards";
  /** When false, cheering is disabled (e.g. non–HabitPro Community browse mode). Default true. */
  canCheer?: boolean;
  /** Called when the viewer tries to cheer while `canCheer` is false. */
  onCheerBlocked?: () => void;
  /** Optional fresh entitlement check before sending the cheer API call. */
  validateCheerAccess?: () => Promise<boolean>;
};

type ListRow =
  | { kind: "post"; win: CommunityWinFeedItem }
  | { kind: "skeleton"; id: string };

export function CommunityWinsFeed({
  contentPaddingBottom = 24,
  variant = "feed",
  canCheer = true,
  onCheerBlocked,
  validateCheerAccess,
}: Props) {
  const { theme, isDark } = useTheme();
  const { session } = useAuth();
  const { requireUsername } = useUsernameGate();
  const reduceMotion = useReducedMotion();
  const [items, setItems] = useState<CommunityWinFeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [expandedById, setExpandedById] = useState<Record<string, boolean>>({});
  const [lightboxUri, setLightboxUri] = useState<string | null>(null);
  const [cheerersSheet, setCheerersSheet] = useState<CheerersSheetState | null>(null);
  const [playerDrawerWin, setPlayerDrawerWin] = useState<CommunityPlayerDrawerSeed | null>(null);
  const itemsRef = useRef<CommunityWinFeedItem[]>([]);
  const loadMoreInFlight = useRef(false);

  itemsRef.current = items;

  useEffect(() => {
    setCheerersSheet((s) => {
      if (!s) return s;
      const fresh = items.find((w) => w.id === s.winId);
      if (!fresh) return s;
      return { winId: fresh.id, totalLikes: fresh.cheerCount };
    });
  }, [items]);

  const feedBleed = variant === "feed" ? theme.spacing.sm : 0;
  const cheerCoachWinId = useMemo(() => {
    if (!canCheer || !session?.user?.id) return null;
    return items.find((w) => w.user_id !== session.user.id)?.id ?? null;
  }, [canCheer, items, session?.user?.id]);

  useCoachMark(
    "community_cheer",
    {
      title: "Cheer someone on",
      body: "A small cheer makes Community feel alive.",
      placement: "below",
    },
    Boolean(cheerCoachWinId),
    850,
  );

  const listRows: ListRow[] = useMemo(() => {
    if (loading && items.length === 0 && session && isSupabaseConfigured()) {
      return Array.from({ length: 6 }, (_, i) => ({ kind: "skeleton" as const, id: `sk-${i}` }));
    }
    return items.map((win) => ({ kind: "post" as const, win }));
  }, [loading, items, session]);

  const loadInitial = useCallback(async () => {
    if (!isSupabaseConfigured() || !session) {
      setItems([]);
      setHasMore(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { items: first, hasMore: more } = await fetchCommunityWinsFeedPage(0, COMMUNITY_WINS_PAGE_SIZE);
    setItems(first);
    setHasMore(more);
    setLoading(false);
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void loadInitial();
    }, [loadInitial]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadInitial();
    setRefreshing(false);
  }, [loadInitial]);

  const loadMore = useCallback(async () => {
    if (!session?.user || !hasMore || loadMoreInFlight.current) return;
    loadMoreInFlight.current = true;
    setLoadingMore(true);
    const offset = itemsRef.current.length;
    const { items: next, hasMore: more } = await fetchCommunityWinsFeedPage(offset, COMMUNITY_WINS_PAGE_SIZE);
    loadMoreInFlight.current = false;
    setLoadingMore(false);
    if (next.length === 0) {
      setHasMore(false);
      return;
    }
    setItems((prev) => {
      const seen = new Set(prev.map((x) => x.id));
      const merged = [...prev];
      for (const row of next) {
        if (!seen.has(row.id)) {
          seen.add(row.id);
          merged.push(row);
        }
      }
      return merged;
    });
    setHasMore(more);
  }, [session?.user, hasMore]);

  const toggleExpanded = useCallback((id: string) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setExpandedById((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const handleCheer = useCallback(
    async (win: CommunityWinFeedItem): Promise<boolean> => {
      if (!session?.user) return false;
      if (!canCheer) {
        onCheerBlocked?.();
        return false;
      }
      if (validateCheerAccess) {
        const allowed = await validateCheerAccess();
        if (!allowed) {
          onCheerBlocked?.();
          return false;
        }
      }
      const ok = await requireUsername("community_like");
      if (!ok) return false;
      const res = await toggleCheer(win.id, win.viewerHasCheered);
      if (!res.ok) return false;
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
      return true;
    },
    [session?.user, canCheer, onCheerBlocked, requireUsername, validateCheerAccess],
  );

  const renderItem: ListRenderItem<ListRow> = useCallback(
    ({ item }) => {
      if (item.kind === "skeleton") {
        return <CommunityWinFeedSkeletonRow theme={theme} isDark={isDark} />;
      }
      const win = item.win;
      return (
        <CommunityWinFeedPost
          win={win}
          variant={variant}
          isDark={isDark}
          theme={theme}
          sessionUserId={session?.user?.id}
          expanded={Boolean(expandedById[win.id])}
          reduceMotion={reduceMotion}
          onToggleExpanded={() => toggleExpanded(win.id)}
          onOpenLightbox={(uri) => setLightboxUri(uri)}
          onOpenPlayer={(w) =>
            setPlayerDrawerWin({
              userId: w.user_id,
              username: w.username,
              displayName: w.displayName,
              xp: w.xp,
            })
          }
          onCheer={handleCheer}
          onOpenCheerers={(w) => setCheerersSheet({ winId: w.id, totalLikes: w.cheerCount })}
          canCheer={canCheer}
          onCheerBlocked={onCheerBlocked}
          cheerCoachId={win.id === cheerCoachWinId ? "community_cheer" : null}
        />
      );
    },
    [
      session?.user?.id,
      theme,
      isDark,
      variant,
      expandedById,
      toggleExpanded,
      handleCheer,
      reduceMotion,
      canCheer,
      onCheerBlocked,
      cheerCoachWinId,
    ],
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

  return (
    <>
      <FlatList
        style={[{ flex: 1 }, variant === "feed" ? { marginHorizontal: -feedBleed } : null]}
        data={listRows}
        keyExtractor={(row) => (row.kind === "skeleton" ? row.id : row.win.id)}
        renderItem={renderItem}
        contentContainerStyle={{ paddingBottom: contentPaddingBottom, flexGrow: 1 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.indigo[400]} />
        }
        onEndReached={() => {
          if (loading && items.length === 0) return;
          void loadMore();
        }}
        onEndReachedThreshold={0.35}
        ListFooterComponent={
          loadingMore && hasMore && items.length > 0 ? (
            <View style={styles.footerLoading}>
              <ActivityIndicator size="small" color={theme.colors.indigo[400]} />
            </View>
          ) : null
        }
        ListEmptyComponent={
          !loading ? (
            <View style={[styles.emptyCard, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
              <Sparkles size={28} color={theme.colors.amber[500]} />
              <Text style={[styles.emptyTitle, { color: theme.colors.textPrimary, marginTop: 12 }]}>No wins yet</Text>
              <Text style={[styles.emptyBody, { color: theme.colors.textSecondary }]}>
                Complete a public mini mission and choose to post it here. Pull to refresh.
              </Text>
            </View>
          ) : null
        }
        showsVerticalScrollIndicator={false}
      />
      <CommunityWinImageLightbox
        visible={lightboxUri !== null}
        imageUri={lightboxUri}
        onClose={() => setLightboxUri(null)}
      />
      <CommunityWinCheerersModal
        visible={cheerersSheet !== null}
        winId={cheerersSheet?.winId ?? null}
        totalLikes={cheerersSheet?.totalLikes}
        onClose={() => setCheerersSheet(null)}
      />
      <CommunityPlayerDrawer
        visible={playerDrawerWin !== null}
        player={playerDrawerWin}
        onClose={() => setPlayerDrawerWin(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  emptyCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    alignItems: "center",
  },
  emptyTitle: { fontSize: 18, fontWeight: "800", textAlign: "center" },
  emptyBody: { fontSize: 14, lineHeight: 20, marginTop: 8, textAlign: "center" },
  footerLoading: { paddingVertical: 16, alignItems: "center" },
});
