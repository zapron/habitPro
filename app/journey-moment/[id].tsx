import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { ArrowLeft, Camera, ChevronRight, Clock3, Globe, Image as ImageIcon, Radio, RefreshCw, ThumbsUp, User } from "lucide-react-native";
import { Text } from "../../src/components/AppText";
import { CommunityWinCheerersModal } from "../../src/components/CommunityWinCheerersModal";
import { CommunityWinImageLightbox } from "../../src/components/CommunityWinImageLightbox";
import { Screen } from "../../src/components/Screen";
import { useAuth } from "../../src/context/AuthContext";
import { usePlusUpsell } from "../../src/context/PlusUpsellContext";
import { useTheme } from "../../src/context/ThemeContext";
import { useToast } from "../../src/context/ToastContext";
import { useUsernameGate } from "../../src/context/UsernameGateContext";
import { buildStreakCelebrationKicker } from "../../src/lib/communityStreakFeedCopy";
import { formatCompletedAt, formatRelativeTime } from "../../src/lib/communityWinFeedFormat";
import { fetchCommunityWinMoment, toggleCheer, type CommunityWinFeedItem } from "../../src/lib/communityWinsApi";
import { backOrReplace } from "../../src/lib/navigation";

const IMAGE_RENDER_SEGMENT = "/storage/v1/render/image/public/";

