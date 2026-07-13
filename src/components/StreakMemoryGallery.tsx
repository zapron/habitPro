import { Text } from "./AppText";
import {
  useState } from "react";
import {
  View,
  Image,
  Pressable,
  StyleSheet,
  Modal,
  useWindowDimensions,
} from "react-native";
import { FlashList } from "@shopify/flash-list";
import { Bookmark, ShieldCheck, X } from "lucide-react-native";
import { useTheme } from "../context/ThemeContext";
import type { StreakMemory } from "../types/habit";
import {
  REPAIR_MEMORY_NOTE_SOLO,
  REPAIR_MEMORY_NOTE_SQUAD,
} from "../utils/repairStreakMemoryMerge";
import { formatDateDisplay } from "../utils/dateDisplay";
import { storageThumbnailUri } from "../utils/imageThumbnail";

type Entry = { dateStr: string; memory: StreakMemory; missionDay?: number | null };

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
  const { theme, isDark } = useTheme();
  const [open, setOpen] = useState<Entry | null>(null);
  const { width: windowWidth } = useWindowDimensions();

  if (entries.length === 0) return null;

  const cardW = Math.min(168, Math.max(132, (windowWidth - 48) / 2.1));
  const viewerUri =
    open?.memory?.imageUrl || open?.memory?.imageUri;
  const modalHasRenderableImage = Boolean(
    viewerUri && (!remotePeer || uriLoadsForRemoteViewer(viewerUri)),
  );
  const modalNoteTrim = open?.memory?.note?.trim() ?? "";
  const modalTextOnlyHero = Boolean(modalNoteTrim && !modalHasRenderableImage);
  const openDayLabel =
    open && typeof open.missionDay === "number" && open.missionDay > 0
      ? `Day ${open.missionDay}`
      : null;

  const modalRepairKicker =
    open?.memory?.repairSource === "squad"
      ? "SQUAD REPAIR"
      : open?.memory?.repairSource === "solo"
        ? "STREAK REPAIR"
        : modalNoteTrim === REPAIR_MEMORY_NOTE_SQUAD || modalNoteTrim === REPAIR_MEMORY_NOTE_SOLO
          ? "STREAK REPAIR"
          : null;
  const memoryCardBg = theme.colors.surface;
  const memoryTextBg = isDark ? "#141126" : theme.colors.surface;
  const memoryShellBg = theme.colors.surface;
  const memoryMetaBg = theme.colors.surfaceElevated;
  const memoryBorder = isDark ? "rgba(129, 140, 248, 0.32)" : theme.colors.border;
  const memoryTextColor = theme.colors.textPrimary;
  const memoryKickerColor = isDark ? theme.colors.cyan[400] : theme.colors.cyan[500];

  return (
    <>
      <View style={styles.section}>
        <View style={styles.sectionHead}>
          <Bookmark size={16} color={theme.colors.amber[500]} fill={theme.colors.amber[500]} />
          <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary }]}>{sectionTitle}</Text>
        </View>
        <Text style={[styles.sectionHint, { color: theme.colors.textMuted }]}>{sectionHint}</Text>
        <FlashList
          horizontal
          data={entries}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.row}
          keyExtractor={(it) => it.dateStr}
          renderItem={({ item }) => {
            const { dateStr, memory, missionDay } = item;
            const displayUri = memory.imageUrl || memory.imageUri;
            const showImage = Boolean(displayUri) && (!remotePeer || uriLoadsForRemoteViewer(displayUri));
            const thumbUri =
              showImage && displayUri
                ? storageThumbnailUri(displayUri, cardW * 2, ((cardW * 5) / 4) * 2)
                : null;
            const hasLocalOnlyPhoto =
              remotePeer &&
              Boolean(memory.imageUri) &&
              !memory.imageUrl &&
              !uriLoadsForRemoteViewer(memory.imageUri);
            const noteTrim = memory.note?.trim() ?? "";
            const textOnlyThumb = !showImage && !hasLocalOnlyPhoto && noteTrim.length > 0;
            const isSquadRepair = memory.repairSource === "squad";
            const repairKicker =
              isSquadRepair
                ? "SQUAD REPAIR"
                : memory.repairSource === "solo"
                  ? "STREAK REPAIR"
                  : noteTrim === REPAIR_MEMORY_NOTE_SQUAD || noteTrim === REPAIR_MEMORY_NOTE_SOLO
                    ? "STREAK REPAIR"
                    : null;

            const dayLabel =
              typeof missionDay === "number" && missionDay > 0 ? `Day ${missionDay}` : null;

            return (
              <Pressable
                onPress={() => setOpen({ dateStr, memory, missionDay })}
                style={[
                  styles.card,
                  { width: cardW, backgroundColor: memoryCardBg, borderColor: theme.colors.border },
                ]}
              >
                {isSquadRepair ? (
                  <View
                    style={[
                      styles.squadRepairThumb,
                      {
                        backgroundColor: isDark ? "rgba(8, 47, 73, 0.72)" : "rgba(236, 254, 255, 0.92)",
                        borderColor: isDark ? "rgba(34, 211, 238, 0.36)" : "rgba(6, 182, 212, 0.28)",
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.squadRepairIconShell,
                        {
                          backgroundColor: isDark ? "rgba(34, 211, 238, 0.16)" : "rgba(6, 182, 212, 0.14)",
                          borderColor: isDark ? "rgba(125, 211, 252, 0.42)" : "rgba(6, 182, 212, 0.34)",
                        },
                      ]}
                    >
                      <ShieldCheck size={30} color={theme.colors.cyan[400]} strokeWidth={2.4} />
                    </View>
                    <Text style={[styles.squadRepairKicker, { color: theme.colors.cyan[400] }]}>SQUAD SAVE</Text>
                    <Text style={[styles.squadRepairTitle, { color: theme.colors.textPrimary }]} numberOfLines={2}>
                      Streak saved
                    </Text>
                    <Text style={[styles.squadRepairBody, { color: theme.colors.textSecondary }]} numberOfLines={2}>
                      Your squad brought this day back.
                    </Text>
                  </View>
                ) : showImage ? (
                  <Image source={{ uri: thumbUri ?? displayUri! }} style={styles.thumb} resizeMode="cover" />
                ) : textOnlyThumb ? (
                  <View
                    style={[
                      styles.textOnlyThumb,
                      {
                        borderColor: memoryBorder,
                        backgroundColor: isDark ? "rgba(30, 27, 75, 0.72)" : "rgba(238, 242, 255, 0.92)",
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.textOnlyIconShell,
                        {
                          backgroundColor: isDark ? "rgba(129, 140, 248, 0.16)" : "rgba(99, 102, 241, 0.12)",
                          borderColor: isDark ? "rgba(165, 180, 252, 0.34)" : "rgba(99, 102, 241, 0.22)",
                        },
                      ]}
                    >
                      <Text style={[styles.textOnlyIcon, { color: theme.colors.indigo[400] }]}>{'\u201C'}</Text>
                    </View>
                    <Text style={[styles.textOnlyThumbKicker, { color: memoryKickerColor }]}>
                      {repairKicker ?? "FIELD NOTE"}
                    </Text>
                    <Text style={[styles.textOnlyThumbBody, { color: memoryTextColor }]} numberOfLines={6}>
                      {noteTrim}
                    </Text>
                  </View>
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
                <View style={styles.cardMetaRow}>
                  <Text style={[styles.cardDate, { color: theme.colors.textSecondary }]} numberOfLines={1}>
                    {formatDateDisplay(dateStr, dateStr)}
                  </Text>
                  {dayLabel ? (
                    <Text style={[styles.cardDay, { color: theme.colors.indigo[400] }]} numberOfLines={1}>
                      {dayLabel}
                    </Text>
                  ) : null}
                </View>
                {memory.repairSource && !isSquadRepair ? (
                  <View
                    style={[
                      styles.repairChip,
                      {
                        backgroundColor:
                          memory.repairSource === "squad"
                            ? isDark
                              ? "rgba(34, 211, 238, 0.14)"
                              : "rgba(34, 211, 238, 0.18)"
                            : isDark
                              ? "rgba(245, 158, 11, 0.14)"
                              : "rgba(245, 158, 11, 0.16)",
                        borderColor:
                          memory.repairSource === "squad"
                            ? theme.colors.cyan[500]
                            : theme.colors.amber[500],
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.repairChipText,
                        {
                          color:
                            memory.repairSource === "squad"
                              ? theme.colors.cyan[500]
                              : theme.colors.amber[500],
                        },
                      ]}
                    >
                      {memory.repairSource === "squad" ? "Squad repair" : "Solo repair"}
                    </Text>
                  </View>
                ) : null}
                {memory.note && !textOnlyThumb ? (
                  <Text style={[styles.cardNote, { color: theme.colors.textMuted }]} numberOfLines={2}>
                    {memory.note}
                  </Text>
                ) : null}
              </Pressable>
            );
          }}
        />
      </View>

      <Modal visible={open !== null} transparent animationType="fade" onRequestClose={() => setOpen(null)}>
        <Pressable style={[styles.viewerBackdrop, { backgroundColor: "rgba(0,0,0,0.85)" }]} onPress={() => setOpen(null)}>
          <Pressable
            style={[
              styles.viewerInner,
              { backgroundColor: memoryShellBg, borderColor: memoryBorder },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            {modalHasRenderableImage ? (
              <Image source={{ uri: viewerUri! }} style={styles.viewerImg} resizeMode="contain" />
            ) : modalNoteTrim ? (
              <View
                style={[
                  styles.viewerTextOnlyHero,
                  {
                    borderColor: memoryBorder,
                    borderLeftColor: theme.colors.indigo[500],
                    backgroundColor: memoryTextBg,
                  },
                ]}
              >
                <Text style={[styles.viewerTextOnlyKicker, { color: memoryKickerColor }]}>
                  {modalRepairKicker ?? "FIELD NOTE"}
                </Text>
                <Text style={[styles.viewerTextOnlyBody, { color: memoryTextColor }]}>{modalNoteTrim}</Text>
              </View>
            ) : null}
            <View style={[styles.viewerMeta, { backgroundColor: memoryMetaBg, borderColor: memoryBorder }]}>
              <View style={styles.viewerMetaTop}>
                <Text style={[styles.viewerDate, { color: memoryKickerColor }]}>
                  {formatDateDisplay(open?.dateStr, open?.dateStr ?? "")}
                </Text>
                {openDayLabel ? (
                  <Text style={[styles.viewerDay, { color: theme.colors.indigo[400] }]}>{openDayLabel}</Text>
                ) : null}
              </View>
              {modalHasRenderableImage && modalNoteTrim ? (
                <Text style={[styles.viewerNote, { color: theme.colors.textPrimary }]}>{modalNoteTrim}</Text>
              ) : modalTextOnlyHero ? null : open?.memory.imageUri &&
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
  row: { paddingRight: 10 },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
    paddingBottom: 10,
    marginRight: 2,
  },
  thumb: { width: "100%", aspectRatio: 4 / 5, backgroundColor: "#111" },
  squadRepairThumb: {
    width: "100%",
    aspectRatio: 4 / 5,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    overflow: "hidden",
  },
  squadRepairIconShell: {
    width: 56,
    height: 56,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  squadRepairKicker: {
    fontSize: 9,
    lineHeight: 12,
    fontWeight: "900",
    letterSpacing: 1.4,
    marginBottom: 6,
    textAlign: "center",
  },
  squadRepairTitle: {
    fontSize: 20,
    lineHeight: 24,
    fontWeight: "900",
    textAlign: "center",
  },
  squadRepairBody: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
    textAlign: "center",
    marginTop: 8,
  },
  thumbPlaceholder: {
    width: "100%",
    aspectRatio: 4 / 5,
    alignItems: "center",
    justifyContent: "center",
  },
  textOnlyThumb: {
    width: "100%",
    aspectRatio: 4 / 5,
    borderRadius: 0,
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  textOnlyIconShell: {
    width: 40,
    height: 40,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  textOnlyIcon: {
    fontSize: 30,
    lineHeight: 34,
    fontWeight: "900",
    marginTop: -4,
  },
  textOnlyThumbKicker: {
    fontSize: 9,
    lineHeight: 12,
    fontWeight: "900",
    letterSpacing: 1.4,
    marginBottom: 8,
    textAlign: "center",
  },
  textOnlyThumbBody: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "700",
    letterSpacing: 0.1,
    textAlign: "center",
  },
  quoteMark: { fontSize: 42, fontWeight: "700", opacity: 0.5 },
  remotePhotoHint: { fontSize: 11, lineHeight: 15, textAlign: "center", paddingHorizontal: 8 },
  cardMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginTop: 8,
    paddingHorizontal: 10,
  },
  cardDate: { fontSize: 11, fontWeight: "700", flex: 1, minWidth: 0 },
  cardDay: { fontSize: 11, fontWeight: "900", letterSpacing: 0.3 },
  repairChip: {
    alignSelf: "flex-start",
    marginTop: 6,
    marginHorizontal: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  repairChipText: { fontSize: 9, fontWeight: "900", letterSpacing: 0.6 },
  cardNote: { fontSize: 12, lineHeight: 16, paddingHorizontal: 10, marginTop: 4 },
  viewerBackdrop: { flex: 1, justifyContent: "center", padding: 20 },
  viewerInner: { borderRadius: 20, overflow: "hidden" },
  viewerImg: { width: "100%", height: 320, backgroundColor: "#000" },
  viewerTextOnlyHero: {
    width: "100%",
    minHeight: 280,
    paddingHorizontal: 22,
    paddingVertical: 28,
    borderLeftWidth: 5,
    borderTopWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    justifyContent: "center",
  },
  viewerTextOnlyKicker: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 2.2,
    marginBottom: 14,
  },
  viewerTextOnlyBody: { fontSize: 18, lineHeight: 28, fontWeight: "600" },
  viewerMeta: { padding: 16, borderTopWidth: 1 },
  viewerMetaTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 8,
  },
  viewerDate: { fontSize: 12, fontWeight: "800", letterSpacing: 0.8, flex: 1 },
  viewerDay: { fontSize: 12, fontWeight: "900", letterSpacing: 0.6 },
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
