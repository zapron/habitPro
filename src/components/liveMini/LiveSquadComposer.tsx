import { memo, useEffect, useState } from "react";
import { Keyboard, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowUp, Camera, Check } from "lucide-react-native";
import { Text } from "../AppText";
import { useTheme } from "../../context/ThemeContext";
import type { TaskChecklistItem } from "../../types/habit";
import type { LiveSquadComposerMode } from "./useLiveSquadMoments";

/**
 * Bottom bar on the live squad screen while your own run is live.
 * Freeform: type a line and send (a text moment), or the camera for a photo
 * moment. Checklist: one chip per task; tap to log it (or edit a logged one).
 *
 * It sits in normal layout under the scroll view (not floating over it), so
 * the feed always ends above it, and the Screen's keyboard handling lifts it
 * on iOS and Android alike. One maroon: the send button.
 */

const INPUT_MIN = 44;
const INPUT_MAX = 120;

type Props = {
  mode: Exclude<LiveSquadComposerMode, null>;
  tasks: TaskChecklistItem[] | null;
  loggedTaskIds: Set<string>;
  remainingTasks: number;
  onSendText: (text: string) => void;
  onPhoto: (draft: string) => void;
  onTask: (task: TaskChecklistItem) => void;
  /** Called after a text moment is sent, so the screen can bring the feed into view. */
  onPosted?: () => void;
};

export const LiveSquadComposer = memo(function LiveSquadComposer({
  mode,
  tasks,
  loggedTaskIds,
  remainingTasks,
  onSendText,
  onPhoto,
  onTask,
  onPosted,
}: Props) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState("");
  const [keyboardUp, setKeyboardUp] = useState(false);
  // Explicit height: an iOS multiline input keeps its grown height after the
  // text is cleared, so it is reset to one line on send.
  const [inputHeight, setInputHeight] = useState(INPUT_MIN);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const show = Keyboard.addListener(showEvent, () => setKeyboardUp(true));
    const hide = Keyboard.addListener(hideEvent, () => setKeyboardUp(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const canSend = draft.trim().length > 0;
  const send = () => {
    if (!canSend) return;
    onSendText(draft);
    setDraft("");
    setInputHeight(INPUT_MIN);
    onPosted?.();
  };

  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor: theme.colors.background,
          borderTopColor: theme.colors.border,
          marginHorizontal: -theme.spacing.sm,
          // Over the keyboard the home-indicator / nav-bar inset is covered anyway.
          paddingBottom: keyboardUp ? 8 : Math.max(insets.bottom, 12),
        },
      ]}
    >
      {mode === "checklist" && tasks ? (
        <View style={styles.checklist}>
          <Text style={[styles.checklistLabel, { color: theme.colors.textMuted }]}>
            {remainingTasks > 0 ? `Log a task · ${remainingTasks} left` : "All tasks logged · tap one to edit"}
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.chips}
          >
            {tasks.map((task) => {
              const done = loggedTaskIds.has(task.id);
              return (
                <Pressable
                  key={task.id}
                  onPress={() => onTask(task)}
                  accessibilityRole="button"
                  accessibilityLabel={done ? `Edit ${task.label}` : `Log ${task.label}`}
                  style={({ pressed }) => [
                    styles.chip,
                    {
                      borderColor: done ? theme.colors.border : theme.colors.textPrimary,
                      opacity: pressed ? 0.7 : 1,
                    },
                  ]}
                >
                  {done ? <Check size={13} color={theme.colors.textMuted} strokeWidth={2.6} /> : null}
                  <Text
                    style={[styles.chipText, { color: done ? theme.colors.textMuted : theme.colors.textPrimary }]}
                    numberOfLines={1}
                  >
                    {task.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : (
        <View style={styles.row}>
          <Pressable
            onPress={() => onPhoto(draft)}
            accessibilityRole="button"
            accessibilityLabel="Add a photo moment"
            hitSlop={4}
            style={({ pressed }) => [
              styles.round,
              { backgroundColor: theme.colors.surfaceElevated, borderColor: theme.colors.border, opacity: pressed ? 0.75 : 1 },
            ]}
          >
            <Camera size={20} color={theme.colors.textPrimary} />
          </Pressable>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            onContentSizeChange={(e) => {
              const h = Math.min(INPUT_MAX, Math.max(INPUT_MIN, Math.ceil(e.nativeEvent.contentSize.height) + 22));
              setInputHeight((prev) => (Math.abs(prev - h) < 2 ? prev : h));
            }}
            placeholder="Add a moment…"
            placeholderTextColor={theme.colors.textMuted}
            multiline
            maxLength={500}
            accessibilityLabel="Moment text"
            style={[
              styles.input,
              {
                color: theme.colors.textPrimary,
                backgroundColor: theme.colors.surfaceElevated,
                borderColor: theme.colors.border,
                height: draft.length === 0 ? INPUT_MIN : inputHeight,
              },
            ]}
          />
          <Pressable
            onPress={send}
            disabled={!canSend}
            accessibilityRole="button"
            accessibilityLabel="Post moment"
            hitSlop={4}
            style={({ pressed }) => [
              styles.round,
              styles.send,
              { backgroundColor: theme.colors.maroon[500], opacity: !canSend ? 0.4 : pressed ? 0.85 : 1 },
            ]}
          >
            <ArrowUp size={20} color="#ffffff" strokeWidth={2.6} />
          </Pressable>
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  bar: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10, paddingHorizontal: 12 },
  row: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  round: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  send: { borderWidth: 0 },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "ios" ? 12 : 10,
    paddingBottom: Platform.OS === "ios" ? 12 : 10,
    fontSize: 15,
  },
  checklist: { gap: 8 },
  checklistLabel: { fontSize: 12, fontWeight: "700" },
  chips: { gap: 8, paddingRight: 12 },
  chip: {
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    maxWidth: 220,
  },
  chipText: { fontSize: 13, fontWeight: "700" },
});
