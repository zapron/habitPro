import { Text } from "./AppText";
import { useState } from "react";
import {
  FlatList,
  Image,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { useTheme } from "../context/ThemeContext";
import type { StreakMemoryTaskEntry } from "../types/habit";

type Props = {
  tasks: StreakMemoryTaskEntry[];
  onPressSlide: (index: number) => void;
  onIndexChange?: (index: number) => void;
};

/**
 * Own-detail carousel for a checklist mini mission's completion memory
 * (docs/MINI_MISSION_CATALOG_ARCHITECTURE.md — deferred at Phase 4, built after
 * the user flagged the own-detail screen (app/mini/[id].tsx) still only showing a
 * single cover photo). Ported from PhotoCarousel's pattern
 * (CommunityWinFeedPost.tsx): seeds slide width from useWindowDimensions rather
 * than gating render on onLayout (see app-architecture.md Known Caution Points on
 * that exact class of bug), FlatList paging + dot indicator, with a per-slide
 * task-name/note caption. Unlike the Community-share gallery, text-only tasks (no
 * photo) are kept and rendered as a text card — this is the mission owner's own
 * private view, matching this session's "own private view shows everything"
 * convention used elsewhere (my-journey.tsx's private Journey).
 */
export function MiniMomentCarousel({ tasks, onPressSlide, onIndexChange }: Props) {
  const { theme } = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const estimatedWidth = Math.min(380, windowWidth - 64);
  const [slideWidth, setSlideWidth] = useState(estimatedWidth);
  const [activeIndex, setActiveIndex] = useState(0);

  const onMomentumScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (slideWidth <= 0) return;
    const idx = Math.round(e.nativeEvent.contentOffset.x / slideWidth);
    const clamped = Math.max(0, Math.min(tasks.length - 1, idx));
    setActiveIndex(clamped);
    onIndexChange?.(clamped);
  };

  const active = tasks[activeIndex];

  return (
    <View style={styles.root}>
      <View
        style={[styles.frame, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceElevated }]}
        onLayout={(e) => {
          const w = e.nativeEvent.layout.width;
          if (w > 0 && Math.abs(w - slideWidth) > 1) setSlideWidth(w);
        }}
      >
        <FlatList
          data={tasks}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          keyExtractor={(t) => t.taskId}
          getItemLayout={(_, index) => ({ length: slideWidth, offset: slideWidth * index, index })}
          onMomentumScrollEnd={onMomentumScrollEnd}
          renderItem={({ item, index }) => (
            <Pressable
              onPress={() => onPressSlide(index)}
              style={{ width: slideWidth, height: "100%" }}
              accessibilityRole="imagebutton"
              accessibilityLabel={`View ${item.label}`}
            >
              {item.proofUrls[0] ? (
                <Image source={{ uri: item.proofUrls[0] }} style={styles.slideImage} resizeMode="cover" />
              ) : (
                <View style={[styles.textSlide, { backgroundColor: theme.colors.surface }]}>
                  <Text numberOfLines={5} style={[styles.textSlideNote, { color: theme.colors.textSecondary }]}>
                    {item.note ?? "Marked complete"}
                  </Text>
                </View>
              )}
            </Pressable>
          )}
        />
        {tasks.length > 1 ? (
          <View pointerEvents="none" style={styles.dotsRow}>
            {tasks.map((_, i) => (
              <View
                key={i}
                style={[styles.dot, { backgroundColor: i === activeIndex ? "#fff" : "rgba(255,255,255,0.4)" }]}
              />
            ))}
          </View>
        ) : null}
      </View>
      {active ? (
        <Text style={[styles.caption, { color: theme.colors.textSecondary }]} numberOfLines={2}>
          <Text style={[styles.captionLabel, { color: theme.colors.textPrimary }]}>{active.label}</Text>
          {active.note ? `  ·  ${active.note}` : ""}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { width: "92%", alignSelf: "center", maxWidth: 380, gap: 8 },
  frame: { borderRadius: 14, borderWidth: 1, overflow: "hidden", height: 260 },
  slideImage: { width: "100%", height: "100%" },
  textSlide: { width: "100%", height: "100%", alignItems: "center", justifyContent: "center", padding: 20 },
  textSlideNote: { fontSize: 14, lineHeight: 20, fontWeight: "600", textAlign: "center" },
  dotsRow: {
    position: "absolute",
    bottom: 10,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  caption: { fontSize: 13, lineHeight: 18, textAlign: "center" },
  captionLabel: { fontWeight: "800" },
});
