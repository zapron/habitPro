import React, { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { useTheme } from "../context/ThemeContext";

type ScreenProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function Screen({ children, style }: ScreenProps) {
  const { theme, isDark } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }, style]}>
      <View
        pointerEvents="none"
        style={[
          styles.glowOrb,
          styles.glowTop,
          { borderRadius: theme.radius.pill, backgroundColor: isDark ? 'rgba(99, 102, 241, 0.22)' : 'rgba(99, 102, 241, 0.08)' },
        ]}
      />
      <View
        pointerEvents="none"
        style={[
          styles.glowOrb,
          styles.glowBottom,
          { borderRadius: theme.radius.pill, backgroundColor: isDark ? 'rgba(6, 182, 212, 0.14)' : 'rgba(6, 182, 212, 0.06)' },
        ]}
      />
      <KeyboardAvoidingView
        style={[styles.content, { paddingHorizontal: theme.spacing.lg }]}
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
  glowOrb: {
    position: "absolute",
    width: 220,
    height: 220,
  },
  glowTop: {
    top: -90,
    right: -70,
  },
  glowBottom: {
    bottom: -110,
    left: -80,
  },
});
