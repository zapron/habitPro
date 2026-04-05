import React, { useEffect, useRef } from "react";
import { View, StyleSheet, Animated } from "react-native";
import { Flame } from "lucide-react-native";

/** Fire-burn bar for mini missions (fuel burning toward the goal) — animated ember + flame at the leading edge. */
export function MiniMissionFireProgressBar({ progress, isDark }: { progress: number; isDark: boolean }) {
  const emberAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(emberAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(emberAnim, { toValue: 0, duration: 800, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [emberAnim]);

  const clampedProgress = Math.min(1, Math.max(0, progress));
  const isNearEnd = clampedProgress > 0.85;

  return (
    <View style={[barStyles.track, { backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)" }]}>
      <View
        style={[
          barStyles.fill,
          {
            width: `${clampedProgress * 100}%`,
            backgroundColor: isNearEnd ? "#ef4444" : "#f97316",
          },
        ]}
      />
      {clampedProgress > 0.01 && clampedProgress < 1 && (
        <Animated.View
          style={[
            barStyles.ember,
            {
              left: `${clampedProgress * 100}%`,
              opacity: emberAnim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }),
              backgroundColor: isNearEnd ? "#fca5a5" : "#fdba74",
              shadowColor: isNearEnd ? "#ef4444" : "#f97316",
            },
          ]}
        />
      )}
      {clampedProgress > 0.03 && clampedProgress < 1 && (
        <Animated.View
          style={[
            barStyles.fireIcon,
            {
              left: `${clampedProgress * 100}%`,
              opacity: emberAnim.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }),
              transform: [{ scale: emberAnim.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.15] }) }],
            },
          ]}
        >
          <Flame size={14} color={isNearEnd ? "#ef4444" : "#f97316"} fill={isNearEnd ? "#fca5a5" : "#fdba74"} />
        </Animated.View>
      )}
    </View>
  );
}

const barStyles = StyleSheet.create({
  track: { height: 6, borderRadius: 3, overflow: "visible", marginTop: 18, position: "relative" },
  fill: { height: "100%", borderRadius: 3 },
  ember: {
    position: "absolute",
    top: -2,
    width: 10,
    height: 10,
    borderRadius: 5,
    marginLeft: -5,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
    elevation: 4,
  },
  fireIcon: {
    position: "absolute",
    top: -14,
    marginLeft: -7,
  },
});
