import React, { ReactNode, useRef } from "react";
import { KeyboardAvoidingView, Platform, StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../context/ThemeContext";
import { useAndroidKeyboardOverlap } from "../hooks/useAndroidKeyboardOverlap";

type ScreenProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Content vertically centered (e.g. auth). */
  plain?: boolean;
};

export function Screen({ children, style, plain }: ScreenProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const containerRef = useRef<View>(null);
  const keyboardOverlap = useAndroidKeyboardOverlap(containerRef);
  /** Tight top inset: only safe area + small gap (replaces fixed 48px). */
  const paddingTop = plain
    ? Math.max(insets.top, 20)
    : Math.max(insets.top + 4, 12);

  return (
    <View ref={containerRef} style={[styles.container, { backgroundColor: theme.colors.background }, style]}>
      <KeyboardAvoidingView
        style={[
          styles.content,
          plain && styles.contentPlain,
          { paddingHorizontal: theme.spacing.sm, paddingTop },
          keyboardOverlap ? { paddingBottom: keyboardOverlap } : null,
        ]}
        // No `behavior` on Android: with edge-to-edge the window is no longer
        // resized for the keyboard, so the measured overlap above pads the
        // content instead (0 on devices that still resize, so no double gap).
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 12 : 0}
      >
        {children}
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  contentPlain: {
    justifyContent: "center",
  },
});
