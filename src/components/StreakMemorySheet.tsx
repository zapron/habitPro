import { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Modal,
  Pressable,
  TextInput,
  StyleSheet,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  useWindowDimensions,
  Animated,
  Easing,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { Flag, ImageIcon, Lock, X } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useTheme } from "../context/ThemeContext";
import type { StreakMemory } from "../types/habit";

type StreakMemorySheetProps = {
  visible: boolean;
  /** create = new check-in; view = read-only saved moment */
  mode?: "create" | "view";
  /** habit = streak day flow; mini = time-boxed mini mission completion */
  variant?: "habit" | "mini";
  missionTitle: string;
  dayLabel: string;
  onClose: () => void;
  /** create only: called only from explicit actions — null = check in without a memory; not called when user dismisses */
  onCommit?: (memory: StreakMemory | null) => void | Promise<void>;
  /** view only */
  viewMemory?: StreakMemory | null;
};

export function StreakMemorySheet({
  visible,
  mode = "create",
  variant = "habit",
  missionTitle,
  dayLabel,
  onClose,
  onCommit,
  viewMemory,
}: StreakMemorySheetProps) {
  const isMini = variant === "mini";
  const isView = mode === "view";
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { height: windowH } = useWindowDimensions();
  const slideY = useRef(new Animated.Value(420)).current;
  const [note, setNote] = useState("");
  const [imageUri, setImageUri] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (visible) {
      slideY.setValue(420);
      setSubmitting(false);
      if (!isView) {
        setNote("");
        setImageUri(undefined);
      }
      Animated.spring(slideY, {
        toValue: 0,
        useNativeDriver: true,
        tension: 52,
        friction: 11,
      }).start();
    } else {
      Animated.timing(slideY, {
        toValue: 420,
        duration: 220,
        useNativeDriver: true,
        easing: Easing.out(Easing.cubic),
      }).start();
    }
  }, [visible, slideY, isView]);

  const pickerOptions = {
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: true,
    aspect: [4, 5] as [number, number],
    quality: 0.88,
  };

  const applyPickedUri = useCallback((uri: string | undefined) => {
    if (uri) {
      setImageUri(uri);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, []);

  const pickFromLibrary = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const res = await ImagePicker.launchImageLibraryAsync(pickerOptions);
    if (!res.canceled && res.assets[0]) {
      applyPickedUri(res.assets[0].uri);
    }
  }, [applyPickedUri]);

  const pickFromCamera = useCallback(async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return;
    const res = await ImagePicker.launchCameraAsync(pickerOptions);
    if (!res.canceled && res.assets[0]) {
      applyPickedUri(res.assets[0].uri);
    }
  }, [applyPickedUri]);

  const choosePhotoSource = useCallback(() => {
    Alert.alert(
      "Add a photo",
      "Take a new picture or choose one from your gallery.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Take photo", onPress: () => void pickFromCamera() },
        { text: "Photo library", onPress: () => void pickFromLibrary() },
      ],
    );
  }, [pickFromCamera, pickFromLibrary]);

  /** Backdrop, X, Android back — does not check in (create) or only closes (view). */
  const handleDismiss = useCallback(() => {
    onClose();
  }, [onClose]);

  /** Explicit: check in for this day without saving a photo/note. */
  const handleJustMarkDone = useCallback(() => {
    if (isView || submitting) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onCommit?.(null);
    onClose();
  }, [isView, submitting, onCommit, onClose]);

  const handleSave = useCallback(async () => {
    if (isView || submitting) return;
    const memory: StreakMemory = {
      createdAt: new Date().toISOString(),
      ...(note.trim() ? { note: note.trim() } : {}),
      ...(imageUri ? { imageUri } : {}),
    };
    const hasContent = memory.note || memory.imageUri;
    if (!hasContent) {
      Alert.alert(
        "Nothing to save",
        isMini
          ? "Add a photo or a note to save with your completion, or tap Complete without extras to finish without one."
          : "Add a photo or a note to save a moment, or tap Just mark done to check in without one.",
      );
      return;
    }
    setSubmitting(true);
    try {
      await Promise.resolve(onCommit?.(memory));
      onClose();
    } catch {
      // onCommit may alert; keep sheet open for retry
    } finally {
      setSubmitting(false);
    }
  }, [isView, isMini, note, imageUri, onCommit, onClose]);

  const maxSheetView = Math.min(windowH * 0.88, 560);
  /** Taller create sheet so photo + note + actions fit; scroll includes title/hint so drags register anywhere in the body */
  const maxSheetCreate = Math.min(windowH * 0.93, 720);

  const vm = viewMemory;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleDismiss}>
      <Pressable style={[styles.backdrop, { backgroundColor: isDark ? "rgba(0,0,0,0.72)" : "rgba(15,23,42,0.55)" }]} onPress={handleDismiss}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" && !isView ? "padding" : undefined} style={styles.kav}>
          {/* View stops backdrop dismiss; avoid Pressable here so ScrollView pan gestures are not contested */}
          <View style={styles.sheetPress}>
            <Animated.View
              style={[
                styles.sheet,
                {
                  ...(isView
                    ? { maxHeight: maxSheetView }
                    : { height: maxSheetCreate, maxHeight: maxSheetCreate }),
                  paddingBottom: Math.max(insets.bottom, 16),
                  backgroundColor: theme.colors.surfaceElevated,
                  borderColor: theme.colors.border,
                  ...theme.shadow.card,
                  transform: [{ translateY: slideY }],
                },
              ]}
            >
              <View style={styles.sheetHeader}>
                <View
                  style={[
                    styles.iconOrb,
                    isView
                      ? { backgroundColor: `${theme.colors.indigo[600]}33`, borderColor: theme.colors.indigo[500] }
                      : {
                          backgroundColor: isDark ? "rgba(34, 197, 94, 0.14)" : "rgba(22, 163, 74, 0.12)",
                          borderColor: isDark ? "rgba(34, 197, 94, 0.45)" : "rgba(22, 163, 74, 0.35)",
                        },
                  ]}
                >
                  {isView ? (
                    <Lock size={22} color={theme.colors.amber[500]} />
                  ) : (
                    <Flag size={22} color={theme.colors.green[500]} fill={theme.colors.green[500]} />
                  )}
                </View>
                <Pressable hitSlop={12} onPress={handleDismiss} style={[styles.closeBtn, { backgroundColor: theme.colors.surface }]}>
                  <X size={20} color={theme.colors.textMuted} />
                </Pressable>
              </View>

              {isView ? (
                <>
                  <Text style={[styles.kicker, { color: theme.colors.cyan[400] }]}>
                    {isMini ? "MINI MISSION" : `DAY ${dayLabel}`}
                  </Text>
                  <View style={[styles.viewOnlyPill, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
                    <Lock size={12} color={theme.colors.amber[500]} />
                    <Text style={[styles.viewOnlyPillText, { color: theme.colors.amber[500] }]}>Saved — view only</Text>
                  </View>
                  <Text style={[styles.title, { color: theme.colors.textPrimary, fontSize: theme.typography.h2 }]}>Your moment</Text>
                  <Text style={[styles.sub, { color: theme.colors.textSecondary }]} numberOfLines={2}>
                    {missionTitle}
                  </Text>
                  <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollInner}>
                    {vm?.imageUrl || vm?.imageUri ? (
                      <View style={[styles.photoSlotView, { borderColor: theme.colors.border }]}>
                        <Image
                          source={{ uri: vm.imageUrl ?? vm.imageUri! }}
                          style={styles.photo}
                          resizeMode="cover"
                        />
                      </View>
                    ) : null}
                    {vm?.note ? (
                      <View style={[styles.viewNoteBox, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
                        <Text style={[styles.viewNoteText, { color: theme.colors.textPrimary }]}>{vm.note}</Text>
                      </View>
                    ) : null}
                    {!vm?.imageUrl && !vm?.imageUri && !vm?.note ? (
                      <Text style={[styles.emptyView, { color: theme.colors.textMuted }]}>
                        {isMini ? "No photo or note saved for this mission." : "No details saved for this day."}
                      </Text>
                    ) : null}
                  </ScrollView>
                  <Pressable
                    onPress={handleDismiss}
                    style={[
                      styles.btnPrimaryBlock,
                      { backgroundColor: theme.colors.indigo[600], ...theme.shadow.glow, marginTop: 8 },
                    ]}
                  >
                    <Text style={[styles.btnPrimaryText, { color: theme.colors.white }]}>Close</Text>
                  </Pressable>
                </>
              ) : (
                <View style={styles.createSheetColumn}>
                  <ScrollView
                    style={styles.createScroll}
                    contentContainerStyle={styles.createScrollContent}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
                    showsVerticalScrollIndicator={false}
                    nestedScrollEnabled
                  >
                    <Text style={[styles.kicker, { color: theme.colors.cyan[400] }]}>
                      {isMini ? "MINI MISSION" : `DAY ${dayLabel}`}
                    </Text>
                    <Text style={[styles.title, { color: theme.colors.textPrimary, fontSize: theme.typography.h2 }]}>
                      {isMini ? "Seal this mini" : "Seal this win"}
                    </Text>
                    <Text style={[styles.sub, { color: theme.colors.textSecondary }]} numberOfLines={2}>
                      {missionTitle}
                    </Text>
                    <Text style={[styles.hint, { color: theme.colors.textMuted }]}>
                      {isMini
                        ? "Add a photo or a line you’ll love reading later, or tap Complete without extras to finish. Closing without choosing an action cancels — your mission stays open."
                        : "Add a photo or a line you’ll love reading later, or tap Just mark done to check in without a memory. Closing this sheet without choosing an action cancels — your day stays unchecked."}
                    </Text>

                    <View
                      style={[
                        styles.immutableNotice,
                        {
                          borderColor: isDark ? "rgba(245, 158, 11, 0.45)" : "rgba(217, 119, 6, 0.35)",
                          backgroundColor: isDark ? "rgba(245, 158, 11, 0.1)" : "rgba(251, 191, 36, 0.14)",
                        },
                      ]}
                    >
                      <View style={styles.immutableNoticeIconWrap}>
                        <Lock size={18} color={theme.colors.amber[500]} />
                      </View>
                      <View style={styles.immutableNoticeTextCol}>
                        <Text style={[styles.immutableNoticeTitle, { color: theme.colors.amber[500] }]}>
                          No edits after you save
                        </Text>
                        <Text style={[styles.immutableNoticeBody, { color: theme.colors.textSecondary }]}>
                          Your photo and note become fixed — you won’t be able to change or delete them from this screen.
                        </Text>
                      </View>
                    </View>

                    <View style={styles.photoSlotWrap}>
                      <Pressable
                        onPress={choosePhotoSource}
                        style={[
                          styles.photoSlot,
                          {
                            borderColor: imageUri ? theme.colors.indigo[500] : theme.colors.border,
                            backgroundColor: isDark ? "rgba(255,255,255,0.04)" : theme.colors.surface,
                          },
                        ]}
                      >
                        {imageUri ? (
                          <Image source={{ uri: imageUri }} style={styles.photo} resizeMode="cover" />
                        ) : (
                          <View style={styles.photoEmpty}>
                            <ImageIcon size={36} color={theme.colors.indigo[400]} />
                            <Text style={[styles.photoCta, { color: theme.colors.textSecondary }]}>Tap to add a photo</Text>
                          </View>
                        )}
                      </Pressable>
                    </View>

                    <TextInput
                      value={note}
                      onChangeText={setNote}
                      placeholder={
                        isMini
                          ? "A quick note — how it went, mood, what you shipped…"
                          : "A quick note — PR, mood, who you were with…"
                      }
                      placeholderTextColor={theme.colors.textMuted}
                      multiline
                      maxLength={280}
                      style={[
                        styles.input,
                        {
                          color: theme.colors.textPrimary,
                          borderColor: theme.colors.border,
                          backgroundColor: theme.colors.surface,
                        },
                      ]}
                    />
                    <Text style={[styles.counter, { color: theme.colors.textMuted }]}>{note.length}/280</Text>
                  </ScrollView>

                  <View style={styles.actions}>
                    <Pressable
                      onPress={handleJustMarkDone}
                      disabled={submitting}
                      style={[
                        styles.btnSecondary,
                        {
                          borderColor: theme.colors.border,
                          backgroundColor: isDark ? "rgba(148, 163, 184, 0.12)" : theme.colors.slate[750],
                          opacity: submitting ? 0.5 : 1,
                        },
                      ]}
                    >
                      <Text style={[styles.btnSecondaryText, { color: theme.colors.textSecondary }]}>
                        {isMini ? "Complete without extras" : "Just mark done"}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => void handleSave()}
                      disabled={submitting}
                      style={[
                        styles.btnPrimary,
                        { backgroundColor: theme.colors.indigo[600], ...theme.shadow.glow, opacity: submitting ? 0.92 : 1 },
                      ]}
                    >
                      {submitting ? (
                        <ActivityIndicator color={theme.colors.white} />
                      ) : (
                        <Text style={[styles.btnPrimaryText, { color: theme.colors.white }]}>
                          {isMini ? "Save & complete" : "Save moment"}
                        </Text>
                      )}
                    </Pressable>
                  </View>
                </View>
              )}
            </Animated.View>
          </View>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end" },
  kav: { flex: 1, justifyContent: "flex-end" },
  sheetPress: { width: "100%" },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  iconOrb: {
    width: 48,
    height: 48,
    borderRadius: 9999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 9999,
    alignItems: "center",
    justifyContent: "center",
  },
  kicker: { fontSize: 11, fontWeight: "800", letterSpacing: 1.4, marginBottom: 4 },
  title: { fontWeight: "800", marginBottom: 6 },
  sub: { fontSize: 15, lineHeight: 20, marginBottom: 10 },
  hint: { fontSize: 13, lineHeight: 18, marginBottom: 12 },
  immutableNotice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 16,
  },
  immutableNoticeIconWrap: { paddingTop: 1 },
  immutableNoticeTextCol: { flex: 1 },
  immutableNoticeTitle: {
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.2,
    marginBottom: 4,
  },
  immutableNoticeBody: { fontSize: 12, lineHeight: 17 },
  scrollInner: { paddingBottom: 8 },
  createSheetColumn: {
    flex: 1,
    minHeight: 0,
  },
  createScroll: {
    flex: 1,
  },
  createScrollContent: {
    paddingBottom: 12,
    flexGrow: 1,
  },
  photoSlotWrap: {
    alignItems: "center",
    marginBottom: 14,
  },
  photoSlot: {
    width: "100%",
    maxWidth: 300,
    alignSelf: "center",
    aspectRatio: 4 / 5,
    maxHeight: 220,
    borderRadius: 16,
    borderWidth: 2,
    borderStyle: "dashed",
    overflow: "hidden",
  },
  photo: { width: "100%", height: "100%" },
  photoEmpty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  photoCta: { marginTop: 10, fontSize: 13, fontWeight: "600" },
  input: {
    minHeight: 88,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    textAlignVertical: "top",
  },
  counter: { alignSelf: "flex-end", fontSize: 11, marginTop: 4, marginBottom: 4 },
  actions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 18,
    paddingTop: 4,
    flexShrink: 0,
  },
  btnSecondary: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  btnSecondaryText: { fontWeight: "700", fontSize: 15 },
  btnPrimary: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
  },
  /** Full-width primary CTA (not flex:1) — view-only Close; avoids empty stretched bar when used alone in a column */
  btnPrimaryBlock: {
    alignSelf: "stretch",
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  btnPrimaryText: { fontWeight: "800", fontSize: 15 },
  viewOnlyPill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 9999,
    borderWidth: 1,
    marginBottom: 10,
  },
  viewOnlyPillText: { fontSize: 11, fontWeight: "800", letterSpacing: 0.4 },
  photoSlotView: {
    width: "100%",
    aspectRatio: 4 / 5,
    maxHeight: 240,
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
    marginBottom: 14,
  },
  viewNoteBox: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
  },
  viewNoteText: { fontSize: 16, lineHeight: 24 },
  emptyView: { fontSize: 14, fontStyle: "italic", textAlign: "center", paddingVertical: 12 },
});
