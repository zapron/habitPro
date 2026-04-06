import { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Image,
  Pressable,
  StyleSheet,
  Modal,
  Dimensions,
} from "react-native";
import { Bookmark, X } from "lucide-react-native";
import { useTheme } from "../context/ThemeContext";
import type { StreakMemory } from "../types/habit";

type Entry = { dateStr: string; memory: StreakMemory };

type StreakMemoryGalleryProps = {
  entries: Entry[];
  /** Defaults to "Your moments" on own habit detail. */
  sectionTitle?: string;
  sectionHint?: string;
  /**
   * Cohort / remote viewer: local file URIs from another device will not load.
   * Only http(s) images render; otherwise a note-only or placeholder card is shown.
   */
  remotePeer?: boolean;
};

function uriLoadsForRemoteViewer(uri: string | undefined): boolean {
  if (!uri) return false;
  return uri.startsWith("http://") || uri.startsWith("https://");
}

export function StreakMemoryGallery({
  entries,
  sectionTitle = "Your moments",
  sectionHint = "Tap a card to revisit. Moments are view-only after you save them.",
  remotePeer = false,
}: StreakMemoryGalleryProps) {
  const { theme } = useTheme();
  const [open, setOpen] = useState<Entry | null>(null);

  if (entries.length === 0) return null;

  const w = Dimensions.get("window").width;
  const cardW = Math.min(160, (w - 48) / 2.2);
  const viewerUri =
    open?.memory?.imageUrl || open?.memory?.imageUri;

  return (
    <>
      <View style={styles.section}>
        <View style={styles.sectionHead}>
          <Bookmark size={16} color={theme.colors.amber[500]} fill={theme.colors.amber[500]} />
          <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary }]}>{sectionTitle}</Text>
        </View>
        <Text style={[styles.sectionHint, { color: theme.colors.textMuted }]}>{sectionHint}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
          {entries.map(({ dateStr, memory }) => {
            const displayUri = memory.imageUrl || memory.imageUri;
            const showImage =
              Boolean(displayUri) &&
              (!remotePeer || uriLoadsForRemoteViewer(displayUri));
            const hasLocalOnlyPhoto =
              remotePeer &&
              Boolean(memory.imageUri) &&
              !memory.imageUrl &&
              !uriLoadsForRemoteViewer(memory.imageUri);
            return (
            <Pressable
              key={dateStr}
              onPress={() => setOpen({ dateStr, memory })}
              style={[
                styles.card,
                { width: cardW, backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
              ]}
            >
              {showImage ? (
                <Image source={{ uri: displayUri! }} style={styles.thumb} resizeMode="cover" />
              ) : (
                <View style={[styles.thumbPlaceholder, { backgroundColor: theme.colors.surfaceElevated }]}>
                  {hasLocalOnlyPhoto ? (
                    <Text style={[styles.remotePhotoHint, { color: theme.colors.textMuted }]} numberOfLines={3}>
                      Photo on their device (not synced yet)
                    </Text>
                  ) : (
                    <Text style={[styles.quoteMark, { color: theme.colors.indigo[400] }]}>{'\u201C'}</Text>
                  )}
                </View>
              )}
              <Text style={[styles.cardDate, { color: theme.colors.textSecondary }]} numberOfLines={1}>
                {dateStr}
              </Text>
              {memory.note ? (
                <Text style={[styles.cardNote, { color: theme.colors.textMuted }]} numberOfLines={2}>
                  {memory.note}
                </Text>
              ) : null}
            </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <Modal visible={open !== null} transparent animationType="fade" onRequestClose={() => setOpen(null)}>
        <Pressable style={[styles.viewerBackdrop, { backgroundColor: "rgba(0,0,0,0.85)" }]} onPress={() => setOpen(null)}>
          <Pressable style={styles.viewerInner} onPress={(e) => e.stopPropagation()}>
            {viewerUri && (!remotePeer || uriLoadsForRemoteViewer(viewerUri)) ? (
              <Image source={{ uri: viewerUri }} style={styles.viewerImg} resizeMode="contain" />
            ) : null}
            <View style={[styles.viewerMeta, { backgroundColor: theme.colors.surfaceElevated, borderColor: theme.colors.border }]}>
              <Text style={[styles.viewerDate, { color: theme.colors.cyan[400] }]}>{open?.dateStr}</Text>
              {open?.memory.note ? (
                <Text style={[styles.viewerNote, { color: theme.colors.textPrimary }]}>{open.memory.note}</Text>
              ) : open?.memory.imageUri &&
                remotePeer &&
                !open.memory.imageUrl &&
                !uriLoadsForRemoteViewer(open.memory.imageUri) ? (
                <Text style={[styles.viewerNote, { color: theme.colors.textMuted, fontStyle: "italic" }]}>
                  Photo is only on their device until cloud photos ship.
                </Text>
              ) : (
                <Text style={[styles.viewerNote, { color: theme.colors.textMuted, fontStyle: "italic" }]}>Photo only</Text>
              )}
            </View>
            <Pressable
              onPress={() => setOpen(null)}
              style={[styles.viewerClose, { backgroundColor: theme.colors.surface }]}
            >
              <X size={22} color={theme.colors.textPrimary} />
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: 28 },
  sectionHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  sectionTitle: { fontSize: 17, fontWeight: "800" },
  sectionHint: { fontSize: 12, marginBottom: 12, lineHeight: 17 },
  row: { gap: 12, paddingRight: 8 },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
    paddingBottom: 10,
  },
  thumb: { width: "100%", aspectRatio: 4 / 5, backgroundColor: "#111" },
  thumbPlaceholder: {
    width: "100%",
    aspectRatio: 4 / 5,
    alignItems: "center",
    justifyContent: "center",
  },
  quoteMark: { fontSize: 42, fontWeight: "700", opacity: 0.5 },
  remotePhotoHint: { fontSize: 11, lineHeight: 15, textAlign: "center", paddingHorizontal: 8 },
  cardDate: { fontSize: 11, fontWeight: "700", marginTop: 8, paddingHorizontal: 10 },
  cardNote: { fontSize: 12, lineHeight: 16, paddingHorizontal: 10, marginTop: 4 },
  viewerBackdrop: { flex: 1, justifyContent: "center", padding: 20 },
  viewerInner: { borderRadius: 20, overflow: "hidden" },
  viewerImg: { width: "100%", height: 320, backgroundColor: "#000" },
  viewerMeta: { padding: 16, borderTopWidth: 1 },
  viewerDate: { fontSize: 12, fontWeight: "800", letterSpacing: 0.8, marginBottom: 8 },
  viewerNote: { fontSize: 16, lineHeight: 24 },
  viewerClose: {
    position: "absolute",
    top: 12,
    right: 12,
    width: 40,
    height: 40,
    borderRadius: 9999,
    alignItems: "center",
    justifyContent: "center",
  },
});
