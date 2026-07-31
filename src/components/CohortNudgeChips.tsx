import React, { memo, useEffect, useRef } from "react";
import { Text } from "./AppText";
import {
  ActivityIndicator,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { Flame, Heart, MessageSquare } from "lucide-react-native";
import type { AppTheme } from "../styles/theme";
import type { PresetChallengeNudgeKind } from "../types/groupChallenge";
import { withAlpha } from "../styles/theme";

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

/**
 * Wraps chip content and plays a quick scale-pop the moment `sent` flips
 * false -> true, mirroring the community feed's cheer-button bounce
 * (1 -> 1.14 -> 1) so sending a nudge lands with the same reward feedback
 * cheering already gets, instead of just a silent label swap.
 */
function SentPopFlourish({ sent, children }: { sent: boolean; children: React.ReactNode }) {
  const scale = useRef(new Animated.Value(1)).current;
  const wasSent = useRef(sent);

  useEffect(() => {
    if (sent && !wasSent.current) {
      Animated.sequence([
        Animated.spring(scale, { toValue: 1.14, useNativeDriver: true, speed: 30, bounciness: 10 }),
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 6 }),
      ]).start();
    }
    wasSent.current = sent;
  }, [sent, scale]);

  return <Animated.View style={{ transform: [{ scale }] }}>{children}</Animated.View>;
}

type Props = {
  theme: AppTheme;
  isDark: boolean;
  memberId: string;
  nudgeBusyKey: string | null;
  onPress: (kind: PresetChallengeNudgeKind) => void;
  /** When true, preset + custom nudges are locked (HabitPro Community). */
  plusLocked: boolean;
  onPlusLocked?: () => void;
  /** Preset nudge kinds already sent to this member today (UTC). */
  sentPresetNudgeKindsToday?: ReadonlySet<PresetChallengeNudgeKind>;
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
  sentPresetNudgeKindsToday,
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
      contentContainerStyle={styles.scrollContent}
      style={styles.scroll}
    >
      {NUDGE_SPECS.map(({ kind, label, subtitle, Icon, glyph, suffixGlyph, bgLight, bgDark }) => {
        const busy = nudgeBusyKey === `${memberId}-${kind}`;
        const presetLocked = plusLocked;
        const sentToday = sentPresetNudgeKindsToday?.has(kind) === true;
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
            disabled={busy || sentToday}
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
                    ? isDark ? withAlpha(theme.colors.indigo[400], 22) : withAlpha(theme.colors.indigo[500], 20)
                    : kind === "ping"
                      ? isDark ? withAlpha(theme.colors.cyan[400], 22) : withAlpha(theme.colors.cyan[500], 22)
                      : isDark ? withAlpha(theme.colors.yellow[400], 22) : withAlpha(theme.colors.amber[500], 22),
                opacity: presetLocked || sentToday ? 0.55 : busy ? 0.5 : pressed ? 0.92 : 1,
                transform: [{ scale: pressed && !busy && !sentToday ? 0.98 : 1 }],
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel={sentToday ? `${label} sent today` : label}
          >
            {busy ? (
              <ActivityIndicator size="small" color={iconColor} />
            ) : (
              <SentPopFlourish sent={sentToday}>
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
                    {sentToday ? "Sent today" : subtitle}
                  </Text>
                </View>
              </SentPopFlourish>
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
          <SentPopFlourish sent={customNoteSentToday}>
            <View style={styles.chipInner}>
              <View style={styles.chipTitleRow}>
                <MessageSquare size={theme.icon.sm} color={customIcon} strokeWidth={2.2} />
                <Text style={[styles.chipLabel, { color: theme.colors.textPrimary }]} numberOfLines={1}>
                  {customNoteSentToday ? "Note sent" : "Note"}
                </Text>
              </View>
              <Text style={[styles.chipSubtitle, { color: theme.colors.textMuted }]} numberOfLines={1}>
                {customNoteSentToday ? "Sent today" : "Send a note"}
              </Text>
            </View>
          </SentPopFlourish>
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
