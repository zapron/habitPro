import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Copy, Flame, Heart } from "lucide-react-native";
import type { AppTheme } from "../styles/theme";
import type { ChallengeNudgeKind } from "../types/groupChallenge";

const NUDGE_SPECS: {
  kind: ChallengeNudgeKind;
  label: string;
  Icon: typeof Heart;
  bgLight: string;
  bgDark: string;
}[] = [
  {
    kind: "cheer",
    label: "Cheer",
    Icon: Heart,
    bgLight: "rgba(99, 102, 241, 0.14)",
    bgDark: "rgba(129, 140, 248, 0.18)",
  },
  {
    kind: "same",
    label: "Same",
    Icon: Copy,
    bgLight: "rgba(8, 145, 178, 0.12)",
    bgDark: "rgba(34, 211, 238, 0.14)",
  },
  {
    kind: "fire",
    label: "Fire",
    Icon: Flame,
    bgLight: "rgba(217, 119, 6, 0.14)",
    bgDark: "rgba(251, 191, 36, 0.16)",
  },
];

type Props = {
  theme: AppTheme;
  isDark: boolean;
  memberId: string;
  nudgeBusyKey: string | null;
  onPress: (kind: ChallengeNudgeKind) => void;
};

export function CohortNudgeChips({ theme, isDark, memberId, nudgeBusyKey, onPress }: Props) {
  const busyGlobal = nudgeBusyKey !== null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.scrollContent}
      style={styles.scroll}
    >
      {NUDGE_SPECS.map(({ kind, label, Icon, bgLight, bgDark }) => {
        const busy = nudgeBusyKey === `${memberId}-${kind}`;
        const bg = isDark ? bgDark : bgLight;
        const iconColor =
          kind === "cheer"
            ? theme.colors.indigo[400]
            : kind === "same"
              ? theme.colors.cyan[400]
              : theme.colors.amber[500];

        return (
          <Pressable
            key={kind}
            disabled={busyGlobal}
            onPress={() => onPress(kind)}
            style={({ pressed }) => [
              styles.chip,
              {
                backgroundColor: bg,
                opacity: busyGlobal && !busy ? 0.45 : pressed ? 0.92 : 1,
                transform: [{ scale: pressed ? 0.98 : 1 }],
              },
            ]}
          >
            {busy ? (
              <ActivityIndicator size="small" color={iconColor} />
            ) : (
              <>
                <Icon size={theme.icon.md} color={iconColor} strokeWidth={2.4} />
                <Text style={[styles.chipLabel, { color: theme.colors.textPrimary }]}>{label}</Text>
              </>
            )}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { marginHorizontal: -4, marginTop: 12 },
  scrollContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 9999,
    minHeight: 40,
  },
  chipLabel: {
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
});
