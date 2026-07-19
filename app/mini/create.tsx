import { Text } from "../../src/components/AppText";
import { useEffect, useRef, useState } from "react";
import { View, TextInput, TouchableOpacity, ScrollView, StyleSheet, StatusBar, Platform, InteractionManager } from "react-native";
import { useRouter } from "expo-router";
import { ArrowLeft, Check, Clock3, Plane } from "lucide-react-native";
import { Screen } from "../../src/components/Screen";
import { useHabitStore } from "../../src/store/habitStore";
import { useTheme } from "../../src/context/ThemeContext";
import { FuelTimePresetButton } from "../../src/components/fuel/FuelTimePresetButton";
import { FuelQuickMinutesStrip } from "../../src/components/fuel/FuelQuickMinutesStrip";
import { backOrReplace } from "../../src/lib/navigation";
import { useNotificationGate } from "../../src/context/NotificationGateContext";
import { showAppAlert } from "../../src/context/AppDialogContext";
import type { MiniMissionCompletionMode } from "../../src/types/habit";

type StartMode = "now" | "later";

const MIN_FUEL_MINUTES = 1;
const MAX_FUEL_MINUTES = 480;

/** Sub-hour — compact strip */
const QUICK_MINUTES: { label: string; minutes: number }[] = [
  { label: "5m", minutes: 5 },
  { label: "15m", minutes: 15 },
  { label: "30m", minutes: 30 },
  { label: "45m", minutes: 45 },
];

/** 1h+ — tank tiles */
const LONG_PRESETS: { label: string; minutes: number }[] = [
  { label: "1h", minutes: 60 },
  { label: "90m", minutes: 90 },
  { label: "2h", minutes: 120 },
  { label: "4h", minutes: 240 },
  { label: "8h", minutes: 480 },
];

function clampTotal(minutes: number): number {
  return Math.max(MIN_FUEL_MINUTES, Math.min(MAX_FUEL_MINUTES, Math.round(minutes)));
}

