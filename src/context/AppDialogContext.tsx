import { Text } from "../components/AppText";
import { Button } from "../components/Button";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Alert as NativeAlert, Modal, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "./ThemeContext";
import { withAlpha } from "../styles/theme";

export type AppDialogButton = {
  text: string;
  onPress?: () => void;
  /** "neutral" renders the same quiet bordered look as "cancel", for dialogs where
   * every option should read as equal-weight choices rather than one primary CTA
   * (e.g. an "add a photo" source picker). */
  style?: "default" | "cancel" | "destructive" | "neutral";
  /** Optional leading icon — lets a dialog distinguish otherwise-identical neutral buttons without color. */
  icon?: ReactNode;
};

export type AppDialogOptions = {
  cancelable?: boolean;
  onDismiss?: () => void;
};

type DialogState = {
  title: string;
  message?: string;
  buttons: AppDialogButton[];
  options?: AppDialogOptions;
};

type AppDialogContextValue = {
  showAlert: (
    title: string,
    message?: string,
    buttons?: AppDialogButton[],
    options?: AppDialogOptions,
  ) => void;
};

const AppDialogContext = createContext<AppDialogContextValue | null>(null);
let globalShowAlert: AppDialogContextValue["showAlert"] | null = null;

function normalizeButtons(buttons?: AppDialogButton[]): AppDialogButton[] {
  if (!buttons || buttons.length === 0) return [{ text: "OK", style: "default" }];
  return buttons;
}

export function AppDialogProvider({ children }: { children: ReactNode }) {
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const dialogRef = useRef<DialogState | null>(null);

  useEffect(() => {
    dialogRef.current = dialog;
  }, [dialog]);

  const close = useCallback(() => {
    dialogRef.current = null;
    setDialog(null);
  }, []);

  const dismiss = useCallback(() => {
    const onDismiss = dialogRef.current?.options?.onDismiss;
    dialogRef.current = null;
    setDialog(null);
    onDismiss?.();
  }, []);

  const showAlert = useCallback<AppDialogContextValue["showAlert"]>(
    (title, message, buttons, options) => {
      dialogRef.current?.options?.onDismiss?.();
      const next = { title, message, buttons: normalizeButtons(buttons), options };
      dialogRef.current = next;
      setDialog(next);
    },
    [],
  );

  const value = useMemo(() => ({ showAlert } satisfies AppDialogContextValue), [showAlert]);
  globalShowAlert = showAlert;

  const canDismiss = dialog?.options?.cancelable !== false;

  return (
    <AppDialogContext.Provider value={value}>
      {children}
      <Modal
        visible={dialog !== null}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={canDismiss ? dismiss : undefined}
      >
        {dialog ? (
          <View
            style={[
              styles.root,
              {
                paddingBottom: Math.max(insets.bottom, 18),
                paddingTop: Math.max(insets.top, 18),
              },
            ]}
          >
            <Pressable
              style={[
                styles.backdrop,
                { backgroundColor: isDark ? withAlpha(theme.colors.scrim, 62) : withAlpha(theme.colors.scrim, 38) },
              ]}
              onPress={canDismiss ? dismiss : undefined}
              accessibilityRole={canDismiss ? "button" : undefined}
              accessibilityLabel="Dismiss dialog"
            />
            <View
              style={[
                styles.sheet,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.border,
                  borderRadius: theme.radius.lg,
                  ...theme.shadow.card,
                },
              ]}
            >
              <Text
                style={[
                  styles.title,
                  { color: theme.colors.textPrimary, fontSize: theme.typography.h3 },
                ]}
              >
                {dialog.title}
              </Text>
              {dialog.message ? (
                <Text
                  style={[
                    styles.message,
                    { color: theme.colors.textSecondary, fontSize: theme.typography.body },
                  ]}
                >
                  {dialog.message}
                </Text>
              ) : null}
              <View style={styles.actions}>
                {dialog.buttons.map((button, index) => {
                  const variant =
                    button.style === "destructive"
                      ? "danger"
                      : button.style === "cancel" || button.style === "neutral"
                        ? "secondary"
                        : "primary";
                  return (
                    <Button
                      key={`${button.text}-${index}`}
                      title={button.text}
                      variant={variant}
                      icon={button.icon}
                      onPress={() => {
                        close();
                        button.onPress?.();
                      }}
                    />
                  );
                })}
              </View>
            </View>
          </View>
        ) : null}
      </Modal>
    </AppDialogContext.Provider>
  );
}

export function showAppAlert(
  title: string,
  message?: string,
  buttons?: AppDialogButton[],
  options?: AppDialogOptions,
) {
  if (globalShowAlert) {
    globalShowAlert(title, message, buttons, options);
    return;
  }
  // Native Alert has no "neutral" style (or icon) — this fallback only fires
  // before the provider mounts, so it just needs to not crash, not match pixel-for-pixel.
  const nativeButtons = buttons?.map((button) => ({
    text: button.text,
    onPress: button.onPress,
    style: button.style === "neutral" ? ("default" as const) : button.style,
  }));
  NativeAlert.alert(title, message, nativeButtons, options);
}

export function useAppDialog(): AppDialogContextValue {
  const ctx = useContext(AppDialogContext);
  if (!ctx) throw new Error("useAppDialog must be used within AppDialogProvider");
  return ctx;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 16,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    width: "100%",
    maxWidth: 420,
    borderWidth: 1,
    padding: 22,
    zIndex: 1,
  },
  title: {
    fontWeight: "900",
    marginBottom: 12,
  },
  message: {
    lineHeight: 24,
    marginBottom: 24,
    fontWeight: "500",
  },
  actions: {
    gap: 12,
  },
});
