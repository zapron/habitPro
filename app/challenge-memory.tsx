import { Text } from "../src/components/AppText";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ArrowLeft,
  Camera,
  Check,
  ChevronDown,
  ChevronUp,
  Flame,
  Globe,
  Heart,
  Lock,
  MessageSquare,
  RefreshCw,
  ThumbsUp,
  Users,
  XCircle,
} from "lucide-react-native";
import { CustomNudgeModal } from "../src/components/CustomNudgeModal";
import { CommunityWinCheerersModal } from "../src/components/CommunityWinCheerersModal";
import { Screen } from "../src/components/Screen";
import { useAuth } from "../src/context/AuthContext";
import { usePlusUpsell } from "../src/context/PlusUpsellContext";
import { usePremium } from "../src/context/PremiumContext";
import { useTheme } from "../src/context/ThemeContext";
import { useToast } from "../src/context/ToastContext";
import { useUsernameGate } from "../src/context/UsernameGateContext";
import {
  fetchChallengeMemoryDetail,
  type ChallengeMemoryDetail,
  type ChallengeMemoryStatus,
} from "../src/lib/challengeMemoryDetail";
import {
  listSentPresetNudgeKindsToday,
  sendChallengeCustomNudge,
  sendChallengeNudge,
} from "../src/lib/challengeCohort";
import { toggleCheer } from "../src/lib/communityWinsApi";
import { adjustCachedUnreadNotificationCount, markNotificationRead } from "../src/lib/groupChallengesApi";
import { backOrReplace } from "../src/lib/navigation";
import { useRefreshPremiumAccess } from "../src/hooks/useRefreshPremiumAccess";
import type { PresetChallengeNudgeKind } from "../src/types/groupChallenge";
import { formatDateDisplay } from "../src/utils/dateDisplay";

const COMMUNITY_BADGE_BACKGROUND = "rgba(79, 70, 229, 0.9)";
const COMMUNITY_PHOTO_ASPECT_RATIO = 0.9;
const NOTE_COLLAPSE_LIMIT = 90;

function paramString(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return typeof value === "string" ? value : "";
}

