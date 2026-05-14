import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { ArrowRight, RefreshCw, Sparkles, Wand2 } from "lucide-react-native";
import { Text } from "../../components/AppText";
import { Button } from "../../components/Button";
import { useTheme } from "../../context/ThemeContext";
import type { Habit, MiniMission } from "../../types/habit";
import { buildAiCoachSnapshot } from "./buildSnapshot";
import { buildAiCoachCreateUrl } from "./createPrefill";
import { isAiCoachEnabled } from "./config";
import { requestAiCoach } from "./aiCoachApi";
import type { AiCoachAction, AiCoachResponse, AiCoachSuggestion } from "./types";

type LoadState =
  | { status: "idle" | "loading" }
  | { status: "ready"; response: AiCoachResponse }
  | { status: "error"; error: string };

type Props = {
  habits: Habit[];
  miniMissions: MiniMission[];
  xp: number;
  level: number;
  signedIn: boolean;
  onOpenReports: () => void;
};

function actionLabel(action: AiCoachAction): string {
  return action.label || "Use suggestion";
}

export function AiCoachHomeCard({
  habits,
  miniMissions,
  xp,
  level,
  signedIn,
  onOpenReports,
}: Props) {
  const router = useRouter();
  const { theme, isDark } = useTheme();
  const [state, setState] = useState<LoadState>({ status: "idle" });

  const snapshot = useMemo(
    () => buildAiCoachSnapshot({ habits, miniMissions, xp, level }),
    [habits, miniMissions, xp, level],
  );

  const load = useCallback(async () => {
    if (!signedIn) {
      setState({ status: "error", error: "Sign in to test the AI coach spike." });
      return;
    }
    setState({ status: "loading" });
    const result = await requestAiCoach(snapshot);
    if (result.ok === false) {
      setState({ status: "error", error: result.error });
      return;
    }
    setState({ status: "ready", response: result.response });
  }, [signedIn, snapshot]);

  useEffect(() => {
    if (!isAiCoachEnabled()) return;
    void load();
  }, [load]);

  const handleAction = useCallback(
    (action: AiCoachAction) => {
      if (action.type === "prefill_habit") {
        router.push(
          buildAiCoachCreateUrl({
            title: action.title,
            description: action.description,
            mode: action.mode,
            totalDays: action.totalDays,
          }) as never,
        );
        return;
      }
      if (action.type === "open_habit") {
        router.push(`/habit/${action.habitId}` as never);
        return;
      }
      if (action.type === "open_mini") {
        router.push("/mini");
        return;
      }
      if (action.type === "open_reports") {
        onOpenReports();
      }
    },
    [onOpenReports, router],
  );

  if (!isAiCoachEnabled()) return null;

  const response = state.status === "ready" ? state.response : null;
  const primary = response?.suggestions[0] ?? null;
  const secondary = response?.suggestions.slice(1, 3) ?? [];
  const providerLabel = response?.provider === "openai" ? "REAL AI" : response?.provider === "mock" ? "MOCK" : "SPIKE";
  const usageText = response?.usage
    ? response.usage.premium
      ? `${response.usage.remainingToday}/${response.usage.limitPerDay} AI coach calls left today`
      : `${response.usage.remainingToday}/${response.usage.limitPerDay} free AI coach calls left today`
    : null;

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.surface,
          borderColor: isDark ? "rgba(129, 140, 248, 0.34)" : "rgba(79, 70, 229, 0.18)",
          borderRadius: theme.radius.lg,
        },
      ]}
    >
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <View style={[styles.iconWrap, { backgroundColor: isDark ? "rgba(129,140,248,0.16)" : "rgba(79,70,229,0.10)" }]}>
            <Sparkles size={17} color={theme.colors.indigo[400]} />
          </View>
          <View style={styles.headerText}>
            <Text style={[styles.kicker, { color: theme.colors.indigo[400] }]}>AI COACH EXPERIMENT</Text>
            <Text style={[styles.title, { color: theme.colors.textPrimary }]} numberOfLines={1}>
              {response?.headline ?? "Today’s move"}
            </Text>
          </View>
        </View>
        <View style={[styles.providerPill, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceElevated }]}>
          <Text style={[styles.providerText, { color: theme.colors.textMuted }]}>{providerLabel}</Text>
        </View>
      </View>

      <Text
        style={[styles.subtitle, { color: theme.colors.textSecondary }]}
        numberOfLines={response?.subheadline.includes("Edge Function HTTP") ? undefined : 2}
      >
        {response?.subheadline ??
          (state.status === "loading"
            ? "Reading your current missions and picking one practical next step."
            : "A removable coach layer that suggests, never changes your data.")}
      </Text>

      {state.status === "loading" ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={theme.colors.indigo[400]} />
          <Text style={[styles.loadingText, { color: theme.colors.textMuted }]}>Thinking through your mission board...</Text>
        </View>
      ) : state.status === "error" ? (
        <View style={[styles.errorBox, { backgroundColor: theme.colors.surfaceElevated, borderColor: theme.colors.border }]}>
          <Text style={[styles.errorText, { color: theme.colors.textSecondary }]}>{state.error}</Text>
          <Button title="Retry AI Coach" variant="subtle" onPress={() => void load()} style={styles.retryBtn} />
        </View>
      ) : primary ? (
        <SuggestionBlock suggestion={primary} onPress={handleAction} />
      ) : null}

      {secondary.length > 0 ? (
        <View style={styles.secondaryWrap}>
          {secondary.map((suggestion) => (
            <TouchableOpacity
              key={suggestion.id}
              style={[styles.secondaryRow, { borderColor: theme.colors.border }]}
              activeOpacity={0.85}
              onPress={() => handleAction(suggestion.action)}
            >
              <Wand2 size={14} color={theme.colors.cyan[400]} />
              <Text style={[styles.secondaryText, { color: theme.colors.textSecondary }]} numberOfLines={1}>
                {suggestion.title}
              </Text>
              <ArrowRight size={14} color={theme.colors.textMuted} />
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      <View style={styles.footerRow}>
        {usageText ? (
          <Text style={[styles.usageText, { color: theme.colors.textMuted }]} numberOfLines={1}>
            {usageText}
          </Text>
        ) : (
          <Text style={[styles.usageText, { color: theme.colors.textMuted }]} numberOfLines={1}>
            Flagged off by default. Safe to remove.
          </Text>
        )}
        <TouchableOpacity style={styles.refreshBtn} onPress={() => void load()} activeOpacity={0.8}>
          <RefreshCw size={14} color={theme.colors.textMuted} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function SuggestionBlock({
  suggestion,
  onPress,
}: {
  suggestion: AiCoachSuggestion;
  onPress: (action: AiCoachAction) => void;
}) {
  const { theme, isDark } = useTheme();

  return (
    <TouchableOpacity
      style={[
        styles.primarySuggestion,
        {
          backgroundColor: isDark ? "rgba(15, 23, 42, 0.56)" : "rgba(241, 245, 249, 0.78)",
          borderColor: theme.colors.border,
        },
      ]}
      activeOpacity={0.88}
      onPress={() => onPress(suggestion.action)}
    >
      <View style={styles.primaryCopy}>
        <Text style={[styles.suggestionTitle, { color: theme.colors.textPrimary }]} numberOfLines={2}>
          {suggestion.title}
        </Text>
        <Text style={[styles.suggestionBody, { color: theme.colors.textSecondary }]} numberOfLines={3}>
          {suggestion.body}
        </Text>
        {suggestion.reason ? (
          <Text style={[styles.reasonText, { color: theme.colors.textMuted }]} numberOfLines={1}>
            {suggestion.reason}
          </Text>
        ) : null}
      </View>
      <View style={[styles.actionChip, { backgroundColor: theme.colors.indigo[600] }]}>
        <Text style={[styles.actionChipText, { color: theme.colors.white }]} numberOfLines={1}>
          {actionLabel(suggestion.action)}
        </Text>
        <ArrowRight size={14} color={theme.colors.white} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    padding: 14,
    marginBottom: 12,
    gap: 10,
  },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1, minWidth: 0 },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 9999,
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: { flex: 1, minWidth: 0 },
  kicker: { fontSize: 9, lineHeight: 11, fontWeight: "900", letterSpacing: 0.8 },
  title: { fontSize: 16, lineHeight: 20, fontWeight: "900" },
  providerPill: { borderWidth: 1, borderRadius: 9999, paddingHorizontal: 8, paddingVertical: 4 },
  providerText: { fontSize: 9, lineHeight: 11, fontWeight: "900", letterSpacing: 0.6 },
  subtitle: { fontSize: 12, lineHeight: 17, fontWeight: "600" },
  loadingRow: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 48 },
  loadingText: { fontSize: 12, lineHeight: 16, fontWeight: "700", flex: 1 },
  errorBox: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 10 },
  errorText: { fontSize: 12, lineHeight: 17, fontWeight: "700" },
  retryBtn: { minHeight: 42 },
  primarySuggestion: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    gap: 12,
  },
  primaryCopy: { gap: 5 },
  suggestionTitle: { fontSize: 15, lineHeight: 19, fontWeight: "900" },
  suggestionBody: { fontSize: 12, lineHeight: 17, fontWeight: "600" },
  reasonText: { fontSize: 11, lineHeight: 14, fontWeight: "700" },
  actionChip: {
    minHeight: 36,
    borderRadius: 9999,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    alignSelf: "flex-start",
    maxWidth: "100%",
  },
  actionChipText: { fontSize: 12, lineHeight: 14, fontWeight: "900", flexShrink: 1 },
  secondaryWrap: { gap: 8 },
  secondaryRow: {
    minHeight: 42,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  secondaryText: { flex: 1, minWidth: 0, fontSize: 12, lineHeight: 15, fontWeight: "800" },
  footerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  usageText: { flex: 1, minWidth: 0, fontSize: 10, lineHeight: 13, fontWeight: "700" },
  refreshBtn: { width: 32, height: 32, borderRadius: 9999, alignItems: "center", justifyContent: "center" },
});
