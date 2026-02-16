import { useState } from 'react';
import { View, Text, TextInput, Alert, ScrollView, StyleSheet, TouchableOpacity, StatusBar } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, Target, Plane, Gamepad2 } from 'lucide-react-native';
import { useHabitStore } from '../src/store/habitStore';
import { Button } from '../src/components/Button';
import { Screen } from '../src/components/Screen';
import { theme } from '../src/styles/theme';
import type { HabitMode } from '../src/types/habit';

export default function CreateHabit() {
    const router = useRouter();
    const addHabit = useHabitStore((state) => state.addHabit);
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [mode, setMode] = useState<HabitMode>('autopilot');
    const [customDays, setCustomDays] = useState('30');
    const [focusedInput, setFocusedInput] = useState<'title' | 'description' | 'days' | null>(null);

    const handleCreate = () => {
        if (!title.trim()) {
            Alert.alert('Error', 'Please enter a mission name');
            return;
        }

        if (mode === 'manual') {
            const days = Number.parseInt(customDays, 10);
            if (Number.isNaN(days) || days < 3 || days > 365) {
                Alert.alert('Error', 'Please enter a valid number of days (3–365)');
                return;
            }
        }

        addHabit({
            title: title.trim(),
            description: description.trim() || undefined,
            mode,
            totalDays: mode === 'manual' ? Number.parseInt(customDays, 10) : undefined,
        });
        router.back();
    };

    return (
        <Screen>
            <StatusBar barStyle='light-content' backgroundColor={theme.colors.background} />

            <View style={styles.header}>
                <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
                    <ArrowLeft size={20} color={theme.colors.white} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Create Mission</Text>
            </View>

            <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
                <View style={styles.heroCard}>
                    <View style={styles.heroIconWrap}>
                        <Target size={18} color={theme.colors.cyan[400]} />
                    </View>
                    <Text style={styles.heroTitle}>Choose Your Mission Type</Text>
                    <Text style={styles.heroText}>
                        Go autopilot for a classic 21-day challenge, or take manual control and set your own rules.
                    </Text>
                </View>

                {/* Mode Selector */}
                <Text style={styles.label}>Mission Mode</Text>
                <View style={styles.modeRow}>
                    <TouchableOpacity
                        style={[styles.modeCard, mode === 'autopilot' && styles.modeCardActive]}
                        onPress={() => setMode('autopilot')}
                        activeOpacity={0.85}
                    >
                        <View style={[styles.modeIconWrap, mode === 'autopilot' && styles.modeIconWrapActive]}>
                            <Plane size={18} color={mode === 'autopilot' ? theme.colors.cyan[400] : theme.colors.textMuted} />
                        </View>
                        <Text style={[styles.modeTitle, mode === 'autopilot' && styles.modeTitleActive]}>Autopilot</Text>
                        <Text style={styles.modeHint}>21 days · Timer counts up</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.modeCard, mode === 'manual' && styles.modeCardActiveManual]}
                        onPress={() => setMode('manual')}
                        activeOpacity={0.85}
                    >
                        <View style={[styles.modeIconWrap, mode === 'manual' && styles.modeIconWrapActiveManual]}>
                            <Gamepad2 size={18} color={mode === 'manual' ? theme.colors.amber[500] : theme.colors.textMuted} />
                        </View>
                        <Text style={[styles.modeTitle, mode === 'manual' && styles.modeTitleActiveManual]}>Manual</Text>
                        <Text style={styles.modeHint}>Custom days · Countdown</Text>
                    </TouchableOpacity>
                </View>

                {/* Custom Days Input (Manual mode only) */}
                {mode === 'manual' && (
                    <>
                        <Text style={styles.label}>How many days to complete?</Text>
                        <TextInput
                            style={[styles.input, focusedInput === 'days' && styles.inputFocusedManual]}
                            placeholder='30'
                            placeholderTextColor={theme.colors.textMuted}
                            value={customDays}
                            onChangeText={setCustomDays}
                            keyboardType='number-pad'
                            onFocus={() => setFocusedInput('days')}
                            onBlur={() => setFocusedInput(null)}
                        />
                    </>
                )}

                <Text style={styles.label}>Mission Name</Text>
                <TextInput
                    style={[styles.input, focusedInput === 'title' && styles.inputFocused]}
                    placeholder='e.g., Deep Work 60 Minutes'
                    placeholderTextColor={theme.colors.textMuted}
                    value={title}
                    onChangeText={setTitle}
                    autoFocus
                    onFocus={() => setFocusedInput('title')}
                    onBlur={() => setFocusedInput(null)}
                />

                <Text style={styles.label}>Mission Brief (Optional)</Text>
                <TextInput
                    style={[styles.input, styles.textArea, focusedInput === 'description' && styles.inputFocused]}
                    placeholder='Why does this mission matter right now?'
                    placeholderTextColor={theme.colors.textMuted}
                    value={description}
                    onChangeText={setDescription}
                    multiline
                    textAlignVertical='top'
                    onFocus={() => setFocusedInput('description')}
                    onBlur={() => setFocusedInput(null)}
                />

                <Button title='Launch Mission' onPress={handleCreate} style={styles.ctaButton} />

                <Text style={styles.quote}>
                    {mode === 'autopilot'
                        ? 'Discipline compounds faster than motivation.'
                        : 'You set the rules. Now honor them.'}
                </Text>
            </ScrollView>
        </Screen>
    );
}

