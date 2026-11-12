import { memo, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { ArrowDown, ArrowUp } from "lucide-react-native";
import Svg, { Circle } from "react-native-svg";
import { Text } from "../AppText";
import { useTheme } from "../../context/ThemeContext";
import { formatLiveMiniElapsed } from "../../lib/liveMiniMissionsApi";
import { withAlpha } from "../../styles/theme";
import type {
  LiveMiniParticipantRow,
  LiveMiniProfileLabel,
} from "../../types/liveMiniMission";

/**
 * Live squad hero while the run is on: one card per player, side by side.
 * Two players share the row; three or more become swipe cards (three fit,
 * the fourth peeks). The ring is time left. You are green, everyone else
 * maroon (the two colors of the logo); a timer under 10% turns amber.
 * Order comes from the screen (finished first, then running, then waiting),
 * except your own card, which always leads. Tap a card to filter the moments
 * feed to that player (tap again to clear); tap the name itself to open it
 * (yours: your mission; others: their journey). Tap a running timer to flip
 * every timer between time left (counting down) and time in (counting up).
 */

const COMPACT_GAP = 8;
const COMPACT_MIN_W = 96;
const LOW_FUEL = 0.1;

type Props = {
  rows: LiveMiniParticipantRow[];
  profiles: Record<string, LiveMiniProfileLabel>;
  userId: string | null;
  nowMs: number;
  /** finished rows, fastest first: decides "1st", "2nd"... */
  completedRows: LiveMiniParticipantRow[];
  /** Card body: filter the feed to this player. */
  onPressCard?: (row: LiveMiniParticipantRow) => void;
  /** The name: open their journey (or your own mission). */
  onPressName?: (row: LiveMiniParticipantRow) => void;
  /** Player the feed is filtered to; other cards dim. */
  selectedUserId?: string | null;
};

function ordinal(n: number): string {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th";
  return `${n}${s}`;
}

function minutesLabel(minutes: number): string {
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  return `${minutes}m`;
}

function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
}

