import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, StatusBar } from "react-native";
import { useRouter } from "expo-router";
import { FlashList } from "@shopify/flash-list";
import { Bolt, Clock3, CircleCheck, ArrowLeft } from "lucide-react-native";
import { Screen } from "../../src/components/Screen";
import { Button } from "../../src/components/Button";
import { theme } from "../../src/styles/theme";
import { useHabitStore } from "../../src/store/habitStore";
import { MiniMission } from "../../src/types/habit";

type MiniTab = "active" | "done";

function MiniMissionCard({ item }: { item: MiniMission }) {
  const router = useRouter();
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
      style={styles.card}
      activeOpacity={0.9}
      onPress={() => router.push(`/mini/${item.id}`)}
    >
      <Text style={styles.cardTitle}>{item.title}</Text>
      {!!item.objective && (
        <Text style={styles.cardObjective} numberOfLines={2}>
          {item.objective}
        </Text>
      )}
      <View style={styles.cardFooter}>
        <View style={styles.metaPill}>
          <Clock3 size={14} color={theme.colors.cyan[400]} />
          <Text style={styles.metaText}>{item.estimatedMinutes} min</Text>
        </View>
        <Text style={styles.statusText}>{statusLabel}</Text>
      </View>
    </TouchableOpacity>
  );
}

export default function MiniMissionsScreen() {
  const router = useRouter();
  const miniMissions = useHabitStore((state) => state.miniMissions);
  const [tab, setTab] = useState<MiniTab>("active");

  const filtered = useMemo(() => {
    if (tab === "done") {
      return miniMissions.filter((m) => m.status === "completed");
    }
    return miniMissions.filter((m) => m.status !== "completed");
  }, [miniMissions, tab]);

  const inProgressCount = miniMissions.filter((m) => m.status === "in_progress").length;

  return (
    <Screen>
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.background} />
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>MINI MISSIONS</Text>
          <Text style={styles.title}>Quick Focus Sprints</Text>
          <Text style={styles.subtitle}>Turn procrastinated tasks into timed actions.</Text>
        </View>
        <View style={styles.headerIcon}>
          <Bolt size={20} color={theme.colors.yellow[400]} />
        </View>
      </View>

      <View style={styles.stats}>
        <View style={styles.statsCard}>
          <Text style={styles.statsValue}>{miniMissions.length}</Text>
          <Text style={styles.statsLabel}>Total</Text>
        </View>
        <View style={styles.statsCard}>
          <Text style={styles.statsValue}>{inProgressCount}</Text>
          <Text style={styles.statsLabel}>Running</Text>
        </View>
        <View style={styles.statsCard}>
          <Text style={styles.statsValue}>
            {miniMissions.filter((m) => m.status === "completed").length}
          </Text>
          <Text style={styles.statsLabel}>Done</Text>
        </View>
      </View>

      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, tab === "active" && styles.activeTab]}
          onPress={() => setTab("active")}
        >
          <Text style={[styles.tabText, tab === "active" && styles.activeTabText]}>Active</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === "done" && styles.activeTab]}
          onPress={() => setTab("done")}
        >
          <Text style={[styles.tabText, tab === "done" && styles.activeTabText]}>Completed</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.listWrap}>
        {filtered.length === 0 ? (
          <View style={styles.empty}>
            <CircleCheck size={40} color={theme.colors.slate[500]} />
            <Text style={styles.emptyTitle}>
              {tab === "active" ? "No mini missions yet" : "No completed mini missions yet"}
            </Text>
            <Text style={styles.emptyText}>
              {tab === "active"
                ? "Create one and decide exactly how much time it needs."
                : "Complete one sprint to build momentum."}
            </Text>
            {tab === "active" && (
              <Button title="Create Mini Mission" onPress={() => router.push("/mini/create")} />
            )}
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
        <Button
          title="New Mini Mission"
          onPress={() => router.push("/mini/create")}
          style={styles.fabButton}
        />
      </View>
      <TouchableOpacity style={styles.backButton} onPress={() => router.back()} activeOpacity={0.8}>
        <ArrowLeft size={16} color={theme.colors.textSecondary} />
        <Text style={styles.backText}>Home</Text>
      </TouchableOpacity>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  eyebrow: {
    color: theme.colors.cyan[400],
    fontSize: theme.typography.micro,
    fontWeight: "700",
    letterSpacing: 1.2,
    marginBottom: 6,
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.h2,
    fontWeight: "800",
  },
  subtitle: {
    color: theme.colors.textSecondary,
    marginTop: 4,
    fontSize: theme.typography.caption,
  },
  headerIcon: {
    width: 42,
    height: 42,
    borderRadius: theme.radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  stats: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 16,
  },
  statsCard: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  statsValue: {
    color: theme.colors.textPrimary,
    fontSize: 22,
    fontWeight: "800",
  },
  statsLabel: {
    color: theme.colors.textSecondary,
    fontSize: 11,
  },
  tabContainer: {
    flexDirection: "row",
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    padding: 4,
    marginBottom: 14,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 10,
  },
  activeTab: {
    backgroundColor: theme.colors.indigo[600],
  },
  tabText: {
    color: theme.colors.textSecondary,
    fontWeight: "700",
  },
  activeTabText: {
    color: theme.colors.white,
  },
  listWrap: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 100,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    padding: 16,
    marginBottom: 12,
    ...theme.shadow.card,
  },
  cardTitle: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.h3,
    fontWeight: "700",
    marginBottom: 6,
  },
  cardObjective: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.caption,
    lineHeight: 20,
  },
  cardFooter: {
    marginTop: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  metaPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingVertical: 4,
    paddingHorizontal: 10,
    backgroundColor: theme.colors.surfaceElevated,
  },
  metaText: {
    color: theme.colors.textPrimary,
    fontSize: 12,
    fontWeight: "700",
  },
  statusText: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    fontWeight: "600",
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  emptyTitle: {
    color: theme.colors.textPrimary,
    marginTop: 12,
    marginBottom: 8,
    fontSize: theme.typography.h3,
    fontWeight: "700",
    textAlign: "center",
  },
  emptyText: {
    color: theme.colors.textSecondary,
    textAlign: "center",
    marginBottom: 16,
  },
  fab: {
    position: "absolute",
    bottom: 28,
    left: theme.spacing.lg,
    right: theme.spacing.lg,
  },
  fabButton: {
    ...theme.shadow.glow,
  },
  backButton: {
    position: "absolute",
    top: 16,
    right: 26,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    opacity: 0.8,
  },
  backText: {
    color: theme.colors.textSecondary,
    fontSize: 12,
  },
});
