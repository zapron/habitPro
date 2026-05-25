import { Text } from "./AppText";
import {
  ActivityIndicator,
  TouchableOpacity,
  TouchableOpacityProps,
  StyleSheet,
  StyleProp,
  ViewStyle,
  TextStyle,
} from "react-native";
import type { ReactNode } from "react";
import { useTheme } from "../context/ThemeContext";

interface ButtonProps extends TouchableOpacityProps {
    title: string;
    variant?: "primary" | "secondary" | "subtle" | "danger";
    icon?: ReactNode;
    loading?: boolean;
    style?: StyleProp<ViewStyle>;
    textStyle?: StyleProp<TextStyle>;
}

export function Button({
    title,
    variant = "primary",
    icon,
    loading = false,
    style,
    textStyle,
    disabled,
    ...props
}: ButtonProps) {
    const { theme } = useTheme();
    const inactive = disabled || loading;

    const variantButton: ViewStyle =
        variant === "secondary"
            ? { backgroundColor: theme.colors.surfaceElevated, borderWidth: 1, borderColor: theme.colors.border }
            : variant === "subtle"
                ? { backgroundColor: theme.colors.surfaceElevated, borderWidth: 1, borderColor: theme.colors.border }
            : variant === "danger"
                ? { backgroundColor: theme.colors.red[500] }
                : { backgroundColor: theme.colors.indigo[600], borderWidth: 1, borderColor: theme.colors.indigo[500] };

    const variantText: TextStyle =
        variant === "secondary" || variant === "subtle"
            ? { color: theme.colors.textPrimary }
            : { color: theme.colors.white };
    const spinnerColor =
        variant === "danger"
            ? theme.colors.white
            : variant === "primary"
                ? theme.colors.white
                : theme.colors.indigo[400];
    const buttonShadow = variant === "subtle" ? {} : theme.shadow.card;

    return (
        <TouchableOpacity
            style={[
                styles.baseButton,
                { borderRadius: theme.radius.md, ...buttonShadow },
                variantButton,
                inactive && styles.disabled,
                style,
            ]}
            activeOpacity={0.68}
            delayPressIn={0}
            delayPressOut={0}
            disabled={inactive}
            {...props}
        >
            {loading ? (
                <ActivityIndicator size="small" color={spinnerColor} style={styles.leading} />
            ) : icon ? (
                <>{icon}</>
            ) : null}
            <Text style={[styles.baseText, { fontSize: theme.typography.body }, variantText, textStyle]}>
                {title}
            </Text>
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    baseButton: {
        minHeight: 52,
        paddingVertical: 12,
        paddingHorizontal: 20,
        flexDirection: "row",
        justifyContent: "center",
        alignItems: "center",
        gap: 8,
    },
    baseText: {
        fontWeight: "700",
        letterSpacing: 0.3,
        textAlign: "center",
    },
    leading: { marginRight: 0 },
    disabled: { opacity: 0.62 },
});
