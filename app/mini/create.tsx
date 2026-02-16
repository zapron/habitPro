import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  StatusBar,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { ArrowLeft, Zap } from "lucide-react-native";
import { Screen } from "../../src/components/Screen";
import { Button } from "../../src/components/Button";
import { useHabitStore } from "../../src/store/habitStore";
import { theme } from "../../src/styles/theme";

type StartMode = "now" | "later";

export default function CreateMiniMission() {
  const router = useRouter();
  const addMiniMission = useHabitStore((state) => state.addMiniMission);

  const [title, setTitle] = useState("");
  const [objective, setObjective] = useState("");
  const [estimatedMinutes, setEstimatedMinutes] = useState("15");
  const [startMode, setStartMode] = useState<StartMode>("now");
  const [focused, setFocused] = useState<"title" | "objective" | "minutes" | null>(null);

  const handleCreate = () => {
    if (!title.trim()) {
      Alert.alert("Error", "Please enter the mini mission.");
      return;
    }
    const minutes = Number.parseInt(estimatedMinutes, 10);
    if (Number.isNaN(minutes) || minutes <= 0) {
      Alert.alert("Error", "Please enter a valid estimated time in minutes.");
      return;
    }

    const id = addMiniMission({
      title: title.trim(),
      objective: objective.trim(),
      estimatedMinutes: minutes,
      startMode,
    });

    if (startMode === "now") {
      router.replace(`/mini/${id}`);
      return;
    }
    router.replace("/mini");
  };

  return (
    <Screen>
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.background} />
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <ArrowLeft size={20} color={theme.colors.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>New Mini Mission</Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.heroCard}>
          <View style={styles.heroIconWrap}>
            <Zap size={18} color={theme.colors.yellow[400]} />
          </View>
          <Text style={styles.heroTitle}>Take Action In Small Time Blocks</Text>
          <Text style={styles.heroText}>
            Define the mission, state the objective, and commit to a time estimate.
          </Text>
        </View>

        <Text style={styles.label}>Mission</Text>
        <TextInput
          style={[styles.input, focused === "title" && styles.inputFocused]}
          placeholder="e.g., Take bath now"
          placeholderTextColor={theme.colors.textMuted}
          value={title}
          onChangeText={setTitle}
          onFocus={() => setFocused("title")}
          onBlur={() => setFocused(null)}
          autoFocus
        />

        <Text style={styles.label}>Objective (Optional)</Text>
        <TextInput
          style={[styles.input, styles.textArea, focused === "objective" && styles.inputFocused]}
          placeholder="What does done look like?"
          placeholderTextColor={theme.colors.textMuted}
          value={objective}
          onChangeText={setObjective}
          onFocus={() => setFocused("objective")}
          onBlur={() => setFocused(null)}
          multiline
          textAlignVertical="top"
        />

        <Text style={styles.label}>Estimated Time (Minutes)</Text>
        <TextInput
          style={[styles.input, focused === "minutes" && styles.inputFocused]}
          placeholder="15"
          placeholderTextColor={theme.colors.textMuted}
          value={estimatedMinutes}
          onChangeText={setEstimatedMinutes}
          onFocus={() => setFocused("minutes")}
          onBlur={() => setFocused(null)}
          keyboardType="number-pad"
        />

        <Text style={styles.label}>Start</Text>
        <View style={styles.startModeRow}>
          <TouchableOpacity
            style={[styles.modeButton, startMode === "now" && styles.modeButtonActive]}
            onPress={() => setStartMode("now")}
            activeOpacity={0.85}
          >
            <Text style={[styles.modeText, startMode === "now" && styles.modeTextActive]}>
              Let's Go Now
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeButton, startMode === "later" && styles.modeButtonActive]}
            onPress={() => setStartMode("later")}
            activeOpacity={0.85}
          >
            <Text style={[styles.modeText, startMode === "later" && styles.modeTextActive]}>
              Start Later
            </Text>
          </TouchableOpacity>
        </View>

        <Button title="Create Mini Mission" onPress={handleCreate} style={styles.cta} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: 24,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 22,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginRight: 12,
  },
  headerTitle: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.h2,
    fontWeight: "800",
  },
  heroCard: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    padding: 16,
    marginBottom: 20,
    ...theme.shadow.card,
  },
  heroIconWrap: {
    width: 34,
    height: 34,
    borderRadius: theme.radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(251, 191, 36, 0.18)",
    marginBottom: 10,
  },
  heroTitle: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.h3,
    fontWeight: "700",
    marginBottom: 6,
  },
  heroText: {
    color: theme.colors.textSecondary,
    lineHeight: 20,
  },
  label: {
    color: theme.colors.textSecondary,
    marginBottom: 8,
    fontSize: theme.typography.caption,
    fontWeight: "600",
  },
  input: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    padding: 14,
    color: theme.colors.textPrimary,
    fontSize: 16,
    marginBottom: 16,
  },
  inputFocused: {
    borderColor: theme.colors.indigo[500],
  },
  textArea: {
    height: 110,
  },
  startModeRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 20,
  },
  modeButton: {
    flex: 1,
    height: 46,
    borderRadius: theme.radius.md,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  modeButtonActive: {
    borderColor: theme.colors.indigo[500],
    backgroundColor: theme.colors.surfaceElevated,
  },
  modeText: {
    color: theme.colors.textSecondary,
    fontWeight: "700",
  },
  modeTextActive: {
    color: theme.colors.textPrimary,
  },
  cta: {
    marginBottom: 20,
  },
});
