import { Animated,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { ArrowDown, ArrowUp } from "lucide-react-native";
import { useTheme } from "../context/ThemeContext";
import {
  SplitFlapTimeDisplay,
  type ProgressivePhase,
} from "./SplitFlapTimeDisplay";

const LEGEND_BY_PHASE: Record<ProgressivePhase, readonly string[]> = {
  ss: ["SEC"],
  mmss: ["MIN", "SEC"],
  hhmmss: ["HRS", "MIN", "SEC"],
  ddhhmmss: ["DAYS", "HRS", "MIN", "SEC"],
};

function fallbackDisplay(phase: ProgressivePhase): string {
  switch (phase) {
    case "ss":
      return "00";
    case "mmss":
      return "00:00";
    case "hhmmss":
      return "00:00:00";
    case "ddhhmmss":
    default:
      return "00:00:00:00";
  }
}

export type MiniMissionFlightTone = "countdown" | "danger" | "muted";

type MiniMissionFlightCountdownProps = {
  display: string;
  phase: ProgressivePhase;
  tone: MiniMissionFlightTone;
  /** Tap the digits to flip between remaining and elapsed — same cross-fade
   * + corner-arrow convention as the habit screen's `Timer`. Omit to leave
   * this non-interactive (no arrow, not tappable), e.g. once the timer's
   * already up. */
  onToggle?: () => void;
  /** Which of the two the caller is currently showing — drives the corner
   * arrow's direction (down = remaining, up = elapsed), same as `Timer`. */
  showingRemaining?: boolean;
  /** Drives the 110ms-out/110ms-in cross-fade on toggle; the caller owns it
   * since it also has to coordinate the actual display swap mid-fade. */
  fadeAnim?: Animated.Value;
};

export function MiniMissionFlightCountdown({
  display,
  phase,
  tone,
  onToggle,
  showingRemaining,
  fadeAnim,
}: MiniMissionFlightCountdownProps) {
  const { theme } = useTheme();
  const safeDisplay = display || fallbackDisplay(phase);

  const borderColor =
    tone === "danger"
      ? "rgba(239, 68, 68, 0.5)"
      : tone === "muted"
        ? theme.colors.border
        : "rgba(245, 158, 11, 0.35)";
  const bgColor =
    tone === "danger"
      ? "rgba(239, 68, 68, 0.08)"
      : tone === "muted"
        ? theme.colors.surface
        : theme.colors.surface;

  const timeColor =
    tone === "danger" ? theme.colors.red[500] : theme.colors.textPrimary;

  const digitTextShadow =
    tone === "danger"
      ? {
          textShadowColor: "rgba(239, 68, 68, 0.45)",
          textShadowOffset: { width: 0, height: 1 },
          textShadowRadius: 6,
        }
      : tone === "muted"
        ? undefined
        : {
            textShadowColor: "rgba(34, 197, 94, 0.45)",
            textShadowOffset: { width: 0, height: 1 },
            textShadowRadius: 6,
          };

  const canToggle = Boolean(onToggle);

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: bgColor,
          borderColor,
          borderRadius: theme.radius.lg,
          ...theme.shadow.card,
        },
      ]}
    >
      {canToggle ? (
        <View style={styles.cornerArrow} pointerEvents="none">
          {showingRemaining ? (
            <ArrowDown size={13} color={theme.colors.textMuted} strokeWidth={2.4} />
          ) : (
            <ArrowUp size={13} color={theme.colors.textMuted} strokeWidth={2.4} />
          )}
        </View>
      ) : null}
      <TouchableOpacity
        onPress={canToggle ? onToggle : undefined}
        disabled={!canToggle}
        activeOpacity={0.7}
        accessibilityRole={canToggle ? "button" : undefined}
        accessibilityLabel={
          canToggle ? (showingRemaining ? "Show time elapsed" : "Show time left") : undefined
        }
        style={styles.contentContainer}
      >
        <Animated.View style={fadeAnim ? { opacity: fadeAnim } : undefined}>
          <SplitFlapTimeDisplay
            display={safeDisplay}
            phase={phase}
            timeColor={timeColor}
            size="large"
            unitLabels={LEGEND_BY_PHASE[phase]}
            unitColor={theme.colors.textMuted}
            digitTextShadow={digitTextShadow}
          />
        </Animated.View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 16,
    borderWidth: 1,
  },
  contentContainer: {
    width: "100%",
    minWidth: 0,
  },
  cornerArrow: {
    position: "absolute",
    top: 8,
    right: 8,
    opacity: 0.55,
  },
});
