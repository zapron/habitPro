import { TouchableOpacity, Text, TouchableOpacityProps, StyleSheet, ViewStyle, TextStyle } from "react-native";
import { theme } from "../styles/theme";

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
    const getButtonStyle = (): ViewStyle => {
        switch (variant) {
            case "secondary":
                return styles.secondaryButton;
            case "danger":
                return styles.dangerButton;
            default:
                return styles.primaryButton;
        }
    };

    const getTextStyle = (): TextStyle => {
        switch (variant) {
            case "secondary":
                return styles.secondaryText;
            default:
                return styles.primaryText; // Primary and Danger use white text
        }
    };

    return (
        <TouchableOpacity
            style={[styles.baseButton, getButtonStyle(), style]}
            activeOpacity={0.8}
            {...props}
        >
            <Text style={[styles.baseText, getTextStyle(), textStyle]}>
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
        borderRadius: theme.radius.md,
        flexDirection: "row",
        justifyContent: "center",
        alignItems: "center",
        ...theme.shadow.card,
    },
    primaryButton: {
        backgroundColor: theme.colors.indigo[600],
        borderWidth: 1,
        borderColor: theme.colors.indigo[500],
    },
    secondaryButton: {
        backgroundColor: theme.colors.surfaceElevated,
        borderWidth: 1,
        borderColor: theme.colors.border,
    },
    dangerButton: {
        backgroundColor: theme.colors.red[500],
    },
    baseText: {
        fontSize: theme.typography.body,
        fontWeight: "700",
        letterSpacing: 0.3,
        textAlign: "center",
    },
    primaryText: {
        color: theme.colors.white,
    },
    secondaryText: {
        color: theme.colors.slate[200],
    },
});
