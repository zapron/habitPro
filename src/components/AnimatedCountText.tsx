import { useEffect, useRef, useState } from "react";
import { Animated, Easing, type StyleProp, type TextStyle } from "react-native";
import { Text } from "./AppText";

type Props = {
  value: number | null | undefined;
  style?: StyleProp<TextStyle>;
  durationMs?: number;
};

export function AnimatedCountText({ value, style, durationMs }: Props) {
  const target = Math.max(0, Math.floor(Number.isFinite(value) ? Number(value) : 0));
  const [displayValue, setDisplayValue] = useState(target);
  const animatedValue = useRef(new Animated.Value(target)).current;
  const currentValueRef = useRef(target);

  useEffect(() => {
    const id = animatedValue.addListener(({ value: next }) => {
      const rounded = Math.max(0, Math.round(next));
      currentValueRef.current = next;
      setDisplayValue((current) => (current === rounded ? current : rounded));
    });
    return () => animatedValue.removeListener(id);
  }, [animatedValue]);

  useEffect(() => {
    if (Math.round(currentValueRef.current) === target) return;
    const distance = Math.abs(target - currentValueRef.current);
    const duration = durationMs ?? Math.min(900, Math.max(360, distance * 90));
    Animated.timing(animatedValue, {
      toValue: target,
      duration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [animatedValue, durationMs, target]);

  return (
    <Text style={style} numberOfLines={1}>
      {displayValue}
    </Text>
  );
}
