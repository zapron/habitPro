import { useMemo, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, StatusBar } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Medal, Swords } from "lucide-react-native";
import { Screen } from "../../src/components/Screen";
import { useTheme } from "../../src/context/ThemeContext";
import { useHabitStore } from "../../src/store/habitStore";

type CompeteSegment = "leaderboard" | "challenges";

export default function CompeteScreen() {
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [segment, setSegment] = useState<CompeteSegment>("leaderboard");

  const xp = useHabitStore((s) => s.xp);
  const habits = useHabitStore((s) => s.habits);
  const miniMissions = useHabitStore((s) => s.miniMissions);

  const level = Math.floor(xp / 100);
  const completedMissions = useMemo(
    () => habits.filter((h) => h.isCompleted).length + miniMissions.filter((m) => m.status === "completed").length,
    [habits, miniMissions],
  );

  const bottomPad = Math.max(insets.bottom, 16) + 8;

  return (
    <Screen>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={theme.colors.background} />

      <Text style={[styles.title, { color: theme.colors.textPrimary, fontSize: theme.typography.h1 }]}>Compete</Text>
      <Text style={[styles.subtitle, { color: theme.colors.textSecondary, fontSize: theme.typography.caption }]}>
        Leaderboards and head-to-head challenges — more soon.
      </Text>

      <View
        style={[
          styles.segmentWrap,
          { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
        ]}
      >
        <TouchableOpacity
          style={[
            styles.segment,
            segment === "leaderboard" && [
              styles.segmentActive,
              { backgroundColor: theme.colors.indigo[600], ...theme.shadow.glow },
            ],
          ]}
          onPress={() => setSegment("leaderboard")}
          activeOpacity={0.85}
        >
          <Medal size={16} color={segment === "leaderboard" ? theme.colors.white : theme.colors.textMuted} />
          <Text
            style={[
              styles.segmentLabel,
              { color: segment === "leaderboard" ? theme.colors.white : theme.colors.textSecondary },
            ]}
          >
            Leaderboard
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.segment,
            segment === "challenges" && [
              styles.segmentActive,
              { backgroundColor: theme.colors.indigo[600], ...theme.shadow.glow },
            ],
          ]}
          onPress={() => setSegment("challenges")}
          activeOpacity={0.85}
        >
          <Swords size={16} color={segment === "challenges" ? theme.colors.white : theme.colors.textMuted} />
          <Text
            style={[
              styles.segmentLabel,
              { color: segment === "challenges" ? theme.colors.white : theme.colors.textSecondary },
            ]}
          >
            Challenges
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: bottomPad }}
        keyboardShouldPersistTaps="handled"
      >
        {segment === "leaderboard" ? (
          <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, ...theme.shadow.card }]}>
            <Text style={[styles.cardTitle, { color: theme.colors.textPrimary }]}>Your rank preview</Text>
            <Text style={[styles.cardBody, { color: theme.colors.textSecondary }]}>
              Global and regional leaderboards will load from the server in a future update. For now, here is your local
              progress:
            </Text>
            <View style={[styles.statRow, { borderTopColor: theme.colors.border }]}>
              <Text style={[styles.statLabel, { color: theme.colors.textMuted }]}>Level</Text>
              <Text style={[styles.statValue, { color: theme.colors.yellow[400] }]}>{level}</Text>
            </View>
            <View style={[styles.statRow, { borderTopColor: theme.colors.border }]}>
              <Text style={[styles.statLabel, { color: theme.colors.textMuted }]}>Total XP</Text>
              <Text style={[styles.statValue, { color: theme.colors.indigo[400] }]}>{xp}</Text>
            </View>
            <View style={[styles.statRow, { borderTopColor: theme.colors.border }]}>
              <Text style={[styles.statLabel, { color: theme.colors.textMuted }]}>Missions completed</Text>
              <Text style={[styles.statValue, { color: theme.colors.cyan[400] }]}>{completedMissions}</Text>
            </View>
          </View>
        ) : (
          <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, ...theme.shadow.card }]}>
            <Text style={[styles.cardTitle, { color: theme.colors.textPrimary }]}>Challenges</Text>
            <Text style={[styles.cardBody, { color: theme.colors.textSecondary }]}>
              Invite a friend to the same habit mission, track progress together, and get notified when someone completes a
              day — coming in a future release.
            </Text>
            <Text style={[styles.hint, { color: theme.colors.textMuted }]}>
              No pending challenges yet.
            </Text>
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontWeight: "800", marginBottom: 6 },
  subtitle: { marginBottom: 18, lineHeight: 18 },
  segmentWrap: {
    flexDirection: "row",
    borderRadius: 14,
    padding: 4,
    marginBottom: 18,
    borderWidth: 1,
    gap: 4,
  },
  segment: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
  },
  segmentActive: {},
  segmentLabel: { fontWeight: "700", fontSize: 13 },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
  },
  cardTitle: { fontWeight: "800", fontSize: 17, marginBottom: 10 },
  cardBody: { lineHeight: 20, marginBottom: 14 },
  statRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  statLabel: { fontSize: 14, fontWeight: "600" },
  statValue: { fontSize: 16, fontWeight: "800" },
  hint: { fontSize: 13, fontStyle: "italic", marginTop: 4 },
});
