import { useEffect, useRef, useState } from "react";
import { Text } from "./AppText";
import { FlatList, Modal, Pressable, Image, View, StyleSheet, useWindowDimensions } from "react-native";
import type { NativeSyntheticEvent, NativeScrollEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X } from "lucide-react-native";

/** One carousel slide — a photo, a note, or both. `imageUrl` null renders a text-only card. */
export type CommunityLightboxSlide = {
  imageUrl: string | null;
  note?: string | null;
};

type Props = {
  visible: boolean;
  /** One or many. A single-item array renders exactly like the old single-photo lightbox. */
  slides: CommunityLightboxSlide[];
  /** Which photo to open on, e.g. when tapping a specific thumbnail in a catalog. */
  initialIndex?: number;
  onClose: () => void;
};

/**
 * docs/CATALOG_ARCHITECTURE.md Phase 4 — was single-image-only; now swipeable
 * across every surface that renders a Community photo (main feed, journey,
 * someone else's journey, single-post deep link) since they all share this
 * one component. Each slide can carry a `note` — shown as a caption under the
 * photo, or as its own text-only card when a slide has no photo at all — and
 * a dot row (in addition to the existing "N / M" counter) makes it visually
 * obvious there's more than one slide to swipe through.
 */
export function CommunityWinImageLightbox({ visible, slides, initialIndex = 0, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const listRef = useRef<FlatList<CommunityLightboxSlide>>(null);

  useEffect(() => {
    if (visible) setActiveIndex(initialIndex);
  }, [visible, initialIndex]);

  if (slides.length === 0) return null;

  const onMomentumScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (width <= 0) return;
    const idx = Math.round(e.nativeEvent.contentOffset.x / width);
    setActiveIndex(Math.max(0, Math.min(slides.length - 1, idx)));
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable
          style={[styles.closeBtn, { top: insets.top + 8, right: Math.max(insets.right, 16) }]}
          onPress={onClose}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <View style={styles.closeInner}>
            <X size={22} color="#fff" />
          </View>
        </Pressable>
        {slides.length > 1 ? (
          <View style={[styles.counterPill, { top: insets.top + 8 }]} pointerEvents="none">
            <Text style={styles.counterText}>
              {activeIndex + 1} / {slides.length}
            </Text>
          </View>
        ) : null}
        <FlatList
          ref={listRef}
          data={slides}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={initialIndex}
          getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
          keyExtractor={(slide, index) => `${index}-${slide.imageUrl ?? "text"}`}
          onMomentumScrollEnd={onMomentumScrollEnd}
          renderItem={({ item }) => {
            const note = item.note?.trim() || null;
            if (!item.imageUrl) {
              return (
                <View style={[styles.textSlide, { width }]}>
                  <Text style={styles.textSlideNote} numberOfLines={10}>
                    {note ?? "No photo for this moment."}
                  </Text>
                </View>
              );
            }
            return (
              <View style={[styles.imgWrap, { width }]}>
                <Image source={{ uri: item.imageUrl }} style={styles.img} resizeMode="contain" />
                {note ? (
                  <View style={[styles.captionBar, { paddingBottom: Math.max(insets.bottom, 12) + 28 }]} pointerEvents="none">
                    <Text style={styles.captionText} numberOfLines={4}>
                      {note}
                    </Text>
                  </View>
                ) : null}
              </View>
            );
          }}
        />
        {slides.length > 1 ? (
          <View pointerEvents="none" style={[styles.dotsRow, { bottom: Math.max(insets.bottom, 12) + 8 }]}>
            {slides.map((_, i) => (
              <View
                key={i}
                style={[styles.dot, { backgroundColor: i === activeIndex ? "#fff" : "rgba(255,255,255,0.4)" }]}
              />
            ))}
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.92)",
    justifyContent: "center",
  },
  closeBtn: {
    position: "absolute",
    zIndex: 2,
  },
  closeInner: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.55)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  counterPill: {
    position: "absolute",
    alignSelf: "center",
    zIndex: 2,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  counterText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  imgWrap: {
    height: "100%",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  img: {
    width: "100%",
    height: "100%",
  },
  captionBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 24,
    paddingTop: 14,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  captionText: {
    color: "#fff",
    fontSize: 14,
    lineHeight: 19,
    textAlign: "center",
  },
  textSlide: {
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  textSlideNote: {
    color: "rgba(255,255,255,0.92)",
    fontSize: 16,
    lineHeight: 23,
    textAlign: "center",
  },
  dotsRow: {
    position: "absolute",
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 5,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
