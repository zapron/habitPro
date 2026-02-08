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
        paddingVertical: 12,
        paddingHorizontal: 24,
        borderRadius: 12,
        flexDirection: "row",
        justifyContent: "center",
        alignItems: "center",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        elevation: 2,
    },
    primaryButton: {
        backgroundColor: theme.colors.indigo[600],
    },
    secondaryButton: {
        backgroundColor: theme.colors.slate[700],
        borderWidth: 1,
        borderColor: theme.colors.slate[600],
    },
    dangerButton: {
        backgroundColor: theme.colors.red[500],
    },
    baseText: {
        fontSize: 18,
        fontWeight: "600",
        textAlign: "center",
    },
    primaryText: {
        color: theme.colors.white,
    },
    secondaryText: {
        color: theme.colors.slate[200],
    },
});
