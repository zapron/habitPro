import React, { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { useTheme } from "../context/ThemeContext";

type ScreenProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Content vertically centered (e.g. auth). */
  plain?: boolean;
};

export function Screen({ children, style, plain }: ScreenProps) {
  const { theme } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }, style]}>
      <KeyboardAvoidingView
        style={[
          styles.content,
          plain && styles.contentPlain,
          { paddingHorizontal: theme.spacing.lg },
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
    paddingTop: 48,
  },
  contentPlain: {
    paddingTop: 24,
    justifyContent: "center",
  },
});
