
import { Stack } from "expo-router";
import { ThemeProvider } from "../src/context/ThemeContext";

export default function Layout() {
    return (
        <ThemeProvider>
            <Stack screenOptions={{ headerShown: false }} />
        </ThemeProvider>
    );
}