const styles = StyleSheet.create({
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 22,
    },
    backButton: {
        padding: 8,
        borderRadius: theme.radius.pill,
        backgroundColor: theme.colors.surface,
        marginRight: 14,
        height: 40,
        width: 40,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: theme.colors.border,
    },
    headerTitle: {
        fontSize: theme.typography.h2,
        fontWeight: '800',
        color: theme.colors.textPrimary,
    },
    scrollView: {
        flex: 1,
    },
    heroCard: {
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radius.lg,
        borderWidth: 1,
        borderColor: theme.colors.border,
        padding: 18,
        marginBottom: 24,
        ...theme.shadow.card,
    },
    heroIconWrap: {
        width: 34,
        height: 34,
        borderRadius: theme.radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(34, 211, 238, 0.12)',
        marginBottom: 10,
    },
    heroTitle: {
        color: theme.colors.textPrimary,
        fontSize: theme.typography.h3,
        fontWeight: '700',
        marginBottom: 6,
    },
    heroText: {
        color: theme.colors.textSecondary,
        fontSize: theme.typography.caption,
        lineHeight: 20,
    },
    label: {
        color: theme.colors.textSecondary,
        marginBottom: 8,
        fontWeight: '600',
        fontSize: theme.typography.caption,
        letterSpacing: 0.2,
    },
    /* ── Mode selector ── */
    modeRow: {
        flexDirection: 'row',
        gap: 10,
        marginBottom: 20,
    },
    modeCard: {
        flex: 1,
        backgroundColor: theme.colors.surface,
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: theme.radius.md,
        paddingVertical: 14,
        paddingHorizontal: 12,
        alignItems: 'center',
    },
    modeCardActive: {
        borderColor: theme.colors.cyan[400],
        backgroundColor: 'rgba(34, 211, 238, 0.08)',
    },
    modeCardActiveManual: {
        borderColor: theme.colors.amber[500],
        backgroundColor: 'rgba(245, 158, 11, 0.08)',
    },
    modeIconWrap: {
        width: 38,
        height: 38,
        borderRadius: theme.radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.surfaceElevated,
        marginBottom: 8,
    },
    modeIconWrapActive: {
        backgroundColor: 'rgba(34, 211, 238, 0.16)',
    },
    modeIconWrapActiveManual: {
        backgroundColor: 'rgba(245, 158, 11, 0.16)',
    },
    modeTitle: {
        color: theme.colors.textSecondary,
        fontWeight: '700',
        fontSize: 15,
        marginBottom: 2,
    },
    modeTitleActive: {
        color: theme.colors.cyan[400],
    },
    modeTitleActiveManual: {
        color: theme.colors.amber[500],
    },
    modeHint: {
        color: theme.colors.textMuted,
        fontSize: 11,
    },
    /* ── Inputs ── */
    input: {
        backgroundColor: theme.colors.surface,
        color: theme.colors.textPrimary,
        padding: 16,
        borderRadius: theme.radius.md,
        fontSize: 17,
        borderWidth: 1,
        borderColor: theme.colors.border,
        marginBottom: 20,
    },
    textArea: {
        height: 130,
    },
    inputFocused: {
        borderColor: theme.colors.indigo[500],
        shadowColor: theme.colors.indigo[500],
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.45,
        shadowRadius: 8,
    },
    inputFocusedManual: {
        borderColor: theme.colors.amber[500],
        shadowColor: theme.colors.amber[500],
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.45,
        shadowRadius: 8,
    },
    ctaButton: {
        marginTop: 4,
    },
    quote: {
        color: theme.colors.textMuted,
        textAlign: 'center',
        marginTop: 20,
        marginBottom: 20,
        fontSize: 14,
        fontStyle: 'italic',
    },
});
