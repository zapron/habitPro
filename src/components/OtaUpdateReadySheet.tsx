import { useEffect, useRef } from "react";
import { Animated, Easing, Modal, Pressable, StyleSheet, View } from "react-native";
import { Text } from "./AppText";
import { Button } from "./Button";
import { GlassTopHighlight } from "./GlassTopHighlight";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { useTheme } from "../context/ThemeContext";
import { withAlpha } from "../styles/theme";

type Props = {
  visible: boolean;
  onLater: () => void;
  onRestart: () => void;
};

/**
 * Premium replacement for the generic showAlert() that used to announce a
 * downloaded OTA (JS-bundle-only) update — glass shimmer + spring entrance,
 * same bottom-sheet shape as NotificationPermissionSheet, so the two "we have
 * something for you" moments in the app feel like the same product instead of
 * one being a plain native-style alert.
 */
export function OtaUpdateReadySheet({ visible, onLater, onRestart }: Props) {
  const { theme, isDark } = useTheme();
  const reduceMotion = useReducedMotion();
  const backdropOp = useRef(new Animated.Value(0)).current;
  const sheetOp = useRef(new Animated.Value(0)).current;
  const sheetY = useRef(new Animated.Value(28)).current;

  useEffect(() => {
    if (!visible) return;
    if (reduceMotion) {
      backdropOp.setValue(1);
      sheetOp.setValue(1);
      sheetY.setValue(0);
      return;
    }
    backdropOp.setValue(0);
    sheetOp.setValue(0);
    sheetY.setValue(28);
    Animated.parallel([
      Animated.timing(backdropOp, {
        toValue: 1,
        duration: 240,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(sheetOp, {
        toValue: 1,
        duration: 280,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(sheetY, {
        toValue: 0,
        friction: 9,
        tension: 68,
        useNativeDriver: true,
      }),
    ]).start();
  }, [visible, reduceMotion, backdropOp, sheetOp, sheetY]);

  return (
    <Modal transparent visible={visible} animationType="none" statusBarTranslucent onRequestClose={onLater}>
      <View style={styles.modalRoot} pointerEvents="box-none">
        <Animated.View
          pointerEvents="box-none"
          style={[
            styles.backdrop,
            { opacity: backdropOp, backgroundColor: isDark ? withAlpha(theme.colors.scrim, 62) : withAlpha(theme.colors.scrim, 45) },
          ]}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={onLater} accessibilityRole="button" accessibilityLabel="Dismiss" />
        </Animated.View>
        <Animated.View
          style={{
            width: "100%",
            maxWidth: 440,
            alignSelf: "center",
            opacity: sheetOp,
            transform: [{ translateY: sheetY }],
          }}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={[
              styles.sheet,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
                borderRadius: theme.radius.lg,
                ...theme.shadow.card,
              },
            ]}
          >
            <GlassTopHighlight radius={theme.radius.lg} />
            <Text style={[styles.title, { color: theme.colors.textPrimary }]}>Update ready</Text>
            <Text style={[styles.body, { color: theme.colors.textSecondary }]}>
              A small HabitPro refresh has downloaded — restart now to apply it, or it'll apply next time you open the app.
            </Text>
            <View style={styles.actions}>
              <Button title="Restart now" onPress={onRestart} />
              <Button title="Later" variant="secondary" onPress={onLater} />
            </View>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: { flex: 1, justifyContent: "flex-end", padding: 20 },
  backdrop: { ...StyleSheet.absoluteFillObject },
  sheet: {
    width: "100%",
    borderWidth: 1.5,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 18,
    overflow: "hidden",
  },
  title: { fontSize: 18, fontWeight: "900", letterSpacing: -0.2, marginBottom: 8, lineHeight: 24 },
  body: { fontSize: 14, lineHeight: 20, fontWeight: "600" },
  actions: { gap: 10, marginTop: 16 },
});
