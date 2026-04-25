import { Text } from "./AppText";
import {
  Fragment } from "react";
import { StyleSheet,
  View,
} from "react-native";
import { useTheme } from "../context/ThemeContext";
import { AnimatedFire } from "./AnimatedFire";
import { FireLottie } from "./FireLottie";
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
  label: string;
  display: string;
  phase: ProgressivePhase;
  tone: MiniMissionFlightTone;
};

export function MiniMissionFlightCountdown({
  label,
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
  const iconBg =
    tone === "danger"
      ? "rgba(239, 68, 68, 0.12)"
      : tone === "muted"
        ? theme.colors.surfaceElevated
        : "rgba(245, 158, 11, 0.15)";
  const iconBorder =
    tone === "danger"
      ? "rgba(239, 68, 68, 0.35)"
      : tone === "muted"
        ? theme.colors.border
        : "rgba(245, 158, 11, 0.4)";
  const fireColor =
    tone === "danger"
      ? theme.colors.red[500]
      : tone === "muted"
        ? theme.colors.slate[500]
        : theme.colors.amber[500];

  const fireLottieUri =
    tone === "danger"
      ? "https://fonts.gstatic.com/s/e/notoemoji/latest/1f9e8/lottie.json" // firecracker-esque
      : "https://fonts.gstatic.com/s/e/notoemoji/latest/1f525/lottie.json";

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
      <View
        style={[
          styles.iconContainer,
          {
            backgroundColor: iconBg,
            borderColor: iconBorder,
          },
        ]}
      >
        {tone === "muted" ? (
          <AnimatedFire size={32} color={fireColor} />
        ) : (
          <FireLottie source={{ uri: fireLottieUri }} size={56} />
        )}
      </View>
      <View style={styles.contentContainer}>
        <Text style={[styles.label, { color: theme.colors.textSecondary }]}>
          {label}
        </Text>
        <SplitFlapTimeDisplay
          display={safeDisplay}
          phase={phase}
          timeColor={timeColor}
          digitTextShadow={digitTextShadow}
        />
        <View style={styles.legendContainer}>
          {LEGEND_BY_PHASE[phase].map((legendLabel, i) => (
            <Fragment key={`${phase}-${legendLabel}-${i}`}>
              {i > 0 ? <View style={styles.legendGap} /> : null}
              <View style={styles.legendCol}>
                <Text
                  style={[
                    styles.legendText,
                    { color: theme.colors.textMuted },
                  ]}
                >
                  {legendLabel}
                </Text>
              </View>
            </Fragment>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
  },
  iconContainer: {
    marginRight: 20,
    padding: 10,
    borderRadius: 18,
    borderWidth: 1,
  },
  contentContainer: {
    flex: 1,
    minWidth: 0,
  },
  label: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.5,
    marginBottom: 4,
    textTransform: "uppercase",
  },
  legendContainer: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    marginTop: 6,
    alignSelf: "stretch",
    minWidth: 0,
  },
  legendGap: {
    width: 11,
    flexShrink: 0,
  },
  legendCol: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
  },
  legendText: {
    fontSize: 10,
    fontWeight: "700",
    textAlign: "center",
  },
});
