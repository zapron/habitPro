import { Text } from "./AppText";
import { Platform, StyleSheet, View } from "react-native";
import type { AppTheme } from "../styles/theme";

/** Rich streak-board headline. Copy matches `challenge/[id]` cohort logic. */
export type CohortMastheadModel =
  | { kind: "sync_prompt" }
  | { kind: "most_days"; leaderName: string; daysChecked: number }
  | { kind: "tie"; leadersCount: number; streakDays: number }
  | { kind: "leader"; leaderName: string; streakDays: number };

type Props = {
  theme: AppTheme;
  model: CohortMastheadModel;
  isDark?: boolean;
};

/** Trophy + narrative row (no outer card). Composed by CohortLeaderHero. */
export function CohortMastheadTrophyNarrative({ theme, model, isDark = false }: Props) {
  const textProps = Platform.OS === "android" ? { includeFontPadding: false as const } : {};

  const base = theme.colors.textSecondary;
  const nameColor = theme.colors.textPrimary;
  const streakAccent = theme.colors.indigo[400];

  const body = (() => {
    switch (model.kind) {
      case "sync_prompt":
        return (
          <Text style={[styles.body, { color: base }]} numberOfLines={4} {...textProps}>
            Squad loading… complete a day to appear on the streak board.
          </Text>
        );
      case "most_days":
        return (
          <Text style={[styles.body, { color: base }]} numberOfLines={4} {...textProps}>
            <Text style={{ color: nameColor, fontWeight: "700" }}>{model.leaderName}</Text>
            <Text>
              {" "}
              has checked the most days ({model.daysChecked}). Build the next streak!
            </Text>
          </Text>
        );
      case "tie":
        return (
          <Text style={[styles.body, { color: base }]} numberOfLines={4} {...textProps}>
            <Text style={{ color: nameColor, fontWeight: "700" }}>{model.leadersCount}</Text>
            <Text> tied with a </Text>
            <Text style={{ color: streakAccent, fontWeight: "800" }}>{model.streakDays} day streak</Text>
            <Text>, who pulls ahead?</Text>
          </Text>
        );
      case "leader":
        return (
          <Text style={[styles.body, { color: base }]} numberOfLines={4} {...textProps}>
            <Text style={{ color: nameColor, fontWeight: "700" }}>{model.leaderName}</Text>
            <Text> is leading on a </Text>
            <Text style={{ color: streakAccent, fontWeight: "800" }}>{model.streakDays} day streak</Text>
            <Text>.</Text>
          </Text>
        );
    }
  })();

  return (
    <View style={styles.row}>
      <View style={styles.textColumn}>
        {body}
      </View>
    </View>
  );
}

export function CohortMasthead({ theme, model, isDark = false }: Props) {
  return (
    <View
      style={[
        styles.wrap,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          ...theme.shadow.card,
        },
      ]}
    >
      <View style={styles.inner}>
        <CohortMastheadTrophyNarrative theme={theme} model={model} isDark={isDark} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 16,
    overflow: "hidden",
  },
  inner: {
    paddingVertical: 12,
    paddingHorizontal: 18,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  textColumn: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },
  body: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "600",
  },
});
