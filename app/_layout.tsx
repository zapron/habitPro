
import { useEffect } from "react";
import { Stack } from "expo-router";
import { ThemeProvider } from "../src/context/ThemeContext";
import { setupNotifications } from "../src/utils/notifications";

export default function Layout() {
    useEffect(() => {
        setupNotifications();
    }, []);

    return (
        <ThemeProvider>
            <Stack screenOptions={{ headerShown: false }} />
        </ThemeProvider>
    );
}
