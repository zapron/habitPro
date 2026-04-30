import { StyleSheet,
  View,
} from "react-native";
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
};

export function MiniMissionFlightCountdown({
  display,
  phase,
  tone,
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
            textShadowColor: "rgba(99, 102, 241, 0.45)",
            textShadowOffset: { width: 0, height: 1 },
            textShadowRadius: 6,
          };

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
      <View style={styles.contentContainer}>
        <SplitFlapTimeDisplay
          display={safeDisplay}
          phase={phase}
          timeColor={timeColor}
          size="large"
          unitLabels={LEGEND_BY_PHASE[phase]}
          unitColor={theme.colors.textMuted}
          digitTextShadow={digitTextShadow}
        />
      </View>
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
});