function fallbackHandle(value: string): string | null {
  const trimmed = value.trim().replace(/^@/, "").toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

function memberLabel(detail: ChallengeMemoryDetail | null, fallbackUsername: string): string {
  if (detail?.subjectDisplayName) return detail.subjectDisplayName;
  if (detail?.subjectUsername) return `@${detail.subjectUsername}`;
  const handle = fallbackHandle(fallbackUsername);
  return handle ? `@${handle}` : "Squad member";
}

function statusTitle(status: ChallengeMemoryStatus, photoSyncState: ChallengeMemoryDetail["photoSyncState"]): string {
  if (status === "photo" && photoSyncState === "local_only") return "Photo is still syncing";
  if (status === "photo") return "Photo memory";
  if (status === "text") return "Text memory";
  if (status === "check_in_only") return "Day marked complete";
  if (status === "private") return "Private check-in";
  return "Memory unavailable";
}

function statusBody(detail: ChallengeMemoryDetail | null, fallbackName: string): string {
  if (!detail) return "Could not load this squad update.";
  const who = memberLabel(detail, fallbackName);
  if (detail.status === "photo" && detail.photoSyncState === "local_only") {
    return `${who} added a photo, but it has not finished syncing to cloud yet.`;
  }
  if (detail.status === "photo") return "The photo could not be loaded right now.";
  if (detail.status === "text") return `${who} shared a note for this check-in.`;
  if (detail.status === "check_in_only") return `${who} completed the day without sharing a note or photo.`;
  if (detail.status === "private") return `${who} completed the day privately, so the note or photo stays hidden.`;
  return "This squad update may have been deleted, changed, or is no longer available.";
}

function statusIcon(status: ChallengeMemoryStatus, photoSyncState: ChallengeMemoryDetail["photoSyncState"]) {
  if (status === "photo" && photoSyncState === "local_only") return RefreshCw;
  if (status === "photo") return Camera;
  if (status === "text") return MessageSquare;
  if (status === "check_in_only") return Check;
  if (status === "private") return Lock;
  return XCircle;
}

const SQUAD_ACTIONS: Array<{
  kind: PresetChallengeNudgeKind | "custom_note";
  label: string;
  subtitle: string;
  icon: typeof Heart | null;
  glyph?: string;
}> = [
  { kind: "cheer", label: "Cheer", subtitle: "Support", icon: Heart },
  { kind: "ping", label: "What's up", subtitle: "Check in", icon: null, glyph: "?!" },
  { kind: "fire", label: "Fire", subtitle: "Raise bar", icon: Flame },
  { kind: "custom_note", label: "Note", subtitle: "Send note", icon: MessageSquare },
];

export default function ChallengeMemoryScreen() {
  const params = useLocalSearchParams<Record<string, string | string[] | undefined>>();
  const challengeId = paramString(params.challengeId);
  const actorUserId = paramString(params.actorUserId);
  const dateStr = paramString(params.dateStr);
  const habitId = paramString(params.habitId);
  const notificationId = paramString(params.notificationId);
  const fallbackActorUsername = paramString(params.actorUsername);
  const fallbackHabitTitle = paramString(params.habitTitle);

  const router = useRouter();
  const { theme, isDark } = useTheme();
  const { session } = useAuth();
  const { isPremium, loading: premiumLoading } = usePremium();
  const { openUpsell } = usePlusUpsell();
  const { showToast } = useToast();
  const { requireUsername } = useUsernameGate();
  const refreshPremiumAccess = useRefreshPremiumAccess();

  const [detail, setDetail] = useState<ChallengeMemoryDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [imageViewerOpen, setImageViewerOpen] = useState(false);
  const [nudgeBusyKey, setNudgeBusyKey] = useState<string | null>(null);
  const [sentPresetNudgeKindsToday, setSentPresetNudgeKindsToday] = useState<Set<PresetChallengeNudgeKind>>(() => new Set());
  const [customNoteOpen, setCustomNoteOpen] = useState(false);
  const [cheerBusy, setCheerBusy] = useState(false);
  const [cheerersOpen, setCheerersOpen] = useState(false);
  const [noteExpanded, setNoteExpanded] = useState(false);
  const actionInFlightRef = useRef(false);

  const socialLocked = !isPremium || premiumLoading;
  const isOwnSubject = Boolean(session?.user?.id && detail?.subjectUserId === session.user.id);
  const displayName = memberLabel(detail, fallbackActorUsername);
  const habitTitle = (detail?.habitTitle ?? fallbackHabitTitle.trim()) || "Group mission";
  const canOpenSquad = challengeId.trim().length > 0;

  const load = useCallback(
    async (options?: { refreshing?: boolean }) => {
      if (!challengeId || !actorUserId || !dateStr) {
        setDetail(null);
        setError("This notification is missing the details needed to open the memory.");
        setLoading(false);
        setRefreshing(false);
        return;
      }
      if (options?.refreshing) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);
      setSentPresetNudgeKindsToday(new Set());
      try {
        const result = await fetchChallengeMemoryDetail({
          challengeId,
          actorUserId,
          dateStr,
          habitId: habitId || null,
        });
        if (result.ok === false) {
          setDetail(null);
          setError(result.error);
        } else {
          setDetail(result.detail);
          if (result.detail.canSendSquadNudge) {
            void listSentPresetNudgeKindsToday(result.detail.challengeId, [result.detail.subjectUserId])
              .then((sentByUser) => {
                setSentPresetNudgeKindsToday(new Set(sentByUser[result.detail.subjectUserId] ?? []));
              })
              .catch((e) => {
                if (__DEV__) console.warn("[challenge-memory] listSentPresetNudgeKindsToday", e);
              });
          }
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [actorUserId, challengeId, dateStr, habitId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!notificationId) return;
    adjustCachedUnreadNotificationCount(session?.user?.id, -1);
    void markNotificationRead(notificationId).catch(() => undefined);
  }, [notificationId, session?.user?.id]);

  useEffect(() => {
    setImageFailed(false);
    setImageLoading(Boolean(detail?.imageUrl));
    setImageViewerOpen(false);
  }, [detail?.imageUrl]);

  useEffect(() => {
    setNoteExpanded(false);
  }, [detail?.note]);

  const openSquad = useCallback(() => {
    if (challengeId) {
      router.push(`/challenge/${challengeId}`);
    } else {
      router.push("/(tabs)/compete");
    }
  }, [challengeId, router]);

  const handleServerPremiumRequired = useCallback(
    async (reason: "squad_nudge" | "community") => {
      await refreshPremiumAccess({ force: true, serverOnly: true });
      openUpsell(reason);
    },
    [openUpsell, refreshPremiumAccess],
  );

  const handleSendNudge = useCallback(
    async (kind: PresetChallengeNudgeKind) => {
      if (!detail?.canSendSquadNudge || actionInFlightRef.current) return;
      if (sentPresetNudgeKindsToday.has(kind)) return;
      actionInFlightRef.current = true;
      setNudgeBusyKey(`${detail.subjectUserId}-${kind}`);
      try {
        const freshPremium = await refreshPremiumAccess({ serverOnly: true, cachedAccessOk: true });
        if (freshPremium !== true) {
          openUpsell("squad_nudge");
          return;
        }
        const { error: nudgeError, reason } = await sendChallengeNudge(
          detail.challengeId,
          detail.subjectUserId,
          kind,
          {
            targetDateStr: detail.dateStr,
            targetMissionDay: detail.missionDay,
          },
        );
        if (nudgeError) {
          if (reason === "premium_required") {
            await handleServerPremiumRequired("squad_nudge");
            return;
          }
          if (nudgeError.message.toLowerCase().includes("already sent")) {
            setSentPresetNudgeKindsToday((prev) => {
              if (prev.has(kind)) return prev;
              const next = new Set(prev);
              next.add(kind);
              return next;
            });
            showToast("You already sent that today.", "info");
            return;
          }
          showToast(nudgeError.message, "error");
          return;
        }
        setSentPresetNudgeKindsToday((prev) => {
          if (prev.has(kind)) return prev;
          const next = new Set(prev);
          next.add(kind);
          return next;
        });
        showToast("Sent to the squad.", "success");
      } finally {
        actionInFlightRef.current = false;
        setNudgeBusyKey(null);
      }
    },
    [detail, handleServerPremiumRequired, openUpsell, refreshPremiumAccess, sentPresetNudgeKindsToday, showToast],
  );

  const handleOpenCustomNote = useCallback(() => {
    if (!detail?.canSendSquadNudge) return;
    void (async () => {
      const freshPremium = await refreshPremiumAccess({ serverOnly: true, cachedAccessOk: true });
      if (freshPremium !== true) {
        openUpsell("squad_nudge");
        return;
      }
      setCustomNoteOpen(true);
    })();
  }, [detail?.canSendSquadNudge, openUpsell, refreshPremiumAccess]);

  const handleSubmitCustomNote = useCallback(
    async (message: string) => {
      if (!detail?.canSendSquadNudge) return;
      const freshPremium = await refreshPremiumAccess({ serverOnly: true, cachedAccessOk: true });
      if (freshPremium !== true) {
        openUpsell("squad_nudge");
        return;
      }
      setNudgeBusyKey(`${detail.subjectUserId}-custom_note`);
      try {
        const { error: noteError, reason } = await sendChallengeCustomNudge(
          detail.challengeId,
          detail.subjectUserId,
          message,
          {
            targetDateStr: detail.dateStr,
            targetMissionDay: detail.missionDay,
          },
        );
        if (noteError) {
          if (reason === "premium_required") {
            await handleServerPremiumRequired("squad_nudge");
            return;
          }
          showToast(noteError.message, "error");
          return;
        }
        setDetail((prev) => (prev ? { ...prev, customNoteSentToday: true } : prev));
        setCustomNoteOpen(false);
        showToast("Note sent.", "success");
      } finally {
        setNudgeBusyKey(null);
      }
    },
    [detail, handleServerPremiumRequired, openUpsell, refreshPremiumAccess, showToast],
  );

  const handleToggleCommunityCheer = useCallback(async () => {
    const win = detail?.communityWin;
    if (!detail || !win || cheerBusy || isOwnSubject) return;
    if (!session?.user) {
      showToast("Sign in to cheer this moment.", "error");
      return;
    }
    const ok = await requireUsername("community_like");
    if (!ok) return;
    const freshPremium = await refreshPremiumAccess({ serverOnly: true, cachedAccessOk: true });
    if (freshPremium !== true) {
      openUpsell("community");
      return;
    }

    const nextLiked = !win.viewerHasCheered;
    const nextWin = {
      ...win,
      viewerHasCheered: nextLiked,
      cheerCount: Math.max(0, win.cheerCount + (nextLiked ? 1 : -1)),
    };
    setDetail((prev) => (prev?.communityWin?.id === win.id ? { ...prev, communityWin: nextWin } : prev));
    setCheerBusy(true);
    const result = await toggleCheer(win.id, win.viewerHasCheered);
    setCheerBusy(false);
    if (result.ok === false) {
      setDetail((prev) => (prev?.communityWin?.id === win.id ? { ...prev, communityWin: win } : prev));
      if (result.reason === "premium_required") {
        await handleServerPremiumRequired("community");
      } else {
        showToast(result.error, "error");
      }
    }
  }, [
    cheerBusy,
    detail,
    handleServerPremiumRequired,
    isOwnSubject,
    openUpsell,
    refreshPremiumAccess,
    requireUsername,
    session?.user,
    showToast,
  ]);

  const StatusIcon = useMemo(
    () => statusIcon(detail?.status ?? "not_found", detail?.photoSyncState ?? "none"),
    [detail?.photoSyncState, detail?.status],
  );

  const stateTitle = statusTitle(detail?.status ?? "not_found", detail?.photoSyncState ?? "none");
  const stateBody = error ?? statusBody(detail, fallbackActorUsername);
  const showSyncedPhoto = detail?.status === "photo" && detail.photoSyncState === "synced" && detail.imageUrl && !imageFailed;
  const showCommunityWin = Boolean(detail?.communityWin);
  const showCommunityPhoto = Boolean(showSyncedPhoto && showCommunityWin);
  const noteText = (detail?.note ?? "").trim();
  const hasLongNote = noteText.length > NOTE_COLLAPSE_LIMIT || noteText.includes("\n");

  return (
    <Screen>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={theme.colors.background} />

      <View style={styles.header}>
        <TouchableOpacity
          style={[styles.iconButton, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
          onPress={() => backOrReplace(router, canOpenSquad ? `/challenge/${challengeId}` : "/(tabs)/compete")}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <ArrowLeft size={theme.icon.xl} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={[styles.headerEyebrow, { color: theme.colors.cyan[400] }]}>Squad update</Text>
          <Text style={[styles.headerTitle, { color: theme.colors.textPrimary }]} numberOfLines={1}>
            {displayName}
          </Text>
        </View>
      </View>

      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void load({ refreshing: true })}
            tintColor={theme.colors.indigo[400]}
          />
        }
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View style={[styles.loadingPanel, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
            <ActivityIndicator size="large" color={theme.colors.indigo[400]} />
            <Text style={[styles.loadingText, { color: theme.colors.textSecondary }]}>Opening squad memory...</Text>
          </View>
        ) : (
          <>
            <View style={[styles.memoryPanel, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
              {showSyncedPhoto ? (
                <Pressable
                  style={[styles.photoWrap, showCommunityPhoto && styles.communityPhotoWrap]}
                  onPress={() => setImageViewerOpen(true)}
                  accessibilityRole="imagebutton"
                  accessibilityLabel="Open photo full screen"
                >
                  <Image
                    source={{ uri: detail.imageUrl! }}
                    style={styles.photo}
                    resizeMode={showCommunityPhoto ? "cover" : "contain"}
                    onLoadStart={() => setImageLoading(true)}
                    onLoadEnd={() => setImageLoading(false)}
                    onError={() => {
                      setImageFailed(true);
                      setImageLoading(false);
                    }}
                  />
                  {imageLoading ? (
                    <View style={[StyleSheet.absoluteFillObject, styles.photoLoading, { backgroundColor: "rgba(15,23,42,0.5)" }]}>
                      <ActivityIndicator size="small" color="#fff" />
                    </View>
                  ) : null}
                  {showCommunityWin ? (
                    <View
                      style={[
                        styles.communityBadgeWrap,
                        {
                          shadowColor: "#4F46E5",
                          shadowOpacity: isDark ? 0.42 : 0.28,
                          shadowRadius: 9,
                          shadowOffset: { width: 0, height: 0 },
                          elevation: 5,
                        },
                      ]}
                      accessibilityLabel="Community post"
                    >
                      <View
                        style={[
                          styles.communityBadgeHalo,
                          { backgroundColor: isDark ? "rgba(79, 70, 229, 0.38)" : "rgba(79, 70, 229, 0.24)" },
                        ]}
                      />
                      <View style={[styles.communityBadge, { backgroundColor: COMMUNITY_BADGE_BACKGROUND }]}>
                        <Globe size={11} color="#FFFFFF" strokeWidth={2.35} />
                      </View>
                    </View>
                  ) : null}
                </Pressable>
              ) : (
                <View
                  style={[
                    styles.stateBlock,
                    {
                      backgroundColor: isDark ? theme.colors.surfaceElevated : "#f8fafc",
                      borderColor: theme.colors.border,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.stateIconOrb,
                      {
                        borderColor: theme.colors.indigo[500],
                        backgroundColor: isDark ? "rgba(99, 102, 241, 0.14)" : "rgba(99, 102, 241, 0.08)",
                      },
                    ]}
                  >
                    <StatusIcon size={32} color={theme.colors.indigo[500]} strokeWidth={2.2} />
                  </View>
                  <Text style={[styles.stateTitle, { color: theme.colors.textPrimary }]}>{stateTitle}</Text>
                  <Text style={[styles.stateBody, { color: theme.colors.textSecondary }]}>{stateBody}</Text>
                </View>
              )}

              <View style={styles.metaBlock}>
                <View style={styles.titleLine}>
                  <View style={styles.titleCopy}>
                    <Text style={[styles.habitTitle, { color: theme.colors.textPrimary }]} numberOfLines={2}>
                      {habitTitle}
                    </Text>
                    <Text style={[styles.metaText, { color: theme.colors.textMuted }]}>
                      {formatDateDisplay(dateStr, dateStr)}
                      {detail?.missionDay ? ` · Day ${detail.missionDay}` : ""}
                    </Text>
                  </View>
                  {showCommunityWin && detail?.communityWin ? (
                    <View
                      style={[
                        styles.inlineCheerPill,
                        {
                          borderColor: detail.communityWin.viewerHasCheered
                            ? theme.colors.indigo[500]
                            : theme.colors.border,
                          backgroundColor: detail.communityWin.viewerHasCheered
                            ? theme.colors.indigo[600]
                            : theme.colors.surfaceElevated,
                        },
                      ]}
                    >
                      <Pressable
                        style={styles.inlineCheerIcon}
                        disabled={cheerBusy || isOwnSubject}
                        onPress={handleToggleCommunityCheer}
                        accessibilityRole="button"
                        accessibilityLabel={detail.communityWin.viewerHasCheered ? "Remove cheer" : "Cheer"}
                      >
                        {cheerBusy ? (
                          <ActivityIndicator
                            size="small"
                            color={detail.communityWin.viewerHasCheered ? "#fff" : theme.colors.indigo[400]}
                          />
                        ) : (
                          <ThumbsUp
                            size={14}
                            color={detail.communityWin.viewerHasCheered ? "#fff" : theme.colors.indigo[400]}
                            fill={detail.communityWin.viewerHasCheered ? "#fff" : "transparent"}
                          />
                        )}
                      </Pressable>
                      <Pressable
                        style={styles.inlineCheerCount}
                        disabled={detail.communityWin.cheerCount <= 0}
                        onPress={() => setCheerersOpen(true)}
                        accessibilityRole="button"
                        accessibilityLabel="View cheers"
                      >
                        <Text
                          style={[
                            styles.inlineCheerText,
                            { color: detail.communityWin.viewerHasCheered ? "#fff" : theme.colors.textPrimary },
                          ]}
                        >
                          {detail.communityWin.cheerCount}
                        </Text>
                      </Pressable>
                    </View>
                  ) : null}
                </View>
                {noteText ? (
                  <>
                    <Text
                      style={[styles.noteText, { color: theme.colors.textSecondary }]}
                      numberOfLines={hasLongNote && !noteExpanded ? 2 : undefined}
                    >
                      {noteText}
                    </Text>
                    {hasLongNote ? (
                      <Pressable
                        onPress={() => setNoteExpanded((value) => !value)}
                        style={({ pressed }) => [
                          styles.noteToggle,
                          {
                            borderColor: noteExpanded
                              ? theme.colors.indigo[400]
                              : isDark
                                ? "rgba(165, 180, 252, 0.38)"
                                : "rgba(79, 70, 229, 0.32)",
                            backgroundColor: noteExpanded
                              ? isDark
                                ? "rgba(99, 102, 241, 0.14)"
                                : "rgba(79, 70, 229, 0.08)"
                              : "transparent",
                            opacity: pressed ? 0.82 : 1,
                          },
                        ]}
                        hitSlop={6}
                        accessibilityRole="button"
                        accessibilityLabel={noteExpanded ? "Show less note text" : "Show more note text"}
                      >
                        <Text style={[styles.noteToggleText, { color: theme.colors.indigo[400] }]}>
                          {noteExpanded ? "Show less" : "Show more"}
                        </Text>
                        {noteExpanded ? (
                          <ChevronUp size={12} color={theme.colors.indigo[400]} strokeWidth={2.4} />
                        ) : (
                          <ChevronDown size={12} color={theme.colors.indigo[400]} strokeWidth={2.4} />
                        )}
                      </Pressable>
                    ) : null}
                  </>
                ) : null}
              </View>
            </View>

            {detail?.canSendSquadNudge ? (
              <View style={[styles.actionsPanel, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
                <View style={styles.actionsHeader}>
                  <Users size={16} color={theme.colors.cyan[400]} />
                  <Text style={[styles.actionsTitle, { color: theme.colors.textPrimary }]}>Squad actions</Text>
                </View>
                <View style={styles.actionGrid}>
                  {SQUAD_ACTIONS.map(({ kind, label, subtitle, icon: Icon, glyph }) => {
                    const isCustom = kind === "custom_note";
                    const busy = nudgeBusyKey === `${detail.subjectUserId}-${kind}`;
                    const presetSentToday = !isCustom && sentPresetNudgeKindsToday.has(kind);
                    const customSentToday = isCustom && detail.customNoteSentToday;
                    const disabled = busy || customSentToday || presetSentToday;
                    const accent =
                      kind === "cheer"
                        ? theme.colors.indigo[400]
                        : kind === "ping"
                          ? theme.colors.cyan[400]
                          : kind === "fire"
                            ? theme.colors.amber[500]
                            : isDark
                              ? "#c4b5fd"
                              : "#7c3aed";
                    const bg =
                      kind === "cheer"
                        ? isDark
                          ? "rgba(129, 140, 248, 0.10)"
                          : "rgba(99, 102, 241, 0.07)"
                        : kind === "ping"
                          ? isDark
                            ? "rgba(34, 211, 238, 0.09)"
                            : "rgba(8, 145, 178, 0.06)"
                          : kind === "fire"
                            ? isDark
                              ? "rgba(251, 191, 36, 0.10)"
                              : "rgba(217, 119, 6, 0.07)"
                            : isDark
                              ? "rgba(167, 139, 250, 0.10)"
                              : "rgba(124, 58, 237, 0.06)";

                    return (
                      <Pressable
                        key={kind}
                        disabled={disabled}
                        onPress={() => {
                          if (socialLocked) {
                            openUpsell("squad_nudge");
                            return;
                          }
                          if (isCustom) {
                            handleOpenCustomNote();
                            return;
                          }
                          void handleSendNudge(kind);
                        }}
                        style={({ pressed }) => [
                          styles.actionTile,
                          {
                            backgroundColor: bg,
                            borderColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(15,23,42,0.08)",
                            opacity: disabled || socialLocked ? 0.58 : pressed ? 0.9 : 1,
                            transform: [{ scale: pressed && !disabled ? 0.98 : 1 }],
                          },
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel={customSentToday || presetSentToday ? `${label} sent today` : label}
                      >
                        {busy ? (
                          <ActivityIndicator size="small" color={accent} />
                        ) : (
                          <>
                            <View style={styles.actionTileTop}>
                              {glyph ? (
                                <Text style={[styles.actionGlyph, { color: accent }]}>{glyph}</Text>
                              ) : Icon ? (
                                <Icon size={17} color={accent} strokeWidth={2.2} />
                              ) : null}
                              <Text style={[styles.actionLabel, { color: theme.colors.textPrimary }]} numberOfLines={1}>
                                {customSentToday ? "Note sent" : label}
                              </Text>
                            </View>
                            <Text style={[styles.actionSubtitle, { color: theme.colors.textMuted }]} numberOfLines={1}>
                              {customSentToday || presetSentToday ? "Sent today" : subtitle}
                            </Text>
                          </>
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}

            <Pressable
              style={({ pressed }) => [
                styles.openSquadPressable,
                { opacity: pressed ? 0.9 : 1 },
              ]}
              onPress={openSquad}
              accessibilityRole="button"
              accessibilityLabel="Open squad"
            >
              <LinearGradient
                colors={isDark ? ["#4F46E5", "#0891B2", "#F59E0B"] : ["#4F46E5", "#06B6D4", "#F59E0B"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.openSquadButton, theme.shadow.card]}
              >
                <Users size={18} color="#fff" />
                <Text style={styles.openSquadText}>Open squad</Text>
              </LinearGradient>
            </Pressable>
          </>
        )}
      </ScrollView>

      <Modal
        visible={imageViewerOpen && Boolean(detail?.imageUrl)}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setImageViewerOpen(false)}
      >
        <Pressable style={styles.fullscreenBackdrop} onPress={() => setImageViewerOpen(false)}>
          {detail?.imageUrl ? (
            <Image source={{ uri: detail.imageUrl }} style={styles.fullscreenImage} resizeMode="contain" />
          ) : null}
          <Pressable
            style={[styles.fullscreenClose, { backgroundColor: "rgba(15,23,42,0.78)" }]}
            onPress={() => setImageViewerOpen(false)}
            accessibilityRole="button"
            accessibilityLabel="Close photo"
          >
            <XCircle size={28} color="#fff" />
          </Pressable>
        </Pressable>
      </Modal>

      <CommunityWinCheerersModal
        visible={cheerersOpen}
        winId={detail?.communityWin?.id ?? null}
        totalLikes={detail?.communityWin?.cheerCount ?? null}
        onClose={() => setCheerersOpen(false)}
      />

      <CustomNudgeModal
        visible={customNoteOpen}
        onRequestClose={() => setCustomNoteOpen(false)}
        recipientLabel={displayName}
        busy={Boolean(detail && nudgeBusyKey === `${detail.subjectUserId}-custom_note`)}
        onSend={(text) => void handleSubmitCustomNote(text)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 14,
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  headerEyebrow: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0,
  },
  headerTitle: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "900",
    letterSpacing: 0,
  },
  scrollContent: {
    paddingBottom: 30,
    gap: 12,
  },
  loadingPanel: {
    minHeight: 260,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
  },
  memoryPanel: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
  },
  photoWrap: {
    width: "100%",
    aspectRatio: 1.35,
    maxHeight: 360,
    backgroundColor: "#020617",
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  communityPhotoWrap: {
    aspectRatio: COMMUNITY_PHOTO_ASPECT_RATIO,
    maxHeight: 620,
    backgroundColor: "#0a0a0a",
  },
  photo: {
    width: "100%",
    height: "100%",
  },
  photoLoading: {
    alignItems: "center",
    justifyContent: "center",
  },
  communityBadgeWrap: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 34,
    height: 34,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  communityBadgeHalo: {
    position: "absolute",
    width: 31,
    height: 31,
    borderRadius: 999,
  },
  communityBadge: {
    minWidth: 22,
    minHeight: 22,
    borderRadius: 999,
    paddingHorizontal: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  stateBlock: {
    minHeight: 220,
    borderBottomWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  stateIconOrb: {
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  stateTitle: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: "900",
    textAlign: "center",
    letterSpacing: 0,
  },
  stateBody: {
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "600",
    textAlign: "center",
    marginTop: 8,
  },
  metaBlock: {
    padding: 16,
  },
  titleLine: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  titleCopy: {
    flex: 1,
    minWidth: 0,
  },
  habitTitle: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "900",
    letterSpacing: 0,
  },
  metaText: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "800",
    marginTop: 4,
  },
  noteText: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "600",
    marginTop: 10,
  },
  noteToggle: {
    alignSelf: "flex-start",
    marginTop: 8,
    paddingVertical: 3,
    paddingHorizontal: 9,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  noteToggleText: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "800",
  },
  inlineCheerPill: {
    minHeight: 30,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    overflow: "hidden",
    flexShrink: 0,
  },
  inlineCheerIcon: {
    minWidth: 30,
    minHeight: 30,
    alignItems: "center",
    justifyContent: "center",
    paddingLeft: 9,
    paddingRight: 4,
  },
  inlineCheerCount: {
    minHeight: 30,
    minWidth: 23,
    alignItems: "center",
    justifyContent: "center",
    paddingRight: 9,
    paddingLeft: 2,
  },
  inlineCheerText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "900",
  },
  actionsPanel: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  actionsHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginBottom: 0,
  },
  actionsTitle: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "900",
  },
  actionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
    marginTop: 9,
  },
  actionTile: {
    width: "48.6%",
    minHeight: 52,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    paddingVertical: 8,
    justifyContent: "center",
  },
  actionTileTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minWidth: 0,
  },
  actionGlyph: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "900",
    letterSpacing: 0,
  },
  actionLabel: {
    flexShrink: 1,
    minWidth: 0,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "900",
    letterSpacing: 0,
  },
  actionSubtitle: {
    fontSize: 9,
    lineHeight: 12,
    fontWeight: "700",
    marginTop: 2,
  },
  openSquadPressable: {
    borderRadius: 22,
  },
  openSquadButton: {
    minHeight: 58,
    borderRadius: 22,
    paddingHorizontal: 22,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  openSquadText: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "900",
    letterSpacing: 0,
  },
  fullscreenBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.94)",
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
  },
  fullscreenImage: {
    width: "100%",
    height: "100%",
  },
  fullscreenClose: {
    position: "absolute",
    top: 42,
    right: 18,
    width: 44,
    height: 44,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
});
