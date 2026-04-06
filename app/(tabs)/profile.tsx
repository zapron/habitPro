import { useMemo, useState } from "react";
import type { ComponentType } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, StatusBar } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Settings, Zap, Globe, User, Target, Flame } from "lucide-react-native";
import { Screen } from "../../src/components/Screen";
import { useTheme } from "../../src/context/ThemeContext";
import { useAuth } from "../../src/context/AuthContext";
import { useHabitStore } from "../../src/store/habitStore";
import { isSupabaseConfigured } from "../../src/lib/env";
import { SettingsModal } from "../../src/components/SettingsModal";
import type { AppTheme } from "../../src/styles/theme";

type LucideIcon = ComponentType<{ size?: number; color?: string }>;

/** Single-line label that scales down on narrow tiles instead of wrapping. */
function FigureLabel({ color, children }: { color: string; children: string }) {
  return (
    <Text
      style={[hubVisStyles.figureLbl, { color }]}
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.62}
      maxFontSizeMultiplier={1.1}
    >
      {children}
    </Text>
  );
}

function VisibilityHabitColumn({
  theme,
  isDark,
  title,
  Icon,
  accent,
  active,
  done,
}: {
  theme: AppTheme;
  isDark: boolean;
  title: string;
  Icon: LucideIcon;
  accent: string;
  active: number;
  done: number;
}) {
  return (
    <View
      style={[
        hubVisStyles.visCol,
        {
          borderColor: accent + "55",
          backgroundColor: isDark ? accent + "14" : accent + "10",
        },
      ]}
    >
      <View style={hubVisStyles.visColHead}>
        <Icon size={14} color={accent} />
        <Text style={[hubVisStyles.visColTitle, { color: accent }]}>{title}</Text>
      </View>
      <View style={hubVisStyles.figureRow}>
        <View
          style={[
            hubVisStyles.figureTile,
            { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceElevated },
          ]}
        >
          <FigureLabel color={theme.colors.textMuted}>ACTIVE</FigureLabel>
          <Text style={[hubVisStyles.figureNum, { color: theme.colors.textPrimary }]}>{active}</Text>
        </View>
        <View
          style={[
            hubVisStyles.figureTile,
            { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceElevated },
          ]}
        >
          <FigureLabel color={theme.colors.textMuted}>DONE</FigureLabel>
          <Text style={[hubVisStyles.figureNum, { color: theme.colors.textPrimary }]}>{done}</Text>
        </View>
      </View>
    </View>
  );
}

function VisibilityMiniColumn({
  theme,
  isDark,
  title,
  Icon,
  accent,
  live,
  completed,
}: {
  theme: AppTheme;
  isDark: boolean;
  title: string;
  Icon: LucideIcon;
  accent: string;
  live: number;
  completed: number;
}) {
  return (
    <View
      style={[
        hubVisStyles.visCol,
        {
          borderColor: accent + "55",
          backgroundColor: isDark ? accent + "14" : accent + "10",
        },
      ]}
    >
      <View style={hubVisStyles.visColHead}>
        <Icon size={14} color={accent} />
        <Text style={[hubVisStyles.visColTitle, { color: accent }]}>{title}</Text>
      </View>
      <View style={hubVisStyles.figureRow}>
        <View
          style={[
            hubVisStyles.figureTile,
            { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceElevated },
          ]}
        >
          <FigureLabel color={theme.colors.textMuted}>ACTIVE</FigureLabel>
          <Text style={[hubVisStyles.figureNum, { color: theme.colors.amber[500] }]}>{live}</Text>
        </View>
        <View
          style={[
            hubVisStyles.figureTile,
            { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceElevated },
          ]}
        >
          <FigureLabel color={theme.colors.textMuted}>DONE</FigureLabel>
          <Text style={[hubVisStyles.figureNum, { color: theme.colors.textPrimary }]}>{completed}</Text>
        </View>
      </View>
    </View>
  );
}

const hubVisStyles = StyleSheet.create({
  visCol: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    padding: 10,
    gap: 10,
  },
  visColHead: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 },
  visColTitle: { fontSize: 11, fontWeight: "900", letterSpacing: 0.8 },
  figureRow: { flexDirection: "row", gap: 6 },
  figureTile: {
    flex: 1,
    minWidth: 0,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 5,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  figureLbl: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.15,
    textAlign: "center",
    width: "100%",
  },
  figureNum: { fontSize: 20, fontWeight: "900", fontVariant: ["tabular-nums"] },
});

