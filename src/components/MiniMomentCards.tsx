import { memo, useState, type ReactNode } from "react";
import {
  Image,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { Text } from "./AppText";
import { useTheme } from "../context/ThemeContext";
import type { StreakMemoryTaskEntry } from "../types/habit";

/**
 * Mini mission detail: the run's moments as swipe cards (the next one peeks).
 * Photos keep their real shape (no crop); a text-only moment becomes a quote
 * card instead of a blank box. Calm by design: neutrals only, emphasis from
 * size and weight (see the "one job per color" rule in docs/CURRENT_WORK.md).
 */

const GAP = 10;
const MIN_RATIO = 0.6;
const MAX_RATIO = 1.8;

function intoRun(loggedAt: string | undefined, startedAt: string | null | undefined): string | null {
  if (!loggedAt || !startedAt) return null;
  const ms = Date.parse(loggedAt) - Date.parse(startedAt);
  if (!Number.isFinite(ms) || ms < 0) return null;
  const m = Math.floor(ms / 60000);
  if (m < 1) return "at start";
  const h = Math.floor(m / 60);
  return `${h > 0 ? `${h}h ${m % 60}m` : `${m}m`} in`;
}

type Props = {
  tasks: StreakMemoryTaskEntry[];
  startedAt?: string | null;
  onPressSlide: (index: number) => void;
  onIndexChange?: (index: number) => void;
  title?: string;
  /** Small trailing control in the header row (e.g. a share icon). */
  headerRight?: ReactNode;
};

export const MiniMomentCards = memo(function MiniMomentCards({
  tasks,
  startedAt,
  onPressSlide,
  onIndexChange,
  title = "Your moments",
  headerRight,
}: Props) {
  const { theme } = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const single = tasks.length === 1;
  // One moment fills the row; more than one leaves the next card peeking.
  const cardWidth = single ? windowWidth - 24 : Math.min(340, windowWidth - 66);
  const [active, setActive] = useState(0);
  const [ratios, setRatios] = useState<Record<string, number>>({});

  const onEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / (cardWidth + GAP));
    const clamped = Math.max(0, Math.min(tasks.length - 1, idx));
    setActive(clamped);
    onIndexChange?.(clamped);
  };

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Text style={[styles.label, { color: theme.colors.textMuted }]}>
          {title} · {tasks.length}
        </Text>
        <View style={styles.headerRight}>
          {tasks.length > 1 ? (
            <Text style={[styles.counter, { color: theme.colors.textMuted }]}>
              {active + 1} / {tasks.length} · swipe
            </Text>
          ) : null}
          {headerRight}
        </View>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={cardWidth + GAP}
        decelerationRate="fast"
        onMomentumScrollEnd={onEnd}
        contentContainerStyle={styles.strip}
        style={styles.stripOuter}
      >
        {tasks.map((t, index) => {
          const uri = t.proofUrls[0];
          const meta = intoRun(t.loggedAt, startedAt);
          const ratio = ratios[t.taskId] ?? 4 / 3;
          return (
            <View key={t.taskId} style={{ width: cardWidth, gap: 8 }}>
              <Pressable
                onPress={() => onPressSlide(index)}
                accessibilityRole="imagebutton"
                accessibilityLabel={`View ${t.label}`}
                style={({ pressed }) => ({ opacity: pressed ? 0.92 : 1 })}
              >
                {uri ? (
                  <Image
                    source={{ uri }}
                    style={[styles.photo, { aspectRatio: ratio, backgroundColor: theme.colors.surfaceElevated }]}
                    resizeMode="cover"
                    // Android decodes full-size unless asked to downsample to the view.
                    resizeMethod="resize"
                    fadeDuration={120}
                    onLoad={(e) => {
                      const { width, height } = e.nativeEvent.source ?? {};
                      if (width && height) {
                        const r = Math.min(MAX_RATIO, Math.max(MIN_RATIO, width / height));
                        setRatios((prev) => (prev[t.taskId] === r ? prev : { ...prev, [t.taskId]: r }));
                      }
                    }}
                  />
                ) : (
                  <View style={[styles.quote, { backgroundColor: theme.colors.surfaceElevated }]}>
                    <Text style={[styles.quoteMark, { color: theme.colors.textMuted }]}>“</Text>
                    <Text style={[styles.quoteText, { color: theme.colors.textPrimary }]} numberOfLines={6}>
                      {t.note?.trim() || "Marked done"}
                    </Text>
                  </View>
                )}
              </Pressable>
              <View style={styles.metaRow}>
                <Text style={[styles.metaLabel, { color: theme.colors.textPrimary }]} numberOfLines={1}>
                  {t.label}
                </Text>
                {meta ? <Text style={[styles.metaTime, { color: theme.colors.textMuted }]}>{meta}</Text> : null}
              </View>
              {uri && t.note ? (
                <Text style={[styles.caption, { color: theme.colors.textSecondary }]} numberOfLines={2}>
                  {t.note}
                </Text>
              ) : null}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
});

const styles = StyleSheet.create({
  section: { gap: 10, marginTop: 4 },
  header: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  label: { fontSize: 12, fontWeight: "900", letterSpacing: 1.2, textTransform: "uppercase" },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 12 },
  counter: { fontSize: 12, fontWeight: "600", fontVariant: ["tabular-nums"] },
  stripOuter: { marginHorizontal: -12 },
  strip: { gap: GAP, paddingHorizontal: 12, alignItems: "flex-start" },
  photo: { width: "100%", maxHeight: 440, borderRadius: 20 },
  quote: { minHeight: 180, borderRadius: 20, padding: 20, justifyContent: "space-between", gap: 10 },
  quoteMark: { fontSize: 44, lineHeight: 44, fontWeight: "900" },
  quoteText: { fontSize: 21, lineHeight: 27, fontWeight: "900", letterSpacing: -0.3 },
  metaRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 8, paddingHorizontal: 4 },
  metaLabel: { fontSize: 14, fontWeight: "800", flexShrink: 1 },
  metaTime: { fontSize: 12, fontWeight: "600", fontVariant: ["tabular-nums"] },
  caption: { fontSize: 14, lineHeight: 20, paddingHorizontal: 4 },
});
