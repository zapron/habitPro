import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Image, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Heart, MoreHorizontal, X } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { Text } from "../AppText";
import { useTheme } from "../../context/ThemeContext";
import { useToast } from "../../context/ToastContext";
import { withAlpha } from "../../styles/theme";
import { storageThumbnailUri } from "../../utils/imageThumbnail";
import { MomentsViewToggle, type MomentsView } from "../MomentsViewToggle";
import type {
  LiveMiniMomentHeart,
  LiveMiniParticipantRow,
  LiveMiniProfileLabel,
} from "../../types/liveMiniMission";

/**
 * Live squad board, "Squad moments": every member's moments in one timeline,
 * newest first, updating in realtime as people log them mid-mission.
 *
 * Brand rule (two people in the logo): you are green, everyone else is maroon.
 * Hearts are silent: no notification, the owner's card plays a soft fill
 * sweep from the top when a new heart lands.
 *
 * Tapping a race card filters this feed to that player (filterUserId).
 * List | Cards: Cards shows one swipe shelf per player, in race order.
 */

const AVATAR = 22;
const PHOTO_MAX_H = 320;
const COLLAPSED_COUNT = 4;
const MIN_RATIO = 0.56; // tallest photo we allow (9:16)
/** Real aspect ratios already measured, by image url: a remounted or newly
 * revealed photo starts at its true height instead of jumping from 4:3. */
const ratioCache = new Map<string, number>();
/** "Show earlier" mounts this many more rows per frame, not all at once. */
const REVEAL_BATCH = 4;
const MAX_RATIO = 1.9; // widest

type FeedItem = {
  key: string;
  userId: string;
  taskId: string;
  label: string;
  note: string | null;
  imageUrl: string | null;
  loggedAtMs: number | null;
  sortMs: number;
  startedAtMs: number | null;
};

type Props = {
  participants: LiveMiniParticipantRow[];
  profiles: Record<string, LiveMiniProfileLabel>;
  userId: string | null;
  hearts: LiveMiniMomentHeart[];
  nowMs: number;
  onToggleHeart: (subjectUserId: string, taskId: string, on: boolean) => void;
  onOpenTile: (item: { label: string; note: string | null; uri: string | null }) => void;
  /** Your own moments you can still edit/delete (your run is live, drafts on this device). */
  editableTaskIds?: Set<string>;
  onMomentOptions?: (taskId: string, label: string) => void;
  /** Show only this player's moments (a race card is tapped). */
  filterUserId?: string | null;
  onClearFilter?: () => void;
  /** Player order for the Cards view shelves (race order). */
  shelfOrder?: string[];
};

function withVersion(url: string, version: string | null | undefined): string {
  if (!version) return url;
  return `${url}${url.includes("?") ? "&" : "?"}v=${encodeURIComponent(version)}`;
}

function nameFor(profile: LiveMiniProfileLabel | undefined): string {
  if (profile?.username) return `@${profile.username}`;
  return profile?.displayName ?? "Member";
}

