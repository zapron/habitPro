import { Text } from "./AppText";
import { Pressable, StyleSheet, View } from "react-native";
import { Check, Circle, XCircle } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../context/ThemeContext";
import { withAlpha } from "../styles/theme";

export type OperationProgressStep = {
  label: string;
  description?: string;
};

export type OperationProgressDialogProps = {
  visible: boolean;
  title: string;
  message?: string;
  steps: OperationProgressStep[];
  activeStep: number;
  error?: string | null;
};

export function OperationProgressDialog({
  visible,
  title,
  message,
  steps,
  activeStep,
  error,
}: OperationProgressDialogProps) {
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  if (!visible) return null;

  return (
    <View
      accessibilityViewIsModal
      pointerEvents="auto"
      style={[
        styles.root,
        {
          paddingTop: Math.max(insets.top, 16),
          paddingBottom: Math.max(insets.bottom, 16),
        },
      ]}
    >
      <Pressable
        pointerEvents="none"
        style={[
          styles.backdrop,
          { backgroundColor: isDark ? withAlpha(theme.colors.scrim, 62) : withAlpha(theme.colors.scrim, 42) },
        ]}
      />
      <View
        style={[
          styles.sheet,
          {
            backgroundColor: theme.colors.surface,
            borderColor: error ? theme.colors.red[500] : theme.colors.border,
            borderRadius: theme.radius.lg,
            ...theme.shadow.card,
          },
        ]}
      >
        <Text style={[styles.kicker, { color: error ? theme.colors.red[500] : theme.colors.cyan[400] }]}>
          {error ? "Needs attention" : "Working on it"}
        </Text>
        <Text style={[styles.title, { color: theme.colors.textPrimary, fontSize: theme.typography.h3 }]}>
          {title}
        </Text>
        {message ? (
          <Text style={[styles.message, { color: theme.colors.textSecondary, fontSize: theme.typography.body }]}>
            {message}
          </Text>
        ) : null}

        <View style={styles.steps}>
          {steps.map((step, index) => {
            const complete = !error && index < activeStep;
            const active = !error && index === activeStep;
            const failed = Boolean(error && index === activeStep);
            const iconBg = complete
              ? theme.colors.green[500]
              : failed
                ? theme.colors.red[500]
                : active
                  ? theme.colors.indigo[600]
                  : isDark ? withAlpha(theme.colors.textSecondary, 12) : withAlpha(theme.colors.textSecondary, 16);
            const iconColor =
              complete || failed || active ? theme.colors.white : theme.colors.textMuted;
            return (
              <View key={`${step.label}-${index}`} style={styles.stepRow}>
                <View style={[styles.stepIcon, { backgroundColor: iconBg }]}>
                  {complete ? (
                    <Check size={15} color={iconColor} strokeWidth={3} />
                  ) : failed ? (
                    <XCircle size={15} color={iconColor} strokeWidth={2.6} />
                  ) : (
                    <Circle size={active ? 10 : 8} color={iconColor} fill={active ? iconColor : "transparent"} />
                  )}
                </View>
                <View style={styles.stepCopy}>
                  <Text
                    style={[
                      styles.stepLabel,
                      {
                        color: active || complete ? theme.colors.textPrimary : theme.colors.textMuted,
                      },
                    ]}
                  >
                    {step.label}
                  </Text>
                  {step.description ? (
                    <Text style={[styles.stepDescription, { color: theme.colors.textMuted }]}>
                      {step.description}
                    </Text>
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>

        {error ? <Text style={[styles.error, { color: theme.colors.red[500] }]}>{error}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 22,
    zIndex: 9999,
    elevation: 9999,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    width: "100%",
    maxWidth: 420,
    borderWidth: 1,
    padding: 20,
    zIndex: 1,
  },
  kicker: {
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  title: {
    fontWeight: "900",
    letterSpacing: 0,
  },
  message: {
    marginTop: 8,
    lineHeight: 22,
    fontWeight: "600",
  },
  steps: {
    gap: 14,
    marginTop: 20,
  },
  stepRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  stepIcon: {
    width: 28,
    height: 28,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  stepCopy: {
    flex: 1,
  },
  stepLabel: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "800",
  },
  stepDescription: {
    marginTop: 2,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "600",
  },
  error: {
    marginTop: 18,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "800",
  },
});
