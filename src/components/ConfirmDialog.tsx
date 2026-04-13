import { Modal, View, Text, Pressable, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../context/ThemeContext";
import { Button } from "./Button";

export type ConfirmDialogAction = {
  label: string;
  onPress: () => void;
  /** Default `primary`. Use `secondary` for Cancel-style, `danger` for destructive. */
  variant?: "primary" | "secondary" | "danger";
};

export type ConfirmDialogProps = {
  visible: boolean;
  /** Called when the backdrop is pressed (if `dismissOnBackdrop` is true) and should hide the dialog. */
  onRequestClose: () => void;
  title: string;
  message?: string;
  /** Buttons in display order (top → bottom). Typically Cancel first, then confirm. */
  actions: ConfirmDialogAction[];
  /** Backdrop tap calls `onRequestClose`. Default true. */
  dismissOnBackdrop?: boolean;
};

/**
 * Themed confirm / alert replacement. Uses `ThemeContext` for light and dark palettes.
 */
export function ConfirmDialog({
  visible,
  onRequestClose,
  title,
  message,
  actions,
  dismissOnBackdrop = true,
}: ConfirmDialogProps) {
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onRequestClose}
      statusBarTranslucent
      accessibilityViewIsModal
    >
      <View style={styles.root}>
        <Pressable
          style={[styles.backdrop, { backgroundColor: isDark ? "rgba(0,0,0,0.55)" : "rgba(15,23,42,0.45)" }]}
          onPress={dismissOnBackdrop ? onRequestClose : undefined}
          accessibilityRole={dismissOnBackdrop ? "button" : undefined}
          accessibilityLabel="Dismiss"
        />
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
              borderRadius: theme.radius.lg,
              ...theme.shadow.card,
              marginBottom: Math.max(insets.bottom, 16),
            },
          ]}
          accessibilityRole="none"
        >
          <Text
            style={[
              styles.title,
              { color: theme.colors.textPrimary, fontSize: theme.typography.h3 },
            ]}
          >
            {title}
          </Text>
          {message ? (
            <Text
              style={[
                styles.message,
                {
                  color: theme.colors.textSecondary,
                  fontSize: theme.typography.body,
                },
              ]}
            >
              {message}
            </Text>
          ) : null}

          <View style={styles.actions}>
            {actions.map((a, i) => (
              <Button
                key={`${a.label}-${i}`}
                title={a.label}
                variant={a.variant ?? "primary"}
                onPress={a.onPress}
              />
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    width: "100%",
    maxWidth: 400,
    borderWidth: 1,
    padding: 20,
    zIndex: 1,
  },
  title: {
    fontWeight: "800",
    letterSpacing: -0.3,
    marginBottom: 10,
  },
  message: {
    lineHeight: 22,
    marginBottom: 18,
    fontWeight: "500",
  },
  actions: {
    gap: 10,
  },
});
