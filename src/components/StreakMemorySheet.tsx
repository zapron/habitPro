import { Text } from "./AppText";
import {
  useCallback,
  useEffect,
  useRef,
  useState } from "react";
import {
  View,
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
  Switch,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { Flag, Globe, ImageIcon, Lock, Quote, Users, X } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useTheme } from "../context/ThemeContext";
import { CoachMarkTarget, useCoachMark } from "../context/CoachMarkContext";
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
  onCommit?: (
    memory: StreakMemory | null,
    meta?: { publishToCommunity?: boolean },
  ) => void | Promise<void>;
  /** When variant is mini, whether Community publish is allowed (signed in + Supabase). */
  miniPublishAvailable?: boolean;
  /** When variant is habit, whether Community publish is allowed (signed in + Supabase). */
  habitPublishAvailable?: boolean;
  /** When false, Community publish/toggle is locked (e.g. HabitPro Community). Default true (unset). */
  plusCommunityOk?: boolean;
  /** view + habit: Community status and toggle (remove is one-way; parent shows confirm). */
  habitViewCommunity?: {
    posted: boolean;
    revoked: boolean;
    available: boolean;
    /** Signed in + cloud, but this memory has no photo — Community can’t be enabled. */
    needsPhotoForCommunity?: boolean;
    /** Signed in + photo, but viewer does not have HabitPro Community. */
    plusRequired?: boolean;
    busy?: boolean;
    /** True while publish is in flight; keeps the Switch ON until `posted` updates. */
    pendingPublish?: boolean;
    onChange: (next: boolean) => void | Promise<void>;
  };
  /** view only */
  viewMemory?: StreakMemory | null;
  /** create only (habit): in-context mission visibility toggle for squad/cohort sharing */
  squadShare?: {
    show: boolean;
    visibility: "solo" | "public";
    onToggle: (nextPublic: boolean) => void | Promise<void>;
  };
};

