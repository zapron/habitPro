import { Text } from "../components/AppText";
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
import { Platform, StyleSheet, View } from "react-native";
import { useTheme } from "./ThemeContext";
import { useToastBottomPadding } from "../hooks/useToastBottomPadding";

export type ToastVariant = "success" | "error" | "info";

type ToastPayload = { message: string; variant: ToastVariant };

export type ToastContextValue = {
  showToast: (message: string, variant?: ToastVariant, durationMs?: number) => void;
};

type ToastInternalContextValue = ToastContextValue & {
  payload: ToastPayload | null;
};

const ToastContext = createContext<ToastInternalContextValue | null>(null);

const DEFAULT_MS = 2800;
const LONG_MS = 4200;

function ToastBanner({
  payload,
  paddingBottom,
}: {
  payload: ToastPayload;
  paddingBottom: number;
}) {
  const { theme, isDark } = useTheme();

  const slab = isDark ? theme.colors.surfaceElevated : "rgba(33, 33, 33, 0.92)";

  const accent =
    payload.variant === "success"
      ? theme.colors.green[500]
      : payload.variant === "error"
        ? theme.colors.red[500]
        : theme.colors.indigo[400];

  const textColor = isDark
    ? theme.colors.textPrimary
    : payload.variant === "success"
      ? "#bbf7d0"
      : payload.variant === "error"
        ? "#fecaca"
        : "#fafafa";

  return (
    <View
      pointerEvents="none"
      style={[
        styles.wrap,
        {
          paddingBottom,
          paddingHorizontal: theme.spacing.md,
        },
      ]}
    >
      <Text
        style={[
          styles.text,
          {
            color: textColor,
            backgroundColor: slab,
            borderColor: isDark ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.12)",
            borderLeftColor: accent,
            borderLeftWidth: 3,
            ...(Platform.OS === "android"
              ? { elevation: 6 }
              : {
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.22,
                  shadowRadius: 4,
                }),
          },
        ]}
      >
        {payload.message}
      </Text>
    </View>
  );
}

/**
 * Renders the active toast pill. Must live under the Expo Router so
 * {@link useToastBottomPadding} can detect (tabs) vs full-screen routes.
 */
export function ToastHost() {
  const ctx = useContext(ToastContext);
  const paddingBottom = useToastBottomPadding();
  if (!ctx?.payload) return null;
  return <ToastBanner payload={ctx.payload} paddingBottom={paddingBottom} />;
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

  const value = useMemo(
    () => ({ showToast, payload } satisfies ToastInternalContextValue),
    [showToast, payload],
  );

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return { showToast: ctx.showToast };
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9998,
    alignItems: "center",
  },
  text: {
    maxWidth: "92%",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
    overflow: "hidden",
  },
});
