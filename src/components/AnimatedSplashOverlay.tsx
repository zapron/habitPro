import { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Image,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from "react-native";

import {
  SPLASH_BACKGROUND_COLOR,
  SPLASH_WORDMARK_HABIT_COLOR,
  SPLASH_WORDMARK_PRO_COLOR,
} from "../constants/splash";

/** Slightly larger so full-bleed icons read clearly with splash `contain`. */
const LOGO_SIZE = 168;
const ROTATION_DURATION_MS = 18_000;

type Props = {
  onFirstLayout: () => void;
  dismiss: boolean;
  onDismissed: () => void;
};

export function AnimatedSplashOverlay({ onFirstLayout, dismiss, onDismissed }: Props) {
  const layoutReported = useRef(false);
  const spinProgress = useRef(new Animated.Value(0)).current;
  const overlayOpacity = useRef(new Animated.Value(1)).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (reduceMotion) return;
    const loop = Animated.loop(
      Animated.timing(spinProgress, {
        toValue: 1,
        duration: ROTATION_DURATION_MS,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => {
      loop.stop();
      spinProgress.setValue(0);
    };
  }, [reduceMotion, spinProgress]);

  useEffect(() => {
    if (!dismiss) return;
    Animated.timing(overlayOpacity, {
      toValue: 0,
      duration: 320,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) onDismissed();
    });
  }, [dismiss, onDismissed, overlayOpacity]);

  const rotate = spinProgress.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  const handleLayout = (_e: LayoutChangeEvent) => {
    if (layoutReported.current) return;
    layoutReported.current = true;
    onFirstLayout();
  };

  return (
    <Animated.View style={[styles.root, { opacity: overlayOpacity }]} onLayout={handleLayout}>
      <View style={styles.center}>
        <Animated.View style={[styles.logoWrap, { transform: [{ rotate }] }]}>
          <Image
            source={require("../../assets/habit-pro-icon.png")}
            style={styles.logo}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
          />
        </Animated.View>
        <Text style={styles.wordmark} accessibilityRole="text">
          <Text style={styles.wordmarkHabit}>habit</Text>
          <Text style={styles.wordmarkPro}>Pro</Text>
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: SPLASH_BACKGROUND_COLOR,
    zIndex: 9999,
    elevation: 9999,
    justifyContent: "center",
    alignItems: "center",
  },
  center: {
    alignItems: "center",
    justifyContent: "center",
  },
  logoWrap: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
    marginBottom: 16,
  },
  logo: {
    width: "100%",
    height: "100%",
  },
  wordmark: {
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
  wordmarkHabit: {
    color: SPLASH_WORDMARK_HABIT_COLOR,
  },
  wordmarkPro: {
    color: SPLASH_WORDMARK_PRO_COLOR,
  },
});
