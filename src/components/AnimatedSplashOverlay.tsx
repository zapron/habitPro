import { Text } from "./AppText";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  StyleSheet,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SPLASH_BACKGROUND_COLOR } from "../constants/splash";
import { useTheme } from "../context/ThemeContext";
import { quotes } from "../data/quotes";
import { withAlpha } from "../styles/theme";
import { SPLASH_CUES } from "../lib/splashInfinityMotion";
import { SplashInfinityMark } from "./SplashInfinityMark";

const AnimatedText = Animated.createAnimatedComponent(Text);

// The infinity-mark animation reaches its final Hold position at
// SPLASH_CUES.Hold seconds — the wisdom panel waits until just after that
// so it never competes with the wordmark/tagline settling in, but starts
// close enough behind it that it's fully visible for a real beat before
// SplashGate's MIN_DISPLAY_MS makes the overlay eligible to dismiss.
const WISDOM_INTRO_DELAY_MS = (SPLASH_CUES.Hold + 0.05) * 1000;
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
  const insets = useSafeAreaInsets();
  const layoutReported = useRef(false);
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

  const wisdomOpacity = wisdomProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });
  const wisdomTranslateY = wisdomProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [12, 0],
  });
  const wisdomPanelBg = isDark ? "rgba(15, 23, 42, 0.42)" : "rgba(255, 255, 255, 0.62)";
  const wisdomBorder = isDark ? withAlpha(theme.colors.indigo[400], 16) : withAlpha(theme.colors.indigo[500], 14);

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
      {/* Fills the whole screen — the mark's viewBox is a full 1080x1920 portrait
       * canvas (it was designed as the entire splash screen, not a small centered
       * logo box), so it needs the full frame to land in the right proportions. */}
      <View
        style={StyleSheet.absoluteFillObject}
        accessible
        accessibilityRole="image"
        accessibilityLabel={`habitPro loading. Daily wisdom. ${quote}`}
      >
        <SplashInfinityMark isDark={isDark} showWordmark keepCore={false} />
      </View>
      <Animated.View
        style={[
          styles.wisdomPanel,
          {
            bottom: Math.max(insets.bottom, 24) + 160,
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
  },
  wisdomPanel: {
    position: "absolute",
    left: 24,
    right: 24,
    borderRadius: 20,
    borderWidth: 1,
    paddingVertical: 16,
    paddingHorizontal: 18,
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
