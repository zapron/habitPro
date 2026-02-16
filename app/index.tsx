import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StatusBar, Animated } from 'react-native';
import { useRouter } from 'expo-router';
import { FlashList } from '@shopify/flash-list';
import { Trophy, Bolt, Target, Plus, ChevronRight, Sun, Moon, Sunrise, Sunset } from 'lucide-react-native';
import { useHabitStore } from '../src/store/habitStore';
import { Button } from '../src/components/Button';
import { HabitCard } from '../src/components/HabitCard';
import { Screen } from '../src/components/Screen';
import { theme } from '../src/styles/theme';
import { AnimatedFire } from '../src/components/AnimatedFire';

/** Dynamic greeting based on time of day */
function getGreeting(): { text: string; emoji: string; Icon: typeof Sun } {
    const hour = new Date().getHours();
    if (hour < 5) return { text: 'Burning the midnight oil', emoji: '🌙', Icon: Moon };
    if (hour < 12) return { text: 'Good morning, warrior', emoji: '☀️', Icon: Sunrise };
    if (hour < 17) return { text: 'Keep pushing forward', emoji: '💪', Icon: Sun };
    if (hour < 21) return { text: 'Evening focus mode', emoji: '🌅', Icon: Sunset };
    return { text: 'Night owl mode', emoji: '🌙', Icon: Moon };
}

const MOTIVATIONAL_LINES = [
    'Small steps, big results.',
    'Consistency beats intensity.',
    'Show up. That\'s the whole game.',
    'Your future self will thank you.',
    'Discipline is freedom.',
    'One day or day one — you decide.',
    'Progress, not perfection.',
    'The streak doesn\'t build itself.',
];



