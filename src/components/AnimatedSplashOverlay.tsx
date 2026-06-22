import { Text } from "./AppText";
import { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Image,
  StyleSheet,
  View,
  type LayoutChangeEvent,
} from "react-native";

import {
  SPLASH_BACKGROUND_COLOR,
  SPLASH_WORDMARK_HABIT_COLOR,
  SPLASH_WORDMARK_PRO_COLOR,
} from "../constants/splash";
import { useTheme } from "../context/ThemeContext";

const AnimatedText = Animated.createAnimatedComponent(Text);

const STAGE_WIDTH = 312;
const STAGE_HEIGHT = 190;
const LOGO_START_SIZE = 168;
const LOGO_FINAL_SIZE = 40;
const LOGO_FINAL_TRANSLATE_X = 88;
const LOGO_FINAL_TRANSLATE_Y = 4;
const WORDMARK_FONT_SIZE = 48;
const WORDMARK_LINE_HEIGHT = 62;
const WORDMARK_GAP = 6;
const ROTATION_DURATION_MS = 18_000;

type Props = {
  onFirstLayout: () => void;
  dismiss: boolean;
  onDismissed: () => void;
};

export function AnimatedSplashOverlay({ onFirstLayout, dismiss, onDismissed }: Props) {
  const { theme, isDark } = useTheme();
  const layoutReported = useRef(false);
  const spinProgress = useRef(new Animated.Value(0)).current;
  const lockupProgress = useRef(new Animated.Value(0)).current;
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
    if (reduceMotion) {
      lockupProgress.setValue(1);
      return;
    }

    lockupProgress.setValue(0);
    const intro = Animated.sequence([
      Animated.delay(460),
      Animated.timing(lockupProgress, {
        toValue: 1,
        duration: 820,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]);
    intro.start();
    return () => {
      intro.stop();
    };
  }, [lockupProgress, reduceMotion]);

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
  const logoScale = lockupProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [1, LOGO_FINAL_SIZE / LOGO_START_SIZE],
  });
  const logoTranslateX = lockupProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, LOGO_FINAL_TRANSLATE_X],
  });
  const logoTranslateY = lockupProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, LOGO_FINAL_TRANSLATE_Y],
  });
  const wordmarkOpacity = lockupProgress.interpolate({
    inputRange: [0, 0.42, 1],
    outputRange: [0, 0, 1],
  });
  const wordmarkTranslateX = lockupProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [-26, 0],
  });

  const handleLayout = (_e: LayoutChangeEvent) => {
    if (layoutReported.current) return;
    layoutReported.current = true;
    onFirstLayout();
  };

  return (
    <Animated.View
      pointerEvents={dismiss ? "none" : "auto"}
      style={[
        styles.root,
        {
          opacity: overlayOpacity,
          backgroundColor: theme.colors.background,
        },
      ]}
      onLayout={handleLayout}
    >
      <View
        style={styles.stage}
        accessible
        accessibilityRole="image"
        accessibilityLabel="habitPro loading"
      >
        <AnimatedText
          style={[
            styles.wordmark,
            {
              opacity: wordmarkOpacity,
              transform: [{ translateX: wordmarkTranslateX }],
            },
          ]}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Text style={[styles.wordmarkHabit, { color: isDark ? "#FFFFFF" : "#000000" }]}>habit</Text>
          <Text style={[styles.wordmarkPro, { color: SPLASH_WORDMARK_PRO_COLOR }]}>Pr</Text>
        </AnimatedText>
        <Animated.View
          style={[
            styles.logoWrap,
            {
              transform: [
                { translateX: logoTranslateX },
                { translateY: logoTranslateY },
                { scale: logoScale },
              ],
            },
          ]}
        >
          <Animated.View style={[styles.logoSpin, { transform: [{ rotate }] }]}>
            <Image
              source={require("../../assets/habitpro-logo-transparent-v3.png")}
              style={styles.logo}
              resizeMode="contain"
              accessibilityIgnoresInvertColors
            />
          </Animated.View>
        </Animated.View>
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
  stage: {
    width: STAGE_WIDTH,
    height: STAGE_HEIGHT,
  },
  logoWrap: {
    position: "absolute",
    left: (STAGE_WIDTH - LOGO_START_SIZE) / 2,
    top: (STAGE_HEIGHT - LOGO_START_SIZE) / 2,
    width: LOGO_START_SIZE,
    height: LOGO_START_SIZE,
  },
  logo: {
    width: "100%",
    height: "100%",
  },
  logoSpin: {
    width: "100%",
    height: "100%",
  },
  wordmark: {
    position: "absolute",
    left: 0,
    top: (STAGE_HEIGHT - WORDMARK_LINE_HEIGHT) / 2,
    width:
      STAGE_WIDTH / 2 +
      LOGO_FINAL_TRANSLATE_X -
      LOGO_FINAL_SIZE / 2 -
      WORDMARK_GAP,
    fontSize: WORDMARK_FONT_SIZE,
    lineHeight: WORDMARK_LINE_HEIGHT,
    fontWeight: "700",
    letterSpacing: 0,
    textAlign: "right",
  },
  wordmarkHabit: {
    color: SPLASH_WORDMARK_HABIT_COLOR,
    fontWeight: "700",
  },
  wordmarkPro: {
    color: SPLASH_WORDMARK_PRO_COLOR,
    fontWeight: "700",
  },
});
