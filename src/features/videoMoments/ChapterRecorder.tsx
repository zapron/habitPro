import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, Animated, Easing, Linking, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions, type CameraType } from "expo-camera";
import { useVideoPlayer, VideoView } from "expo-video";
import * as VideoThumbnails from "expo-video-thumbnails";
import * as Haptics from "expo-haptics";
import Svg, { Circle } from "react-native-svg";
import { RefreshCcw, RotateCcw, X } from "lucide-react-native";
import { Text } from "../../components/AppText";
import { useTheme } from "../../context/ThemeContext";
import { VIDEO_MOMENT_MAX_MS } from "./credit";

export type PickedChapterClip = { uri: string; durationMs: number; posterUri: string };

/** Every Chapter is the full 7 s; a much shorter file means the camera cut out. */
const MIN_CLIP_MS = VIDEO_MOMENT_MAX_MS - 1000;
/** Backup stop in case the native maxDuration doesn't fire. */
const STOP_GRACE_MS = 250;
/** If the camera still hasn't handed back a file by now, give up and restart it. */
const STUCK_AFTER_MS = VIDEO_MOMENT_MAX_MS + 3000;

const RING_SIZE = 84;
const RING_STROKE = 5;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/**
 * The in-app Chapter camera: one tap records a silent clip of exactly 7
 * seconds (no stopping early), the same on iOS and Android (the system camera
 * ignores length limits on many Android phones). `record()` resolves with the clip once the person taps
 * "Use clip", or null if they close it.
 *
 * `recorder` must be rendered inside the screen or sheet that calls `record()`,
 * as the last child of its Modal: iOS won't show a second Modal over a sheet
 * that is already one. Hosts should route their back/close handling to
 * `close()` while `isOpen` is true.
 */
export function useChapterRecorder(): {
  record: () => Promise<PickedChapterClip | null>;
  recorder: ReactNode;
  isOpen: boolean;
  close: () => void;
} {
  const [isOpen, setIsOpen] = useState(false);
  const resolveRef = useRef<((clip: PickedChapterClip | null) => void) | null>(null);

  const finish = useCallback((clip: PickedChapterClip | null) => {
    resolveRef.current?.(clip);
    resolveRef.current = null;
    setIsOpen(false);
  }, []);

  const record = useCallback(() => {
    resolveRef.current?.(null);
    return new Promise<PickedChapterClip | null>((resolve) => {
      resolveRef.current = resolve;
      setIsOpen(true);
    });
  }, []);

  const close = useCallback(() => finish(null), [finish]);

  useEffect(() => () => resolveRef.current?.(null), []);

  return {
    record,
    recorder: isOpen ? <ChapterRecorder onUse={finish} onClose={close} /> : null,
    isOpen,
    close,
  };
}

type Phase =
  | { kind: "camera" }
  | { kind: "recording" }
  | { kind: "processing" }
  | { kind: "review"; clip: PickedChapterClip }
  | { kind: "error"; message: string };

