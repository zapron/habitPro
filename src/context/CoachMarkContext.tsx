import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  type StyleProp,
  useWindowDimensions,
  View,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowDown, ArrowUp, X } from "lucide-react-native";
import { Text } from "../components/AppText";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { useTheme } from "./ThemeContext";

export type CoachMarkId =
  | "home_create_mission"
  | "home_mini_missions"
  | "mini_start_timer"
  | "mini_mark_complete"
  | "mini_complete_memory"
  | "community_cheer";

type CoachMarkPlacement = "auto" | "above" | "below";

type CoachMarkRequest = {
  id: CoachMarkId;
  title: string;
  body: string;
  cta?: string;
  placement?: CoachMarkPlacement;
};

type TargetRect = { x: number; y: number; width: number; height: number };

type CoachMarkContextValue = {
  registerTarget: (id: CoachMarkId, node: View) => () => void;
  requestCoachMark: (mark: CoachMarkRequest) => Promise<boolean>;
  dismissCoachMark: (id?: CoachMarkId) => void;
};

const CoachMarkContext = createContext<CoachMarkContextValue | null>(null);

const SEEN_PREFIX = "@habitpro_coach_seen";
const TARGET_PAD = 8;
const EDGE_PAD = 16;
// Local testing switch only. Keep false for release builds.
const COACH_MARK_DEBUG_ALWAYS_SHOW = false;

