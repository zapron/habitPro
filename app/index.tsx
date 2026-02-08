import { View, Text, FlatList, TouchableOpacity, StyleSheet, StatusBar } from "react-native";
import { Link, useRouter } from "expo-router";
import { useHabitStore } from "../src/store/habitStore";
import { Button } from "../src/components/Button";
import { Plus, Trophy, Flame } from "lucide-react-native";
import { Habit } from "../src/types/habit";
import { theme } from "../src/styles/theme";

export default function Home() {
    const router = useRouter();
    const habits = useHabitStore((state) => state.habits);

    const renderItem = ({ item }: { item: Habit }) => (
        <TouchableOpacity
            style={styles.card}
            activeOpacity={0.9}
            onPress={() => router.push(`/habit/${item.id}`)}
        >
            <View style={styles.cardContent}>
                <Text style={styles.cardTitle}>{item.title}</Text>
                {item.description ? (
                    <Text style={styles.cardDescription} numberOfLines={1}>
                        {item.description}
                    </Text>
                ) : null}
                <View style={styles.cardStats}>
                    <Flame size={16} color={theme.colors.amber[500]} style={{ marginRight: 4 }} />
                    <Text style={styles.cardStreak}>{item.streak} days</Text>

                    <Text style={styles.cardProgress}>
                        {Math.round((item.completedDates.length / item.totalDays) * 100)}% Complete
                    </Text>
                </View>
            </View>
            <View style={styles.progressCircle}>
                <Text style={styles.progressText}>
                    {item.completedDates.length}
                </Text>
            </View>
        </TouchableOpacity>
    );

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor={theme.colors.slate[900]} />
            <View style={styles.header}>
                <View>
                    <Text style={styles.headerTitle}>HabitPro</Text>
                    <Text style={styles.headerSubtitle}>Your Daily Missions</Text>
                </View>
                <TouchableOpacity style={styles.trophyButton}>
                    <Trophy size={24} color={theme.colors.yellow[400]} />
                </TouchableOpacity>
            </View>

            {habits.length === 0 ? (
                <View style={styles.emptyState}>
                    <View style={styles.emptyIconContainer}>
                        <Trophy size={64} color={theme.colors.slate[600]} />
                    </View>
                    <Text style={styles.emptyTitle}>No active missions</Text>
                    <Text style={styles.emptyDescription}>
                        Start a 21-day challenge to transform your life.
                    </Text>
                    <Button
                        title="Start New Challenge"
                        onPress={() => router.push("/create")}
                        style={styles.fullWidthButton}
                    />
                </View>
            ) : (
                <>
                    <FlatList
                        data={habits}
                        keyExtractor={(item) => item.id}
                        renderItem={renderItem}
                        contentContainerStyle={styles.listContent}
                        showsVerticalScrollIndicator={false}
                    />
                    <View style={styles.fabContainer}>
                        <Button
                            title="New Mission"
                            onPress={() => router.push("/create")}
                            style={styles.fabButton}
                        />
                    </View>
                </>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: theme.colors.slate[900],
        paddingTop: 48,
        paddingHorizontal: 24,
    },
    header: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 32,
    },
    headerTitle: {
        fontSize: 30,
        fontWeight: "bold",
        color: theme.colors.white,
    },
    headerSubtitle: {
        color: theme.colors.slate[400],
        marginTop: 4,
    },
    trophyButton: {
        backgroundColor: theme.colors.slate[800],
        padding: 12,
        borderRadius: 9999,
        borderWidth: 1,
        borderColor: theme.colors.slate[700],
    },
    emptyState: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
    },
    emptyIconContainer: {
        backgroundColor: theme.colors.slate[800],
        padding: 24,
        borderRadius: 9999,
        marginBottom: 24,
    },
    emptyTitle: {
        fontSize: 20,
        fontWeight: "bold",
        color: theme.colors.white,
        marginBottom: 8,
    },
    emptyDescription: {
        color: theme.colors.slate[400],
        textAlign: "center",
        marginBottom: 32,
        paddingHorizontal: 32,
    },
    fullWidthButton: {
        width: "100%",
    },
    listContent: {
        paddingBottom: 100,
    },
    card: {
        backgroundColor: theme.colors.slate[800],
        padding: 20,
        borderRadius: 16,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: theme.colors.slate[700],
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
    },
    cardContent: {
        flex: 1,
    },
    cardTitle: {
        fontSize: 20,
        fontWeight: "bold",
        color: theme.colors.white,
        marginBottom: 4,
    },
    cardDescription: {
        color: theme.colors.slate[400],
        fontSize: 14,
    },
    cardStats: {
        flexDirection: "row",
        alignItems: "center",
        marginTop: 12,
    },
    cardStreak: {
        color: theme.colors.amber[500],
        fontWeight: "bold",
        marginRight: 16,
    },
    cardProgress: {
        color: theme.colors.slate[500],
    },
    progressCircle: {
        height: 48,
        width: 48,
        borderRadius: 24,
        backgroundColor: theme.colors.slate[700],
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: theme.colors.slate[600],
    },
    progressText: {
        color: theme.colors.white,
        fontWeight: "bold",
        fontSize: 18,
    },
    fabContainer: {
        position: "absolute",
        bottom: 32,
        right: 24,
        left: 24,
    },
    fabButton: {
        shadowColor: theme.colors.indigo[500],
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.3,
        shadowRadius: 20,
        elevation: 10,
    },
});
