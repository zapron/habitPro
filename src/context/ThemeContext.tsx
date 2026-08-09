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
 * "Classic" is this app's original look, kept in the codebase but no longer
 * reachable — there is currently no UI to select it.
 * "Minimalist" is the "habitPro redesign" Claude Design mockup pack — warm
 * neutral ground, one accent, flat bordered cards, Manrope + DM Sans — and
 * is now the app's only active pack, hardcoded regardless of any previously
 * saved preference (see the load effect below).
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
    themePack: 'minimalist',
    setThemePack: () => { },
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const systemScheme = useColorScheme();
    const [preference, setPreferenceState] = useState<ThemePreference>('system');
    // Minimalist is the only active pack — no UI selects a pack anymore, so
    // this is intentionally never restored from AsyncStorage (see below).
    const [themePack, setThemePackState] = useState<ThemePack>('minimalist');
    const [loaded, setLoaded] = useState(false);

    // Load saved preference on mount
    useEffect(() => {
        // Pack selection is currently disabled app-wide, so PACK_STORAGE_KEY
        // is deliberately not read here — themePack always stays 'minimalist'
        // regardless of any value saved by a prior build's picker UI.
        AsyncStorage.getItem(STORAGE_KEY).then((savedPreference) => {
            if (savedPreference === 'light' || savedPreference === 'dark' || savedPreference === 'system') {
                setPreferenceState(savedPreference);
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
