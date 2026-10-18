import { useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { Text } from "./AppText";

/**
 * Instagram-style page dots for photo carousels. At most VISIBLE dots are
 * shown no matter how many pages there are; the row slides along as you swipe,
 * and the end dots shrink when more pages sit beyond them. With few pages it
 * behaves like plain dots. Never wider than VISIBLE slots, so it can't overflow
 * the photo it sits on.
 */
const VISIBLE = 5;
const DOT = 6;
const GAP = 6;
const SLOT = DOT + GAP;

type Props = {
  count: number;
  index: number;
  activeColor?: string;
  inactiveColor?: string;
  /** Adds a small "7/42" beside the dots once there are more pages than dots. */
  showCounter?: boolean;
};

export function PageDots({
  count,
  index,
  activeColor = "#fff",
  inactiveColor = "rgba(255,255,255,0.45)",
  showCounter = false,
}: Props) {
  const startRef = useRef(0);
  const visible = Math.min(VISIBLE, count);

  // Keep the active dot inside the window, away from the edges where possible.
  let start = startRef.current;
  if (count <= VISIBLE) start = 0;
  else {
    if (index > start + VISIBLE - 2) start = index - (VISIBLE - 2);
    if (index < start + 1) start = index - 1;
    start = Math.max(0, Math.min(start, count - VISIBLE));
  }
  startRef.current = start;

  const shift = useRef(new Animated.Value(-start * SLOT)).current;
  useEffect(() => {
    Animated.timing(shift, { toValue: -start * SLOT, duration: 220, useNativeDriver: true }).start();
  }, [start, shift]);

  if (count <= 1) return null;

  const end = start + visible;
  const dots = (
    <View style={[styles.window, { width: visible * SLOT - GAP }]} pointerEvents="none">
      <Animated.View style={[styles.row, { transform: [{ translateX: shift }] }]}>
        {Array.from({ length: count }, (_, i) => {
          let scale = 1;
          if (i < start || i >= end) scale = 0.4;
          else if ((i === start && start > 0) || (i === end - 1 && end < count)) scale = 0.6;
          return (
            <View
              key={i}
              style={[
                styles.dot,
                {
                  backgroundColor: i === index ? activeColor : inactiveColor,
                  transform: [{ scale: i === index ? 1 : scale }],
                },
              ]}
            />
          );
        })}
      </Animated.View>
    </View>
  );
  if (!showCounter || count <= VISIBLE) return dots;
  return (
    <View style={styles.withCounter} pointerEvents="none">
      {dots}
      <View style={styles.counter}>
        <Text style={styles.counterText}>
          {index + 1}/{count}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  window: { height: DOT, overflow: "hidden", alignSelf: "center" },
  row: { flexDirection: "row", gap: GAP },
  dot: { width: DOT, height: DOT, borderRadius: DOT / 2 },
  withCounter: { flexDirection: "row", alignItems: "center", alignSelf: "center", gap: 8 },
  counter: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 8, backgroundColor: "rgba(10,12,20,0.45)" },
  counterText: { color: "#fff", fontSize: 10, fontWeight: "700", fontVariant: ["tabular-nums"] },
});