export default function CreateMiniMission() {
  const router = useRouter();
  const { theme, isDark } = useTheme();
  const addMiniMission = useHabitStore((state) => state.addMiniMission);
  const { softAskNotifications } = useNotificationGate();

  const [title, setTitle] = useState("");
  const [objective, setObjective] = useState("");
  const [totalMinutes, setTotalMinutes] = useState(15);
  const [completionMode, setCompletionMode] = useState<MiniMissionCompletionMode>("timer_check_in");
  const [focused, setFocused] = useState<"title" | "objective" | "minutes" | null>(null);
  const [creatingMode, setCreatingMode] = useState<StartMode | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const titleInputRef = useRef<TextInput>(null);
  const objectiveInputYRef = useRef(0);
  const keyboardScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let focusTimer: ReturnType<typeof setTimeout> | null = null;
    const task = InteractionManager.runAfterInteractions(() => {
      focusTimer = setTimeout(() => {
        titleInputRef.current?.focus();
      }, 180);
    });
    return () => {
      task.cancel?.();
      if (focusTimer) clearTimeout(focusTimer);
      if (keyboardScrollTimerRef.current) {
        clearTimeout(keyboardScrollTimerRef.current);
        keyboardScrollTimerRef.current = null;
      }
    };
  }, []);

  const clearPendingKeyboardScroll = () => {
    if (!keyboardScrollTimerRef.current) return;
    clearTimeout(keyboardScrollTimerRef.current);
    keyboardScrollTimerRef.current = null;
  };

  const scrollObjectiveAboveKeyboard = () => {
    clearPendingKeyboardScroll();
    keyboardScrollTimerRef.current = setTimeout(() => {
      keyboardScrollTimerRef.current = null;
      scrollRef.current?.scrollTo({
        y: Math.max(0, objectiveInputYRef.current - 72),
        animated: true,
      });
    }, Platform.OS === "ios" ? 180 : 240);
  };

  const displayHours = Math.floor(totalMinutes / 60);
  const displayMins = totalMinutes % 60;
  const creating = creatingMode !== null;

  const handleCreate = (mode: StartMode) => {
    if (creating) return;
    if (!title.trim()) {
      showAppAlert("Error", "Please enter the mini mission.");
      return;
    }
    const minutes = clampTotal(totalMinutes);
    if (minutes < MIN_FUEL_MINUTES) {
      showAppAlert("Error", "Set at least one minute for this mission.");
      return;
    }

    setCreatingMode(mode);
    void (async () => {
      try {
        if (mode === "now") {
          const notificationResult = await softAskNotifications("mini_timer");
          if (notificationResult === "settings") return;
        }

        const id = addMiniMission({
          title: title.trim(),
          objective: objective.trim(),
          estimatedMinutes: minutes,
          completionMode,
          startMode: mode,
        });

        if (mode === "now") {
          router.replace(`/mini/${id}`);
          return;
        }
        router.replace("/mini");
      } finally {
        setCreatingMode(null);
      }
    })();
  };

  return (
    <Screen>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={theme.colors.background} />
      <View style={styles.header}>
        <TouchableOpacity
          style={[styles.backButton, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
          onPress={() => backOrReplace(router, "/mini")}
        >
          <ArrowLeft size={20} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.colors.textPrimary, fontSize: theme.typography.h2 }]}>New Mini Mission</Text>
      </View>

      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        contentContainerStyle={styles.scrollContent}
      >
        <View
          style={[
            styles.heroCard,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
              borderRadius: theme.radius.lg,
              ...theme.shadow.card,
            },
          ]}
        >
          <View style={styles.heroRow}>
            <View style={styles.heroBody}>
              <Text style={[styles.heroTitle, { color: theme.colors.textPrimary, fontSize: theme.typography.h3 }]}>How long will this take?</Text>
              <Text style={[styles.heroText, { color: theme.colors.textSecondary }]}>
                Choose roughly how many minutes you want. Start when you are ready. You can choose whether to publish to Community when you finish.
              </Text>
            </View>
            <View style={styles.heroIconWrap}>
              <Plane size={18} color={theme.colors.cyan[400]} />
            </View>
          </View>
        </View>

        <Text style={[styles.label, { color: theme.colors.textSecondary, fontSize: theme.typography.caption }]}>Mission</Text>
        <TextInput
          ref={titleInputRef}
          style={[
            styles.input,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
              color: theme.colors.textPrimary,
              borderRadius: theme.radius.md,
            },
            focused === "title" && { borderColor: theme.colors.indigo[500] },
          ]}
          placeholder="e.g., Take bath now"
          placeholderTextColor={theme.colors.textMuted}
          value={title}
          onChangeText={setTitle}
          onFocus={() => setFocused("title")}
          onBlur={() => setFocused(null)}
        />

        <Text style={[styles.label, { color: theme.colors.textSecondary, fontSize: theme.typography.caption }]}>Objective (Optional)</Text>
        <TextInput
          onLayout={(event) => {
            objectiveInputYRef.current = event.nativeEvent.layout.y;
          }}
          style={[
            styles.input,
            styles.textArea,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
              color: theme.colors.textPrimary,
              borderRadius: theme.radius.md,
            },
            focused === "objective" && { borderColor: theme.colors.indigo[500] },
          ]}
          placeholder="What does done look like?"
          placeholderTextColor={theme.colors.textMuted}
          value={objective}
          onChangeText={setObjective}
          onFocus={() => {
            setFocused("objective");
            scrollObjectiveAboveKeyboard();
          }}
          onBlur={() => {
            clearPendingKeyboardScroll();
            setFocused(null);
          }}
          multiline
          textAlignVertical="top"
        />

        <Text style={[styles.label, { color: theme.colors.textSecondary, fontSize: theme.typography.caption }]}>Duration</Text>
        <Text style={[styles.fieldHint, { color: theme.colors.textMuted }]}>
          Short tasks: use the row below. Longer stretches: use the bigger options. Or type any number of minutes (1–480).
        </Text>

        <View
          style={[
            styles.durationCard,
            {
              backgroundColor: isDark ? theme.colors.surface : theme.colors.surfaceElevated,
              borderColor: theme.colors.border,
              borderRadius: theme.radius.lg,
              ...theme.shadow.card,
            },
          ]}
        >
          <Text style={[styles.presetSectionLabel, { color: theme.colors.textSecondary }]}>Under 1 hour</Text>
          <FuelQuickMinutesStrip
            presets={QUICK_MINUTES}
            selectedMinutes={totalMinutes}
            onSelect={setTotalMinutes}
            isDark={isDark}
          />

          <Text style={[styles.presetSectionLabel, { color: theme.colors.textSecondary, marginTop: 4 }]}>1 hour or more</Text>
          <View style={styles.presetWrap}>
            {LONG_PRESETS.map((p) => (
              <FuelTimePresetButton
                key={p.minutes}
                label={p.label}
                minutes={p.minutes}
                active={totalMinutes === p.minutes}
                onPress={() => setTotalMinutes(p.minutes)}
                isDark={isDark}
              />
            ))}
          </View>

          <Text style={[styles.minutesLabel, { color: theme.colors.textSecondary }]}>Minutes</Text>
          <TextInput
            style={[
              styles.minutesInput,
              {
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surface,
                color: theme.colors.textPrimary,
              },
              focused === "minutes" && { borderColor: theme.colors.indigo[500] },
            ]}
            value={String(totalMinutes)}
            onChangeText={(t) => {
              const cleaned = t.replace(/[^0-9]/g, "");
              if (cleaned === "") return;
              const n = parseInt(cleaned, 10);
              if (!Number.isNaN(n)) setTotalMinutes(clampTotal(n));
            }}
            onFocus={() => setFocused("minutes")}
            onBlur={() => setFocused(null)}
            keyboardType="number-pad"
            maxLength={3}
            selectTextOnFocus
          />

          <Text style={[styles.totalLine, { color: theme.colors.textSecondary }]}>
            Total: <Text style={{ fontWeight: "800", color: theme.colors.textPrimary }}>{clampTotal(totalMinutes)}</Text> min
            {displayHours > 0 ? ` (${displayHours}h ${displayMins}m)` : ""}
          </Text>
        </View>

        <Text style={[styles.label, { color: theme.colors.textSecondary, fontSize: theme.typography.caption }]}>Finish Rule</Text>
        <View
          style={[
            styles.finishRuleCard,
            {
              backgroundColor: isDark ? theme.colors.surface : theme.colors.surfaceElevated,
              borderColor: theme.colors.border,
              borderRadius: theme.radius.lg,
              ...theme.shadow.card,
            },
          ]}
        >
          <TouchableOpacity
            style={[
              styles.finishOption,
              completionMode === "timer_check_in" && {
                borderColor: theme.colors.green[500],
                backgroundColor: isDark ? "rgba(34,197,94,0.12)" : "rgba(22,163,74,0.1)",
              },
            ]}
            onPress={() => setCompletionMode("timer_check_in")}
            activeOpacity={0.86}
            accessibilityRole="button"
            accessibilityState={{ selected: completionMode === "timer_check_in" }}
          >
            <View style={[styles.finishIcon, { backgroundColor: isDark ? "rgba(34,197,94,0.14)" : "rgba(22,163,74,0.12)" }]}>
              <Clock3 size={17} color={theme.colors.green[500]} />
            </View>
            <View style={styles.finishText}>
              <View style={styles.finishTitleRow}>
                <Text style={[styles.finishTitle, { color: theme.colors.textPrimary }]} numberOfLines={1}>
                  Timer Check-In
                </Text>
                <View
                  style={[
                    styles.finishModeTag,
                    {
                      backgroundColor: isDark ? "rgba(34,197,94,0.16)" : "rgba(22,163,74,0.11)",
                      borderColor: theme.colors.green[500] + "66",
                    },
                  ]}
                >
                  <Text style={[styles.finishModeTagText, { color: theme.colors.green[500] }]}>SOLO</Text>
                </View>
              </View>
              <Text style={[styles.finishBody, { color: theme.colors.textSecondary }]} numberOfLines={2}>
                Time ends, then confirm if you completed it. Best for workouts, planks, study, meditation.
              </Text>
            </View>
            {completionMode === "timer_check_in" ? <Check size={18} color={theme.colors.green[500]} /> : null}
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.finishOption,
              completionMode === "manual" && {
                borderColor: theme.colors.indigo[500],
                backgroundColor: isDark ? "rgba(99,102,241,0.13)" : "rgba(99,102,241,0.1)",
              },
            ]}
            onPress={() => setCompletionMode("manual")}
            activeOpacity={0.86}
            accessibilityRole="button"
            accessibilityState={{ selected: completionMode === "manual" }}
          >
            <View style={[styles.finishIcon, { backgroundColor: isDark ? "rgba(99,102,241,0.16)" : "rgba(99,102,241,0.12)" }]}>
              <Plane size={17} color={theme.colors.indigo[400]} />
            </View>
            <View style={styles.finishText}>
              <View style={styles.finishTitleRow}>
                <Text style={[styles.finishTitle, { color: theme.colors.textPrimary }]} numberOfLines={1}>
                  Manual Finish
                </Text>
                <View
                  style={[
                    styles.finishModeTag,
                    {
                      backgroundColor: isDark ? "rgba(99,102,241,0.17)" : "rgba(79,70,229,0.1)",
                      borderColor: theme.colors.indigo[400] + "66",
                    },
                  ]}
                >
                  <Text style={[styles.finishModeTagText, { color: theme.colors.indigo[400] }]} numberOfLines={1}>
                    SOLO / COMMUNITY
                  </Text>
                </View>
              </View>
              <Text style={[styles.finishBody, { color: theme.colors.textSecondary }]} numberOfLines={2}>
                Tap complete before zero. Use this for stricter race-style mini missions.
              </Text>
            </View>
            {completionMode === "manual" ? <Check size={18} color={theme.colors.indigo[400]} /> : null}
          </TouchableOpacity>
        </View>

        <Text style={[styles.label, { color: theme.colors.textSecondary, fontSize: theme.typography.caption }]}>Start</Text>
        <View style={styles.startModeRow}>
          <TouchableOpacity
            style={[
              styles.modeButton,
              styles.modeButtonPrimary,
              {
                borderColor: theme.colors.indigo[500],
                backgroundColor: theme.colors.indigo[500],
                borderRadius: theme.radius.md,
              },
              creating && styles.modeButtonDisabled,
            ]}
            onPress={() => handleCreate("now")}
            disabled={creating}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityState={{ disabled: creating }}
          >
            <Text style={[styles.modeText, styles.modeTextPrimary]}>
              {creatingMode === "now" ? "Starting..." : "Let's Go Now"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.modeButton,
              {
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surface,
                borderRadius: theme.radius.md,
              },
              creating && styles.modeButtonDisabled,
            ]}
            onPress={() => handleCreate("later")}
            disabled={creating}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityState={{ disabled: creating }}
          >
            <Text
              style={[styles.modeText, { color: theme.colors.textPrimary }]}
            >
              {creatingMode === "later" ? "Saving..." : "Start Later"}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scrollContent: { paddingBottom: 140 },
  header: { flexDirection: "row", alignItems: "center", marginBottom: 22 },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 9999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    marginRight: 12,
  },
  headerTitle: { fontWeight: "800" },
  heroCard: { padding: 16, marginBottom: 20, borderWidth: 1 },
  heroRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  heroIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 9999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(34, 211, 238, 0.16)",
    marginTop: 2,
  },
  heroBody: { flex: 1, minWidth: 0 },
  heroTitle: { fontWeight: "700", marginBottom: 6 },
  heroText: { lineHeight: 20 },
  label: { marginBottom: 8, fontWeight: "600" },
  fieldHint: { fontSize: 12, marginBottom: 10, lineHeight: 17 },
  input: { borderWidth: 1, padding: 14, fontSize: 16, marginBottom: 16 },
  textArea: { height: 110 },
  durationCard: { borderWidth: 1, paddingVertical: 14, paddingHorizontal: 10, marginBottom: 16, gap: 10 },
  finishRuleCard: { borderWidth: 1, padding: 10, gap: 9, marginBottom: 16 },
  finishOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: "transparent",
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 11,
  },
  finishIcon: {
    width: 34,
    height: 34,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  finishText: { flex: 1, minWidth: 0 },
  finishTitleRow: { flexDirection: "row", alignItems: "center", gap: 8, minWidth: 0 },
  finishTitle: { fontSize: 14, lineHeight: 18, fontWeight: "900" },
  finishModeTag: {
    flexShrink: 1,
    borderWidth: 1,
    borderRadius: 7,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  finishModeTagText: { fontSize: 9, lineHeight: 11, fontWeight: "900", letterSpacing: 0.8 },
  finishBody: { marginTop: 2, fontSize: 12, lineHeight: 16, fontWeight: "600" },
  presetSectionLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 0.3, textTransform: "uppercase" },
  presetWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "space-between" },
  minutesLabel: { fontSize: 12, fontWeight: "600", marginTop: 4 },
  minutesInput: {
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 20,
    fontWeight: "800",
    textAlign: "center",
    fontVariant: ["tabular-nums"],
  },
  totalLine: { fontSize: 14, textAlign: "center", marginTop: 4 },
  startModeRow: { flexDirection: "row", gap: 10, marginBottom: 20 },
  modeButton: { flex: 1, minHeight: 52, alignItems: "center", justifyContent: "center", borderWidth: 1, flexDirection: "row", gap: 8 },
  modeButtonPrimary: {
    shadowColor: "#4f46e5",
    shadowOpacity: 0.22,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  modeButtonDisabled: { opacity: 0.68 },
  modeText: { fontWeight: "800", fontSize: 14 },
  modeTextPrimary: { color: "#ffffff" },
});
