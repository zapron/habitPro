import { useRef } from "react";
import { Text } from "./AppText";
import {
    ActivityIndicator,
    Animated,
    Pressable,
    PressableProps,
    StyleSheet,
    StyleProp,
    ViewStyle,
    TextStyle,
    GestureResponderEvent,
} from "react-native";
import type { ReactNode } from "react";
import { useTheme } from "../context/ThemeContext";
import { triggerTapHaptic, triggerWarningHaptic } from "../utils/hapticFeedback";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface ButtonProps extends Omit<PressableProps, "style"> {
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
    onPressIn,
    onPressOut,
    onPress,
    ...props
}: ButtonProps) {
    const { theme } = useTheme();
    const inactive = disabled || loading;
    const scale = useRef(new Animated.Value(1)).current;

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

    const handlePressIn = (e: GestureResponderEvent) => {
        if (!inactive) {
            Animated.spring(scale, {
                toValue: 0.96,
                useNativeDriver: true,
                speed: 40,
                bounciness: 6,
            }).start();
        }
        onPressIn?.(e);
    };

    const handlePressOut = (e: GestureResponderEvent) => {
        Animated.spring(scale, {
            toValue: 1,
            useNativeDriver: true,
            speed: 24,
            bounciness: 8,
        }).start();
        onPressOut?.(e);
    };

    const handlePress = (e: GestureResponderEvent) => {
        if (!inactive) {
            if (variant === "danger") {
                triggerWarningHaptic();
            } else {
                triggerTapHaptic();
            }
        }
        onPress?.(e);
    };

    return (
        <AnimatedPressable
            style={[
                styles.baseButton,
                { borderRadius: theme.radius.md, ...buttonShadow, transform: [{ scale }] },
                variantButton,
                inactive && styles.disabled,
                style,
            ]}
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            onPress={handlePress}
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
        </AnimatedPressable>
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
