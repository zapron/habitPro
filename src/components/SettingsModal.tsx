import React from 'react';
import { Text } from "./AppText";
import {
  View,
  TouchableOpacity,
  Modal,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Pressable,
  ScrollView,
  InteractionManager,
  Linking,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Bell, ExternalLink, X, Monitor, Sun, Moon, type LucideIcon } from 'lucide-react-native';
import { useTheme, type ThemePreference } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { getPublicLinks, isSupabaseConfigured } from '../lib/env';
import { useHabitStore } from '../store/habitStore';
import { UsernameSetupFields } from './UsernameSetupFields';
import { useRouter } from "expo-router";
import { getRemotePushPermissionDetails, registerPushTokenForCurrentUser, requestRemotePushPermissionDetails } from "../lib/pushTokens";
import { useEffect, useMemo, useState } from "react";
import { ShimmerBlock } from "./ShimmerBlock";

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
    const router = useRouter();
    const { theme, isDark, preference, setPreference } = useTheme();
    const insets = useSafeAreaInsets();
    const { session } = useAuth();
    const showAccount = isSupabaseConfigured();
    const username = useHabitStore((s) => s.username);
    const publicLinks = useMemo(() => getPublicLinks(), []);
    const uid = session?.user?.id ?? null;
    const [notifStatus, setNotifStatus] = useState<"loading" | "on" | "off" | "unavailable">("loading");

    const canShowNotifRow = Boolean(showAccount && uid);

    const refreshNotifStatus = async () => {
        if (!uid) {
            setNotifStatus("unavailable");
            return;
        }
        const details = await getRemotePushPermissionDetails();
        setNotifStatus(details.status === "granted" ? "on" : details.status === "unavailable" ? "unavailable" : "off");
    };

    useEffect(() => {
        if (!visible) return undefined;
        if (!canShowNotifRow) {
            setNotifStatus("unavailable");
            return undefined;
        }
        setNotifStatus("loading");
        const task = InteractionManager.runAfterInteractions(() => {
            void refreshNotifStatus();
        });
        return () => {
            task.cancel?.();
        };
    }, [visible, uid]);

    const notifHint = useMemo(() => {
        if (notifStatus === "on") return "On";
        if (notifStatus === "off") return "Off";
        if (notifStatus === "unavailable") return "Unavailable";
        return "Checking…";
    }, [notifStatus]);

    const onPressNotifications = async () => {
        if (!uid) return;
        if (notifStatus === "on") return;
        const details = await getRemotePushPermissionDetails();
        if (details.status === "granted") {
            setNotifStatus("on");
            return;
        }
        if (details.status === "undetermined" || (details.status === "denied" && details.canAskAgain)) {
            const next = await requestRemotePushPermissionDetails();
            if (next.status === "granted") {
                setNotifStatus("on");
                await registerPushTokenForCurrentUser(uid);
                return;
            }
            setNotifStatus("off");
            return;
        }
        // denied (or unavailable): route to Settings
        void Linking.openSettings();
        setNotifStatus("off");
    };

    const onOpenPublicLink = async (url: string) => {
        await Linking.openURL(url);
    };
    const sheetBottomPad = Math.max(insets.bottom, 14);

    return (
        <Modal
            visible={visible}
            animationType="slide"
            transparent
            onRequestClose={onClose}
            statusBarTranslucent
        >
            <View style={[styles.backdrop, { backgroundColor: isDark ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.2)' }]}>
                <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Dismiss" />
                <KeyboardAvoidingView
                    pointerEvents="box-none"
                    behavior={Platform.OS === "ios" ? "padding" : undefined}
                    style={styles.keyboardAvoider}
                >
                <Pressable
                    style={[
                        styles.sheet,
                        {
                            backgroundColor: theme.colors.surface,
                            borderColor: theme.colors.border,
                            paddingBottom: sheetBottomPad,
                        },
                    ]}
                    onPress={(e) => e.stopPropagation()}
                >
                    {/* Handle bar */}
                    <View style={[styles.handle, { backgroundColor: theme.colors.textMuted }]} />

                    {/* Header */}
                    <View style={styles.headerRow}>
                        <Text style={[styles.sheetTitle, { color: theme.colors.textPrimary }]}>Settings</Text>
                        <TouchableOpacity style={[styles.closeButton, { backgroundColor: theme.colors.surfaceElevated, borderColor: theme.colors.border }]} onPress={onClose}>
                            <X size={18} color={theme.colors.textSecondary} />
                        </TouchableOpacity>
                    </View>

                    <ScrollView
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={[styles.contentScroll, { paddingBottom: sheetBottomPad }]}
                        keyboardShouldPersistTaps="handled"
                        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
                    >

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
                            },
                        ]}
                        onPress={() => {
                            onClose();
                            router.push("/membership");
                        }}
                        activeOpacity={0.85}
                        accessibilityRole="button"
                        accessibilityLabel="Membership and billing"
                    >
                        <Text style={[styles.rowBtnText, { color: theme.colors.textPrimary }]}>Membership</Text>
                        <Text style={[styles.rowBtnHint, { color: theme.colors.textMuted }]}>
                            Plan, renewal date, cancel in store
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

                    {canShowNotifRow ? (
                        <>
                            <Text style={[styles.sectionLabel, { color: theme.colors.textMuted, marginTop: 14 }]}>NOTIFICATIONS</Text>
                            <TouchableOpacity
                                style={[
                                    styles.rowBtn,
                                    {
                                        borderColor: theme.colors.border,
                                        backgroundColor: theme.colors.surfaceElevated,
                                    },
                                ]}
                                onPress={() => void onPressNotifications()}
                                activeOpacity={0.85}
                                accessibilityRole="button"
                                accessibilityLabel="Notification settings"
                            >
                                <View style={styles.rowBtnTop}>
                                    <View style={styles.rowBtnTitleRow}>
                                        <Bell size={16} color={theme.colors.indigo[400]} />
                                        <Text style={[styles.rowBtnText, { color: theme.colors.textPrimary }]}>
                                            Push notifications
                                        </Text>
                                    </View>
                                    <View style={styles.rowBtnRight}>
                                        {notifStatus === "loading" ? (
                                            <ShimmerBlock
                                                isDark={isDark}
                                                height={12}
                                                radius={6}
                                                style={{ width: 54, marginRight: 6 }}
                                            />
                                        ) : (
                                            <Text style={[styles.rowBtnRightText, { color: notifStatus === "on" ? theme.colors.green[500] : theme.colors.textMuted }]}>
                                                {notifHint}
                                            </Text>
                                        )}
                                        <ExternalLink size={14} color={theme.colors.textMuted} />
                                    </View>
                                </View>
                                <Text style={[styles.rowBtnHint, { color: theme.colors.textMuted }]}>
                                    {notifStatus === "on"
                                        ? "You’ll receive streak reminders and updates."
                                        : "Enable to get reminders and updates."}
                                </Text>
                                {notifStatus === "off" ? (
                                    <Text style={[styles.rowBtnHint, { color: theme.colors.textSecondary, marginTop: 4 }]}>
                                        If you denied earlier, this will open Settings.
                                    </Text>
                                ) : null}
                            </TouchableOpacity>
                        </>
                    ) : null}

                    <Text style={[styles.sectionLabel, { color: theme.colors.textMuted, marginTop: 14 }]}>LEGAL</Text>
                    <TouchableOpacity
                        style={[
                            styles.rowBtn,
                            styles.legalLinkRow,
                            {
                                borderColor: theme.colors.border,
                                backgroundColor: theme.colors.surfaceElevated,
                            },
                        ]}
                        onPress={() => void onOpenPublicLink(publicLinks.privacy)}
                        activeOpacity={0.85}
                        accessibilityRole="link"
                        accessibilityLabel="Privacy policy"
                    >
                        <View style={styles.rowBtnTop}>
                            <Text style={[styles.rowBtnText, { color: theme.colors.textPrimary }]}>Privacy Policy</Text>
                            <ExternalLink size={14} color={theme.colors.textMuted} />
                        </View>
                        <Text style={[styles.rowBtnHint, { color: theme.colors.textMuted }]}>How HabitPro handles account and app data</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[
                            styles.rowBtn,
                            styles.legalLinkRow,
                            {
                                borderColor: theme.colors.border,
                                backgroundColor: theme.colors.surfaceElevated,
                            },
                        ]}
                        onPress={() => void onOpenPublicLink(publicLinks.terms)}
                        activeOpacity={0.85}
                        accessibilityRole="link"
                        accessibilityLabel="Terms of use"
                    >
                        <View style={styles.rowBtnTop}>
                            <Text style={[styles.rowBtnText, { color: theme.colors.textPrimary }]}>Terms of Use</Text>
                            <ExternalLink size={14} color={theme.colors.textMuted} />
                        </View>
                        <Text style={[styles.rowBtnHint, { color: theme.colors.textMuted }]}>Rules for using missions, community, and membership</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[
                            styles.rowBtn,
                            {
                                borderColor: theme.colors.border,
                                backgroundColor: theme.colors.surfaceElevated,
                            },
                        ]}
                        onPress={() => void onOpenPublicLink(publicLinks.support)}
                        activeOpacity={0.85}
                        accessibilityRole="link"
                        accessibilityLabel="Support"
                    >
                        <View style={styles.rowBtnTop}>
                            <Text style={[styles.rowBtnText, { color: theme.colors.textPrimary }]}>Support</Text>
                            <ExternalLink size={14} color={theme.colors.textMuted} />
                        </View>
                        <Text style={[styles.rowBtnHint, { color: theme.colors.textMuted }]}>Help with reminders, purchases, and app access</Text>
                    </TouchableOpacity>
                    </ScrollView>
                </Pressable>
                </KeyboardAvoidingView>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    keyboardAvoider: {
        width: "100%",
        justifyContent: "flex-end",
    },
    sheet: {
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        borderWidth: 1,
        borderBottomWidth: 0,
        paddingHorizontal: 20,
        paddingBottom: 14,
        paddingTop: 10,
        maxHeight: "92%",
    },
    contentScroll: {
        paddingBottom: 14,
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
    rowBtnTop: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
    },
    rowBtnTitleRow: { flexDirection: "row", alignItems: "center", gap: 8, minWidth: 0, flex: 1 },
    rowBtnRight: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 0 },
    rowBtnRightText: { fontSize: 12, fontWeight: "800" },
    rowBtnText: {
        fontSize: 14,
        fontWeight: "800",
    },
    rowBtnHint: {
        fontSize: 12,
        fontWeight: "600",
    },
    legalLinkRow: {
        marginBottom: 8,
    },
});
