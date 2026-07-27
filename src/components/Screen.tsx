import React, { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../context/ThemeContext";

type ScreenProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Content vertically centered (e.g. auth). */
  plain?: boolean;
};

export function Screen({ children, style, plain }: ScreenProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  /** Tight top inset: only safe area + small gap (replaces fixed 48px). */
  const paddingTop = plain
    ? Math.max(insets.top, 20)
    : Math.max(insets.top + 4, 12);

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }, style]}>
      <KeyboardAvoidingView
        style={[
          styles.content,
          plain && styles.contentPlain,
          { paddingHorizontal: theme.spacing.sm, paddingTop },
        ]}
        // Android already resizes the window when the keyboard opens
        // (default windowSoftInputMode="adjustResize"), so no `behavior` is
        // needed there — stacking "height" on top of that native resize is
        // what let a focused field near the bottom of a form (e.g. a
        // Description textarea) end up covered by the keyboard. Every other
        // KeyboardAvoidingView in the app already follows this same
        // `undefined` on Android pattern; this was the one outlier.
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