function ChapterRecorder({
  onUse,
  onClose,
}: {
  onUse: (clip: PickedChapterClip) => void;
  onClose: () => void;
}) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [facing, setFacing] = useState<CameraType>("back");
  const [ready, setReady] = useState(false);
  const [cameraKey, setCameraKey] = useState(0);
  const recordingIdRef = useRef(0);
  const [phase, setPhase] = useState<Phase>({ kind: "camera" });
  const [secondsLeft, setSecondsLeft] = useState(VIDEO_MOMENT_MAX_MS / 1000);
  const progress = useRef(new Animated.Value(0)).current;
  const startedAtRef = useRef(0);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const mountedRef = useRef(true);
  const accent = theme.colors.amber[500];

  // Ask once on open; after a "Don't allow" the button below asks again, so the prompt can't loop.
  const askedRef = useRef(false);
  useEffect(() => {
    if (!permission || permission.granted || !permission.canAskAgain || askedRef.current) return;
    askedRef.current = true;
    void requestPermission();
  }, [permission, requestPermission]);

  const clearTimers = () => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  };

  useEffect(
    () => () => {
      mountedRef.current = false;
      clearTimers();
      cameraRef.current?.stopRecording();
    },
    [],
  );

  const startRecording = async () => {
    const camera = cameraRef.current;
    if (!camera || !ready || phase.kind !== "camera") return;
    const recordingId = ++recordingIdRef.current;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setPhase({ kind: "recording" });
    setSecondsLeft(VIDEO_MOMENT_MAX_MS / 1000);
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: VIDEO_MOMENT_MAX_MS,
      easing: Easing.linear,
      useNativeDriver: false,
    }).start();
    startedAtRef.current = Date.now();
    for (let s = 1; s < VIDEO_MOMENT_MAX_MS / 1000; s++) {
      timersRef.current.push(setTimeout(() => setSecondsLeft(VIDEO_MOMENT_MAX_MS / 1000 - s), s * 1000));
    }
    timersRef.current.push(setTimeout(() => cameraRef.current?.stopRecording(), VIDEO_MOMENT_MAX_MS + STOP_GRACE_MS));
    timersRef.current.push(
      setTimeout(() => {
        if (recordingIdRef.current !== recordingId) return;
        recordingIdRef.current++;
        clearTimers();
        progress.stopAnimation();
        setReady(false);
        setCameraKey((k) => k + 1);
        setPhase({ kind: "error", message: "The camera got stuck. Try again." });
      }, STUCK_AFTER_MS),
    );

    let uri: string | undefined;
    try {
      uri = (await camera.recordAsync({ maxDuration: VIDEO_MOMENT_MAX_MS / 1000 }))?.uri;
    } catch {
      uri = undefined;
    }
    if (recordingIdRef.current !== recordingId) return;
    const elapsedMs = Date.now() - startedAtRef.current;
    clearTimers();
    progress.stopAnimation();
    if (!mountedRef.current) return;
    if (!uri) {
      setPhase({ kind: "error", message: "The camera couldn't save that clip. Try again." });
      return;
    }
    if (elapsedMs < MIN_CLIP_MS) {
      setPhase({ kind: "error", message: "The camera stopped early. Try again." });
      return;
    }
    setPhase({ kind: "processing" });
    try {
      const thumb = await VideoThumbnails.getThumbnailAsync(uri, { time: 0, quality: 0.7 });
      if (!mountedRef.current) return;
      setPhase({
        kind: "review",
        clip: { uri, posterUri: thumb.uri, durationMs: Math.min(elapsedMs, VIDEO_MOMENT_MAX_MS) },
      });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      if (mountedRef.current) setPhase({ kind: "error", message: "Couldn't read that clip. Try again." });
    }
  };

  const retake = () => {
    progress.setValue(0);
    // Review unmounts the camera; the new one reports ready again.
    if (phase.kind === "review") setReady(false);
    setPhase({ kind: "camera" });
  };

  const top = Math.max(insets.top, 16);
  const bottom = Math.max(insets.bottom, 20);
  const recording = phase.kind === "recording";

  let body: ReactNode;
  if (!permission) {
    body = <ActivityIndicator color="#f8fafc" style={styles.center} />;
  } else if (!permission.granted) {
    body = (
      <View style={styles.center}>
        <Text style={styles.title}>Camera access is off</Text>
        <Text style={styles.message}>Allow camera access to record your 7-second chapter.</Text>
        <Pressable
          style={[styles.pill, { backgroundColor: accent }]}
          onPress={() => (permission.canAskAgain ? void requestPermission() : void Linking.openSettings())}
          accessibilityRole="button"
        >
          <Text style={styles.pillTextDark}>{permission.canAskAgain ? "Allow camera" : "Open Settings"}</Text>
        </Pressable>
      </View>
    );
  } else if (phase.kind === "review") {
    body = (
      <ClipReview
        clip={phase.clip}
        bottom={bottom}
        accent={accent}
        onRetake={retake}
        onUse={(durationMs) => onUse({ ...phase.clip, durationMs })}
      />
    );
  } else {
    body = (
      <>
        <CameraView
          key={cameraKey}
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing={facing}
          mode="video"
          mute
          videoQuality="720p"
          onCameraReady={() => setReady(true)}
          onMountError={() => setPhase({ kind: "error", message: "The camera couldn't start. Close and try again." })}
        />
        <View style={[styles.hintWrap, { top: top + 56 }]} pointerEvents="none">
          <Text style={styles.hint}>
            {recording ? `${secondsLeft}s` : phase.kind === "processing" ? "Getting your clip ready…" : "Tap to record 7 seconds"}
          </Text>
        </View>
        {phase.kind === "error" ? (
          <View style={styles.errorWrap} pointerEvents="box-none">
            <View style={styles.errorCard}>
              <Text style={styles.message}>{phase.message}</Text>
              <Pressable style={[styles.pill, { backgroundColor: accent }]} onPress={retake} accessibilityRole="button">
                <Text style={styles.pillTextDark}>Try again</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
        <View style={[styles.controls, { paddingBottom: bottom + 8 }]}>
          <View style={styles.sideSlot} />
          <Pressable
            onPress={() => void startRecording()}
            disabled={!ready || phase.kind !== "camera"}
            accessibilityRole="button"
            accessibilityLabel={recording ? `Recording, ${secondsLeft} seconds left` : "Record 7-second chapter"}
            style={styles.shutter}
          >
            <Svg width={RING_SIZE} height={RING_SIZE} style={StyleSheet.absoluteFill}>
              <Circle
                cx={RING_SIZE / 2}
                cy={RING_SIZE / 2}
                r={RING_RADIUS}
                stroke="rgba(248,250,252,0.55)"
                strokeWidth={RING_STROKE}
                fill="none"
              />
              <AnimatedCircle
                cx={RING_SIZE / 2}
                cy={RING_SIZE / 2}
                r={RING_RADIUS}
                stroke={accent}
                strokeWidth={RING_STROKE}
                fill="none"
                strokeLinecap="round"
                strokeDasharray={`${RING_LENGTH} ${RING_LENGTH}`}
                strokeDashoffset={progress.interpolate({ inputRange: [0, 1], outputRange: [RING_LENGTH, 0] })}
                transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
              />
            </Svg>
            {phase.kind === "processing" || !ready ? (
              <ActivityIndicator color="#f8fafc" />
            ) : (
              <View style={[recording ? styles.recordingDot : styles.recordDot, { backgroundColor: theme.colors.red[500] }]} />
            )}
          </Pressable>
          <View style={styles.sideSlot}>
            {!recording && phase.kind !== "processing" ? (
              <Pressable
                style={styles.iconButton}
                onPress={() => setFacing((f) => (f === "back" ? "front" : "back"))}
                accessibilityRole="button"
                accessibilityLabel="Switch camera"
              >
                <RefreshCcw size={22} color="#f8fafc" />
              </Pressable>
            ) : null}
          </View>
        </View>
      </>
    );
  }

  return (
    <View style={styles.root}>
      {body}
      {phase.kind !== "processing" ? (
        <Pressable
          style={[styles.iconButton, styles.closeButton, { top }]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close camera"
        >
          <X size={22} color="#f8fafc" />
        </Pressable>
      ) : null}
    </View>
  );
}

function ClipReview({
  clip,
  bottom,
  accent,
  onRetake,
  onUse,
}: {
  clip: PickedChapterClip;
  bottom: number;
  accent: string;
  onRetake: () => void;
  onUse: (durationMs: number) => void;
}) {
  const player = useVideoPlayer(clip.uri, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });

  const use = () => {
    // The file's own length beats the stopwatch, which also counts the camera's start-up.
    const fileMs = Math.round((player.duration || 0) * 1000);
    const durationMs = fileMs > 0 ? Math.min(fileMs, VIDEO_MOMENT_MAX_MS) : clip.durationMs;
    onUse(durationMs);
  };

  return (
    <>
      <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />
      <View style={[styles.reviewBar, { paddingBottom: bottom + 8 }]}>
        <Pressable style={[styles.pill, styles.pillGhost]} onPress={onRetake} accessibilityRole="button">
          <RotateCcw size={18} color="#f8fafc" />
          <Text style={styles.pillTextLight}>Retake</Text>
        </Pressable>
        <Pressable style={[styles.pill, { backgroundColor: accent }]} onPress={use} accessibilityRole="button">
          <Text style={styles.pillTextDark}>Use clip</Text>
        </Pressable>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject, backgroundColor: "#000", zIndex: 1000, elevation: 1000 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32, gap: 12 },
  title: { color: "#f8fafc", fontSize: 18, fontWeight: "700", textAlign: "center" },
  message: { color: "#e2e8f0", fontSize: 15, lineHeight: 21, textAlign: "center" },
  hintWrap: { position: "absolute", left: 0, right: 0, alignItems: "center" },
  hint: {
    color: "#f8fafc",
    fontSize: 15,
    fontWeight: "700",
    backgroundColor: "rgba(0,0,0,0.45)",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    overflow: "hidden",
  },
  errorWrap: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 },
  errorCard: {
    backgroundColor: "rgba(15,23,42,0.88)",
    borderRadius: 16,
    padding: 20,
    gap: 14,
    alignItems: "center",
  },
  controls: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 32,
  },
  sideSlot: { width: 48, alignItems: "center" },
  shutter: { width: RING_SIZE, height: RING_SIZE, alignItems: "center", justifyContent: "center" },
  recordDot: { width: 60, height: 60, borderRadius: 30 },
  recordingDot: { width: 24, height: 24, borderRadius: 12 },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  closeButton: { position: "absolute", left: 16 },
  reviewBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    justifyContent: "center",
    gap: 16,
    paddingHorizontal: 24,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 999,
  },
  pillGhost: { backgroundColor: "rgba(0,0,0,0.5)", borderWidth: 1, borderColor: "rgba(248,250,252,0.5)" },
  pillTextDark: { color: "#0f172a", fontSize: 16, fontWeight: "700" },
  pillTextLight: { color: "#f8fafc", fontSize: 16, fontWeight: "700" },
});
