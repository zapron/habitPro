import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Image, Pressable, StyleSheet, View } from "react-native";
import { Heart } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { Text } from "../AppText";
import { useTheme } from "../../context/ThemeContext";
import { useToast } from "../../context/ToastContext";
import { withAlpha } from "../../styles/theme";
import { storageThumbnailUri } from "../../utils/imageThumbnail";
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
 */

const AVATAR = 26;
const COLLAPSED_COUNT = 4;
const MIN_RATIO = 0.56; // tallest photo we allow (9:16)
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

  // Long runs (an 11-moment gym session) stay short: newest few, rest on tap.
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? items : items.slice(0, COLLAPSED_COUNT);
  const hiddenCount = items.length - shown.length;

  const anyRunning = participants.some((p) => p.status === "in_progress");
  if (items.length === 0 && !anyRunning) return null;

  return (
    <View style={styles.section}>
      <View style={styles.headerRow}>
        <Text style={[styles.sectionLabel, { color: theme.colors.textMuted }]}>
          Squad moments{items.length > 0 ? ` · ${items.length}` : ""}
        </Text>
        {items.length > 0 ? (
          <Text style={[styles.headerHint, { color: theme.colors.textMuted }]}>Newest first</Text>
        ) : null}
      </View>
      {items.length === 0 ? (
        <Text style={[styles.empty, { color: theme.colors.textSecondary }]}>
          Moments show up here the second anyone logs one.
        </Text>
      ) : (
        shown.map((item) => {
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
            />
          );
        })
      )}
      {hiddenCount > 0 ? (
        <Pressable
          onPress={() => setExpanded(true)}
          accessibilityRole="button"
          style={({ pressed }) => [styles.moreButton, { borderColor: theme.colors.border, opacity: pressed ? 0.8 : 1 }]}
        >
          <Text style={[styles.moreText, { color: theme.colors.textPrimary }]}>
            Show {hiddenCount} earlier moment{hiddenCount === 1 ? "" : "s"}
          </Text>
        </Pressable>
      ) : null}
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
}: {
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
}) {
  const { theme, isDark } = useTheme();
  const [ratio, setRatio] = useState(4 / 3);
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
      <View style={styles.metaRow}>
        <View style={[styles.avatar, { borderColor: accent, backgroundColor: withAlpha(accent, isDark ? 18 : 10) }]}>
          {profile?.avatarUrl ? (
            <Image source={{ uri: profile.avatarUrl }} style={styles.avatarPhoto} />
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
      </View>

      {thumb ? (
        <>
          <View style={[styles.photoWrap, { backgroundColor: elevated }]}>
            <Pressable
              onPress={() => onOpenTile({ label: item.label, note: item.note, uri: item.imageUrl })}
              accessibilityRole="button"
              accessibilityLabel={`View ${item.label} by ${name}`}
              style={({ pressed }) => ({ opacity: pressed ? 0.92 : 1 })}
            >
              <Image
                source={{ uri: thumb }}
                style={[styles.photo, { aspectRatio: ratio }]}
                resizeMode="cover"
                onLoad={(e) => {
                  const { width, height } = e.nativeEvent.source ?? {};
                  if (width && height) setRatio(Math.min(MAX_RATIO, Math.max(MIN_RATIO, width / height)));
                }}
              />
            </Pressable>
            {heart(true)}
            {sweepLayer}
          </View>
          {item.note ? (
            <Text style={[styles.photoNote, { color: theme.colors.textSecondary }]} numberOfLines={2}>
              {item.note}
            </Text>
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
            <Text style={[styles.textNote, { color: theme.colors.textPrimary }]} numberOfLines={4}>
              {item.note ?? "Marked done"}
            </Text>
          </Pressable>
          {heart(false)}
          {sweepLayer}
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  section: { marginTop: 22 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  sectionLabel: { fontSize: 12, fontWeight: "900", letterSpacing: 1.2, textTransform: "uppercase" },
  headerHint: { fontSize: 12, fontWeight: "600" },
  empty: { fontSize: 14, lineHeight: 20 },
  moment: { gap: 8, marginBottom: 20 },
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
  photoWrap: { borderRadius: 18, overflow: "hidden" },
  photo: { width: "100%" },
  photoNote: { fontSize: 14, lineHeight: 20 },
  bubble: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    marginLeft: AVATAR + 8,
    paddingVertical: 12,
    paddingLeft: 14,
    paddingRight: 8,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 18,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
    overflow: "hidden",
  },
  bubbleText: { flex: 1 },
  textNote: { fontSize: 15, lineHeight: 21, fontWeight: "500" },
  heartChip: { flexDirection: "row", alignItems: "center", gap: 5, minHeight: 32, minWidth: 32, paddingHorizontal: 8, borderRadius: 16, justifyContent: "center" },
  heartOnPhoto: { position: "absolute", right: 10, bottom: 10, minHeight: 36, paddingHorizontal: 10, backgroundColor: "rgba(15,14,20,0.62)" },
  heartCount: { fontSize: 13, fontWeight: "800" },
  moreButton: { height: 44, borderRadius: 22, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  moreText: { fontSize: 14, fontWeight: "800" },
  sweep: { position: "absolute", left: 0, right: 0, top: 0 },
});
