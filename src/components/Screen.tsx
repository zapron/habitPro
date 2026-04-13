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
        behavior={Platform.OS === "ios" ? "padding" : "height"}
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