export default function ProfileScreen() {
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const xp = useHabitStore((s) => s.xp);
  const habits = useHabitStore((s) => s.habits);
  const miniMissions = useHabitStore((s) => s.miniMissions);

  const level = Math.floor(xp / 100);
  const xpInLevel = xp % 100;

  const missionStats = useMemo(() => {
    const visibilityBucket = (v: string | undefined): "public" | "solo" =>
      v === "public" ? "public" : "solo";

    const habitDone = (h: (typeof habits)[0]) => h.isCompleted;
    const habitActive = (h: (typeof habits)[0]) => !h.isCompleted;
    const miniDone = (m: (typeof miniMissions)[0]) => m.status === "completed";
    const miniLive = (m: (typeof miniMissions)[0]) =>
      m.status === "in_progress" || m.status === "pending" || m.status === "scheduled";

    let pubHabitsDone = 0;
    let pubHabitsActive = 0;
    let soloHabitsDone = 0;
    let soloHabitsActive = 0;
    for (const h of habits) {
      const bucket = visibilityBucket(h.visibility);
      if (habitDone(h)) {
        if (bucket === "public") pubHabitsDone += 1;
        else soloHabitsDone += 1;
      } else if (habitActive(h)) {
        if (bucket === "public") pubHabitsActive += 1;
        else soloHabitsActive += 1;
      }
    }

    let pubMiniDone = 0;
    let pubMiniLive = 0;
    let soloMiniDone = 0;
    let soloMiniLive = 0;
    for (const m of miniMissions) {
      const bucket = visibilityBucket(m.visibility);
      if (miniDone(m)) {
        if (bucket === "public") pubMiniDone += 1;
        else soloMiniDone += 1;
      } else if (miniLive(m)) {
        if (bucket === "public") pubMiniLive += 1;
        else soloMiniLive += 1;
      }
    }

    return {
      habitsTotal: habits.length,
      minisTotal: miniMissions.length,
      pub: {
        habitsDone: pubHabitsDone,
        habitsActive: pubHabitsActive,
        miniDone: pubMiniDone,
        miniLive: pubMiniLive,
      },
      solo: {
        habitsDone: soloHabitsDone,
        habitsActive: soloHabitsActive,
        miniDone: soloMiniDone,
        miniLive: soloMiniLive,
      },
    };
  }, [habits, miniMissions]);

  const bottomPad = Math.max(insets.bottom, 16) + 8;
  const showAccount = isSupabaseConfigured();
  const email = session?.user?.email;

  return (
    <Screen>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={theme.colors.background} />

      <View style={styles.headerRow}>
        <View>
          <Text style={[styles.title, { color: theme.colors.textPrimary, fontSize: theme.typography.h1 }]}>Profile</Text>
          <Text style={[styles.subtitle, { color: theme.colors.textSecondary, fontSize: theme.typography.caption }]}>
            Your progress at a glance
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => setSettingsOpen(true)}
          style={[styles.gearBtn, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
          activeOpacity={0.85}
        >
          <Settings size={20} color={theme.colors.textPrimary} />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: bottomPad }}>
        <View style={[styles.hero, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, ...theme.shadow.card }]}>
          <View style={[styles.levelOrb, { borderColor: theme.colors.indigo[500] }]}>
            <Text style={[styles.levelHuge, { color: theme.colors.yellow[400] }]}>{level}</Text>
            <Text style={[styles.levelTag, { color: theme.colors.textMuted }]}>LEVEL</Text>
          </View>
          <View style={styles.heroText}>
            <View style={styles.xpLine}>
              <Zap size={16} color={theme.colors.yellow[400]} fill={theme.colors.yellow[400]} />
              <Text style={[styles.xpBig, { color: theme.colors.textPrimary }]}>
                {xpInLevel} / 100 <Text style={{ color: theme.colors.textMuted, fontWeight: "600" }}>XP this level</Text>
              </Text>
            </View>
            <Text style={[styles.totalXp, { color: theme.colors.textSecondary }]}>Total XP: {xp}</Text>
            {showAccount && email ? (
              <Text style={[styles.email, { color: theme.colors.textMuted }]} numberOfLines={1}>
                {email}
              </Text>
            ) : null}
          </View>
        </View>

        <Text style={[styles.sectionLabel, { color: theme.colors.textMuted }]}>HABITS & MISSIONS</Text>

        <View
          style={[
            styles.missionsHub,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
              ...theme.shadow.card,
            },
          ]}
        >
          <Text style={[styles.hubMegaTitle, { color: theme.colors.textPrimary }]}>At a glance</Text>

          <View style={styles.hubHeroRow}>
            <View style={styles.hubHeroCol}>
              <Text style={[styles.hubHeroLabel, { color: theme.colors.textMuted }]}>HABITS</Text>
              <Text style={[styles.hubHeroNum, { color: theme.colors.textPrimary }]}>{missionStats.habitsTotal}</Text>
            </View>
            <View style={[styles.hubHeroDivider, { backgroundColor: theme.colors.border }]} />
            <View style={styles.hubHeroCol}>
              <Text style={[styles.hubHeroLabel, { color: theme.colors.textMuted }]}>MINI</Text>
              <Text style={[styles.hubHeroNum, { color: theme.colors.textPrimary }]}>{missionStats.minisTotal}</Text>
            </View>
          </View>

          <View
            style={[
              styles.hubNested,
              {
                borderColor: theme.colors.border,
                backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(15, 23, 42, 0.04)",
              },
            ]}
          >
            {/* Habits: Public | Solo with Active + Done figures */}
            <View style={styles.hubSubSectionHead}>
              <Target size={16} color={theme.colors.cyan[400]} />
              <Text style={[styles.hubSubSectionTitle, { color: theme.colors.textPrimary }]}>Habits</Text>
            </View>
            <View style={[styles.hubVisRow, { gap: 10 }]}>
              <VisibilityHabitColumn
                theme={theme}
                isDark={isDark}
                title="Public"
                Icon={Globe}
                accent={theme.colors.cyan[400]}
                active={missionStats.pub.habitsActive}
                done={missionStats.pub.habitsDone}
              />
              <VisibilityHabitColumn
                theme={theme}
                isDark={isDark}
                title="Solo"
                Icon={User}
                accent={theme.colors.indigo[400]}
                active={missionStats.solo.habitsActive}
                done={missionStats.solo.habitsDone}
              />
            </View>

            <View style={[styles.hubSubSectionDivider, { backgroundColor: theme.colors.border }]} />

            {/* Mini: Public | Solo with Live + Completed figures */}
            <View style={styles.hubSubSectionHead}>
              <Flame size={16} color={theme.colors.amber[500]} />
              <Text style={[styles.hubSubSectionTitle, { color: theme.colors.textPrimary }]}>Mini missions</Text>
            </View>
            <View style={[styles.hubVisRow, { gap: 10 }]}>
              <VisibilityMiniColumn
                theme={theme}
                isDark={isDark}
                title="Public"
                Icon={Globe}
                accent={theme.colors.cyan[400]}
                live={missionStats.pub.miniLive}
                completed={missionStats.pub.miniDone}
              />
              <VisibilityMiniColumn
                theme={theme}
                isDark={isDark}
                title="Solo"
                Icon={User}
                accent={theme.colors.indigo[400]}
                live={missionStats.solo.miniLive}
                completed={missionStats.solo.miniDone}
              />
            </View>
          </View>
        </View>

        <Text style={[styles.footerHint, { color: theme.colors.textMuted }]}>
          Charts, streak heatmaps, and richer public profile cards can build on this hub later.
        </Text>
      </ScrollView>

      <SettingsModal visible={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 20,
  },
  title: { fontWeight: "800", marginBottom: 4 },
  subtitle: {},
  gearBtn: {
    width: 44,
    height: 44,
    borderRadius: 9999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  hero: {
    flexDirection: "row",
    borderRadius: 18,
    borderWidth: 1,
    padding: 18,
    marginBottom: 22,
    gap: 16,
    alignItems: "center",
  },
  levelOrb: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 3,
    alignItems: "center",
    justifyContent: "center",
  },
  levelHuge: { fontSize: 32, fontWeight: "900" },
  levelTag: { fontSize: 9, fontWeight: "800", letterSpacing: 1 },
  heroText: { flex: 1, gap: 6 },
  xpLine: { flexDirection: "row", alignItems: "center", gap: 8 },
  xpBig: { fontSize: 17, fontWeight: "800" },
  totalXp: { fontSize: 13 },
  email: { fontSize: 12, marginTop: 4 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
    marginBottom: 10,
  },
  missionsHub: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    marginBottom: 4,
  },
  hubMegaTitle: {
    fontWeight: "800",
    fontSize: 13,
    fontStyle: "italic",
    marginBottom: 14,
    opacity: 0.9,
  },
  hubHeroRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 18,
  },
  hubHeroCol: { flex: 1, alignItems: "center" },
  hubHeroLabel: {
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.4,
    marginBottom: 4,
  },
  hubHeroNum: {
    fontSize: 40,
    fontWeight: "900",
    fontVariant: ["tabular-nums"],
    lineHeight: 44,
  },
  hubHeroDivider: { width: 1, alignSelf: "stretch", minHeight: 52, opacity: 0.5 },
  hubNested: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    gap: 6,
  },
  hubSubSectionHead: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4, marginBottom: 10 },
  hubSubSectionTitle: { fontSize: 14, fontWeight: "800" },
  hubVisRow: { flexDirection: "row" },
  hubSubSectionDivider: { height: 1, marginVertical: 14, opacity: 0.5 },
  footerHint: { fontSize: 12, lineHeight: 18, marginTop: 20, fontStyle: "italic" },
});
