import { Modal, Pressable, Image, View, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X } from "lucide-react-native";

type Props = {
  visible: boolean;
  imageUri: string | null;
  onClose: () => void;
};

export function CommunityWinImageLightbox({ visible, imageUri, onClose }: Props) {
  const insets = useSafeAreaInsets();

  if (!imageUri) return null;

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
        <View style={styles.imgWrap}>
          <Image source={{ uri: imageUri }} style={styles.img} resizeMode="contain" />
        </View>
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
  imgWrap: {
    flex: 1,
    marginHorizontal: 12,
    justifyContent: "center",
  },
  img: {
    width: "100%",
    height: "100%",
  },
});