export function StreakMemorySheet({
  visible,
  mode = "create",
  variant = "habit",
  missionTitle,
  dayLabel,
  onClose,
  onCommit,
  miniPublishAvailable,
  habitPublishAvailable,
  plusCommunityOk,
  habitViewCommunity,
  viewMemory,
  squadShare,
}: StreakMemorySheetProps) {
  const isMini = variant === "mini";
  const isView = mode === "view";
  const plusOk = plusCommunityOk !== false;
  const canPublishCommunity =
    plusOk &&
    ((isMini && miniPublishAvailable === true) || (!isMini && habitPublishAvailable === true));
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { height: windowH, width: windowW } = useWindowDimensions();
  const slideY = useRef(new Animated.Value(420)).current;
  const [note, setNote] = useState("");
  const [imageUri, setImageUri] = useState<string | undefined>();
  const [publishToCommunity, setPublishToCommunity] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!imageUri && publishToCommunity) {
      setPublishToCommunity(false);
    }
  }, [imageUri, publishToCommunity]);

  useEffect(() => {
    if (visible) {
      slideY.setValue(420);
      setSubmitting(false);
      if (!isView) {
        setNote("");
        setImageUri(undefined);
        setPublishToCommunity(false);
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

  useCoachMark(
    "mini_complete_memory",
    {
      title: "Save the win",
      body: "Add a photo or note when the moment is worth remembering.",
      placement: "above",
    },
    visible && !isView && isMini,
    760,
  );

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
    if (submitting) return;
    onClose();
  }, [onClose, submitting]);

  /** Explicit: check in for this day without saving a photo/note. */
  const handleJustMarkDone = useCallback(() => {
    if (isView || submitting) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const meta = isMini
      ? {
          publishToCommunity:
            publishToCommunity && canPublishCommunity && Boolean(imageUri),
        }
      : undefined;
    setSubmitting(true);
    void (async () => {
      try {
        await Promise.resolve(onCommit?.(null, meta));
        onClose();
      } catch {
        // onCommit may alert; keep sheet open for retry
      } finally {
        setSubmitting(false);
      }
    })();
  }, [
    isView,
    submitting,
    onCommit,
    onClose,
    isMini,
    imageUri,
    publishToCommunity,
    canPublishCommunity,
  ]);

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
          ? "Add a photo or a note first to use Complete with Memory, or tap Just Mark Complete to finish without one."
          : "Add a photo or a note to save a moment, or tap Just mark done to check in without one.",
        [{ text: "OK" }],
      );
      return;
    }
    const enableCommunityMeta =
      publishToCommunity && canPublishCommunity && Boolean(imageUri);
    const meta = enableCommunityMeta ? { publishToCommunity: true } : undefined;
    setSubmitting(true);
    try {
      await Promise.resolve(onCommit?.(memory, meta));
      onClose();
    } catch {
      // onCommit may alert; keep sheet open for retry
    } finally {
      setSubmitting(false);
    }
  }, [
    isView,
    isMini,
    note,
    imageUri,
    onCommit,
    onClose,
    publishToCommunity,
    canPublishCommunity,
    submitting,
  ]);

  const maxSheetView = Math.min(windowH * 0.88, 560);
  const isMemoryCreate = !isView;
  const isMiniCreate = !isView && isMini;
  const isHabitCreate = !isView && !isMini;
  const stackMemoryActions = isMemoryCreate && windowW < 360;
  /** Shown while onCommit runs (upload, check-in, optional Community publish). */
  const submittingPublishCopy =
    submitting && publishToCommunity && canPublishCommunity && Boolean(imageUri);
  /** Streak memory capture (habit + mini): fixed height + flex scroll — same cap for both drawers. */
  const memoryCaptureSheetMaxHeight = Math.min(windowH * 0.78, windowH - insets.top - 8);

  const vm = viewMemory;
  const viewHasImage = Boolean(vm?.imageUrl || vm?.imageUri);
  const viewNoteStr = vm?.note?.trim() ?? "";
  const viewTextOnlyMemory = isView && viewNoteStr.length > 0 && !viewHasImage;
  /** Main mission: “Just mark done” — locked row with no photo/note. */
  const viewCheckInOnly =
    isView && !isMini && vm?.checkInOnly === true && !viewHasImage && viewNoteStr.length === 0;
  const communitySwitchOn =
    habitViewCommunity != null &&
    (habitViewCommunity.posted || habitViewCommunity.pendingPublish === true);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (!submitting) handleDismiss();
      }}
    >
      <View style={[styles.backdrop, { backgroundColor: isDark ? "rgba(0,0,0,0.72)" : "rgba(15,23,42,0.55)" }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          style={StyleSheet.absoluteFill}
          disabled={submitting}
          onPress={handleDismiss}
        />
        <KeyboardAvoidingView
          pointerEvents="box-none"
          behavior={Platform.OS === "ios" && !isView ? "padding" : undefined}
          style={styles.kav}
        >
          <View style={styles.sheetPress} pointerEvents="box-none">
            <Animated.View
              pointerEvents="auto"
              style={[
                styles.sheet,
                !isView ? styles.sheetCreateOverflow : null,
                {
                  ...(isView
                    ? {
                        maxHeight: maxSheetView,
                        paddingBottom: Math.max(insets.bottom, 16),
                      }
                    : {
                        height: memoryCaptureSheetMaxHeight,
                        maxHeight: memoryCaptureSheetMaxHeight,
                        paddingBottom: 0,
                      }),
                  backgroundColor: theme.colors.surfaceElevated,
                  borderColor: theme.colors.border,
                  ...theme.shadow.card,
                  transform: [{ translateY: slideY }],
                },
              ]}
            >
              <View style={[styles.sheetHeader, isMemoryCreate && styles.sheetHeaderCompact]}>
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
                <Pressable
                  hitSlop={12}
                  onPress={handleDismiss}
                  disabled={submitting}
                  style={[
                    styles.closeBtn,
                    { backgroundColor: theme.colors.surface, opacity: submitting ? 0.45 : 1 },
                  ]}
                >
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
                    <Text style={[styles.viewOnlyPillText, { color: theme.colors.amber[500] }]}>Locked Memory</Text>
                  </View>
                  <Text style={[styles.title, { color: theme.colors.textPrimary, fontSize: theme.typography.h2 }]}>
                    {viewCheckInOnly ? "This day" : "Your moment"}
                  </Text>
                  <Text style={[styles.sub, { color: theme.colors.textSecondary }]} numberOfLines={2}>
                    {missionTitle}
                  </Text>
                  <ScrollView
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={styles.scrollInner}
                    nestedScrollEnabled
                  >
                    {viewTextOnlyMemory ? (
                      <View
                        style={[
                          styles.textOnlyMemoryCard,
                          {
                            borderColor: theme.colors.border,
                            backgroundColor: isDark ? "rgba(79, 70, 229, 0.12)" : "rgba(79, 70, 229, 0.07)",
                            borderLeftColor: theme.colors.indigo[500],
                            ...theme.shadow.card,
                          },
                        ]}
                      >
                        <Quote
                          size={56}
                          color={theme.colors.indigo[500]}
                          style={styles.textOnlyMemoryWatermark}
                          strokeWidth={1.2}
                        />
                        <Text
                          style={[
                            styles.textOnlyMemoryKicker,
                            { color: theme.colors.cyan[400] },
                          ]}
                        >
                          {isMini ? "MISSION LOG" : "FIELD NOTE"}
                        </Text>
                        <Text
                          selectable
                          style={[
                            styles.textOnlyMemoryBody,
                            { color: theme.colors.textPrimary },
                            Platform.OS === "android" ? { includeFontPadding: false } : null,
                          ]}
                        >
                          {viewNoteStr}
                        </Text>
                      </View>
                    ) : viewCheckInOnly ? (
                      <View
                        style={[
                          styles.checkInOnlyCard,
                          {
                            borderColor: theme.colors.border,
                            backgroundColor: isDark ? "rgba(148, 163, 184, 0.1)" : "rgba(100, 116, 139, 0.08)",
                          },
                        ]}
                      >
                        <Text style={[styles.checkInOnlyTitle, { color: theme.colors.textPrimary }]}>
                          Check-in only
                        </Text>
                        <Text style={[styles.checkInOnlyBody, { color: theme.colors.textSecondary }]}>
                          You used Just mark done: no photo or note was saved. This day is locked like other check-ins and
                          can’t be changed from here.
                        </Text>
                      </View>
                    ) : (
                      <>
                        {viewHasImage ? (
                          <View style={[styles.photoSlotView, { borderColor: theme.colors.border }]}>
                            <View style={styles.photoSlotImageFill}>
                              <Image
                                source={{ uri: vm!.imageUrl ?? vm!.imageUri! }}
                                style={StyleSheet.absoluteFillObject}
                                resizeMode="cover"
                              />
                            </View>
                          </View>
                        ) : null}
                        {viewNoteStr ? (
                          <View
                            style={[
                              styles.viewNoteBox,
                              { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
                            ]}
                          >
                            <Text
                              selectable
                              style={[
                                styles.viewNoteText,
                                { color: theme.colors.textPrimary },
                                Platform.OS === "android" ? { includeFontPadding: false } : null,
                              ]}
                            >
                              {viewNoteStr}
                            </Text>
                          </View>
                        ) : null}
                        {!viewHasImage && !viewNoteStr ? (
                          <Text style={[styles.emptyView, { color: theme.colors.textMuted }]}>
                            {isMini ? "No photo or note saved for this mission." : "No details saved for this day."}
                          </Text>
                        ) : null}
                      </>
                    )}

                    {!isMini && habitViewCommunity ? (
                      <View
                        style={[
                          styles.communityPublishRow,
                          {
                            borderColor: theme.colors.border,
                            backgroundColor: theme.colors.surface,
                            marginTop: 14,
                          },
                        ]}
                      >
                        {habitViewCommunity.revoked ? (
                          <Text style={[styles.communityViewRevokedText, { color: theme.colors.textMuted }]}>
                            Removed from Community. This moment can’t be shared to the feed again.
                          </Text>
                        ) : (
                          <View style={styles.communityPublishTopRow}>
                            <Globe
                              size={20}
                              color={theme.colors.cyan[400]}
                              style={styles.communityPublishGlobe}
                            />
                            <View style={styles.communityPublishTextCol}>
                              <Text style={[styles.communityPublishTitle, { color: theme.colors.textPrimary }]}>
                                Community
                              </Text>
                              <Text style={[styles.communityPublishHint, { color: theme.colors.textMuted }]}>
                                {habitViewCommunity.posted
                                  ? "Turn off to remove this moment from the Community feed. You won’t be able to post it again."
                                  : habitViewCommunity.pendingPublish
                                    ? "Publishing to Community…"
                                    : habitViewCommunity.needsPhotoForCommunity
                                      ? "Community posts need a photo. This moment has no photo, so it can’t be shared to the feed."
                                      : habitViewCommunity.plusRequired
                                        ? "Publishing to Community is HabitPro Community."
                                        : habitViewCommunity.available
                                          ? "Share this moment to the Community feed. Squad visibility uses Public / Solo above."
                                          : "Sign in with cloud sync to share this moment to Community."}
                              </Text>
                            </View>
                            {habitViewCommunity.pendingPublish && !habitViewCommunity.posted ? (
                              <ActivityIndicator
                                size="small"
                                color={theme.colors.indigo[500]}
                                style={styles.communityPublishSpinner}
                              />
                            ) : null}
                            <Switch
                              value={communitySwitchOn}
                              onValueChange={(v) => {
                                void habitViewCommunity.onChange(v);
                              }}
                              disabled={
                                habitViewCommunity.busy ||
                                habitViewCommunity.revoked ||
                                (!habitViewCommunity.posted && !habitViewCommunity.available)
                              }
                              trackColor={{
                                false: theme.colors.border,
                                true: theme.colors.indigo[600],
                              }}
                              thumbColor={theme.colors.white}
                              ios_backgroundColor={theme.colors.border}
                            />
                          </View>
                        )}
                      </View>
                    ) : null}
                  </ScrollView>
                </>
              ) : (
                <View style={styles.createSheetColumn}>
                  <ScrollView
                    style={styles.createScroll}
                    contentContainerStyle={[
                      styles.createScrollContent,
                      isMemoryCreate && styles.createScrollContentMemory,
                    ]}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
                    showsVerticalScrollIndicator
                    nestedScrollEnabled
                  >
                    <Text
                      style={[
                        styles.kicker,
                        isMemoryCreate && styles.kickerMemory,
                        { color: theme.colors.cyan[400] },
                      ]}
                    >
                      {isMini ? "MINI MISSION" : `DAY ${dayLabel}`}
                    </Text>
                    <Text
                      style={[
                        styles.title,
                        isMemoryCreate && styles.titleMemory,
                        { color: theme.colors.textPrimary, fontSize: theme.typography.h2 },
                      ]}
                    >
                      Record this memory
                    </Text>
                    <Text
                      style={[styles.sub, isMemoryCreate && styles.subMemory, { color: theme.colors.textSecondary }]}
                      numberOfLines={2}
                    >
                      {missionTitle}
                    </Text>
                    {isHabitCreate ? (
                      <Text style={[styles.hint, styles.hintMemory, { color: theme.colors.textMuted }]}>
                        Add a photo or a line you’ll love reading later, or tap Just mark done to check in without a memory.
                        Closing this sheet without choosing an action cancels. Your day stays unchecked.
                      </Text>
                    ) : null}

                    <View
                      style={[
                        styles.immutableNotice,
                        styles.immutableNoticeMemory,
                        {
                          backgroundColor: isDark
                            ? "rgba(245, 158, 11, 0.1)"
                            : "rgba(251, 191, 36, 0.14)",
                        },
                      ]}
                    >
                      <View style={styles.immutableNoticeIconWrap}>
                        <Lock
                          size={15}
                          color={isDark ? theme.colors.yellow[400] : theme.colors.amber[500]}
                        />
                      </View>
                      <View style={styles.immutableNoticeTextCol}>
                        <Text
                          style={[
                            styles.immutableNoticeTitle,
                            styles.immutableNoticeTitleMemory,
                            { color: isDark ? theme.colors.yellow[400] : theme.colors.amber[500] },
                          ]}
                        >
                          No edits after you Save
                        </Text>
                      </View>
                    </View>

                    <View style={[styles.photoSlotWrap, styles.photoSlotWrapMemory]}>
                      <Pressable
                        onPress={choosePhotoSource}
                        style={[
                          styles.photoSlotMemory,
                          {
                            borderColor: imageUri ? theme.colors.indigo[500] : theme.colors.border,
                            backgroundColor: isDark ? "rgba(255,255,255,0.04)" : theme.colors.surface,
                          },
                        ]}
                      >
                        {imageUri ? (
                          <View style={styles.photoSlotImageFill}>
                            <Image source={{ uri: imageUri }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
                          </View>
                        ) : (
                          <View style={[styles.photoEmpty, styles.photoEmptyMemory]}>
                            <ImageIcon size={28} color={theme.colors.indigo[400]} />
                            <Text style={[styles.photoCta, styles.photoCtaMemory, { color: theme.colors.textSecondary }]}>
                              Tap to add a photo
                            </Text>
                          </View>
                        )}
                      </Pressable>
                    </View>

                    <TextInput
                      value={note}
                      onChangeText={setNote}
                      placeholder={
                        isMini
                          ? "A quick note: how it went, mood, what you shipped…"
                          : "A quick note: PR, mood, who you were with…"
                      }
                      placeholderTextColor={theme.colors.textMuted}
                      multiline
                      maxLength={280}
                      style={[
                        styles.input,
                        styles.inputMemory,
                        {
                          color: theme.colors.textPrimary,
                          borderColor: theme.colors.border,
                          backgroundColor: theme.colors.surface,
                        },
                      ]}
                    />
                    <Text style={[styles.counter, styles.counterMemory, { color: theme.colors.textMuted }]}>
                      {note.length}/280
                    </Text>

                    {!isMini && squadShare?.show ? (
                      <View
                        style={[
                          styles.communityPublishRow,
                          isMiniCreate && styles.communityPublishRowMini,
                          {
                            borderColor: theme.colors.border,
                            backgroundColor: theme.colors.surface,
                          },
                        ]}
                      >
                        <View
                          style={[
                            styles.communityPublishTopRow,
                            isMiniCreate && styles.communityPublishTopRowMini,
                          ]}
                        >
                          <Users
                            size={20}
                            color={theme.colors.cyan[400]}
                            style={styles.communityPublishGlobe}
                          />
                          <View style={styles.communityPublishTextCol}>
                            <Text style={[styles.communityPublishTitle, { color: theme.colors.textPrimary }]}>
                              Share streaks with squad
                            </Text>
                            <Text style={[styles.communityPublishHint, { color: theme.colors.textMuted }]}>
                              {(squadShare.visibility ?? "solo") === "public"
                                ? "On — visible to your squad."
                                : "Off — only you can see this mission."}{" "}
                              <Text style={{ color: theme.colors.textMuted }}>
                                (Applies to all days)
                              </Text>
                            </Text>
                          </View>
                          <Switch
                            value={(squadShare.visibility ?? "solo") === "public"}
                            onValueChange={(v) => void squadShare.onToggle(Boolean(v))}
                            disabled={submitting}
                            trackColor={{
                              false: theme.colors.border,
                              true: theme.colors.indigo[600],
                            }}
                            thumbColor={theme.colors.white}
                            ios_backgroundColor={theme.colors.border}
                          />
                        </View>
                      </View>
                    ) : null}

                    {isMini || isHabitCreate ? (
                      <View
                        style={[
                          styles.communityPublishRow,
                          isMiniCreate && styles.communityPublishRowMini,
                          {
                            borderColor: theme.colors.border,
                            backgroundColor: theme.colors.surface,
                          },
                        ]}
                      >
                        <View
                          style={[
                            styles.communityPublishTopRow,
                            isMiniCreate && styles.communityPublishTopRowMini,
                          ]}
                        >
                          <Globe
                            size={isMiniCreate ? 18 : 20}
                            color={theme.colors.cyan[400]}
                            style={[styles.communityPublishGlobe, isMiniCreate && styles.communityPublishGlobeMini]}
                          />
                          <View style={styles.communityPublishTextCol}>
                            <Text style={[styles.communityPublishTitle, { color: theme.colors.textPrimary }]}>
                              Publish to Community
                            </Text>
                            <Text
                              style={[
                                isMiniCreate ? styles.communityPublishHintMiniBody : styles.communityPublishHint,
                                { color: theme.colors.textMuted },
                              ]}
                            >
                              {!plusOk
                                ? "Publishing to Community is HabitPro Community."
                                : !canPublishCommunity
                                  ? "Sign in with cloud sync to publish to Community."
                                  : !imageUri
                                    ? (
                                        <>
                                          <Text style={{ color: theme.colors.indigo[400], fontWeight: "700" }}>
                                            Photo required
                                          </Text>
                                          <Text>{" "}to publish. Notes stay on your mission.</Text>
                                        </>
                                      )
                                    : isMini
                                      ? "Leaving this off locks Community for this mission. If you publish, you can remove your win from the feed in details later."
                                      : "Optional. Squad visibility uses Public / Solo on the mission screen. You can remove this moment from Community later from this day’s memory."}
                            </Text>
                          </View>
                          <Switch
                            style={isMiniCreate ? { marginTop: 2 } : undefined}
                            value={Boolean(publishToCommunity && canPublishCommunity)}
                            onValueChange={setPublishToCommunity}
                            disabled={submitting || !canPublishCommunity || !imageUri}
                            trackColor={{
                              false: theme.colors.border,
                              true: theme.colors.indigo[600],
                            }}
                            thumbColor={theme.colors.white}
                            ios_backgroundColor={theme.colors.border}
                          />
                        </View>
                      </View>
                    ) : null}
                  </ScrollView>

                  <View
                    style={[
                      styles.actions,
                      styles.actionsMemory,
                      stackMemoryActions && styles.actionsMemoryStacked,
                      {
                        paddingBottom: Math.max(insets.bottom, 12),
                        paddingTop: 12,
                      },
                    ]}
                  >
                    <Pressable
                      onPress={handleJustMarkDone}
                      disabled={submitting}
                      style={[
                        styles.btnSecondary,
                        styles.btnSecondaryMemory,
                        stackMemoryActions && styles.btnMemoryStacked,
                        {
                          borderColor: theme.colors.border,
                          backgroundColor: isDark ? "rgba(148, 163, 184, 0.12)" : theme.colors.slate[750],
                          opacity: submitting ? 0.5 : 1,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.btnSecondaryText,
                          styles.btnSecondaryTextMemory,
                          { color: theme.colors.textSecondary },
                          Platform.OS === "android" ? styles.btnMemoryTextAndroid : null,
                        ]}
                        numberOfLines={2}
                        adjustsFontSizeToFit
                        minimumFontScale={0.8}
                      >
                        {isMini ? "Just Mark Complete" : "Just mark done"}
                      </Text>
                    </Pressable>
                    <CoachMarkTarget
                      id="mini_complete_memory"
                      style={[styles.memoryCoachTarget, stackMemoryActions && styles.memoryCoachTargetStacked]}
                    >
                      <Pressable
                        onPress={() => void handleSave()}
                        disabled={submitting}
                        style={[
                          styles.btnPrimary,
                          styles.btnPrimaryMemory,
                          stackMemoryActions && styles.btnMemoryStacked,
                          { backgroundColor: theme.colors.indigo[600], ...theme.shadow.glow, opacity: submitting ? 0.92 : 1 },
                        ]}
                      >
                        {submitting ? (
                          <ActivityIndicator color={theme.colors.white} />
                        ) : (
                          <Text
                            style={[
                              styles.btnPrimaryText,
                              styles.btnPrimaryTextMemory,
                              { color: theme.colors.white },
                              Platform.OS === "android" ? styles.btnMemoryTextAndroid : null,
                            ]}
                            numberOfLines={2}
                            adjustsFontSizeToFit
                            minimumFontScale={0.8}
                          >
                            {isMini ? "Complete with Memory" : "Save moment"}
                          </Text>
                        )}
                      </Pressable>
                    </CoachMarkTarget>
                  </View>
                </View>
              )}
              {isMemoryCreate && submitting ? (
                <View
                  pointerEvents="auto"
                  style={[
                    styles.submittingOverlay,
                    {
                      backgroundColor: isDark ? "rgba(0, 0, 0, 0.52)" : "rgba(248, 250, 252, 0.94)",
                    },
                  ]}
                >
                  <ActivityIndicator size="large" color={theme.colors.indigo[500]} />
                  <Text
                    style={[
                      styles.submittingOverlayText,
                      { color: theme.colors.textPrimary },
                    ]}
                  >
                    {submittingPublishCopy ? "Publishing to Community…" : "Saving…"}
                  </Text>
                </View>
              ) : null}
            </Animated.View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end" },
  /**
   * Do not use flex:1 here — a full-screen KAV sits above the backdrop Pressable and can
   * swallow taps (Android): dismiss / back navigation feels “stuck”. Only wrap the sheet width.
   */
  kav: { width: "100%", justifyContent: "flex-end" },
  sheetPress: { width: "100%" },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  /** Clips the submitting overlay to the sheet’s rounded top corners. */
  sheetCreateOverflow: { overflow: "hidden" },
  submittingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 28,
    gap: 14,
  },
  submittingOverlayText: {
    fontSize: 15,
    fontWeight: "700",
    textAlign: "center",
    letterSpacing: 0.2,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  sheetHeaderCompact: { marginBottom: 8 },
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
  kickerMemory: { marginBottom: 4 },
  title: { fontWeight: "800", marginBottom: 6 },
  titleMemory: { marginBottom: 6 },
  sub: { fontSize: 15, lineHeight: 20, marginBottom: 10 },
  subMemory: { marginBottom: 12 },
  hint: { fontSize: 13, lineHeight: 18, marginBottom: 12 },
  hintMemory: { fontSize: 12, lineHeight: 17, marginBottom: 10 },
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
  /** Habit + mini create: borderless, compact (orangish fill applied inline). */
  immutableNoticeMemory: {
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: 2,
    marginBottom: 12,
    borderRadius: 12,
    borderWidth: 0,
  },
  immutableNoticeIconWrap: { paddingTop: 1 },
  immutableNoticeTextCol: { flex: 1 },
  immutableNoticeTitle: {
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  immutableNoticeTitleMemory: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.15,
  },
  scrollInner: {
    paddingBottom: 16,
    paddingTop: 2,
    flexGrow: 1,
  },
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
  /**
   * Memory capture (habit + mini): do not stretch scroll content — avoids a huge empty band above footer.
   */
  createScrollContentMemory: {
    flexGrow: 0,
    paddingBottom: 8,
  },
  photoSlotWrap: {
    alignSelf: "stretch",
    width: "100%",
    marginBottom: 14,
  },
  photoSlotWrapMemory: {
    marginTop: 2,
    marginBottom: 12,
  },
  photoSlot: {
    width: "100%",
    alignSelf: "stretch",
    aspectRatio: 4 / 5,
    borderRadius: 16,
    borderWidth: 2,
    borderStyle: "dashed",
    overflow: "hidden",
  },
  /** Short fixed height — habit + mini (cover fills the frame). */
  photoSlotMemory: {
    width: "100%",
    alignSelf: "stretch",
    height: 128,
    borderRadius: 12,
    borderWidth: 2,
    borderStyle: "dashed",
    overflow: "hidden",
  },
  /** Fills the aspect-ratio box so `Image` + cover cannot letterbox inside the slot. */
  photoSlotImageFill: {
    ...StyleSheet.absoluteFillObject,
  },
  photo: { width: "100%", height: "100%" },
  photoEmpty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  photoEmptyMemory: {
    padding: 8,
  },
  photoCta: { marginTop: 10, fontSize: 13, fontWeight: "600" },
  photoCtaMemory: { marginTop: 4, fontSize: 12 },
  input: {
    minHeight: 88,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    textAlignVertical: "top",
  },
  inputMemory: {
    minHeight: 52,
    marginTop: 4,
    paddingVertical: 9,
    fontSize: 12,
    lineHeight: 17,
    borderRadius: 12,
  },
  counter: { alignSelf: "flex-end", fontSize: 11, marginTop: 4, marginBottom: 4 },
  counterMemory: { marginTop: 6, marginBottom: 0 },
  communityPublishRow: {
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  communityPublishRowMini: {
    marginTop: 0,
    marginBottom: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  communityPublishTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  communityPublishTopRowMini: {
    alignItems: "flex-start",
  },
  communityPublishGlobe: { marginTop: 2 },
  communityPublishGlobeMini: { marginTop: 3 },
  communityPublishTextCol: { flex: 1, minWidth: 0 },
  communityPublishTitle: { fontWeight: "700", fontSize: 14 },
  communityPublishHint: { fontSize: 11, marginTop: 4, lineHeight: 16 },
  /** Shorter line height for mini row when description is shown under the title. */
  communityPublishHintMiniBody: { fontSize: 11, marginTop: 4, lineHeight: 15 },
  communityViewRevokedText: { fontSize: 12, lineHeight: 17 },
  actions: {
    flexDirection: "row",
    gap: 10,
    flexShrink: 0,
    paddingHorizontal: 0,
  },
  actionsMemory: {
    gap: 8,
  },
  actionsMemoryStacked: {
    flexDirection: "column",
  },
  memoryCoachTarget: { flex: 1, minHeight: 58 },
  memoryCoachTargetStacked: {
    flex: 0,
    width: "100%",
  },
  btnSecondary: {
    flex: 1,
    minHeight: 48,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  btnSecondaryMemory: {
    minHeight: 58,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  btnSecondaryText: { fontWeight: "700", fontSize: 14, textAlign: "center" },
  btnSecondaryTextMemory: {
    fontSize: 12.5,
    fontWeight: "600",
    letterSpacing: 0,
    maxWidth: "100%",
    textAlign: "center",
  },
  btnPrimary: {
    flex: 1,
    minHeight: 48,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  btnPrimaryMemory: {
    minHeight: 58,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  btnPrimaryText: { fontWeight: "800", fontSize: 15 },
  btnPrimaryTextMemory: {
    fontSize: 12.5,
    fontWeight: "600",
    letterSpacing: 0,
    maxWidth: "100%",
    textAlign: "center",
  },
  btnMemoryTextAndroid: { includeFontPadding: true },
  btnMemoryStacked: {
    flex: 0,
    width: "100%",
  },
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
    alignSelf: "stretch",
    aspectRatio: 4 / 5,
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
    marginBottom: 14,
  },
  /** Text-only saved memory: editorial “field note” layout (no photo). */
  textOnlyMemoryCard: {
    alignSelf: "stretch",
    width: "100%",
    borderRadius: 20,
    borderWidth: 1,
    borderLeftWidth: 5,
    paddingVertical: 22,
    paddingHorizontal: 20,
    marginBottom: 14,
    overflow: "hidden",
  },
  textOnlyMemoryWatermark: {
    position: "absolute",
    right: 10,
    top: 8,
    opacity: 0.2,
  },
  textOnlyMemoryKicker: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 2,
    marginBottom: 14,
  },
  textOnlyMemoryBody: {
    fontSize: 18,
    lineHeight: 28,
    fontWeight: "600",
    letterSpacing: 0.15,
    width: "100%",
    flexShrink: 1,
  },
  communityPublishSpinner: { marginTop: 4, marginRight: 2 },
  viewNoteBox: {
    alignSelf: "stretch",
    width: "100%",
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 16,
    overflow: "hidden",
  },
  viewNoteText: {
    fontSize: 16,
    lineHeight: 24,
    width: "100%",
    flexShrink: 1,
  },
  checkInOnlyCard: {
    alignSelf: "stretch",
    width: "100%",
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 16,
    paddingHorizontal: 16,
    marginBottom: 14,
  },
  checkInOnlyTitle: { fontSize: 16, fontWeight: "800", marginBottom: 8 },
  checkInOnlyBody: { fontSize: 14, lineHeight: 21, fontWeight: "600" },
  emptyView: { fontSize: 14, fontStyle: "italic", textAlign: "center", paddingVertical: 12 },
});
