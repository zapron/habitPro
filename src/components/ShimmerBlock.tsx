import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, StyleProp, View, ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

type Props = {
  isDark: boolean;
  reduceMotion?: boolean;
  height: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
  baseColor?: string;
};

export function ShimmerBlock({
  isDark,
  reduceMotion = false,
  height,
  radius = 14,
  style,
  baseColor,
}: Props) {
  const shimmerX = useRef(new Animated.Value(0)).current;
  const [w, setW] = useState(0);

  useEffect(() => {
    if (reduceMotion || w <= 0) return;
    shimmerX.stopAnimation();
    shimmerX.setValue(-w);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerX, {
          toValue: w,
          duration: 1150,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.delay(260),
      ]),
      { resetBeforeIteration: true },
    );
    loop.start();
    return () => loop.stop();
  }, [reduceMotion, shimmerX, w]);

  const bg = baseColor ?? (isDark ? "rgba(255,255,255,0.06)" : "rgba(2,6,23,0.05)");
  const sheen = isDark ? "rgba(255,255,255,0.22)" : "rgba(0,0,0,0.08)";
  const sheer = "rgba(255,255,255,0)";

  const shimmerWidthPct = useMemo(() => "55%" as const, []);

  return (
    <View
      style={[
        {
          height,
          borderRadius: radius,
          overflow: "hidden",
          backgroundColor: bg,
        },
        style,
      ]}
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
    >
      <Animated.View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: -2,
          bottom: -2,
          left: 0,
          width: shimmerWidthPct,
          opacity: reduceMotion ? 0 : 1,
          transform: [{ translateX: shimmerX }],
        }}
      >
        <LinearGradient
          colors={[sheer, sheen, sheer]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ flex: 1 }}
        />
      </Animated.View>
    </View>
  );
}

