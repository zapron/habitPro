import { View, Text, ScrollView, TouchableOpacity, Alert, StyleSheet, StatusBar } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useHabitStore } from "../../src/store/habitStore";
import { ArrowLeft, Trash2, Check, Lock } from "lucide-react-native";
import { Button } from "../../src/components/Button";
import { theme } from "../../src/styles/theme";

export default function HabitDetail() {
    const { id } = useLocalSearchParams();
    const router = useRouter();
    // @ts-ignore
    const habit = useHabitStore((state) => state.getHabit(id));
    const toggleCompletion = useHabitStore((state) => state.toggleCompletion);
    const deleteHabit = useHabitStore((state) => state.deleteHabit);

    if (!habit) {
        return (
            <View style={styles.notFoundContainer}>
                <Text style={styles.notFoundText}>Habit not found</Text>
                <Button title="Go Back" onPress={() => router.back()} style={styles.notFoundButton} />
            </View>
        );
    }

    const handleDelete = () => {
        Alert.alert("Delete Habit", "Are you sure you want to give up on this mission?", [
            { text: "Cancel", style: "cancel" },
            {
                text: "Delete",
                style: "destructive",
                onPress: () => {
                    deleteHabit(habit.id);
                    router.back();
                },
            },
        ]);
    };

    const days = Array.from({ length: 21 }, (_, i) => i + 1);

    const getDayDate = (dayIndex: number) => {
        const start = new Date(habit.startDate);
        start.setDate(start.getDate() + dayIndex);
        return start.toISOString().split('T')[0]; // YYYY-MM-DD
    };

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor={theme.colors.slate[900]} />
            <View style={styles.header}>
                <TouchableOpacity
                    style={styles.backButton}
                    onPress={() => router.back()}
                >
                    <ArrowLeft size={24} color="white" />
                </TouchableOpacity>
                <View style={{ flexDirection: "row" }}>
                    <TouchableOpacity
                        style={styles.deleteButton}
                        onPress={handleDelete}
                    >
                        <Trash2 size={24} color={theme.colors.red[500]} />
                    </TouchableOpacity>
                </View>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={styles.title}>{habit.title}</Text>
                <Text style={styles.description}>{habit.description || "No description"}</Text>

                <View style={styles.progressCard}>
                    <View style={styles.progressHeader}>
                        <Text style={styles.progressLabel}>Progress</Text>
                        <Text style={styles.progressValue}>
                            {habit.completedDates.length} <Text style={styles.progressTotal}>/ 21 Days</Text>
                        </Text>
                    </View>
                    <View style={styles.progressBarBackground}>
                        <View
                            style={[
                                styles.progressBarFill,
                                { width: `${(habit.completedDates.length / 21) * 100}%` }
                            ]}
                        />
                    </View>
                </View>

                <Text style={styles.gridTitle}>The 21-Day Journey</Text>

                <View style={styles.grid}>
                    {days.map((day, index) => {
                        const dateStr = getDayDate(index);
                        const isCompleted = habit.completedDates.includes(dateStr);
                        const isToday = dateStr === new Date().toISOString().split('T')[0];

                        // Conditional styles
                        const dayButtonStyle = [
                            styles.dayButton,
                            isCompleted ? styles.dayButtonCompleted : styles.dayButtonIncomplete,
                            isToday && !isCompleted ? styles.dayButtonToday : null
                        ];

                        return (
                            <TouchableOpacity
                                key={day}
                                onPress={() => toggleCompletion(habit.id, dateStr)}
                                style={dayButtonStyle}
                                activeOpacity={0.8}
                            >
                                {isCompleted ? (
                                    <Check size={20} color="white" strokeWidth={3} />
                                ) : (
                                    <Text style={[
                                        styles.dayText,
                                        isToday ? styles.dayTextToday : styles.dayTextDefault
                                    ]}>
                                        {day}
                                    </Text>
                                )}
                            </TouchableOpacity>
                        );
                    })}
                </View>
            </ScrollView>
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
    notFoundContainer: {
        flex: 1,
        backgroundColor: theme.colors.slate[900],
        alignItems: "center",
        justifyContent: "center",
    },
    notFoundText: {
        color: theme.colors.white,
        fontSize: 18,
    },
    notFoundButton: {
        marginTop: 16,
    },
    header: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 32,
    },
    backButton: {
        padding: 8,
        borderRadius: 9999,
        backgroundColor: theme.colors.slate[800],
    },
    deleteButton: {
        padding: 8,
        borderRadius: 9999,
        backgroundColor: 'rgba(239, 68, 68, 0.1)', // red-500 with opacity
    },
    title: {
        fontSize: 30,
        fontWeight: "bold",
        color: theme.colors.white,
        marginBottom: 8,
    },
    description: {
        color: theme.colors.slate[400],
        marginBottom: 32,
        fontSize: 16,
    },
    progressCard: {
        backgroundColor: theme.colors.slate[800],
        padding: 24,
        borderRadius: 24,
        marginBottom: 32,
        borderWidth: 1,
        borderColor: theme.colors.slate[700],
    },
    progressHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "flex-end",
        marginBottom: 16,
    },
    progressLabel: {
        color: theme.colors.slate[400],
        fontWeight: "bold",
        textTransform: "uppercase",
        letterSpacing: 1,
        fontSize: 12,
    },
    progressValue: {
        fontSize: 24,
        fontWeight: "bold",
        color: theme.colors.indigo[400],
    },
    progressTotal: {
        fontSize: 16,
        color: theme.colors.slate[500],
    },
    progressBarBackground: {
        height: 12,
        backgroundColor: theme.colors.slate[700],
        borderRadius: 9999,
        overflow: "hidden",
    },
    progressBarFill: {
        height: "100%",
        backgroundColor: theme.colors.indigo[500],
        borderRadius: 9999,
    },
    gridTitle: {
        fontSize: 20,
        fontWeight: "bold",
        color: theme.colors.white,
        marginBottom: 16,
    },
    grid: {
        flexDirection: "row",
        flexWrap: "wrap",
        justifyContent: "space-between",
    },
    dayButton: {
        width: "13%",
        aspectRatio: 1,
        borderRadius: 12,
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 16,
    },
    dayButtonCompleted: {
        backgroundColor: theme.colors.indigo[600],
        shadowColor: theme.colors.indigo[500],
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4,
    },
    dayButtonIncomplete: {
        backgroundColor: theme.colors.slate[800],
        borderWidth: 1,
        borderColor: theme.colors.slate[700],
    },
    dayButtonToday: {
        borderColor: theme.colors.indigo[400],
        borderWidth: 2,
    },
    dayText: {
        fontWeight: "bold",
        fontSize: 18,
    },
    dayTextToday: {
        color: theme.colors.indigo[400],
    },
    dayTextDefault: {
        color: theme.colors.slate[500],
    },
});
