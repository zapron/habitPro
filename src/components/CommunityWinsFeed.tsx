import { Text } from "./AppText";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  View,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { FlashList, type ListRenderItem } from "@shopify/flash-list";
import type { ReactElement } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { Flame } from "lucide-react-native";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { useUsernameGate } from "../context/UsernameGateContext";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { isSupabaseConfigured } from "../lib/env";
import {
  COMMUNITY_WINS_PAGE_SIZE,
  fetchCommunityWinsFeedPage,
  toggleCheer,
  type CommunityWinFeedItem,
} from "../lib/communityWinsApi";
import { traceAsync } from "../lib/perfTrace";
import { CommunityWinFeedPost } from "./CommunityWinFeedPost";
import { CommunityWinFeedSkeletonRow } from "./CommunityWinFeedSkeleton";
import { CommunityWinImageLightbox } from "./CommunityWinImageLightbox";
import { CommunityWinCheerersModal } from "./CommunityWinCheerersModal";
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
  listHeaderComponent?: ReactElement | null;
};

type ListRow =
  | { kind: "post"; win: CommunityWinFeedItem }
  | { kind: "skeleton"; id: string };

const COMMUNITY_FOCUS_RELOAD_TTL_MS = 45_000;

export function CommunityWinsFeed({
  contentPaddingBottom = 24,
  variant = "feed",
  canCheer = true,
  onCheerBlocked,
  validateCheerAccess,
  listHeaderComponent,
}: Props) {
  const { theme, isDark } = useTheme();
  const router = useRouter();
  const { session } = useAuth();
  const { showToast } = useToast();
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
  const itemsRef = useRef<CommunityWinFeedItem[]>([]);
  const initialLoadInFlight = useRef(false);
  const loadMoreInFlight = useRef(false);
  const lastInitialLoadAtRef = useRef(0);
  const userId = session?.user?.id ?? null;
  const userIdRef = useRef<string | null>(userId);

  itemsRef.current = items;

  useLayoutEffect(() => {
    userIdRef.current = userId;
    setItems([]);
    setHasMore(Boolean(userId && isSupabaseConfigured()));
    setExpandedById({});
    setLightboxUri(null);
    setCheerersSheet(null);
    setLoading(Boolean(userId && isSupabaseConfigured()));
    setRefreshing(false);
    setLoadingMore(false);
    initialLoadInFlight.current = false;
    loadMoreInFlight.current = false;
    lastInitialLoadAtRef.current = 0;
  }, [userId]);

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

  const loadInitial = useCallback(async (options?: { force?: boolean }) => {
    const requestedUserId = userId;
    if (!isSupabaseConfigured() || !requestedUserId) {
      setItems([]);
      setHasMore(false);
      setLoading(false);
      return;
    }
    if (initialLoadInFlight.current) return;
    const now = Date.now();
    if (
      !options?.force &&
      itemsRef.current.length > 0 &&
      now - lastInitialLoadAtRef.current < COMMUNITY_FOCUS_RELOAD_TTL_MS
    ) {
      return;
    }
    initialLoadInFlight.current = true;
    if (itemsRef.current.length === 0) setLoading(true);
    try {
      const { items: first, hasMore: more } = await traceAsync(
        "community.feed.loadInitial",
        () => fetchCommunityWinsFeedPage(0, COMMUNITY_WINS_PAGE_SIZE),
        { slowMs: 900 },
      );
      if (userIdRef.current !== requestedUserId) return;
      setItems(first);
      setHasMore(more);
      lastInitialLoadAtRef.current = Date.now();
    } catch (e: unknown) {
      console.warn("[habitPro] community loadInitial", e);
      if (userIdRef.current === requestedUserId) {
        showToast("Could not load Community wins.", "error");
      }
    } finally {
      initialLoadInFlight.current = false;
      if (userIdRef.current === requestedUserId) setLoading(false);
    }
  }, [showToast, userId]);

  useFocusEffect(
    useCallback(() => {
      void loadInitial();
    }, [loadInitial]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadInitial({ force: true });
    } finally {
      setRefreshing(false);
    }
  }, [loadInitial]);

  const loadMore = useCallback(async () => {
    const requestedUserId = userId;
    if (!requestedUserId || !hasMore || loadMoreInFlight.current) return;
    loadMoreInFlight.current = true;
    setLoadingMore(true);
    try {
      const offset = itemsRef.current.length;
      const { items: next, hasMore: more } = await traceAsync(
        "community.feed.loadMore",
        () => fetchCommunityWinsFeedPage(offset, COMMUNITY_WINS_PAGE_SIZE),
        { slowMs: 900, meta: { offset } },
      );
      if (userIdRef.current !== requestedUserId) return;
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
    } catch (e: unknown) {
      console.warn("[habitPro] community loadMore", e);
      if (userIdRef.current === requestedUserId) {
        showToast("Could not load more wins.", "error");
      }
    } finally {
      loadMoreInFlight.current = false;
      if (userIdRef.current === requestedUserId) setLoadingMore(false);
    }
  }, [hasMore, showToast, userId]);

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
      const ok = await requireUsername("community_like");
      if (!ok) return false;
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
      const firstResult = await traceAsync(
        "community.cheer.toggle",
        () => toggleCheer(win.id, win.viewerHasCheered),
        { slowMs: 800 },
      );
      let finalResult = firstResult;
      if (firstResult.ok === false && firstResult.reason === "premium_required" && validateCheerAccess) {
        const allowed = await validateCheerAccess();
        if (allowed) {
          finalResult = await traceAsync(
            "community.cheer.retryAfterPremium",
            () => toggleCheer(win.id, win.viewerHasCheered),
            { slowMs: 800 },
          );
        }
      }
      if (finalResult.ok === false) {
        setItems((prev) =>
          prev.map((w) =>
            w.id === win.id
              ? {
                  ...w,
                  viewerHasCheered: win.viewerHasCheered,
                  cheerCount: win.cheerCount,
                }
              : w,
          ),
        );
        if (finalResult.reason === "premium_required") {
          onCheerBlocked?.();
        } else {
          showToast(finalResult.error, "error");
        }
        return false;
      }
      return true;
    },
    [session?.user, canCheer, onCheerBlocked, requireUsername, showToast, validateCheerAccess],
  );

  const openPlayerStory = useCallback((win: CommunityWinFeedItem) => {
    if (userId && win.user_id === userId) {
      router.push({
        pathname: "/my-journey",
        params: {
          mode: "public",
          tab: win.feed_source === "mini" ? "minis" : "missions",
          focusWinId: win.id,
        },
      });
      return;
    }
    router.push({
      pathname: "/community-player/[id]",
      params: {
        id: win.user_id,
        username: win.username ?? "",
        displayName: win.displayName ?? "",
        xp: String(win.xp),
      },
    });
  }, [router, userId]);

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
          onOpenPlayer={openPlayerStory}
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
      openPlayerStory,
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
      <FlashList
        style={variant === "feed" ? { flex: 1, marginHorizontal: -feedBleed } : { flex: 1 }}
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
        ListHeaderComponent={listHeaderComponent}
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
              <Flame size={28} color={theme.colors.amber[500]} />
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
