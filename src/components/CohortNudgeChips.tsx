import { Text } from "./AppText";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
} from "react-native";
import { Flame, Heart } from "lucide-react-native";
import type { AppTheme } from "../styles/theme";
import type { ChallengeNudgeKind } from "../types/groupChallenge";

const NUDGE_SPECS: {
  kind: ChallengeNudgeKind;
  label: string;
  Icon?: typeof Heart;
  glyph?: string;
  suffixGlyph?: string;
  bgLight: string;
  bgDark: string;
}[] = [
  {
    kind: "cheer",
    label: "Cheer",
    Icon: Heart,
    bgLight: "rgba(99, 102, 241, 0.08)",
    bgDark: "rgba(129, 140, 248, 0.1)",
  },
  {
    kind: "ping",
    label: "What's up",
    suffixGlyph: "?!",
    bgLight: "rgba(8, 145, 178, 0.06)",
    bgDark: "rgba(34, 211, 238, 0.09)",
  },
  {
    kind: "fire",
    label: "Fire",
    Icon: Flame,
    bgLight: "rgba(217, 119, 6, 0.08)",
    bgDark: "rgba(251, 191, 36, 0.1)",
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
      {NUDGE_SPECS.map(({ kind, label, Icon, glyph, suffixGlyph, bgLight, bgDark }) => {
        const busy = nudgeBusyKey === `${memberId}-${kind}`;
        const bg = isDark ? bgDark : bgLight;
        const iconColor =
          kind === "cheer"
            ? theme.colors.indigo[400]
            : kind === "ping"
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
                borderColor:
                  kind === "cheer"
                    ? isDark
                      ? "rgba(129, 140, 248, 0.22)"
                      : "rgba(99, 102, 241, 0.2)"
                    : kind === "ping"
                      ? isDark
                        ? "rgba(34, 211, 238, 0.22)"
                        : "rgba(6, 182, 212, 0.22)"
                      : isDark
                        ? "rgba(251, 191, 36, 0.22)"
                        : "rgba(217, 119, 6, 0.22)",
                opacity: busyGlobal && !busy ? 0.45 : pressed ? 0.92 : 1,
                transform: [{ scale: pressed ? 0.98 : 1 }],
              },
            ]}
          >
            {busy ? (
              <ActivityIndicator size="small" color={iconColor} />
            ) : (
              <>
                {glyph ? (
                  <Text style={[styles.glyph, { color: iconColor }]}>{glyph}</Text>
                ) : Icon ? (
                  <Icon size={theme.icon.sm} color={iconColor} strokeWidth={2.2} />
                ) : null}
                <Text style={[styles.chipLabel, { color: theme.colors.textSecondary }]}>{label}</Text>
                {suffixGlyph ? (
                  <Text style={[styles.glyph, { color: iconColor }]}>{suffixGlyph}</Text>
                ) : null}
              </>
            )}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { marginHorizontal: -4, marginTop: 8 },
  scrollContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 4,
    paddingVertical: 0,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 30,
  },
  glyph: {
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  chipLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.15,
  },
});
