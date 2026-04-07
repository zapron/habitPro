import React, { useCallback, useEffect, useState } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    Modal,
    StyleSheet,
    Pressable,
    TextInput,
    ActivityIndicator,
    Alert,
} from 'react-native';
import { X, Monitor, Sun, Moon, type LucideIcon } from 'lucide-react-native';
import { useTheme, type ThemePreference } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { isSupabaseConfigured } from '../lib/env';
import { getSupabase } from '../lib/supabase';
import { validateUsername } from '../lib/profileUsername';
import { useHabitStore } from '../store/habitStore';

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
    const showAccount = isSupabaseConfigured();
    const username = useHabitStore((s) => s.username);
    const setUsername = useHabitStore((s) => s.setUsername);
    const xp = useHabitStore((s) => s.xp);
    const [usernameDraft, setUsernameDraft] = useState('');
    const [usernameSaving, setUsernameSaving] = useState(false);

    useEffect(() => {
        setUsernameDraft(username ?? '');
    }, [username, visible]);

    const handleSaveUsername = useCallback(async () => {
        if (!session?.user?.id) return;
        if (username) return;
        const supabase = getSupabase();
        if (!supabase) return;

        const v = validateUsername(usernameDraft);
        if (v.ok === false) {
            Alert.alert('Invalid username', v.message);
            return;
        }

        setUsernameSaving(true);
        try {
            const { error } = await supabase.from('profiles').upsert(
                { id: session.user.id, xp, username: v.value },
                { onConflict: 'id' },
            );
            if (error) {
                const code = (error as { code?: string }).code;
                const taken =
                    code === '23505' ||
                    error.message.toLowerCase().includes('duplicate') ||
                    error.message.toLowerCase().includes('unique');
                Alert.alert(
                    'Could not save username',
                    taken ? 'That username is already taken.' : error.message,
                );
                return;
            }
            setUsername(v.value);
        } finally {
            setUsernameSaving(false);
        }
    }, [session?.user, username, usernameDraft, xp, setUsername]);

    return (
        <Modal
            visible={visible}
            animationType="slide"
            transparent
            onRequestClose={onClose}
            statusBarTranslucent
        >
            <Pressable style={styles.backdrop} onPress={onClose}>
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
                            {!username ? (
                                <View style={styles.usernameBlock}>
                                    <Text style={[styles.usernameInlineHint, { color: theme.colors.textMuted }]}>
                                        Set a public username (once) for group missions
                                    </Text>
                                    <TextInput
                                        value={usernameDraft}
                                        onChangeText={setUsernameDraft}
                                        placeholder="your_handle"
                                        placeholderTextColor={theme.colors.textMuted}
                                        autoCapitalize="none"
                                        autoCorrect={false}
                                        maxLength={20}
                                        style={[
                                            styles.usernameInput,
                                            {
                                                color: theme.colors.textPrimary,
                                                borderColor: theme.colors.border,
                                                backgroundColor: theme.colors.background,
                                            },
                                        ]}
                                    />
                                    <TouchableOpacity
                                        style={[
                                            styles.usernameSaveBtn,
                                            { backgroundColor: theme.colors.indigo[600], opacity: usernameSaving ? 0.7 : 1 },
                                        ]}
                                        onPress={() => void handleSaveUsername()}
                                        disabled={usernameSaving}
                                        activeOpacity={0.88}
                                    >
                                        {usernameSaving ? (
                                            <ActivityIndicator color="#fff" />
                                        ) : (
                                            <Text style={styles.usernameSaveText}>Save</Text>
                                        )}
                                    </TouchableOpacity>
                                </View>
                            ) : null}
                        </>
                    )}

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
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
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
    usernameBlock: {
        marginBottom: 4,
        gap: 8,
    },
    usernameInlineHint: {
        fontSize: 12,
        lineHeight: 16,
    },
    usernameInput: {
        borderRadius: 10,
        borderWidth: 1,
        paddingHorizontal: 12,
        paddingVertical: 10,
        fontSize: 15,
        fontWeight: '600',
    },
    usernameSaveBtn: {
        borderRadius: 10,
        paddingVertical: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    usernameSaveText: { color: '#fff', fontWeight: '800', fontSize: 14 },
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
});
