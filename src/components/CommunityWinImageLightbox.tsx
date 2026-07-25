import { useEffect, useRef, useState } from "react";
import { Text } from "./AppText";
import { FlatList, Modal, Pressable, Image, View, StyleSheet, useWindowDimensions } from "react-native";
import type { NativeSyntheticEvent, NativeScrollEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X } from "lucide-react-native";

type Props = {
  visible: boolean;
  /** One or many. A single-item array renders exactly like the old single-photo lightbox. */
  images: string[];
  /** Which photo to open on, e.g. when tapping a specific thumbnail in a catalog. */
  initialIndex?: number;
  onClose: () => void;
};

/**
 * docs/CATALOG_ARCHITECTURE.md Phase 4 — was single-image-only; now swipeable
 * across every surface that renders a Community photo (main feed, journey,
 * someone else's journey, single-post deep link) since they all share this
 * one component.
 */
export function CommunityWinImageLightbox({ visible, images, initialIndex = 0, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const listRef = useRef<FlatList<string>>(null);

  useEffect(() => {
    if (visible) setActiveIndex(initialIndex);
  }, [visible, initialIndex]);

  if (images.length === 0) return null;

  const onMomentumScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (width <= 0) return;
    const idx = Math.round(e.nativeEvent.contentOffset.x / width);
    setActiveIndex(Math.max(0, Math.min(images.length - 1, idx)));
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
        {images.length > 1 ? (
          <View style={[styles.counterPill, { top: insets.top + 8 }]} pointerEvents="none">
            <Text style={styles.counterText}>
              {activeIndex + 1} / {images.length}
            </Text>
          </View>
        ) : null}
        <FlatList
          ref={listRef}
          data={images}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={initialIndex}
          getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
          keyExtractor={(uri, index) => `${index}-${uri}`}
          onMomentumScrollEnd={onMomentumScrollEnd}
          renderItem={({ item }) => (
            <View style={[styles.imgWrap, { width }]}>
              <Image source={{ uri: item }} style={styles.img} resizeMode="contain" />
            </View>
          )}
        />
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
});