function initialsFor(profile: LiveMiniProfileLabel | undefined): string {
  const base = profile?.displayName || profile?.username || "?";
  const parts = base.replace(/^@/, "").split(/[\s._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}

type CardModel = {
  key: string;
  row: LiveMiniParticipantRow;
  running: boolean;
  name: string;
  initials: string;
  avatarUrl: string | null;
  isMe: boolean;
  color: string;
  tag: string;
  tagColor: string;
  big: string;
  sub: string;
  fraction: number;
  moments: number;
  reserve: number;
};

export const LiveSquadRaceCards = memo(function LiveSquadRaceCards({
  rows,
  profiles,
  userId,
  nowMs,
  completedRows,
  onPressCard,
  onPressName,
  selectedUserId = null,
}: Props) {
  const { theme, isDark } = useTheme();
  const [countUp, setCountUp] = useState(false);
  // Three cards fill the row exactly; a fourth and beyond sit off-screen to swipe to.
  const [rowWidth, setRowWidth] = useState(0);
  const compactW = rowWidth > 0 ? Math.max(COMPACT_MIN_W, (rowWidth - COMPACT_GAP * 2) / 3) : 110;
  const green = isDark ? theme.colors.green[500] : theme.colors.green[600];
  const maroon = isDark ? "#c2405d" : theme.colors.maroon[500];
  const amber = theme.colors.amber[500];
  const muted = theme.colors.textMuted;

  const ordered = userId
    ? [...rows.filter((r) => r.user_id === userId), ...rows.filter((r) => r.user_id !== userId)]
    : rows;
  const cards: CardModel[] = ordered.map((row) => {
    const profile = profiles[row.user_id];
    const isMe = row.user_id === userId;
    const personColor = isMe ? green : maroon;
    const totalMin = (row.planned_minutes ?? 0) + (row.reserve_minutes ?? 0);
    const base = {
      key: row.id,
      row,
      running: false,
      name: profile?.username ?? profile?.displayName ?? (isMe ? "You" : "Member"),
      initials: initialsFor(profile),
      avatarUrl: profile?.avatarUrl ?? null,
      isMe,
      moments: row.memory_gallery?.length ?? 0,
      reserve: row.reserve_minutes ?? 0,
    };
    if (row.status === "completed") {
      const rank = completedRows.findIndex((r) => r.id === row.id) + 1;
      return {
        ...base,
        color: personColor,
        tag: rank > 0 ? `${ordinal(rank)} · Done` : "Done",
        tagColor: amber,
        big: formatLiveMiniElapsed(row.final_elapsed_seconds),
        sub: "finished, locked",
        fraction: 1,
      };
    }
    if (row.status === "in_progress" && totalMin > 0) {
      const deadlineMs = row.deadline_at
        ? Date.parse(row.deadline_at)
        : row.started_at
          ? Date.parse(row.started_at) + totalMin * 60000
          : NaN;
      const left = Number.isFinite(deadlineMs) ? Math.max(0, (deadlineMs - nowMs) / 1000) : totalMin * 60;
      const fraction = Math.min(1, left / (totalMin * 60));
      const low = fraction < LOW_FUEL;
      const startedMs = row.started_at ? Date.parse(row.started_at) : NaN;
      const elapsed = Number.isFinite(startedMs)
        ? Math.max(0, (nowMs - startedMs) / 1000)
        : Math.max(0, totalMin * 60 - left);
      return {
        ...base,
        running: true,
        color: low ? amber : personColor,
        tag: low ? "Low fuel" : "Live",
        tagColor: low ? amber : green,
        big: clock(countUp ? elapsed : left),
        sub: `${countUp ? "in" : "left"} of ${minutesLabel(totalMin)}`,
        fraction,
      };
    }
    if (row.status === "missed") {
      return { ...base, color: muted, tag: "Missed", tagColor: theme.colors.red[500], big: "0:00", sub: "time ran out", fraction: 0 };
    }
    if (row.status === "cancelled" || row.status === "declined" || row.status === "expired") {
      return { ...base, color: muted, tag: "Out", tagColor: muted, big: "--", sub: "left the run", fraction: 0 };
    }
    return { ...base, color: muted, tag: "Waiting", tagColor: muted, big: "--", sub: "picking a timer", fraction: 0 };
  });

  if (cards.length === 0) return null;
  const compact = cards.length > 2;
  const cardBg = theme.colors.surfaceElevated;
  const track = isDark ? withAlpha("#ffffff", 8) : withAlpha("#000000", 8);

  const renderCard = (c: CardModel) => {
    const ring = compact ? 52 : 48;
    const r = ring / 2 - 3;
    const circ = 2 * Math.PI * r;
    const Arrow = countUp ? ArrowUp : ArrowDown;
    const selected = selectedUserId === c.row.user_id;
    const dimmed = Boolean(selectedUserId) && !selected;
    const nameColor = c.isMe ? green : c.color === muted ? theme.colors.textSecondary : c.color;
    const nameText = (
      <Text
        style={[
          styles.name,
          onPressName ? styles.nameLink : null,
          { color: nameColor, textDecorationColor: withAlpha(nameColor, 60) },
        ]}
        numberOfLines={1}
      >
        {c.name}
      </Text>
    );
    const timerText = (
      <Text
        style={[compact ? styles.bigCompact : styles.bigWide, { color: theme.colors.textPrimary }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
      >
        {c.big}
      </Text>
    );
    const subText = (
      <View style={[styles.subRow, compact ? styles.subRowCompact : null]}>
        {c.running ? <Arrow size={11} color={theme.colors.textMuted} strokeWidth={2.6} /> : null}
        <Text style={[styles.sub, { color: theme.colors.textMuted }, compact ? styles.subCompact : null]} numberOfLines={2}>
          {c.sub}
        </Text>
      </View>
    );
    return (
      <Pressable
        key={c.key}
        onPress={onPressCard ? () => onPressCard(c.row) : undefined}
        disabled={!onPressCard}
        style={({ pressed }) => [
          compact ? [styles.cardCompact, { width: compactW }] : styles.cardWide,
          {
            backgroundColor: c.isMe ? withAlpha(green, isDark ? 7 : 5) : cardBg,
            borderColor: selected
              ? theme.colors.textPrimary
              : c.isMe
                ? withAlpha(green, isDark ? 45 : 50)
                : theme.colors.border,
            borderWidth: selected ? 1.5 : 1,
            opacity: dimmed ? 0.45 : pressed ? 0.9 : 1,
          },
        ]}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        accessibilityLabel={`${c.name}${c.isMe ? " (you)" : ""}, ${c.tag}, ${c.big} ${c.sub}`}
        accessibilityHint={selected ? "Shows everyone's moments again" : "Shows only their moments"}
        // The name is a nested link that screen readers can't reach inside the card.
        accessibilityActions={
          onPressName ? [{ name: "openName", label: c.isMe ? "Open your mission" : `Open ${c.name}'s journey` }] : undefined
        }
        onAccessibilityAction={
          onPressName
            ? (e) => {
                if (e.nativeEvent.actionName === "openName") onPressName(c.row);
              }
            : undefined
        }
      >
        {compact ? (
          <Text style={[styles.tagCompact, { color: c.tagColor }]} numberOfLines={1}>
            {c.tag}
          </Text>
        ) : null}
        <View style={compact ? styles.ringRowCompact : styles.ringRowWide}>
          <View style={{ width: ring, height: ring }}>
            <Svg width={ring} height={ring} style={StyleSheet.absoluteFill}>
              <Circle cx={ring / 2} cy={ring / 2} r={r} stroke={track} strokeWidth={3} fill="none" />
              <Circle
                cx={ring / 2}
                cy={ring / 2}
                r={r}
                stroke={c.color}
                strokeWidth={3}
                fill="none"
                strokeLinecap="round"
                strokeDasharray={`${Math.max(0.001, c.fraction) * circ} ${circ}`}
                transform={`rotate(-90 ${ring / 2} ${ring / 2})`}
              />
            </Svg>
            <View
              style={[
                styles.avatar,
                { top: 7, left: 7, right: 7, bottom: 7, backgroundColor: withAlpha(c.color, isDark ? 16 : 10) },
              ]}
            >
              {c.avatarUrl ? (
                <Image source={{ uri: c.avatarUrl }} style={styles.avatarPhoto} resizeMethod="resize" fadeDuration={0} />
              ) : (
                <Text style={[styles.initials, { color: c.color }]}>{c.initials}</Text>
              )}
            </View>
          </View>
          {!compact ? (
            <View style={[styles.tagPill, { backgroundColor: withAlpha(c.tagColor, isDark ? 14 : 10) }]}>
              <Text style={[styles.tagPillText, { color: c.tagColor }]}>{c.tag}</Text>
            </View>
          ) : null}
        </View>
        <View style={compact ? styles.textCompact : styles.textWide}>
          {onPressName ? (
            <Pressable
              onPress={() => onPressName(c.row)}
              hitSlop={8}
              accessibilityRole="link"
              accessibilityLabel={c.isMe ? "Open your mission" : `Open ${c.name}'s journey`}
              style={({ pressed }) => [compact ? styles.nameTapCompact : null, { opacity: pressed ? 0.6 : 1 }]}
            >
              {nameText}
            </Pressable>
          ) : (
            nameText
          )}
          {c.running ? (
            <Pressable
              onPress={() => setCountUp((v) => !v)}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={countUp ? "Show time left" : "Show time in"}
              style={({ pressed }) => [compact ? styles.timerTapCompact : null, { opacity: pressed ? 0.6 : 1 }]}
            >
              {timerText}
              {subText}
            </Pressable>
          ) : (
            <>
              {timerText}
              {subText}
            </>
          )}
        </View>
        {!compact ? (
          <View style={[styles.footer, { borderTopColor: track }]}>
            <Text style={[styles.footerText, { color: theme.colors.textMuted }]}>
              {c.moments} moment{c.moments === 1 ? "" : "s"}
            </Text>
            {c.reserve > 0 ? (
              <Text style={[styles.footerText, { color: theme.colors.textMuted }]}>+{c.reserve}m reserve</Text>
            ) : null}
          </View>
        ) : null}
      </Pressable>
    );
  };

  return (
    <View style={styles.section} onLayout={(e) => setRowWidth(Math.round(e.nativeEvent.layout.width))}>
      <View style={styles.headerRow}>
        <Text style={[styles.label, { color: theme.colors.textMuted }]}>{compact ? "Leaderboard" : "The race"}</Text>
        <Text style={[styles.hint, { color: theme.colors.textMuted }]}>
          {selectedUserId
            ? "Tap again to show all"
            : compact
              ? cards.length > 3
                ? `Swipe for all ${cards.length}`
                : `${cards.length} players`
              : "First finish locks the pace"}
        </Text>
      </View>
      {compact ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={compactW + COMPACT_GAP}
          decelerationRate="fast"
          contentContainerStyle={styles.strip}
          style={styles.stripOuter}
        >
          {cards.map(renderCard)}
        </ScrollView>
      ) : (
        <View style={styles.grid}>{cards.map(renderCard)}</View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  section: { marginTop: 16, gap: 10 },
  headerRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  label: { fontSize: 12, fontWeight: "900", letterSpacing: 1.2, textTransform: "uppercase" },
  hint: { fontSize: 12, fontWeight: "600" },
  grid: { flexDirection: "row", gap: 10 },
  // Bleed the swipe strip to the screen edges so cards slide under the gutter.
  stripOuter: { marginHorizontal: -16 },
  strip: { gap: COMPACT_GAP, paddingHorizontal: 16 },
  cardWide: { flex: 1, borderWidth: 1, borderRadius: 22, padding: 14, gap: 12 },
  cardCompact: { borderWidth: 1, borderRadius: 20, paddingVertical: 12, paddingHorizontal: 10, alignItems: "center", gap: 8 },
  tagCompact: { fontSize: 11, fontWeight: "900", textAlign: "center", alignSelf: "stretch" },
  ringRowWide: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  ringRowCompact: { alignItems: "center" },
  avatar: { position: "absolute", borderRadius: 999, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  avatarPhoto: { width: "100%", height: "100%" },
  initials: { fontSize: 12, fontWeight: "900" },
  tagPill: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
  tagPillText: { fontSize: 11, fontWeight: "800" },
  textWide: { gap: 2 },
  textCompact: { alignItems: "center", gap: 2, alignSelf: "stretch" },
  name: { fontSize: 13, fontWeight: "800" },
  nameLink: { textDecorationLine: "underline", textDecorationStyle: "dotted" },
  nameTapCompact: { alignSelf: "stretch", alignItems: "center" },
  bigWide: { fontSize: 28, fontWeight: "900", letterSpacing: -0.6, fontVariant: ["tabular-nums"] },
  bigCompact: { fontSize: 22, textAlign: "center", alignSelf: "stretch", fontWeight: "900", letterSpacing: -0.4, fontVariant: ["tabular-nums"] },
  sub: { fontSize: 12, fontVariant: ["tabular-nums"], flexShrink: 1 },
  subRow: { flexDirection: "row", alignItems: "center", gap: 3 },
  subRowCompact: { justifyContent: "center" },
  timerTapCompact: { alignItems: "center", alignSelf: "stretch", gap: 2 },
  subCompact: { fontSize: 11, textAlign: "center" },
  footer: { flexDirection: "row", justifyContent: "space-between", paddingTop: 10, borderTopWidth: 1 },
  footerText: { fontSize: 12, fontVariant: ["tabular-nums"] },
});
