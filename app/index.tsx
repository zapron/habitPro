import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StatusBar, Animated } from 'react-native';
import { useRouter } from 'expo-router';
import { FlashList } from '@shopify/flash-list';
import { Trophy, Bolt, Target, Plus, ChevronRight, Sun, Moon, Sunrise, Sunset, Settings, Zap } from 'lucide-react-native';
import { useHabitStore } from '../src/store/habitStore';
import { Button } from '../src/components/Button';
import { HabitCard } from '../src/components/HabitCard';
import { Screen } from '../src/components/Screen';
import { useTheme } from '../src/context/ThemeContext';
import { AnimatedFire } from '../src/components/AnimatedFire';
import { SettingsModal } from '../src/components/SettingsModal';

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
    const { theme, isDark } = useTheme();
    const [settingsOpen, setSettingsOpen] = useState(false);
    const habits = useHabitStore((state) => state.habits);
    const miniMissions = useHabitStore((state) => state.miniMissions);
    const xp = useHabitStore((state) => state.xp);
    const [activeTab, setActiveTab] = useState<'active' | 'completed'>('active');

    const level = Math.floor(xp / 100);
    const xpInLevel = xp % 100;
    const xpProgress = xpInLevel / 100;

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
        const dayIndex = new Date().getDate() % MOTIVATIONAL_LINES.length;
        return MOTIVATIONAL_LINES[dayIndex];
    }, []);

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
            <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={theme.colors.background} />

            <Animated.View
                style={[styles.header, { opacity: headerOpacity, transform: [{ translateY: headerSlide }] }]}
            >
                <View>
                    <View style={styles.eyebrowRow}>
                        <Text style={[styles.headerEyebrow, { color: theme.colors.cyan[400] }]}>MISSION CONTROL</Text>
                        <Text style={[styles.eyebrowDot, { color: theme.colors.textMuted }]}>•</Text>
                        <TouchableOpacity onPress={() => setSettingsOpen(true)} activeOpacity={0.7} style={styles.gearButton}>
                            <Settings size={12} color={theme.colors.textMuted} />
                            <Text style={[styles.gearLabel, { color: theme.colors.textMuted }]}>Settings</Text>
                        </TouchableOpacity>
                    </View>
                    <Text style={[styles.headerTitle, { color: theme.colors.textPrimary }]}>
                        {greeting.text} {greeting.emoji}
                    </Text>
                    <Text style={[styles.headerSubtitle, { color: theme.colors.textSecondary }]}>{motivation}</Text>
                </View>
                <View style={[styles.headerBadge, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
                    <Text style={[styles.levelNumber, { color: theme.colors.yellow[400] }]}>{level}</Text>
                    <Text style={[styles.levelLabel, { color: theme.colors.textMuted }]}>LVL</Text>
                </View>
            </Animated.View>

            {/* XP Progress Bar */}
            <View style={[styles.xpBar, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderRadius: theme.radius.md }]}>
                <View style={styles.xpInfo}>
                    <View style={styles.xpLeft}>
                        <Zap size={12} color={theme.colors.yellow[400]} fill={theme.colors.yellow[400]} />
                        <Text style={[styles.xpLabel, { color: theme.colors.textSecondary }]}>
                            Level {level}
                        </Text>
                    </View>
                    <Text style={[styles.xpValue, { color: theme.colors.textMuted }]}>
                        {xpInLevel} / 100 XP
                    </Text>
                </View>
                <View style={[styles.xpTrack, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }]}>
                    <View
                        style={[
                            styles.xpFill,
                            {
                                width: `${Math.max(xpProgress * 100, 2)}%`,
                                backgroundColor: theme.colors.yellow[400],
                            },
                        ]}
                    />
                </View>
            </View>

            <View style={styles.commandRow}>
                <TouchableOpacity
                    style={[styles.commandCard, { backgroundColor: theme.colors.surface, borderColor: isDark ? 'rgba(34, 211, 238, 0.3)' : 'rgba(6, 182, 212, 0.25)' }]}
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
                            <Text style={[styles.countMain, { color: theme.colors.cyan[400] }]}>{stats.activeCount}</Text>
                        )}
                    </View>
                    <Text style={[styles.commandTitle, { color: theme.colors.textPrimary }]}>New Mission</Text>
                    <Text style={[styles.commandHint, { color: theme.colors.textMuted }]}>21-day or custom</Text>
                    <View style={[styles.commandCta, { backgroundColor: theme.colors.indigo[600], ...theme.shadow.glow }]}>
                        <Plus size={14} color="#fff" strokeWidth={3} />
                    </View>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.commandCard, { backgroundColor: theme.colors.surface, borderColor: isDark ? 'rgba(245, 158, 11, 0.3)' : 'rgba(217, 119, 6, 0.25)' }]}
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
                            <Text style={[styles.countMini, { color: theme.colors.amber[500] }]}>{miniCount}</Text>
                        )}
                    </View>
                    <Text style={[styles.commandTitle, { color: theme.colors.textPrimary }]}>Mini Missions</Text>
                    <Text style={[styles.commandHint, { color: theme.colors.textMuted }]}>
                        {miniMissionStats.running > 0 ? 'running now' : 'queued'}
                    </Text>
                    <View style={[styles.commandCtaMini, { borderColor: isDark ? 'rgba(245, 158, 11, 0.3)' : 'rgba(217, 119, 6, 0.25)' }]}>
                        <ChevronRight size={14} color={theme.colors.amber[500]} strokeWidth={3} />
                    </View>
                </TouchableOpacity>
            </View>

            <View style={[styles.tabContainer, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
                <TouchableOpacity
                    style={[styles.tab, activeTab === 'active' && [styles.activeTab, { backgroundColor: theme.colors.indigo[600], ...theme.shadow.glow }]]}
                    onPress={() => setActiveTab('active')}
                    activeOpacity={0.8}
                >
                    <Text style={[styles.tabText, { color: theme.colors.textSecondary }, activeTab === 'active' && styles.activeTabText]}>
                        Active{stats.activeCount > 0 ? ` (${stats.activeCount})` : ''}
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.tab, activeTab === 'completed' && [styles.activeTab, { backgroundColor: theme.colors.indigo[600], ...theme.shadow.glow }]]}
                    onPress={() => setActiveTab('completed')}
                    activeOpacity={0.8}
                >
                    <Text style={[styles.tabText, { color: theme.colors.textSecondary }, activeTab === 'completed' && styles.activeTabText]}>
                        Completed{stats.completedCount > 0 ? ` (${stats.completedCount})` : ''}
                    </Text>
                </TouchableOpacity>
            </View>

            <View style={styles.listWrap}>
                {filteredHabits.length === 0 ? (
                    <View style={styles.emptyState}>
                        <View style={[styles.emptyIconContainer, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
                            <Trophy size={50} color={theme.colors.slate[500]} />
                        </View>
                        <Text style={[styles.emptyTitle, { color: theme.colors.textPrimary, fontSize: theme.typography.h3 }]}>
                            {activeTab === 'active' ? 'No active missions' : 'No completed missions yet'}
                        </Text>
                        <Text style={[styles.emptyDescription, { color: theme.colors.textSecondary }]}>
                            {activeTab === 'active'
                                ? 'Start your first mission and keep momentum daily.'
                                : 'Complete your first mission to unlock this section.'}
                        </Text>
                        {activeTab === 'active' && (
                            <Button title='Start a Mission' onPress={() => router.push('/create')} style={styles.emptyButton} />
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
            <SettingsModal visible={settingsOpen} onClose={() => setSettingsOpen(false)} />
        </Screen>
    );
}

const styles = StyleSheet.create({
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
    headerEyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 1.3 },
    headerTitle: { fontSize: 22, fontWeight: '800' },
    headerSubtitle: { marginTop: 4, fontSize: 13, fontStyle: 'italic' },
    headerBadge: { width: 46, height: 46, borderRadius: 9999, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
    levelNumber: { fontSize: 18, fontWeight: '800', lineHeight: 20 },
    levelLabel: { fontSize: 8, fontWeight: '800', letterSpacing: 1 },
    eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
    eyebrowDot: { fontSize: 8, opacity: 0.5 },
    gearButton: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 8, borderRadius: 9999, borderWidth: 1, borderColor: 'rgba(148, 163, 184, 0.25)', backgroundColor: 'rgba(148, 163, 184, 0.1)' },
    gearLabel: { fontSize: 10, fontWeight: '700' },
    commandRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
    commandCard: { flex: 1, borderRadius: 20, paddingVertical: 14, paddingHorizontal: 14, position: 'relative', overflow: 'hidden', borderWidth: 1 },
    commandTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
    commandIconMain: { width: 36, height: 36, borderRadius: 9999, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(34, 211, 238, 0.12)' },
    commandIconMini: { width: 36, height: 36, borderRadius: 9999, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(251, 191, 36, 0.14)' },
    countMain: { fontSize: 20, fontWeight: '800' },
    countMini: { fontSize: 20, fontWeight: '800' },
    commandTitle: { fontWeight: '700', fontSize: 15, marginBottom: 2 },
    commandHint: { fontSize: 11 },
    commandCta: { position: 'absolute', bottom: 12, right: 12, width: 28, height: 28, borderRadius: 9999, alignItems: 'center', justifyContent: 'center' },
    commandCtaMini: { position: 'absolute', bottom: 12, right: 12, width: 28, height: 28, borderRadius: 9999, backgroundColor: 'rgba(245, 158, 11, 0.15)', borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    tabContainer: { flexDirection: 'row', borderRadius: 14, padding: 4, marginBottom: 14, borderWidth: 1 },
    tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10 },
    activeTab: {},
    tabText: { fontWeight: '700' },
    activeTabText: { color: '#ffffff' },
    listWrap: { flex: 1 },
    listContent: { paddingBottom: 40 },
    emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    emptyIconContainer: { width: 94, height: 94, borderRadius: 9999, alignItems: 'center', justifyContent: 'center', borderWidth: 1, marginBottom: 16 },
    emptyTitle: { fontWeight: '700', marginBottom: 8 },
    emptyDescription: { textAlign: 'center', marginBottom: 20, paddingHorizontal: 24 },
    emptyButton: { width: '100%' },
    xpBar: { paddingHorizontal: 14, paddingVertical: 10, marginBottom: 14, borderWidth: 1 },
    xpInfo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
    xpLeft: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    xpLabel: { fontSize: 12, fontWeight: '700' },
    xpValue: { fontSize: 11, fontWeight: '600' },
    xpTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
    xpFill: { height: '100%', borderRadius: 3 },
});