function initialsFor(profile: LiveMiniProfileLabel | undefined): string {
  const base = profile?.displayName || profile?.username || "?";
  const parts = base.replace(/^@/, "").split(/[\s._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}

function agoLabel(ms: number | null, nowMs: number): string | null {
  if (ms == null) return null;
  const s = Math.max(0, Math.floor((nowMs - ms) / 1000));
  if (s < 60) return "now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
}

function intoRunLabel(loggedAtMs: number | null, startedAtMs: number | null): string | null {
  if (loggedAtMs == null || startedAtMs == null || loggedAtMs < startedAtMs) return null;
  const m = Math.floor((loggedAtMs - startedAtMs) / 60000);
  if (m < 1) return "at start";
  const h = Math.floor(m / 60);
  return `${h > 0 ? `${h}h ${m % 60}m` : `${m}m`} in`;
}

export const LiveSquadMomentsFeed = memo(function LiveSquadMomentsFeed({
  participants,
  profiles,
  userId,
  hearts,
  nowMs,
  onToggleHeart,
  onOpenTile,
  editableTaskIds,
  onMomentOptions,
  filterUserId = null,
  onClearFilter,
  shelfOrder,
}: Props) {
  const { theme, isDark } = useTheme();
  const { showToast } = useToast();
  const green = isDark ? theme.colors.green[500] : theme.colors.green[600];
  // The app token #8E1D33 is too dark to read on the dark surface; #c2405d is the website maroon.
  const maroon = isDark ? "#c2405d" : theme.colors.maroon[500];

  const items = useMemo<FeedItem[]>(() => {
    const out: FeedItem[] = [];
    for (const p of participants) {
      const gallery = p.memory_gallery ?? [];
      const updatedMs = Date.parse(p.updated_at) || 0;
      const startedAtMs = p.started_at ? Date.parse(p.started_at) || null : null;
      gallery.forEach((g, i) => {
        const loggedAtMs = g.loggedAt ? Date.parse(g.loggedAt) || null : null;
        out.push({
          key: `${p.user_id}|${g.taskId}`,
          userId: p.user_id,
          taskId: g.taskId,
          label: g.label,
          note: g.note,
          imageUrl: g.imageUrl ? withVersion(g.imageUrl, p.updated_at) : null,
          loggedAtMs,
          // Older builds sync no loggedAt: keep their gallery order, anchored at the row's last update.
          sortMs: loggedAtMs ?? updatedMs - (gallery.length - 1 - i) * 1000,
          startedAtMs,
        });
      });
    }
    return out.sort((a, b) => b.sortMs - a.sortMs);
  }, [participants]);

  const heartStats = useMemo(() => {
    const map = new Map<string, { count: number; mine: boolean }>();
    for (const h of hearts) {
      const key = `${h.subject_user_id}|${h.task_id}`;
      const cur = map.get(key) ?? { count: 0, mine: false };
      cur.count += 1;
      if (h.liker_id === userId) cur.mine = true;
      map.set(key, cur);
    }
    return map;
  }, [hearts, userId]);

  // "@rohan just added Moment 3": only for other people's moments that arrive
  // while this screen is open (not the ones already there on first load).
  const seenKeysRef = useRef<Set<string> | null>(null);
  useEffect(() => {
    const keys = new Set(items.map((i) => i.key));
    const seen = seenKeysRef.current;
    seenKeysRef.current = keys;
    if (!seen) return;
    const fresh = items.find((i) => !seen.has(i.key) && i.userId !== userId);
    if (fresh) showToast(`${nameFor(profiles[fresh.userId])} just added ${fresh.label}`, "info");
  }, [items, profiles, showToast, userId]);

  const [view, setView] = useState<MomentsView>("list");
  const filtered = useMemo(
    () => (filterUserId ? items.filter((i) => i.userId === filterUserId) : items),
    [filterUserId, items],
  );

  // Long runs (an 11-moment gym session) stay short: newest few, rest on tap.
  const [visibleCount, setVisibleCount] = useState(COLLAPSED_COUNT);
  const [revealing, setRevealing] = useState(false);
  const shown = filtered.slice(0, Math.max(COLLAPSED_COUNT, visibleCount));
  const hiddenCount = revealing ? 0 : filtered.length - shown.length;
  // Reveal the rest a few rows per frame so a run with many photos does not
  // mount (and decode) every image in one frame.
  useEffect(() => {
    if (!revealing) return undefined;
    if (visibleCount >= filtered.length) {
      setRevealing(false);
      return undefined;
    }
    const id = requestAnimationFrame(() => setVisibleCount((c) => c + REVEAL_BATCH));
    return () => cancelAnimationFrame(id);
  }, [filtered.length, revealing, visibleCount]);

  // Cards view: one shelf per player, race order, each oldest to newest.
  const shelves = useMemo(() => {
    if (view !== "cards") return [];
    const byUser = new Map<string, FeedItem[]>();
    for (const item of filtered) {
      const list = byUser.get(item.userId) ?? [];
      list.push(item);
      byUser.set(item.userId, list);
    }
    const order = [...(shelfOrder ?? []), ...byUser.keys()];
    const seen = new Set<string>();
    const out: { userId: string; items: FeedItem[] }[] = [];
    for (const uid of order) {
      if (seen.has(uid)) continue;
      seen.add(uid);
      const list = byUser.get(uid);
      if (list?.length) out.push({ userId: uid, items: [...list].sort((a, b) => a.sortMs - b.sortMs) });
    }
    return out;
  }, [filtered, shelfOrder, view]);

  const anyRunning = participants.some((p) => p.status === "in_progress");
  const moreButton =
    view === "list" && hiddenCount > 0 ? (
      <Pressable
        onPress={() => setRevealing(true)}
        accessibilityRole="button"
        style={({ pressed }) => [styles.moreButton, { borderColor: theme.colors.border, opacity: pressed ? 0.8 : 1 }]}
      >
        <Text style={[styles.moreText, { color: theme.colors.textPrimary }]}>
          Show {hiddenCount} earlier moment{hiddenCount === 1 ? "" : "s"}
        </Text>
      </Pressable>
    ) : null;
  if (items.length === 0 && !anyRunning) return null;

  return (
    <View style={styles.section}>
      <View style={styles.headerRow}>
        <Text style={[styles.sectionLabel, { color: theme.colors.textMuted }]}>
          {filterUserId
            ? `Moments · ${filtered.length} of ${items.length}`
            : `Squad moments${items.length > 0 ? ` · ${items.length}` : ""}`}
        </Text>
        {items.length > 0 ? <MomentsViewToggle value={view} onChange={setView} /> : null}
      </View>
      {filterUserId ? (
        <View style={styles.filterRow}>
          <View style={[styles.filterChip, { borderColor: theme.colors.textPrimary }]}>
            <Text style={[styles.filterText, { color: theme.colors.textPrimary }]} numberOfLines={1}>
              Only {filterUserId === userId ? "you" : nameFor(profiles[filterUserId])}
            </Text>
            {onClearFilter ? (
              <Pressable
                onPress={onClearFilter}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Show everyone's moments"
                style={[styles.filterClear, { backgroundColor: theme.colors.surfaceElevated }]}
              >
                <X size={12} color={theme.colors.textPrimary} strokeWidth={2.8} />
              </Pressable>
            ) : null}
          </View>
          <Text style={[styles.filterHint, { color: theme.colors.textMuted }]} numberOfLines={1}>
            Tap a name for their journey
          </Text>
        </View>
      ) : null}
      {filtered.length === 0 ? (
        <Text style={[styles.empty, { color: theme.colors.textSecondary }]}>
          {filterUserId ? "No moments from them yet." : "Moments show up here the second anyone logs one."}
        </Text>
      ) : view === "cards" ? (
        shelves.map((shelf) => (
          <MomentShelf
            key={shelf.userId}
            items={shelf.items}
            profile={profiles[shelf.userId]}
            isMine={shelf.userId === userId}
            accent={shelf.userId === userId ? green : maroon}
            onOpenTile={onOpenTile}
          />
        ))
      ) : (
        shown.map((item, index) => {
          const isMine = item.userId === userId;
          const stats = heartStats.get(item.key);
          return (
            <MomentRow
              key={item.key}
              item={item}
              profile={profiles[item.userId]}
              isMine={isMine}
              accent={isMine ? green : maroon}
              heartColor={maroon}
              heartCount={stats?.count ?? 0}
              heartedByMe={stats?.mine ?? false}
              nowMs={nowMs}
              onToggleHeart={onToggleHeart}
              onOpenTile={onOpenTile}
              onOptions={isMine && editableTaskIds?.has(item.taskId) ? onMomentOptions : undefined}
              last={index === shown.length - 1 && !moreButton}
            />
          );
        })
      )}
      {moreButton}
    </View>
  );
});

const SHELF_CARD_W = 132;
const SHELF_CARD_H = 150;

/** Cards view: one player's moments as a left-to-right swipe shelf. */
const MomentShelf = memo(function MomentShelf({
  items,
  profile,
  isMine,
  accent,
  onOpenTile,
}: {
  items: FeedItem[];
  profile: LiveMiniProfileLabel | undefined;
  isMine: boolean;
  accent: string;
  onOpenTile: (item: { label: string; note: string | null; uri: string | null }) => void;
}) {
  const { theme, isDark } = useTheme();
  const name = isMine ? "You" : nameFor(profile);
  return (
    <View style={styles.shelf}>
      <View style={styles.metaRow}>
        <View style={[styles.avatar, { borderColor: accent, backgroundColor: withAlpha(accent, isDark ? 18 : 10) }]}>
          {profile?.avatarUrl ? (
            <Image source={{ uri: profile.avatarUrl }} style={styles.avatarPhoto} resizeMethod="resize" fadeDuration={0} />
          ) : (
            <Text style={[styles.avatarText, { color: accent }]}>{initialsFor(profile)}</Text>
          )}
        </View>
        <Text style={[styles.name, { color: isMine ? accent : theme.colors.textPrimary }]} numberOfLines={1}>
          {name}
        </Text>
        <Text style={[styles.meta, { color: theme.colors.textMuted }]}>
          {items.length} moment{items.length === 1 ? "" : "s"}
        </Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={SHELF_CARD_W + 8}
        decelerationRate="fast"
        style={styles.shelfOuter}
        contentContainerStyle={styles.shelfStrip}
      >
        {items.map((item) => {
          const thumb = item.imageUrl ? storageThumbnailUri(item.imageUrl, 300, 340, 65, "cover") : null;
          const into = intoRunLabel(item.loggedAtMs, item.startedAtMs) ?? item.label;
          return (
            <Pressable
              key={item.key}
              onPress={() => onOpenTile({ label: item.label, note: item.note, uri: item.imageUrl })}
              accessibilityRole="button"
              accessibilityLabel={`View ${item.label} by ${name}`}
              style={({ pressed }) => [
                styles.shelfCard,
                { backgroundColor: theme.colors.surfaceElevated, opacity: pressed ? 0.88 : 1 },
              ]}
            >
              {thumb ? (
                <Image source={{ uri: thumb }} style={styles.shelfPhoto} resizeMode="cover" resizeMethod="resize" fadeDuration={120} />
              ) : (
                <Text style={[styles.shelfNote, { color: theme.colors.textPrimary }]} numberOfLines={5}>
                  {item.note ?? "Marked done"}
                </Text>
              )}
              <Text style={[styles.shelfMeta, { color: theme.colors.textMuted }]} numberOfLines={1}>
                {into}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
});

const MomentRow = memo(function MomentRow({
  item,
  profile,
  isMine,
  accent,
  heartColor,
  heartCount,
  heartedByMe,
  nowMs,
  onToggleHeart,
  onOpenTile,
  onOptions,
  last = false,
}: {
  last?: boolean;
  item: FeedItem;
  profile: LiveMiniProfileLabel | undefined;
  isMine: boolean;
  accent: string;
  heartColor: string;
  heartCount: number;
  heartedByMe: boolean;
  nowMs: number;
  onToggleHeart: (subjectUserId: string, taskId: string, on: boolean) => void;
  onOpenTile: (item: { label: string; note: string | null; uri: string | null }) => void;
  onOptions?: (taskId: string, label: string) => void;
}) {
  const { theme, isDark } = useTheme();
  const [ratio, setRatio] = useState(() => (item.imageUrl ? ratioCache.get(item.imageUrl) : undefined) ?? 4 / 3);
  // Photo keeps its real shape but never taller than PHOTO_MAX_H (a tall
  // portrait narrows instead of filling the screen), like the mission log.
  const [bodyW, setBodyW] = useState(0);
  const photoH = bodyW > 0 ? Math.min(PHOTO_MAX_H, bodyW / ratio) : 0;
  const photoW = photoH * ratio;
  const sweep = useRef(new Animated.Value(0)).current;
  const pop = useRef(new Animated.Value(1)).current;
  const prevCountRef = useRef(heartCount);

  // A new heart landed (from anyone, seen live): a soft tint fills the moment
  // from the top and fades, and the heart pops once. No sound, no notification.
  useEffect(() => {
    const prev = prevCountRef.current;
    prevCountRef.current = heartCount;
    if (heartCount <= prev) return;
    sweep.setValue(0);
    pop.setValue(1);
    Animated.parallel([
      Animated.timing(sweep, { toValue: 1, duration: 1100, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
      Animated.sequence([
        Animated.spring(pop, { toValue: 1.28, speed: 40, bounciness: 10, useNativeDriver: true }),
        Animated.spring(pop, { toValue: 1, speed: 18, bounciness: 6, useNativeDriver: true }),
      ]),
    ]).start();
  }, [heartCount, pop, sweep]);

  const thumb = item.imageUrl ? storageThumbnailUri(item.imageUrl, 900, 1200, 70, "contain") : null;
  const ago = agoLabel(item.loggedAtMs ?? item.sortMs, nowMs);
  const intoRun = intoRunLabel(item.loggedAtMs, item.startedAtMs);
  const meta = [intoRun, ago].filter(Boolean).join(" · ");
  const name = isMine ? "You" : nameFor(profile);
  const elevated = theme.colors.surfaceElevated;

  const handleHeart = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onToggleHeart(item.userId, item.taskId, !heartedByMe);
  }, [heartedByMe, item.taskId, item.userId, onToggleHeart]);

  const sweepHeight = sweep.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] });
  const sweepOpacity = sweep.interpolate({ inputRange: [0, 0.55, 1], outputRange: [0.18, 0.13, 0] });
  const sweepLayer = (
    <Animated.View
      pointerEvents="none"
      style={[styles.sweep, { backgroundColor: heartColor, height: sweepHeight, opacity: sweepOpacity }]}
    />
  );

  /** Others' moments: a tappable heart. Mine: just the count, once someone has hearted it. */
  const heart = (onPhoto: boolean) => {
    const fill = heartedByMe || isMine ? heartColor : "transparent";
    const stroke = heartedByMe || isMine ? heartColor : onPhoto ? "#ffffff" : theme.colors.textMuted;
    const countColor = onPhoto ? "#ffffff" : theme.colors.textSecondary;
    const inner = (
      <>
        <Animated.View style={{ transform: [{ scale: pop }] }}>
          <Heart size={16} color={stroke} fill={fill} />
        </Animated.View>
        {heartCount > 0 ? <Text style={[styles.heartCount, { color: countColor }]}>{heartCount}</Text> : null}
      </>
    );
    const chip = [styles.heartChip, onPhoto ? styles.heartOnPhoto : null];
    if (isMine) {
      return heartCount > 0 ? (
        <View style={chip} accessibilityLabel={`${heartCount} hearts`}>
          {inner}
        </View>
      ) : null;
    }
    return (
      <Pressable
        onPress={handleHeart}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={heartedByMe ? "Remove heart" : "Heart this moment"}
        style={({ pressed }) => [...chip, { transform: [{ scale: pressed ? 0.92 : 1 }] }]}
      >
        {inner}
      </Pressable>
    );
  };

  return (
    <View style={styles.moment}>
      <View style={styles.rail}>
        <View style={[styles.dot, { backgroundColor: accent }]} />
        {!last ? <View style={[styles.line, { backgroundColor: theme.colors.border }]} /> : null}
      </View>
      <View style={styles.body} onLayout={(e) => setBodyW(Math.round(e.nativeEvent.layout.width))}>
      <View style={styles.metaRow}>
        <View style={[styles.avatar, { borderColor: accent, backgroundColor: withAlpha(accent, isDark ? 18 : 10) }]}>
          {profile?.avatarUrl ? (
            <Image source={{ uri: profile.avatarUrl }} style={styles.avatarPhoto} resizeMethod="resize" fadeDuration={0} />
          ) : (
            <Text style={[styles.avatarText, { color: accent }]}>{initialsFor(profile)}</Text>
          )}
        </View>
        <Text style={[styles.name, { color: theme.colors.textPrimary }]} numberOfLines={1}>
          {name}
        </Text>
        <Text style={[styles.label, { color: accent }]} numberOfLines={1}>
          {item.label}
        </Text>
        {meta ? (
          <Text style={[styles.meta, { color: theme.colors.textMuted }]} numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
        {onOptions ? (
          <Pressable
            onPress={() => onOptions(item.taskId, item.label)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={`Edit or delete ${item.label}`}
            style={({ pressed }) => [styles.optionsButton, { opacity: pressed ? 0.6 : 1 }]}
          >
            <MoreHorizontal size={18} color={theme.colors.textMuted} />
          </Pressable>
        ) : null}
      </View>

      {thumb ? (
        <>
          <View style={[styles.photoWrap, { backgroundColor: elevated, width: photoW || "100%", height: photoH || undefined }]}>
            <Pressable
              onPress={() => onOpenTile({ label: item.label, note: item.note, uri: item.imageUrl })}
              accessibilityRole="button"
              accessibilityLabel={`View ${item.label} by ${name}`}
              style={({ pressed }) => ({ opacity: pressed ? 0.92 : 1 })}
            >
              <Image
                source={{ uri: thumb }}
                style={photoH ? { width: photoW, height: photoH } : [styles.photo, { aspectRatio: ratio }]}
                resizeMode="cover"
                // Android decodes at full size (1280px uploads) unless told to
                // downsample to the view: that was the "load more" stutter.
                resizeMethod="resize"
                fadeDuration={120}
                onLoad={(e) => {
                  const { width, height } = e.nativeEvent.source ?? {};
                  if (width && height) {
                    const r = Math.min(MAX_RATIO, Math.max(MIN_RATIO, width / height));
                    if (item.imageUrl) ratioCache.set(item.imageUrl, r);
                    if (Math.abs(r - ratio) > 0.01) setRatio(r);
                  }
                }}
              />
            </Pressable>
            {heart(true)}
            {sweepLayer}
          </View>
          {item.note ? (
            <View style={[styles.noteBubble, { backgroundColor: elevated }]}>
              <Text style={[styles.textNote, { color: theme.colors.textPrimary }]}>{item.note}</Text>
            </View>
          ) : null}
        </>
      ) : (
        <View style={[styles.bubble, { backgroundColor: elevated }]}>
          <Pressable
            onPress={() => onOpenTile({ label: item.label, note: item.note, uri: null })}
            accessibilityRole="button"
            accessibilityLabel={`View ${item.label} by ${name}`}
            style={styles.bubbleText}
          >
            <Text style={[styles.textNote, { color: theme.colors.textPrimary }]}>
              {item.note ?? "Marked done"}
            </Text>
          </Pressable>
          {heart(false)}
          {sweepLayer}
        </View>
      )}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  optionsButton: { width: 28, height: 24, marginLeft: 2, alignItems: "flex-end", justifyContent: "center" },
  section: { marginTop: 22 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  sectionLabel: { fontSize: 12, fontWeight: "900", letterSpacing: 1.2, textTransform: "uppercase" },
  filterRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: -4, marginBottom: 16 },
  filterChip: {
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    paddingLeft: 12,
    paddingRight: 5,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 1,
  },
  filterText: { fontSize: 13, fontWeight: "700", flexShrink: 1 },
  filterClear: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  filterHint: { marginLeft: "auto", fontSize: 12, flexShrink: 1 },
  shelf: { gap: 8, marginBottom: 20 },
  shelfOuter: { marginHorizontal: -16 },
  shelfStrip: { gap: 8, paddingHorizontal: 16 },
  shelfCard: { width: SHELF_CARD_W, height: SHELF_CARD_H, borderRadius: 16, overflow: "hidden" },
  shelfPhoto: { flex: 1, width: "100%" },
  shelfNote: { flex: 1, padding: 12, fontSize: 14, lineHeight: 19, fontWeight: "600" },
  shelfMeta: { paddingHorizontal: 10, paddingVertical: 7, fontSize: 11, fontVariant: ["tabular-nums"] },
  empty: { fontSize: 14, lineHeight: 20 },
  moment: { flexDirection: "row", gap: 10, marginBottom: 18 },
  rail: { width: 14, alignItems: "center", paddingTop: 9, gap: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  line: { flex: 1, width: StyleSheet.hairlineWidth * 2, marginBottom: -18 },
  body: { flex: 1, minWidth: 0, gap: 8 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarPhoto: { width: "100%", height: "100%" },
  avatarText: { fontSize: 10, fontWeight: "900" },
  name: { fontSize: 14, fontWeight: "800", flexShrink: 1 },
  label: { fontSize: 13, fontWeight: "700", flexShrink: 1 },
  meta: { marginLeft: "auto", fontSize: 12, fontWeight: "500", fontVariant: ["tabular-nums"] },
  photoWrap: { borderRadius: 16, overflow: "hidden" },
  photo: { width: "100%" },
  noteBubble: { alignSelf: "flex-start", maxWidth: "100%", borderRadius: 16, paddingHorizontal: 13, paddingVertical: 9 },
  bubble: {
    alignSelf: "flex-start",
    maxWidth: "100%",
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 6,
    paddingVertical: 9,
    paddingLeft: 13,
    paddingRight: 6,
    borderRadius: 16,
    overflow: "hidden",
  },
  bubbleText: { flexShrink: 1, paddingRight: 4 },
  textNote: { fontSize: 15, lineHeight: 21, fontWeight: "500" },
  heartChip: { flexDirection: "row", alignItems: "center", gap: 5, minHeight: 32, minWidth: 32, paddingHorizontal: 8, borderRadius: 16, justifyContent: "center" },
  heartOnPhoto: { position: "absolute", right: 10, bottom: 10, minHeight: 36, paddingHorizontal: 10, backgroundColor: "rgba(15,14,20,0.62)" },
  heartCount: { fontSize: 13, fontWeight: "800" },
  moreButton: { height: 44, borderRadius: 22, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  moreText: { fontSize: 14, fontWeight: "800" },
  sweep: { position: "absolute", left: 0, right: 0, top: 0 },
});