export default function Home() {
    const router = useRouter();
    const habits = useHabitStore((state) => state.habits);
    const miniMissions = useHabitStore((state) => state.miniMissions);
    const [activeTab, setActiveTab] = useState<'active' | 'completed'>('active');

    const filteredHabits = useMemo(() => {
        return habits.filter((habit) =>
            activeTab === 'active' ? !habit.isCompleted : habit.isCompleted,
        );
    }, [habits, activeTab]);

    const stats = useMemo(() => {
        const activeCount = habits.filter((habit) => !habit.isCompleted).length;
        const completedCount = habits.filter((habit) => habit.isCompleted).length;
        return { activeCount, completedCount };
    }, [habits]);

    const miniMissionStats = useMemo(() => {
        const queued = miniMissions.filter((m) => m.status !== 'completed').length;
        const running = miniMissions.filter((m) => m.status === 'in_progress').length;
        return { queued, running };
    }, [miniMissions]);

    const miniCount = miniMissionStats.running > 0 ? miniMissionStats.running : miniMissionStats.queued;

    const greeting = useMemo(() => getGreeting(), []);
    const motivation = useMemo(() => {
        // Rotate daily based on date
        const dayIndex = new Date().getDate() % MOTIVATIONAL_LINES.length;
        return MOTIVATIONAL_LINES[dayIndex];
    }, []);

    // Header fade-in
    const headerOpacity = useRef(new Animated.Value(0)).current;
    const headerSlide = useRef(new Animated.Value(-15)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.timing(headerOpacity, { toValue: 1, duration: 600, useNativeDriver: true }),
            Animated.spring(headerSlide, { toValue: 0, tension: 50, friction: 10, useNativeDriver: true }),
        ]).start();
    }, [headerOpacity, headerSlide]);

    return (
        <Screen>
            <StatusBar barStyle='light-content' backgroundColor={theme.colors.background} />

            <Animated.View
                style={[
                    styles.header,
                    { opacity: headerOpacity, transform: [{ translateY: headerSlide }] },
                ]}
            >
                <View>
                    <Text style={styles.headerEyebrow}>MISSION CONTROL</Text>
                    <Text style={styles.headerTitle}>
                        {greeting.text} {greeting.emoji}
                    </Text>
                    <Text style={styles.headerSubtitle}>{motivation}</Text>
                </View>
                <View style={styles.headerBadge}>
                    <Trophy size={22} color={theme.colors.yellow[400]} />
                </View>
            </Animated.View>

            {/* ── Glassmorphism Command Center ── */}
            <View style={styles.commandRow}>
                <TouchableOpacity
                    style={styles.commandCardMain}
                    activeOpacity={0.85}
                    onPress={() => router.push('/create')}
                >
                    <View style={styles.commandTopRow}>
                        <View style={styles.commandIconMain}>
                            {stats.activeCount > 0 ? (
                                <AnimatedFire size={14} color={theme.colors.cyan[400]} />
                            ) : (
                                <Target size={18} color={theme.colors.cyan[400]} />
                            )}
                        </View>
                        {stats.activeCount > 0 && (
                            <Text style={styles.countMain}>{stats.activeCount}</Text>
                        )}
                    </View>
                    <Text style={styles.commandTitle}>New Mission</Text>
                    <Text style={styles.commandHint}>21-day or custom</Text>
                    <View style={styles.commandCta}>
                        <Plus size={14} color={theme.colors.white} strokeWidth={3} />
                    </View>
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.commandCardMini}
                    activeOpacity={0.85}
                    onPress={() => router.push('/mini')}
                >
                    <View style={styles.commandTopRow}>
                        <View style={styles.commandIconMini}>
                            {miniCount > 0 ? (
                                <AnimatedFire size={14} color={theme.colors.amber[500]} />
                            ) : (
                                <Bolt size={18} color={theme.colors.yellow[400]} />
                            )}
                        </View>
                        {miniCount > 0 && (
                            <Text style={styles.countMini}>{miniCount}</Text>
                        )}
                    </View>
                    <Text style={styles.commandTitle}>Mini Missions</Text>
                    <Text style={styles.commandHint}>
                        {miniMissionStats.running > 0 ? 'running now' : 'queued'}
                    </Text>
                    <View style={styles.commandCtaMini}>
                        <ChevronRight size={14} color={theme.colors.amber[500]} strokeWidth={3} />
                    </View>
                </TouchableOpacity>
            </View>

            {/* ── Tabs with counts ── */}
            <View style={styles.tabContainer}>
                <TouchableOpacity
                    style={[styles.tab, activeTab === 'active' && styles.activeTab]}
                    onPress={() => setActiveTab('active')}
                    activeOpacity={0.8}
                >
                    <Text style={[styles.tabText, activeTab === 'active' && styles.activeTabText]}>
                        Active{stats.activeCount > 0 ? ` (${stats.activeCount})` : ''}
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.tab, activeTab === 'completed' && styles.activeTab]}
                    onPress={() => setActiveTab('completed')}
                    activeOpacity={0.8}
                >
                    <Text style={[styles.tabText, activeTab === 'completed' && styles.activeTabText]}>
                        Completed{stats.completedCount > 0 ? ` (${stats.completedCount})` : ''}
                    </Text>
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
                                ? 'Start your first mission and keep momentum daily.'
                                : 'Complete your first mission to unlock this section.'}
                        </Text>
                        {activeTab === 'active' && (
                            <Button
                                title='Start a Mission'
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
        fontSize: 22,
        fontWeight: '800',
        color: theme.colors.textPrimary,
    },
    headerSubtitle: {
        color: theme.colors.textSecondary,
        marginTop: 4,
        fontSize: theme.typography.caption,
        fontStyle: 'italic',
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

    /* ── Glassmorphism Command Center ── */
    commandRow: {
        flexDirection: 'row',
        gap: 10,
        marginBottom: 14,
    },
    commandCardMain: {
        flex: 1,
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radius.lg,
        borderWidth: 1,
        borderColor: 'rgba(34, 211, 238, 0.3)',
        paddingVertical: 14,
        paddingHorizontal: 14,
        position: 'relative',
        overflow: 'hidden',
    },
    commandCardMini: {
        flex: 1,
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radius.lg,
        borderWidth: 1,
        borderColor: 'rgba(245, 158, 11, 0.3)',
        paddingVertical: 14,
        paddingHorizontal: 14,
        position: 'relative',
        overflow: 'hidden',
    },
    commandTopRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 10,
    },
    commandIconMain: {
        width: 36,
        height: 36,
        borderRadius: theme.radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(34, 211, 238, 0.12)',
    },
    commandIconMini: {
        width: 36,
        height: 36,
        borderRadius: theme.radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(251, 191, 36, 0.14)',
    },
    countMain: {
        fontSize: 20,
        fontWeight: '800',
        color: theme.colors.cyan[400],
    },
    countMini: {
        fontSize: 20,
        fontWeight: '800',
        color: theme.colors.amber[500],
    },
    commandTitle: {
        color: theme.colors.textPrimary,
        fontWeight: '700',
        fontSize: 15,
        marginBottom: 2,
    },
    commandHint: {
        color: theme.colors.textMuted,
        fontSize: 11,
    },
    commandCta: {
        position: 'absolute',
        bottom: 12,
        right: 12,
        width: 28,
        height: 28,
        borderRadius: theme.radius.pill,
        backgroundColor: theme.colors.indigo[600],
        alignItems: 'center',
        justifyContent: 'center',
        ...theme.shadow.glow,
    },
    commandCtaMini: {
        position: 'absolute',
        bottom: 12,
        right: 12,
        width: 28,
        height: 28,
        borderRadius: theme.radius.pill,
        backgroundColor: 'rgba(245, 158, 11, 0.15)',
        borderWidth: 1,
        borderColor: 'rgba(245, 158, 11, 0.3)',
        alignItems: 'center',
        justifyContent: 'center',
    },

    /* ── Tabs ── */
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
        paddingBottom: 40,
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
});
