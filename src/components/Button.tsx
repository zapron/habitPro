import { TouchableOpacity, Text, TouchableOpacityProps, StyleSheet, ViewStyle, TextStyle } from "react-native";
import { useTheme } from "../context/ThemeContext";

interface ButtonProps extends TouchableOpacityProps {
    title: string;
    variant?: "primary" | "secondary" | "danger";
    style?: ViewStyle;
    textStyle?: TextStyle;
}

export function Button({
    title,
    variant = "primary",
    style,
    textStyle,
    ...props
}: ButtonProps) {
    const { theme } = useTheme();

    const variantButton: ViewStyle =
        variant === "secondary"
            ? { backgroundColor: theme.colors.surfaceElevated, borderWidth: 1, borderColor: theme.colors.border }
            : variant === "danger"
                ? { backgroundColor: theme.colors.red[500] }
                : { backgroundColor: theme.colors.indigo[600], borderWidth: 1, borderColor: theme.colors.indigo[500] };

    const variantText: TextStyle =
        variant === "secondary"
            ? { color: theme.colors.slate[200] }
            : { color: theme.colors.white };

    return (
        <TouchableOpacity
            style={[
                styles.baseButton,
                { borderRadius: theme.radius.md, ...theme.shadow.card },
                variantButton,
                style,
            ]}
            activeOpacity={0.8}
            {...props}
        >
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
    },
    baseText: {
        fontWeight: "700",
        letterSpacing: 0.3,
        textAlign: "center",
    },
});
