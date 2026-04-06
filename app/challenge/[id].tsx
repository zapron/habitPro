import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { ArrowLeft } from "lucide-react-native";
import { Screen } from "../../src/components/Screen";
import { StreakMemoryGallery } from "../../src/components/StreakMemoryGallery";
import { useTheme } from "../../src/context/ThemeContext";
import { useHabitStore } from "../../src/store/habitStore";
import {
  getChallengeGroup,
  listChallengeMembers,
  refreshCohortPeerHabits,
} from "../../src/lib/groupChallengesApi";
import type { ChallengeGroupRow } from "../../src/types/groupChallenge";

export default function ChallengeDetailScreen() {
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const challengeId = Array.isArray(id) ? id[0] : id;
  const router = useRouter();
  const { theme, isDark } = useTheme();

  const habits = useHabitStore((s) => s.habits);
  const cohortPeerHabits = useHabitStore((s) => s.cohortPeerHabits);

  const [group, setGroup] = useState<ChallengeGroupRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [memberCount, setMemberCount] = useState(0);

  const load = useCallback(async () => {
    if (!challengeId) return;
    setLoading(true);
    try {
      const [g, members] = await Promise.all([
        getChallengeGroup(challengeId),
        listChallengeMembers(challengeId),
      ]);
      setGroup(g);
      setMemberCount(members.length);
    } finally {
      setLoading(false);
    }
  }, [challengeId]);

  useEffect(() => {
    void load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      void refreshCohortPeerHabits();
    }, []),
  );

  const myHabit = useMemo(
    () => habits.find((h) => h.challengeGroupId === challengeId),
    [habits, challengeId],
  );

  const peers = useMemo(
    () => cohortPeerHabits.filter((h) => h.challengeGroupId === challengeId),
    [cohortPeerHabits, challengeId],
  );

  const bottomPad = 32;

  if (!challengeId) {
    return (
      <Screen>
        <Text style={{ color: theme.colors.textPrimary }}>Invalid challenge</Text>
      </Screen>
    );
  }

  return (
    <Screen>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={theme.colors.background} />

      <View style={styles.header}>
        <TouchableOpacity
          style={[styles.iconButton, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
          onPress={() => router.back()}
        >
          <ArrowLeft size={theme.icon.xl} color={theme.colors.textPrimary} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color={theme.colors.indigo[400]} style={{ marginTop: 24 }} />
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: bottomPad }}>
          <Text style={[styles.title, { color: theme.colors.textPrimary, fontSize: theme.typography.h1 }]}>
            {group?.title ?? "Challenge"}
          </Text>
          <Text style={[styles.meta, { color: theme.colors.textMuted }]}>
            {memberCount} member{memberCount === 1 ? "" : "s"} · Creator timezone: {group?.creator_timezone ?? "—"}
          </Text>

          {myHabit ? (
            <View
              style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, ...theme.shadow.card }]}
            >
              <Text style={[styles.cardTitle, { color: theme.colors.textPrimary }]}>Your mission</Text>
              <Text style={{ color: theme.colors.textSecondary, marginTop: 6 }}>{myHabit.title}</Text>
              <Text style={{ color: theme.colors.cyan[400], marginTop: 10, fontWeight: "700" }}>
                Streak {myHabit.streak} · {myHabit.completedDates.length} / {myHabit.totalDays} days
              </Text>
            </View>
          ) : (
            <Text style={{ color: theme.colors.textSecondary, marginTop: 8 }}>
              No linked habit on this device for this challenge yet.
            </Text>
          )}

          <Text style={[styles.section, { color: theme.colors.textMuted }]}>COHORT</Text>
          {peers.length === 0 ? (
            <Text style={{ color: theme.colors.textSecondary }}>When others join, their progress appears here.</Text>
          ) : (
            peers.map((h) => {
              const memoryEntries = Object.entries(h.streakMemories ?? {})
                .map(([dateStr, memory]) => ({ dateStr, memory }))
                .sort((a, b) => (a.dateStr < b.dateStr ? 1 : -1));
              const showMoments = (h.visibility ?? "solo") === "public" && memoryEntries.length > 0;
              return (
                <View key={h.id} style={styles.peerBlock}>
                  <View
                    style={[styles.peerRow, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}
                  >
                    <Text style={{ color: theme.colors.textPrimary, fontWeight: "700" }}>{h.title}</Text>
                    <Text style={{ color: theme.colors.textMuted, fontSize: 13, marginTop: 4 }}>
                      Streak {h.streak} · {h.completedDates.length} / {h.totalDays} days
                      {(h.visibility ?? "solo") === "public" ? (
                        <Text style={{ color: theme.colors.cyan[500] }}> · Public</Text>
                      ) : null}
                    </Text>
                  </View>
                  {showMoments ? (
                    <StreakMemoryGallery
                      entries={memoryEntries}
                      sectionTitle="Shared moments"
                      sectionHint="They set this mission to public. Photos only appear here after cloud sync."
                      remotePeer
                    />
                  ) : null}
                </View>
              );
            })
          )}
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", marginBottom: 16 },
  iconButton: { padding: 8, borderRadius: 9999, borderWidth: 1 },
  title: { fontWeight: "800", marginBottom: 6 },
  meta: { fontSize: 13, marginBottom: 18 },
  section: { fontSize: 11, fontWeight: "800", letterSpacing: 1, marginTop: 24, marginBottom: 10 },
  card: { borderRadius: 16, borderWidth: 1, padding: 16 },
  cardTitle: { fontSize: 12, fontWeight: "800", letterSpacing: 0.8 },
  peerRow: { borderRadius: 12, borderWidth: 1, padding: 14, marginBottom: 10 },
  peerBlock: { marginBottom: 8 },
});
