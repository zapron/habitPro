import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
    darkTheme,
    lightTheme,
    minimalistDarkTheme,
    minimalistLightTheme,
    type AppTheme,
} from '../styles/theme';

export type ThemePreference = 'system' | 'light' | 'dark';
/**
 * "Classic" is this app's original look (unchanged, always the default).
 * "Minimalist" is the "habitPro redesign" Claude Design mockup pack — warm
 * neutral ground, one accent, flat bordered cards, Manrope + DM Sans — with
 * its own light and dark variants, selectable independently of light/dark.
 */
export type ThemePack = 'classic' | 'minimalist';

const STORAGE_KEY = '@habitpro_theme';
const PACK_STORAGE_KEY = '@habitpro_theme_pack';

interface ThemeContextValue {
    theme: AppTheme;
    isDark: boolean;
    preference: ThemePreference;
    setPreference: (pref: ThemePreference) => void;
    cycleTheme: () => void;
    themePack: ThemePack;
    setThemePack: (pack: ThemePack) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
    theme: darkTheme,
    isDark: true,
    preference: 'system',
    setPreference: () => { },
    cycleTheme: () => { },
    themePack: 'classic',
    setThemePack: () => { },
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const systemScheme = useColorScheme();
    const [preference, setPreferenceState] = useState<ThemePreference>('system');
    const [themePack, setThemePackState] = useState<ThemePack>('classic');
    const [loaded, setLoaded] = useState(false);

    // Load saved preference on mount
    useEffect(() => {
        Promise.all([
            AsyncStorage.getItem(STORAGE_KEY),
            AsyncStorage.getItem(PACK_STORAGE_KEY),
        ]).then(([savedPreference, savedPack]) => {
            if (savedPreference === 'light' || savedPreference === 'dark' || savedPreference === 'system') {
                setPreferenceState(savedPreference);
            }
            if (savedPack === 'classic' || savedPack === 'minimalist') {
                setThemePackState(savedPack);
            }
            setLoaded(true);
        }).catch(() => setLoaded(true));
    }, []);

    const setPreference = useCallback((pref: ThemePreference) => {
        setPreferenceState(pref);
        AsyncStorage.setItem(STORAGE_KEY, pref).catch(() => { });
    }, []);

    const setThemePack = useCallback((pack: ThemePack) => {
        setThemePackState(pack);
        AsyncStorage.setItem(PACK_STORAGE_KEY, pack).catch(() => { });
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

    const value = useMemo<ThemeContextValue>(() => {
        const theme =
            themePack === 'minimalist'
                ? isDark ? minimalistDarkTheme : minimalistLightTheme
                : isDark ? darkTheme : lightTheme;
        return {
            theme,
            isDark,
            preference,
            setPreference,
            cycleTheme,
            themePack,
            setThemePack,
        };
    }, [isDark, preference, setPreference, cycleTheme, themePack, setThemePack]);

    // Don't render until preference is loaded to avoid flash
    if (!loaded) return null;

    return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Hook to get the current theme anywhere in the tree. */
export function useTheme(): ThemeContextValue {
    return useContext(ThemeContext);
}
