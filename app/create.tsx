import { useState } from 'react';
import { View, Text, TextInput, Alert, ScrollView, StyleSheet, TouchableOpacity, StatusBar } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, Target } from 'lucide-react-native';
import { useHabitStore } from '../src/store/habitStore';
import { Button } from '../src/components/Button';
import { Screen } from '../src/components/Screen';
import { theme } from '../src/styles/theme';

export default function CreateHabit() {
    const router = useRouter();
    const addHabit = useHabitStore((state) => state.addHabit);
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [focusedInput, setFocusedInput] = useState<'title' | 'description' | null>(null);

    const handleCreate = () => {
        if (!title.trim()) {
            Alert.alert('Error', 'Please enter a mission name');
            return;
        }

        addHabit(title, description);
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
                    <Text style={styles.heroTitle}>Start a 21-Day Campaign</Text>
                    <Text style={styles.heroText}>
                        Make it specific, measurable, and small enough to sustain daily.
                    </Text>
                </View>

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
                    Discipline compounds faster than motivation.
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
