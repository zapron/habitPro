import { useState } from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, View } from "react-native";
import { ChevronDown, ChevronRight, Play } from "lucide-react-native";
import { Text } from "../../components/AppText";
import { useTheme } from "../../context/ThemeContext";
import { withAlpha } from "../../styles/theme";
import { VideoMomentPlayer } from "./VideoMomentPlayer";

/** A checklist day's Chapter: unlocked and waiting, or already on this day. */
export type ChecklistChapter =
  | { kind: "ready"; chapter: number; daysLeft: number }
  | { kind: "added"; videoUrl: string; posterUrl: string };

type Props = {
  chapter: ChecklistChapter;
  /** Compressing, uploading and claiming the picked clip. */
  busy: boolean;
  onAdd: () => void;
};

/**
 * The optional Chapter row under a checklist day's tasks. It belongs to the
 * day, not to a task: skipping it leaves it on the next day's sheet until the
 * chapter expires (day 14 of its week pair). Same row shape as TaskProofRow.
 */
export function ChecklistChapterRow({ chapter, busy, onAdd }: Props) {
  const { theme } = useTheme();
  const [previewOpen, setPreviewOpen] = useState(false);
  const amber = theme.colors.amber[500];

  if (chapter.kind === "added") {
    return (
      <View>
        <Pressable
          onPress={() => setPreviewOpen((open) => !open)}
          accessibilityRole="button"
          accessibilityLabel={previewOpen ? "Hide your chapter" : "Show your chapter"}
          style={({ pressed }) => [styles.row, { borderBottomColor: theme.colors.border, opacity: pressed ? 0.7 : 1 }]}
        >
          <View>
            <Image source={{ uri: chapter.posterUrl }} style={[styles.thumb, { backgroundColor: theme.colors.surfaceElevated }]} />
            <View style={[styles.thumbBadge, { backgroundColor: amber, borderColor: theme.colors.surface }]}>
              <Play size={8} color="#ffffff" fill="#ffffff" />
            </View>
          </View>
          <View style={styles.text}>
            <Text style={[styles.label, { color: theme.colors.textPrimary }]} numberOfLines={1}>
              Your Chapter
            </Text>
            <Text style={[styles.meta, { color: theme.colors.textMuted }]} numberOfLines={1}>
              5s clip · goes in this day's post
            </Text>
          </View>
          {previewOpen ? (
            <ChevronDown size={16} color={theme.colors.textMuted} />
          ) : (
            <ChevronRight size={16} color={theme.colors.textMuted} />
          )}
        </Pressable>
        {previewOpen ? (
          <View style={styles.previewWrap}>
            <VideoMomentPlayer
              videoUrl={chapter.videoUrl}
              posterUrl={chapter.posterUrl}
              style={[styles.preview, { borderRadius: theme.radius.md }]}
            />
          </View>
        ) : null}
      </View>
    );
  }

  const daysLeftText = chapter.daysLeft <= 1 ? "last day to add it" : `${chapter.daysLeft} days left`;
  return (
    <Pressable
      onPress={onAdd}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={`Add your Chapter ${chapter.chapter}, ${daysLeftText}`}
      style={({ pressed }) => [styles.row, { borderBottomColor: theme.colors.border, opacity: pressed ? 0.7 : 1 }]}
    >
      <View
        style={[
          styles.thumb,
          styles.thumbCenter,
          styles.thumbDashed,
          { borderColor: amber, backgroundColor: withAlpha(amber, 10) },
        ]}
      >
        {busy ? <ActivityIndicator size="small" color={amber} /> : <Play size={15} color={amber} fill={amber} />}
      </View>
      <View style={styles.text}>
        <Text style={[styles.label, { color: theme.colors.textPrimary }]} numberOfLines={1}>
          {busy ? "Adding your Chapter…" : "Add your Chapter"}
        </Text>
        <Text style={[styles.meta, { color: busy ? theme.colors.textMuted : amber }]} numberOfLines={1}>
          {busy ? "Getting the clip ready" : `Chapter ${chapter.chapter} · 5s clip · ${daysLeftText}`}
        </Text>
      </View>
      {busy ? null : <ChevronRight size={16} color={theme.colors.textMuted} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  thumb: { width: 40, height: 40, borderRadius: 10 },
  thumbCenter: { alignItems: "center", justifyContent: "center" },
  thumbDashed: { borderWidth: 1.5, borderStyle: "dashed" },
  thumbBadge: {
    position: "absolute",
    right: -4,
    bottom: -4,
    width: 17,
    height: 17,
    borderRadius: 9,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    paddingLeft: 1,
  },
  text: { flex: 1, minWidth: 0 },
  label: { fontSize: 14, fontWeight: "700" },
  meta: { fontSize: 11, fontWeight: "600", marginTop: 1 },
  previewWrap: { alignItems: "center", paddingVertical: 10 },
  preview: { width: 168, aspectRatio: 9 / 16 },
});
