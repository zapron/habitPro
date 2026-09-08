import { Text } from "./AppText";
import { useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Switch, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Camera, Eye, EyeOff, Flag, Globe, MessageSquare, Plus, X } from "lucide-react-native";
import { useTheme } from "../context/ThemeContext";
import type { StreakMemoryTaskEntry } from "../types/habit";

type Props = {
  visible: boolean;
  missionTitle: string;
  entries: StreakMemoryTaskEntry[];
  completing: boolean;
  /** Signed in + cloud sync configured + HabitPro Community access. */
  canPublishCommunity: boolean;
  onAddMoment: () => void;
  onSelectEntry: (entry: StreakMemoryTaskEntry) => void;
  onRemoveEntry: (entryId: string) => void;
  /** Toggle whether a logged moment's photo is included when this mission publishes to Community. */
  onToggleEntryInclusion: (entryId: string) => void;
  onComplete: (opts: { publishToCommunity: boolean }) => void;
  onClose: () => void;
};

/**
 * Freeform capture's completion-time entry point — sibling to MiniChecklistSheet,
 * not a variant of it. Where checklist missions review a fixed, predefined list of
 * tasks, freeform missions have no predefined anything: the list here is exactly
 * whatever the user chose to lock during the run, and "Add a moment" (not tapping
 * a pre-listed row) is how a new entry gets created. No count limit by design — see
 * the architecture note this was scoped from.
 */
