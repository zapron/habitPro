import { useCallback, useEffect, useMemo, useState } from "react";
import { View, TouchableOpacity, StyleSheet, StatusBar, ScrollView, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { FlashList } from "@shopify/flash-list";
import { ArrowLeft, Trophy } from "lucide-react-native";
import { useShallow } from "zustand/react/shallow";
import { Text } from "../src/components/AppText";
import { Screen } from "../src/components/Screen";
import { HabitCard } from "../src/components/HabitCard";
import { useTheme } from "../src/context/ThemeContext";
import { useAuth } from "../src/context/AuthContext";
import { useHabitStore } from "../src/store/habitStore";
import { useUnseenReports } from "../src/hooks/useUnseenReports";
import { fetchHabitsHistoryPage } from "../src/lib/habitsHistoryApi";
import { HOT_WINDOW_HISTORY_PAGE_SIZE } from "../src/lib/sync";
import { backOrReplace } from "../src/lib/navigation";
import { needsMainMissionOutcome } from "../src/utils/mainMissionUi";
import { withAlpha } from "../src/styles/theme";
import { redesignPalette } from "../src/styles/redesignPalette";
import { fontFamily } from "../src/styles/fonts";
import type { Habit } from "../src/types/habit";

const ReportsFlashList = FlashList as any;
const habitKeyExtractor = (item: { id: string }) => item.id;

type Segment = "pending" | "accomplished" | "failed";

/**
 * Finished main missions, opened from the quiet "Reports ›" link on Home.
 * Pending = window ended, outcome not given yet (Home's outcome card answers
 * these too); Accomplished / Failed = the recorded outcome. Opening this
 * screen clears Home's "new report" dot.
 */
export default function ReportsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme, isDark, themePack } = useTheme();
  const rp = themePack === "minimalist" ? (isDark ? redesignPalette.dark : redesignPalette.light) : null;
  const { session } = useAuth();
  const params = useLocalSearchParams<{ segment?: string }>();
  const { habits, mergeFetchedHabit } = useHabitStore(
    useShallow((s) => ({ habits: s.habits, mergeFetchedHabit: s.mergeFetchedHabit })),
  );
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const counts = useMemo(() => {
    let pending = 0;
    let accomplished = 0;
    let failed = 0;
    for (const h of habits) {
      if (needsMainMissionOutcome(h, nowMs)) pending += 1;
      if (h.missionReport === "accomplished") accomplished += 1;
      if (h.missionReport === "failed") failed += 1;
    }
    return { pending, accomplished, failed };
  }, [habits, nowMs]);

  const [segment, setSegment] = useState<Segment>(() => {
    const p = params.segment;
    if (p === "pending" || p === "accomplished" || p === "failed") return p;
    return counts.pending > 0 ? "pending" : "accomplished";
  });

  const reportKeys = useMemo(
    () =>
      habits
        .filter((h) => h.missionReport === "accomplished" || h.missionReport === "failed")
        .map((h) => `${h.id}:${h.missionReport}`),
    [habits],
  );
  const { markAllSeen } = useUnseenReports(session?.user?.id, reportKeys);
  useEffect(() => {
    markAllSeen();
  }, [markAllSeen]);

  // Load More for accomplished/failed — the local store only holds a hot window
  // of history. Same "override" pattern Home used: before any explicit tap the
  // values derive live from `habits` (the store may still be hydrating); after a
  // tap the server's own answer takes over. Fetched items merge into the store.
  const [accomplishedFetchedOverride, setAccomplishedFetchedOverride] = useState<number | null>(null);
  const [accomplishedHasMoreOverride, setAccomplishedHasMoreOverride] = useState<boolean | null>(null);
  const [failedFetchedOverride, setFailedFetchedOverride] = useState<number | null>(null);
  const [failedHasMoreOverride, setFailedHasMoreOverride] = useState<boolean | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  // Deliberately start offsets at 0 rather than the store's count: the local
  // array can hold items from the old full sync, so its length isn't a safe offset.
  const accomplishedFetchedCount = accomplishedFetchedOverride ?? 0;
  const failedFetchedCount = failedFetchedOverride ?? 0;
  const accomplishedHasMore = accomplishedHasMoreOverride ?? counts.accomplished >= HOT_WINDOW_HISTORY_PAGE_SIZE;
  const failedHasMore = failedHasMoreOverride ?? counts.failed >= HOT_WINDOW_HISTORY_PAGE_SIZE;
  const segmentHasMore =
    segment === "accomplished" ? accomplishedHasMore : segment === "failed" ? failedHasMore : false;

  const loadMore = useCallback(async () => {
    if (loadingMore || segment === "pending") return;
    setLoadingMore(true);
    try {
      const status = segment;
      const offset = status === "accomplished" ? accomplishedFetchedCount : failedFetchedCount;
      const page = await fetchHabitsHistoryPage({ offset, limit: HOT_WINDOW_HISTORY_PAGE_SIZE, status });
      if (page) {
        for (const item of page.items) mergeFetchedHabit(item);
        if (status === "accomplished") {
          setAccomplishedFetchedOverride(offset + page.items.length);
          setAccomplishedHasMoreOverride(page.hasMore);
        } else {
          setFailedFetchedOverride(offset + page.items.length);
          setFailedHasMoreOverride(page.hasMore);
        }
      }
    } finally {
      setLoadingMore(false);
    }
  }, [accomplishedFetchedCount, failedFetchedCount, loadingMore, mergeFetchedHabit, segment]);

  const listData = useMemo(() => {
    if (segment === "pending") return habits.filter((h) => needsMainMissionOutcome(h, nowMs));
    return habits.filter((h) => h.missionReport === segment);
  }, [habits, segment, nowMs]);

  const renderItem = useCallback(
    ({ item, index }: { item: Habit; index: number }) => (
      <HabitCard item={item} nowMs={nowMs} index={index} redesignPalette={rp ? redesignPalette : null} />
    ),
    [nowMs, rp],
  );

  const textPrimary = rp ? rp.textPrimary : theme.colors.textPrimary;
  const textSecondary = rp ? rp.textSecondary : theme.colors.textSecondary;
  const border = rp ? rp.border : theme.colors.border;
  const surface = rp ? rp.chipBg : theme.colors.surface;

  const emptyCopy: Record<Segment, [string, string]> = {
    pending: ["Nothing pending", "When a mission's window ends, Home asks how it went. Anything you haven't answered yet waits here."],
    accomplished: ["No accomplished missions yet", "Missions you mark as accomplished are listed here."],
    failed: ["No failed missions", "Missions you mark as not made appear here."],
  };

  return (
    <Screen style={rp ? { backgroundColor: rp.screenBg } : undefined}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />

      <View style={styles.header}>
        <TouchableOpacity
          style={[styles.iconButton, { backgroundColor: surface, borderColor: border }]}
          onPress={() => backOrReplace(router, "/")}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <ArrowLeft size={theme.icon.xl} color={textPrimary} />
        </TouchableOpacity>
        <Text
          style={[
            styles.title,
            { color: textPrimary, fontSize: theme.typography.h1 },
            rp ? { fontFamily: fontFamily.manropeBold } : null,
          ]}
          numberOfLines={1}
        >
          Reports
        </Text>
      </View>

      <View style={[styles.segRow, { borderColor: border }]}>
        {(
          [
            ["pending", "Pending", counts.pending],
            ["accomplished", "Accomplished", counts.accomplished],
            ["failed", "Failed", counts.failed],
          ] as const
        ).map(([key, label, count]) => {
          const active = segment === key;
          return (
            <TouchableOpacity
              key={key}
              style={[
                styles.segBtn,
                active && {
                  backgroundColor: rp
                    ? rp.accentTint
                    : isDark
                      ? withAlpha(theme.colors.indigo[500], 20)
                      : withAlpha(theme.colors.indigo[600], 12),
                },
              ]}
              onPress={() => setSegment(key)}
              activeOpacity={0.85}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
            >
              <Text
                style={[
                  styles.segText,
                  { color: textSecondary },
                  rp ? { fontFamily: fontFamily.dmSansSemibold } : null,
                  active && { color: rp ? (isDark ? rp.textPrimary : rp.accentDark) : theme.colors.indigo[400] },
                ]}
                numberOfLines={1}
              >
                {label}
                {count > 0 ? ` (${count})` : ""}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.listWrap}>
        {listData.length === 0 ? (
          <ScrollView contentContainerStyle={styles.emptyContent} showsVerticalScrollIndicator={false}>
            <View style={[styles.emptyIcon, { backgroundColor: surface, borderColor: border }]}>
              <Trophy size={40} color={theme.colors.slate[500]} />
            </View>
            <Text style={[styles.emptyTitle, { color: textPrimary, fontSize: theme.typography.h3 }]}>
              {emptyCopy[segment][0]}
            </Text>
            <Text style={[styles.emptyDescription, { color: textSecondary }]}>{emptyCopy[segment][1]}</Text>
            {segmentHasMore ? (
              <TouchableOpacity onPress={loadMore} disabled={loadingMore} style={styles.emptyLoadOlder}>
                <Text style={{ color: theme.colors.indigo[400], fontWeight: "700" }}>
                  {loadingMore ? "Loading..." : "Load older reports"}
                </Text>
              </TouchableOpacity>
            ) : null}
          </ScrollView>
        ) : (
          <ReportsFlashList
            data={listData}
            renderItem={renderItem}
            estimatedItemSize={132}
            keyExtractor={habitKeyExtractor}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 12) + 24 }}
            ListFooterComponent={
              segmentHasMore ? (
                <View style={styles.loadMoreWrap}>
                  <TouchableOpacity
                    onPress={loadMore}
                    disabled={loadingMore}
                    accessibilityRole="button"
                    accessibilityLabel={`Load more ${segment} missions`}
                    style={[
                      styles.loadMoreButton,
                      {
                        borderColor: isDark ? withAlpha(theme.colors.indigo[400], 42) : withAlpha(theme.colors.indigo[600], 20),
                        opacity: loadingMore ? 0.78 : 1,
                      },
                    ]}
                  >
                    <LinearGradient
                      colors={
                        isDark
                          ? (["rgba(21, 128, 61, 0.82)", "rgba(6, 182, 212, 0.62)"] as const)
                          : ([theme.colors.indigo[500], theme.colors.cyan[500]] as const)
                      }
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.loadMoreGradient}
                    >
                      {loadingMore ? <ActivityIndicator size="small" color={theme.colors.white} /> : null}
                      <Text style={[styles.loadMoreText, { color: theme.colors.white }]}>
                        {loadingMore ? "Loading..." : `Load more ${segment}`}
                      </Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              ) : null
            }
          />
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 },
  iconButton: { padding: 8, borderRadius: 9999, borderWidth: 1 },
  title: { fontWeight: "800", flex: 1, minWidth: 0 },
  segRow: { flexDirection: "row", borderRadius: 12, borderWidth: 1, padding: 3, marginBottom: 12, gap: 4 },
  segBtn: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 36,
  },
  segText: { fontSize: 12, fontWeight: "700", textAlign: "center" },
  listWrap: { flex: 1, minHeight: 0 },
  emptyContent: { flexGrow: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24, paddingBottom: 60 },
  emptyIcon: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  emptyTitle: { fontWeight: "700", marginBottom: 8, textAlign: "center" },
  emptyDescription: { fontSize: 14, lineHeight: 20, textAlign: "center", maxWidth: 320 },
  emptyLoadOlder: { marginTop: 14, paddingVertical: 10, paddingHorizontal: 12 },
  loadMoreWrap: { paddingTop: 12, paddingBottom: 4, alignItems: "center" },
  loadMoreButton: { borderRadius: 9999, borderWidth: 1, overflow: "hidden" },
  loadMoreGradient: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  loadMoreText: { fontSize: 12, lineHeight: 16, fontWeight: "900" },
});
