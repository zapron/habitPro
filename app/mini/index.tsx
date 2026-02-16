import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, StatusBar } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { FlashList } from "@shopify/flash-list";
import { Bolt, Clock3, CircleCheck, ArrowLeft } from "lucide-react-native";
import { Screen } from "../../src/components/Screen";
import { Button } from "../../src/components/Button";
import { useTheme } from "../../src/context/ThemeContext";
import { useHabitStore } from "../../src/store/habitStore";
import { MiniMission } from "../../src/types/habit";

type MiniTab = "active" | "queued" | "completed";

function MiniMissionCard({ item }: { item: MiniMission }) {
  const router = useRouter();
  const { theme } = useTheme();
  const statusLabel =
    item.status === "in_progress"
      ? "In Progress"
      : item.status === "completed"
        ? "Completed"
        : item.status === "cancelled"
          ? "Cancelled"
          : "Queued";

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderRadius: theme.radius.lg, ...theme.shadow.card }]}
      activeOpacity={0.9}
      onPress={() => router.push(`/mini/${item.id}`)}
    >
      <Text style={[styles.cardTitle, { color: theme.colors.textPrimary, fontSize: theme.typography.h3 }]}>{item.title}</Text>
      {!!item.objective && (
        <Text style={[styles.cardObjective, { color: theme.colors.textSecondary, fontSize: theme.typography.caption }]} numberOfLines={2}>
          {item.objective}
        </Text>
      )}
      <View style={styles.cardFooter}>
        <View style={[styles.metaPill, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceElevated }]}>
          <Clock3 size={14} color={theme.colors.cyan[400]} />
          <Text style={[styles.metaText, { color: theme.colors.textPrimary }]}>{item.estimatedMinutes} min</Text>
        </View>
        <Text style={[styles.statusText, { color: theme.colors.textSecondary }]}>{statusLabel}</Text>
      </View>
    </TouchableOpacity>
  );
}