export function MiniFreeformSheet({
  visible,
  missionTitle,
  entries,
  completing,
  canPublishCommunity,
  onAddMoment,
  onSelectEntry,
  onRemoveEntry,
  onToggleEntryInclusion,
  onComplete,
  onClose,
}: Props) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [publishToCommunity, setPublishToCommunity] = useState(false);
  const hasShareablePhoto = entries.some((e) => /^https?:\/\//.test(e.proofUrls[0] ?? ""));
  const canTogglePublish = canPublishCommunity && hasShareablePhoto;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
      accessibilityViewIsModal
    >
      <View style={styles.root}>
        <Pressable
          style={styles.backdrop}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
        />
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
              borderRadius: theme.radius.lg,
              ...theme.shadow.card,
              marginBottom: Math.max(insets.bottom, 16),
            },
          ]}
        >
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={[styles.title, { color: theme.colors.textPrimary }]} numberOfLines={1}>
                Complete Mission
              </Text>
              <Text style={[styles.sub, { color: theme.colors.textMuted }]} numberOfLines={1}>
                {missionTitle} · {entries.length} {entries.length === 1 ? "moment" : "moments"} locked
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Close"
              style={[styles.closeBtn, { backgroundColor: theme.colors.surfaceElevated, borderColor: theme.colors.border }]}
            >
              <X size={16} color={theme.colors.textSecondary} />
            </Pressable>
          </View>

          <Pressable
            onPress={onAddMoment}
            style={({ pressed }) => [
              styles.addBtn,
              { borderColor: theme.colors.indigo[500], backgroundColor: `${theme.colors.indigo[500]}14`, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Plus size={16} color={theme.colors.indigo[400]} />
            <Text style={[styles.addBtnText, { color: theme.colors.indigo[400] }]}>Add a moment</Text>
          </Pressable>

          {entries.length > 0 ? (
            <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
              {entries.map((entry) => {
                const shareable = /^https?:\/\//.test(entry.proofUrls[0] ?? "");
                const included = entry.includedInShare !== false;
                return (
                  <Pressable
                    key={entry.taskId}
                    onPress={() => onSelectEntry(entry)}
                    style={({ pressed }) => [
                      styles.entryRow,
                      { backgroundColor: theme.colors.surfaceElevated, borderColor: theme.colors.green[500], opacity: pressed ? 0.85 : 1 },
                    ]}
                  >
                    <View style={[styles.entryIcon, { backgroundColor: theme.colors.green[500] }]}>
                      {entry.proofUrls[0] ? (
                        <Camera size={12} color={theme.colors.white} strokeWidth={2.4} />
                      ) : (
                        <MessageSquare size={12} color={theme.colors.white} strokeWidth={2.4} />
                      )}
                    </View>
                    <View style={styles.entryTextCol}>
                      <Text style={[styles.entryLabel, { color: theme.colors.textPrimary }]} numberOfLines={1}>
                        {entry.label}
                      </Text>
                      {entry.note ? (
                        <Text style={[styles.entryNote, { color: theme.colors.textMuted }]} numberOfLines={1}>
                          {entry.note}
                        </Text>
                      ) : null}
                    </View>
                    {shareable ? (
                      <Pressable
                        onPress={(e) => {
                          e.stopPropagation();
                          onToggleEntryInclusion(entry.taskId);
                        }}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel={included ? "Included in Community — tap to exclude" : "Excluded from Community — tap to include"}
                        style={styles.iconBtn}
                      >
                        {included ? (
                          <Eye size={16} color={theme.colors.indigo[400]} />
                        ) : (
                          <EyeOff size={16} color={theme.colors.textMuted} />
                        )}
                      </Pressable>
                    ) : null}
                    <Pressable
                      onPress={(e) => {
                        e.stopPropagation();
                        onRemoveEntry(entry.taskId);
                      }}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${entry.label}`}
                      style={styles.iconBtn}
                    >
                      <X size={16} color={theme.colors.textMuted} />
                    </Pressable>
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : (
            <Text style={[styles.emptyHint, { color: theme.colors.textMuted }]}>
              Nothing locked yet — add a moment whenever something's worth keeping.
            </Text>
          )}

          <View
            style={[
              styles.publishRow,
              { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceElevated },
            ]}
          >
            <Globe size={18} color={theme.colors.cyan[400]} />
            <View style={styles.publishTextCol}>
              <Text style={[styles.publishTitle, { color: theme.colors.textPrimary }]}>
                Publish to Community
              </Text>
              <Text style={[styles.publishHint, { color: theme.colors.textMuted }]}>
                {!hasShareablePhoto
                  ? "Lock at least one moment with a photo to publish."
                  : !canPublishCommunity
                    ? "Sign in with HabitPro Community to publish."
                    : "Shares your kept moments' photos. Leaving this off keeps the mission private."}
              </Text>
            </View>
            <Switch
              value={publishToCommunity && canTogglePublish}
              onValueChange={setPublishToCommunity}
              disabled={completing || !canTogglePublish}
              trackColor={{ false: theme.colors.border, true: theme.colors.indigo[600] }}
              thumbColor={theme.colors.white}
              ios_backgroundColor={theme.colors.border}
            />
          </View>

          <Pressable
            onPress={() => onComplete({ publishToCommunity: publishToCommunity && canTogglePublish })}
            disabled={completing}
            style={[
              styles.completeBtn,
              {
                borderColor: theme.colors.green[500],
                backgroundColor: `${theme.colors.green[500]}14`,
                opacity: completing ? 0.7 : 1,
              },
            ]}
          >
            {completing ? (
              <ActivityIndicator size="small" color={theme.colors.green[500]} />
            ) : (
              <Flag size={15} color={theme.colors.green[500]} />
            )}
            <Text style={[styles.completeBtnText, { color: theme.colors.green[500] }]}>
              {completing ? "Completing…" : "Complete Mission"}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end", paddingHorizontal: 20 },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.5)" },
  sheet: {
    padding: 18,
    borderWidth: 1,
    maxHeight: "80%",
    maxWidth: 420,
    width: "100%",
    alignSelf: "center",
  },
  header: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 14 },
  headerText: { flex: 1, minWidth: 0 },
  title: { fontSize: 18, fontWeight: "800", letterSpacing: -0.2 },
  sub: { fontSize: 12, fontWeight: "600", marginTop: 2 },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    marginBottom: 12,
  },
  addBtnText: { fontSize: 13, fontWeight: "700" },
  list: { flexGrow: 0, marginBottom: 4 },
  emptyHint: { fontSize: 12.5, lineHeight: 18, fontWeight: "600", marginBottom: 12, textAlign: "center" },
  entryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  entryIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  entryTextCol: { flex: 1, minWidth: 0 },
  entryLabel: { fontSize: 14, fontWeight: "700" },
  entryNote: { fontSize: 11.5, fontWeight: "600", marginTop: 1 },
  iconBtn: {
    width: 26,
    height: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  publishRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: 4,
  },
  publishTextCol: { flex: 1, minWidth: 0 },
  publishTitle: { fontSize: 13, fontWeight: "800" },
  publishHint: { fontSize: 11, lineHeight: 15, fontWeight: "600", marginTop: 2 },
  completeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    marginTop: 6,
  },
  completeBtnText: { fontSize: 13, fontWeight: "700" },
});
