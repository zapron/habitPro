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
import { ArrowLeft, Zap, Minus, Plus } from "lucide-react-native";
import { Screen } from "../../src/components/Screen";
import { Button } from "../../src/components/Button";
import { useHabitStore } from "../../src/store/habitStore";
import { useTheme } from "../../src/context/ThemeContext";
type StartMode = "now" | "later";

const MIN_FUEL_MINUTES = 1;
const MAX_FUEL_MINUTES = 480; // 8 hours of “fuel” for the mission

function clampTotal(minutes: number): number {
  return Math.max(MIN_FUEL_MINUTES, Math.min(MAX_FUEL_MINUTES, Math.round(minutes)));
}

export default function CreateMiniMission() {
  const router = useRouter();
  const { theme, isDark } = useTheme();
  const addMiniMission = useHabitStore((state) => state.addMiniMission);

  const [title, setTitle] = useState("");
  const [objective, setObjective] = useState("");
  const [totalMinutes, setTotalMinutes] = useState(15);
  const [startMode, setStartMode] = useState<StartMode>("now");
  const [focused, setFocused] = useState<"title" | "objective" | null>(null);

  const displayHours = Math.floor(totalMinutes / 60);
  const displayMins = totalMinutes % 60;

  const setTotal = (next: number) => setTotalMinutes(clampTotal(next));

  const handleCreate = () => {
    if (!title.trim()) {
      Alert.alert("Error", "Please enter the mini mission.");
      return;
    }
    const minutes = clampTotal(totalMinutes);
    if (minutes < MIN_FUEL_MINUTES) {
      Alert.alert("Error", "Carry at least one minute of fuel for this mission.");
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
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={theme.colors.background} />
      <View style={styles.header}>
        <TouchableOpacity style={[styles.backButton, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]} onPress={() => router.back()}>
          <ArrowLeft size={20} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.colors.textPrimary, fontSize: theme.typography.h2 }]}>New Mini Mission</Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.scrollContent}
      >
        <View style={[styles.heroCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderRadius: theme.radius.lg, ...theme.shadow.card }]}>
          <View style={styles.heroIconWrap}>
            <Zap size={18} color={theme.colors.yellow[400]} />
          </View>
          <Text style={[styles.heroTitle, { color: theme.colors.textPrimary, fontSize: theme.typography.h3 }]}>A mission needs fuel</Text>
          <Text style={[styles.heroText, { color: theme.colors.textSecondary }]}>
            Time is the fuel you carry—set duration, then launch when you are ready. You can choose whether to publish to Community when you complete.
          </Text>
        </View>

        <Text style={[styles.label, { color: theme.colors.textSecondary, fontSize: theme.typography.caption }]}>Mission</Text>
        <TextInput
          style={[styles.input, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, color: theme.colors.textPrimary, borderRadius: theme.radius.md }, focused === "title" && { borderColor: theme.colors.indigo[500] }]}
          placeholder="e.g., Take bath now"
          placeholderTextColor={theme.colors.textMuted}
          value={title}
          onChangeText={setTitle}
          onFocus={() => setFocused("title")}
          onBlur={() => setFocused(null)}
          autoFocus
        />

        <Text style={[styles.label, { color: theme.colors.textSecondary, fontSize: theme.typography.caption }]}>Objective (Optional)</Text>
        <TextInput
          style={[styles.input, styles.textArea, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, color: theme.colors.textPrimary, borderRadius: theme.radius.md }, focused === "objective" && { borderColor: theme.colors.indigo[500] }]}
          placeholder="What does done look like?"
          placeholderTextColor={theme.colors.textMuted}
          value={objective}
          onChangeText={setObjective}
          onFocus={() => setFocused("objective")}
          onBlur={() => setFocused(null)}
          multiline
          textAlignVertical="top"
        />

        <Text style={[styles.label, { color: theme.colors.textSecondary, fontSize: theme.typography.caption }]}>How much fuel to carry</Text>
        <View style={[styles.durationCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderRadius: theme.radius.md }]}>
          <View style={styles.durationRow}>
            <Text style={[styles.durationBlockLabel, { color: theme.colors.textMuted }]}>Hours</Text>
            <View style={styles.stepper}>
              <TouchableOpacity
                style={[styles.stepBtn, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceElevated }]}
                onPress={() => setTotal(totalMinutes - 60)}
                disabled={totalMinutes <= MIN_FUEL_MINUTES}
                activeOpacity={0.75}
              >
                <Minus size={18} color={theme.colors.textPrimary} />
              </TouchableOpacity>
              <Text style={[styles.stepValue, { color: theme.colors.textPrimary }]}>{displayHours}</Text>
              <TouchableOpacity
                style={[styles.stepBtn, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceElevated }]}
                onPress={() => setTotal(totalMinutes + 60)}
                disabled={totalMinutes > MAX_FUEL_MINUTES - 60}
                activeOpacity={0.75}
              >
                <Plus size={18} color={theme.colors.textPrimary} />
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.durationRow}>
            <Text style={[styles.durationBlockLabel, { color: theme.colors.textMuted }]}>Minutes</Text>
            <View style={styles.stepper}>
              <TouchableOpacity
                style={[styles.stepBtn, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceElevated }]}
                onPress={() => setTotal(totalMinutes - 1)}
                disabled={totalMinutes <= MIN_FUEL_MINUTES}
                activeOpacity={0.75}
              >
                <Minus size={18} color={theme.colors.textPrimary} />
              </TouchableOpacity>
              <Text style={[styles.stepValue, { color: theme.colors.textPrimary }]}>{displayMins}</Text>
              <TouchableOpacity
                style={[styles.stepBtn, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceElevated }]}
                onPress={() => setTotal(totalMinutes + 1)}
                disabled={totalMinutes >= MAX_FUEL_MINUTES}
                activeOpacity={0.75}
              >
                <Plus size={18} color={theme.colors.textPrimary} />
              </TouchableOpacity>
            </View>
          </View>
          <Text style={[styles.totalLine, { color: theme.colors.textSecondary }]}>
            Fuel packed: <Text style={{ fontWeight: "800", color: theme.colors.textPrimary }}>{totalMinutes}</Text> min
            {displayHours > 0 ? ` (${displayHours}h ${displayMins}m)` : ""}
          </Text>
          <Text style={[styles.durationCap, { color: theme.colors.textMuted }]}>You can carry 1 min to 8 hours of fuel</Text>
        </View>

        <Text style={[styles.label, { color: theme.colors.textSecondary, fontSize: theme.typography.caption }]}>Start</Text>
        <View style={styles.startModeRow}>
          <TouchableOpacity
            style={[styles.modeButton, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface, borderRadius: theme.radius.md }, startMode === "now" && { borderColor: theme.colors.indigo[500], backgroundColor: theme.colors.surfaceElevated }]}
            onPress={() => setStartMode("now")}
            activeOpacity={0.85}
          >
            <Text style={[styles.modeText, { color: theme.colors.textSecondary }, startMode === "now" && { color: theme.colors.textPrimary }]}>
              Let's Go Now
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeButton, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface, borderRadius: theme.radius.md }, startMode === "later" && { borderColor: theme.colors.indigo[500], backgroundColor: theme.colors.surfaceElevated }]}
            onPress={() => setStartMode("later")}
            activeOpacity={0.85}
          >
            <Text style={[styles.modeText, { color: theme.colors.textSecondary }, startMode === "later" && { color: theme.colors.textPrimary }]}>
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
  scrollContent: { paddingBottom: 24 },
  header: { flexDirection: "row", alignItems: "center", marginBottom: 22 },
  backButton: { width: 40, height: 40, borderRadius: 9999, alignItems: "center", justifyContent: "center", borderWidth: 1, marginRight: 12 },
  headerTitle: { fontWeight: "800" },
  heroCard: { padding: 16, marginBottom: 20, borderWidth: 1 },
  heroIconWrap: { width: 34, height: 34, borderRadius: 9999, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(251, 191, 36, 0.18)", marginBottom: 10 },
  heroTitle: { fontWeight: "700", marginBottom: 6 },
  heroText: { lineHeight: 20 },
  label: { marginBottom: 8, fontWeight: "600" },
  input: { borderWidth: 1, padding: 14, fontSize: 16, marginBottom: 16 },
  textArea: { height: 110 },
  durationCard: { borderWidth: 1, padding: 14, marginBottom: 16, gap: 12 },
  durationRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  durationBlockLabel: { fontSize: 12, fontWeight: "700", width: 56 },
  stepper: { flexDirection: "row", alignItems: "center", gap: 14 },
  stepBtn: { width: 44, height: 44, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  stepValue: { fontSize: 22, fontWeight: "800", minWidth: 36, textAlign: "center", fontVariant: ["tabular-nums"] },
  totalLine: { fontSize: 14, textAlign: "center" },
  durationCap: { fontSize: 11, textAlign: "center" },
  startModeRow: { flexDirection: "row", gap: 10, marginBottom: 20 },
  modeButton: { flex: 1, minHeight: 48, alignItems: "center", justifyContent: "center", borderWidth: 1, flexDirection: "row", gap: 8 },
  modeText: { fontWeight: "700" },
  cta: { marginBottom: 20 },
});
