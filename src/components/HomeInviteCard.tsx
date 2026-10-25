import { StyleSheet, View } from "react-native";
import { Users, Zap } from "lucide-react-native";
import { Text } from "./AppText";
import { Button } from "./Button";
import { PulsingBorder } from "./PulsingBorder";
import { useTheme } from "../context/ThemeContext";
import { withAlpha } from "../styles/theme";
import { formatRelativeTime } from "../lib/communityWinFeedFormat";
import type { HomeInvitePreview } from "../lib/homeInvitePreview";

/**
 * Shown on Home when there's a fresh invite waiting (same slot and look as
 * MissionOutcomeCard). Accepting stays on the Invites tab, which runs the room
 * rules commitment and creates the local habit; this card only takes you there.
 */
type Props = {
  invite: HomeInvitePreview;
  /** Fresh invites waiting in total, including this one. */
  total: number;
  nowMs: number;
  onOpen: () => void;
};

function expiresInLabel(expiresAt: string, nowMs: number): string | null {
  const left = new Date(expiresAt).getTime() - nowMs;
  if (!Number.isFinite(left) || left <= 0) return null;
  const mins = Math.ceil(left / 60_000);
  if (mins < 60) return `expires in ${mins} min`;
  const hours = Math.round(mins / 60);
  return `expires in ${hours}h`;
}

export function HomeInviteCard({ invite, total, nowMs, onOpen }: Props) {
  const { theme, isDark } = useTheme();
  const isLive = invite.kind === "live";
  const accent = isDark ? theme.colors.green[500] : theme.colors.green[600];
  const who = invite.inviterUsername ?? "Someone";
  const expiry = invite.expiresAt ? expiresInLabel(invite.expiresAt, nowMs) : null;
  const meta = isLive
    ? [invite.plannedMinutes ? `${invite.plannedMinutes} min` : null, expiry].filter(Boolean).join(" · ")
    : formatRelativeTime(invite.createdAt);
  const more = total - 1;

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.surface,
          borderColor: withAlpha(accent, isDark ? 35 : 30),
        },
      ]}
    >
      <View style={styles.top}>
        <View style={styles.kickerRow}>
          {isLive ? <Zap size={13} color={accent} fill={accent} /> : <Users size={13} color={accent} />}
          <Text style={[styles.kicker, { color: accent }]}>{isLive ? "LIVE SQUAD INVITE" : "MISSION INVITE"}</Text>
          <PulsingBorder active color={theme.colors.red[500]} size={8}>
            <View style={[styles.dot, { backgroundColor: theme.colors.red[500] }]} />
          </PulsingBorder>
        </View>
        {more > 0 ? (
          <Text style={[styles.counter, { color: theme.colors.textMuted }]}>
            +{more} more {more === 1 ? "invite" : "invites"}
          </Text>
        ) : null}
      </View>

      <Text style={[styles.title, { color: theme.colors.textPrimary }]} numberOfLines={2}>
        {invite.title}
      </Text>
      <Text style={[styles.stat, { color: theme.colors.textSecondary }]} numberOfLines={1}>
        {who} invited you{meta ? ` · ${meta}` : ""}
      </Text>

      <Button
        title={total > 1 ? "See invites" : "See invite"}
        onPress={onOpen}
        style={{
          marginTop: 14,
          backgroundColor: withAlpha(accent, isDark ? 18 : 10),
          borderWidth: 1,
          borderColor: withAlpha(accent, isDark ? 45 : 32),
        }}
        textStyle={{ color: accent }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 18, borderWidth: 1, padding: 16, marginBottom: 14 },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  kickerRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  kicker: { fontSize: 11, fontWeight: "800", letterSpacing: 1.2 },
  dot: { width: 8, height: 8, borderRadius: 999 },
  counter: { fontSize: 12, fontWeight: "700" },
  title: { fontSize: 18, fontWeight: "800", marginTop: 8 },
  stat: { fontSize: 13, fontWeight: "600", marginTop: 4 },
});
