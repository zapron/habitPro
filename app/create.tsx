import { useState } from 'react';
import { View, Text, TextInput, Alert, ScrollView, StyleSheet, TouchableOpacity, StatusBar } from 'react-native';
import { useRouter } from 'expo-router';

import { ArrowLeft, Target, Gamepad2, Plane } from 'lucide-react-native';
import { Button } from '../src/components/Button';
import { Screen } from '../src/components/Screen';
import { useTheme } from '../src/context/ThemeContext';
import { useHabitStore } from '../src/store/habitStore';
import type { HabitMode } from '../src/types/habit';

export default function CreateHabit() {
    const router = useRouter();
    const { theme, isDark } = useTheme();
    const addHabit = useHabitStore((state) => state.addHabit);

    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [mode, setMode] = useState<HabitMode>('autopilot');
    const [totalDaysInput, setTotalDaysInput] = useState('30');
    const [focused, setFocused] = useState<'title' | 'desc' | 'days' | null>(null);

    const handleCreate = () => {
        if (!title.trim()) {
            Alert.alert('Error', 'Please enter a mission title.');
            return;
        }
        if (mode === 'manual') {
            const days = Number.parseInt(totalDaysInput, 10);
            if (Number.isNaN(days) || days <= 0) {
                Alert.alert('Error', 'Please enter a valid number of days.');
                return;
            }
            addHabit({
                title: title.trim(),
                description: description.trim(),
                mode,
                totalDays: days,
            });
        } else {
            addHabit({
                title: title.trim(),
                description: description.trim(),
                mode: 'autopilot',
            });
        }
        router.replace('/');
    };

    return (
        <Screen>
            <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={theme.colors.background} />
            <View style={styles.header}>
                <TouchableOpacity style={[styles.backButton, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]} onPress={() => router.back()}>
                    <ArrowLeft size={20} color={theme.colors.textPrimary} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: theme.colors.textPrimary, fontSize: theme.typography.h2 }]}>New Mission</Text>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps='handled' contentContainerStyle={styles.scrollContent}>
                <View style={[styles.heroCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderRadius: theme.radius.lg, ...theme.shadow.card }]}>
                    <View style={styles.heroIconWrap}>
                        <Target size={18} color={theme.colors.cyan[400]} />
                    </View>
                    <Text style={[styles.heroTitle, { color: theme.colors.textPrimary, fontSize: theme.typography.h3 }]}>Build One Powerful Habit</Text>
                    <Text style={[styles.heroText, { color: theme.colors.textSecondary }]}>Pick autopilot for a classic 21-day streak, or manual for custom-length missions.</Text>
                </View>

                <Text style={[styles.label, { color: theme.colors.textSecondary, fontSize: theme.typography.caption }]}>Mission Title</Text>
                <TextInput
                    style={[styles.input, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, color: theme.colors.textPrimary }, focused === 'title' && { borderColor: theme.colors.indigo[500] }]}
                    placeholder="e.g., Run every morning"
                    placeholderTextColor={theme.colors.textMuted}
                    value={title}
                    onChangeText={setTitle}
                    onFocus={() => setFocused('title')}
                    onBlur={() => setFocused(null)}
                    autoFocus
                />

                <Text style={[styles.label, { color: theme.colors.textSecondary, fontSize: theme.typography.caption }]}>Brief (Optional)</Text>
                <TextInput
                    style={[styles.input, styles.textArea, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, color: theme.colors.textPrimary }, focused === 'desc' && { borderColor: theme.colors.indigo[500] }]}
                    placeholder="Why this mission matters..."
                    placeholderTextColor={theme.colors.textMuted}
                    value={description}
                    onChangeText={setDescription}
                    onFocus={() => setFocused('desc')}
                    onBlur={() => setFocused(null)}
                    multiline
                    textAlignVertical="top"
                />

                <Text style={[styles.label, { color: theme.colors.textSecondary, fontSize: theme.typography.caption }]}>Mode</Text>
                <View style={styles.modeRow}>
                    <TouchableOpacity
                        style={[styles.modeCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }, mode === 'autopilot' && { borderColor: theme.colors.cyan[400], backgroundColor: theme.colors.surfaceElevated }]}
                        onPress={() => setMode('autopilot')}
                        activeOpacity={0.85}
                    >
                        <Plane size={20} color={mode === 'autopilot' ? theme.colors.cyan[400] : theme.colors.textMuted} />
                        <Text style={[styles.modeLabel, { color: mode === 'autopilot' ? theme.colors.textPrimary : theme.colors.textSecondary }]}>Autopilot</Text>
                        <Text style={[styles.modeHint, { color: theme.colors.textMuted }]}>21-day streak</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.modeCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }, mode === 'manual' && { borderColor: theme.colors.amber[500], backgroundColor: theme.colors.surfaceElevated }]}
                        onPress={() => setMode('manual')}
                        activeOpacity={0.85}
                    >
                        <Gamepad2 size={20} color={mode === 'manual' ? theme.colors.amber[500] : theme.colors.textMuted} />
                        <Text style={[styles.modeLabel, { color: mode === 'manual' ? theme.colors.textPrimary : theme.colors.textSecondary }]}>Manual</Text>
                        <Text style={[styles.modeHint, { color: theme.colors.textMuted }]}>Custom days</Text>
                    </TouchableOpacity>
                </View>

                {mode === 'manual' && (
                    <>
                        <Text style={[styles.label, { color: theme.colors.textSecondary, fontSize: theme.typography.caption }]}>Total Days</Text>
                        <TextInput
                            style={[styles.input, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, color: theme.colors.textPrimary }, focused === 'days' && { borderColor: theme.colors.indigo[500] }]}
                            placeholder="30"
                            placeholderTextColor={theme.colors.textMuted}
                            value={totalDaysInput}
                            onChangeText={setTotalDaysInput}
                            onFocus={() => setFocused('days')}
                            onBlur={() => setFocused(null)}
                            keyboardType="number-pad"
                        />
                    </>
                )}

                <Button title='Launch Mission' onPress={handleCreate} style={styles.cta} />
            </ScrollView>
        </Screen>
    );
}

const styles = StyleSheet.create({
    scrollContent: { paddingBottom: 24 },
    header: { flexDirection: 'row', alignItems: 'center', marginBottom: 22 },
    backButton: { width: 40, height: 40, borderRadius: 9999, alignItems: 'center', justifyContent: 'center', borderWidth: 1, marginRight: 12 },
    headerTitle: { fontWeight: '800' },
    heroCard: { padding: 16, marginBottom: 20, borderWidth: 1 },
    heroIconWrap: { width: 34, height: 34, borderRadius: 9999, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(34, 211, 238, 0.14)', marginBottom: 10 },
    heroTitle: { fontWeight: '700', marginBottom: 6 },
    heroText: { lineHeight: 20 },
    label: { marginBottom: 8, fontWeight: '600' },
    input: { borderWidth: 1, borderRadius: 14, padding: 14, fontSize: 16, marginBottom: 16 },
    textArea: { height: 110 },
    modeRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
    modeCard: { flex: 1, alignItems: 'center', paddingVertical: 16, borderRadius: 14, borderWidth: 1, gap: 6 },
    modeLabel: { fontWeight: '700', fontSize: 14 },
    modeHint: { fontSize: 11 },
    cta: { marginBottom: 20 },
});