function paramString(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function thumbnailUri(uri: string | null, width: number, height: number): string | null {
  if (!uri) return null;
  if (!uri.includes(IMAGE_RENDER_SEGMENT)) return uri;
  const separator = uri.includes("?") ? "&" : "?";
  const w = Math.max(160, Math.round(width));
  const h = Math.max(160, Math.round(height));
  return `${uri}${separator}width=${w}&height=${h}&resize=cover&quality=72`;
}

function ownerLabel(win: CommunityWinFeedItem): string {
  const handle = win.username?.trim();
  if (handle) return `@${handle.toLowerCase()}`;
  const display = win.displayName?.trim();
  if (display) return display;
  return "Player";
}

function dayLabel(win: CommunityWinFeedItem): string {
  if (typeof win.streak_mission_day === "number" && win.streak_mission_day > 0) {
    return `Day ${win.streak_mission_day}`;
  }
  return formatCompletedAt(win.completed_at);
}

function sourceLabel(win: CommunityWinFeedItem): string {
  if (win.live_squad_id) return "Live";
  if (win.feed_source === "habit_streak") return "Mission proof";
  return "Mini proof";
}

function momentKicker(win: CommunityWinFeedItem): string {
  if (win.feed_source === "habit_streak") {
    const kicker = buildStreakCelebrationKicker({
      displayName: ownerLabel(win),
      missionTitle: win.title,
      missionDay: win.streak_mission_day ?? 0,
      streakCount: win.streak_count_at_post ?? win.streak_mission_day ?? 1,
    });
    return `${kicker.line1} ${kicker.missionLine}`;
  }
  return win.live_squad_id ? "Live mini shared publicly" : "Public mini shared by this player";
}

export default function JourneyMomentScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { theme, isDark } = useTheme();
  const { width } = useWindowDimensions();
  const { session } = useAuth();
  const { showToast } = useToast();
  const { openUpsell } = usePlusUpsell();
  const { requireUsername } = useUsernameGate();
  const id = paramString(params.id);
  const [moment, setMoment] = useState<CommunityWinFeedItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageFailed, setImageFailed] = useState(false);
  const [lightboxUri, setLightboxUri] = useState<string | null>(null);
  const [cheerBusy, setCheerBusy] = useState(false);
  const [cheerersOpen, setCheerersOpen] = useState(false);

  const imageHeight = useMemo(() => Math.min(430, Math.max(300, width * 0.8)), [width]);
  const imageUri = useMemo(
    () => (!imageFailed && moment?.memory_image_url ? thumbnailUri(moment.memory_image_url, width * 1.5, imageHeight * 1.5) : null),
    [imageFailed, imageHeight, moment?.memory_image_url, width],
  );
  const isOwnMoment = Boolean(moment && session?.user?.id === moment.user_id);

  const load = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!id) {
        setError("Moment not found.");
        setLoading(false);
        return;
      }
      if (mode === "refresh") setRefreshing(true);
      else setLoading(true);
      setError(null);
      setImageFailed(false);
      const res = await fetchCommunityWinMoment(id);
      if (res.ok) {
        setMoment(res.win);
      } else {
        setMoment(null);
        setError("error" in res ? res.error : "This moment could not be loaded.");
      }
      setLoading(false);
      setRefreshing(false);
    },
    [id],
  );

  useEffect(() => {
    void load("initial");
  }, [load]);

  const handleToggleCheer = useCallback(async () => {
    if (!moment || cheerBusy || isOwnMoment) return;
    if (!session?.user) {
      showToast("Sign in to like this moment.", "error");
      return;
    }
    const canContinue = await requireUsername("community_like");
    if (!canContinue) return;

    const before = moment;
    const nextLiked = !before.viewerHasCheered;
    setMoment({
      ...before,
      viewerHasCheered: nextLiked,
      cheerCount: Math.max(0, before.cheerCount + (nextLiked ? 1 : -1)),
    });
    setCheerBusy(true);
    const res = await toggleCheer(before.id, before.viewerHasCheered);
    setCheerBusy(false);
    if (res.ok === false) {
      setMoment(before);
      if (res.reason === "premium_required") {
        openUpsell("community");
      } else {
        showToast("error" in res ? res.error : "Could not update like.", "error");
      }
    }
  }, [cheerBusy, isOwnMoment, moment, openUpsell, requireUsername, session?.user, showToast]);

  const openJourney = useCallback(() => {
    if (!moment) return;
    const tab = moment.feed_source === "mini" ? "minis" : "missions";
    if (isOwnMoment) {
      router.push({
        pathname: "/my-journey",
        params: { mode: "public", tab, focusWinId: moment.id },
      });
      return;
    }
    router.push({
      pathname: "/community-player/[id]",
      params: {
        id: moment.user_id,
        username: moment.username ?? "",
        displayName: moment.displayName ?? "",
        xp: String(moment.xp),
        tab,
        focusWinId: moment.id,
      },
    });
  }, [isOwnMoment, moment, router]);

  const pageBg = theme.colors.background;
  const cardBg = theme.colors.surface;
  const muted = theme.colors.textSecondary;
  const border = theme.colors.border;
  const mediaBg = isDark ? "rgba(15, 23, 42, 0.88)" : "rgba(241, 245, 249, 0.95)";

  if (loading && !moment) {
    return (
      <Screen plain style={[styles.root, { backgroundColor: pageBg }]}>
        <View style={styles.header}>
          <Pressable
            style={[styles.iconButton, { backgroundColor: cardBg, borderColor: border }]}
            onPress={() => backOrReplace(router, "/(tabs)/community")}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <ArrowLeft size={22} color={theme.colors.textPrimary} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: theme.colors.textPrimary }]}>Liked moment</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.centerState}>
          <ActivityIndicator color={theme.colors.indigo[500]} />
          <Text style={[styles.stateText, { color: muted }]}>Loading moment...</Text>
        </View>
      </Screen>
    );
  }

  if (error || !moment) {
    return (
      <Screen plain style={[styles.root, { backgroundColor: pageBg }]}>
        <View style={styles.header}>
          <Pressable
            style={[styles.iconButton, { backgroundColor: cardBg, borderColor: border }]}
            onPress={() => backOrReplace(router, "/(tabs)/community")}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <ArrowLeft size={22} color={theme.colors.textPrimary} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: theme.colors.textPrimary }]}>Liked moment</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={[styles.errorCard, { backgroundColor: cardBg, borderColor: border }]}>
          <ImageIcon size={34} color={theme.colors.textSecondary} />
          <Text style={[styles.errorTitle, { color: theme.colors.textPrimary }]}>Moment unavailable</Text>
          <Text style={[styles.errorText, { color: muted }]}>{error ?? "This public proof could not be loaded."}</Text>
          <Pressable
            style={[styles.retryButton, { backgroundColor: theme.colors.indigo[500] }]}
            onPress={() => void load("refresh")}
            accessibilityRole="button"
          >
            <RefreshCw size={16} color="#fff" />
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  const hasImage = Boolean(imageUri);
  const note = moment.memory_note?.trim();

  return (
    <Screen plain style={[styles.root, { backgroundColor: pageBg }]}>
      <View style={styles.header}>
        <Pressable
          style={[styles.iconButton, { backgroundColor: cardBg, borderColor: border }]}
          onPress={() => backOrReplace(router, "/(tabs)/community")}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <ArrowLeft size={22} color={theme.colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.colors.textPrimary }]}>Liked moment</Text>
        <Pressable
          style={[styles.iconButton, { backgroundColor: cardBg, borderColor: border }]}
          onPress={() => void load("refresh")}
          disabled={refreshing}
          accessibilityRole="button"
          accessibilityLabel="Refresh moment"
        >
          {refreshing ? (
            <ActivityIndicator size="small" color={theme.colors.indigo[500]} />
          ) : (
            <RefreshCw size={19} color={theme.colors.textPrimary} />
          )}
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={[styles.contextCard, { backgroundColor: cardBg, borderColor: border }]}>
          <View style={[styles.avatar, { backgroundColor: isDark ? "rgba(99, 102, 241, 0.18)" : "rgba(99, 102, 241, 0.1)" }]}>
            <User size={21} color={theme.colors.indigo[500]} />
          </View>
          <View style={styles.contextCopy}>
            <Text style={[styles.ownerText, { color: theme.colors.textPrimary }]} numberOfLines={1}>
              {ownerLabel(moment)}
            </Text>
            <Text style={[styles.contextText, { color: muted }]} numberOfLines={2}>
              {momentKicker(moment)}
            </Text>
          </View>
          <View style={[styles.publicPill, { backgroundColor: isDark ? "rgba(6, 182, 212, 0.14)" : "rgba(6, 182, 212, 0.1)" }]}>
            <Globe size={14} color={theme.colors.cyan[500]} />
            <Text style={[styles.publicPillText, { color: theme.colors.cyan[500] }]}>Public</Text>
          </View>
        </View>

        <View style={[styles.momentCard, { backgroundColor: cardBg, borderColor: border }]}>
          <Pressable
            style={[styles.mediaWrap, { height: hasImage ? imageHeight : 180, backgroundColor: mediaBg }]}
            onPress={() => (moment.memory_image_url ? setLightboxUri(moment.memory_image_url) : undefined)}
            disabled={!moment.memory_image_url}
            accessibilityRole={moment.memory_image_url ? "imagebutton" : undefined}
            accessibilityLabel={moment.memory_image_url ? "Open proof image" : undefined}
          >
            {hasImage ? (
              <Image
                source={{ uri: imageUri }}
                style={styles.media}
                resizeMode="cover"
                onError={() => setImageFailed(true)}
              />
            ) : (
              <View style={styles.textOnlyMedia}>
                <Camera size={42} color={theme.colors.textSecondary} />
                <Text style={[styles.textOnlyTitle, { color: theme.colors.textPrimary }]}>Text memory</Text>
              </View>
            )}

            <View style={[styles.dayPill, { backgroundColor: "rgba(8, 145, 178, 0.9)" }]}>
              <Text style={styles.dayText}>{dayLabel(moment)}</Text>
            </View>

            <View
              style={[
                styles.sourcePill,
                { backgroundColor: moment.live_squad_id ? "rgba(6, 182, 212, 0.88)" : "rgba(79, 70, 229, 0.9)" },
              ]}
            >
              {moment.live_squad_id ? <Radio size={13} color="#fff" /> : <Globe size={13} color="#fff" />}
              <Text style={styles.sourceText}>{sourceLabel(moment)}</Text>
            </View>

            <Pressable
              style={[
                styles.likePill,
                {
                  backgroundColor: moment.viewerHasCheered
                    ? "rgba(79, 70, 229, 0.9)"
                    : isDark
                      ? "rgba(15, 23, 42, 0.82)"
                      : "rgba(15, 23, 42, 0.72)",
                },
              ]}
              onPress={isOwnMoment ? (moment.cheerCount > 0 ? () => setCheerersOpen(true) : undefined) : handleToggleCheer}
              disabled={isOwnMoment ? moment.cheerCount <= 0 : cheerBusy}
              accessibilityRole="button"
              accessibilityLabel={isOwnMoment ? "View likes" : moment.viewerHasCheered ? "Unlike this moment" : "Like this moment"}
            >
              {cheerBusy && !isOwnMoment ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <ThumbsUp size={15} color="#fff" fill={moment.viewerHasCheered ? "#fff" : "transparent"} />
              )}
              <Text style={styles.likePillText}>{moment.cheerCount}</Text>
            </Pressable>
          </Pressable>

          <View style={styles.momentBody}>
            <View style={styles.titleRow}>
              <View style={styles.titleCopy}>
                <Text style={[styles.momentTitle, { color: theme.colors.textPrimary }]}>{moment.title}</Text>
                <View style={styles.timeRow}>
                  <Clock3 size={14} color={muted} />
                  <Text style={[styles.timeText, { color: muted }]}>
                    Posted {formatRelativeTime(moment.created_at)}
                  </Text>
                </View>
              </View>
            </View>
            <Text style={[styles.noteText, { color: theme.colors.textPrimary }]}>
              {note || "Visual proof saved for this moment."}
            </Text>
          </View>
        </View>

        <Pressable
          onPress={openJourney}
          accessibilityRole="button"
        >
          <LinearGradient
            colors={isDark ? ["#4F46E5", "#0891B2", "#F59E0B"] : ["#4F46E5", "#06B6D4", "#F59E0B"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.journeyButton}
          >
            <View style={styles.journeyCopy}>
              <Text style={styles.journeyTitle}>{isOwnMoment ? "Open My Journey" : "Open player journey"}</Text>
              <Text style={styles.journeySubtitle}>See the full mission thread</Text>
            </View>
            <ChevronRight size={22} color="#fff" />
          </LinearGradient>
        </Pressable>
      </ScrollView>

      <CommunityWinImageLightbox
        visible={Boolean(lightboxUri)}
        imageUri={lightboxUri}
        onClose={() => setLightboxUri(null)}
      />
      <CommunityWinCheerersModal
        visible={cheerersOpen}
        winId={moment.id}
        totalLikes={moment.cheerCount}
        onClose={() => setCheerersOpen(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    minHeight: 58,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  iconButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "800",
  },
  headerSpacer: {
    width: 46,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 36,
    gap: 14,
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  stateText: {
    fontSize: 15,
    fontWeight: "700",
  },
  errorCard: {
    margin: 16,
    borderWidth: 1,
    borderRadius: 24,
    padding: 24,
    alignItems: "center",
    gap: 12,
  },
  errorTitle: {
    fontSize: 22,
    fontWeight: "900",
  },
  errorText: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    fontWeight: "700",
  },
  retryButton: {
    height: 46,
    paddingHorizontal: 18,
    borderRadius: 23,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  retryText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "900",
  },
  contextCard: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  contextCopy: {
    flex: 1,
    minWidth: 0,
  },
  ownerText: {
    fontSize: 17,
    fontWeight: "900",
  },
  contextText: {
    marginTop: 2,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
  },
  publicPill: {
    minHeight: 32,
    paddingHorizontal: 10,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  publicPillText: {
    fontSize: 12,
    fontWeight: "900",
  },
  momentCard: {
    borderWidth: 1,
    borderRadius: 26,
    overflow: "hidden",
  },
  mediaWrap: {
    width: "100%",
    overflow: "hidden",
  },
  media: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
  },
  textOnlyMedia: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  textOnlyTitle: {
    fontSize: 20,
    fontWeight: "900",
  },
  dayPill: {
    position: "absolute",
    top: 12,
    left: 12,
    minHeight: 30,
    paddingHorizontal: 12,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  dayText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "900",
  },
  sourcePill: {
    position: "absolute",
    top: 12,
    right: 12,
    minHeight: 30,
    paddingHorizontal: 10,
    borderRadius: 15,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  sourceText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  likePill: {
    position: "absolute",
    right: 12,
    bottom: 12,
    minHeight: 32,
    minWidth: 54,
    paddingHorizontal: 12,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  likePillText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "900",
  },
  momentBody: {
    padding: 16,
    gap: 14,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  titleCopy: {
    flex: 1,
    minWidth: 0,
  },
  momentTitle: {
    fontSize: 21,
    lineHeight: 27,
    fontWeight: "900",
  },
  timeRow: {
    marginTop: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  timeText: {
    fontSize: 13,
    fontWeight: "800",
  },
  noteText: {
    fontSize: 17,
    lineHeight: 24,
    fontWeight: "800",
  },
  journeyButton: {
    borderRadius: 25,
    minHeight: 72,
    paddingHorizontal: 22,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  journeyCopy: {
    flex: 1,
  },
  journeyTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "900",
  },
  journeySubtitle: {
    marginTop: 2,
    color: "rgba(255, 255, 255, 0.82)",
    fontSize: 13,
    fontWeight: "700",
  },
});
