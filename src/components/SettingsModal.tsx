import React from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    Modal,
    StyleSheet,
    Pressable,
} from 'react-native';
import { X, Monitor, Sun, Moon, type LucideIcon } from 'lucide-react-native';
import { useTheme, type ThemePreference } from '../context/ThemeContext';

const OPTIONS: { key: ThemePreference; label: string; Icon: LucideIcon; desc: string }[] = [
    { key: 'system', label: 'System', Icon: Monitor, desc: 'Match phone settings' },
    { key: 'light', label: 'Light', Icon: Sun, desc: 'Always light mode' },
    { key: 'dark', label: 'Dark', Icon: Moon, desc: 'Always dark mode' },
];

interface SettingsModalProps {
    visible: boolean;
    onClose: () => void;
}

export function SettingsModal({ visible, onClose }: SettingsModalProps) {
    const { theme, isDark, preference, setPreference } = useTheme();

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

                    {/* Theme Section */}
                    <Text style={[styles.sectionLabel, { color: theme.colors.textMuted }]}>APPEARANCE</Text>

                    <View style={styles.optionsList}>
                        {OPTIONS.map(({ key, label, Icon, desc }) => {
                            const isActive = preference === key;
                            return (
                                <TouchableOpacity
                                    key={key}
                                    style={[
                                        styles.optionRow,
                                        { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceElevated },
                                        isActive && { borderColor: theme.colors.indigo[500], backgroundColor: isDark ? 'rgba(99, 102, 241, 0.12)' : 'rgba(79, 70, 229, 0.08)' },
                                    ]}
                                    onPress={() => setPreference(key)}
                                    activeOpacity={0.8}
                                >
                                    <View style={[styles.optionIcon, { backgroundColor: isActive ? (isDark ? 'rgba(99, 102, 241, 0.2)' : 'rgba(79, 70, 229, 0.12)') : theme.colors.surface }]}>
                                        <Icon
                                            size={18}
                                            color={isActive ? theme.colors.indigo[400] : theme.colors.textMuted}
                                        />
                                    </View>
                                    <View style={styles.optionTextWrap}>
                                        <Text style={[styles.optionLabel, { color: theme.colors.textPrimary }, isActive && { color: theme.colors.indigo[400] }]}>
                                            {label}
                                        </Text>
                                        <Text style={[styles.optionDesc, { color: theme.colors.textMuted }]}>{desc}</Text>
                                    </View>
                                    {isActive && (
                                        <View style={[styles.radioOuter, { borderColor: theme.colors.indigo[500] }]}>
                                            <View style={[styles.radioInner, { backgroundColor: theme.colors.indigo[500] }]} />
                                        </View>
                                    )}
                                    {!isActive && (
                                        <View style={[styles.radioOuter, { borderColor: theme.colors.border }]} />
                                    )}
                                </TouchableOpacity>
                            );
                        })}
                    </View>

                    {/* Future spot: more settings sections here */}
                    <Text style={[styles.footerHint, { color: theme.colors.textMuted }]}>
                        More settings coming soon
                    </Text>
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
        paddingBottom: 40,
        paddingTop: 12,
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
        marginBottom: 20,
    },
    sheetTitle: {
        fontSize: 22,
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
        marginBottom: 12,
    },
    optionsList: {
        gap: 8,
    },
    optionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 14,
        borderWidth: 1,
        paddingVertical: 14,
        paddingHorizontal: 14,
        gap: 12,
    },
    optionIcon: {
        width: 38,
        height: 38,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    optionTextWrap: {
        flex: 1,
    },
    optionLabel: {
        fontWeight: '700',
        fontSize: 15,
    },
    optionDesc: {
        fontSize: 12,
        marginTop: 2,
    },
    radioOuter: {
        width: 22,
        height: 22,
        borderRadius: 11,
        borderWidth: 2,
        alignItems: 'center',
        justifyContent: 'center',
    },
    radioInner: {
        width: 10,
        height: 10,
        borderRadius: 5,
    },
    footerHint: {
        fontSize: 12,
        textAlign: 'center',
        marginTop: 20,
        fontStyle: 'italic',
    },
});
