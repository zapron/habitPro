import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "./ThemeContext";

export type ToastVariant = "success" | "error" | "info";

type ToastPayload = { message: string; variant: ToastVariant };

type ToastContextValue = {
  showToast: (message: string, variant?: ToastVariant, durationMs?: number) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const DEFAULT_MS = 2800;
const LONG_MS = 4200;

function ToastBanner({ payload }: { payload: ToastPayload }) {
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  const bg =
    payload.variant === "success"
      ? isDark
        ? "rgba(34, 197, 94, 0.2)"
        : "rgba(34, 197, 94, 0.14)"
      : payload.variant === "error"
        ? isDark
          ? "rgba(239, 68, 68, 0.18)"
          : "rgba(239, 68, 68, 0.12)"
        : theme.colors.surfaceElevated;

  const border =
    payload.variant === "success"
      ? "rgba(34, 197, 94, 0.45)"
      : payload.variant === "error"
        ? "rgba(239, 68, 68, 0.45)"
        : theme.colors.border;

  const textColor =
    payload.variant === "success"
      ? theme.colors.green[500]
      : payload.variant === "error"
        ? theme.colors.red[500]
        : theme.colors.textPrimary;

  return (
    <View
      pointerEvents="none"
      style={[
        styles.wrap,
        {
          paddingBottom: Math.max(insets.bottom, 12),
          paddingHorizontal: theme.spacing.md,
        },
      ]}
    >
      <Text
        style={[
          styles.text,
          {
            color: textColor,
            backgroundColor: bg,
            borderColor: border,
            borderRadius: theme.radius.md,
          },
        ]}
      >
        {payload.message}
      </Text>
    </View>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [payload, setPayload] = useState<ToastPayload | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback(
    (message: string, variant: ToastVariant = "info", durationMs?: number) => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      const ms = durationMs ?? (message.length > 90 ? LONG_MS : DEFAULT_MS);
      setPayload({ message, variant });
      hideTimer.current = setTimeout(() => {
        setPayload(null);
        hideTimer.current = null;
      }, ms);
    },
    [],
  );

  useEffect(
    () => () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    },
    [],
  );

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {payload ? <ToastBanner payload={payload} /> : null}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return ctx;
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9998,
  },
  text: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    fontSize: 13,
    fontWeight: "600",
    overflow: "hidden",
  },
});
