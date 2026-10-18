import { StyleSheet, View } from "react-native";
import { Flag } from "lucide-react-native";
import { Text } from "./AppText";
import { Button } from "./Button";
import { useTheme } from "../context/ThemeContext";
import { withAlpha } from "../styles/theme";
import type { Habit, MissionReport } from "../types/habit";

/**
 * Shown on Home when a main mission's window has ended and it hasn't been
 * given an outcome yet. Answering records it exactly like the habit screen's
 * own "Mission review" Yes/No, and the mission moves into Reports.
 */
type Props = {
  habit: Habit;
  /** 1-based position when more than one mission is waiting. */
  position: number;
  total: number;
  onAnswer: (report: MissionReport) => void;
};

export function MissionOutcomeCard({ habit, position, total, onAnswer }: Props) {
  const { theme, isDark } = useTheme();
  const done = habit.completedDates.length;
  const allDone = done >= habit.totalDays;

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.surface,
          borderColor: isDark ? withAlpha(theme.colors.amber[500], 35) : withAlpha(theme.colors.amber[500], 30),
        },
      ]}
    >
      <View style={styles.top}>
        <View style={[styles.kickerRow]}>
          <Flag size={13} color={theme.colors.amber[500]} fill={theme.colors.amber[500]} />
          <Text style={[styles.kicker, { color: theme.colors.amber[500] }]}>MISSION ENDED</Text>
        </View>
        {total > 1 ? (
          <Text style={[styles.counter, { color: theme.colors.textMuted }]}>
            {position} of {total}
          </Text>
        ) : null}
      </View>

      <Text style={[styles.title, { color: theme.colors.textPrimary }]} numberOfLines={2}>
        {habit.title}
      </Text>
      <Text style={[styles.stat, { color: theme.colors.textSecondary }]}>
        {done} of {habit.totalDays} days checked in
      </Text>
      <Text style={[styles.question, { color: theme.colors.textSecondary }]}>
        {allDone ? "Every day is checked. Do you call this one done?" : "How did it go? Do you still count it as done?"}
      </Text>

      <View style={styles.actions}>
        <Button
          title="Accomplished"
          onPress={() => onAnswer("accomplished")}
          style={{
            flex: 1,
            backgroundColor: isDark ? withAlpha(theme.colors.green[500], 18) : withAlpha(theme.colors.green[600], 10),
            borderWidth: 1,
            borderColor: isDark ? withAlpha(theme.colors.green[500], 45) : withAlpha(theme.colors.green[600], 32),
          }}
          textStyle={{ color: isDark ? theme.colors.green[500] : theme.colors.green[600] }}
        />
        <Button
          title="Didn't make it"
          onPress={() => onAnswer("failed")}
          style={{
            flex: 1,
            backgroundColor: isDark ? withAlpha(theme.colors.maroon[500], 18) : withAlpha(theme.colors.maroon[600], 10),
            borderWidth: 1,
            borderColor: isDark ? withAlpha(theme.colors.maroon[500], 45) : withAlpha(theme.colors.maroon[600], 32),
          }}
          textStyle={{ color: isDark ? theme.colors.maroon[500] : theme.colors.maroon[600] }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 18, borderWidth: 1, padding: 16, marginBottom: 14 },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  kickerRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  kicker: { fontSize: 11, fontWeight: "800", letterSpacing: 1.2 },
  counter: { fontSize: 12, fontWeight: "700" },
  title: { fontSize: 18, fontWeight: "800", marginTop: 8 },
  stat: { fontSize: 13, fontWeight: "600", marginTop: 4 },
  question: { fontSize: 13.5, lineHeight: 19, marginTop: 10 },
  actions: { flexDirection: "row", gap: 10, marginTop: 14 },
});

