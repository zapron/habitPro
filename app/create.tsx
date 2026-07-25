import { Text } from "../src/components/AppText";
import { useEffect, useRef, useState } from "react";
import {
  View,
  TextInput,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Platform,
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
  ListChecks,
  X,
} from "lucide-react-native";
import { Button } from "../src/components/Button";
import { Screen } from "../src/components/Screen";
import { useTheme } from "../src/context/ThemeContext";
import { useHabitStore } from "../src/store/habitStore";
import type { HabitMode, MissionVisibility, TaskChecklistItem } from "../src/types/habit";
import { PlusBadge } from "../src/components/PlusBadge";
import { usePremium } from "../src/context/PremiumContext";
import { usePlusUpsell } from "../src/context/PlusUpsellContext";
import { backOrReplace } from "../src/lib/navigation";
import { useNotificationGate } from "../src/context/NotificationGateContext";
import { useRefreshPremiumAccess } from "../src/hooks/useRefreshPremiumAccess";
import { showAppAlert } from "../src/context/AppDialogContext";

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
  const [checklistItems, setChecklistItems] = useState<{ id: string; label: string }[]>([]);
  const scrollRef = useRef<ScrollView>(null);
  const descriptionInputYRef = useRef(0);
  const keyboardScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
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

  const scrollDescriptionAboveKeyboard = () => {
    clearPendingKeyboardScroll();
    keyboardScrollTimerRef.current = setTimeout(() => {
      keyboardScrollTimerRef.current = null;
      scrollRef.current?.scrollTo({
        y: Math.max(0, descriptionInputYRef.current - 72),
        animated: true,
      });
    }, Platform.OS === "ios" ? 180 : 240);
  };

  const bumpDays = (delta: number) => {
    setTotalDays((d) => Math.max(1, Math.min(365, d + delta)));
  };

  const addChecklistItem = () => {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    setChecklistItems((items) => [...items, { id, label: "" }]);
  };

  const updateChecklistItem = (id: string, label: string) => {
    setChecklistItems((items) => items.map((item) => (item.id === id ? { ...item, label } : item)));
  };

  const removeChecklistItem = (id: string) => {
    setChecklistItems((items) => items.filter((item) => item.id !== id));
  };

  const handleCreate = async () => {
    if (!title.trim()) {
      showAppAlert("Error", "Please enter a mission title.");
      return;
    }
    if (visibility === "public") {
      const freshPremium = await refreshPremiumAccess({ serverOnly: true, cachedAccessOk: true });
      if (freshPremium !== true) {
        openUpsell("visibility");
        return;
      }
    }
    const taskChecklist: TaskChecklistItem[] = checklistItems
      .map((item) => ({ id: item.id, label: item.label.trim() }))
      .filter((item) => item.label.length > 0)
      .map((item, index) => ({ id: item.id, label: item.label, order: index + 1 }));

    if (mode === "manual") {
      const days = Math.max(1, Math.min(365, totalDays));
      addHabit({
        title: title.trim(),
        description: description.trim(),
        mode,
        totalDays: days,
        visibility,
        taskChecklist,
      });
    } else {
      addHabit({
        title: title.trim(),
        description: description.trim(),
        mode: "autopilot",
        visibility,
        taskChecklist,
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
          onLayout={(event) => {
            descriptionInputYRef.current = event.nativeEvent.layout.y;
          }}
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
          onFocus={() => {
            setFocused("desc");
            scrollDescriptionAboveKeyboard();
          }}
          onBlur={() => {
            clearPendingKeyboardScroll();
            setFocused(null);
          }}
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

        <View style={styles.checklistHeaderRow}>
          <ListChecks size={16} color={theme.colors.textSecondary} />
          <Text
            style={[
              styles.label,
              { color: theme.colors.textSecondary, fontSize: theme.typography.caption, marginBottom: 0 },
            ]}
          >
            Task checklist (optional)
          </Text>
        </View>
        <Text style={[styles.fieldHint, { color: theme.colors.textMuted }]}>
          Break this mission into daily tasks you log separately — like "Drink water" or
          "Go to the gym". Leave empty to check in with one note and photo per day, as usual.
        </Text>
        {checklistItems.length > 0 ? (
          <View
            style={[
              styles.checklistCard,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
                borderRadius: theme.radius.lg,
                ...theme.shadow.card,
              },
            ]}
          >
            {checklistItems.map((item, index) => (
              <View key={item.id} style={styles.checklistRow}>
                <Text style={[styles.checklistIndex, { color: theme.colors.textMuted }]}>
                  {index + 1}
                </Text>
                <TextInput
                  style={[
                    styles.checklistInput,
                    {
                      backgroundColor: theme.colors.surfaceElevated,
                      borderColor: theme.colors.border,
                      color: theme.colors.textPrimary,
                    },
                  ]}
                  placeholder="e.g., Get up early"
                  placeholderTextColor={theme.colors.textMuted}
                  value={item.label}
                  onChangeText={(text) => updateChecklistItem(item.id, text)}
                />
                <TouchableOpacity
                  onPress={() => removeChecklistItem(item.id)}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel="Remove task"
                  style={[styles.checklistRemoveBtn, { borderColor: theme.colors.border }]}
                >
                  <X size={14} color={theme.colors.textMuted} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        ) : null}
        <TouchableOpacity
          onPress={addChecklistItem}
          activeOpacity={0.85}
          style={[
            styles.checklistAddBtn,
            { borderColor: theme.colors.indigo[500], backgroundColor: `${theme.colors.indigo[500]}14` },
          ]}
        >
          <Plus size={16} color={theme.colors.indigo[400]} />
          <Text style={[styles.checklistAddText, { color: theme.colors.indigo[400] }]}>
            Add task
          </Text>
        </TouchableOpacity>

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
                const freshPremium = await refreshPremiumAccess({ serverOnly: true, cachedAccessOk: true });
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
  checklistHeaderRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 },
  checklistCard: { borderWidth: 1, padding: 10, gap: 8, marginBottom: 10 },
  checklistRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  checklistIndex: { width: 16, fontSize: 12, fontWeight: "700", textAlign: "center" },
  checklistInput: { flex: 1, borderWidth: 1, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, fontSize: 14 },
  checklistRemoveBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  checklistAddBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    marginBottom: 20,
  },
  checklistAddText: { fontSize: 13, fontWeight: "700" },
  cta: { marginBottom: 20 },
});
