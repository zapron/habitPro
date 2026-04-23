import React from 'react';
import { Text } from "./AppText";
import {
  View,
  TouchableOpacity,
  Modal,
  StyleSheet,
  Pressable,
} from "react-native";
import { BlurView } from 'expo-blur';
import { X, Monitor, Sun, Moon, type LucideIcon } from 'lucide-react-native';
import { useTheme, type ThemePreference } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { isSupabaseConfigured } from '../lib/env';
import { useBilling } from "../context/BillingContext";
import { useHabitStore } from '../store/habitStore';
import { UsernameSetupFields } from './UsernameSetupFields';

const THEME_OPTIONS: { key: ThemePreference; label: string; Icon: LucideIcon }[] = [
    { key: 'system', label: 'System', Icon: Monitor },
    { key: 'light', label: 'Light', Icon: Sun },
    { key: 'dark', label: 'Dark', Icon: Moon },
];

interface SettingsModalProps {
    visible: boolean;
    onClose: () => void;
}

export function SettingsModal({ visible, onClose }: SettingsModalProps) {
    const { theme, isDark, preference, setPreference } = useTheme();
    const { session } = useAuth();
    const { configured: billingConfigured, ready: billingReady, isExpoGo, openManageSubscriptions } = useBilling();
    const showAccount = isSupabaseConfigured();
    const username = useHabitStore((s) => s.username);

    return (
        <Modal
            visible={visible}
            animationType="slide"
            transparent
            onRequestClose={onClose}
            statusBarTranslucent
        >
            <BlurView intensity={30} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFill} />
            <Pressable style={[styles.backdrop, { backgroundColor: isDark ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.2)' }]} onPress={onClose}>
                <Pressable style={[styles.sheet, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]} onPress={(e) => e.stopPropagation()}>
                    {/* Handle bar */}
                    <View style={[styles.handle, { backgroundColor: theme.colors.textMuted }]} />

                    {/* Header */}
                    <View style={styles.headerRow}>
                        <Text style={[styles.sheetTitle, { color: theme.colors.textPrimary }]}>Settings</Text>
                        <TouchableOpacity style={[styles.closeButton, { backgroundColor: theme.colors.surfaceElevated, borderColor: theme.colors.border }]} onPress={onClose}>
                            <X size={18} color={theme.colors.textSecondary} />
                        </TouchableOpacity>
                    </View>

                    {showAccount && session && (
                        <>
                            <Text style={[styles.sectionLabel, { color: theme.colors.textMuted }]}>ACCOUNT</Text>
                            <Text style={[styles.accountEmail, { color: theme.colors.textSecondary }]} numberOfLines={1}>
                                {session.user.email ?? 'Signed in'}
                            </Text>
                            {!username ? <UsernameSetupFields /> : null}
                        </>
                    )}

                    <Text style={[styles.sectionLabel, { color: theme.colors.textMuted, marginTop: 14 }]}>SUBSCRIPTION</Text>
                    <TouchableOpacity
                        style={[
                            styles.rowBtn,
                            {
                                borderColor: theme.colors.border,
                                backgroundColor: theme.colors.surfaceElevated,
                                opacity: billingConfigured && billingReady && !isExpoGo ? 1 : 0.65,
                            },
                        ]}
                        onPress={() => void openManageSubscriptions()}
                        activeOpacity={0.85}
                        disabled={!billingConfigured || !billingReady || isExpoGo}
                        accessibilityRole="button"
                        accessibilityLabel="Manage subscription"
                    >
                        <Text style={[styles.rowBtnText, { color: theme.colors.textPrimary }]}>Manage subscription</Text>
                        <Text style={[styles.rowBtnHint, { color: theme.colors.textMuted }]}>
                            Open Google Play subscriptions
                        </Text>
                    </TouchableOpacity>

                    <Text style={[styles.sectionLabel, { color: theme.colors.textMuted, marginTop: 14 }]}>THEME</Text>

                    <View style={styles.themeRow}>
                        {THEME_OPTIONS.map(({ key, label, Icon }) => {
                            const isActive = preference === key;
                            return (
                                <TouchableOpacity
                                    key={key}
                                    style={[
                                        styles.themeChip,
                                        {
                                            borderColor: theme.colors.border,
                                            backgroundColor: theme.colors.surfaceElevated,
                                        },
                                        isActive && {
                                            borderColor: theme.colors.indigo[500],
                                            backgroundColor: isDark ? 'rgba(99, 102, 241, 0.14)' : 'rgba(79, 70, 229, 0.08)',
                                        },
                                    ]}
                                    onPress={() => setPreference(key)}
                                    activeOpacity={0.85}
                                    accessibilityRole="button"
                                    accessibilityState={{ selected: isActive }}
                                    accessibilityLabel={`Theme ${label}`}
                                >
                                    <Icon size={16} color={isActive ? theme.colors.indigo[400] : theme.colors.textMuted} />
                                    <Text
                                        style={[
                                            styles.themeChipLabel,
                                            { color: theme.colors.textSecondary },
                                            isActive && { color: theme.colors.indigo[400], fontWeight: '800' },
                                        ]}
                                        numberOfLines={1}
                                    >
                                        {label}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                </Pressable>
            </Pressable>
        </Modal>
    );
}

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    sheet: {
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        borderWidth: 1,
        borderBottomWidth: 0,
        paddingHorizontal: 20,
        paddingBottom: 28,
        paddingTop: 10,
    },
    handle: {
        width: 40,
        height: 4,
        borderRadius: 2,
        alignSelf: 'center',
        marginBottom: 16,
        opacity: 0.4,
    },
    headerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 14,
    },
    sheetTitle: {
        fontSize: 20,
        fontWeight: '800',
    },
    closeButton: {
        width: 36,
        height: 36,
        borderRadius: 9999,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
    },
    sectionLabel: {
        fontSize: 11,
        fontWeight: '700',
        letterSpacing: 1.2,
        marginBottom: 8,
    },
    accountEmail: {
        fontSize: 13,
        marginBottom: 10,
    },
    themeRow: {
        flexDirection: 'row',
        gap: 8,
        marginBottom: 8,
    },
    themeChip: {
        flex: 1,
        minWidth: 0,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        paddingVertical: 10,
        paddingHorizontal: 4,
        borderRadius: 12,
        borderWidth: 1,
    },
    themeChipLabel: {
        fontSize: 11,
        fontWeight: '700',
    },
    rowBtn: {
        borderWidth: 1,
        borderRadius: 14,
        paddingVertical: 12,
        paddingHorizontal: 14,
        gap: 2,
    },
    rowBtnText: {
        fontSize: 14,
        fontWeight: "800",
    },
    rowBtnHint: {
        fontSize: 12,
        fontWeight: "600",
    },
});
