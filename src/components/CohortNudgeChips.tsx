import { Text } from "./AppText";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
} from "react-native";
import { Flame, Heart, MessageSquare } from "lucide-react-native";
import type { AppTheme } from "../styles/theme";
import type { PresetChallengeNudgeKind } from "../types/groupChallenge";

const NUDGE_SPECS: {
  kind: PresetChallengeNudgeKind;
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
  onPress: (kind: PresetChallengeNudgeKind) => void;
  /** When true, preset + custom nudges are locked (Habit Plus). */
  plusLocked: boolean;
  onPlusLocked?: () => void;
  /** True after viewer already sent a custom note to this member in this challenge. */
  customNoteAlreadySent: boolean;
  onCustomNotePress: () => void;
};

export function CohortNudgeChips({
  theme,
  isDark,
  memberId,
  nudgeBusyKey,
  onPress,
  plusLocked,
  onPlusLocked,
  customNoteAlreadySent,
  onCustomNotePress,
}: Props) {
  const busyGlobal = nudgeBusyKey !== null;

  const customBusy = nudgeBusyKey === `${memberId}-custom_note`;
  const customBg = isDark ? "rgba(167, 139, 250, 0.1)" : "rgba(124, 58, 237, 0.06)";
  const customBorder = isDark ? "rgba(167, 139, 250, 0.28)" : "rgba(124, 58, 237, 0.22)";
  const customIcon = isDark ? "#c4b5fd" : "#7c3aed";

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.scrollContent}
      style={styles.scroll}
    >
      {NUDGE_SPECS.map(({ kind, label, Icon, glyph, suffixGlyph, bgLight, bgDark }) => {
        const busy = nudgeBusyKey === `${memberId}-${kind}`;
        const presetLocked = plusLocked;
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
            onPress={() => {
              if (presetLocked) {
                onPlusLocked?.();
                return;
              }
              onPress(kind);
            }}
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
                opacity: presetLocked ? 0.55 : busyGlobal && !busy ? 0.45 : pressed ? 0.92 : 1,
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

      <Pressable
        disabled={busyGlobal || customNoteAlreadySent}
        onPress={() => {
          if (plusLocked) {
            onPlusLocked?.();
            return;
          }
          onCustomNotePress();
        }}
        style={({ pressed }) => [
          styles.chip,
          styles.customChip,
          {
            backgroundColor: customBg,
            borderColor: customBorder,
            opacity: plusLocked || customNoteAlreadySent ? 0.55 : busyGlobal ? 0.5 : pressed ? 0.92 : 1,
            transform: [{ scale: pressed && !busyGlobal && !customNoteAlreadySent ? 0.98 : 1 }],
          },
        ]}
      >
        {customBusy ? (
          <ActivityIndicator size="small" color={customIcon} />
        ) : (
          <>
            <MessageSquare size={theme.icon.sm} color={customIcon} strokeWidth={2.2} />
            <Text style={[styles.chipLabel, { color: theme.colors.textSecondary }]}>
              {customNoteAlreadySent ? "Note sent" : "Note"}
            </Text>
            {plusLocked ? <Text style={[styles.proBadge, { color: customIcon }]}>Plus</Text> : null}
          </>
        )}
      </Pressable>
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
  customChip: {
    borderWidth: 1,
  },
  proBadge: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.4,
    marginLeft: 2,
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
