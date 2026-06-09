import React, { memo } from "react";
import { Text } from "./AppText";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { Flame, Heart, MessageSquare } from "lucide-react-native";
import type { AppTheme } from "../styles/theme";
import type { PresetChallengeNudgeKind } from "../types/groupChallenge";

const NUDGE_SPECS: {
  kind: PresetChallengeNudgeKind;
  label: string;
  subtitle: string;
  Icon?: typeof Heart;
  glyph?: string;
  suffixGlyph?: string;
  bgLight: string;
  bgDark: string;
}[] = [
  {
    kind: "cheer",
    label: "Cheer",
    subtitle: "Show support",
    Icon: Heart,
    bgLight: "rgba(99, 102, 241, 0.08)",
    bgDark: "rgba(129, 140, 248, 0.1)",
  },
  {
    kind: "ping",
    label: "What's up",
    subtitle: "Check in",
    suffixGlyph: "?!",
    bgLight: "rgba(8, 145, 178, 0.06)",
    bgDark: "rgba(34, 211, 238, 0.09)",
  },
  {
    kind: "fire",
    label: "Fire",
    subtitle: "Raise the bar",
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
  /** When true, preset + custom nudges are locked (HabitPro Community). */
  plusLocked: boolean;
  onPlusLocked?: () => void;
  /** True after viewer already sent a custom note to this member today (UTC) in this challenge. */
  customNoteSentToday: boolean;
  onCustomNotePress: () => void;
};

export const CohortNudgeChips = memo(function CohortNudgeChips({
  theme,
  isDark,
  memberId,
  nudgeBusyKey,
  onPress,
  plusLocked,
  onPlusLocked,
  customNoteSentToday,
  onCustomNotePress,
}: Props) {
  const customBusy = nudgeBusyKey === `${memberId}-custom_note`;
  const customBg = isDark ? "rgba(167, 139, 250, 0.1)" : "rgba(124, 58, 237, 0.06)";
  const customBorder = isDark ? "rgba(167, 139, 250, 0.28)" : "rgba(124, 58, 237, 0.22)";
  const customIcon = isDark ? "#c4b5fd" : "#7c3aed";

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      directionalLockEnabled
      canCancelContentTouches={false}
      contentContainerStyle={styles.scrollContent}
      style={styles.scroll}
    >
      {NUDGE_SPECS.map(({ kind, label, subtitle, Icon, glyph, suffixGlyph, bgLight, bgDark }) => {
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
            disabled={busy}
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
                opacity: presetLocked ? 0.55 : busy ? 0.5 : pressed ? 0.92 : 1,
                transform: [{ scale: pressed ? 0.98 : 1 }],
              },
            ]}
          >
            {busy ? (
              <ActivityIndicator size="small" color={iconColor} />
            ) : (
              <View style={styles.chipInner}>
                <View style={styles.chipTitleRow}>
                  {glyph ? (
                    <Text style={[styles.glyph, { color: iconColor }]}>{glyph}</Text>
                  ) : Icon ? (
                    <Icon size={theme.icon.sm} color={iconColor} strokeWidth={2.2} />
                  ) : null}
                  {suffixGlyph ? (
                    <Text style={[styles.glyph, { color: iconColor }]}>{suffixGlyph}</Text>
                  ) : null}
                  <Text style={[styles.chipLabel, { color: theme.colors.textPrimary }]} numberOfLines={1}>
                    {label}
                  </Text>
                </View>
                <Text style={[styles.chipSubtitle, { color: theme.colors.textMuted }]} numberOfLines={1}>
                  {subtitle}
                </Text>
              </View>
            )}
          </Pressable>
        );
      })}

      <Pressable
        disabled={customBusy || customNoteSentToday}
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
            opacity: plusLocked || customNoteSentToday ? 0.55 : customBusy ? 0.5 : pressed ? 0.92 : 1,
            transform: [{ scale: pressed && !customBusy && !customNoteSentToday ? 0.98 : 1 }],
          },
        ]}
      >
        {customBusy ? (
          <ActivityIndicator size="small" color={customIcon} />
        ) : (
          <View style={styles.chipInner}>
            <View style={styles.chipTitleRow}>
              <MessageSquare size={theme.icon.sm} color={customIcon} strokeWidth={2.2} />
              <Text style={[styles.chipLabel, { color: theme.colors.textPrimary }]} numberOfLines={1}>
                {customNoteSentToday ? "Note sent" : "Note"}
              </Text>
              {plusLocked ? <Text style={[styles.proBadge, { color: customIcon }]}>Plus</Text> : null}
            </View>
            <Text style={[styles.chipSubtitle, { color: theme.colors.textMuted }]} numberOfLines={1}>
              Send a note
            </Text>
          </View>
        )}
      </Pressable>
    </ScrollView>
  );
});

CohortNudgeChips.displayName = "CohortNudgeChips";

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
    alignItems: "stretch",
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 46,
    minWidth: 92,
    justifyContent: "center",
  },
  chipInner: {
    gap: 1,
    minWidth: 0,
  },
  chipTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minWidth: 0,
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
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  chipLabel: {
    flexShrink: 1,
    minWidth: 0,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "900",
    letterSpacing: 0.15,
  },
  chipSubtitle: {
    fontSize: 9,
    lineHeight: 12,
    fontWeight: "700",
    letterSpacing: 0.12,
  },
});
