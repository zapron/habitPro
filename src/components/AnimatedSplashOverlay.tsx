import { Text } from "./AppText";
import { useEffect, useMemo, useRef, useState } from "react";
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
  SPLASH_WORDMARK_PRO_COLOR,
} from "../constants/splash";
import { useTheme } from "../context/ThemeContext";
import { quotes } from "../data/quotes";

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
const WISDOM_INTRO_DELAY_MS = 1280;
const WISDOM_INTRO_DURATION_MS = 560;

function dailyQuoteIndex(date = new Date()): number {
  const key = date.toISOString().slice(0, 10);
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) % 100000;
  }
  return Math.abs(hash) % quotes.length;
}

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
  const wisdomProgress = useRef(new Animated.Value(0)).current;
  const overlayOpacity = useRef(new Animated.Value(1)).current;
  const [reduceMotion, setReduceMotion] = useState(false);
  const quote = useMemo(() => quotes[dailyQuoteIndex()], []);

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
        isInteraction: false,
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
        isInteraction: false,
      }),
    ]);
    intro.start();
    return () => {
      intro.stop();
    };
  }, [lockupProgress, reduceMotion]);

  useEffect(() => {
    if (reduceMotion) {
      wisdomProgress.setValue(1);
      return;
    }

    wisdomProgress.setValue(0);
    const intro = Animated.sequence([
      Animated.delay(WISDOM_INTRO_DELAY_MS),
      Animated.timing(wisdomProgress, {
        toValue: 1,
        duration: WISDOM_INTRO_DURATION_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
        isInteraction: false,
      }),
    ]);
    intro.start();
    return () => {
      intro.stop();
    };
  }, [reduceMotion, wisdomProgress]);

  useEffect(() => {
    if (!dismiss) return;
    Animated.timing(overlayOpacity, {
      toValue: 0,
      duration: 320,
      useNativeDriver: true,
      isInteraction: false,
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
  const wisdomOpacity = wisdomProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });
  const wisdomTranslateY = wisdomProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [12, 0],
  });
  const wordmarkHabitColor = isDark ? theme.colors.slate[400] : theme.colors.textSecondary;
  const wisdomPanelBg = isDark ? "rgba(15, 23, 42, 0.42)" : "rgba(255, 255, 255, 0.62)";
  const wisdomBorder = isDark ? "rgba(129, 140, 248, 0.16)" : "rgba(99, 102, 241, 0.14)";

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
        accessibilityLabel={`habitPro loading. Daily wisdom. ${quote}`}
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
          <Text style={[styles.wordmarkHabit, { color: wordmarkHabitColor }]}>habit</Text>
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
      <Animated.View
        style={[
          styles.wisdomPanel,
          {
            opacity: wisdomOpacity,
            backgroundColor: wisdomPanelBg,
            borderColor: wisdomBorder,
            transform: [{ translateY: wisdomTranslateY }],
          },
        ]}
      >
        <Text style={[styles.wisdomLabel, { color: theme.colors.textMuted }]}>DAILY WISDOM</Text>
        <AnimatedText style={[styles.wisdomText, { color: theme.colors.textPrimary }]} numberOfLines={3}>
          "{quote}"
        </AnimatedText>
        <Text style={[styles.wisdomStatus, { color: theme.colors.textMuted }]}>
          Preparing today's missions
        </Text>
      </Animated.View>
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
    paddingHorizontal: 24,
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
    fontWeight: "700",
  },
  wordmarkPro: {
    color: SPLASH_WORDMARK_PRO_COLOR,
    fontWeight: "700",
  },
  wisdomPanel: {
    width: "100%",
    maxWidth: 390,
    borderRadius: 20,
    borderWidth: 1,
    paddingVertical: 16,
    paddingHorizontal: 18,
    marginTop: 8,
  },
  wisdomLabel: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "900",
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  wisdomText: {
    fontSize: 17,
    lineHeight: 24,
    fontWeight: "800",
    letterSpacing: 0,
  },
  wisdomStatus: {
    marginTop: 12,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "800",
  },
});
