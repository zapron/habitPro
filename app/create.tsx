import { useState } from "react";
import { View, Text, TextInput, Alert, ScrollView, StyleSheet, TouchableOpacity, StatusBar } from "react-native";
import { useRouter } from "expo-router";
import { useHabitStore } from "../src/store/habitStore";
import { Button } from "../src/components/Button";
import { ArrowLeft } from "lucide-react-native";
import { theme } from "../src/styles/theme";

export default function CreateHabit() {
    const router = useRouter();
    const addHabit = useHabitStore((state) => state.addHabit);
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [focusedInput, setFocusedInput] = useState<"title" | "description" | null>(null);

    const handleCreate = () => {
        if (!title.trim()) {
            Alert.alert("Error", "Please enter a habit name");
            return;
        }

        addHabit(title, description);
        router.back();
    };

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor={theme.colors.slate[900]} />
            <View style={styles.header}>
                <TouchableOpacity
                    style={styles.backButton}
                    onPress={() => router.back()}
                >
                    <ArrowLeft size={20} color="white" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>New Mission</Text>
            </View>

            <ScrollView style={styles.scrollView}>
                <Text style={styles.label}>What habit do you want to build?</Text>
                <TextInput
                    style={[
                        styles.input,
                        focusedInput === "title" && styles.inputFocused
                    ]}
                    placeholder="e.g., Read 30 mins, Drink Water"
                    placeholderTextColor={theme.colors.slate[500]}
                    value={title}
                    onChangeText={setTitle}
                    autoFocus
                    onFocus={() => setFocusedInput("title")}
                    onBlur={() => setFocusedInput(null)}
                />

                <Text style={styles.label}>Why is this important? (Optional)</Text>
                <TextInput
                    style={[
                        styles.input,
                        styles.textArea,
                        focusedInput === "description" && styles.inputFocused
                    ]}
                    placeholder="Your motivation..."
                    placeholderTextColor={theme.colors.slate[500]}
                    value={description}
                    onChangeText={setDescription}
                    multiline
                    textAlignVertical="top"
                    onFocus={() => setFocusedInput("description")}
                    onBlur={() => setFocusedInput(null)}
                />

                <Button title="Start 21-Day Challenge" onPress={handleCreate} />

                <Text style={styles.quote}>
                    "Success is the sum of small efforts, repeated day in and day out."
                </Text>
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
    header: {
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 32,
    },
    backButton: {
        padding: 8,
        borderRadius: 9999,
        backgroundColor: theme.colors.slate[700],
        marginRight: 16,
        height: 40,
        width: 40,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: theme.colors.slate[600],
    },
    headerTitle: {
        fontSize: 24,
        fontWeight: "bold",
        color: theme.colors.white,
    },
    scrollView: {
        flex: 1,
    },
    label: {
        color: theme.colors.slate[400],
        marginBottom: 8,
        fontWeight: "500",
        fontSize: 16,
    },
    input: {
        backgroundColor: theme.colors.slate[800],
        color: theme.colors.white,
        padding: 16,
        borderRadius: 12,
        fontSize: 18,
        borderWidth: 1,
        borderColor: theme.colors.slate[700],
        marginBottom: 24,
    },
    textArea: {
        height: 128,
    },
    inputFocused: {
        borderColor: theme.colors.indigo[500],
    },
    quote: {
        color: theme.colors.slate[500],
        textAlign: "center",
        marginTop: 24,
        fontSize: 14,
        fontStyle: "italic",
    },
});
