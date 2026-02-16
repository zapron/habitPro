import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { darkTheme, lightTheme, type AppTheme } from '../styles/theme';

export type ThemePreference = 'system' | 'light' | 'dark';

const STORAGE_KEY = '@habitpro_theme';

interface ThemeContextValue {
    theme: AppTheme;
    isDark: boolean;
    preference: ThemePreference;
    setPreference: (pref: ThemePreference) => void;
    cycleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
    theme: darkTheme,
    isDark: true,
    preference: 'system',
    setPreference: () => { },
    cycleTheme: () => { },
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const systemScheme = useColorScheme();
    const [preference, setPreferenceState] = useState<ThemePreference>('system');
    const [loaded, setLoaded] = useState(false);

    // Load saved preference on mount
    useEffect(() => {
        AsyncStorage.getItem(STORAGE_KEY).then((saved) => {
            if (saved === 'light' || saved === 'dark' || saved === 'system') {
                setPreferenceState(saved);
            }
            setLoaded(true);
        }).catch(() => setLoaded(true));
    }, []);

    const setPreference = useCallback((pref: ThemePreference) => {
        setPreferenceState(pref);
        AsyncStorage.setItem(STORAGE_KEY, pref).catch(() => { });
    }, []);

    const cycleTheme = useCallback(() => {
        setPreference(
            preference === 'system' ? 'light' : preference === 'light' ? 'dark' : 'system',
        );
    }, [preference, setPreference]);

    const isDark = useMemo(() => {
        if (preference === 'light') return false;
        if (preference === 'dark') return true;
        return systemScheme !== 'light'; // default to dark if null
    }, [preference, systemScheme]);

    const value = useMemo<ThemeContextValue>(
        () => ({
            theme: isDark ? darkTheme : lightTheme,
            isDark,
            preference,
            setPreference,
            cycleTheme,
        }),
        [isDark, preference, setPreference, cycleTheme],
    );

    // Don't render until preference is loaded to avoid flash
    if (!loaded) return null;

    return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Hook to get the current theme anywhere in the tree. */
export function useTheme(): ThemeContextValue {
    return useContext(ThemeContext);
}
