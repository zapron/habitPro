import React, { ReactNode } from "react";
import { StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { theme } from "../styles/theme";

type ScreenProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function Screen({ children, style }: ScreenProps) {
  return (
    <View style={[styles.container, style]}>
      <View pointerEvents="none" style={[styles.glowOrb, styles.glowTop]} />
      <View pointerEvents="none" style={[styles.glowOrb, styles.glowBottom]} />
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    flex: 1,
    paddingTop: 48,
    paddingHorizontal: theme.spacing.lg,
  },
  glowOrb: {
    position: "absolute",
    width: 220,
    height: 220,
    borderRadius: theme.radius.pill,
  },
  glowTop: {
    top: -90,
    right: -70,
    backgroundColor: "rgba(99, 102, 241, 0.22)",
  },
  glowBottom: {
    bottom: -110,
    left: -80,
    backgroundColor: "rgba(6, 182, 212, 0.14)",
  },
});
