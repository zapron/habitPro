import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StatusBar } from 'react-native';
import { useRouter } from 'expo-router';
import { FlashList } from '@shopify/flash-list';
import { Trophy, Flame, Check } from 'lucide-react-native';
import { useHabitStore } from '../src/store/habitStore';
import { Button } from '../src/components/Button';
import { HabitCard } from '../src/components/HabitCard';
import { Screen } from '../src/components/Screen';
import { theme } from '../src/styles/theme';

export default function Home() {
    const router = useRouter();
    const habits = useHabitStore((state) => state.habits);
    const [activeTab, setActiveTab] = useState<'active' | 'completed'>('active');

    const today = new Date().toISOString().split('T')[0];

    const filteredHabits = useMemo(() => {
        return habits.filter((habit) =>
            activeTab === 'active' ? !habit.isCompleted : habit.isCompleted,
        );
    }, [habits, activeTab]);

    const stats = useMemo(() => {
        const activeCount = habits.filter((habit) => !habit.isCompleted).length;
        const completedCount = habits.filter((habit) => habit.isCompleted).length;
        const todayCheckins = habits.filter((habit) => habit.completedDates.includes(today)).length;
        return { activeCount, completedCount, todayCheckins };
    }, [habits, today]);

    return (
        <Screen>
            <StatusBar barStyle='light-content' backgroundColor={theme.colors.background} />

            <View style={styles.header}>
                <View>
                    <Text style={styles.headerEyebrow}>MISSION CONTROL</Text>
                    <Text style={styles.headerTitle}>HabitPro</Text>
                    <Text style={styles.headerSubtitle}>Build discipline in 21-day campaigns.</Text>
                </View>
                <View style={styles.headerBadge}>
                    <Trophy size={22} color={theme.colors.yellow[400]} />
                </View>
            </View>

            <View style={styles.statsRow}>
                <View style={styles.statCard}>
                    <Flame size={16} color={theme.colors.amber[500]} />
                    <Text style={styles.statValue}>{stats.activeCount}</Text>
                    <Text style={styles.statLabel}>Active</Text>
                </View>
                <View style={styles.statCard}>
                    <Check size={16} color={theme.colors.green[500]} />
                    <Text style={styles.statValue}>{stats.completedCount}</Text>
                    <Text style={styles.statLabel}>Completed</Text>
                </View>
                <View style={styles.statCard}>
                    <Text style={styles.statDot}>TODAY</Text>
                    <Text style={styles.statValue}>{stats.todayCheckins}</Text>
                    <Text style={styles.statLabel}>Check-ins</Text>
                </View>
            </View>

            <View style={styles.tabContainer}>
                <TouchableOpacity
                    style={[styles.tab, activeTab === 'active' && styles.activeTab]}
                    onPress={() => setActiveTab('active')}
                    activeOpacity={0.8}
                >
                    <Text style={[styles.tabText, activeTab === 'active' && styles.activeTabText]}>Active</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.tab, activeTab === 'completed' && styles.activeTab]}
                    onPress={() => setActiveTab('completed')}
                    activeOpacity={0.8}
                >
                    <Text style={[styles.tabText, activeTab === 'completed' && styles.activeTabText]}>Completed</Text>
                </TouchableOpacity>
            </View>

            <View style={styles.listWrap}>
                {filteredHabits.length === 0 ? (
                    <View style={styles.emptyState}>
                        <View style={styles.emptyIconContainer}>
                            <Trophy size={50} color={theme.colors.slate[500]} />
                        </View>
                        <Text style={styles.emptyTitle}>
                            {activeTab === 'active' ? 'No active missions' : 'No completed missions yet'}
                        </Text>
                        <Text style={styles.emptyDescription}>
                            {activeTab === 'active'
                                ? 'Start your first 21-day mission and keep momentum daily.'
                                : 'Complete your first mission to unlock this section.'}
                        </Text>
                        {activeTab === 'active' && (
                            <Button
                                title='Start 21-Day Mission'
                                onPress={() => router.push('/create')}
                                style={styles.emptyButton}
                            />
                        )}
                    </View>
                ) : (
                    <FlashList
                        data={filteredHabits}
                        renderItem={({ item }) => <HabitCard item={item} />}
                        contentContainerStyle={styles.listContent}
                        showsVerticalScrollIndicator={false}
                        keyExtractor={(item) => item.id}
                    />
                )}
            </View>

            <View style={styles.fabContainer}>
                <Button title='New Mission' onPress={() => router.push('/create')} style={styles.fabButton} />
            </View>
        </Screen>
    );
}

const styles = StyleSheet.create({
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 18,
    },
    headerEyebrow: {
        color: theme.colors.cyan[400],
        fontSize: theme.typography.micro,
        fontWeight: '700',
        letterSpacing: 1.3,
        marginBottom: 6,
    },
    headerTitle: {
        fontSize: theme.typography.h1,
        fontWeight: '800',
        color: theme.colors.textPrimary,
    },
    headerSubtitle: {
        color: theme.colors.textSecondary,
        marginTop: 4,
        fontSize: theme.typography.caption,
    },
    headerBadge: {
        width: 46,
        height: 46,
        borderRadius: theme.radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.surface,
        borderWidth: 1,
        borderColor: theme.colors.border,
    },
    statsRow: {
        flexDirection: 'row',
        gap: 10,
        marginBottom: 20,
    },
    statCard: {
        flex: 1,
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radius.md,
        borderWidth: 1,
        borderColor: theme.colors.border,
        paddingVertical: 10,
        paddingHorizontal: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    statDot: {
        color: theme.colors.cyan[400],
        fontSize: 9,
        fontWeight: '800',
        letterSpacing: 1,
    },
    statValue: {
        color: theme.colors.textPrimary,
        fontSize: 22,
        fontWeight: '800',
        marginTop: 3,
    },
    statLabel: {
        color: theme.colors.textSecondary,
        fontSize: 11,
        marginTop: 2,
    },
    tabContainer: {
        flexDirection: 'row',
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radius.md,
        padding: 4,
        marginBottom: 14,
        borderWidth: 1,
        borderColor: theme.colors.border,
    },
    tab: {
        flex: 1,
        paddingVertical: 10,
        alignItems: 'center',
        borderRadius: 10,
    },
    activeTab: {
        backgroundColor: theme.colors.indigo[600],
        ...theme.shadow.glow,
    },
    tabText: {
        color: theme.colors.textSecondary,
        fontWeight: '700',
    },
    activeTabText: {
        color: theme.colors.white,
    },
    listWrap: {
        flex: 1,
    },
    listContent: {
        paddingBottom: 110,
    },
    emptyState: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    emptyIconContainer: {
        backgroundColor: theme.colors.surface,
        width: 94,
        height: 94,
        borderRadius: theme.radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: theme.colors.border,
        marginBottom: 16,
    },
    emptyTitle: {
        fontSize: theme.typography.h3,
        fontWeight: '700',
        color: theme.colors.textPrimary,
        marginBottom: 8,
    },
    emptyDescription: {
        color: theme.colors.textSecondary,
        textAlign: 'center',
        marginBottom: 20,
        paddingHorizontal: 24,
    },
    emptyButton: {
        width: '100%',
    },
    fabContainer: {
        position: 'absolute',
        bottom: 32,
        left: theme.spacing.lg,
        right: theme.spacing.lg,
    },
    fabButton: {
        ...theme.shadow.glow,
    },
});
