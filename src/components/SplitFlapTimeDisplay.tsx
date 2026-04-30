import { Text } from "./AppText";
import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState } from "react";
import {
  Animated,
  Easing,
  Platform,
  StyleSheet,
  TextStyle,
  useWindowDimensions,
  View,
} from "react-native";

const ROLL_MS = 280;

/** Autopilot count-up: which units are visible (each tier unlocks after the previous threshold). */
export type ProgressivePhase = "ss" | "mmss" | "hhmmss" | "ddhhmmss";

type SplitFlapDigitProps = {
  digit: string;
  fontSize: number;
  lineHeight: number;
  digitWidth: number;
  color: string;
  textShadowStyle?: Pick<
    TextStyle,
    "textShadowColor" | "textShadowOffset" | "textShadowRadius"
  >;
};

function SplitFlapDigit({
  digit,
  fontSize,
  lineHeight,
  digitWidth,
  color,
  textShadowStyle,
}: SplitFlapDigitProps) {
  const prev = useRef(digit);
  const [top, setTop] = useState(digit);
  const [bottom, setBottom] = useState(digit);
  const translateY = useRef(new Animated.Value(0)).current;

  /** When the roll has settled (same glyph top + bottom), force translateY=0 before paint.
   *  Deferring reset with rAF after setState let translate stay at -lineHeight for one frame
   *  with two identical lines — on some Android GPUs that reads as a ghost/blurred double. */
  useLayoutEffect(() => {
    if (top === bottom) {
      translateY.setValue(0);
    }
  }, [top, bottom, translateY]);

  useEffect(() => {
    if (digit === prev.current) return;
    setTop(prev.current);
    setBottom(digit);
    translateY.setValue(0);
    const anim = Animated.timing(translateY, {
      toValue: -lineHeight,
      duration: ROLL_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    anim.start(({ finished }) => {
      if (!finished) return;
      prev.current = digit;
      setTop(digit);
      setBottom(digit);
    });
    return () => {
      anim.stop();
    };
  }, [digit, lineHeight, translateY]);

  const shadowForDigit =
    Platform.OS === "android" ? undefined : textShadowStyle;

  return (
    <View
      collapsable={false}
      style={[styles.digitShell, { width: digitWidth, height: lineHeight }]}
    >
      <View
        collapsable={false}
        style={[styles.clip, { height: lineHeight, width: digitWidth }]}
      >
        <Animated.View
          collapsable={false}
          style={[
            styles.rollCol,
            { width: digitWidth },
            {
              transform: [{ translateY }],
            },
          ]}
        >
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={1.25}
            style={[
              styles.digitText,
              {
                fontSize,
                lineHeight,
                height: lineHeight,
                width: digitWidth,
                color,
              },
              shadowForDigit,
            ]}
          >
            {top}
          </Text>
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={1.25}
            style={[
              styles.digitText,
              {
                fontSize,
                lineHeight,
                height: lineHeight,
                width: digitWidth,
                color,
              },
              shadowForDigit,
            ]}
          >
            {bottom}
          </Text>
        </Animated.View>
      </View>
    </View>
  );
}

function parseDisplayToPairs(display: string): [string, string][] {
  const parts = display.split(":").map((p) => p.trim());
  const pairs: [string, string][] = [];
  for (const part of parts) {
    const d = part.replace(/\D/g, "").padStart(2, "0").slice(-2);
    pairs.push([d[0] ?? "0", d[1] ?? "0"]);
  }
  return pairs;
}

type SplitFlapTimeDisplayProps = {
  /** e.g. `05` | `03:42` | `01:05:30` | `01:02:03:04` — segments are always two digits each */
  display: string;
  phase: ProgressivePhase;
  timeColor: string;
  size?: "normal" | "large";
  unitLabels?: readonly string[];
  unitColor?: string;
  digitTextShadow?: Pick<
    TextStyle,
    "textShadowColor" | "textShadowOffset" | "textShadowRadius"
  >;
};

export function SplitFlapTimeDisplay({
  display,
  phase,
  timeColor,
  size = "normal",
  unitLabels,
  unitColor,
  digitTextShadow,
}: SplitFlapTimeDisplayProps) {
  const { width: windowW } = useWindowDimensions();
  const pairs = useMemo(() => parseDisplayToPairs(display), [display]);

  const { fontSize, lineHeight, digitWidth } = useMemo(() => {
    const narrow = windowW < 380;
    let fs = narrow ? 20 : 23;
    let lh = narrow ? 22 : 25;

    if (size === "large") {
      if (pairs.length <= 1) {
        fs = narrow ? 68 : 84;
        lh = narrow ? 76 : 92;
      } else if (pairs.length === 2) {
        fs = narrow ? 62 : 76;
        lh = narrow ? 68 : 84;
      } else if (pairs.length === 3) {
        fs = narrow ? 38 : 46;
        lh = narrow ? 44 : 52;
      } else {
        fs = narrow ? 30 : 36;
        lh = narrow ? 36 : 42;
      }
    }

    const dw = Math.max(16, Math.round(fs * 0.68));
    return { fontSize: fs, lineHeight: lh, digitWidth: dw };
  }, [pairs.length, size, windowW]);

  const separatorFontSize = Math.round(fontSize * 0.82);
  const separatorWidth = Math.max(11, Math.round(fontSize * 0.5));

  const digitProps = {
    fontSize,
    lineHeight,
    digitWidth,
    color: timeColor,
    textShadowStyle: digitTextShadow,
  };

  const compact = pairs.length === 1;

  return (
    <View style={styles.stack}>
      <View style={[styles.row, compact && styles.rowCompact]}>
        {pairs.map((pair, i) => (
          <Fragment key={`${phase}-${i}`}>
            {i > 0 ? (
              <Text
                style={[
                  styles.sep,
                  {
                    color: timeColor,
                    fontSize: separatorFontSize,
                    lineHeight: lineHeight + 10,
                    width: separatorWidth,
                  },
                ]}
              >
                :
              </Text>
            ) : null}
            <View style={[styles.pair, compact && styles.pairCompact]}>
              <SplitFlapDigit digit={pair[0]} {...digitProps} />
              <SplitFlapDigit digit={pair[1]} {...digitProps} />
            </View>
          </Fragment>
        ))}
      </View>

      {unitLabels ? (
        <View
          style={[
            styles.unitRow,
            size === "large" && styles.unitRowLarge,
            compact && styles.rowCompact,
          ]}
        >
          {pairs.map((_, i) => (
            <Fragment key={`${phase}-unit-${i}`}>
              {i > 0 ? (
                <View style={{ width: separatorWidth, flexShrink: 0 }} />
              ) : null}
              <View style={[styles.unitCol, compact && styles.unitColCompact]}>
                <Text
                  style={[
                    styles.unitText,
                    size === "large" && styles.unitTextLarge,
                    { color: unitColor ?? timeColor },
                  ]}
                  numberOfLines={1}
                >
                  {unitLabels[i] ?? ""}
                </Text>
              </View>
            </Fragment>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    width: "100%",
    minWidth: 0,
    alignSelf: "stretch",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    minWidth: 0,
    alignSelf: "stretch",
  },
  rowCompact: {
    justifyContent: "center",
  },
  pair: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    minWidth: 0,
  },
  pairCompact: {
    flex: 0,
    flexGrow: 0,
    flexShrink: 0,
  },
  sep: {
    flexShrink: 0,
    fontWeight: "700",
    opacity: 0.45,
    textAlign: "center",
    ...(Platform.OS === "android"
      ? { includeFontPadding: false, textAlignVertical: "center" as const }
      : {}),
  },
  digitShell: {
    flexShrink: 0,
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  clip: {
    overflow: "hidden",
    alignItems: "center",
    alignSelf: "center",
  },
  rollCol: {
    alignItems: "center",
  },
  digitText: {
    fontWeight: "700",
    textAlign: "center",
    fontVariant: ["tabular-nums"],
    ...(Platform.OS === "android"
      ? { includeFontPadding: false, textAlignVertical: "center" as const }
      : {}),
  },
  unitRow: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    minWidth: 0,
    alignSelf: "stretch",
    marginTop: 6,
  },
  unitRowLarge: {
    marginTop: 4,
  },
  unitCol: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
  },
  unitColCompact: {
    flex: 0,
    flexGrow: 0,
    flexShrink: 0,
  },
  unitText: {
    fontSize: 10,
    fontWeight: "700",
    textAlign: "center",
  },
  unitTextLarge: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
});
