import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";
import { useIsFocused } from "@react-navigation/native";
import { Play } from "lucide-react-native";
import { Text } from "../../components/AppText";
import { cachedChapterVideoUri } from "./videoCache";

/**
 * A 7-second chapter clip, built to spend as little bandwidth as possible:
 * - shows only the poster frame until tapped (nothing downloads while scrolling);
 * - on tap, plays from the phone's cache, downloading once if it isn't there
 *   (videoCache.ts keeps it for later replays and clears it after a week);
 * - loops silently, boomerang-style, until tapped again or scrolled away.
 * Clips carry no sound at all (the audio track is stripped before upload).
 * Only one clip plays at a time: starting one stops whichever was playing.
 */

type ActiveChapter = { videoUrl: string; stop: () => void };
let activeChapter: ActiveChapter | null = null;

/** Stops the clip that's playing, unless its url is in `keepUrls` (e.g. still on screen). */
export function stopActiveChapter(keepUrls?: ReadonlySet<string>): void {
  const current = activeChapter;
  if (!current || keepUrls?.has(current.videoUrl)) return;
  activeChapter = null;
  current.stop();
}
type Props = {
  videoUrl: string;
  posterUrl: string;
  style?: StyleProp<ViewStyle>;
  /** "contain" for full-screen viewers, which show the whole clip uncropped. */
  fit?: "cover" | "contain";
  /** Where the "7s" chip sits; move it off whatever badges the host draws on top. */
  chipCorner?: "top-left" | "bottom-left";
};

export function VideoMomentPlayer({ videoUrl, posterUrl, style, fit = "cover", chipCorner = "top-left" }: Props) {
  const chipStyle = [styles.chip, chipCorner === "bottom-left" ? styles.chipBottom : null];
  const [state, setState] = useState<"poster" | "loading" | "failed">("poster");
  const [localUri, setLocalUri] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const selfRef = useRef<ActiveChapter | null>(null);

  const stop = () => {
    if (activeChapter === selfRef.current) activeChapter = null;
    selfRef.current = null;
    if (!mountedRef.current) return;
    setLocalUri(null);
    setState("poster");
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (activeChapter && activeChapter === selfRef.current) activeChapter = null;
    };
  }, []);

  // Leaving the screen (opening a profile, another tab) stops the clip.
  const isFocused = useIsFocused();
  useEffect(() => {
    if (!isFocused && selfRef.current) stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFocused]);

  const start = () => {
    if (state === "loading") return;
    stopActiveChapter();
    const self: ActiveChapter = { videoUrl, stop };
    selfRef.current = self;
    activeChapter = self;
    setState("loading");
    cachedChapterVideoUri(videoUrl)
      .then((uri) => {
        // Another clip was started (or this one was stopped) while downloading.
        if (!mountedRef.current || selfRef.current !== self) return;
        setLocalUri(uri);
      })
      .catch(() => {
        if (selfRef.current === self) stop();
        if (mountedRef.current) setState("failed");
      });
  };

  return (
    <View style={[styles.frame, style]}>
      {localUri ? (
        <LoopingPlayer uri={localUri} posterUrl={posterUrl} fit={fit} chipStyle={chipStyle} onStop={stop} />
      ) : (
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={start}
          accessibilityRole="button"
          accessibilityLabel="Play 7-second chapter"
        >
          <Image source={{ uri: posterUrl }} style={StyleSheet.absoluteFill} resizeMode={fit} />
          <View style={styles.center}>
            <View style={styles.playButton}>
              {state === "loading" ? (
                <ActivityIndicator color="#f8fafc" />
              ) : (
                <Play size={24} color="#f8fafc" fill="#f8fafc" />
              )}
            </View>
          </View>
          <View style={chipStyle}>
            <Text style={styles.chipText}>{state === "failed" ? "Tap to retry" : "7s"}</Text>
          </View>
        </Pressable>
      )}
    </View>
  );
}

function LoopingPlayer({
  uri,
  posterUrl,
  fit,
  chipStyle,
  onStop,
}: {
  uri: string;
  posterUrl: string;
  fit: "cover" | "contain";
  chipStyle: StyleProp<ViewStyle>;
  onStop: () => void;
}) {
  const player = useVideoPlayer({ uri }, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });

  // No pause on unmount: useVideoPlayer releases the player itself, and a
  // released player throws on Android if it's touched afterwards.

  // The tap target sits above the VideoView, not around it: on Android the
  // native video surface swallows touches, so a wrapping Pressable never fires.
  return (
    <View style={StyleSheet.absoluteFill}>
      <Image source={{ uri: posterUrl }} style={StyleSheet.absoluteFill} resizeMode={fit} />
      <VideoView player={player} style={StyleSheet.absoluteFill} contentFit={fit} nativeControls={false} />
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onStop}
        accessibilityRole="button"
        accessibilityLabel="Stop chapter"
      />
      <View style={chipStyle} pointerEvents="none">
        <Text style={styles.chipText}>7s</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { overflow: "hidden", backgroundColor: "#0b1120" },
  center: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  playButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 2,
    borderColor: "rgba(248,250,252,0.85)",
    backgroundColor: "rgba(3,5,10,0.55)",
    alignItems: "center",
    justifyContent: "center",
    paddingLeft: 3,
  },
  chip: {
    // Top-left: the feed puts its "Day N" badge in the bottom-right corner.
    position: "absolute",
    left: 10,
    top: 10,
    height: 24,
    paddingHorizontal: 9,
    borderRadius: 12,
    backgroundColor: "rgba(3,5,10,0.7)",
    justifyContent: "center",
  },
  chipBottom: { top: undefined, bottom: 10 },
  chipText: { color: "#f8fafc", fontSize: 12, fontWeight: "800" },
});