export default function MiniMissionsScreen() {
  const router = useRouter();
  const { theme, isDark } = useTheme();
  const { view, tab: tabParam } = useLocalSearchParams<{ view?: string; tab?: string }>();
  const miniMissions = useHabitStore((state) => state.miniMissions);
  const initialTab: MiniTab =
    tabParam === "queued" ? "queued" : tabParam === "completed" ? "completed" : "active";
  const [tab, setTab] = useState<MiniTab>(initialTab);

  const filtered = useMemo(() => {
    if (view === "running") return miniMissions.filter((m) => m.status === "in_progress");
    if (tab === "active") return miniMissions.filter((m) => m.status === "in_progress");
    if (tab === "queued") return miniMissions.filter((m) => m.status === "pending" || m.status === "scheduled");
    if (tab === "completed") return miniMissions.filter((m) => m.status === "completed" || m.status === "cancelled");
    return [];
  }, [miniMissions, tab, view]);

  const inProgressCount = miniMissions.filter((m) => m.status === "in_progress").length;

  return (
    <Screen>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={theme.colors.background} />
      <View style={styles.headerControls}>
        <TouchableOpacity style={[styles.iconButton, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]} onPress={() => router.back()} activeOpacity={0.8}>
          <ArrowLeft size={20} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerAccent, { color: theme.colors.textSecondary, fontSize: theme.typography.caption }]}>Focus Queue</Text>
      </View>
      <View style={styles.header}>
        <Text style={[styles.eyebrow, { color: theme.colors.cyan[400], fontSize: theme.typography.micro }]}>MINI MISSIONS</Text>
        <Text style={[styles.title, { color: theme.colors.textPrimary, fontSize: theme.typography.h2 }]}>Quick Focus Sprints</Text>
        <Text style={[styles.subtitle, { color: theme.colors.textSecondary, fontSize: theme.typography.caption }]}>Turn procrastinated tasks into timed actions.</Text>
      </View>

      <View style={styles.stats}>
        <View style={[styles.statsCard, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface, borderRadius: theme.radius.md }]}>
          <Text style={[styles.statsValue, { color: theme.colors.textPrimary }]}>{miniMissions.length}</Text>
          <Text style={[styles.statsLabel, { color: theme.colors.textSecondary }]}>Total</Text>
        </View>
        <View style={[styles.statsCard, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface, borderRadius: theme.radius.md }]}>
          <Text style={[styles.statsValue, { color: theme.colors.textPrimary }]}>{inProgressCount}</Text>
          <Text style={[styles.statsLabel, { color: theme.colors.textSecondary }]}>Running</Text>
        </View>
        <View style={[styles.statsCard, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface, borderRadius: theme.radius.md }]}>
          <Text style={[styles.statsValue, { color: theme.colors.textPrimary }]}>
            {miniMissions.filter((m) => m.status === "completed").length}
          </Text>
          <Text style={[styles.statsLabel, { color: theme.colors.textSecondary }]}>Done</Text>
        </View>
      </View>

      <View style={[styles.tabContainer, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderRadius: theme.radius.md }]}>
        <TouchableOpacity
          style={[styles.tab, (tab === "active" || view === "running") && [styles.activeTab, { backgroundColor: theme.colors.indigo[600] }]]}
          onPress={() => { setTab("active"); if (view === "running") router.replace("/mini?tab=active"); }}
        >
          <Text style={[styles.tabText, { color: theme.colors.textSecondary }, (tab === "active" || view === "running") && styles.activeTabText]}>
            Active
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === "queued" && [styles.activeTab, { backgroundColor: theme.colors.indigo[600] }]]}
          onPress={() => { setTab("queued"); if (view === "running") router.replace("/mini?tab=queued"); }}
        >
          <Text style={[styles.tabText, { color: theme.colors.textSecondary }, tab === "queued" && styles.activeTabText]}>Queued</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === "completed" && [styles.activeTab, { backgroundColor: theme.colors.indigo[600] }]]}
          onPress={() => { setTab("completed"); if (view === "running") router.replace("/mini?tab=completed"); }}
        >
          <Text style={[styles.tabText, { color: theme.colors.textSecondary }, tab === "completed" && styles.activeTabText]}>Completed</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.listWrap}>
        {filtered.length === 0 ? (
          <View style={styles.empty}>
            <CircleCheck size={40} color={theme.colors.slate[500]} />
            <Text style={[styles.emptyTitle, { color: theme.colors.textPrimary, fontSize: theme.typography.h3 }]}>
              {tab === "active" ? "No active mini missions" : tab === "queued" ? "No queued mini missions" : "No completed mini missions yet"}
            </Text>
            <Text style={[styles.emptyText, { color: theme.colors.textSecondary }]}>
              {tab === "active" ? "Start a mini mission to see it running here." : tab === "queued" ? "Create mini missions and choose Start Later." : "Complete one sprint to build momentum."}
            </Text>
          </View>
        ) : (
          <FlashList
            data={filtered}
            renderItem={({ item }) => <MiniMissionCard item={item} />}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
          />
        )}
      </View>

      <View style={styles.fab}>
        <Button title="Create Mini Mission" onPress={() => router.push("/mini/create")} style={{ ...theme.shadow.glow }} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerControls: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  header: { alignItems: "flex-start", marginBottom: 16 },
  iconButton: { width: 40, height: 40, borderRadius: 9999, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  eyebrow: { fontWeight: "700", letterSpacing: 1.2, marginBottom: 6 },
  title: { fontWeight: "800" },
  subtitle: { marginTop: 4 },
  headerAccent: { fontWeight: "700", letterSpacing: 0.3 },
  stats: { flexDirection: "row", gap: 10, marginBottom: 16 },
  statsCard: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 10, borderWidth: 1 },
  statsValue: { fontSize: 22, fontWeight: "800" },
  statsLabel: { fontSize: 11 },
  tabContainer: { flexDirection: "row", borderWidth: 1, padding: 4, marginBottom: 14 },
  tab: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 10, borderRadius: 10 },
  activeTab: {},
  tabText: { fontWeight: "700" },
  activeTabText: { color: "#ffffff" },
  listWrap: { flex: 1 },
  listContent: { paddingBottom: 100 },
  card: { padding: 16, marginBottom: 12, borderWidth: 1 },
  cardTitle: { fontWeight: "700", marginBottom: 6 },
  cardObjective: { lineHeight: 20 },
  cardFooter: { marginTop: 12, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  metaPill: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 9999, borderWidth: 1, paddingVertical: 4, paddingHorizontal: 10 },
  metaText: { fontSize: 12, fontWeight: "700" },
  statusText: { fontSize: 12, fontWeight: "600" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },
  emptyTitle: { marginTop: 12, marginBottom: 8, fontWeight: "700", textAlign: "center" },
  emptyText: { textAlign: "center", marginBottom: 16 },
  fab: { position: "absolute", bottom: 28, left: 24, right: 24 },
});
