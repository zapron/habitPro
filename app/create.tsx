import { Text } from "../src/components/AppText";
import { useState } from "react";
import {
  View,
  TextInput,
  Alert,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
} from "react-native";
import { useRouter } from "expo-router";

import {
  ArrowLeft,
  Target,
  Gamepad2,
  Plane,
  Globe,
  User,
  Minus,
  Plus,
} from "lucide-react-native";
import { Button } from "../src/components/Button";
import { Screen } from "../src/components/Screen";
import { useTheme } from "../src/context/ThemeContext";
import { useHabitStore } from "../src/store/habitStore";
import type { HabitMode, MissionVisibility } from "../src/types/habit";
import { PlusBadge } from "../src/components/PlusBadge";
import { usePremium } from "../src/context/PremiumContext";
import { usePlusUpsell } from "../src/context/PlusUpsellContext";
import { backOrReplace } from "../src/lib/navigation";
import { useNotificationGate } from "../src/context/NotificationGateContext";
import { useRefreshPremiumAccess } from "../src/hooks/useRefreshPremiumAccess";

export default function CreateHabit() {
  const router = useRouter();
  const { theme, isDark } = useTheme();
  const addHabit = useHabitStore((state) => state.addHabit);
  const { isPremium, loading: premiumLoading } = usePremium();
  const { openUpsell } = usePlusUpsell();
  const refreshPremiumAccess = useRefreshPremiumAccess();
  const { suggestNotifications } = useNotificationGate();
  const plusOk = isPremium && !premiumLoading;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [mode, setMode] = useState<HabitMode>("autopilot");
  const [totalDays, setTotalDays] = useState(30);
  const [visibility, setVisibility] = useState<MissionVisibility>("solo");
  const [focused, setFocused] = useState<"title" | "desc" | null>(null);

  const bumpDays = (delta: number) => {
    setTotalDays((d) => Math.max(1, Math.min(365, d + delta)));
  };

  const handleCreate = async () => {
    if (!title.trim()) {
      Alert.alert("Error", "Please enter a mission title.");
      return;
    }
    if (visibility === "public") {
      const freshPremium = await refreshPremiumAccess({ force: true, serverOnly: true });
      if (freshPremium !== true) {
        openUpsell("visibility");
        return;
      }
    }
    if (mode === "manual") {
      const days = Math.max(1, Math.min(365, totalDays));
      addHabit({
        title: title.trim(),
        description: description.trim(),
        mode,
        totalDays: days,
        visibility,
      });
    } else {
      addHabit({
        title: title.trim(),
        description: description.trim(),
        mode: "autopilot",
        visibility,
      });
    }
    router.replace("/");
    // Non-blocking soft ask after creation (best conversion moment).
    setTimeout(() => {
      void suggestNotifications("mission_create");
    }, 450);
  };

  return (
    <Screen>
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor={theme.colors.background}
      />
      <View style={styles.header}>
        <TouchableOpacity
          style={[
            styles.backButton,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
            },
          ]}
          onPress={() => backOrReplace(router, "/")}
        >
          <ArrowLeft size={20} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <Text
          style={[
            styles.headerTitle,
            { color: theme.colors.textPrimary, fontSize: theme.typography.h2 },
          ]}
        >
          Main Mission
        </Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
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
              <Text
                style={[
                  styles.heroTitle,
                  {
                    color: theme.colors.textPrimary,
                    fontSize: theme.typography.h3,
                  },
                ]}
              >
                Build One Powerful Habit
              </Text>
              <Text
                style={[styles.heroText, { color: theme.colors.textSecondary }]}
              >
                Pick autopilot for a classic 21-day streak, or manual for
                custom-length missions.
              </Text>
            </View>
            <View style={styles.heroIconWrap}>
              <Target size={18} color={theme.colors.cyan[400]} />
            </View>
          </View>
        </View>

        <Text
          style={[
            styles.label,
            {
              color: theme.colors.textSecondary,
              fontSize: theme.typography.caption,
            },
          ]}
        >
          Mission Title
        </Text>
        <TextInput
          style={[
            styles.input,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
              color: theme.colors.textPrimary,
            },
            focused === "title" && { borderColor: theme.colors.indigo[500] },
          ]}
          placeholder="e.g., Run every morning"
          placeholderTextColor={theme.colors.textMuted}
          value={title}
          onChangeText={setTitle}
          onFocus={() => setFocused("title")}
          onBlur={() => setFocused(null)}
          autoFocus
        />

        <Text
          style={[
            styles.label,
            {
              color: theme.colors.textSecondary,
              fontSize: theme.typography.caption,
            },
          ]}
        >
          Brief (Optional)
        </Text>
        <TextInput
          style={[
            styles.input,
            styles.textArea,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
              color: theme.colors.textPrimary,
            },
            focused === "desc" && { borderColor: theme.colors.indigo[500] },
          ]}
          placeholder="Why this mission matters..."
          placeholderTextColor={theme.colors.textMuted}
          value={description}
          onChangeText={setDescription}
          onFocus={() => setFocused("desc")}
          onBlur={() => setFocused(null)}
          multiline
          textAlignVertical="top"
        />

        <Text
          style={[
            styles.label,
            {
              color: theme.colors.textSecondary,
              fontSize: theme.typography.caption,
            },
          ]}
        >
          Mode
        </Text>
        <View style={styles.modeRow}>
          <TouchableOpacity
            style={[
              styles.modeCard,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
              },
              mode === "autopilot" && {
                borderColor: theme.colors.cyan[400],
                backgroundColor: theme.colors.surfaceElevated,
              },
            ]}
            onPress={() => setMode("autopilot")}
            activeOpacity={0.85}
          >
            <Plane
              size={20}
              color={
                mode === "autopilot"
                  ? theme.colors.cyan[400]
                  : theme.colors.textMuted
              }
            />
            <Text
              style={[
                styles.modeLabel,
                {
                  color:
                    mode === "autopilot"
                      ? theme.colors.textPrimary
                      : theme.colors.textSecondary,
                },
              ]}
            >
              Autopilot
            </Text>
            <Text style={[styles.modeHint, { color: theme.colors.textMuted }]}>
              21-day streak
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.modeCard,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
              },
              mode === "manual" && {
                borderColor: theme.colors.amber[500],
                backgroundColor: theme.colors.surfaceElevated,
              },
            ]}
            onPress={() => setMode("manual")}
            activeOpacity={0.85}
          >
            <Gamepad2
              size={20}
              color={
                mode === "manual"
                  ? theme.colors.amber[500]
                  : theme.colors.textMuted
              }
            />
            <Text
              style={[
                styles.modeLabel,
                {
                  color:
                    mode === "manual"
                      ? theme.colors.textPrimary
                      : theme.colors.textSecondary,
                },
              ]}
            >
              Manual
            </Text>
            <Text style={[styles.modeHint, { color: theme.colors.textMuted }]}>
              Custom days
            </Text>
          </TouchableOpacity>
        </View>

        {mode === "manual" && (
          <>
            <Text
              style={[
                styles.label,
                {
                  color: theme.colors.textSecondary,
                  fontSize: theme.typography.caption,
                },
              ]}
            >
              Mission length
            </Text>
            <Text style={[styles.fieldHint, { color: theme.colors.textMuted }]}>
              Total days for this mission (1–365).
            </Text>
            <View
              style={[
                styles.daysCard,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.border,
                  borderRadius: theme.radius.lg,
                  ...theme.shadow.card,
                },
              ]}
            >
              <View style={styles.daysRow}>
                <TouchableOpacity
                  style={[
                    styles.stepBtn,
                    {
                      borderColor: theme.colors.border,
                      backgroundColor: theme.colors.surfaceElevated,
                    },
                  ]}
                  onPress={() => bumpDays(-1)}
                  accessibilityLabel="Decrease days"
                >
                  <Minus size={22} color={theme.colors.textPrimary} />
                </TouchableOpacity>
                <TextInput
                  style={[
                    styles.daysInput,
                    {
                      borderColor: theme.colors.border,
                      backgroundColor: theme.colors.surfaceElevated,
                      color: theme.colors.textPrimary,
                    },
                  ]}
                  value={String(totalDays)}
                  onChangeText={(t) => {
                    const cleaned = t.replace(/[^0-9]/g, "");
                    if (cleaned === "") return;
                    const n = parseInt(cleaned, 10);
                    if (!Number.isNaN(n))
                      setTotalDays(Math.min(365, Math.max(1, n)));
                  }}
                  keyboardType="number-pad"
                  maxLength={3}
                  selectTextOnFocus
                />
                <TouchableOpacity
                  style={[
                    styles.stepBtn,
                    {
                      borderColor: theme.colors.border,
                      backgroundColor: theme.colors.surfaceElevated,
                    },
                  ]}
                  onPress={() => bumpDays(1)}
                  accessibilityLabel="Increase days"
                >
                  <Plus size={22} color={theme.colors.textPrimary} />
                </TouchableOpacity>
              </View>
              <Text
                style={[
                  styles.daysSummary,
                  { color: theme.colors.textSecondary },
                ]}
              >
                <Text
                  style={{ fontWeight: "800", color: theme.colors.textPrimary }}
                >
                  {Math.max(1, Math.min(365, totalDays))}
                </Text>{" "}
                days
              </Text>
            </View>
          </>
        )}

        <Text
          style={[
            styles.label,
            {
              color: theme.colors.textSecondary,
              fontSize: theme.typography.caption,
            },
          ]}
        >
          Who can see this
        </Text>
        <View style={styles.modeRow}>
          <TouchableOpacity
            style={[
              styles.modeCard,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
              },
              visibility === "solo" && {
                borderColor: theme.colors.indigo[500],
                backgroundColor: theme.colors.surfaceElevated,
              },
            ]}
            onPress={() => setVisibility("solo")}
            activeOpacity={0.85}
          >
            <User
              size={20}
              color={
                visibility === "solo"
                  ? theme.colors.indigo[400]
                  : theme.colors.textMuted
              }
            />
            <Text
              style={[
                styles.modeLabel,
                {
                  color:
                    visibility === "solo"
                      ? theme.colors.textPrimary
                      : theme.colors.textSecondary,
                },
              ]}
            >
              Solo
            </Text>
            <Text style={[styles.modeHint, { color: theme.colors.textMuted }]}>
              Private to you
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.modeCard,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
              },
              visibility === "public" && {
                borderColor: theme.colors.cyan[400],
                backgroundColor: theme.colors.surfaceElevated,
              },
              !plusOk && { opacity: 0.72 },
            ]}
            onPress={() => {
              void (async () => {
                const freshPremium = await refreshPremiumAccess({ force: true, serverOnly: true });
                if (freshPremium !== true) {
                  openUpsell("visibility");
                  return;
                }
                setVisibility("public");
              })();
            }}
            activeOpacity={0.85}
          >
            <Globe
              size={20}
              color={
                visibility === "public"
                  ? theme.colors.cyan[400]
                  : theme.colors.textMuted
              }
            />
            <View style={styles.publicLabelRow}>
              <Text
                style={[
                  styles.modeLabel,
                  {
                    color:
                      visibility === "public"
                        ? theme.colors.textPrimary
                        : theme.colors.textSecondary,
                  },
                ]}
              >
                Public
              </Text>
              <PlusBadge withFlame />
            </View>
            <Text style={[styles.modeHint, { color: theme.colors.textMuted }]}>
              Visible to your squad
            </Text>
          </TouchableOpacity>
        </View>

        <Button
          title="Launch Mission"
          onPress={handleCreate}
          style={styles.cta}
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scrollContent: { paddingBottom: 24 },
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
    backgroundColor: "rgba(34, 211, 238, 0.14)",
    marginTop: 2,
  },
  heroBody: { flex: 1, minWidth: 0 },
  heroTitle: { fontWeight: "700", marginBottom: 6 },
  heroText: { lineHeight: 20 },
  label: { marginBottom: 8, fontWeight: "600" },
  fieldHint: { fontSize: 12, marginBottom: 10, lineHeight: 17 },
  input: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    fontSize: 16,
    marginBottom: 16,
  },
  textArea: { height: 110 },
  modeRow: { flexDirection: "row", gap: 10, marginBottom: 20 },
  modeCard: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 16,
    borderRadius: 14,
    borderWidth: 1,
    gap: 6,
  },
  publicLabelRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  modeLabel: { fontWeight: "700", fontSize: 14 },
  modeHint: { fontSize: 11 },
  daysCard: { borderWidth: 1, marginBottom: 16, padding: 14, gap: 12 },
  daysRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  stepBtn: {
    width: 48,
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  daysInput: {
    flex: 1,
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontSize: 22,
    fontWeight: "800",
    textAlign: "center",
    fontVariant: ["tabular-nums"],
  },
  daysSummary: { fontSize: 14, textAlign: "center" },
  cta: { marginBottom: 20 },
});