function storageKey(id: CoachMarkId): string {
  return `${SEEN_PREFIX}_${id}_v1`;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function CoachMarkOverlay({
  mark,
  target,
  onDismiss,
}: {
  mark: CoachMarkRequest;
  target: View | null;
  onDismiss: () => void;
}) {
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const [rect, setRect] = useState<TargetRect | null>(null);
  const [bubbleH, setBubbleH] = useState(132);
  const backdropOp = useRef(new Animated.Value(0)).current;
  const bubbleOp = useRef(new Animated.Value(0)).current;
  const arrowNudge = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const measure = () => {
      target?.measureInWindow((x, y, width, height) => {
        if (width > 0 && height > 0) setRect({ x, y, width, height });
      });
    };
    measure();
    const t = setTimeout(measure, 120);
    return () => clearTimeout(t);
  }, [target, mark.id]);

  useEffect(() => {
    if (reduceMotion) {
      backdropOp.setValue(1);
      bubbleOp.setValue(1);
      arrowNudge.setValue(0);
      return;
    }
    backdropOp.setValue(0);
    bubbleOp.setValue(0);
    Animated.parallel([
      Animated.timing(backdropOp, {
        toValue: 1,
        duration: 180,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(bubbleOp, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(arrowNudge, {
          toValue: 1,
          duration: 520,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(arrowNudge, {
          toValue: 0,
          duration: 520,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [arrowNudge, backdropOp, bubbleOp, reduceMotion]);

  const bubbleW = Math.min(330, screenW - EDGE_PAD * 2);
  const targetCenterX = rect ? rect.x + rect.width / 2 : screenW / 2;
  const bubbleLeft = clamp(targetCenterX - bubbleW / 2, EDGE_PAD, screenW - bubbleW - EDGE_PAD);
  const shouldShowAbove =
    rect == null
      ? false
      : mark.placement === "above" ||
        (mark.placement !== "below" && rect.y + rect.height / 2 > screenH * 0.52);
  const bubbleTop = rect
    ? shouldShowAbove
      ? clamp(rect.y - bubbleH - 54, insets.top + 10, screenH - bubbleH - insets.bottom - 14)
      : clamp(rect.y + rect.height + 48, insets.top + 10, screenH - bubbleH - insets.bottom - 14)
    : clamp(screenH - bubbleH - insets.bottom - 34, insets.top + 10, screenH - bubbleH - insets.bottom - 14);

  const arrowTop = rect
    ? shouldShowAbove
      ? Math.min(screenH - insets.bottom - 36, bubbleTop + bubbleH + 7)
      : Math.max(insets.top + 8, bubbleTop - 35)
    : bubbleTop - 35;
  const arrowLeft = clamp(targetCenterX - 14, EDGE_PAD, screenW - EDGE_PAD - 28);
  const arrowTranslate = arrowNudge.interpolate({
    inputRange: [0, 1],
    outputRange: shouldShowAbove ? [0, 7] : [0, -7],
  });

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          {
            opacity: backdropOp,
            backgroundColor: isDark ? "rgba(0,0,0,0.58)" : "rgba(15,23,42,0.34)",
          },
        ]}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss} accessibilityRole="button" accessibilityLabel="Dismiss tip" />
      </Animated.View>

      {rect ? (
        <View
          pointerEvents="none"
          style={[
            styles.targetHalo,
            {
              left: Math.max(EDGE_PAD / 2, rect.x - TARGET_PAD),
              top: Math.max(insets.top / 2, rect.y - TARGET_PAD),
              width: Math.min(screenW - EDGE_PAD, rect.width + TARGET_PAD * 2),
              height: rect.height + TARGET_PAD * 2,
              borderColor: theme.colors.indigo[400],
              backgroundColor: isDark ? "rgba(99,102,241,0.16)" : "rgba(79,70,229,0.12)",
              shadowColor: theme.colors.indigo[500],
            },
          ]}
        />
      ) : null}

      <Animated.View
        pointerEvents="none"
        style={[
          styles.arrow,
          {
            left: arrowLeft,
            top: arrowTop,
            opacity: bubbleOp,
            transform: [{ translateY: reduceMotion ? 0 : arrowTranslate }],
          },
        ]}
      >
        {shouldShowAbove ? (
          <ArrowDown size={28} color={theme.colors.indigo[400]} strokeWidth={2.8} />
        ) : (
          <ArrowUp size={28} color={theme.colors.indigo[400]} strokeWidth={2.8} />
        )}
      </Animated.View>

      <Animated.View
        style={[
          styles.bubble,
          {
            left: bubbleLeft,
            top: bubbleTop,
            width: bubbleW,
            opacity: bubbleOp,
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.indigo[500],
            shadowColor: theme.colors.indigo[500],
          },
        ]}
        onLayout={(e) => setBubbleH(e.nativeEvent.layout.height)}
      >
        <View style={styles.bubbleHead}>
          <Text style={[styles.bubbleTitle, { color: theme.colors.textPrimary }]}>{mark.title}</Text>
          <Pressable
            onPress={onDismiss}
            style={[styles.closeBtn, { backgroundColor: theme.colors.surfaceElevated, borderColor: theme.colors.border }]}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Dismiss tip"
          >
            <X size={15} color={theme.colors.textMuted} />
          </Pressable>
        </View>
        <Text style={[styles.bubbleBody, { color: theme.colors.textSecondary }]}>{mark.body}</Text>
        <Pressable
          onPress={onDismiss}
          style={[
            styles.cta,
            {
              backgroundColor: theme.colors.indigo[600],
              borderColor: theme.colors.indigo[500],
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel={mark.cta ?? "Got it"}
        >
          <Text style={[styles.ctaText, { color: theme.colors.white }]}>{mark.cta ?? "Got it"}</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

export function CoachMarkProvider({ children }: { children: React.ReactNode }) {
  const targetsRef = useRef<Partial<Record<CoachMarkId, View>>>({});
  const activeRef = useRef<CoachMarkRequest | null>(null);
  const pendingRef = useRef<CoachMarkRequest[]>([]);
  const [active, setActive] = useState<CoachMarkRequest | null>(null);

  const showMark = useCallback((mark: CoachMarkRequest) => {
    activeRef.current = mark;
    setActive(mark);
  }, []);

  const showNextQueuedMark = useCallback(() => {
    const next = pendingRef.current.shift();
    if (!next) return;
    if (!targetsRef.current[next.id]) {
      showNextQueuedMark();
      return;
    }
    showMark(next);
  }, [showMark]);

  const registerTarget = useCallback((id: CoachMarkId, node: View) => {
    targetsRef.current[id] = node;
    return () => {
      if (targetsRef.current[id] === node) {
        delete targetsRef.current[id];
      }
    };
  }, []);

  const dismissCoachMark = useCallback((id?: CoachMarkId) => {
    const current = activeRef.current;
    if (!current) return;
    if (id && current.id !== id) return;
    if (!COACH_MARK_DEBUG_ALWAYS_SHOW) {
      void AsyncStorage.setItem(storageKey(current.id), "1").catch(() => {});
    }
    activeRef.current = null;
    setActive(null);
    if (COACH_MARK_DEBUG_ALWAYS_SHOW) {
      setTimeout(showNextQueuedMark, 120);
    }
  }, [showNextQueuedMark]);

  const requestCoachMark = useCallback(async (mark: CoachMarkRequest) => {
    if (activeRef.current) {
      if (
        COACH_MARK_DEBUG_ALWAYS_SHOW &&
        !pendingRef.current.some((pending) => pending.id === mark.id)
      ) {
        pendingRef.current.push(mark);
      }
      return false;
    }
    if (!COACH_MARK_DEBUG_ALWAYS_SHOW) {
      try {
        const seen = await AsyncStorage.getItem(storageKey(mark.id));
        if (seen === "1") return false;
      } catch {
        // Storage is best-effort. If it fails, the hint is still safe to show once in memory.
      }
    }
    if (activeRef.current) return false;
    for (let i = 0; i < 6 && !targetsRef.current[mark.id]; i += 1) {
      await wait(80);
    }
    if (!targetsRef.current[mark.id]) return false;
    showMark(mark);
    return true;
  }, [showMark]);

  const value = useMemo(
    () => ({ registerTarget, requestCoachMark, dismissCoachMark }),
    [dismissCoachMark, registerTarget, requestCoachMark],
  );

  return (
    <CoachMarkContext.Provider value={value}>
      {children}
      <Modal
        transparent
        visible={active !== null}
        animationType="none"
        statusBarTranslucent
        onRequestClose={() => dismissCoachMark()}
      >
        {active ? (
          <CoachMarkOverlay
            mark={active}
            target={targetsRef.current[active.id] ?? null}
            onDismiss={() => dismissCoachMark(active.id)}
          />
        ) : null}
      </Modal>
    </CoachMarkContext.Provider>
  );
}

export function useCoachMarks(): CoachMarkContextValue {
  const v = useContext(CoachMarkContext);
  if (!v) throw new Error("useCoachMarks must be used within CoachMarkProvider");
  return v;
}

export function CoachMarkTarget({
  id,
  children,
  style,
}: {
  id: CoachMarkId;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { registerTarget } = useCoachMarks();
  const cleanupRef = useRef<(() => void) | null>(null);

  const setNode = useCallback(
    (node: View | null) => {
      cleanupRef.current?.();
      cleanupRef.current = null;
      if (node) cleanupRef.current = registerTarget(id, node);
    },
    [id, registerTarget],
  );

  useEffect(() => {
    return () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, []);

  return (
    <View ref={setNode} collapsable={false} style={style}>
      {children}
    </View>
  );
}

export function useCoachMark(
  id: CoachMarkId,
  content: Omit<CoachMarkRequest, "id">,
  enabled: boolean,
  delayMs = 650,
) {
  const { requestCoachMark } = useCoachMarks();

  useEffect(() => {
    if (!COACH_MARK_DEBUG_ALWAYS_SHOW && !enabled) return;
    const t = setTimeout(() => {
      void requestCoachMark({ id, ...content });
    }, delayMs);
    return () => clearTimeout(t);
  }, [content.body, content.cta, content.placement, content.title, delayMs, enabled, id, requestCoachMark]);
}

const styles = StyleSheet.create({
  targetHalo: {
    position: "absolute",
    borderWidth: 2,
    borderRadius: 18,
    shadowOpacity: 0.32,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  arrow: {
    position: "absolute",
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  bubble: {
    position: "absolute",
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    shadowOpacity: 0.28,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  bubbleHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  bubbleTitle: { flex: 1, fontSize: 16, fontWeight: "900", lineHeight: 21 },
  bubbleBody: { marginTop: 7, fontSize: 13, lineHeight: 18, fontWeight: "600" },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  cta: {
    marginTop: 12,
    alignSelf: "flex-start",
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaText: { fontSize: 13, fontWeight: "900" },
});
