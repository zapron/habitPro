import { memo, useState, type ReactNode } from "react";
import { Image, Pressable, StyleSheet, View } from "react-native";
import { MoreHorizontal } from "lucide-react-native";
import { Text } from "./AppText";
import { useTheme } from "../context/ThemeContext";
import type { StreakMemoryTaskEntry } from "../types/habit";

/**
 * Mini mission screen while the run is live: your moments as a running log,
 * newest first (same as the squad feed). Each row has ⋯ for Edit / Delete.
 * Neutrals only; the newest (top) dot is green. After the run it is the
 * read-only List view (no onOptions: no ⋯, no green dot).
 */

const MIN_RATIO = 0.6;
const MAX_RATIO = 1.8;

function intoRun(loggedAt: string | undefined, startedAt: string | null | undefined): string | null {
  if (!loggedAt || !startedAt) return null;
  const ms = Date.parse(loggedAt) - Date.parse(startedAt);
  if (!Number.isFinite(ms) || ms < 0) return null;
  const m = Math.floor(ms / 60000);
  if (m < 1) return "at start";
  const h = Math.floor(m / 60);
  return `${h > 0 ? `${h}h ${m % 60}m` : `${m}m`} in`;
}

type Props = {
  entries: StreakMemoryTaskEntry[];
  startedAt?: string | null;
  title: string;
  /** Edit / Delete while the run is live; omit for the read-only finished log. */
  onOptions?: (taskId: string, label: string) => void;
  onOpenPhoto?: (uri: string) => void;
  /** Trailing header control (the List | Cards toggle on a finished run). */
  headerRight?: ReactNode;
};

export const MiniMomentLog = memo(function MiniMomentLog({ entries, startedAt, title, onOptions, onOpenPhoto, headerRight }: Props) {
  const { theme, isDark } = useTheme();
  const green = isDark ? theme.colors.green[500] : theme.colors.green[600];
  const [ratios, setRatios] = useState<Record<string, number>>({});
  const ordered = [...entries].sort(
    (a, b) => (Date.parse(b.loggedAt ?? "") || 0) - (Date.parse(a.loggedAt ?? "") || 0),
  );

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Text style={[styles.label, { color: theme.colors.textMuted }]}>{title}</Text>
        {headerRight ??
          (onOptions && ordered.length > 0 ? (
            <Text style={[styles.hint, { color: theme.colors.textMuted }]}>Editable until you finish</Text>
          ) : null)}
      </View>
      {ordered.length === 0 ? (
        <Text style={[styles.empty, { color: theme.colors.textSecondary }]}>
          Nothing logged yet. Add your first moment below.
        </Text>
      ) : (
        ordered.map((e, i) => {
          const uri = e.proofUrls[0];
          const meta = intoRun(e.loggedAt, startedAt);
          const newest = i === 0 && Boolean(onOptions);
          const last = i === ordered.length - 1;
          const ratio = ratios[e.taskId] ?? 4 / 3;
          return (
            <View key={e.taskId} style={styles.row}>
              <View style={styles.rail}>
                <View style={[styles.dot, { backgroundColor: newest ? green : theme.colors.textMuted }]} />
                {!last ? <View style={[styles.line, { backgroundColor: theme.colors.border }]} /> : null}
              </View>
              <View style={styles.body}>
                <View style={styles.metaRow}>
                  <Text style={[styles.entryLabel, { color: theme.colors.textPrimary }]} numberOfLines={1}>
                    {e.label}
                  </Text>
                  {meta ? <Text style={[styles.meta, { color: theme.colors.textMuted }]}>{meta}</Text> : null}
                  {onOptions ? (
                    <Pressable
                      onPress={() => onOptions(e.taskId, e.label)}
                      hitSlop={10}
                      accessibilityRole="button"
                      accessibilityLabel={`Edit or delete ${e.label}`}
                      style={({ pressed }) => [styles.options, { opacity: pressed ? 0.6 : 1 }]}
                    >
                      <MoreHorizontal size={18} color={theme.colors.textMuted} />
                    </Pressable>
                  ) : null}
                </View>
                {uri ? (
                  <Pressable
                    onPress={onOpenPhoto ? () => onOpenPhoto(uri) : undefined}
                    disabled={!onOpenPhoto}
                    accessibilityRole="imagebutton"
                    accessibilityLabel={`View ${e.label}`}
                  >
                    <Image
                      source={{ uri }}
                      style={[styles.photo, { aspectRatio: ratio, backgroundColor: theme.colors.surfaceElevated }]}
                      resizeMode="cover"
                      resizeMethod="resize"
                      fadeDuration={120}
                      onLoad={(ev) => {
                        const { width, height } = ev.nativeEvent.source ?? {};
                        if (width && height) {
                          const r = Math.min(MAX_RATIO, Math.max(MIN_RATIO, width / height));
                          setRatios((prev) => (prev[e.taskId] === r ? prev : { ...prev, [e.taskId]: r }));
                        }
                      }}
                    />
                  </Pressable>
                ) : null}
                {e.note?.trim() ? (
                  <View style={[styles.bubble, { backgroundColor: theme.colors.surfaceElevated }]}>
                    <Text style={[styles.note, { color: theme.colors.textPrimary }]}>{e.note.trim()}</Text>
                  </View>
                ) : !uri ? (
                  <Text style={[styles.meta, { color: theme.colors.textMuted }]}>Marked done</Text>
                ) : null}
              </View>
            </View>
          );
        })
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  section: { gap: 12, marginTop: 20 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 34 },
  label: { fontSize: 12, fontWeight: "900", letterSpacing: 1.2, textTransform: "uppercase" },
  hint: { fontSize: 12, fontWeight: "600" },
  empty: { fontSize: 14, lineHeight: 20 },
  row: { flexDirection: "row", gap: 10 },
  rail: { width: 14, alignItems: "center", paddingTop: 6, gap: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  line: { flex: 1, width: StyleSheet.hairlineWidth * 2, marginBottom: -12 },
  body: { flex: 1, minWidth: 0, gap: 6 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  entryLabel: { fontSize: 14, fontWeight: "800", flexShrink: 1 },
  meta: { fontSize: 12, fontWeight: "500", fontVariant: ["tabular-nums"] },
  options: { marginLeft: "auto", width: 32, height: 24, alignItems: "flex-end", justifyContent: "center" },
  photo: { width: "100%", maxHeight: 320, borderRadius: 16 },
  bubble: { alignSelf: "flex-start", maxWidth: "100%", borderRadius: 16, paddingHorizontal: 13, paddingVertical: 9 },
  note: { fontSize: 15, lineHeight: 21 },
});
