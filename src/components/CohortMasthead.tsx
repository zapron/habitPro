import { useEffect, useMemo, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { useReducedMotion } from "../hooks/useReducedMotion";
import type { AppTheme } from "../styles/theme";

type Props = {
  theme: AppTheme;
  /** One line, e.g. leading streak or tie message */
  message: string;
};

export function CohortMasthead({ theme, message }: Props) {
  const opacity = useRef(new Animated.Value(1)).current;
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (reduceMotion) {
      opacity.setValue(1);
      return;
    }
    opacity.setValue(0.92);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 1400, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.88, duration: 1400, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity, message, reduceMotion]);

  const animStyle = useMemo(() => (reduceMotion ? undefined : { opacity }), [opacity, reduceMotion]);

  return (
    <View
      style={[
        styles.wrap,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
        },
      ]}
    >
      <Animated.Text style={[styles.text, { color: theme.colors.indigo[400] }, animStyle]} numberOfLines={3}>
        {message}
      </Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 16,
  },
  text: { fontSize: 15, fontWeight: "800", lineHeight: 21, textAlign: "center" },
});
